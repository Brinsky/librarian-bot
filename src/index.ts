import {Client} from 'discord.js'
import config from './config.json'

const client = new Client();

/////////// Event-handling code ///////////

client.on('ready', (): void => {
    console.log('I am ready!');
});

client.on('message', (message): void => {
});

// Print error events to stderr
client.on('error', console.error);

/////////// Startup code ///////////

client.login(config.token);
