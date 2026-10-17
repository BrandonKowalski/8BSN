import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PlayTracker, type Drive } from '../../game/playTracker'
import type { GameState, PlayerStats, TeamState } from '../../game/types'
import StatBoard, { boardPages } from './StatBoard'

const NAMES = ['ALLEN', 'COOK', 'KINCAID', 'OLIVER', 'IDLE']
const names = (_team: 0 | 1, index: number) => NAMES[index] ?? ''

function team(abbr: string, score: number, players: PlayerStats[]): TeamState {
  return { id: 0, abbr, name: abbr, score, timeouts: 3, players }
}

function makeState(overrides: Partial<GameState> = {}, defense = true): GameState {
  return {
    inGame: true,
    live: true,
    playOver: false,
    touchdown: false,
    sack: false,
    kicked: false,
    quarter: 1,
    clock: { min: 3, sec: 12 },
    down: 3,
    yardsToGo: 4,
    ballOn: { yard: 30, side: 0 },
    offense: 0,
    teams: [
      team('BUF', 14, [
        { rosterIndex: 0, pass: { att: 17, comp: 11, yds: 142, td: 0, int: 1 } },
        { rosterIndex: 1, rush: { att: 11, yds: 74, td: 1 } },
        { rosterIndex: 2, rec: { rec: 4, yds: 51, td: 0 } },
      ]),
      team('MIA', 7, defense ? [{ rosterIndex: 3, def: { sacks: 1, int: 0 } }] : []),
    ],
    positions: [],
    frame: 1,
    ...overrides,
  }
}

function trackerWith(drives: Drive[]): PlayTracker {
  const tracker = new PlayTracker({ recordRoutes: false })
  vi.spyOn(tracker, 'drives').mockReturnValue(drives)
  return tracker
}

const drive = (offense: 0 | 1, plays: number, yards: number, result: Drive['result']): Drive => ({
  offense,
  plays,
  yards,
  startClock: '15:00',
  result,
})

const noDrives = () => trackerWith([])
const titles = (pages: { title: string }[]) => pages.map((p) => p.title)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('boardPages omits DEFENSE when there are no sacks or interceptions', () => {
  expect(titles(boardPages(makeState({}, true), noDrives(), names))).toContain('DEFENSE')
  expect(titles(boardPages(makeState({}, false), noDrives(), names))).toEqual(['PASSING', 'RUSHING', 'RECEIVING'])
})

test('DRIVES lines read abbreviation, plays, yards and result', () => {
  const tracker = trackerWith([drive(0, 8, 62, 'TD'), drive(1, 3, 4, 'PUNT'), drive(0, 5, 20, 'END_OF_HALF'), drive(1, 2, 9, 'IN_PROGRESS')])
  const page = boardPages(makeState(), tracker, names).find((p) => p.title === 'DRIVES')
  expect(page?.lines).toEqual([
    'BUF 8 PLAYS 62 YDS TD',
    'MIA 3 PLAYS 4 YDS PUNT',
    'BUF 5 PLAYS 20 YDS HALF',
    'MIA 2 PLAYS 9 YDS IN PROGRESS',
  ])
})

test('DRIVES shows only the four most recent drives', () => {
  const tracker = trackerWith([1, 2, 3, 4, 5, 6].map((n) => drive(0, n, 10, 'FG')))
  const page = boardPages(makeState(), tracker, names).find((p) => p.title === 'DRIVES')
  expect(page?.lines.map((l) => l.split(' ')[1])).toEqual(['3', '4', '5', '6'])
})

test('the board shows the fixed block and advances page after 6000 ms', () => {
  render(<StatBoard state={makeState()} tracker={noDrives()} names={names} />)
  expect(screen.getByTestId('board-fixed')).toHaveTextContent('BUF')
  expect(screen.getByTestId('board-fixed')).toHaveTextContent('14')
  expect(screen.getByTestId('board-fixed')).toHaveTextContent('3RD')
  expect(screen.getByTestId('board-title')).toHaveTextContent('PASSING')
  act(() => {
    vi.advanceTimersByTime(5999)
  })
  expect(screen.getByTestId('board-title')).toHaveTextContent('PASSING')
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(screen.getByTestId('board-title')).toHaveTextContent('RUSHING')
})

test('state commits do not reset the rotation timer', () => {
  const tracker = noDrives()
  const { rerender } = render(<StatBoard state={makeState()} tracker={tracker} names={names} />)
  act(() => {
    vi.advanceTimersByTime(4000)
  })
  rerender(<StatBoard state={makeState({ frame: 2 })} tracker={tracker} names={names} />)
  act(() => {
    vi.advanceTimersByTime(2000)
  })
  expect(screen.getByTestId('board-title')).toHaveTextContent('RUSHING')
})

test('off the field the board shows no numbers', () => {
  const { container } = render(<StatBoard state={makeState({ inGame: false })} tracker={noDrives()} names={names} />)
  expect(container.textContent).not.toMatch(/\d/)
})

test('the timer is cleared on unmount', () => {
  const { unmount } = render(<StatBoard state={makeState()} tracker={noDrives()} names={names} />)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
