import {Client} from 'discord.js'
import config from './config.json'
import {lex} from './lexer'
import {ClientError, logClientError, logError} from './error'
import {CommandSpec, parseCommand} from './command'
import {emojify} from './emojifier'
import Sealer from './sealer'
import {picker} from './picker'

const client = new Client();
const sealer = new Sealer();

const COMMANDS: ReadonlyMap<string, CommandSpec> = new Map([
  ['emojify', new CommandSpec(emojify, [], 1)],
  ['seal', new CommandSpec(sealer.seal.bind(sealer), [], 2, 2)],
  ['unseal', new CommandSpec(sealer.unseal.bind(sealer), [], 1, 1)],
  ['vote', new CommandSpec(sealer.vote.bind(sealer), [], 1, -1)],
  ['picker', new CommandSpec(picker, [], 1, -1)],
]);

/////////// Event-handling code ///////////

client.on('ready', (): void => {
  console.log('I am ready!');
});

client.on('message', async (message): Promise<void> => {
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

// Print error events to stderr
client.on('error', console.error);
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

/////////// Startup code ///////////

client.login(config.token);
