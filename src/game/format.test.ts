import { expect, test } from 'vitest'
import { formatBallOn, formatClock, formatDownDistance, formatQuarter, formatSituation, playHeadline, playerName } from './format'
import type { PlayResult } from './playTracker'
import type { TeamState } from './types'

const team = (abbr: string): TeamState => ({ id: 0, abbr, name: abbr, score: 0, timeouts: 3, players: [] })
const teams: [TeamState, TeamState] = [team('BUF'), team('CLE')]

test('formatQuarter', () => {
  expect(formatQuarter(0)).toBe('1ST')
  expect(formatQuarter(3)).toBe('4TH')
  expect(formatQuarter(4)).toBe('OT')
})

test('formatClock pads seconds', () => {
  expect(formatClock({ min: 3, sec: 5 })).toBe('3:05')
})

test('formatDownDistance', () => {
  expect(formatDownDistance(3, 4)).toBe('3RD & 4')
  expect(formatDownDistance(1, 0)).toBe('1ST & GOAL')
})

test('formatBallOn', () => {
  expect(formatBallOn({ yard: 35, side: 0 }, teams)).toBe('BUF 35')
  expect(formatBallOn({ yard: 20, side: 1 }, teams)).toBe('CLE 20')
  expect(formatBallOn({ yard: 50, side: null }, teams)).toBe('50')
})

const field = { inBreak: false, quarter: 0, teams }

test('formatSituation shows KICKOFF, PAT or down and distance', () => {
  expect(formatSituation({ ...field, playKind: 'kickoff', isTry: false, down: 1, yardsToGo: 0 })).toBe('KICKOFF')
  expect(formatSituation({ ...field, playKind: 'scrimmage', isTry: true, down: 1, yardsToGo: 2 })).toBe('PAT')
  expect(formatSituation({ ...field, playKind: 'extraPoint', isTry: true, down: 1, yardsToGo: 0 })).toBe('PAT')
  expect(formatSituation({ ...field, playKind: 'punt', isTry: false, down: 4, yardsToGo: 16 })).toBe('4TH & 16')
  expect(formatSituation({ ...field, playKind: 'scrimmage', isTry: false, down: 3, yardsToGo: 4 })).toBe('3RD & 4')
})

test('formatSituation names the break', () => {
  const at = (quarter: number, scores: [number, number] = [3, 7]) =>
    formatSituation({
      inBreak: true,
      quarter,
      teams: [{ ...team('BUF'), score: scores[0] }, { ...team('CLE'), score: scores[1] }],
      playKind: 'kickoff',
      isTry: true,
      down: 1,
      yardsToGo: 10,
    })
  expect(at(0)).toBe('END 1ST')
  expect(at(1)).toBe('HALFTIME')
  expect(at(2)).toBe('END 3RD')
  expect(at(3)).toBe('FINAL')
  expect(at(3, [7, 7])).toBe('END 4TH')
  expect(at(4)).toBe('FINAL')
})

test('player names fit full, initial and last', () => {
  const cook = { first: 'James', last: 'Cook' }
  expect(playerName(cook, 'full')).toBe('JAMES COOK')
  expect(playerName(cook, 'initial')).toBe('J. COOK')
  expect(playerName(cook, 'last')).toBe('COOK')
  expect(playerName({ first: '', last: 'Cook' }, 'initial')).toBe('COOK')
})

const ROSTER: Record<number, { first: string; last: string }> = {
  0: { first: 'Kirk', last: 'Cousins' },
  1: { first: 'Davante', last: 'Adams' },
  2: { first: 'Bradley', last: 'Chubb' },
  3: { first: 'Jalen', last: 'Ramsey' },
}
const lookup = (_team: 0 | 1, index: number) => (ROSTER[index] ? { ...ROSTER[index], number: 1, position: 'QB' as const } : null)

