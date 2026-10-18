# TSB 2026 memory map

ROM: `Tecmo Super Bowl 2026.nes`, SHA-1 `25ab46078b26380cab04bac01bf9b1c5a2efa432`, 0x80010 bytes (32-team CXROM v1.05 layout).
Code: `src/game/maps/tsb2026.ts` (`TSB2026_MAP`, `ROUTES_ENABLED`, `LIVE_DETECTION`), `src/game/roster.ts` (`parseRoster`).

## Routes

**GO.** `ROUTES_ENABLED = true`.

Three different P1 pass plays were traced frame by frame (all 11 offensive slots, integer X 16-bit and integer Y):

| Trace script | Play call ($78) | Snap frame | Ball thrown ($71 = 2C) | Over ($71 = AC) | Slots that moved | Max step per frame |
|---|---|---|---|---|---|---|
| `trace-a-route-1.json` | 04 (UP+B) | 3171 | 3277 | 3453 | 11 of 11 | 4 units |
| `trace-a-route-2.json` | 05 (LEFT+B) | 18502 | 18590 | 18986 | 11 of 11 | 4 units |
| `trace-b-route-3.json` | 06 (RIGHT+B) | 4159 | 4266 | 4309 | 11 of 11 | 7 units |

PNGs: `a-route-1.png`, `a-route-2.png`, `b-route-3.png` (dumped at the end of each window). 8 units = 1 yard, so the largest per-frame step is under a yard: no teleports while `snapped` is set and `over` is clear.

After `over` the players do not freeze on the same frame: they decelerate smoothly for up to about 90 frames (route 1: last smooth motion at over+83; route 2: over+91), then every slot jumps to a new formation spot on the frame the play status clears to 00 (route 1 at over+83, route 3 at over+76). A route overlay must stop sampling on the `over` frame; it must not wait for motion to stop.

Further support from the exploration runs (two full autoplayed games, 33 + 6 passing plays): every pass play showed per-frame steps of 7 units or fewer between snap and over.

## Live detection

**GO, with one rule the decoder must apply.** `LIVE_DETECTION = true`.

`live = (playStatus & snapped) && !(playStatus & (over | touchdown))`.

Every play in both recorded games was checked from the frame `snapped` (0x04) rises:

* Game A (`fixtures-game-a.json` inputs): 50 runs, 31 passes, 5 kicks ended with `over` (0x80) set. The 2 touchdown plays never set `over`: status went `0C 4C 2C 3C 00` (touchdown 0x10 set, then cleared straight to 00 for the try). Frames: Browns TD snap 11180, touchdown bit 11366, cleared 12012 (`trace-a-touchdown.json`); Bills TD snap 55084, touchdown bit 55255.
* Game B (`fixtures-game-b.json` inputs): 114 runs, 6 passes, 3 kicks, all ended with `over`; no touchdowns.

So by the literal test in the brief (`snapped` and `over` bracket every play) the two touchdown plays fail; with `over OR touchdown` as the closing edge, all 211 plays are bracketed. The human partner should confirm this reading before Task 15.

## Field values and evidence

All frame numbers are absolute frames since power-on in the given script. "Exploration" means the scratch autoplayer logs that produced the committed input recordings (the replays through `tools/headless.ts` matched them frame for frame).

