import {Client, Message, User} from 'discord.js'
import {FlagsAndArgs} from './command'
import {logClientError, logError} from './error'
import {randomInt} from './util'

const TAG_PATTERN = /<@(\d+)>/;

export async function picker(flagsAndArgs: FlagsAndArgs, message: Message,
  client: Client): Promise<void> {
  const users: User[] = [];

  for(const tag of flagsAndArgs.args) {
    // Validate @ tag and extract user ID
    const match = tag.match(TAG_PATTERN);
    if (match === null || match.length !== 2) { 
      logClientError(
        message, `Unrecognized argument ${tag}. Expect an @ tag`);
      return;
    }
    const id = match[1];

    // Ensure each ID corresponds to a real user
    try {
      users.push(await client.users.fetch(id));
    } catch(err) {
      logClientError(message, `Failed to find user with ID ${id}`);
      logError(err);
      return;
    }
  }

  const pickedIndex = randomInt(0, users.length); 
  
  message.channel.send(`I picker ${users[pickedIndex]}!`);
}
