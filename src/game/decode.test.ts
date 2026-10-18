import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { loadReplayFixture, replaySnapshots } from '../../tools/replayFixture'
import { emptySnapshot } from '../emu/snapshot'
import { decodeGameState } from './decode'
import type { MemoryMap } from './memoryMap'
import { TSB2026_MAP } from './maps/tsb2026'
import { parseRoster } from './roster'

const romPath = 'Tecmo Super Bowl 2026.nes'
const fixtureDir = 'tests/fixtures/tsb2026'
const manifestPath = join(fixtureDir, 'manifest.json')
const hasData = existsSync(romPath) && existsSync(manifestPath)

type Expect = {
  inGame: boolean
  quarter?: number
  down?: number
  scores?: [number, number]
  offense?: 0 | 1
  clock?: string
  live?: boolean
  teamAbbrs?: [string, string]
}

type Entry = { name: string; expect: Expect }

function load(name: string) {
  const snap = emptySnapshot()
  snap.ram.set(readFileSync(join(fixtureDir, `${name}.ram`)))
  snap.sram.set(readFileSync(join(fixtureDir, `${name}.sram`)))
  return snap
}

test.skipIf(!hasData)('decodeGameState matches every manifest entry', () => {
  const roster = parseRoster(new Uint8Array(readFileSync(romPath)))
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Entry[]
  for (const { name, expect: want } of manifest) {
    const state = decodeGameState(load(name), TSB2026_MAP, roster)
    expect(state.inGame, name).toBe(want.inGame)
    if (want.quarter !== undefined) expect(state.quarter + 1, name).toBe(want.quarter)
    if (want.down !== undefined) expect(state.down, name).toBe(want.down)
    if (want.scores) expect([state.teams[0].score, state.teams[1].score], name).toEqual(want.scores)
    if (want.offense !== undefined) expect(state.offense, name).toBe(want.offense)
    if (want.live !== undefined) expect(state.live, name).toBe(want.live)
    if (want.teamAbbrs) expect([state.teams[0].abbr, state.teams[1].abbr], name).toEqual(want.teamAbbrs)
    if (want.clock) expect(`${state.clock.min}:${String(state.clock.sec).padStart(2, '0')}`, name).toBe(want.clock.replace(/^(\d+):(\d)$/, '$1:0$2'))
  }
})

test.skipIf(!hasData)('yards to go and ball position follow the first-down marker relation', () => {
  const roster = parseRoster(new Uint8Array(readFileSync(romPath)))
  const decode = (name: string) => decodeGameState(load(name), TSB2026_MAP, roster)
  expect(decode('third-and-long').yardsToGo).toBe(16)
  expect(decode('sack').yardsToGo).toBe(23)
  expect(decode('first-down').yardsToGo).toBe(10)
  expect(decode('after-touchdown').yardsToGo).toBe(0)
  expect(decode('kickoff').ballOn.side).toBe(1)
})

test.skipIf(!hasData)('stat blocks decode into player lines', () => {
  const roster = parseRoster(new Uint8Array(readFileSync(romPath)))
  const sack = decodeGameState(load('sack'), TSB2026_MAP, roster)
  const qb = sack.teams[0].players.find((p) => p.rosterIndex === 0)
  expect(qb?.pass).toMatchObject({ att: 7 })
  expect(qb?.pass?.yds).toBeGreaterThan(0)
  expect(qb?.rush).toEqual({ att: 0, yds: 0, td: 0 })
  expect(sack.teams[1].players.find((p) => p.rosterIndex === 18)?.def?.sacks).toBe(1)
  expect(sack.teams[0].players.some((p) => p.rosterIndex >= 12 && p.rosterIndex <= 16)).toBe(false)
  const pick = decodeGameState(load('interception'), TSB2026_MAP, roster)
  expect(pick.teams[0].players.find((p) => p.rosterIndex === 24)?.def?.int).toBe(1)
  expect(pick.teams[1].players.find((p) => p.rosterIndex === 0)?.pass).toMatchObject({ att: 6, int: 1 })
  expect(sack.positions).toHaveLength(22)
})

test('a status byte outside inGameValues decodes as not in game with a well-formed state', () => {
  const snap = emptySnapshot()
  snap.ram[TSB2026_MAP.gameStatus.offset] = 0x03
  const state = decodeGameState(snap, TSB2026_MAP, [])
  expect(state.inGame).toBe(false)
  expect(state.inBreak).toBe(false)
  expect(state.live).toBe(false)
  expect(state.teams[0]).toMatchObject({ abbr: '???', players: [] })
  expect(state.positions).toEqual([])
  expect(state.yardsToGo).toBe(0)
  expect(state.teams[1].players).toEqual([])
})

