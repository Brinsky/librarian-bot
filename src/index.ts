import {Client, GatewayIntentBits, Partials} from 'discord.js'
import {lex} from './lexer'
import {ClientError, logClientError, log} from './error'
import {CommandSpec, FlagSpec, parseCommand} from './command'
import {emojify, utf} from './emojifier'
import Sealer from './sealer'
import {picker} from './picker'
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
  ['emojify', new CommandSpec(emojify, [], 1)],
  ['utf', new CommandSpec(utf, [], 1)],
  ['seal', new CommandSpec(sealer.seal.bind(sealer), [], 2, 2)],
  ['unseal', new CommandSpec(sealer.unseal.bind(sealer), [], 1, 1)],
  ['vote', new CommandSpec(sealer.vote.bind(sealer), [], 1, -1)],
  ['picker', new CommandSpec(picker, [], 1, -1)],
  [
    'aggregate',
    new CommandSpec(
      aggregators.aggregate.bind(aggregators),
      [new FlagSpec('-c', true), new FlagSpec('-s', true), new FlagSpec('-e', true), new FlagSpec('-r', false)], 1, 1)
  ],
  [
    'vjoin',
    new CommandSpec(
      voiceManager.vjoin.bind(voiceManager), [new FlagSpec('-c', true)], 0, 0)
  ],
  [
    'vleave', 
    new CommandSpec(voiceManager.vleave.bind(voiceManager), [], 0, 0)
  ],
  ['vplay', new CommandSpec(voiceManager.vplay.bind(voiceManager), [], 1, 1)],
  ['board', new CommandSpec(voiceManager.board.bind(voiceManager), [], 0, 0)],
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

client.once('ready', () => {
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
