import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js'
import { ClientError, logClientError, log } from './error'
import { SlashCommand } from './command'
import { emojify, utf } from './emojifier'
import Sealer from './sealer'
import { picker } from './picker'
import { emphasis } from './emphasis'
import { Aggregators, EventType } from './aggregator'
import VoiceManager from './voicemanager'
import * as fs from 'fs'

interface Config {
  token: string;
  prefix: string;
  testGuildId?: string;
}

// Will be overwritten from file at init() time
let config: Config = {
  token: '',
  prefix: '',
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
  ],
});
const sealer = new Sealer();
const aggregators = new Aggregators();
const voiceManager = new VoiceManager();

const slashCommands = new Collection<string, SlashCommand>();

const commandsList: SlashCommand[] = [
  emojify,
  utf,
  sealer.sealCommand,
  sealer.unsealCommand,
  sealer.voteCommand,
  sealer.listCommand,
  picker,
  emphasis,
  aggregators.aggregateCommand,
  voiceManager.vjoinCommand,
  voiceManager.vleaveCommand,
  voiceManager.vplayCommand,
  voiceManager.boardCommand
];

for (const cmd of commandsList) {
  slashCommands.set(cmd.data.name, cmd);
}

/////////// Event-handling code ///////////

client.on('messageReactionAdd', async (reaction, user) => {
  aggregators.handleEvent(reaction.message.channel.id, {
    msgId: reaction.message.id,
    eventType: EventType.ADD_EMOJI,
    emoji: reaction.emoji.toString(),
  });
});

client.on('messageReactionRemove', async (reaction, user) => {
  // We re-fetch the message so that we have the latest set of reactions
  // (which excludes the one being removed here)
  const message = reaction.message.partial
    ? await reaction.message.fetch() : reaction.message;

  const matchingReaction = message.reactions.cache.find(
    (r) => r.emoji.toString() === reaction.emoji.toString());
  if (matchingReaction === undefined || matchingReaction.users.cache.size == 0) {
    aggregators.handleEvent(message.channel.id, {
      msgId: message.id,
      eventType: EventType.REMOVE_EMOJI,
      emoji: reaction.emoji.toString(),
    });
  }
});

client.on('messageDelete', async (message) => {
  // Fetching the message would result in an 'unknown message' API error

  const channel = message.channel;
  log(`messageDelete event: Message ID = ${message.id}, Channel ID = ${channel?.id}`);

  if (channel != null) {
    aggregators.handleEvent(channel.id, {
      msgId: message.id,
      eventType: EventType.DELETE_MSG,
      emoji: '',
    });
  }
});

client.once('clientReady', async () => {
  log('I am ready!');
  try {
    // Register commands globally or to the test guild
    const commandsData = commandsList.map(c => c.data.toJSON ? c.data.toJSON() : c.data);
    if (config.testGuildId) {
      log(`Registering slash commands to test guild: ${config.testGuildId}`);
      await client.application?.commands.set(commandsData, config.testGuildId);
    } else {
      log('Registering slash commands globally...');
      await client.application?.commands.set(commandsData);
    }
    log('Slash commands registered successfully.');
  } catch (error) {
    log('Failed to register slash commands.');
    console.error(error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = slashCommands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (err: unknown) {
    if (err instanceof ClientError) {
      if (interaction.replied || interaction.deferred) {
        // If the command already successfully replied, OR if it called deferReply()
        // to buy more time, we can no longer use .reply().
        // We MUST use .followUp() to send the error message.
        await interaction.followUp({ content: err.message }).catch(console.error);
      } else {
        // If the command crashed instantly before doing anything,
        // the interaction hasn't been acknowledged yet.
        // We MUST use .reply() to acknowledge it and show the error.
        await interaction.reply({ content: err.message }).catch(console.error);
      }
      if (err.internalMessage != null) {
        log(err.internalMessage);
      }
    } else {
      const msg = 'Failed to execute command due to an internal error';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg }).catch(console.error);
      } else {
        await interaction.reply({ content: msg }).catch(console.error);
      }
      log(err as string);
    }
  }
});

/////////// Startup code ///////////

function init(): void {
  try {
    config =
      JSON.parse(fs.readFileSync('data/config.json').toString()) as Config
  } catch (err: unknown) {
    log('Failed to read configuration file; shutting down');
    return;
  }

  // Print error events to stderr
  client.on('error', console.error);
  process.on('uncaughtException', console.error);
  process.on('unhandledRejection', console.error);

  client.login(config.token);
};

init();
