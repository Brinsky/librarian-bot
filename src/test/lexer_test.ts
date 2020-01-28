import 'jasmine';
import {lex, Token} from '../lexer';

function toStrings(tokens: Token[]): string[] {
  return tokens.map(t => t.toString());
}

describe('lexer', () => {
  describe('#lex()', () => {
    it('should handle text ending in whitespace', () => {
      expect(toStrings(lex('a bc  \ndef\r\n'))).toEqual(['a', 'bc', 'def']);
    });
    it('should handle text ending in non-whitespace', () => {
      expect(toStrings(lex('a bc  \ndef'))).toEqual(['a', 'bc', 'def']);
    });
    it('should handle double quotes', () => {
      expect(toStrings(lex('hi ther"friend how"   are "you ?" ')))
          .toEqual(['hi', 'therfriend how', 'are', 'you ?']);
    });
    it('should handle single quotes', () => {
      expect(toStrings(lex('hi ther\'friend how\'   are \'you ?\' ')))
          .toEqual(['hi', 'therfriend how', 'are', 'you ?']);
    });
    it('should handle both quote types', () => {
      expect(toStrings(lex('hi ther"friend how\'ve"   you \'been ""?\' ')))
          .toEqual(['hi', 'therfriend how\'ve', 'you', 'been ""?']);
    });
    it('should preserve characters after backslashes', () => {
      expect(toStrings(lex('\\a\\b\\c\\d "\\e\\f\\g"')))
          .toEqual(['abcd', 'efg']);
    });
    it('should handle escaped quotes', () => {
      expect(toStrings(lex('whoa "there\\"" nice \'quotes\\\' \'')))
          .toEqual(['whoa', 'there"', 'nice', 'quotes\' ']);
    });
    it('should detect flags', () => {
      const tokens = lex('test -f "-nf" ""-nf \\-nf ---f nf nf -f');

      expect(toStrings(tokens)).toEqual(
          ['test', '-f', '-nf', '-nf', '-nf', '---f', 'nf', 'nf', '-f']);

      expect(tokens.map((t) => t.isFlag)).toEqual(
          [false, true, false, false, false, true, false, false, true]);
    });
  });
});
