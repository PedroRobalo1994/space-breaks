# Space Breaks

[Play the live demo](https://PedroRobalo1994.github.io/space-breaks/)

One paddle. An entire asteroid belt. A little cosmic destruction.

A space-themed brick breaker: bounce the ball off your paddle, smash through 8 sectors of asteroid bricks, chain combos, catch power-ups, and don't let the ball fall into the void. Three hull lives. No downloads, no dependencies — just orbits.

## Play

```sh
cd space-breaks
bun start        # serves at http://localhost:8080
```

On the Tailnet it is also served via Tailscale Serve at
`https://omarchy.tailf216ce.ts.net/` (while this machine is online).

Requires Bun 1.4.2 or newer. No install step is needed: the project has zero dependencies.
Use the server URL rather than opening `index.html` directly so browser modules load correctly.

## Tests

```sh
bun test         # runs all 10 tests across 3 files
```

## Controls

| Action | Input |
|---|---|
| Steer | `←` `→` / `A` `D`, mouse, or touch drag |
| Launch | `Space`, click, tap, or the Launch button |
| Pause | `P` / `Esc` or the Pause button |
| Sound | `M` or the Sound button |

Paddle edges aim the ball — stay above the belt for combo multipliers.

## Power-ups

- **Wide beam** — a bigger paddle for 12 seconds
- **Multiball** — more chaos, same mission
- **Safety net** — one rescue from the void
- **Piercing shot** — pass through bricks for 8 seconds
- **Slow field** — half-speed motion for 8 seconds
- **Sticky paddle** — one catch; tap to release with aim

## Modes

- **Campaign** — 8 sectors, each with its own formation (full belt, checkerboard, diamond,
  gates, pyramid, open ring, drifting lanes, fortress), armored bricks from sector 5,
  boss asteroids on sectors 3 and 6, wormhole pairs from sector 4, drifting fields from sector 6.
- **Daily sector** — a seeded formation per calendar date (fixed Cruise speed) with its own best.
- **Endless drift** — unlocked after victory; procedural sectors scaling +3% speed and +2 bricks
  to a cap, with its own best.

Chain consecutive brick destructions for a ×5 combo multiplier (shown on the HUD arc).

## Details

- Zero runtime dependencies; vanilla HTML + CSS + Canvas + WebAudio.
- Best score persists in `localStorage`; impact effects toggle respects `prefers-reduced-motion`.
- Difficulty: Drift / Cruise / Warp (flight speed picker on the start screen).
- Built with `openrouter/stealth/union-alpha` subagents (engine + visual shell); `opencode-go/union-alpha`
  was attempted for the shell but its streams kept aborting, so the style lane was reassigned.
- Power-ups use hand-drawn SVG icons (`assets/icons/`); each of the 8 sectors flies a distinct
  brick formation (full belt, checkerboard, diamond, gates, pyramid, open ring, drifting lanes,
  fortress — 30 to 46 bricks).
