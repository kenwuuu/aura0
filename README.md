# Aura - The Fastest P2P App for Playing MTG

A serverless web app for playing cards built on React, Tailwind, shadcn, WebRTC, and Yjs.

## How to Play

### Starting a Game

1. Open [Aura](https://aura0.app) in your browser
2. Share the full URL (including `?room=...`) with other players
3. Player connection status should show in the top right

### Quick Summary

- **Default STUN servers** are pre-configured (Google, Twilio)
- **Default signaling servers** are pre-configured (Yjs public servers)
- Works out-of-the-box for most home networks
- For production or restrictive networks, set up your own TURN server

## Contributing

Want to help? Head over to the [Discord](https://discord.gg/PgH2gVZYKq) first to see what
we're working on. But if you just have a small fix, go ahead and submit a PR.

### Prerequisites

Before running the application, you need:

1. **Node.js** (v18 or higher)

### Installation

Google how to install `npm`. Then in project root:

```bash
npm install
```

## Running the Application

### Development

```bash
npm run dev
```

This starts the dev server, it has hot reload and connects games directly to 
prod instances. 

### Testing changes

Before submitting code, run our tests. We use Playwright for browser
automation and vitest for unit tests.

```bash
vitest
```

```bash
playwright test
```

If everything passes, submit your code for a code review!

### Production Build

```bash
npm run build
npm run preview
```

#### Websocket server

##### Pinging websockets to test connection
```bash
wscat -c ws://3.151.83.118:47964
wscat -c wss://ws.aura.app
```

##### Setting up websocket server

We use PM2 to handle websocket server restarts on crashes.

For EC2:

```bash
# clone this repo
git clone https://github.com/kenwuuu/aura.git
cd aura

# install nvm, check their github for latest version
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc  # load nvm into current shell session
nvm install --lts  # install latest lts version of node
npm i
pm2 start networking/websocket/ecosystem.config.cjs  # run server with pm2
```

## Thanks To...
Andrew Gioia's [Mana](https://github.com/andrewgioia/mana) project on GitHub for icons and symbol SVGs.
