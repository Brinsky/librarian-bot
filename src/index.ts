import {Client} from 'discord.js'
import config from './config.json'
import {lex} from './lexer'

const client = new Client();

/////////// Event-handling code ///////////

client.on('ready', (): void => {
    console.log('I am ready!');
});

client.on('message', (message): void => {
    let text = message.content;

    // Only process commands with the appropriate prefix
    if (!text.startsWith(config.prefix)) {
        return;
    }

    // Process the text using the lexer
    text = text.slice(config.prefix.length);
    let tokens = lex(text);
    const command = tokens[0].text;
    tokens = tokens.slice(1);

    console.log('Command: ' + command);
    console.log(tokens);

});

// Print error events to stderr
client.on('error', console.error);

/////////// Startup code ///////////

client.login(config.token);
