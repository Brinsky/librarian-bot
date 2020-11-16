import {Message} from 'discord.js'
import {formatDate} from './util'

const EMOJI_X = '\u274C';
const EMOJI_SUCCESS = '\u2705'; // "White heavy checkmark"

export function log(text: string): void {
  console.log(`[${formatDate(new Date())}] ${text}`);
}

export function logClientError(message: Message, error: string): void {
  log(error);
  message.react(EMOJI_X).catch(log);
  message.reply(error).catch(log);
}

export function indicateSuccess(message: Message): void {
  message.react(EMOJI_SUCCESS).catch(log);
}

/**
 * Subclass of Error used to indicate that the error message should be
 * user-visible.
 */
export class ClientError extends Error {
  public constructor(message: string, readonly internalMessage?: string) {
    super(message);
  }
};