| Field | Value | Evidence |
|---|---|---|
| `gameStatus` | RAM `$0007` | Task 1 status byte of the game's task scheduler (disassembly `zero_page_variables.asm`: tasks at `$02 + 5n`, slot 1 is the gameplay/playcall task). Values: 00 on title, menus, team select, coin toss (`title.png`, `team-select.png`); 11 or 12 throughout play (`kickoff`, every play-select and on-field fixture); 03 at the quarter-break scoreboard, at halftime and after the final whistle (`halftime.png`; `trace-a-quarter.json` frames 17398 to 17495; `trace-a-halftime.json` 29504 to 29939; `trace-b-overtime.json` 59241 to 59735). |
| `inGameValues` | `[0x11, 0x12, 0x13, 0x14]` | 11 and 12 observed; 13 (waiting) and 14 (created) are the other active task states in the disassembly. |
| `playStatus` | RAM `$71` | `trace-a-touchdown.json`, `trace-a-sack.json`, `trace-a-interception.json`, route traces. |
| `bits.over` | 0x80 | Set when the whistle blows: 3453 (route 1), 23576 (sack), 27173 (interception). |
| `bits.touchdown` | 0x10 | 11366: `2C` to `3C` on the same frame the score went 0 to 6. |
| `bits.snapped` | 0x04 | Set on the A press that snaps: 3171, 11180, 23365, 26869. Set on the kicker's approach for kickoffs (frame 2389 exploration). |
| `bits.kicked` | 0x02 | Kickoff: `04` then `06` when the ball is kicked (2436 in the first exploration, 59853 in `trace-b-overtime.json`). |
| `bits.sack` | 0x01 | `CC` to `CD` at 23607 (`trace-a-sack.json`), banner "QB SACK! MALIEK COLLINS". |
| (pass attempted) | 0x20 | 4C to 2C when the ball is thrown; 0x40 is set from the snap of a pass play until the throw. |
| `quarter` | RAM `$76`, 0-based, 4 = overtime | 0 to 1 at 17399 (`trace-a-quarter.json`), 1 to 2 at 29505 (halftime), 3 to 4 at 59338 (`trace-b-overtime.json`, "OVER TIME" screen). The game's own screen shows "5 QTR" in overtime (`overtime.png`). |
| `down` | RAM `$77`, 0-based | `third-and-long.png` shows "3 DOWN 16" with `$77 = 02`; `first-down.png` "1 DOWN 10" with 00. |
| `clockSeconds` / `clockMinutes` | RAM `$6A` / `$6B` | `trace-a-clock.json`: 5:00 to 4:59 at 2669 writes `$6A = 0x59`, `$6B = 0x04`. |
| `clockBcd` | true | Same trace: seconds run 59, 58, 57 as 0x59, 0x58, 0x57. Preseason quarters are 5:00. |
| `teamIds` | RAM `$6C` (P1), `$6D` (P2) | `kickoff.ram`: 00 (BUF), 05 (CLE). `trace-team-ids-arizona.json`: P2 picks Arizona, `$6D = 33` (`team-ids-arizona.png` shows "ARIZONA CARDINALS"). Probes in exploration: KC 13, DAL 19. The id is the index into the ROM team tables; the four added teams are 30 SF, 31 LAR, 32 SEA, 33 ARZ, and 28/29 are the AFC/NFC slots. |
| `offense` | RAM `$70` (POSSESSION_STATUS), mask `offenseP2Mask = 0x80` | See "Offense" below. |
| `scores` | RAM `$0399` (P1 total), `$039E` (P2 total) | 0 to 6 at 11366 (`trace-a-touchdown.json`). Per-quarter bytes at `$0395-$0398` and `$039A-$039D`. Halftime screen "BILLS 2 BROWNS 6" matches `halftime.ram`. |
| `timeouts` | RAM `$8C` (P1), `$8D` (P2), start at 3 | `trace-p1-timeout.json`: P1 picks TIMEOUT, `$8C` 3 to 2 at frame 3776 and the clock stops at 4:26. `trace-a-p2-timeout.json`: P2 on offense picks TIMEOUT, `$8D` 3 to 2 at 6086, clock stops at 3:42. A timeout is only accepted while the game clock is running. |
| `losX` | RAM `$7F-$80`, 16-bit little endian | `third-and-long.ram` `$071D`; sack moves it `$0871` to `$083A` at 23738. |
| `firstDownX` | RAM `$82-$83` | See "First-down marker". |
| `fieldZeroX` / `unitsPerYard` | `$0670` / 8 | Disassembly `DOCS/tecmo_yardline_reference.txt` (0 yd `$0670`, 50 yd `$0800`, 100 yd `$0990`) and `field_locations.asm`. Kickoffs from the 35: P2 kicks from `$0878` (`kickoff.ram`), P1 kicks from `$0788` (frame 29944 and 59736). |
| `fieldSide` | `{ p1AlwaysDefendsLowX: true }` | See "Field side". |
| `players.base` | RAM `$039F` | 22 slots of `$20` bytes (`ram_variables.asm` PLAYER_RAM_START). Slots 0-10 are P1, 11-21 are P2. |
| `players.positionId` | +`$08` | P1 slots hold 00-0A, P2 slots 80-8A (`kickoff.ram`). 0x80 marks P2; low bits: offense QB, RB1, RB2, WR1, WR2, TE, C, LG, RG, LT, RT; defense RE, NT, LE, ROLB, RILB, LILB, LOLB, RCB, LCB, FS, SS. |
| `players.x` | +`$14`, 16-bit little endian, same units as `losX` | X_POS is 3 bytes at +`$13` (fraction, low, high); the disassembly compares `+$14/+$15` with yard lines. Route traces show slot X tracking `losX` at the snap. |
| `players.y` | +`$17`, 8 bits | Y_POS is 2 bytes at +`$16` (fraction, integer); range seen `$19`-`$C6`. |
| `statBlocks` | SRAM `$406` (P1), `$50B` (P2), 261 bytes each | See "Stat blocks". |

