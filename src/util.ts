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
