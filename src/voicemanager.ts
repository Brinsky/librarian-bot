import { Client, Message, MessageReaction, Snowflake, VoiceChannel, SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js'
import {
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice'
import { SlashCommand } from './command'
import { ClientError, logClientError, log } from './error'
import { promisify } from 'util'
import * as fs from 'fs'
import { awaitCollectorEnd } from './util'

const EVENT_TIMEOUT_MS = 5000;
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
  private connection: null | VoiceConnection = null;
  private channelId: null | Snowflake = null;
  private player = createAudioPlayer();
  private activeSoundboards = 0;
  private trackMap: TrackMap;

  public constructor() {
    // Okay to do synchronously as this constructor should be called during
    // program startup
    this.trackMap =
      JSON.parse(fs.readFileSync('data/soundboard.json').toString()) as TrackMap;
  }

  public readonly vjoinCommand: SlashCommand = {
    data: new SlashCommandBuilder()
      .setName('vjoin')
      .setDescription('Have the bot join a voice channel')
      .addChannelOption(option =>
        option.setName('channel')
          .setDescription('Voice channel ID to join')
          .setRequired(false)),
    execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
      let voiceChannel;
      const channelOption = interaction.options.getChannel('channel');

      if (channelOption) {
        try {
          const fetchedChannel = await client.channels.fetch(channelOption.id);
          if (!(fetchedChannel instanceof VoiceChannel)) {
            throw new ClientError('Specified channel is not a voice channel');
          }
          voiceChannel = fetchedChannel;
        } catch (err: unknown) {
          throw new ClientError(`Unknown channel ${channelOption.id}`, err as string);
        }
      } else {
        const member = interaction.member as GuildMember;
        if (!member) {
          throw new ClientError('Command must be sent from a guild channel');
        }

        voiceChannel = member.voice.channel;
        if (voiceChannel == null) {
          throw new ClientError('You are not currently in a voice channel on this server');
        }
      }

      // Don't connect to the same channel twice, and don't stay in two channels
      // at the same time
      if (this.connection != null) {
        if (this.channelId === voiceChannel.id) {
          throw new ClientError('Already connected to the same voice channel');
        } else {
          this.disconnect();
        }
      }

      try {
        this.connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
        this.channelId = voiceChannel.id;
        await interaction.reply({ content: 'Joined voice channel!' });
      } catch (err: unknown) {
        this.disconnect();
        throw new ClientError('Could not connect to voice channel', err as string);
      }
    }
  };

  public readonly vleaveCommand: SlashCommand = {
    data: new SlashCommandBuilder()
      .setName('vleave')
      .setDescription('Have the bot leave the current voice channel'),
    execute: async (interaction: ChatInputCommandInteraction) => {
      if (this.disconnect()) {
        await interaction.reply({ content: 'Left voice channel!' });
      } else {
        await interaction.reply({ content: 'Not currently connected to a voice channel.' });
      }
    }
  };

  public readonly vplayCommand: SlashCommand = {
    data: new SlashCommandBuilder()
      .setName('vplay')
      .setDescription('Have the bot play an audio file from the soundboard in its current voice channel')
      .addStringOption(option =>
        option.setName('emoji')
          .setDescription('Emoji for the track')
          .setRequired(true)),
    execute: async (interaction: ChatInputCommandInteraction) => {
      const emoji = interaction.options.getString('emoji', true);
      await interaction.reply({ content: `Playing ${emoji}` });
      await this.playTrack(emoji);
    }
  };

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

    const subscription = this.connection.subscribe(this.player);
    if (subscription == null) {
      throw new ClientError('Failed to connect audio player');
    }

    this.player.play(createAudioResource(trackPath));
    console.log(`Playing audio: ${trackPath}`);
  }

  public readonly boardCommand: SlashCommand = {
    data: new SlashCommandBuilder()
      .setName('board')
      .setDescription('Display the interactive soundboard'),
    execute: async (interaction: ChatInputCommandInteraction) => {
      if (this.activeSoundboards >= MAX_ACTIVE_SOUNDBOARDS) {
        throw new ClientError(
          'Too many active soundboards; max is ' + MAX_ACTIVE_SOUNDBOARDS);
      }
      this.activeSoundboards++;

      try {
        await this.boardInternal(interaction);
      } finally {
        this.activeSoundboards--;
      }
    }
  };

  private async boardInternal(interaction: ChatInputCommandInteraction): Promise<void> {
    const boardMsgText = buildSoundboardMessage(this.trackMap);
    const boardMsg = await interaction.reply({
      content: boardMsgText + '\n\n*Initializing...*',
      fetchReply: true
    });

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

    const filter = (reaction: MessageReaction) => {
      return reaction.emoji.name != null && this.trackMap.hasOwnProperty(reaction.emoji.name);
    };
    const collector = boardMsg.createReactionCollector(
      { filter, idle: HOUR_MS, dispose: true });

    // Play on both emoji add and remove (as both indiciate a "click");
    const playTrackFunc = async (reaction: MessageReaction) => {
      try {
        if (reaction.emoji.name == null) {
          throw new ClientError('Could not parse react emoji');
        }
        await this.playTrack(reaction.emoji.name);
      } catch (err: unknown) {
        if (err instanceof Error) {
          logClientError(boardMsg, err.message);
        } else {
          logClientError(boardMsg, 'Failed to play track');
          log(err as string);
        }
      }
    };
    collector.on('collect', playTrackFunc);
    collector.on('remove', playTrackFunc);

    // Ready state
    await interaction.editReply(
      boardMsgText + '\n\n**Ready.** '
      + 'This soundboard will time out after an hour with no interactions.');
    await awaitCollectorEnd(collector);

    // Cleanup
    await interaction.editReply(
      boardMsgText + '\n\n**This soundboard has timed out**');
    try {
      // May fail if bot doesn't have a role w/ "Manage Messages" privilege
      await boardMsg.reactions.removeAll();
    } catch (err: unknown) {
      log(err as string);
    }
  }

  private disconnect(): boolean {
    this.channelId = null;
    if (this.connection != null) {
      this.connection.destroy();
      this.connection = null;
      return true;
    }

    return false;
  }
}
