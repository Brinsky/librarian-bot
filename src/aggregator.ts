import {
  ChannelLogsQueryOptions,
  Client,
  Collection,
  DMChannel,
  Emoji,
  Message,
  Snowflake,
  TextChannel,
} from 'discord.js'
import BidiMultiMap from './bidimultimap'
import * as chrono from 'chrono-node';
import {FlagsAndArgs} from './command'
import {log, ClientError} from './error'
import {
  escapeMarkdownChars,
  formatDate,
  pluralize,
  markPending,
  markComplete,
} from './util'

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

function parseDate(s: string|null|undefined): Date|null {
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

  public async aggregate(
    flagsAndArgs: FlagsAndArgs,
    message: Message,
    client: Client): Promise<void> {
    // Get the channel
    let channel;
    if (flagsAndArgs.flags.has('-c')) {
      const channelId = flagsAndArgs.flags.get('-c')!;
      try {
        channel = await client.channels.fetch(channelId);
      } catch (err) {
        throw new ClientError(`Unknown channel ${channelId}`, err);
      }
    } else {
      channel = message.channel;
    }
    if (!(channel instanceof TextChannel || channel instanceof DMChannel)) {
      throw new ClientError(`Unsupported channel type ${typeof channel}`);
    }

    const start = parseDate(flagsAndArgs.flags.get('-s'));
    const end = parseDate(flagsAndArgs.flags.get('-e'));

    // Check if cache rebuild is requested
    let buildCache = flagsAndArgs.flags.has('-r');

    // Parse the emoji
    const rawEmoji = flagsAndArgs.args[0];
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

    // (Re)build the cache if necessary
    if (buildCache) {
      // Ensure caching has been marked as started before yielding the thread,
      // otherwise events might slip in
      const cachePromise = aggregator.buildCache()
      await markPending(message);
      await cachePromise;
    }

    await this.sendResults(
      message, rawEmoji, await aggregator.getMessages(emoji, start, end));
    await markComplete(message, client);
  }

  private async sendResults(
    originalMsg: Message,
    rawEmoji: string,
    messages: Message[]): Promise<void> {
    originalMsg.channel.send(
      `Found ${messages.length} ${rawEmoji} ` +
        `${pluralize(messages.length, 'reaction')}: `
    );

    for (let i = 0; i < messages.length; i += 5) {
      await originalMsg.channel.send(
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
  };

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

  constructor(private readonly channel: SupportedChannel) {}

  public async getMessages(emoji: string, start: Date|null, end: Date|null): Promise<Message[]> {
    if (this.buildingCache) {
      throw new ClientError(CACHE_REBUILD_MESSAGE);
    }

    if (!this.messageIdsToEmojis.containsB(emoji)) {
      return []
    };

    const messages: Message[] = [];
    for (const msgId of this.messageIdsToEmojis.getB(emoji)) {
      const message = await this.channel.messages.fetch(msgId);
      if ((start === null || message.createdAt > start) && (end === null || message.createdAt < end)) {
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
    } catch (err) {
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
    let totalMessages = 0;
    const options: ChannelLogsQueryOptions = {limit: 100};
    do {
      try {
        messages = await this.channel.messages.fetch(options);
      } catch (err) {
        // log error, clear cache, etc.
        this.buildingCache = false;
        return;
      }
      totalMessages += messages.size;

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
        } catch (err) {
          // Under the current implementation, messages with no reactions
          // won't be in the map.
          //
          // It's possible the message was deleted before buildCache
          // fetched it - in that case it also won't be in the map.
          log('(Probably safe to ignore)' + err);
        }
        break;
    }
  }
}
