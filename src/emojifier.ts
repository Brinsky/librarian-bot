import {Message} from 'discord.js'
import {FlagsAndArgs} from './command'

const EMOJI_MAP: ReadonlyMap<string, string> = new Map([
  ['a', '\ud83c\udde6'],
  ['b', '\ud83c\udde7'],
  ['c', '\ud83c\udde8'],
  ['d', '\ud83c\udde9'],
  ['e', '\ud83c\uddea'],
  ['f', '\ud83c\uddeb'],
  ['g', '\ud83c\uddec'],
  ['h', '\ud83c\udded'],
  ['i', '\ud83c\uddee'],
  ['j', '\ud83c\uddef'],
  ['k', '\ud83c\uddf0'],
  ['l', '\ud83c\uddf1'],
  ['m', '\ud83c\uddf2'],
  ['n', '\ud83c\uddf3'],
  ['o', '\ud83c\uddf4'],
  ['p', '\ud83c\uddf5'],
  ['q', '\ud83c\uddf6'],
  ['r', '\ud83c\uddf7'],
  ['s', '\ud83c\uddf8'],
  ['t', '\ud83c\uddf9'],
  ['u', '\ud83c\uddfa'],
  ['v', '\ud83c\uddfb'],
  ['w', '\ud83c\uddfc'],
  ['x', '\ud83c\uddfd'],
  ['y', '\ud83c\uddfe'],
  ['z', '\ud83c\uddff'],
  ['?', '\u2754'],
  ['!', '\u2755'],
  ['1', ':one:'],
  ['2', ':two:'],
  ['3', ':three:'],
  ['4', ':four:'],
  ['5', ':five:'],
  ['6', ':six,:'],
  ['7', ':seven:'],
  ['8', ':eight:'],
  ['9', ':nine:'],
  ['-', '\u2796']
]);

function emojifyText(text: string): string {
  const emojified: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i).toLowerCase();
    const emoji = EMOJI_MAP.get(ch); // May be null
    if (ch === ' ') {
      // A "wide" space to compliment emoji size
      emojified.push('     ');
    } else if (emoji) {
      emojified.push(emoji);
    }
  }

  // U+200B "zero-width space" is needed in between each emoji to prevent
  // multi-character emojis (like country flags) from forming.
  return emojified.join('\u200b');
}

export async function emojify(
  flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
  const args = flagsAndArgs.args;
  for (let i = 0; i < args.length; i++) {
    message.channel.send(emojifyText(args[i]));
  }
}

/**
 * Converts strings to UTF-16 "escaped" encoding, e.g. '\uABCD\u1234'.
 */
export async function utf(flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
  // Iterate over each argument (whitespace separated text/emojis)
  const allEncoded: string[] = [];
  for (const arg of flagsAndArgs.args) {
    // Capture each UTF-16 code point in the string
    const encoded: string[] = [];
    for (let i = 0; i < arg.length; i++) {
      encoded.push('\\u' + arg.charCodeAt(i).toString(16).toUpperCase());
    }
    allEncoded.push(encoded.join(''));
  }

  message.reply(allEncoded.join(' '));
}
