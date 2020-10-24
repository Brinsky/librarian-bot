import {Client, Message, Snowflake, VoiceConnection} from 'discord.js'
import {FlagsAndArgs} from './command'
import {ClientError, indicateSuccess} from './error'

export default class VoiceManager {
  private connection: null|VoiceConnection = null;

  public constructor() {}

  // Prompts the bot to join a voice channel
  public async vjoin(flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
    if (message.member == null) {
      throw new ClientError('Command must be sent from a guild channel');
    } 

    const voiceChannel = message.member.voice.channel;
    if (voiceChannel == null) {
      throw new ClientError(
        'You are not currently in a voice channel on this server');
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
  public async vplay(): Promise<void> {
    if (this.connection == null) {
      throw new ClientError('Not connected to a voice channel');
    }

    // TODO: Remove this and implement queueing
    // Dispatcher property only becomes null once audio track ends
    if (this.connection.dispatcher != null) {
      throw new ClientError('Already playing audio');
    }

    const dispatcher = this.connection.play('http://www.sample-videos.com/audio/mp3/wave.mp3');
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
