# 8-Bit Sports Network

Play *Tecmo Super Bowl 2026* or the original *Tecmo Super Bowl* with a network-style broadcast package fed from live game memory. 

Gather around the TV and let the trash talking commence!

**Note:** 8BSN does not provide the Tecmo Super Bowl ROM files nor does it advise how to obtain them.

## Features

- Mesen libretro core compiled to WebAssembly
- Scorebug with extracted team helmets, possession football, clock and down and distance
- Broadcast view shows replay, last play result, or an All 22 view depending on what happened
- Rushing and passing stats 
- Offensive and Defensive Stats
- Instant replays of big plays from real game footage
- Replay draws path behind the runner, with air yards and YAC
- Play of the drive replay of the best play after a touchdown drive
- Starting lineups ticker on each team's first possession
- Around the league ticker with real NFL scores of the week from ESPN
- Save states with a sidecar of everything the broadcast tracked
- Original ROM restores the names the NFLPA kept out (Jim Kelly, Bernie Kosar, Randall Cunningham), spells out shortened names and uses 1991 team colors

## Controls

| Gamepad        | Player 1 Keyboard   | Player 2 Keyboard  |
|----------------|---------------------|--------------------|
| D-pad          | Arrows              | W A S D            |
| A / B          | X / Z               | K / J              |
| Start / Select | Enter / Right Shift | Space / Left Shift |

Gamepads work on the standard mapping.

| Broadcast                     | Pad     | Key             |
|-------------------------------|---------|-----------------|
| Previous / next stats page    | L1 / R1 | `[` / `]`       |
| Replay last play, skip replay | R2      | `\`             |
| Restart the All 22            | L2      | `'`             |
| Skip replay                   |         | Backspace       |
| Save state 1 to 4             |         | Option + 1 to 4 |
| Load state 1 to 4             |         | 1 to 4          |
| Change ROM                    |         | R               |
| Fullscreen                    |         | F               |
| Force the stats package       |         | P               |

## Broadcast packages

8BSN is split into a game-agnostic network and broadcast packages. The network runs the emulator, ROMs, save states, input, the league ticker, the replay lead-in and the 8BSN branding. A package reads one game's memory and draws that game's broadcast. Tecmo Super Bowl is the first package.

### Folder layout

| Folder              | What lives there                                                   |
|---------------------|--------------------------------------------------------------------|
| `src/`              | The network. It never names a sport or a game.                     |
| `src/sdk/`          | The contract packages build against, imported as `@8bsn/sdk`       |
| `src/packages/`     | The registry that lists the bundled packages                       |
| `packages/tsb/`     | The Tecmo Super Bowl package: game reading, slots, tailgate, tools |
| `tools/headless.ts` | Runs the core without a browser, for package tools and node tests  |

A package default-exports a `BroadcastPackage` from its `index.ts`. It names the ROMs it supports by sha1, provides a `useSession` hook that turns emulator frames into its own game state and a phase, and fills slots. Package code imports only `react`, `react/jsx-runtime`, `@8bsn/sdk`, `@8bsn/sdk/core` (worker files only), `@8bsn/sdk/testing` (test files only) and files in its own folder.

### Slots

Every slot class is optional.

| Slot       | What it is                                                                |
|------------|---------------------------------------------------------------------------|
| Scorebug   | One component over the game                                               |
| Pregame    | What plays between team select and the start of the game                 |
| Moments    | Replays and graphics that take turns in the top box, with replay lead-ins |
| Stats      | Cards in the bottom box, paged by the viewer                              |
| Left panel | Entries with conditions, plus a fallback for when none applies            |
| Tickers    | Conditional crawls that replace the league scores while they hold         |
| Breaks     | Screens for stoppages in play                                             |
| Postgame   | What shows after the game's own end screen                                |

### Layout

The package reports a phase: `menus`, `pregame`, `live`, `window` or `break`. The layout gives the game picture a position and size for each phase, and places each region with a rect and the phases it shows in. The regions are `top`, `replay`, `stats`, `left`, `ticker`, `scorebug` and `watermark`. The default layout opens the top box, the bottom box and the left panel together during `window`, with the ticker underneath. A package may supply its own layout.

### Controls

The network keys are fixed: `[`, `]`, `\`, Backspace, `'`, P, F, R, Escape and 1 to 4, with and without Option. The network pad defaults are L1 and R1 for stats pages, L2 to restart and R2 to replay. A package may remap those pad buttons and add its own actions on other pad buttons and keys.

### Tailgate

A package that supplies a tailgate gets a button on the start screen with its own label. It says how to start a COM vs COM game, when and how long to hold the action so its graphics can show, and when the game is over. The network pauses and resumes the emulator, mutes input, shows the leave modal and loops into the next game.

### Coming in Part 2

Part 2 will add loading packages from files and from contributors' repositories.

## License

GPL-3.0. Mesen is GPL-3.0. No ROM is included.
