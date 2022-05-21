# librarian-bot
A simple Discord bot for book club.

## Setup

1. If you haven't already, install [git](https://git-scm.com/), [Node.js](https://nodejs.org/en/), [npm](https://www.npmjs.com/), and [g++](https://gcc.gnu.org/onlinedocs/gcc-3.3.6/gcc/G_002b_002b-and-GCC.html) (GCC with C++ support) using your preferred package and/or version manager(s)
3. Follow a tutorial ilke [this one](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token) to create a Discord "application" and a corresponding bot, generate a secret token for it (used below), and add it to your server
4. `git clone https://github.com/Brinsky/librarian-bot`
5. `cd librarian-bot`
6. `cp data/config-sample.json data/config.json`
7. Edit `data/config.json` and set the `token` property to your bot's token
8. `npm install`
9. `npx tsc` (compile the TypeScript source code)
10. Start the server: `node build/index.js`
    - You may prefer to run this in a detached session using e.g. [`screen`](https://www.gnu.org/software/screen/) or [`tmux`](https://github.com/tmux/tmux/wiki)
