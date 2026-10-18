import { expect, test } from 'vitest'
import { carrierSamples, headline, lastPlayView, pickLook, playOfDrive, pressure, replayWorthy, separation } from './analysis'
import type { Drive, PlayResult } from './playTracker'
import type { GameState } from './types'

const play = (overrides: Partial<PlayResult> = {}): PlayResult => ({
  index: 0,
  offense: 0,
  quarter: 0,
  yards: 5,
  touchdown: false,
  sack: false,
  interception: false,
  kicked: false,
  thrown: false,
  call: null,
  scramble: false,
  kind: 'scrimmage',
  isTry: false,
  routes: [],
  ball: [],
  field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
  summary: '',
  startFrame: 0,
  endFrame: 0,
  down: 1,
  toGo: 10,
  startBallOn: { yard: 25, side: 0 },
  scoreBefore: [0, 0],
  scoreAfter: [0, 0],
  tracks: { frames: [], players: [] },
  people: {},
  pass: null,
  airYards: null,
  yac: null,
  fumble: null,
  kickResult: null,
  returner: null,
  returnYards: null,
  ...overrides,
})

const state = {} as GameState

const sample = (overrides: Record<number, { x: number; y: number }>) =>
  Array.from({ length: 22 }, (_, i) => overrides[i] ?? { x: 1000, y: 1000 })

test('replay worthy covers touchdowns, interceptions, lost fumbles, sacks and 20 yard plays', () => {
  expect(replayWorthy(play({ touchdown: true }))).toBe(true)
  expect(replayWorthy(play({ interception: true }))).toBe(true)
  expect(replayWorthy(play({ summary: 'FUMBLE LOST' }))).toBe(true)
  expect(replayWorthy(play({ sack: true }))).toBe(true)
  expect(replayWorthy(play({ yards: 20 }))).toBe(true)
  expect(replayWorthy(play({ yards: 19 }))).toBe(false)
})

test('touchdowns use footage and sacks and interceptions use topdown', () => {
  expect(pickLook(play({ touchdown: true }), 'footage', () => 0)).toBe('footage')
  expect(pickLook(play({ sack: true }), null, () => 0)).toBe('topdown')
  expect(pickLook(play({ interception: true }), 'topdown', () => 0)).toBe('topdown')
})

test('pickLook never repeats the previous look on ordinary plays', () => {
  let seed = 7
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  let previous: 'footage' | 'topdown' | 'telestrator' | null = null
  const seen = new Set<string>()
  for (let i = 0; i < 200; i++) {
    const look = pickLook(play({ yards: 22 }), previous, random)
    expect(look).not.toBe(previous)
    seen.add(look)
    previous = look
  }
  expect(seen.size).toBe(3)
})

test('separation measures the nearest defender at the first catch sample', () => {
  const p = play({
    thrown: true,
    ball: [
      { x: 0, y: 0, slot: 0 },
      { x: 100, y: 0, slot: 0 },
      { x: 200, y: 0, slot: 2 },
    ],
    tracks: {
      frames: [1, 2, 3],
      players: [
        sample({ 0: { x: 0, y: 0 } }),
        sample({ 0: { x: 100, y: 0 } }),
        sample({ 2: { x: 200, y: 0 }, 13: { x: 224, y: 0 }, 14: { x: 200, y: 100 } }),
      ],
    },
  })
  expect(separation(p)).toEqual({ slot: 2, yards: 3, sample: 2, defender: 13 })
})

test('separation aligns carrier points when some samples had no carrier', () => {
  const p = play({
    thrown: true,
    ball: [
      { x: 0, y: 0, slot: 0 },
      { x: 200, y: 0, slot: 3 },
    ],
    tracks: {
      frames: [1, 2, 3],
      players: [
        sample({ 0: { x: 0, y: 0 } }),
        sample({ 0: { x: 50, y: 0 } }),
        sample({ 3: { x: 200, y: 0 }, 12: { x: 204, y: 0 } }),
      ],
    },
  })
  expect(separation(p)).toEqual({ slot: 3, yards: 0.5, sample: 2, defender: 12 })
})

