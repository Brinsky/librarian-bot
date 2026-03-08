import {Message} from 'discord.js'
import {FlagsAndArgs} from './command'
import {randomInt, shuffle} from './util'

export async function picker(
  flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
  if (!('send' in message.channel)) {
    return;
  }

  if (flagsAndArgs.flags.has('-s')) {
    const shuffledArgs = [...flagsAndArgs.args];
    shuffle(shuffledArgs);
    message.channel.send(`I picker ${shuffledArgs.join(', ')}`);
  } else {
    const pickedIndex = randomInt(0, flagsAndArgs.args.length);
    message.channel.send(`I picker ${flagsAndArgs.args[pickedIndex]}!`);
  }
}
