import {Client} from 'discord.js'
import config from './config.json'
import {lex} from './lexer'
import {logClientError} from './error'
import {Command, CommandSpec, parseCommand} from './command'
import {emojify} from './emojifier'
import Sealer from './sealer'

const client = new Client();
const sealer = new Sealer();

// Hijinks needed to preserve correct 'this'
const seal: Command = (f, m): Promise<void> => sealer.seal(f, m);
const unseal: Command = (f, m): Promise<void> => sealer.unseal(f, m);
const vote: Command = (f, m, c): Promise<void> => sealer.vote(f, m, c);

const COMMANDS: ReadonlyMap<string, CommandSpec> = new Map([
  ['emojify', new CommandSpec(emojify, [], 1)],
  ['seal', new CommandSpec(seal, [], 2, 2)],
  ['unseal', new CommandSpec(unseal, [], 1, 1)],
  ['vote', new CommandSpec(vote, [], 1, -1)],
]);

/////////// Event-handling code ///////////

client.on('ready', (): void => {
  console.log('I am ready!');
});

client.on('message', (message): void => {
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
    commandSpec.command(parseCommand(commandSpec, tokens), message, client);
  } catch (err) {
    logClientError(message, err.message);
  }
});

// Print error events to stderr
client.on('error', console.error);
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

/////////// Startup code ///////////

client.login(config.token);