### Play select, brightness and the ball carrier

Found by classifying every frame of both recorded games from the screen pixels and ranking RAM bytes against the classes.

* `screenMode` RAM `$0F`, `playSelectMode = 0x13`: `$0F` reads 13 exactly while the play select screen is up, including the 4th-down menu, in both games (game A 6246 select frames, game B 10083), with no stray frames anywhere else. It lags the screen by about 7 frames at both edges (game A: screen 2921 to 3013, `$0F` 2928 to 3021). Other values seen: 17, 16, 80.
* Brightness RAM `$52`: 0 to 15. Every lead-in to play select runs black 14 frames, fade in 1 to 15, select, fade out to 0, black about 10 frames.
* `betweenPlays`: `$71 = 00` with no kickoff pending. `$71` clears to 00 on the first black frame of the lead-in (3537, 4125, ... every span in game A). On punts `$71` stays 00 through the punt formation after play select closes, so the box rule remembers that select has shown.
* `controlled` RAM `$84` (P1) and `$86` (P2): 16-bit pointers to each team's controlled player slot (`$039F + 0x20 * slot`), valid on every live frame. On offense it follows the ball: QB at the snap, the runner on a handoff (3870), the receiver on the catch (8158, 11361). On turnovers the recovering team's pointer jumps to the defender on the same frame bit 6 of `$70` flips (fumble 18893 to P2 LCB, interception 27033 to P1 RCB). Kickoffs: bit 6 flips at the kick, not the catch, and the receiving team's pointer is the returner throughout (slot 10). Punts: bit 6 does not flip during the play and the receiving team's pointer is the returner from the snap (slot 21). The decoder's `carrier` is the receiving team's pointer on kicks and the ball holder's pointer otherwise.
* `bits.thrown` 0x20 on `$71`: set when the ball is thrown and kept to the end of the play, so a thrown pass with no catch is an incompletion.

### Offense

`$6F` (TEAM_ON_OFFENSE in the disassembly) is not the offense in real games: it is a scratch byte used by the simulator and the end-of-game stats drawing. In the fixtures it reads 01 in `sack` (P1 ball) and 00 in `q4` (P2 ball), so it disagrees with the screen; `$70` bit 7 matches the screen in every fixture.

The on-field code uses POSSESSION_STATUS `$70`:

* bit 7 (0x80): the team that started the play (offense for scrimmage plays and punts, receiving team for kickoffs). Values seen with P2 as that team: C3, C7, E7, CB, CF, and 8B (P1 kicks off, P2 receives). With P1: 00, 04, 08, 24, and 48 (P2 kicks off, P1 receives).
* bit 6 (0x40): the team holding the ball right now. On the interception it went E7 to A7 at 27032 (`trace-a-interception.json`) while bit 7 stayed set until the next play.
* low bits: play kind (`$08` kickoff, `$0C` punt, `$10` field goal, `$14` extra point), 0x20 QB has ball, 0x04 pass play.

### Play kind, tries and the ball holder

Evidence from the replay fixture `tests/fixtures/tsb2026/replay-game-a.json.gz` (see "Replay fixture"). Replay frame numbers count frames run since power-on, so they are one more than the trace row numbers above (the interception flip at 27032 is replay frame 27033).

