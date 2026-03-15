import 'jasmine';
import { picker } from '../picker';
import { ChatInputCommandInteraction } from 'discord.js';

describe('picker', () => {
  let mockInteraction: any;
  let mockReply: jasmine.Spy;
  let getStringSpy: jasmine.Spy;
  let getBooleanSpy: jasmine.Spy;

  beforeEach(() => {
    mockReply = jasmine.createSpy('reply');
    getStringSpy = jasmine.createSpy('getString');
    getBooleanSpy = jasmine.createSpy('getBoolean');

    mockInteraction = {
      reply: mockReply,
      options: {
        getString: getStringSpy,
        getBoolean: getBooleanSpy,
      }
    };
  });

  it('picks a single random option when no flag is provided', async () => {
    getStringSpy.and.returnValue('A B C');
    getBooleanSpy.and.returnValue(false);

    await picker.execute(mockInteraction as unknown as ChatInputCommandInteraction, null as any);

    expect(mockReply).toHaveBeenCalledTimes(1);
    const sentMessage = mockReply.calls.mostRecent().args[0];

    expect(sentMessage).toMatch(/^I picker [ABC]!$/);
  });

  it('shuffles and returns all options when shuffle is provided', async () => {
    getStringSpy.and.returnValue('A B C');
    getBooleanSpy.and.returnValue(true);

    await picker.execute(mockInteraction as unknown as ChatInputCommandInteraction, null as any);

    expect(mockReply).toHaveBeenCalledTimes(1);
    const sentMessage = mockReply.calls.mostRecent().args[0];

    expect(typeof sentMessage).toBe('string');
    expect(sentMessage).toMatch(/^I picker /);
    const resultString = sentMessage.substring('I picker '.length);
    const results = resultString.split(', ');

    expect(results.length).toBe(3);
    expect(results).toContain('A');
    expect(results).toContain('B');
    expect(results).toContain('C');
  });

  it('handles empty options', async () => {
    getStringSpy.and.returnValue('     ');
    getBooleanSpy.and.returnValue(false);

    await picker.execute(mockInteraction as unknown as ChatInputCommandInteraction, null as any);

    expect(mockReply).toHaveBeenCalledTimes(1);
    expect(mockReply.calls.mostRecent().args[0].content).toBe('No options provided!');
  });
});