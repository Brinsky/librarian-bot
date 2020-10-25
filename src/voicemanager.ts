import {Client, Message, Snowflake, VoiceChannel, VoiceConnection} from 'discord.js'
import {FlagsAndArgs} from './command'
import {ClientError, indicateSuccess, logClientError, logError} from './error'
import {promisify} from 'util'
import * as fs from 'fs'

const stat = promisify(fs.stat);

interface TrackMap {
  [key: string]: string;
}

export default class VoiceManager {
  private connection: null|VoiceConnection = null;
  private trackMap: TrackMap;

  public constructor() {
    // Okay to do synchronously as this constructor should be called during
    // program startup
    this.trackMap =
      JSON.parse(
        fs.readFileSync('data/soundboard.json').toString()) as TrackMap;
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
      } catch (err) {
        throw new ClientError(`Unknown channel ${channelId}`, err);
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
    } catch (err) {
      throw new ClientError('Could not connect to voice channel', err);
    }
  }

  // Leaves the current voice channel, if any
  public async vleave(flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
    if (this.disconnect()) {
      indicateSuccess(message);
    }
  }

  // Plays an audio track in the current voice channel
  public async vplay(flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
    const key = flagsAndArgs.args[0];

    if (this.connection == null) {
      throw new ClientError('Not connected to a voice channel');
    }

    // TODO: Remove this and implement queueing
    // Dispatcher property only becomes null once audio track ends
    if (this.connection.dispatcher != null) {
      throw new ClientError('Already playing audio');
    }

    if (!this.trackMap.hasOwnProperty(key)) {
      throw new ClientError('Unknown audio track');
    }

    const trackPath = `data/music/${this.trackMap[key]}`;

    // Confirm that the file exists (dispatcher doesn't seem to throw an error
    // when it doesn't)
    try {
      await stat(trackPath);
    } catch (err) {
      logClientError(
        message, `Requested audio file not found: ${this.trackMap[key]}`);
      logError(err);
      return;
    }

    console.log(`Playing audio: ${trackPath}`);
    const dispatcher = this.connection.play(trackPath);
    dispatcher.on('error', (err: Error) => {
      logClientError(message, err.toString());
    });
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
