import {Token} from './lexer'
import {Message, Client} from 'discord.js'

export class FlagSpec {
  public constructor(readonly name: string, readonly hasArg: boolean) {}
}

export class FlagsAndArgs {
  public constructor(
    readonly flags: Map<string, string|null>,
    readonly args: string[]) {}
}

export interface Command {
  (flagsAndArgs: FlagsAndArgs, message: Message, client?: Client): void|Promise<void>;
}

export class CommandSpec {
  public readonly flagSpecMap: Map<string, FlagSpec>;

  public constructor(readonly command: Command, flagSpecs: FlagSpec[] = []) {
    this.flagSpecMap = new Map();
    for (const flagSpec of flagSpecs) {
      this.flagSpecMap.set(flagSpec.name, flagSpec);
    }
  }
}

export function parseCommand(commandSpec: CommandSpec, tokens: Token[]): FlagsAndArgs {
  const flags: Map<string, string|null> = new Map();
  const freeArgs: string[] = []; // Args that come after all flags
  let seenFreeArg = false;

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].isFlag) {
      if (seenFreeArg) {
        throw new Error('Flags cannot come after normal arguments');
      }
      const flagSpec = commandSpec.flagSpecMap.get(tokens[i].text);
      if (!flagSpec) {
        throw new Error('Unrecognized flag: "' + tokens[i] + '"');
      }
      // Flags shouldn't appear more than once
      if (flags.has(tokens[i].text)) {
        throw new Error('Flag "' + tokens[i] + '" appears more than once');
      }

      let flagArg: string|null = null;
      if (flagSpec.hasArg) {
        // If this flag is the last token OR if the next token is also a flag
        if (i == tokens.length - 1 || tokens[i + 1].isFlag) {
          throw new Error('Expected argument after flag "' + tokens[i] + '"');
        }
        // Consume the next token as an arg
        flagArg = tokens[i + 1].text;
        i++;
      }
      flags.set(tokens[i].text, flagArg);
    } else { // Non-flag token
      seenFreeArg = true;
      freeArgs.push(tokens[i].text);
    }
  }

  return new FlagsAndArgs(flags, freeArgs);
}
