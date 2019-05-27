import Datastore from 'nedb-promises'
import {Message} from 'discord.js'
import {FlagsAndArgs} from './command'
import {logError, logClientError} from './error'

interface Envelope {
  readonly author: string;
  readonly title: string;
  readonly content: string;
  readonly time: Date;
}

/** Performs creation and management of sealed envelopes. */
export default class Sealer {
  private database: Datastore;

  public constructor() {
    this.database = Datastore.create({
      filename: 'data/sealedenvelopes',
      autoload: true,
    });

    this.database.insert
  }

  public async seal(flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
    const [title, content] = flagsAndArgs.args;

    if (title.length > 20) {
      logClientError(message, 'Title length exceeds 20 characters');
      return;
    }

    // Ensure the author doesn't already own an envelope with the same name
    try {
      const envelope = await this.getFirstMatch(message.author.id, title);
      if (envelope) {
        logClientError(
          message, `Envelope with title "${title}" already exists`);
        return;
      }
    } catch (err) {
      logClientError(message, 'Error while accessing database');
      logError(err);
      return;
    }

    try {
      await this.database.insert({
        author: message.author.id,
        title: title,
        content: content,
        time: new Date(),
      });
    } catch(err) {
      logClientError(message, 'Unable to write envelope to database');
      logError(err);
    }
  }

  public async unseal(flagsAndArgs: FlagsAndArgs, message: Message): Promise<void> {
    const title = flagsAndArgs.args[0];

    let envelope: Envelope|null;
    try {
      envelope = await this.getFirstMatch(message.author.id, title);
    } catch (err) {
      logClientError(message, 'Error while accessing database');
      logError(err);
      return;
    }

    if (envelope) {
      message.channel.send(`Unsealing "${envelope.title}" from `
          + `${envelope.time}:\n${envelope.content}`);
    } else {
      logClientError(
        message, `No envelope found with title "${title}"`);
    }
  }

  private async getFirstMatch(authorId: string, title: string): Promise<Envelope|null> {
    const envelopes: Envelope[] = await this.database.find({
      author: authorId,
      title: title,
    });

    return envelopes.length > 0 ? envelopes[0] : null;
  }
}
