import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from './command';
import { randomInt, shuffle } from './util';

export const picker: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('picker')
    .setDescription('Randomly pick an option from a list')
    .addStringOption(option =>
      option.setName('options')
        .setDescription('Space separated list of options')
        .setRequired(true))
    .addBooleanOption(option =>
      option.setName('shuffle')
        .setDescription('Shuffle and return all options completely')
        .setRequired(false)),
  async execute(interaction: ChatInputCommandInteraction) {
    const text = interaction.options.getString('options', true);
    const doShuffle = interaction.options.getBoolean('shuffle') ?? false;

    const args = text.split(/\s+/).filter(s => s.length > 0);
    if (args.length === 0) {
      await interaction.reply({ content: 'No options provided!' });
      return;
    }

    if (doShuffle) {
      shuffle(args);
      await interaction.reply(`I picker ${args.join(', ')}`);
    } else {
      const pickedIndex = randomInt(0, args.length);
      await interaction.reply(`I picker ${args[pickedIndex]}!`);
    }
  }
};
