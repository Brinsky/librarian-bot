import {Client} from 'discord.js'
import {lex} from './lexer'
import {ClientError, logClientError, logError} from './error'
import {CommandSpec, FlagSpec, parseCommand} from './command'
import {emojify} from './emojifier'
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

const client = new Client({ partials: ['CHANNEL', 'MESSAGE', 'REACTION'] });
const sealer = new Sealer();
const aggregators = new Aggregators();
const voiceManager = new VoiceManager();

const COMMANDS: ReadonlyMap<string, CommandSpec> = new Map([
  ['emojify', new CommandSpec(emojify, [], 1)],
  ['seal', new CommandSpec(sealer.seal.bind(sealer), [], 2, 2)],
  ['unseal', new CommandSpec(sealer.unseal.bind(sealer), [], 1, 1)],
  ['vote', new CommandSpec(sealer.vote.bind(sealer), [], 1, -1)],
  ['picker', new CommandSpec(picker, [], 1, -1)],
  [
    'aggregate',
    new CommandSpec(
      aggregators.aggregate.bind(aggregators),
      [new FlagSpec('-c', true), new FlagSpec('-r', false)], 1, 1)
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
  // Fetching the message here results in an 'unknown message' API error
  const channel = message.channel;
  if (channel != null) {
    aggregators.handleEvent(channel.id, {
      msgId: message.id,
      eventType: EventType.DELETE_MSG,
      emoji: '',
    });
  } else {
    logError('Warning - unknown channel for deleted message');
  }
});

client.on('ready', () => {
  console.log('I am ready!');
});

client.on('message', async (message) => {
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
  } catch (err) {
    if (err instanceof ClientError) {
      logClientError(message, err.message);
      if (err.internalMessage != null) {
        logError(err.internalMessage);
      }
    } else {
      logClientError(
        message, 'Failed to execute command due to an internal error');
      logError(err);
    }
  }
});

/////////// Startup code ///////////

const init = function(): void {
  try {
    config = 
      JSON.parse(fs.readFileSync('data/config.json').toString()) as Config
  } catch (err) {
    logError('Failed to read configuration file; shutting down');
    return;
  }

  // Print error events to stderr
  client.on('error', console.error);
  process.on('uncaughtException', console.error);
  process.on('unhandledRejection', console.error);

  client.login(config.token);
};

init();
