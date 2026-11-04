# BACKROOMS: Grab your $20 before Sam Altman drains you

A tiny first-person maze game built with Three.js. You wake up in the backrooms
with **64 GB of RAM**. Collect **$20.00** scattered across the maze to buy an
**RTX 3090** and escape — but **Sam Altman** is hunting you. Every time he tags
you he steals **2 GB of your RAM**. Hit **0 GB** and it's game over.

Run with **Shift** to get away from him, but sprinting burns **stamina** — and
once you're exhausted you have to walk it back before you can sprint again.

## The joke

Sam Altman publicly dismissed local / on-device AI, quipping that it's
*"quite unfortunate that people have so much RAM in their computers."*

So the entire point of this game is that **he was wrong**. This game — the art,
the code, the maze generation, the chase AI, and every commit — was generated
end-to-end by **local AI running on my own PC's VRAM and RAM**. No cloud. No
API calls. Just me, a local model, and "too much" RAM, exactly like Altman
predicted it would be useless for.

## How to play

- **WASD** — move
- **Mouse** — look
- **Shift** — sprint (burns stamina)
- **Esc** — release the mouse

Collect all the cash, buy the RTX 3090, and escape before Sam drains your RAM.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default `http://localhost:5173`) and click to
enter.

## Build for production

```bash
npm run build
```

## Tech

- [Three.js](https://threejs.org/) — rendering, pointer-lock camera
- [Vite](https://vitejs.dev/) — dev server + bundling
- TypeScript
- Web Audio API — positional Sam-proximity sound

## Structure

```
backrooms-game/
├── src/main.ts     # everything: maze, collision, chase AI, HUD, loop
├── index.html      # page + HUD
├── public/assets/  # Sam proximity sound clip (replace sam.mp3 with your own)
├── test/           # Node tests for the game logic
└── package.json
```

## Testing

The logic is tested in plain Node (no browser needed):

```bash
node test/harness.test.mjs
node test/logic.test.mjs
node test/sam.test.mjs
```

## For humans who want to contribute / for agents

See [AGENTS.md](./AGENTS.md) for how to work on this codebase as a coding agent.
