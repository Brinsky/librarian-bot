import Datastore from 'nedb-promises'
import {Client, Message, MessageReaction, User} from 'discord.js'
import {FlagsAndArgs} from './command'
import {indicateSuccess, logError, logClientError} from './error'
import {shuffle} from './util'

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
      logClientError(message, 'Title length exceeds 20 characters');
      return;
    }

    // Ensure the author doesn't already own an envelope with the same name
    try {
      const envelope = await this.getFirstMatch(message.author.id, title);
      if (envelope) {
        logClientError(
          message, `Envelope with title "${title}" already exists`);
        return;
      }
    } catch (err) {
      logClientError(message, 'Error while accessing database');
      logError(err);
      return;
    }

    try {
      await this.database.insert({
        author: message.author.id,
        title: title,
        content: content,
        time: new Date(),
      });
      indicateSuccess(message);
    } catch(err) {
      logClientError(message, 'Unable to write envelope to database');
      logError(err);
    }
  }

  public async unseal(
    flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
    const title = flagsAndArgs.args[0];

    let envelope: Envelope|null;
    try {
      envelope = await this.getFirstMatch(message.author.id, title);
    } catch (err) {
      logClientError(message, 'Error while accessing database');
      logError(err);
      return;
    }

    if (envelope) {
      message.channel.send(`Unsealing "${envelope.title}" from `
          + `${envelope.time}:\n${envelope.content}`);
    } else {
      logClientError(
        message, `No envelope found with title "${title}"`);
    }
  }

  public async vote(
    flagsAndArgs: FlagsAndArgs,
    message: Message,
    client: Client): Promise<void> {
    const users: User[] = [];
    const envelopes: Envelope[] = [];

    for(const tag of flagsAndArgs.args) {
      // Validate @ tag and extract user ID
      const match = tag.match(TAG_PATTERN);
      if (match === null || match.length !== 2) { 
        logClientError(
          message, `Unrecognized argument ${tag}. Expect an @ tag`);
        return;
      }
      const id = match[1];

      // Ensure each ID corresponds to a real user
      try {
        users.push(await client.fetchUser(id));
      } catch(err) {
        logClientError(message, `Failed to find user with ID ${id}`);
        logError(err);
        return;
      }
      
      // Gather the latest envelope from each specified user
      try {
        const userEnvelopes = await this.database
          .find<Envelope>({ author: id }).sort({ time: -1 }).limit(1);
        if (userEnvelopes.length === 0) {
          logClientError(message, `User with ID ${id} has no envelopes`);
          return;
        }
        envelopes.push(userEnvelopes[0]);
      } catch (err) {
        logClientError(message, 'Error while accessing database');
        logError(err);
        return;
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
    const userIdSet = new Set(flagsAndArgs.args);
    const filter = (reaction: MessageReaction, user: User): boolean => {
      return reaction.emoji.name === APPROVE_REACT && userIdSet.has(user.id);
    };

    voteMessage.awaitReactions(filter, { max: users.length, time: HOUR_MS })
      .then((collected): void => {
        if (collected.size === 0 || collected.first().count < users.length) {
          throw collected;
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
      })
      .catch((collected): void => {
        const count = collected.size > 0 ? collected.first().count : 0;
        logClientError(
          message, 
          `Only received ${count} out of ${users.length} responses after `
          + `one hour`);
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
