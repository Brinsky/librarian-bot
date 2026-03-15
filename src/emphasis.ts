import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from './command';
import { splitMessage } from './util';

const MAX_OUTPUT_SENTENCES = 30;

export const emphasis: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('emphasis')
    .setDescription('Repeats a sentence, moving the emphasis to each word in turn')
    .addStringOption(option =>
      option.setName('sentence')
        .setDescription('The sentence to emphasize')
        .setRequired(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const text = interaction.options.getString('sentence', true);

    const words = text.split(/\s+/).filter(word => word.length > 0);

    if (words.length === 0) {
      await interaction.reply({ content: 'Please provide a valid sentence.' });
      return;
    }

    const emphasizedSentences: string[] = [];
    const limit = Math.min(words.length, MAX_OUTPUT_SENTENCES);
    for (let i = 0; i < limit; i++) {
      const sentenceWords = [...words];
      sentenceWords[i] = `*${sentenceWords[i]}*`;
      emphasizedSentences.push(sentenceWords.join(' '));
    }

    const output = emphasizedSentences.join('\n');
    const chunks = splitMessage(output);
    
    await interaction.reply({ content: chunks[0] });
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i] });
    }
  }
};
