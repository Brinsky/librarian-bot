/** Performs naive pluralization of English words. */
export function pluralize(
  value: number, singularWord: string, pluralWord?: string): string {
  if (!pluralWord) {
    pluralWord = singularWord + 's';
  }
  return value === 1 ? singularWord : pluralWord;
}
