import {
  Client,
  Collection,
  DMChannel,
  FetchMessagesOptions,
  GuildMember,
  Message,
  PermissionFlagsBits,
  Snowflake,
  TextChannel,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js'
import BidiMultiMap from './bidimultimap'
import * as chrono from 'chrono-node';
import { SlashCommand } from './command'
import { log, ClientError } from './error'
import { escapeMarkdownChars, formatDate, pluralize } from './util'

type SupportedChannel = TextChannel | DMChannel;

export enum EventType {
  ADD_EMOJI,
  REMOVE_EMOJI,
  DELETE_MSG,
}

interface Event {
  msgId: Snowflake,
  eventType: EventType,
  emoji: string,
}

const CUSTOM_EMOJI_PATTERN = /<:\w+:(\d+)>/;

function parseDate(s: string | null | undefined): Date | null {
  if (s == null) {
    return null;
  }

  const date = chrono.parseDate(s);
  if (date === null) {
    throw new ClientError(`Could note parse date: ${s}`);
  }
  return date;
}

export class Aggregators {
  // Channel ID -> Aggregator
  readonly aggregators = new Map<Snowflake, Aggregator>();

  public readonly aggregateCommand: SlashCommand = {
    data: new SlashCommandBuilder()
      .setName('aggregate')
      .setDescription('Search for all messages with a given react')
      .addStringOption(option => option.setName('emoji')
        .setDescription('Emoji to search for').setRequired(true))
      .addStringOption(option => option.setName('channel_id')
        .setDescription(
          'ID of a channel (in any server the bot is in) to use ' +
          'instead of the current one')
        .setRequired(false))
      .addStringOption(option => option.setName('start_date')
        .setDescription('Start date to bound the aggregation')
        .setRequired(false))
      .addStringOption(option => option.setName('end_date')
        .setDescription('End date to bound the aggregation')
        .setRequired(false))
      .addBooleanOption(option => option.setName('force_rebuild')
        .setDescription('Force rebuilding of the cache for the channel')
        .setRequired(false)),
    execute: async (
      interaction: ChatInputCommandInteraction, client: Client) => {
      // Results are posted directly to the channel the command was invoked
      // from, rather than via the interaction's reply, since aggregation
      // (especially a cache rebuild) can take longer than the 15 minute
      // window Discord allows for responding to an interaction.
      if (!(interaction.channel instanceof TextChannel ||
        interaction.channel instanceof DMChannel)) {
        throw new ClientError('Unsupported channel type');
      }
      const replyChannel: SupportedChannel = interaction.channel;

      let channel: SupportedChannel;
      const channelId = interaction.options.getString('channel_id');
      // TODO: Move cross-channel permission checks into a central helper
      if (channelId) {
        let fetchedChannel;
        try {
          fetchedChannel = await client.channels.fetch(channelId);
        } catch {
          throw new ClientError(`Bot is not in a channel with ID ${channelId}`);
        }
        if (!(fetchedChannel instanceof TextChannel ||
          fetchedChannel instanceof DMChannel)) {
          throw new ClientError(`Unsupported channel type`);
        }
        const noAccess = new ClientError(
          `You don't have access to channel ID ${channelId}`);
        if (fetchedChannel instanceof TextChannel) {
          // Fetch guild membership for channel since it may not be cached
          let member: GuildMember;
          try {
            member = await fetchedChannel.guild.members.fetch(
              interaction.user.id);
          } catch (err: unknown) {
            // Most likely 'Unknown Member' - i.e. the user isn't in the guild
            // at all, which is a legitimate denial.
            const errMessage = err instanceof Error ? err.message : String(err);
            throw new ClientError(noAccess.message,
              `Failed to fetch member ${interaction.user.id} in guild ` +
              `${fetchedChannel.guild.id}: ${errMessage}`);
          }
          if (!fetchedChannel.permissionsFor(member)
              ?.has(PermissionFlagsBits.ViewChannel)) {
            throw noAccess;
          }
        // DM channels have no permission overwrites to consult; the only user
        // entitled to one is the recipient on the other end of it
        } else if (fetchedChannel.recipientId !== interaction.user.id) {
          throw noAccess;
        }
        channel = fetchedChannel;
      } else {
        channel = replyChannel;
      }

      // Check if cache rebuild is requested
      const start = parseDate(interaction.options.getString('start_date'));
      const end = parseDate(interaction.options.getString('end_date'));
      let buildCache = interaction.options.getBoolean('force_rebuild') ?? false;

      // Parse emoji
      const rawEmoji = interaction.options.getString('emoji', true);
      let emoji: string;
      const matches = rawEmoji.match(CUSTOM_EMOJI_PATTERN);
      if (matches) { // Custom emoji
        emoji = matches[0];
      } else { // Unicode emoji (or invalid)
        emoji = rawEmoji;
      }

      // Get or create the aggregator for the channel
      let aggregator = this.aggregators.get(channel.id);
      if (aggregator === undefined) {
        aggregator = new Aggregator(channel);
        this.aggregators.set(channel.id, aggregator);
        buildCache = true;
      }

      // Resolve the interaction immediately so its token doesn't expire
      // while the (potentially long-running) aggregation is in progress.
      await interaction.reply(
        `Aggregating ${rawEmoji} reactions` +
        (buildCache ?
          ' and rebuilding the cache - this may take a while' : '') +
        `. Results will be posted below when ready.`
      );

      try {
        // (Re)build the cache if necessary
        if (buildCache) {
          await aggregator.buildCache();
        }

        await this.sendResults(
          replyChannel, rawEmoji,
          await aggregator.getMessages(emoji, start, end));
      } catch (err: unknown) {
        if (err instanceof ClientError) {
          await replyChannel.send(`${rawEmoji}: ${err.message}`).catch(log);
          if (err.internalMessage != null) {
            log(err.internalMessage);
          }
        } else {
          await replyChannel.send(
            `${rawEmoji}: Failed to complete aggregation due to an ` +
            'internal error'
          ).catch(log);
          log(err as string);
        }
      }
    }
  };

  private async sendResults(
    channel: SupportedChannel,
    rawEmoji: string,
    messages: Message[]): Promise<void> {
    await channel.send(
      `Found ${messages.length} ${rawEmoji} ` +
      `${pluralize(messages.length, 'reaction')}: `
    );

    for (let i = 0; i < messages.length; i += 5) {
      await channel.send(
        this.messagesToString(messages.slice(i, i + 5)));
    }
  }

  private messagesToString(messages: Message[]): string {
    const text: string[] = [];
    for (const msg of messages) {
      text.push(escapeMarkdownChars(msg.author.username));
      text.push(' on ' + formatDate(msg.createdAt));

      if (msg.attachments.size > 0) {
        text.push(` (${msg.attachments.size} attachments omitted)`);
      }

      // Trailing space is necessary for code blocks to group properly
      // if message content is empty
      text.push(':\n```\n');
      text.push(escapeMarkdownChars(msg.content) + ' \n');
      text.push('```\n');
    }
    return text.join('');
  }

  public hasAggregator(channelId: Snowflake): boolean {
    return this.aggregators.has(channelId);
  }

  public handleEvent(channelId: Snowflake, event: Event): void {
    const aggregator = this.aggregators.get(channelId);
    if (aggregator === undefined) {
      return;
    }
    aggregator.handleEvent(event);
  }
}

const CACHE_REBUILD_MESSAGE =
  'A cache rebuild is already underway for this channel. ' +
  'Please wait for it to finish.';

class Aggregator {
  private readonly messageIdsToEmojis =
    new BidiMultiMap<Snowflake, string>();
  private readonly eventQueue: Event[] = [];
  private buildingCache = false;

  constructor(private readonly channel: SupportedChannel) { }

  public async getMessages(
    emoji: string, start: Date | null, end: Date | null,
  ): Promise<Message[]> {
    if (this.buildingCache) {
      throw new ClientError(CACHE_REBUILD_MESSAGE);
    }

    if (!this.messageIdsToEmojis.containsB(emoji)) {
      return []
    }

    const messages: Message[] = [];
    for (const msgId of this.messageIdsToEmojis.getB(emoji)) {
      const message = await this.channel.messages.fetch(msgId);
      if ((start === null || message.createdAt > start)
          && (end === null || message.createdAt < end)) {
        messages.push(message);
      }
    }
    // Sort by ascending creation date
    return messages.sort((msgA, msgB) => {
      if (msgA.createdAt === msgB.createdAt) {
        return 0;
      } else if (msgA.createdAt < msgB.createdAt) {
        return -1;
      } else { // if (msgA.createdAt > msgB.createdAt)
        return 1;
      }
    });
  }

  public async buildCache(): Promise<void> {
    try {
      await this.buildCacheInternal();
    } catch (err: unknown) {
      // Don't leave this aggregator in a broken state
      this.messageIdsToEmojis.clear();
      this.eventQueue.length = 0; // Clears the array
      this.buildingCache = false;

      throw err;
    }
  }

  public async buildCacheInternal(): Promise<void> {
    // Only one instance of this method should be running at a time
    if (this.buildingCache) {
      throw new ClientError(CACHE_REBUILD_MESSAGE);
    }
    this.buildingCache = true;

    this.messageIdsToEmojis.clear();
    this.eventQueue.length = 0; // Clears the array

    // Fetch and process all messages
    let messages: Collection<Snowflake, Message>;
    const options: FetchMessagesOptions = { limit: 100 };
    do {
      try {
        messages = await this.channel.messages.fetch(options);
      } catch (err: unknown) {
        // log error, clear cache, etc.
        this.buildingCache = false;
        return;
      }
      for (const msg of messages.values()) {
        for (const react of msg.reactions.cache.values()) {
          this.messageIdsToEmojis.link(msg.id, react.emoji.toString());
        }
      }

      // Next iteration, only fetch messages that came before previously
      // fetched messages
      if (messages.size > 0) {
        options.before = Array.from(messages.keys())[messages.size - 1];
      }
    } while (messages.size > 0);

    // Must do this all at once without releasing the thread, or
    // real "queue" data structure will be needed
    for (const event of this.eventQueue) {
      this.processEvent(event);
    }
    // Clear the queue
    this.eventQueue.length = 0;

    this.buildingCache = false;
  }

  public handleEvent(event: Event): void {
    if (this.buildingCache) {
      this.eventQueue.push(event);
    } else {
      this.processEvent(event);
    }
  }

  private processEvent(event: Event): void {
    switch (event.eventType) {
      case EventType.ADD_EMOJI:
        this.messageIdsToEmojis.link(event.msgId, event.emoji);
        break;
      case EventType.REMOVE_EMOJI:
        this.messageIdsToEmojis.unlink(event.msgId, event.emoji);
        break;
      case EventType.DELETE_MSG:
        try {
          this.messageIdsToEmojis.deleteA(event.msgId);
        } catch (err: unknown) {
          // Under the current implementation, messages with no reactions
          // won't be in the map.
          //
          // It's possible the message was deleted before buildCache
          // fetched it - in that case it also won't be in the map.
          log('(Probably safe to ignore)' + (err as string));
        }
        break;
    }
  }
}