* `playKind.mask = 0x1C` on `$70`: 0x00 and 0x04 scrimmage, 0x08 kickoff, 0x0C punt, 0x10 field goal, 0x14 extra point. Bits 0-1 carry something else (C3, C7, E7 on scrimmage plays).
* Punts: `$70 = 0C` from the 4th-down menu through the P1 punt (snap 4954, `$71` 04 then 84, cleared 5377); `$70 = CF` before the P2 punt at 17695. The punt never sets `bits.kicked` (0x02), and bit 7 is the punting team.
* Kickoffs keep kind 0x08 after the return ends: `$70 = 08` from the kick (2482) until two frames after the next scrimmage snap (3172 to 3174). Before the kick bit 6 (kicking team) differs from bit 7 (receiving team): 48, 8B. `$71` bit 0x08 (`bits.scrimmage`) is set from the scrimmage set-up (`$71 = 08`) to the end of every scrimmage play and never on a kick: over game A, snapped frames with kind 0x08 have it clear 1496 times (kickoffs) and set 9 times (the post-kickoff snaps), kind 0x0C has it clear 5598 times. The decoder reports a kickoff only while it is pending (bit 6 differs from bit 7) or snapped without `$71` bit 0x08.
* Tries: after a touchdown the hack runs a scrimmage play from the 2 with `firstDownX` on the goal line being attacked (`after-touchdown.ram`; replay 12014 to 12739: `$82 = 0670` for the P2 try, `$70` E7 then C3, failed, score stays 0-6). A normal series can never start on the goal line, so `isTry = (kind == extra point) or firstDownX == goal line`. Only the P2 side was observed; the P1 side assumes `$0990`.
* Bit 6 on the interception: `$70 = A7` from 27033 to 27281 (bit 7 still P2, bit 6 clear, so P1 holds the ball), then 00 at 27282 when the stats land. `interception.ram` (27350) reads 00, matching the screen's P1 ball. The decoder's `possession` is bit 7 while live and bit 6 otherwise.
* Breaks: `$07 = 03` at the quarter break (17399 to 17496), halftime (29505 to 29940) and the final whistle. The team ids and scores stay valid (`halftime.ram`: BUF 2 CLE 6), so the decoder reports `inBreak` (`breakValue = 0x03`, both team ids in the roster). `$76` already holds the next quarter during the break (17400, 29506) and the clock reads 0:00.

`MemoryMap.offense` points at `$70` and the new field `offenseP2Mask = 0x80` says how to read it. This is an addition to the interface in the brief.

### Field side

P1 always defends the low-X end zone and attacks high X, in every quarter and in overtime. Evidence: P2 kicks off from `$0878` in Q1 (`kickoff.png`), P1 kicks off from `$0788` to start the second half (29940) and overtime (59736); the Browns' Q1 touchdown came from `$06DA` going to low X, the Bills' Q4 touchdown from `$091E` going to high X (exploration frame 55255); the disassembly hard-codes the P1 extra point spot at `$0980` (2 yards from the right end zone). No RAM byte flips sides, so the interface gained `{ p1AlwaysDefendsLowX: true }` as a third `fieldSide` form.

### First-down marker

`firstDownX` holds the line of scrimmage where the current set of downs started ("where the first down started at" in the disassembly), not the line to gain. The line to gain is `firstDownX + 80` for P1 (attacking high X) and `firstDownX - 80` for P2. The distance the game shows is rounded up to whole yards and capped at the distance to the goal line:

* `third-and-long`: P1, LOS `$071D`, marker `$0747`: (0x747 + 80 - 0x71D) / 8 = 15.25, screen "3 DOWN 16".
* `sack`: P1, LOS `$083A`, marker `$089C`: 22.25, screen "3 DOWN 23".
* `after-touchdown`: P2 try, LOS `$0680`, marker `$0670`: capped at (0x680 - 0x670) / 8 = 2, screen "1 DOWN 2".

### Sacks and passer stats

Sack yardage is **not** counted in the passer's rushing yards, and a sack is not a pass attempt. `trace-a-sack.json` (Bills QB Josh Allen sacked 7 yards, LOS `$0871` to `$083A`): P1 QB1 pass attempts stay 7, rush attempts stay 0, rush yards stay 0; the only stat change is P2 NT (Maliek Collins) sacks 0 to 1 at frame 23738 (SRAM `$5C4`).

### Stat blocks

