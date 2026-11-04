# AGENTS.md — working on this codebase as an agent

Read this before editing. Single-file game; everything lives in `src/main.ts`.

## Do not

- Do **not** round `stamina` every frame. It's a **float internally**; only round
  it for the HUD bar. Rounding each frame kills the sub-unit accumulation and
  stamina appears stuck / moves super slowly.
- Do **not** assume the default `ssh`/`git` will use the GitHub key — it doesn't.
  `~/.ssh/config` forces `identityfile` + `IdentitiesOnly yes` for `github.com`.
  If a push fails auth, that config is why (and why the manual `-i` works).

## Commands

```bash
npm install      # deps
npm run dev      # vite dev server (http://localhost:5173)
npm run build    # production bundle -> dist/
node test/harness.test.mjs   # DOM/WebGL mock: scene + HUD + pointer-lock
node test/logic.test.mjs     # game rules (cash, RAM, win/lose)
node test/sam.test.mjs       # Sam chase pathing
```

Tests import the **built** bundle from `dist/assets/`, so run `npm run build`
before relying on test output. `dist/` and `node_modules/` are gitignored.

## Architecture (single file, ~700 lines)

- `src/main.ts` — maze gen (recursive backtracker), collision, pickup logic,
  BFS chase AI for Sam, stamina, Web Audio proximity sound, main loop.
- `index.html` — page + HUD (RAM bar, stamina bar, cash, Sam proximity hint).
- `public/assets/sam.mp3` — Sam proximity sound. **Replace with a real clip**;
  the game fetches `/assets/sam.mp3` and loops it positionally.

## Stamina

- Float `0..100`; displayed as integer. Drains `STAMINA_SPRINT_DRAIN`/s while
  sprinting, regenerates `STAMINA_REGEN`/s otherwise.
- At `0`, `exhausted` locks sprint until stamina recovers to
  `STAMINA_RECOVER_THRESHOLD` (30). Reset both on `resetGame()`.

## Audio (positional)

- `initSamSound()` runs on the "Click to Enter" gesture (autoplay policy).
- `PannerNode` sits on Sam; `AudioContext` listener sits on the camera → distance
  attenuation + stereo pan give positional sound for free. Falls back to silent
  if Web Audio or the clip is missing. Tune `SAM_PROX_MAX` for range.

## Pushing to GitHub

Repo name: `backrooms-game`. Auth via SSH key (registered to `artemius466`).
If a push hangs or fails auth, run `ssh -T git@github.com` to confirm.
