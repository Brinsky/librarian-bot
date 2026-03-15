import 'jasmine';
import { splitMessage } from '../util';

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
