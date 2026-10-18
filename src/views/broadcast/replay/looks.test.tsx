import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import type { ReplayPlayer } from '../../../emu/ReplayPlayer'
import type { Snapshot } from '../../../emu/snapshot'
import type { RosterPlayer } from '../../../game/roster'
import type { PlayResult } from '../../../game/playTracker'
import type { PlayerLookup } from '../../../game/useGame'
import FootageLook, { captionText } from './FootageLook'
import TopDownLook from './TopDownLook'
import type { ReplayView } from './useReplay'

afterEach(cleanup)

const LOS = 0x800
const QB = { x: LOS - 16, y: 0x70 }
const WR = { x: LOS + 120, y: 0x40 }

const spread = (i: number) => ({ x: LOS - 200 + i * 12, y: 0x20 + (i % 11) * 14 })

const sample = (overrides: Record<number, { x: number; y: number }>) => Array.from({ length: 22 }, (_, i) => overrides[i] ?? spread(i))

const rows = [
  sample({ 0: QB, 3: { x: LOS + 40, y: 0x40 }, 11: { x: LOS + 300, y: 0x40 }, 12: { x: LOS + 4, y: 0x70 } }),
  sample({ 0: { x: QB.x - 8, y: QB.y }, 3: { x: LOS + 80, y: 0x40 }, 11: { x: LOS + 300, y: 0x40 }, 12: { x: QB.x + 4, y: QB.y } }),
  sample({ 0: { x: QB.x - 8, y: QB.y }, 3: WR, 11: { x: WR.x + 32.8, y: WR.y }, 12: { x: QB.x + 4, y: QB.y } }),
]

const play = (overrides: Partial<PlayResult> = {}): PlayResult => ({
  index: 2,
  offense: 0,
  quarter: 1,
  yards: 22,
  touchdown: false,
  sack: false,
  interception: false,
  kicked: false,
  thrown: true,
  kind: 'scrimmage',
  isTry: false,
  routes: [],
  ball: [
    { ...rows[0][0], slot: 0 },
    { ...rows[1][0], slot: 0 },
    { ...rows[2][3], slot: 3 },
  ],
  field: { losX: LOS, toGainX: LOS + 80, attacksHigh: true },
  summary: 'ALLEN PASS TO KINCAID, 22 YDS',
  startFrame: 100,
  endFrame: 400,
  down: 1,
  toGo: 10,
  startBallOn: { yard: 25, side: 0 },
  scoreBefore: [0, 0],
  scoreAfter: [0, 0],
  tracks: { frames: [100, 160, 220], players: rows },
  people: { passer: 0, receiver: 6 },
  ...overrides,
})

const roster: Record<number, RosterPlayer> = {
  0: { first: 'Josh', last: 'Allen', number: 17, position: 'QB' },
  6: { first: 'Dalton', last: 'Kincaid', number: 85, position: 'TE' },
  2: { first: 'Christian', last: 'McCaffrey', number: 23, position: 'RB' },
  8: { first: 'Juju', last: 'Smith-Schuster', number: 9, position: 'WR' },
}
const lookup: PlayerLookup = (team, index) => (team === 0 ? roster[index] ?? null : null)

const fakePlayer = (screenMode: number): ReplayPlayer => {
  const ram = new Uint8Array(0x800)
  ram[0x0f] = screenMode
  const camera = LOS - 128
  ram[0x54] = camera & 0xff
  ram[0x55] = camera >> 8
  const at = 0x39f + 0x20 * 3
  ram[at + 0x14] = WR.x & 0xff
  ram[at + 0x15] = WR.x >> 8
  ram[at + 0x17] = WR.y
  return {
    readSnapshot(into: Snapshot) {
      into.ram.set(ram)
      into.frame = 120
      return true
    },
  } as unknown as ReplayPlayer
}

const view = (overrides: Partial<ReplayView> = {}): ReplayView => ({
  play: play(),
  label: 'INSTANT REPLAY',
  look: 'footage',
  player: null,
  canvas: document.createElement('canvas'),
  skip: () => undefined,
  ...overrides,
})

test('footage draws the open ring with its yards', () => {
  const { container } = render(<FootageLook view={view({ player: fakePlayer(0x16) })} player={lookup} />)
  const ring = screen.getByTestId('open-ring')
  expect(ring.getAttribute('cx')).toBe(String(WR.x - (LOS - 128)))
  expect(screen.getByText('4.1 YDS OPEN')).toBeInTheDocument()
  expect(container.querySelector('.footage-los')).not.toBeNull()
  expect(container.querySelector('.footage-gain')).not.toBeNull()
  expect(screen.getByTestId('footage-ball')).toBeInTheDocument()
  expect(container.querySelector('canvas')).not.toBeNull()
})

test('footage with no camera shows labels only', () => {
  const { container, rerender } = render(<FootageLook view={view()} player={lookup} />)
  expect(screen.queryByTestId('open-ring')).toBeNull()
  expect(screen.queryByTestId('footage-ball')).toBeNull()
  expect(container.querySelector('.footage-los')).toBeNull()
  expect(screen.getByText('4.1 YDS OPEN')).toBeInTheDocument()
  expect(screen.getByText(/^CLOSEST RUSH \d+\.\d YDS AT \d+\.\d S$/)).toBeInTheDocument()
  rerender(<FootageLook view={view({ player: fakePlayer(0x17) })} player={lookup} />)
  expect(screen.queryByTestId('open-ring')).toBeNull()
  expect(container.querySelector('.footage-los')).toBeNull()
  expect(screen.getByText('4.1 YDS OPEN')).toBeInTheDocument()
})

test('top-down draws 22 tokens and numbers the people in the play', () => {
  render(<TopDownLook play={play()} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(screen.getAllByTestId('token')).toHaveLength(22)
  expect(screen.getAllByTestId('token-number').map((n) => n.textContent).sort()).toEqual(['17', '85'])
})

test('the caption shortens names to fit', () => {
  expect(captionText(play(), lookup)).toBe('#17 JOSH ALLEN TO #85 DALTON KINCAID')
  expect(captionText(play({ people: { passer: 2, receiver: 8 } }), lookup)).toBe('#23 MCCAFFREY TO #9 SMITH-SCHUSTER')
  expect(captionText(play({ people: { rusher: 2 }, thrown: false }), lookup)).toBe('#23 CHRISTIAN MCCAFFREY RUSH')
  expect(captionText(play({ people: {}, summary: 'SACK, -7 YDS' }), lookup)).toBe('SACK, -7 YDS')
})
