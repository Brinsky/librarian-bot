import 'jasmine';
import { mentionToId, parseMentions, splitMessage } from '../util';

describe('mentionToId', () => {
  it('extracts the ID from a valid mention', () => {
    expect(mentionToId('<@123456>')).toBe('123456');
  });

  it('extracts the ID from a valid nickname mention', () => {
    expect(mentionToId('<@!123456>')).toBe('123456');
  });

  it('throws for a string with no mention', () => {
    expect(() => mentionToId('not a mention')).toThrow();
  });

  it('throws instead of silently returning only the first mention when ' +
    'given multiple mentions in one string', () => {
    expect(() => mentionToId('<@111> <@222> <@333>')).toThrow();
  });

  it('throws for a mention with trailing extra characters', () => {
    expect(() => mentionToId('<@123>x')).toThrow();
  });

  it('throws for a mention with leading extra characters', () => {
    expect(() => mentionToId('x<@123>')).toThrow();
  });
});

describe('parseMentions', () => {
  it('parses a single mention', () => {
    expect(parseMentions('<@123>')).toEqual(['123']);
  });

  it('splits multiple space-separated mentions into individual IDs', () => {
    expect(parseMentions('<@111> <@222> <@333>'))
      .toEqual(['111', '222', '333']);
  });

  it('handles repeated and varied whitespace between mentions', () => {
    expect(parseMentions('  <@111>   <@222>\t<@333>  '))
      .toEqual(['111', '222', '333']);
  });

  it('throws if any token is not a valid mention', () => {
    expect(() => parseMentions('<@111> not-a-mention')).toThrow();
  });
});

describe('splitMessage', () => {
  it('returns original string if length is <= 2000', () => {
    const text = 'a'.repeat(2000);
    const result = splitMessage(text);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(text);
  });

  it('splits at last newline < 1900 and prepends headers', () => {
    const part1 = 'a'.repeat(1800) + '\n';
    const part2 = 'b'.repeat(1800) + '\n';
    const part3 = 'c'.repeat(500);

    const text = part1 + part2 + part3;
    const result = splitMessage(text);

    expect(result.length).toBe(3);
    expect(result[0]).toBe(`*1/3:*\n${'a'.repeat(1800)}`);
    expect(result[1]).toBe(`*2/3:*\n${'b'.repeat(1800)}`);
    expect(result[2]).toBe(`*3/3:*\n${'c'.repeat(500)}`);
  });

  it('falls back to 1900 arbitrarily if no newline is found', () => {
    const text = 'a'.repeat(4000);
    const result = splitMessage(text);

    expect(result.length).toBe(3);
    expect(result[0]).toBe(`*1/3:*\n${'a'.repeat(1900)}`);
    expect(result[1]).toBe(`*2/3:*\n${'a'.repeat(1900)}`);
    expect(result[2]).toBe(`*3/3:*\n${'a'.repeat(200)}`);
  });

  it('handles combination of newline split and arbitrary split', () => {
    const text = 'a'.repeat(1950) + '\n' + 'b'.repeat(50);
    const result = splitMessage(text);

    // Arbitrary split as no newline in first 1900
    expect(result[0]).toBe(`*1/2:*\n${'a'.repeat(1900)}`);
    // Then remainder 'a's (50) + \n + 'b's (50) is smaller than 1900
    expect(result[1]).toBe(`*2/2:*\n${'a'.repeat(50)}\n${'b'.repeat(50)}`);
  });

  it('treats empty string properly', () => {
    const result = splitMessage('');
    expect(result.length).toBe(1);
    expect(result[0]).toBe('');
  });
});
