import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from './command';
import { ClientError } from './error';
import { randomInt, splitMessage } from './util';
import * as fs from 'fs';

const DECK_DIR = 'data/cah';
const BLANK_LENGTH = 18;
// Underlined (via markdown) spaces used for black card blanks
const BLANK = '__' + ' '.repeat(BLANK_LENGTH) + '__';

// Only used for parsing from JSON
interface RawCard {
  id: number;
  text: string;
}

interface Deck {
  deckName: string;
  parentSet: string;
  cards: {
    black: RawCard[];
    white: RawCard[];
  };
}

interface Card extends RawCard {
  deck: Deck;
}

/**
 * Replaces placeholders (e.g. `{1}`) in a black card's text with blanks, and
 * reports how many distinct white cards are needed to fill them. A card with
 * no placeholders is a Q&A-style card that still needs exactly one white card
 * appended.
 */
function renderBlackCard(text: string): { display: string; pickCount: number } {
  const seen = new Set<number>();
  const display = text.replace(/\\\{|\{(\d+)\}/g, (match, num) => {
    if (num === undefined) {
      return '{';
    }
    seen.add(Number(num));
    return BLANK;
  });
  return { display, pickCount: seen.size || 1 };
}

const MAX_SAMPLE_ATTEMPTS_PER_CARD = 5;

/** Draws `count` distinct random elements from `pool`. */
function sampleDistinct<T>(pool: T[], count: number): T[] {
  if (count > pool.length) {
    throw new ClientError('Not enough white cards to draw for this black card');
  }

  const usedIndices = new Set<number>();
  const result: T[] = [];
  const maxAttempts = count * MAX_SAMPLE_ATTEMPTS_PER_CARD;
  for (let attempt = 0; attempt < maxAttempts && result.length < count; attempt++) {
    const index = randomInt(0, pool.length);
    if (!usedIndices.has(index)) {
      usedIndices.add(index);
      result.push(pool[index]);
    }
  }

  if (result.length < count) {
    throw new ClientError(`Failed to draw enough distinct white cards after ${maxAttempts}`);
  }
  return result;
}

function formatSource(card: Card): string {
  return `-# *${card.deck.parentSet}: ${card.deck.deckName}*`;
}

/** Loads CAH decks and provides the /cah command for drawing a random hand. */
export default class CardsAgainst {
  private readonly blackCards: Card[] = [];
  private readonly whiteCards: Card[] = [];

  public constructor() {
    // Load all decks during startup
    for (const file of fs.readdirSync(DECK_DIR)) {
      if (!file.endsWith('.json')) {
        continue;
      }
      const deck =
        JSON.parse(fs.readFileSync(`${DECK_DIR}/${file}`).toString()) as Deck;
      for (const card of deck.cards.black) {
        this.blackCards.push(Object.assign(card, { deck }));
      }
      for (const card of deck.cards.white) {
        this.whiteCards.push(Object.assign(card, { deck }));
      }
    }
  }

  public readonly cahCommand: SlashCommand = {
    data: new SlashCommandBuilder()
      .setName('cah')
      .setDescription(
        'Draws a random Cards Against Humanity play (black card + white card(s))'),
    execute: async (interaction: ChatInputCommandInteraction) => {
      if (this.blackCards.length === 0 || this.whiteCards.length === 0) {
        throw new ClientError('No CAH decks are loaded');
      }

      const blackCard = this.blackCards[randomInt(0, this.blackCards.length)];
      const { display, pickCount } = renderBlackCard(blackCard.text);
      const whiteCards = sampleDistinct(this.whiteCards, pickCount);

      const lines: string[] = [];
      lines.push(display);
      lines.push(formatSource(blackCard));
      lines.push('');
      if (whiteCards.length === 1) {
        lines.push(whiteCards[0].text);
        lines.push(formatSource(whiteCards[0]));
      } else {
        whiteCards.forEach((card, i) => {
          lines.push(`${i + 1}. ${card.text}`);
          lines.push(`   ${formatSource(card)}`);
        });
      }

      const chunks = splitMessage(lines.join('\n'));
      await interaction.reply({ content: chunks[0] });
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({ content: chunks[i] });
      }
    }
  };
}
