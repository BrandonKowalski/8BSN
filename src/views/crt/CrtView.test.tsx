import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { PlayTracker } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import CrtView from './CrtView'

afterEach(cleanup)

const tracker = new PlayTracker({ recordRoutes: false })
const names = () => 'COOK'

const state: GameState = {
  inGame: false,
  inBreak: false,
  live: false,
  playOver: false,
  touchdown: false,
  sack: false,
  kicked: false,
  playKind: 'scrimmage',
  isTry: false,
  quarter: 0,
  clock: { min: 15, sec: 0 },
  down: 1,
  yardsToGo: 10,
  ballOn: { yard: 20, side: 0 },
  offense: 0,
  possession: 0,
  teams: [
    { id: 0, abbr: 'BUF', name: 'BUF', score: 14, timeouts: 3, players: [{ rosterIndex: 0, rush: { att: 3, yds: 9, td: 0 } }] },
    { id: 1, abbr: 'MIA', name: 'MIA', score: 7, timeouts: 3, players: [] },
  ],
  positions: [],
  frame: 0,
}

test('tube style off the field renders the tube without ticker numbers', () => {
  const { container } = render(<CrtView state={state} tracker={tracker} names={names} crtStyle="tube" canvasSlot={() => undefined} />)
  expect(screen.getByTestId('tube-style')).toBeInTheDocument()
  expect(container.querySelector('.ticker')?.textContent).not.toMatch(/\d/)
})

test('tube style in game shows the score in the ticker', () => {
  const { container } = render(<CrtView state={{ ...state, inGame: true }} tracker={tracker} names={names} crtStyle="tube" canvasSlot={() => undefined} />)
  expect(container.querySelector('.ticker')?.textContent).toContain('BUF 14  MIA 7')
})

test('null state renders the tube with no numbers', () => {
  const { container } = render(<CrtView state={null} tracker={tracker} names={names} crtStyle="tube" canvasSlot={() => undefined} />)
  expect(screen.getByTestId('tube-style')).toBeInTheDocument()
  expect(container.querySelector('.ticker')?.textContent).not.toMatch(/\d/)
})

test('console style renders ConsoleStyle', () => {
  render(<CrtView state={state} tracker={tracker} names={names} crtStyle="console" canvasSlot={() => undefined} />)
  expect(screen.getByTestId('console-style')).toBeInTheDocument()
  expect(screen.queryByTestId('tube-style')).toBeNull()
})
