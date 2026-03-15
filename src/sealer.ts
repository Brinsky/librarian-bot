import Datastore from 'nedb-promises'
import { Client, Collector, Message, MessageReaction, User, SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js'
import { SlashCommand } from './command'
import { ClientError, indicateSuccess } from './error'
import { assertNonNull, awaitCollectorEnd, fetchUsers, mentionToId, shuffle, splitMessage } from './util'

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
  private database: Datastore<unknown>;

  public constructor() {
    this.database = Datastore.create({
      filename: 'data/sealedenvelopes',
      autoload: true,
    });

    this.database.insert
  }
  public readonly sealCommand: SlashCommand = {
    data: new SlashCommandBuilder()
      .setName('seal')
      .setDescription('Seal a secret envelope to be unsealed at a later time')
      .addStringOption(option => option.setName('title').setDescription('Title of the envelope').setRequired(true))
      .addStringOption(option => option.setName('content').setDescription('Content of the envelope').setRequired(true)),
    execute: async (interaction: ChatInputCommandInteraction) => {
      const title = interaction.options.getString('title', true);
      const content = interaction.options.getString('content', true);

      if (title.length > 20) {
        throw new ClientError('Title length exceeds 20 characters');
      }

      // Ensure the author doesn't already own an envelope with the same name
      let envelope: Envelope | null;
      try {
        envelope = await this.getFirstMatch(interaction.user.id, title);
      } catch (err: unknown) {
        throw new ClientError('Error while accessing database', err as string);
      }
      if (envelope) {
        throw new ClientError(`Envelope with title "${title}" already exists`);
      }

      try {
        await this.database.insert({
          author: interaction.user.id,
          title: title,
          content: content,
          time: new Date(),
        });
        await interaction.reply({ content: 'Envelope sealed!' });
      } catch (err) {
        throw new ClientError('Unable to write envelope to database', err as string);
      }
    }
  };

  public readonly unsealCommand: SlashCommand = {
    data: new SlashCommandBuilder()
      .setName('unseal')
      .setDescription('Unseal a previously sealed envelopes')
      .addStringOption(option => option.setName('title').setDescription('Title of the envelope').setRequired(true)),
    execute: async (interaction: ChatInputCommandInteraction) => {
      const title = interaction.options.getString('title', true);

      let envelope: Envelope | null;
      try {
        envelope = await this.getFirstMatch(interaction.user.id, title);
      } catch (err: unknown) {
        throw new ClientError('Error while accessing database', err as string);
      }

      if (envelope) {
        const chunks = splitMessage(`Unsealing "${envelope.title}" from ${envelope.time}:\n${envelope.content}`);
        await interaction.reply({ content: chunks[0] });
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp({ content: chunks[i] });
        }
      } else {
        throw new ClientError(`No envelope found with title "${title}"`);
      }
    }
  };

  public readonly listCommand: SlashCommand = {
    data: new SlashCommandBuilder()
      .setName('envelopes')
      .setDescription('List your previously sealed envelopes'),
    execute: async (interaction: ChatInputCommandInteraction) => {
      let envelopes: Envelope[];
      try {
        envelopes = await this.database
          .find<Envelope>({ author: interaction.user.id })
          .sort({ time: -1 });
      } catch (err: unknown) {
        throw new ClientError('Error while accessing database', err as string);
      }

      if (envelopes.length === 0) {
        await interaction.reply({ content: 'You haven\'t sealed any envelopes yet!' });
        return;
      }

      const listText = envelopes.map(e => `- **${e.title}** (sealed on ${e.time})`).join('\n');
      const chunks = splitMessage(`**Your Sealed Envelopes:**\n${listText}`);
      await interaction.reply({ content: chunks[0] });
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({ content: chunks[i] });
      }
    }
  };

  public readonly voteCommand: SlashCommand = {
    data: new SlashCommandBuilder()
      .setName('vote')
      .setDescription('Start a vote to unseal envelopes')
      .addStringOption(option =>
        option.setName('mentions')
          .setDescription('Mentions of users to include in the vote (space separated)')
          .setRequired(true)),
    execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
      const mentionsText = interaction.options.getString('mentions', true);
      const args = mentionsText.split(/\\s+/).filter(s => s.length > 0);
      const users = await fetchUsers(args.map(mentionToId), client);
      const userIdSet = new Set(users.map((user): string => user.id));
      const envelopes: Map<string, Envelope> = new Map();

      const channel = interaction.channel;
      if (!channel || !('send' in channel)) {
        throw new ClientError('Command must be used in a channel that supports sending messages');
      }

      const voteMessageText = buildVoteMessage(users, envelopes);
      const voteMessage = await interaction.reply({
        content: voteMessageText,
        fetchReply: true
      });
      await voteMessage.react(APPROVE_REACT);

      const voteCollector = voteMessage.createReactionCollector(
        { filter: createFilter(APPROVE_REACT, userIdSet), max: users.length, time: HOUR_MS, dispose: true });

      let pendingEditsPromise: Promise<void> = Promise.resolve();

      voteCollector.on('collect', (reaction: MessageReaction, user: User): void => {
        pendingEditsPromise =
          pendingEditsPromise
            .then((): Promise<Envelope> => this.getLatestEnvelope(user.id))
            .then((envelope): Promise<Message> => {
              envelopes.set(user.id, envelope);
              return voteMessage.edit(buildVoteMessage(users, envelopes));
            })
            .then();
      });

      voteCollector.on('remove', (reaction: MessageReaction, user: User): void => {
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

      // We use envelopes.size instead of examining voteCollector.collected
      // because the count for a given reaction includes reacts that didn't
      // pass the filter.
      if (envelopes.size < users.length) {
        throw new ClientError(
          `Only received ${envelopes.size} out of ${users.length} responses `
          + `after one hour`);
      }

      const countdownMessage = await channel.send(
        'All approvals received!\n'
        + '**Envelopes will be unsealed in 30 seconds '
        + `unless a user reacts to this message with ${CANCEL_REACT}.**\n`
        + `I will also react with ${CANCEL_REACT} for convenience.`);
      await countdownMessage.react(CANCEL_REACT);

      const countdownCollector =
        countdownMessage.createReactionCollector(
          { filter: createFilter(CANCEL_REACT, userIdSet), max: 1, time: THIRTY_SEC_MS });

      let cancelledBy: User | null = null;
      countdownCollector.on('collect', (reaction: MessageReaction, user: User): void => {
        cancelledBy = user;
      });

      await awaitCollectorEnd(countdownCollector);
      if (countdownCollector.collected.size > 0) {
        throw new ClientError(
          cancelledBy == null ?
            'Envelope unsealing cancelled' /* Shouldn't happen */ :
            `Envelope unsealing cancelled by ${cancelledBy}`);
      }

      shuffle(users);

      // Ensure all users have an envelope before unsealing any of them
      const unsealMessages: string[] = [];
      for (const user of users) {
        const envelope = envelopes.get(user.id);
        if (envelope == null) {
          throw new Error(
            `Expected all users to have an envelope, but ${user} did not`);
        }
        unsealMessages.push(`Unsealing "${envelope.title}" from `
          + `${user} on ${envelope.time}:`
          + `\n${envelope.content}`);
      }

      for (const unsealMessage of unsealMessages) {
        const chunks = splitMessage(unsealMessage);
        for (const chunk of chunks) {
          await channel.send({ content: chunk });
        }
      }
    }
  };

  private async getLatestEnvelope(authorId: string): Promise<Envelope> {
    try {
      const envelopes = await this.database
        .find<Envelope>({ author: authorId }).sort({ time: -1 }).limit(1);
      if (envelopes.length === 0) {
        throw new ClientError(`User with ID ${authorId} has no envelopes`);
      }
      return envelopes[0];
    } catch (err: unknown) {
      throw new ClientError('Error while accessing database', err as string);
    }
  }

  private async getFirstMatch(
    authorId: string, title: string): Promise<Envelope | null> {
    const envelopes: Envelope[] = await this.database.find({
      author: authorId,
      title: title,
    });

    return envelopes.length > 0 ? envelopes[0] : null;
  }
}