test('an unknown team id yields ??? and no players', () => {
  const snap = emptySnapshot()
  snap.ram[TSB2026_MAP.gameStatus.offset] = 0x11
  snap.ram[TSB2026_MAP.teamIds[0].offset] = 99
  const state = decodeGameState(snap, TSB2026_MAP, [])
  expect(state.inGame).toBe(true)
  expect(state.teams[0].abbr).toBe('???')
  expect(state.teams[0].players).toEqual([])
})

test('BCD clock bytes decode when clockBcd is true and read raw when false', () => {
  const snap = emptySnapshot()
  snap.ram[TSB2026_MAP.gameStatus.offset] = 0x11
  snap.ram[TSB2026_MAP.clockSeconds.offset] = 0x45
  snap.ram[TSB2026_MAP.clockMinutes.offset] = 0x03
  expect(decodeGameState(snap, TSB2026_MAP, []).clock).toEqual({ min: 3, sec: 45 })
  const raw: MemoryMap = { ...TSB2026_MAP, clockBcd: false }
  expect(decodeGameState(snap, raw, []).clock).toEqual({ min: 3, sec: 0x45 })
})

test('play status bits drive live, playOver, touchdown, sack and kicked', () => {
  const snap = emptySnapshot()
  const map = TSB2026_MAP
  snap.ram[map.gameStatus.offset] = 0x11
  const at = (status: number) => {
    snap.ram[map.playStatus.offset] = status
    return decodeGameState(snap, map, [])
  }
  expect(at(map.bits.snapped)).toMatchObject({ live: true, playOver: false })
  expect(at(map.bits.snapped | map.bits.over)).toMatchObject({ live: false, playOver: true })
  expect(at(map.bits.snapped | map.bits.touchdown)).toMatchObject({ live: false, playOver: true, touchdown: true })
  expect(at(map.bits.snapped | map.bits.sack).sack).toBe(true)
  expect(at(map.bits.kicked).kicked).toBe(true)
  expect(at(0)).toMatchObject({ live: false, playOver: false })
})

test('quarter 4 is overtime and offense follows the possession mask', () => {
  const snap = emptySnapshot()
  const map = TSB2026_MAP
  snap.ram[map.gameStatus.offset] = 0x11
  snap.ram[map.quarter.offset] = 4
  snap.ram[map.offense.offset] = map.offenseP2Mask
  const state = decodeGameState(snap, map, [])
  expect(state.quarter).toBe(4)
  expect(state.offense).toBe(1)
})

const replay = loadReplayFixture('tests/fixtures/tsb2026/replay-game-a.json.gz')
const replayRoster = [0, 5].map((id) => ({ id, abbr: `T${id}`, city: '', name: '', players: [] }))

function replayAt(window: string, frame: number) {
  for (const snap of replaySnapshots(replay, window)) {
    if (snap.frame === frame) return decodeGameState(snap, TSB2026_MAP, replayRoster)
  }
  throw new Error(`frame ${frame} not in ${window}`)
}

test('play kind comes from the low bits of the possession byte', () => {
  const snap = emptySnapshot()
  const map = TSB2026_MAP
  snap.ram[map.gameStatus.offset] = 0x11
  const kind = (possession: number, status = map.bits.snapped) => {
    snap.ram[map.offense.offset] = possession
    snap.ram[map.playStatus.offset] = status
    return decodeGameState(snap, map, []).playKind
  }
  expect(kind(0x00)).toBe('scrimmage')
  expect(kind(0xe7)).toBe('scrimmage')
  expect(kind(0x48)).toBe('kickoff')
  expect(kind(0x0c)).toBe('punt')
  expect(kind(0xcf)).toBe('punt')
  expect(kind(0x10)).toBe('fieldGoal')
  expect(kind(0x14)).toBe('extraPoint')
})

test('a recorded kickoff reads as a kickoff until the return ends', () => {
  expect(replayAt('kickoff', 2300).playKind).toBe('kickoff')
  expect(replayAt('kickoff', 2600).playKind).toBe('kickoff')
  expect(replayAt('kickoff', 2898).playKind).toBe('kickoff')
  expect(replayAt('kickoff', 2950).playKind).toBe('scrimmage')
  expect(replayAt('kickoff', 3172).playKind).toBe('scrimmage')
  expect(replayAt('halftime', 29950).playKind).toBe('kickoff')
})

test('a recorded punt reads as a punt', () => {
  expect(replayAt('punt', 4900).playKind).toBe('punt')
  expect(replayAt('punt', 5100).playKind).toBe('punt')
  expect(replayAt('punt', 4500).playKind).toBe('scrimmage')
})

test('the recorded try after the touchdown is a try and the touchdown play is not', () => {
  expect(replayAt('touchdown', 11300).isTry).toBe(false)
  expect(replayAt('touchdown', 12100).isTry).toBe(true)
  expect(replayAt('touchdown', 12400).isTry).toBe(true)
  expect(replayAt('touchdown', 12400).playKind).toBe('scrimmage')
})

