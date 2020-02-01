import {Token} from './lexer'
import {Message, Client} from 'discord.js'
import {pluralize} from './util'
import {ClientError} from './error'

export class FlagSpec {
  public constructor(readonly name: string, readonly hasArg: boolean) {}
}

export class FlagsAndArgs {
  public constructor(
    readonly flags: Map<string, string|null>,
    readonly args: string[]) {}
}

export interface Command {
  (flagsAndArgs: FlagsAndArgs, message: Message, client: Client): Promise<void>;
}

export class CommandSpec {
  public readonly flagSpecMap: Map<string, FlagSpec>;

  public constructor(
    readonly command: Command, flagSpecs: FlagSpec[] = [],
    readonly minArgs: number = 0, readonly maxArgs: number = -1) {
    if (!Number.isInteger(this.minArgs) || this.minArgs < 0) {
      throw new Error('minArgs must be an integer >= 0');
    }
    if (!Number.isInteger(this.maxArgs) || this.maxArgs < -1) {
      throw new Error('max must be an integer >= -1');
    }

    this.flagSpecMap = new Map();
    for (const flagSpec of flagSpecs) {
      this.flagSpecMap.set(flagSpec.name, flagSpec);
    }
  }
}

export function parseCommand(
  command: CommandSpec, tokens: Token[]): FlagsAndArgs {
  const flags: Map<string, string|null> = new Map();
  const freeArgs: string[] = []; // Args that come after all flags
  let seenFreeArg = false;

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].isFlag) {
      if (seenFreeArg) {
        throw new ClientError('Flags cannot come after normal arguments');
      }
      const flag = tokens[i].text;
      const flagSpec = command.flagSpecMap.get(flag);
      if (!flagSpec) {
        throw new ClientError(`Unrecognized flag: "${flag}"`);
      }
      // Flags shouldn't appear more than once
      if (flags.has(flag)) {
        throw new ClientError(`Flag "${flag}" appears more than once`);
      }

      let flagArg: string|null = null;
      if (flagSpec.hasArg) {
        // If this flag is the last token OR if the next token is also a flag
        if (i == tokens.length - 1 || tokens[i + 1].isFlag) {
          throw new ClientError(`Expected argument after flag "${flag}"`);
        }
        // Consume the next token as an arg
        flagArg = tokens[i + 1].text;
        i++;
      }
      flags.set(flag, flagArg);
    } else { // Non-flag token
      seenFreeArg = true;
      freeArgs.push(tokens[i].text);
    }
  }

  if (command.minArgs === command.maxArgs &&
      freeArgs.length !== command.minArgs) {
    throw new ClientError(
      `Expected ${command.minArgs} ${pluralize(command.minArgs, 'argument')}`);
  } else if (freeArgs.length < command.minArgs) {
    throw new ClientError(
      `Expected at least ${command.minArgs} ` +
      pluralize(command.minArgs, 'argument'));
  } else if (command.maxArgs !== -1 && freeArgs.length > command.maxArgs) {
    throw new ClientError(
      `Expected no more than ${command.maxArgs} ` +
      pluralize(command.maxArgs, 'argument'));
  }

  return new FlagsAndArgs(flags, freeArgs);
}
