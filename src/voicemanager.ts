import {Client, Message, MessageReaction, Snowflake, VoiceChannel, VoiceConnection} from 'discord.js'
import {FlagsAndArgs} from './command'
import {ClientError, indicateSuccess, logClientError, log} from './error'
import {promisify} from 'util'
import * as fs from 'fs'
import {awaitCollectorEnd} from './util'

const stat = promisify(fs.stat);

interface TrackMap {
  [key: string]: string;
}

const HOUR_MS = 60 * 60 * 1000;
const MAX_ACTIVE_SOUNDBOARDS = 3;

function buildSoundboardMessage(trackMap: TrackMap) {
  const msg: string[] = [];
  msg.push('The following audio tracks are available:');
  for (const emoji in trackMap) {
    msg.push(`\n${emoji}  ${trackMap[emoji]}`);
  }
  return msg.join('\n');
}

export default class VoiceManager {
  private connection: null|VoiceConnection = null;
  private activeSoundboards = 0;
  private trackMap: TrackMap;

  public constructor() {
    // Okay to do synchronously as this constructor should be called during
    // program startup
    this.trackMap =
      JSON.parse(fs.readFileSync('data/soundboard.json').toString()) as TrackMap;
  }

  // Prompts the bot to join a voice channel
  public async vjoin(
    flagsAndArgs: FlagsAndArgs,
    message: Message,
    client: Client): Promise<void> {

    let voiceChannel;
    if (flagsAndArgs.flags.has('-c')) { // Find channel by ID
      const channelId = flagsAndArgs.flags.get('-c')!;
      try {
        voiceChannel = await client.channels.fetch(channelId);
      } catch (err: unknown) {
        throw new ClientError(`Unknown channel ${channelId}`, err as string);
      }

      if (!(voiceChannel instanceof VoiceChannel)) {
        throw new ClientError('Specified channel is not a voice channel');
      }
    } else { // Try to get the current voice channel of the caller
      if (message.member == null) {
        throw new ClientError('Command must be sent from a guild channel');
      } 

      voiceChannel = message.member.voice.channel;
      if (voiceChannel == null) {
        throw new ClientError(
          'You are not currently in a voice channel on this server');
      }
    }

    // Don't connect to the same channel twice, and don't stay in two channels
    // at the same time
    if (this.connection != null) {
      if (this.connection.channel.id === voiceChannel.id) {
        throw new ClientError('Already connected to the same voice channel');
      } else {
        this.disconnect();
      }
    }

    try {
      this.connection = await voiceChannel.join();
      indicateSuccess(message);
    } catch (err: unknown) {
      throw new ClientError('Could not connect to voice channel', err as string);
    }
  }

  // Leaves the current voice channel, if any
  public async vleave(flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
    if (this.disconnect()) {
      indicateSuccess(message);
    }
  }

  // Plays an audio track in the current voice channel (referenced by emoji)
  public async vplay(flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
    await this.playTrack(flagsAndArgs.args[0]);
  }

  private async playTrack(key: string): Promise<void> {
    if (!this.trackMap.hasOwnProperty(key)) {
      throw new ClientError('Unknown audio track');
    }
    
    const fileName = this.trackMap[key];
    const trackPath = 'data/music/' + fileName;

    // Confirm that the file exists (dispatcher will fail gracefully if it
    // doesn't, but we want to inform the user)
    try {
      await stat(trackPath);
    } catch (err: unknown) {
      throw new ClientError('Requested audio file not found: ' + fileName);
      log(err as string);
      return;
    }

    // Final check that connection exists and nothing else is playing
    if (this.connection == null) {
      throw new ClientError('Not connected to a voice channel');
    }

    const dispatcher = this.connection.play(trackPath);
    dispatcher.on('error', (err: Error) => {
      log(err.toString());
    });
    console.log(`Playing audio: ${trackPath}`);
  }

  public async board(flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
    if (this.activeSoundboards >= MAX_ACTIVE_SOUNDBOARDS) {
      throw new ClientError(
        'Too many active soundboards; max is ' + MAX_ACTIVE_SOUNDBOARDS);
    }
    this.activeSoundboards++;

    try {
      await this.boardInternal(message);
    } finally {
      this.activeSoundboards--;  
    }
  }

  private async boardInternal(message: Message): Promise<void> {
    const boardMsgText = buildSoundboardMessage(this.trackMap);
    const boardMsg =
      await message.channel.send(boardMsgText + '\n\n*Initializing...*');

    // React with each track's emoji
    const reactPromises: Array<Promise<MessageReaction>> = [];
    for (const emoji in this.trackMap) {
      reactPromises.push(boardMsg.react(emoji));
    }
    try {
      await Promise.all(reactPromises);
    } catch (err: unknown) {
      log('Failed to react with one or more emojis: ' + err as string);
    }

    const filterFunc = (reaction: MessageReaction) => {
      return this.trackMap.hasOwnProperty(reaction.emoji.name);
    };
    const collector = boardMsg.createReactionCollector(
      filterFunc, { idle: HOUR_MS, dispose: true });

    // Play on both emoji add and remove (as both indiciate a "click");
    const playTrackFunc = async (reaction: MessageReaction) => {
      try {
        await this.playTrack(reaction.emoji.name);
      } catch (err: unknown) {
        if (err instanceof Error) {
          logClientError(message, err.message);
	} else {
          logClientError(message, 'Failed to play track');
	  log(err as string);
	}
      }
    };
    collector.on('collect', playTrackFunc);
    collector.on('remove', playTrackFunc);

    // Ready state
    await boardMsg.edit(
      boardMsgText + '\n\n**Ready.** '
      + 'This soundboard will time out after an hour with no interactions.');
    await awaitCollectorEnd(collector);

    // Cleanup
    await boardMsg.edit(
      boardMsgText + '\n\n**This soundboard has timed out**');
    try {
      // May fail if bot doesn't have a role w/ "Manage Messages" privilege
      await boardMsg.reactions.removeAll();
    } catch (err: unknown) {
      log(err as string);
    }
  }

  private disconnect(): boolean {
    if (this.connection != null) {
      this.connection.disconnect();
      this.connection = null;
      return true;
    }

    return false;
  }
}
