import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import type { PlayResult } from '../../../game/playTracker'
import ReplayStage from './ReplayStage'
import type { ReplayView } from './useReplay'

afterEach(cleanup)

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
}

const lookup = () => null

const view = (overrides: Partial<ReplayView>): ReplayView => ({ play, label: 'INSTANT REPLAY', look: 'footage', player: null, canvas: null, skip: () => undefined, ...overrides })

const stage = (v: ReplayView) => render(<ReplayStage view={v} abbrs={['BUF', 'MIA']} player={lookup} />)

test('the footage look mounts the replay canvas in the window', () => {
  const canvas = document.createElement('canvas')
  stage(view({ canvas }))
  const el = screen.getByTestId('replay-stage')
  expect(el).toHaveTextContent('INSTANT REPLAY')
  expect(el).toHaveTextContent('GAME FOOTAGE')
  expect(el.querySelector('canvas')).toBe(canvas)
  expect(screen.getByTestId('replay-caption')).toHaveTextContent('COOK RUSH, 25 YDS')
})

test('the other looks show their label, their drawing and no footage canvas', () => {
  const canvas = document.createElement('canvas')
  stage(view({ look: 'topdown' }))
  const el = screen.getByTestId('replay-stage')
  expect(el).toHaveTextContent('TOP DOWN')
  expect(el).toHaveClass('replay-topdown')
  expect(screen.getByTestId('topdown')).toBeInTheDocument()
  expect(el.querySelector('canvas')).toBeNull()
  cleanup()
  stage(view({ look: 'telestrator', canvas }))
  expect(screen.getByTestId('replay-stage')).toHaveTextContent('TELESTRATOR')
  expect(screen.getByTestId('route-replay')).toHaveClass('route-replay-replay')
  expect(screen.getByTestId('replay-stage').querySelector('canvas')).toBeNull()
  cleanup()
  stage(view({ look: 'topdown', label: 'PLAY OF THE DRIVE' }))
  expect(screen.getByTestId('replay-stage')).toHaveTextContent('PLAY OF THE DRIVE')
})
