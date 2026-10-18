import { expect, test } from 'vitest'
import { formatBallOn, formatClock, formatDownDistance, formatQuarter, formatSituation, playerName } from './format'
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
