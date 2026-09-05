import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from './command';
import { ClientError } from './error';
import { randomInt, splitMessage } from './util';
import * as fs from 'fs';

const DECK_DIR = 'data/cah';
const BLANK_LENGTH = 18;
// Underlined (via markdown) spaces used for black card blanks
const BLANK = '__' + ' '.repeat(BLANK_LENGTH) + '__';

// Limits on best-effort draw operations
const MAX_DRAW_ATTEMPTS_PER_CARD = 5;
const MAX_DRAW_ATTEMPTS_PER_HAND = 15;

const CONFIG_FILENAME = 'config.json';
// Files in DECK_DIR that aren't decks and shouldn't be loaded as one.
const IGNORED_DECK_FILES = new Set([
  CONFIG_FILENAME,
  'config-sample.json',
  'sample-deck.json',
]);

interface CahConfig {
  allFrom: string;
  oneFrom: string;
}

const DEFAULT_CONFIG: CahConfig = { allFrom: '', oneFrom: '' };

function loadConfig(): CahConfig {
  try {
    const raw = fs.readFileSync(`${DECK_DIR}/${CONFIG_FILENAME}`).toString();
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// Only used for parsing from JSON
interface RawCard {
  id: number;
  text: string;
}

interface Deck {
  deckName: string;
  parentSet: string;
  deckNumber?: number;
  cards: {
    black: RawCard[];
    white: RawCard[];
  };
}

interface Card extends RawCard {
  deck: Deck;
}

interface Hand {
  renderedBlackCard: string;
  blackCard: Card;
  whiteCards: Card[];
}

interface RenderedBlackCard {
  renderedBlackCard: string;
  pickCount: number;
}

function qualifiedName(deck: Deck): string {
  const deckNumber = deck.deckNumber ? ' ' + deck.deckNumber : '';
  return `${deck.parentSet}${deckNumber}: ${deck.deckName}`;
}

/**
 * Resolves a comma-separated list of deck name patterns to the set of decks
 * whose qualified name ("<parentSet>: <deckName>") contains that pattern as a
 * case-insensitive substring. A single pattern may match several decks (e.g.
 * "Base" matches every deck named "Base" across all parent sets).
 */
function resolveDecks(rawInput: string, decks: Set<Deck>): Set<Deck> {
  const patterns = rawInput.split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);

  const matched = new Set<Deck>();
  for (const deck of decks) {
    const name = qualifiedName(deck).toLowerCase();
    if (patterns.some(pattern => name.includes(pattern))) {
      matched.add(deck);
    }
  }
  return matched;
}

/**
 * Replaces placeholders (e.g. `{1}`) in a black card's text with blanks, and
 * reports how many distinct white cards are needed to fill them. A card with
 * no placeholders is a Q&A-style card that still needs exactly one white card
 * appended.
 */
function renderBlackCard(text: string): RenderedBlackCard {
  const seen = new Set<number>();
  const renderedBlackCard = text.replace(/\\\{|\{(\d+)\}/g, (match, num) => {
    if (num === undefined) {
      return '{';
    }
    seen.add(Number(num));
    return BLANK;
  });
  return { renderedBlackCard, pickCount: seen.size || 1 };
}

function formatSource(card: Card, isBlack: boolean): string {
  const icon = isBlack ? '◾' : '◽';
  return `-# *${qualifiedName(card.deck)} (${icon}${card.id})*`;
}

/** Draws `count` distinct random elements from `pool`. */
function sampleDistinct<T>(pool: T[], count: number): T[] {
  if (count > pool.length) {
    throw new ClientError('Not enough white cards to draw for this black card');
  }

  const usedIndices = new Set<number>();
  const result: T[] = [];
  const maxAttempts = count * MAX_DRAW_ATTEMPTS_PER_CARD;
  let attempt = 0;
  while (attempt < maxAttempts && result.length < count) {
    const index = randomInt(0, pool.length);
    if (!usedIndices.has(index)) {
      usedIndices.add(index);
      result.push(pool[index]);
    }
    attempt++;
  }

  if (result.length < count) {
    throw new ClientError(
      `Failed to draw enough distinct white cards after ${maxAttempts}`);
  }
  return result;
}

/** Draws one black card and however many distinct white cards it requires. */
function drawHand(blackPool: Card[], whitePool: Card[]): Hand {
  const blackCard = blackPool[randomInt(0, blackPool.length)];
  const { renderedBlackCard, pickCount } = renderBlackCard(blackCard.text);
  const whiteCards = sampleDistinct(whitePool, pickCount);
  return { renderedBlackCard, blackCard, whiteCards };
}

function handIncludesDecks(hand: Hand, decks: Set<Deck>): boolean {
  return decks.has(hand.blackCard.deck) ||
    hand.whiteCards.some(card => decks.has(card.deck));
}

const ALL_FROM_DESCRIPTION =
  'Deck name pattern(s), comma-separated; every card must come from a ' +
  'matching deck';
const ONE_FROM_DESCRIPTION =
  'Deck name pattern(s), comma-separated; at least one card must be ' +
  'from a matching deck';

/** Loads CAH decks and provides the /cah command for drawing a random hand. */
export default class CardsAgainst {
  private readonly config: CahConfig;
  private readonly decks: Set<Deck> = new Set<Deck>();
  private readonly blackCards: Card[] = [];
  private readonly whiteCards: Card[] = [];

  public constructor() {
    this.config = loadConfig();

    // Load all decks during startup
    for (const file of fs.readdirSync(DECK_DIR)) {
      if (!file.endsWith('.json') || IGNORED_DECK_FILES.has(file)) {
        continue;
      }
      const deck =
        JSON.parse(fs.readFileSync(`${DECK_DIR}/${file}`).toString()) as Deck;
      this.decks.add(deck);
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
        'Draws a random Cards Against Humanity play (black card + ' +
        'white card(s))')
      .addStringOption(option =>
        option.setName('all_from')
          .setDescription(ALL_FROM_DESCRIPTION)
          .setRequired(false))
      .addStringOption(option =>
        option.setName('one_from')
          .setDescription(ONE_FROM_DESCRIPTION)
          .setRequired(false)),
    execute: async (interaction: ChatInputCommandInteraction) => {
      // An explicitly passed (possibly empty) option overrides the
      // configured default; an omitted option falls back to it.
      const allFromInput =
        interaction.options.getString('all_from') ?? this.config.allFrom;
      const oneFromInput =
        interaction.options.getString('one_from') ?? this.config.oneFrom;

      const allFromDecks = allFromInput ?
        resolveDecks(allFromInput, this.decks) : this.decks;
      const blackPool =
        this.blackCards.filter(card => allFromDecks.has(card.deck));
      const whitePool =
        this.whiteCards.filter(card => allFromDecks.has(card.deck));

      if (blackPool.length === 0 || whitePool.length === 0) {
        throw new ClientError(allFromInput ?
          'No cards available for the given filters' :
          'No CAH decks are loaded');
      }

      let hand: Hand | undefined;
      if (oneFromInput) {
        const oneFromDecks = resolveDecks(oneFromInput, this.decks);
        for (
          let attempt = 0;
          attempt < MAX_DRAW_ATTEMPTS_PER_HAND && !hand;
          attempt++) {
          let candidate: Hand;
          try {
            candidate = drawHand(blackPool, whitePool);
          } catch (err) {
            // Failed to draw enough white cards - possibly by chance;
            // keep trying.
            if (!(err instanceof ClientError)) {
              throw err;
            }
            continue;
          }
          if (handIncludesDecks(candidate, oneFromDecks)) {
            hand = candidate;
          }
        }
        if (!hand) {
          throw new ClientError(
            'Couldn\'t find a draw satisfying one_from after ' +
            `${MAX_DRAW_ATTEMPTS_PER_HAND} attempts`);
        }
      } else {
        hand = drawHand(blackPool, whitePool);
      }

      const { renderedBlackCard, blackCard, whiteCards } = hand;

      const lines: string[] = [];
      lines.push(renderedBlackCard);
      lines.push(formatSource(blackCard, /* isBlack= */ true));
      lines.push('');
      if (whiteCards.length === 1) {
        lines.push(whiteCards[0].text);
        lines.push(formatSource(whiteCards[0], /* isBlack= */ false));
      } else {
        whiteCards.forEach((card, i) => {
          lines.push(`${i + 1}. ${card.text}`);
          lines.push(`   ${formatSource(card, /* isBlack= */ false)}`);
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