const headPlay = (overrides: Partial<PlayResult>): PlayResult =>
  ({
    yards: 5,
    touchdown: false,
    sack: false,
    interception: false,
    kicked: false,
    thrown: false,
    kind: 'scrimmage',
    isTry: false,
    summary: 'SOMETHING, 5 YDS',
    offense: 0,
    people: {},
    ...overrides,
  }) as PlayResult

const head = (overrides: Partial<PlayResult>, fit: 'full' | 'initial' | 'last' = 'full') => playHeadline(headPlay(overrides), lookup, fit)

test('playHeadline writes runs, losses and no gain', () => {
  expect(head({ people: { rusher: 0 } })).toBe('KIRK COUSINS 5 YARD RUSH')
  expect(head({ people: { rusher: 0 }, yards: 1 })).toBe('KIRK COUSINS 1 YARD RUSH')
  expect(head({ people: { rusher: 0 }, yards: -3 })).toBe('KIRK COUSINS 3 YARD LOSS')
  expect(head({ people: { rusher: 0 }, yards: 0 })).toBe('KIRK COUSINS NO GAIN')
})

test('playHeadline writes completions and incompletions', () => {
  expect(head({ people: { passer: 0, receiver: 1 }, yards: 22 })).toBe('KIRK COUSINS 22 YARD PASS TO DAVANTE ADAMS')
  expect(head({ people: { passer: 0 }, yards: 0 })).toBe('KIRK COUSINS PASS INCOMPLETE')
})

test('playHeadline writes touchdowns', () => {
  expect(head({ people: { rusher: 0 }, yards: 7, touchdown: true })).toBe('KIRK COUSINS 7 YARD TOUCHDOWN RUN')
  expect(head({ people: { passer: 0, receiver: 1 }, yards: 34, touchdown: true })).toBe('KIRK COUSINS 34 YARD TOUCHDOWN PASS TO DAVANTE ADAMS')
})

test('playHeadline writes sacks, interceptions and fumbles', () => {
  expect(head({ sack: true, yards: -7 })).toBe('SACKED FOR 7 YARD LOSS')
  expect(head({ sack: true, yards: -7, people: { defender: { team: 1, rosterIndex: 2, kind: 'sack' } } })).toBe('BRADLEY CHUBB SACK, 7 YARD LOSS')
  expect(head({ interception: true, summary: 'INTERCEPTED', people: { defender: { team: 1, rosterIndex: 3, kind: 'int' } } })).toBe('INTERCEPTED BY JALEN RAMSEY')
  expect(head({ interception: true, summary: 'INTERCEPTED' })).toBe('INTERCEPTED')
  expect(head({ summary: 'FUMBLE LOST' })).toBe('FUMBLE LOST')
  expect(head({ people: { rusher: 0 }, yards: 4, summary: 'KIRK COUSINS RUSH, 4 YDS, FUMBLE' })).toBe('KIRK COUSINS 4 YARD RUSH, FUMBLE')
})

test('playHeadline keeps the tracker words for kicks, tries and unknown people', () => {
  expect(head({ kind: 'fieldGoal', summary: 'FIELD GOAL GOOD' })).toBe('FIELD GOAL GOOD')
  expect(head({ kind: 'punt', kicked: true, summary: 'PUNT' })).toBe('PUNT')
  expect(head({ kind: 'kickoff', kicked: true, summary: 'KICKOFF' })).toBe('KICKOFF')
  expect(head({ isTry: true, kind: 'extraPoint', summary: 'PAT GOOD', people: { rusher: 0 } })).toBe('PAT GOOD')
  expect(head({ summary: 'BUF RUN, 5 YDS' })).toBe('BUF RUN, 5 YDS')
})

test('playHeadline shortens names by fit', () => {
  expect(head({ people: { rusher: 0 } }, 'initial')).toBe('K. COUSINS 5 YARD RUSH')
  expect(head({ people: { passer: 0, receiver: 1 }, yards: 22 }, 'last')).toBe('COUSINS 22 YARD PASS TO ADAMS')
})
