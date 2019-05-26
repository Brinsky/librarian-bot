/**
 * Represents a string extracted using lex().
 * isFlag indicates whether the string was preceded by a hyphen (-) in its
 * original, unquoted form.
 */
export class Token {
    public constructor(readonly text: string, readonly isFlag: boolean) {}

    public toString(): string {
        return this.text;
    }
}

/** 
 * Turns a string into a list of tokens, using whitespace as a delimiter.
 * Any character following a backslash is including literally, as are
 * substrings between quotes (either ' or "). The end of the string is also
 * treated as a closing quote if an unmatched quote precedes it. Finally,
 * tokens immediately preceded by a hyphen (-) are annotated as 'flags'.
 */
export function lex(text: string): Token[] {
    const tokens: Token[] = [];
    let buffer: string[] = [];

    let inQuotes = false;
    let quoteType = '';
    let preceedingBackslash = false;

    // Whether the current content of the buffer started with a -, but
    // excluding cases where that - was inside quotes or preceded by a
    // backslash. Involves a bit of cheating by looking ahead.
    let isFlag = text.length > 0 && text.charAt(0) === '-';

    for(let i = 0; i < text.length; i++) {
        let ch = text.charAt(i);

        if (preceedingBackslash) { // Char after backslash
            preceedingBackslash = false;
            // Current char will be added to the buffer
        } else if (ch === '\\') { // First backslash
            preceedingBackslash = true;
            continue;
        } else if (inQuotes) {
            if (ch === quoteType) { // End quote
                inQuotes = false;
                continue;
            }
            // Otherwise, add to the buffer
        } else { // !inQuotes
            if (/\s/.test(ch)) { // Whitespace
                if (buffer.length > 0) {
                    tokens.push(new Token(buffer.join(''), isFlag));
                    buffer = [];
                    isFlag = false;
                }
                // Look ahead to determine if next token will be a flag
                if (text.length > i + 1 && text.charAt(i + 1) === '-') {
                    isFlag = true;
                }
                continue;
            } else if (ch === '"' || ch === "'") { // Start quote
                inQuotes = true;
                quoteType = ch;
                continue;
            }
        }
		
        buffer.push(ch);
    }

    if (buffer.length > 0) {
        tokens.push(new Token(buffer.join(''), isFlag));
    }

    return tokens;
}