test('a try is flagged for an extra point kind or a series started on the goal line', () => {
  const snap = emptySnapshot()
  const map = TSB2026_MAP
  snap.ram[map.gameStatus.offset] = 0x11
  const at = (possession: number, marker: number) => {
    snap.ram[map.offense.offset] = possession
    snap.ram[map.firstDownX.offset] = marker & 0xff
    snap.ram[map.firstDownX.offset + 1] = marker >> 8
    return decodeGameState(snap, map, []).isTry
  }
  expect(at(0x80, map.fieldZeroX)).toBe(true)
  expect(at(0x00, map.fieldZeroX + 100 * map.unitsPerYard)).toBe(true)
  expect(at(0x14, 0x800)).toBe(true)
  expect(at(0x00, 0x800)).toBe(false)
  expect(at(0x80, 0x800)).toBe(false)
})

test('between plays possession follows the team holding the ball after an interception', () => {
  const live = replayAt('interception', 27100)
  expect(live).toMatchObject({ live: true, offense: 1, possession: 1 })
  const after = replayAt('interception', 27200)
  expect(after).toMatchObject({ live: false, offense: 1, possession: 0 })
  expect(replayAt('interception', 26860)).toMatchObject({ offense: 1, possession: 1 })
})

test.skipIf(!hasData)('halftime is a break with valid teams and the title screen is not', () => {
  const roster = parseRoster(new Uint8Array(readFileSync(romPath)))
  const half = decodeGameState(load('halftime'), TSB2026_MAP, roster)
  expect(half).toMatchObject({ inGame: false, inBreak: true, live: false, playOver: false, positions: [] })
  expect(half.teams.map((t) => [t.abbr, t.score])).toEqual([['BUF', 2], ['CLE', 6]])
  expect(decodeGameState(load('title'), TSB2026_MAP, roster).inBreak).toBe(false)
  expect(decodeGameState(load('team-select'), TSB2026_MAP, roster).inBreak).toBe(false)
})

test('the recorded quarter break decodes as a break with the field position', () => {
  expect(replayAt('quarter', 17300)).toMatchObject({ inGame: true, inBreak: false })
  const pause = replayAt('quarter', 17450)
  expect(pause).toMatchObject({ inGame: false, inBreak: true, live: false })
  expect(pause.ballOn).toEqual({ yard: 46, side: 1 })
  expect(replayAt('quarter', 17510)).toMatchObject({ inGame: true, inBreak: false })
})

test('playSelect is set only while the play select screen is up, never at kickoff or after a play', () => {
  expect(replayAt('kickoff', 2400).playSelect).toBe(false)
  expect(replayAt('kickoff', 2900).playSelect).toBe(false)
  expect(replayAt('kickoff', 2950).playSelect).toBe(true)
  expect(replayAt('kickoff', 3025).playSelect).toBe(false)
  expect(replayAt('kickoff', 3500).playSelect).toBe(false)
  expect(replayAt('punt', 4200).playSelect).toBe(true)
  expect(replayAt('punt', 4300).playSelect).toBe(false)
})

test('the carrier follows the ball from the QB to the receiver and to the defender on an interception', () => {
  expect(replayAt('touchdown', 11300).carrier).toBe(11)
  expect(replayAt('touchdown', 11362).carrier).toBe(14)
  expect(replayAt('interception', 27000).carrier).toBe(11)
  expect(replayAt('interception', 27040).carrier).toBe(7)
  expect(replayAt('fumble', 18700).carrier).toBe(3)
  expect(replayAt('fumble', 18900).carrier).toBe(19)
})

test('on kicks the carrier is the receiving team returner', () => {
  expect(replayAt('kickoff', 2600).carrier).toBe(10)
  expect(replayAt('punt', 5000).carrier).toBe(21)
})

test('field lines give the line of scrimmage and the line to gain in field units', () => {
  const state = replayAt('punt', 4300)
  expect(state.field.attacksHigh).toBe(true)
  expect(state.field.losX).toBe(0x71d)
  expect(state.field.toGainX).toBe(0x747 + 80)
  expect(replayAt('touchdown', 12100).field.toGainX).toBeNull()
})

test('betweenPlays starts on the first black frame after a play and is never set at kickoff', () => {
  expect(replayAt('kickoff', 2400).betweenPlays).toBe(false)
  expect(replayAt('kickoff', 3536).betweenPlays).toBe(false)
  expect(replayAt('kickoff', 3537).betweenPlays).toBe(true)
  expect(replayAt('punt', 4125).betweenPlays).toBe(true)
  expect(replayAt('punt', 4300).betweenPlays).toBe(false)
})
