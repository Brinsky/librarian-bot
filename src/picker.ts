import {Message} from 'discord.js'
import {FlagsAndArgs} from './command'
import {randomInt} from './util'

export async function picker(
  flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
  const pickedIndex = randomInt(0, flagsAndArgs.args.length); 
  message.channel.send(`I picker ${flagsAndArgs.args[pickedIndex]}!`);
}
