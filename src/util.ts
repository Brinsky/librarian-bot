import {Client, Message, User} from 'discord.js'
import {ClientError} from './error'

/** Performs naive pluralization of English words. */
export function pluralize(
  value: number, singularWord: string, pluralWord?: string): string {
  if (!pluralWord) {
    pluralWord = singularWord + 's';
  }
  return value === 1 ? singularWord : pluralWord;
}

/**
 * Provides a random integer between min (inclusive) and max (exclusive).
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

/**
 * Performs a Fisher-Yates shuffle on the given array.
 */
export function shuffle<T>(array: T[]): void {
  for (let i = 0; i < array.length - 1; i++) {
    const j = randomInt(i, array.length);
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

/**
 * Returns the given object unmodified if the object is neither undefined nor
 * null. Otherwise, throws an error.
 */
export function assertNonNull<T>(t: T|null): T {
  if (t !== null) {
    return t;
  } else {
    throw new Error(`Failed to assert object was non-null: object is {$t}`);
  }
}

/**
 * Attempts to fetch the User objects for the provided user IDs and verifies
 * that no duplicate IDs were provided. Throws appropriate ClientErrors if
 * either step fails.
 */
export async function fetchUsers(
  ids: string[], client: Client): Promise<User[]> {
  const users: User[] = [];
  const userIdSet: Set<string> = new Set();

  for(const id of ids) {
    // Ensure each ID corresponds to a real user
    try {
      users.push(await client.users.fetch(id));
    } catch(err) {
      throw new ClientError(`Failed to find user with ID ${id}`, err);
    }

    // Ensure each user is specified only once
    if (userIdSet.has(id)) {
      throw new ClientError(
        `User ${users[users.length - 1]} listed more than once`);
    } else {
      userIdSet.add(id);
    }
  }

  return users;
}

const MENTION_PATTERN = /<@!?(\d+)>/;

/**
 * Converts a user mention (e.g. <@123456>) to a user ID (e.g. 123456). Throws
 * an appropriate ClientError if the given string is not formatted like a
 * mention.
 */
export function mentionToId(mention: string): string {
  const match = mention.match(MENTION_PATTERN);
  if (match === null || match.length !== 2) { 
    throw new ClientError(
      `Unrecognized argument ${mention}. Expected an @ tag`);
  }
  return match[1];
}

export async function markPending(msg: Message): Promise<void> {
  await msg.react('\u231B');
}

export async function markComplete(
  msg: Message, client: Client): Promise<void> {
  // Refetch the message from the channel to get the latest reactions.
  // For some reason msg.fetch() doesn't seem to do this.
  msg = await msg.channel.messages.fetch(msg.id); 

  const existing = msg.reactions.find((r) => r.emoji.name === '\u231B');
  if (existing && client.user) {
    existing.users.remove(client.user);
  }
  await msg.react('\u2705');
}

export function escapeMarkdownChars(text: string): string {
  const unescaped = text.replace(/\\([\\*_~`])/g, '$1');
  return unescaped.replace(/[\\*_~`]/g, '\\$&');
}

export function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
}