SRAM `$6406` (P1) and `$650B` (P2), offsets into the 8 KB SRAM `0x406` and `0x50B`. Per team: QB1, QB2 (10 bytes: att, comp, TD, INT, yards 16-bit, rush att, rush yards 16-bit, rush TD), RB1-4, WR1-4, TE1-2 (16 bytes: rec, rec yards 16-bit, rec TD, KR att, KR yards 16-bit, KR TD, PR att, PR yards 16-bit, PR TD, rush att, rush yards 16-bit, rush TD), RE, NT, LE, ROLB, RILB, LILB, LOLB, RCB, LCB, FS, SS (5 bytes: sacks, INT, INT yards 16-bit, INT TD), K (XP att, XP made, FG att, FG made), P (punts, punt yards 16-bit): 242 bytes, then playbook, starters, injuries and conditions to 261. All 16-bit stat fields are little endian, low byte first (`sack.sram`: P1 QB1 pass yards at `$40A-$40B` hold `2A 00` for 42 yards). Yards are signed 16-bit (a -1 yard kick return wrote FF FF). Offensive linemen have no block, so `RosterTeam.players` index i maps to the stat block by skipping indexes 12-16.

Verified changes: completion at exploration frame 11563 updated P2 QB1 att/comp/TD/yards and P2 WR1 rec/yards/TD together; interception at 27281 (`trace-a-interception.json`) set P1 RCB (Max Hairston) INT 0 to 1 (`$4DE`) and P2 QB1 att 5 to 6, INT 0 to 1 (`$50B`, `$50E`). Stats are written when the play's cutscene ends, not on the `over` frame.

Replay timings (closing edge, stats land, `$71` clears): sack 23577, 23739, 23740 (LOS moves on the stat frame); interception 27174, 27282, 27285; touchdown 11367 (touchdown bit), 11564, 12013; kickoff 2852, 2898, 2899; end of Q1 run 17353, 17399 (inside the break, `$07 = 03`), 17499. Every stat write seen lands in a single frame. A failed try and the punt write no stats, so they close when `$71` clears (12739, 5377). A fumble lost after a catch (snap 18503, `$70` 24 to 64 at 18893, banner "RECOVER", `$71` clears 19098) writes no stats at all, not even the pass attempt; the defense holding the ball with unchanged stat blocks is how the tracker names it. The tracker keeps a play open from the closing edge until either stat block changes or `$71` loses `snapped`, capped at 900 frames.

## Camera

* `cameraX` RAM `$54-$55`, 16-bit little endian, the field X at the left screen edge, in the same units as `players.x` (one unit is one screen pixel). The disassembly names it CURR_X_SCROLL (`zero_page_variables.asm`: `$4F` unused, palette `$50-$53` with BG_FADE at `$52`, then CURR_X_SCROLL `$54`, LAST_FIELD_COL_INDEX `$56`, CURR_Y_SCROLL `$57`). The sprite code in `Bank31_fixed_bank.asm` places each player's right 8x16 sprite at `X_POS - CURR_X_SCROLL` and the left one 8 pixels before it, both at the player's Y.
* Found from the PPU dump over live frames 2300 to 9310 of game A: the coarse X of TmpVideoRamAddr, the fine `XScroll` and the nametable bit of Control give the scroll; `$54-$55` minus `$0610` equals it modulo 512 on 2591 of 2918 live frames, and `$0311` (the first IRQ split's X scroll) equals it on 2629. The misses are the pass cutscene and other non-field screens. The registers in the dump lag the RAM by one frame (the NMI writes the previous frame's values).
* `cameraY` is null: the field never scrolls vertically. Sprite Y is the player's Y byte with no offset (the sprite code copies the integer byte of Y_POS, `players.y` at +`$17`, straight into OAM), CURR_Y_SCROLL `$57-$58` reads 0 on the field, and the vertical scroll in the dump reads 255 on field frames.
* Projection (`src/game/camera.ts`): `fieldToScreen` returns the visible 256x224 space the presenter shows (`VISIBLE_TOP = 8` lines cropped): `x = player.x - cameraX`, `y = player.y + 1 - 8`. That point is the seam between the two halves of the player sprite at its top row. Off-screen players get x outside 0 to 255.
* Timing: OAM shown on a frame is built from the RAM of the frame before (sprite DMA runs in the NMI), so projecting the RAM read after frame N matches the picture of frame N + 1 exactly; against the same frame's picture the error is the player's motion in one frame (at most 2 or 3 pixels).
* Accuracy over both recorded games, every live frame, every player whose projected x is 8 to 255: game A 392499 player-frames, 94.7% with both sprite halves exactly at the projected spot and 97.2% with a sprite within 8 pixels; game B 412915 player-frames, 96.2% exact and 99.5% within 8. The misses are whole frames where the field is not on screen while the play is still live: the pass cutscene (game A 3294 to 3394), the touchdown celebration (game A 11576 to 12008) and two frames at the catch (game A 8159).
* `fieldMode` = `0x16` on `screenMode` (`$0F`): the field is on screen only while `$0F` reads 16. The pass cutscene and the touchdown celebration set it to 17 while `$71` still reads live, then 80 for two frames on the way back. Over every live frame of both games (38215), with a frame counted as field when at least half the on-screen players have a sprite within 3 pixels of their projection: 37497 of 37500 field frames read 16 (the 3 are the 2 frames before each cutscene starts, when `$0F` leads the picture), and 436 of 440 off-field frames read 17 or 80 (the misses are 4-frame blips at game A 13018 and 21787 and game B 60038). Off the live play, `$0F` reads 16 on 5528 of 5529 frames with the field drawn and 13 on play select. `$57-$58` reads `$0100` on only part of the cutscene frames, so it is not used. `fieldToScreen` returns null unless `$0F` is 16, and the replay overlays hide their lines then.

