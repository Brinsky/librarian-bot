import {Message} from 'discord.js';
import {CommandSpec, FlagsAndArgs} from './command';

export async function help(
    commands: ReadonlyMap<string, CommandSpec>,
    flagsAndArgs: FlagsAndArgs,
    message: Message): Promise<void> {
  if (!('send' in message.channel)) {
    return;
  }
  const lines: string[] = ['**Available Commands:**\n'];
  for (const [name, spec] of commands.entries()) {
    let commandLine = `**!${name}**`;
    if (spec.argUsage) {
      commandLine += ` ${spec.argUsage}`;
    }
    commandLine += ` - ${spec.description}`;
    lines.push(commandLine);
    
    for (const flag of spec.flagSpecMap.values()) {
      let flagLine = `  \`${flag.name}\``;
      if (flag.hasArg) {
        flagLine += ` <arg>`;
      }
      flagLine += ` - ${flag.description}`;
      lines.push(flagLine);
    }
  }
  lines.push('\nText arguments are whitespace delimited. To include whitespace in a single argument, wrap it with "quotes".');

  message.channel.send(lines.join('\n'));
}