test('carrier samples follow the track row on each ball point and fall back to matching spots for old plays', () => {
  const still = { x: 300, y: 40 }
  const p = play({
    kicked: true,
    kind: 'punt',
    ball: [
      { x: 0, y: 0, slot: 0, sample: 0 },
      { ...still, slot: 14, sample: 2 },
    ],
    tracks: {
      frames: [1, 2, 3],
      players: [sample({ 0: { x: 0, y: 0 }, 14: still }), sample({ 0: { x: 10, y: 0 }, 14: still }), sample({ 0: { x: 20, y: 0 }, 14: still })],
    },
  })
  expect(carrierSamples(p)).toEqual([
    { sample: 0, slot: 0 },
    { sample: 2, slot: 14 },
  ])
  const old = play({ ...p, ball: p.ball.map(({ x, y, slot }) => ({ x, y, slot })) })
  expect(carrierSamples(old)).toEqual([
    { sample: 0, slot: 0 },
    { sample: 1, slot: 14 },
  ])
})

test('separation is null when no pass was caught', () => {
  const run = play({
    ball: [{ x: 0, y: 0, slot: 0 }, { x: 10, y: 0, slot: 1 }],
    tracks: { frames: [1, 2], players: [sample({ 0: { x: 0, y: 0 } }), sample({ 1: { x: 10, y: 0 } })] },
  })
  expect(separation(run)).toBeNull()
  const intercepted = play({
    thrown: true,
    interception: true,
    ball: [{ x: 0, y: 0, slot: 0 }, { x: 10, y: 0, slot: 14 }],
    tracks: { frames: [1, 2], players: [sample({ 0: { x: 0, y: 0 } }), sample({ 14: { x: 10, y: 0 } })] },
  })
  expect(separation(intercepted)).toBeNull()
})

test('pressure is the closest defender to the snap carrier until the throw', () => {
  const p = play({
    thrown: true,
    ball: [
      { x: 0, y: 0, slot: 0 },
      { x: 0, y: 0, slot: 0 },
      { x: 0, y: 0, slot: 0 },
      { x: 300, y: 0, slot: 2 },
    ],
    tracks: {
      frames: [60, 90, 120, 150],
      players: [
        sample({ 0: { x: 0, y: 0 }, 15: { x: 160, y: 0 } }),
        sample({ 0: { x: 0, y: 0 }, 15: { x: 40, y: 0 } }),
        sample({ 0: { x: 0, y: 0 }, 15: { x: 80, y: 0 } }),
        sample({ 2: { x: 300, y: 0 }, 15: { x: 8, y: 0 } }),
      ],
    },
  })
  expect(pressure(p)).toEqual({ yards: 5, seconds: 0.5 })
})

test('pressure is null without tracks', () => {
  expect(pressure(play())).toBeNull()
})

test('headline flags the first 100 yard rusher', () => {
  const earlier = play({ index: 0, yards: 90, people: { rusher: 3 } })
  const current = play({ index: 1, yards: 12, people: { rusher: 3 } })
  expect(headline(current, [earlier, current], state)).toEqual({ team: 0, rosterIndex: 3, text: 'FIRST 100 YARD RUSHER OF THE GAME' })
  const again = play({ index: 2, yards: 5, people: { rusher: 3 } })
  expect(headline(again, [earlier, current, again], state)).toBeNull()
})

test('headline flags the first 100 yard receiver', () => {
  const earlier = play({ index: 0, yards: 60, thrown: true, people: { passer: 1, receiver: 5 } })
  const current = play({ index: 1, yards: 45, thrown: true, people: { passer: 1, receiver: 5 } })
  expect(headline(current, [earlier, current], state)).toEqual({ team: 0, rosterIndex: 5, text: 'FIRST 100 YARD RECEIVER OF THE GAME' })
})

test('headline flags a second touchdown by the same player', () => {
  const first = play({ index: 0, touchdown: true, people: { rusher: 3 } })
  const second = play({ index: 1, touchdown: true, yards: 3, people: { rusher: 3 } })
  expect(headline(second, [first, second], state)).toEqual({ team: 0, rosterIndex: 3, text: '2ND TOUCHDOWN OF THE GAME' })
})

test('headline flags the longest play of the game', () => {
  const earlier = play({ index: 0, yards: 22, people: { rusher: 3 } })
  const current = play({ index: 1, yards: 30, people: { rusher: 4 } })
  expect(headline(current, [earlier, current], state)).toEqual({ team: 0, rosterIndex: 4, text: 'LONGEST PLAY OF THE GAME' })
  const shorter = play({ index: 2, yards: 25, people: { rusher: 4 } })
  expect(headline(shorter, [earlier, current, shorter], state)).toBeNull()
})

test('headline flags a second sack and a second interception', () => {
  const sack = (index: number) => play({ index, sack: true, yards: -5, people: { defender: { team: 1, rosterIndex: 18, kind: 'sack' } } })
  expect(headline(sack(1), [sack(0), sack(1)], state)).toEqual({ team: 1, rosterIndex: 18, text: '2ND SACK OF THE GAME' })
  const pick = (index: number) => play({ index, interception: true, yards: 0, people: { defender: { team: 1, rosterIndex: 20, kind: 'int' } } })
  expect(headline(pick(1), [pick(0), pick(1)], state)).toEqual({ team: 1, rosterIndex: 20, text: '2ND INTERCEPTION OF THE GAME' })
})

