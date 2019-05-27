import {Message} from 'discord.js'

const EMOJI_X = '\u274C';

export function logError(error: string): void {
  console.log(error);
}

export function logClientError(message: Message, error: string): void {
  logError(error);
  message.react(EMOJI_X).catch(logError);
  message.reply(error).catch(logError);
}
