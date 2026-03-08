import {Client, GatewayIntentBits, Partials} from 'discord.js'
import {lex} from './lexer'
import {ClientError, logClientError, log} from './error'
import {CommandSpec, FlagSpec, parseCommand} from './command'
import {emojify, utf} from './emojifier'
import Sealer from './sealer'
import {picker} from './picker'
import {help} from './help'
import {Aggregators, EventType} from './aggregator'
import VoiceManager from './voicemanager'
import * as fs from 'fs'

interface Config {
  token: string;
  prefix: string;
}

// Will be overwritten from file at init() time
let config: Config = {
  token: '',
  prefix: '',
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
  ],
});
const sealer = new Sealer();
const aggregators = new Aggregators();
const voiceManager = new VoiceManager();

const COMMANDS: ReadonlyMap<string, CommandSpec> = new Map([
  ['emojify', new CommandSpec(emojify, 'Replaces characters with emojis', [], 1, -1, '<text>')],
  ['utf', new CommandSpec(utf, 'Prints the UTF-16 hex encoding of a string', [], 1, -1, '<text>')],
  ['seal', new CommandSpec(sealer.seal.bind(sealer), 'Seal a secrete envelope to be unsealed at a later time', [], 2, 2, '<title> <content>')],
  ['unseal', new CommandSpec(sealer.unseal.bind(sealer), 'Unseal a previously sealed envelopes', [], 1, 1, '<title>')],
  ['vote', new CommandSpec(sealer.vote.bind(sealer), 'Start a vote to unseal envelopes', [], 1, -1, '<@users...>')],
  ['picker', new CommandSpec(picker, 'Randomly pick an option from a list', [new FlagSpec('-s', 'Shuffle and return all options completely', false)], 1, -1, '<options...>')],
  [
    'aggregate',
    new CommandSpec(
      aggregators.aggregate.bind(aggregators),
      'Search for all messages with a given react',
      [
        new FlagSpec('-c', 'Channel ID to use instead of the current one', true),
        new FlagSpec('-s', 'Start date to bound the aggregation. Attempts to parse "natural language" dates - see https://github.com/wanasit/chrono.', true),
        new FlagSpec('-e', 'End date to bound the aggregation', true),
        new FlagSpec('-r', 'Force rebuilding of the cache for the channel', false)
      ], 1, 1, '<emoji>')
  ],
  [
    'vjoin',
    new CommandSpec(
      voiceManager.vjoin.bind(voiceManager),
      'Have the bot join a voice channel',
      [new FlagSpec('-c', 'Voice channel ID to join', true)], 0, 0)
  ],
  [
    'vleave', 
    new CommandSpec(voiceManager.vleave.bind(voiceManager), 'Have the bot leave the current voice channel', [], 0, 0)
  ],
  ['vplay', new CommandSpec(voiceManager.vplay.bind(voiceManager), 'Have the bot play an audio file from the soundboard in its current voice channel', [], 1, 1, '<emoji>')],
  ['board', new CommandSpec(voiceManager.board.bind(voiceManager), 'Display the interactive soundboard', [], 0, 0)],
  ['help', new CommandSpec((f, m) => help(COMMANDS, f, m), 'List all available commands, their descriptions, and support flags', [], 0, 0)],
]);

/////////// Event-handling code ///////////

client.on('messageReactionAdd', async (reaction, user) => {
  aggregators.handleEvent(reaction.message.channel.id, {
    msgId: reaction.message.id,
    eventType: EventType.ADD_EMOJI,
    emoji: reaction.emoji.toString(),
  });
});

client.on('messageReactionRemove', async(reaction, user) => {
  // We re-fetch the message so that we have the latest set of reactions
  // (which excludes the one being removed here)
  const message = reaction.message.partial
    ? await reaction.message.fetch() : reaction.message;

  const matchingReaction = message.reactions.cache.find(
    (r) => r.emoji.toString() === reaction.emoji.toString());
  if (matchingReaction === undefined || matchingReaction.users.cache.size == 0) {
    aggregators.handleEvent(message.channel.id, {
      msgId: message.id,
      eventType: EventType.REMOVE_EMOJI,
      emoji: reaction.emoji.toString(),
    });
  }
});

client.on('messageDelete', async(message) => {
  // Fetching the message would result in an 'unknown message' API error

  const channel = message.channel;
  log(`messageDelete event: Message ID = ${message.id}, Channel ID = ${channel?.id}`);

  if (channel != null) {
    aggregators.handleEvent(channel.id, {
      msgId: message.id,
      eventType: EventType.DELETE_MSG,
      emoji: '',
    });
  }
});

client.once('clientReady', () => {
  log('I am ready!');
});

client.on('messageCreate', async (message) => {
  // We never expect new messages to be partial messages
  if (message.partial) {
    return;
  }

  let text = message.content;

  // Only process commands with the appropriate prefix
  if (!text.startsWith(config.prefix)) {
    return;
  }

  // Process the text using the lexer
  text = text.slice(config.prefix.length);
  let tokens = lex(text);
  if (tokens.length === 0) {
    logClientError(message, 'No command provided');
    return;
  }

  // Look up the requested command
  const commandText = tokens[0].text;
  tokens = tokens.slice(1); // Discard the command name token
  const commandSpec = COMMANDS.get(commandText);
  if (!commandSpec) {
    logClientError(message, 'Unrecognized command "' + commandText + '"');
    return;
  }

  try {
    await commandSpec.command(
      parseCommand(commandSpec, tokens), message, client);
  } catch (err: unknown) {
    if (err instanceof ClientError) {
      logClientError(message, err.message);
      if (err.internalMessage != null) {
        log(err.internalMessage);
      }
    } else {
      logClientError(
        message, 'Failed to execute command due to an internal error');
      log(err as string);
    }
  }
});

/////////// Startup code ///////////

function init(): void {
  try {
    config = 
      JSON.parse(fs.readFileSync('data/config.json').toString()) as Config
  } catch (err: unknown) {
    log('Failed to read configuration file; shutting down');
    return;
  }

  // Print error events to stderr
  client.on('error', console.error);
  process.on('uncaughtException', console.error);
  process.on('unhandledRejection', console.error);

  client.login(config.token);
};

init();