## Helmets

`src/helmets/extract.ts` cuts every team's helmet out of the game's own matchup screen (big helmets over the team names, shown before kickoff), in a worker, once per ROM.

* The menu inputs of `to-preseason-kickoff.json` up to frame 1050 reach the black frames after the PRESEASON card. Writing team ids to `$6C`/`$6D` at 1050 makes the matchup screen draw that pair (Dallas 19 over Arizona 33 verified); writing them at 1120 is too late and leaves the previous palette and logo.
* The screen is final from frame 1143 to 1260, so each pair renders in 100 frames from a state saved at 1050. All 32 teams take about 5 seconds in Node.
* Layout (PPU dump at 1260): helmet shells are background tiles `$84`-`$95` and `$E5`-`$FE` on nametable rows 2-8 (P1) and 15-21 (P2), drawn from a CHR bank the MMC3 IRQ swaps in for those rows only, so an end-of-frame dump shows the wrong tiles there. Facemasks are 8x8 sprites `$40`-`$4E` and `$C0`-`$CE`, logos are 8x8 sprites with a per-team palette (Browns have none). The TM marks are separate tiles left of the chin.
* The palette buffer is at `$31A` with a working copy at `$33D` used for fades; it is uploaded only while fading, so poking it between fades does nothing.
* The cut keeps the largest connected shape of non-black pixels grown by one pixel (the black outline), fills enclosed black, and so drops the TM marks.

## Roster tables in ROM

* Team pointer table at file `0x10`: 34 little-endian pointers, one per team id, to each team's player-name pointer table (CPU address, bank 0: file = pointer - `0x8000` + `0x10`). Ids 28 and 29 (AFC, NFC) are `FFFF`.
* Each team table has 31 pointers (30 players and an end pointer). For ids 0-27 a name pointer maps with the bank 0 formula; for the added ids 30-33 (tables at file `0x3EB0`) file = pointer + `0x30010` (TSBTool Supreme `CXRomTSBTool.java`, `mGetDataPositionOffset`).
* Each entry is a BCD jersey byte then the name: lowercase first name, uppercase last name (`joshALLEN`). `parseRoster` splits at the first uppercase letter and capitalizes each word start (letters after anything but a letter or digit), so `t.j.SANDERS` becomes `T.J.` `Sanders`.
* Team text pointers at file `0x1FC10`: 34 abbreviations, 34 cities, 34 nicknames, file = pointer + `0x14010`. Abbreviations are stored with dots (`BUF.`, `K.C.`); `parseRoster` drops the dots.
* Player order per team: QB1, QB2, RB1-4, WR1-4, TE1-2, C, LG, RG, LT, RT, RE, NT, LE, ROLB, RILB, LILB, LOLB, RCB, LCB, FS, SS, K, P.

## Starting points from the brief that differ in this ROM

