import Datastore from 'nedb-promises'
import {Client, Collector, Message, MessageReaction, User} from 'discord.js'
import {FlagsAndArgs} from './command'
import {ClientError, indicateSuccess} from './error'
import {assertNonNull, fetchUsers, mentionToId, shuffle} from './util'

interface Envelope {
  readonly author: string;
  readonly title: string;
  readonly content: string;
  readonly time: Date;
}

const HOUR_MS = 60 * 60 * 1000;
const THIRTY_SEC_MS = 30 * 1000;
const APPROVE_REACT = '\u2611'; // "Ballot box with check emoji"
const CANCEL_REACT = '\uD83D\uDEAB'; // "No entry sign emoji"

function awaitCollectorEnd<K, V>(collector: Collector<K, V>): Promise<void> {
  return new Promise((resolve): void => {
    collector.on('end', (): void => {
      resolve();
    });
  });
}

function createFilter(
  emojiName: string, 
  userIds: Set<string>): (r: MessageReaction, u: User) => boolean {
  return (reaction: MessageReaction, user: User): boolean => {
    return reaction.emoji.name === emojiName && userIds.has(user.id);
  };
}

function buildVoteMessage(
  users: User[], envelopes: Map<string, Envelope>): string {
  const voteText = ['**A vote has started involving the following users:**'];
  voteText.push('');
  for (const user of users) {
    const envelope = envelopes.get(user.id);
    const perUserText = ` - ${user} ` +
      (envelope == null ?
        '*hasn\'t approved yet*' :
        `has approved unsealing "${envelope.title}"`);
    voteText.push(perUserText);
  }
  voteText.push('');
  voteText.push(`React with ${APPROVE_REACT} to approve the unsealing `
    + 'of your most recent envelope. Unsealing will occur only if all users '
    + 'approve within the next hour.');
  voteText.push('');
  voteText.push(
    '**I will edit this message with envelope names as users react.** '
    + 'You can remove your react to undo approval - the last user to approve '
    + 'will have 10 seconds to do so.');
  voteText.push('');
  voteText.push(`I will also react with ${APPROVE_REACT} for convenience.`);

  return voteText.join('\n');
}

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
    const users = await fetchUsers(flagsAndArgs.args.map(mentionToId), client);
    const userIdSet = new Set(users.map((user): string => user.id));
    const envelopes: Map<string, Envelope> = new Map();

    const voteMessage = 
      await message.channel.send(buildVoteMessage(users, envelopes));
    await voteMessage.react(APPROVE_REACT);

    const voteCollector = voteMessage.createReactionCollector(
      createFilter(APPROVE_REACT, userIdSet),
      { max: users.length, time: HOUR_MS, dispose: true });

    let pendingEditsPromise: Promise<void> = Promise.resolve();

    voteCollector.on('collect', (reaction, user): void => {
      pendingEditsPromise = 
        pendingEditsPromise
          .then((): Promise<Envelope> => this.getLatestEnvelope(user.id))
          .then((envelope): Promise<Message> => {
            envelopes.set(user.id, envelope);
            return voteMessage.edit(buildVoteMessage(users, envelopes));
          })
          .then();
    });

    voteCollector.on('remove', (reaction, user): void => {
      pendingEditsPromise = 
        pendingEditsPromise
          .then((): Promise<Message> => {
            envelopes.delete(user.id);
            return voteMessage.edit(buildVoteMessage(users, envelopes));
          })
          .then();
    });

    await awaitCollectorEnd(voteCollector);
    await pendingEditsPromise;

    {
      const reaction = voteCollector.collected.first();
      const count = reaction != null ? reaction.count : 0;
      if (count < users.length) {
        throw new ClientError(
          `Only received ${count} out of ${users.length} responses after `
          + `one hour`);
      }
    }

    const countdownMessage = await message.channel.send(
      'All approvals received!\n'
      + '**Envelopes will be unsealed in 30 seconds '
      + `unless a user reacts to this message with ${CANCEL_REACT}.**\n`
      + `I will also react with ${CANCEL_REACT} for convenience.`);
    await countdownMessage.react(CANCEL_REACT);

    const countdownCollector =
      countdownMessage.createReactionCollector(
        createFilter(CANCEL_REACT, userIdSet),
        { max: 1, time: THIRTY_SEC_MS });

    let cancelledBy: User|null = null;
    countdownCollector.on('collect', (reaction, user): void => {
      cancelledBy = user;
    });

    await awaitCollectorEnd(countdownCollector);
    if (countdownCollector.collected.size > 0) {
      throw new ClientError(
        cancelledBy == null ?
          'Envelope unsealing cancelled' /* Shouldn't happen */: 
          `Envelope unsealing cancelled by ${cancelledBy}`);
    }

    shuffle(users);

    for (const user of users) {
      const envelope = envelopes.get(user.id);
      if (envelope == null) {
        throw new Error(
          `Expected all users to have an envelope, but ${user} did not`);
      }
      message.channel.send(`Unsealing "${envelope.title}" from `
          + `${user} on ${envelope.time}:`
          + `\n${envelope.content}`);
    }
  }

  private async getLatestEnvelope(authorId: string): Promise<Envelope> {
    try {
      const envelopes = await this.database
        .find<Envelope>({ author: authorId }).sort({ time: -1 }).limit(1);
      if (envelopes.length === 0) {
        throw new ClientError(`User with ID ${authorId} has no envelopes`);
      }
      return envelopes[0];
    } catch (err) {
      throw new ClientError('Error while accessing database', err);
    }
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
