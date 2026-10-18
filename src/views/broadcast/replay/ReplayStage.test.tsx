import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { PlayResult } from '../../../game/playTracker'
import { teamColor } from '../teamColors'
import ReplayStage from './ReplayStage'
import type { ReplayView } from './useReplay'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const spot = (i: number) => ({ x: 0x7a0 + i * 10, y: 0x30 + (i % 11) * 12 })

const play: PlayResult = {
  index: 3,
  offense: 0,
  quarter: 1,
  yards: 25,
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
  ball: [
    { ...spot(0), slot: 0 },
    { x: 0x900, y: 0x60, slot: 1 },
  ],
  field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
  summary: 'COOK RUSH, 25 YDS',
  startFrame: 100,
  endFrame: 400,
  down: 1,
  toGo: 10,
  startBallOn: { yard: 25, side: 0 },
  scoreBefore: [0, 0],
  scoreAfter: [0, 0],
  tracks: { frames: [100, 400], players: [Array.from({ length: 22 }, (_, i) => spot(i)), Array.from({ length: 22 }, (_, i) => spot(i))] },
  people: { rusher: 2 },
  pass: null,
  airYards: null,
  yac: null,
  fumble: null,
  kickResult: null,
  returner: null,
  returnYards: null,
}

const lookup = () => null

const view = (overrides: Partial<ReplayView>): ReplayView => ({ play, label: 'INSTANT REPLAY', leadIn: false, player: null, canvas: null, skip: () => undefined, ...overrides })

const stage = (v: ReplayView) => render(<ReplayStage view={v} abbrs={['BUF', 'MIA']} player={lookup} />)

test('the footage look mounts the replay canvas in the window', () => {
  const canvas = document.createElement('canvas')
  stage(view({ canvas }))
  const el = screen.getByTestId('replay-stage')
  expect(el).toHaveTextContent('INSTANT REPLAY')
  expect(el).not.toHaveTextContent('GAME FOOTAGE')
  expect(el.querySelector('.replay-look')).toBeNull()
  expect(el.querySelector('canvas')).toBe(canvas)
  expect(screen.getByTestId('replay-caption')).toHaveTextContent('COOK RUSH, 25 YDS')
})

test('the lead-in sweeps the 8BSN mark across the window in the offense colors before the clip', () => {
  stage(view({ canvas: null, leadIn: true }))
  const lead = screen.getByTestId('replay-lead-in')
  expect(lead).toHaveTextContent('INSTANT REPLAY')
  expect(screen.getByRole('img', { name: '8BSN' })).toHaveClass('wordmark-c3')
  expect(lead.style.getPropertyValue('--lead-primary')).toBe(teamColor('BUF').primary)
  expect(lead.style.getPropertyValue('--lead-secondary')).toBe(teamColor('BUF').secondary)
  expect(screen.queryByTestId('replay-caption')).toBeNull()
  expect(screen.getByTestId('replay-stage').querySelector('canvas')).toBeNull()
  cleanup()
  stage(view({ label: 'PLAY OF THE DRIVE', leadIn: true, play: { ...play, offense: 1 } }))
  expect(screen.getByTestId('replay-lead-in')).toHaveTextContent('PLAY OF THE DRIVE')
  expect(screen.getByTestId('replay-lead-in').style.getPropertyValue('--lead-primary')).toBe(teamColor('MIA').primary)
  expect(screen.queryByTestId('replay-stats')).toBeNull()
})
