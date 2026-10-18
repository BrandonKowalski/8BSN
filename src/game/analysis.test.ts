import { expect, test } from 'vitest'
import { headline, pickLook, pressure, replayWorthy, separation } from './analysis'
import type { PlayResult } from './playTracker'
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
  expect(separation(p)).toEqual({ slot: 2, yards: 3, sample: 2 })
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
  expect(separation(p)).toEqual({ slot: 3, yards: 0.5, sample: 2 })
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
