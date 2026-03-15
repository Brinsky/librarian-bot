import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client
} from 'discord.js';

export interface SlashCommand {
  data: SlashCommandBuilder | ReturnType<SlashCommandBuilder['toJSON']> | any;
  execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void>;
}