test('headline is null for an ordinary play', () => {
  const p = play({ people: { rusher: 3 } })
  expect(headline(p, [p], state)).toBeNull()
})

test('play of the drive picks the touchdown, else the longest 10 plus gain, else nothing', () => {
  const drive: Drive = {
    offense: 0,
    plays: 4,
    yards: 60,
    startClock: '9:00',
    result: 'TD',
    startSpot: { yard: 25, side: 0 },
    endSpot: { yard: 0, side: 1 },
    endSummary: '',
    endTime: '2:00',
  }
  const long = play({ index: 1, yards: 32 })
  const score = play({ index: 3, yards: 4, touchdown: true })
  const plays = [play({ index: 0, yards: 12 }), long, play({ index: 2, offense: 1, yards: 50 }), score, play({ index: 4, isTry: true, touchdown: true })]
  expect(playOfDrive(plays, drive)).toBe(score)
  expect(playOfDrive(plays.slice(0, 3), { ...drive, result: 'PUNT' })).toBe(long)
  const sacked = play({ index: 5, sack: true, yards: -40 })
  const picked = play({ index: 6, interception: true, yards: 30 })
  const punt = play({ index: 7, kind: 'punt', kicked: true, yards: 45 })
  expect(playOfDrive([play({ yards: 9 }), sacked, picked, punt], { ...drive, result: 'INT' })).toBeNull()
  expect(playOfDrive([play({ yards: 10 })], { ...drive, result: 'DOWNS' })?.yards).toBe(10)
  expect(playOfDrive([play({ index: 8, touchdown: true, interception: true })], { ...drive, result: 'INT' })).toBeNull()
})

test('sacks, picks, lost fumbles, incompletions and safeties show all 22', () => {
  const lost = { at: { x: 0, y: 0 }, frame: 0, index: 0, by: null, recoveredBy: null, recovery: null, lost: true }
  expect(lastPlayView(play({ sack: true, yards: -7 }))).toBe('all22')
  expect(lastPlayView(play({ interception: true, thrown: true }))).toBe('all22')
  expect(lastPlayView(play({ summary: 'FUMBLE LOST' }))).toBe('all22')
  expect(lastPlayView(play({ fumble: lost }))).toBe('all22')
  expect(lastPlayView(play({ thrown: true, yards: 0, people: { passer: 0 }, summary: 'ALLEN PASS INCOMPLETE' }))).toBe('all22')
  expect(lastPlayView(play({ thrown: true, yards: 0, pass: { from: { x: 0, y: 0 }, to: { x: 9, y: 0 }, outcome: 'incomplete' } }))).toBe('all22')
  expect(lastPlayView(play({ thrown: true, yards: 0, pass: { from: { x: 0, y: 0 }, to: { x: 9, y: 0 }, outcome: 'deflected' } }))).toBe('all22')
  expect(lastPlayView(play({ yards: -3, scoreBefore: [7, 3], scoreAfter: [7, 5], people: { rusher: 1 } }))).toBe('all22')
})

test('runs, completions and kicks show the telestrator', () => {
  expect(lastPlayView(play({ people: { rusher: 1 }, summary: 'COOK RUSH, 5 YDS' }))).toBe('telestrator')
  expect(lastPlayView(play({ thrown: true, people: { passer: 0, receiver: 2 }, pass: { from: { x: 0, y: 0 }, to: { x: 9, y: 0 }, outcome: 'caught' } }))).toBe('telestrator')
  expect(lastPlayView(play({ touchdown: true, yards: 40, people: { rusher: 1 }, scoreAfter: [6, 0] }))).toBe('telestrator')
  expect(lastPlayView(play({ kind: 'kickoff', kicked: true, summary: 'KICKOFF' }))).toBe('telestrator')
  expect(lastPlayView(play({ kind: 'punt', kicked: true, summary: 'PUNT' }))).toBe('telestrator')
  expect(lastPlayView(play({ kind: 'fieldGoal', kicked: true, summary: 'FIELD GOAL GOOD', scoreAfter: [3, 0] }))).toBe('telestrator')
  expect(lastPlayView(play({ kind: 'extraPoint', isTry: true, kicked: true, summary: 'PAT GOOD', scoreAfter: [1, 0] }))).toBe('telestrator')
})
