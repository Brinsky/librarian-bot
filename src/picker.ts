import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from './command';
import { randomInt, shuffle, splitMessage } from './util';

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

    let output = '';
    if (doShuffle) {
      shuffle(args);
      output = `I picked ${args.join(', ')}`;
    } else {
      const pickedIndex = randomInt(0, args.length);
      output = `I picked ${args[pickedIndex]}!`;
    }

    const chunks = splitMessage(output);
    await interaction.reply({ content: chunks[0] });
    for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({ content: chunks[i] });
    }
  }
};
