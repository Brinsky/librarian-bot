import Datastore from 'nedb-promises'
import {Client, Message, MessageReaction, User} from 'discord.js'
import {FlagsAndArgs} from './command'
import {ClientError, indicateSuccess} from './error'
import {assertNonNull, shuffle} from './util'

interface Envelope {
  readonly author: string;
  readonly title: string;
  readonly content: string;
  readonly time: Date;
}

const HOUR_MS = 60 * 60 * 1000;
const APPROVE_REACT = '\u2611'; // "Ballot box with check emoji"
const TAG_PATTERN = /<@(\d+)>/;

/** Performs creation and management of sealed envelopes. */
export default class Sealer {
  private database: Datastore;

  public constructor() {
    this.database = Datastore.create({
      filename: 'data/sealedenvelopes',
      autoload: true,
    });

    this.database.insert
  }

  public async seal(
    flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
    const [title, content] = flagsAndArgs.args;

    if (title.length > 20) {
      throw new ClientError('Title length exceeds 20 characters');
    }

    // Ensure the author doesn't already own an envelope with the same name
    let envelope: Envelope|null;
    try {
      envelope =
          await this.getFirstMatch(assertNonNull(message.author).id, title);
    } catch (err) {
      throw new ClientError('Error while accessing database', err);
    }
    if (envelope) {
      throw new ClientError(`Envelope with title "${title}" already exists`);
    }

    try {
      await this.database.insert({
        author: assertNonNull(message.author).id,
        title: title,
        content: content,
        time: new Date(),
      });
      indicateSuccess(message);
    } catch(err) {
      throw new ClientError('Unable to write envelope to database', err);
    }
  }

  public async unseal(
    flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
    const title = flagsAndArgs.args[0];

    let envelope: Envelope|null;
    try {
      envelope = 
          await this.getFirstMatch(assertNonNull(message.author).id, title);
    } catch (err) {
      throw new ClientError('Error while accessing database', err);
    }

    if (envelope) {
      message.channel.send(`Unsealing "${envelope.title}" from `
          + `${envelope.time}:\n${envelope.content}`);
    } else {
      throw new ClientError(`No envelope found with title "${title}"`);
    }
  }

  public async vote(
    flagsAndArgs: FlagsAndArgs,
    message: Message,
    client: Client): Promise<void> {
    const users: User[] = [];
    const userIdSet: Set<string> = new Set();
    const envelopes: Envelope[] = [];

    for(const tag of flagsAndArgs.args) {
      // Validate @ tag and extract user ID
      const match = tag.match(TAG_PATTERN);
      if (match === null || match.length !== 2) { 
        throw new ClientError(`Unrecognized argument ${tag}. Expect an @ tag`);
      }
      const id = match[1];

      // Ensure each ID corresponds to a real user
      try {
        users.push(await client.users.fetch(id));
      } catch(err) {
        throw new ClientError(`Failed to find user with ID ${id}`, err);
      }

      // Ensure each user is specified only once
      if (userIdSet.has(id)) {
        throw new ClientError(
          `User ${users[users.length - 1]} listed more than once`);
      } else {
        userIdSet.add(id);
      }
      
      // Gather the latest envelope from each specified user
      try {
        const userEnvelopes = await this.database
          .find<Envelope>({ author: id }).sort({ time: -1 }).limit(1);
        if (userEnvelopes.length === 0) {
          throw new ClientError(`User with ID ${id} has no envelopes`);
        }
        envelopes.push(userEnvelopes[0]);
      } catch (err) {
        throw new ClientError('Error while accessing database', err);
      }
    }

    // List the envelopes we found and ask for approval reacts
    const voteText = ['A vote has started involving the following envelopes:'];
    for (let i = 0; i < envelopes.length; i++) {
      voteText.push(` - "${envelopes[i].title}" from ${users[i]}`);
    }
    voteText.push('');
    voteText.push(`React with ${APPROVE_REACT} to approve the unsealing `
      + 'of your envelope. Unsealing will occur only if all users '
      + 'approve within the next hour.');
    voteText.push('');
    voteText.push(`I will also react with ${APPROVE_REACT} for convenience.`);
    const voteMessage =
      await message.channel.send(voteText.join('\n')) as Message;
    await voteMessage.react(APPROVE_REACT);

    // Wait for reacts and then process them
    const filter = (reaction: MessageReaction, user: User): boolean => {
      return reaction.emoji.name === APPROVE_REACT && userIdSet.has(user.id);
    };

    voteMessage.awaitReactions(filter, { max: users.length, time: HOUR_MS })
      .then((collected): void => {
        {
          const reaction = collected.first();
          const count = reaction != null ? reaction.count : 0;
          if (count < users.length) {
            throw new ClientError(
              `Only received ${count} out of ${users.length} responses after `
              + `one hour`);
          }
        }

        // Randomize the order of the indices we plan to access
        const indices = [...Array(users.length).keys()];
        shuffle(indices);

        for(let i = 0; i < users.length; i++) {
          const envelope = envelopes[indices[i]];
          message.channel.send(`Unsealing "${envelope.title}" from `
              + `${users[indices[i]]} on ${envelope.time}:`
              + `\n${envelope.content}`);
        }
      });
  }

  private async getFirstMatch(
    authorId: string, title: string): Promise<Envelope|null> {
    const envelopes: Envelope[] = await this.database.find({
      author: authorId,
      title: title,
    });

    return envelopes.length > 0 ? envelopes[0] : null;
  }
}
