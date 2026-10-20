import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
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
  expect(el).not.toHaveTextContent('INSTANT REPLAY')
  expect(el.querySelector('.replay-head')).toBeNull()
  expect(el).not.toHaveTextContent('GAME FOOTAGE')
  expect(el.querySelector('.replay-look')).toBeNull()
  expect(el.querySelector('canvas')).toBe(canvas)
  expect(screen.getByTestId('replay-caption')).toHaveTextContent('COOK RUSH, 25 YDS')
})

test('the lead-in sweeps the 8BSN mark across the window in the offense colors before the clip', () => {
  stage(view({ canvas: null, leadIn: true }))
  const lead = screen.getByTestId('replay-lead-in')
  expect(lead).not.toHaveTextContent('INSTANT REPLAY')
  expect(lead.querySelector('.replay-lead-label')).toBeNull()
  expect(screen.getByRole('img', { name: '8BSN' })).toHaveClass('wordmark-c3')
  expect(lead.style.getPropertyValue('--lead-primary')).toBe(teamColor('BUF').primary)
  expect(lead.style.getPropertyValue('--lead-secondary')).toBe(teamColor('BUF').secondary)
  expect(screen.queryByTestId('replay-caption')).toBeNull()
  expect(screen.getByTestId('replay-stage').querySelector('canvas')).toBeNull()
  cleanup()
  stage(view({ label: 'PLAY OF THE DRIVE', leadIn: true, play: { ...play, offense: 1 } }))
  expect(screen.getByTestId('replay-lead-in')).toHaveTextContent('PLAY OF THE DRIVE')
  expect(screen.getByTestId('replay-stage').querySelector('.replay-head')).toHaveTextContent('PLAY OF THE DRIVE')
  expect(screen.getByTestId('replay-lead-in').style.getPropertyValue('--lead-primary')).toBe(teamColor('MIA').primary)
})

test('a punt replay sweeps in the return team colors', () => {
  stage(view({ leadIn: true, play: { ...play, kind: 'punt', kicked: true } }))
  expect(screen.getByTestId('replay-lead-in').style.getPropertyValue('--lead-primary')).toBe(teamColor('MIA').primary)
})

test('a turnover replay sweeps in the defense colors', () => {
  stage(view({ leadIn: true, play: { ...play, interception: true } }))
  expect(screen.getByTestId('replay-lead-in').style.getPropertyValue('--lead-primary')).toBe(teamColor('MIA').primary)
  cleanup()
  const fumble = { at: spot(1), frame: 200, index: 1, by: { team: 0 as const, rosterIndex: 2 }, recoveredBy: { team: 1 as const, rosterIndex: 26 }, recovery: { slot: 15, frame: 210, index: 1 }, lost: true }
  stage(view({ play: { ...play, fumble } }))
  expect(screen.getByTestId('replay-lead-out').style.getPropertyValue('--lead-primary')).toBe(teamColor('MIA').primary)
  cleanup()
  stage(view({ leadIn: true, play: { ...play, fumble: { ...fumble, lost: false } } }))
  expect(screen.getByTestId('replay-lead-in').style.getPropertyValue('--lead-primary')).toBe(teamColor('BUF').primary)
})

test('a safety replay sweeps in the colors of the defense that scored', () => {
  stage(view({ leadIn: true, play: { ...play, scoreBefore: [0, 0], scoreAfter: [0, 2] } }))
  expect(screen.getByTestId('replay-lead-in').style.getPropertyValue('--lead-primary')).toBe(teamColor('MIA').primary)
})

test('a sack replay sweeps in the defense colors', () => {
  stage(view({ leadIn: true, play: { ...play, sack: true } }))
  expect(screen.getByTestId('replay-lead-in').style.getPropertyValue('--lead-primary')).toBe(teamColor('MIA').primary)
})

const css = readFileSync('src/views/broadcast/broadcast.css', 'utf8')
const rule = (selector: string) => [...css.matchAll(new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('')
const keyframes = (name: string) => css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''

test('the lead-in covers the whole replay window with the stat strip on top of it', () => {
  stage(view({ leadIn: true, label: 'PLAY OF THE DRIVE' }))
  const lead = screen.getByTestId('replay-lead-in')
  expect(lead.parentElement).toBe(screen.getByTestId('replay-stage'))
  expect(rule('.replay-lead')).toMatch(/position: absolute;/)
  expect(rule('.replay-lead')).toMatch(/inset: 0;/)
  expect(rule('.replay-lead')).not.toMatch(/flex: 1;/)
  expect(rule('.replay-stats')).toMatch(/z-index: 2;/)
  expect(rule('.replay-head')).toMatch(/z-index: 2;/)
  expect(rule('.replay-lead')).toMatch(/z-index: 1;/)
  expect(screen.getByTestId('replay-stats')).toBeInTheDocument()
})

test('the lead-in holds over the window to its end and then wipes off the clip instead of shrinking', () => {
  const canvas = document.createElement('canvas')
  stage(view({ canvas, leadIn: false }))
  const out = screen.getByTestId('replay-lead-out')
  expect(out).toHaveClass('replay-lead', 'replay-lead-leaving')
  expect(screen.getByTestId('replay-stage').querySelector('canvas')).toBe(canvas)
  for (const name of ['lead-sweep-back', 'lead-sweep-front']) {
    expect(keyframes(name)).toMatch(/100% \{\s*transform: translateX\(0\) skewX\(-12deg\);/)
    expect(keyframes(`${name}-out`)).toMatch(/100% \{\s*transform: translateX\(110%\) skewX\(-12deg\);/)
  }
  expect(keyframes('lead-mark')).toMatch(/100% \{\s*opacity: 1;/)
})
