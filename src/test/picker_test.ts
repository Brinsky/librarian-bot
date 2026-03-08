import 'jasmine';
import {picker} from '../picker';
import {FlagsAndArgs} from '../command';
import {Message} from 'discord.js';

describe('picker', () => {
  let mockMessage: any;
  let mockSend: jasmine.Spy;

  beforeEach(() => {
    mockSend = jasmine.createSpy('send');
    mockMessage = {
      channel: {
        send: mockSend
      }
    };
  });

  it('picks a single random option when no flag is provided', async () => {
    const flagsAndArgs = new FlagsAndArgs(new Map(), ['A', 'B', 'C']);
    await picker(flagsAndArgs, mockMessage as unknown as Message);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const sentMessage = mockSend.calls.mostRecent().args[0];

    expect(sentMessage).toMatch(/^I picker [ABC]!$/);
  });

  it('shuffles and returns all options when -s flag is provided', async () => {
    const flags = new Map<string, string|null>([['-s', null]]);
    const args = ['A', 'B', 'C'];
    const flagsAndArgs = new FlagsAndArgs(flags, args);
    await picker(flagsAndArgs, mockMessage as unknown as Message);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const sentMessage = mockSend.calls.mostRecent().args[0];

    expect(sentMessage).toMatch(/^I picker /);
    const resultString = sentMessage.substring('I picker '.length);
    const results = resultString.split(', ');

    expect(results.length).toBe(3);
    expect(results).toContain('A');
    expect(results).toContain('B');
    expect(results).toContain('C');
  });

  it('does nothing if the channel cannot send messages', async () => {
    mockMessage = {
      channel: {}
    };
    const flagsAndArgs = new FlagsAndArgs(new Map(), ['A', 'B', 'C']);
    await picker(flagsAndArgs, mockMessage as unknown as Message);
    expect(mockSend).not.toHaveBeenCalled();
  });
});