* Game status: `$2D` cannot tell halftime and the post-game menus from play (C0 at halftime, a stale 80 on the main menu after a game), so the map uses `$07`.
* Offense: `$70` bit 7, not `$6F`.
* Player X/Y: +`$14`/+`$17` from a `$039F` slot base (the brief's +`$16`/+`$19` are not the integer fields).
* Everything else matched: clock, team ids, play status bits, quarter, down, LOS, first-down marker, timeouts, scores, slot base and stride, stat blocks.

## Replay fixture

`tests/fixtures/tsb2026/replay-game-a.json.gz` holds windows of `fixtures-game-a.json` (kickoff 2300-3600, punt 4100-5520, touchdown and try 11150-12760, end of Q1 17000-17520, fumble 18300-19200, sack 23300-23800, interception 26850-27400, halftime 29280-29960): the full RAM and SRAM at the first frame, then per frame the changed bytes among those the decoder reads. Regenerate with `bun tools/replayFixture.ts --rom "Tecmo Super Bowl 2026.nes" --script tools/scripts/fixtures-game-a.json --out tests/fixtures/tsb2026/replay-game-a.json.gz`.

## Fixtures

`tests/fixtures/tsb2026/` holds `.ram` and `.sram` dumps plus `manifest.json`. Manifest `quarter` and `down` are 1-based as shown on screen (quarter 5 is overtime); `clock` is `M:SS`; `offense` is 0 for P1 and 1 for P2; `live` uses the rule above. The `sack` and `interception` entries carry a `stats` array of `{ side, player, slot, stat, sram, value }`.

| Fixture | Script | Frame | Screen |
|---|---|---|---|
| `title` | `fixtures-menus.json` | 390 | Title |
| `team-select` | `fixtures-menus.json` | 860 | Team select, P1 has picked BUF |
| `kickoff` | `to-preseason-kickoff.json` (also dumped by both game scripts) | 2365 | Opening kickoff, P2 kicks |
| `third-and-long` | `fixtures-game-a.json` | 4200 | Q1 3rd and 16, P1 ball |
| `first-down` | `fixtures-game-a.json` | 8420 | Q1 1st and 10 after a P1 first down |
| `mid-pass-live` | `fixtures-game-a.json` | 9310 | Q1 2nd down, ball in the air |
| `after-touchdown` | `fixtures-game-a.json` | 12100 | Browns try after their TD, 0-6 |
| `sack` | `fixtures-game-a.json` | 23850 | Q2 3rd and 23 after the sack |
| `interception` | `fixtures-game-a.json` | 27350 | Q2 1st and 10 for P1 after the interception |
| `halftime` | `fixtures-game-a.json` | 29760 | Halftime Tecmo Sports News |
| `q4` | `fixtures-game-a.json` | 45250 | Q4 1st and 10, P2 ball |
| `overtime` | `fixtures-game-b.json` | 60300 | Overtime 1st and 10, P2 ball (preseason ties go to overtime) |

## Scripts

* `fixtures-menus.json`, `fixtures-game-a.json`, `fixtures-game-b.json`: dump every fixture in one run each.
* `game-a-NN.json`, `game-b-NN.json`: the recorded inputs of the two games after the opening kickoff, split at fixture and trace boundaries so other scripts can include them. They were recorded by a scratch autoplayer (pick plays with both pads, snap, throw with B, punt on 4th down, press buttons through stuck screens); game B had the defense pick the offense's play, which kept it 0-0 into overtime.
* `trace-*.json`: the traces cited above. A trace window with input changes is split into several trace steps, so one trace writes `name-01.csv`, `name-02.csv`, ... in order; concatenate them for the full window.

Run: `bun tools/headless.ts --rom "Tecmo Super Bowl 2026.nes" --script tools/scripts/<script>.json --out core/build/research/<script>`.

## Controls learned on the way

Play select: hold a direction and press A (run plays: UP 1, LEFT 2, RIGHT 3, DOWN 4) or B (pass plays 5-8). A with no direction opens the menu (CANCEL, TIMEOUT, PUNT, FG AND XP, CHANGE, PLAYBOOK); on 4th down the menu opens by itself. The offense snaps with A once the players are set (about 140 frames after `$71` becomes 08). On a pass play B throws to the current target.
