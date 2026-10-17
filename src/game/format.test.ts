import { expect, test } from 'vitest'
import { formatBallOn, formatClock, formatDownDistance, formatQuarter, formatSituation } from './format'
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

test('formatSituation shows KICKOFF, PAT or down and distance', () => {
  expect(formatSituation({ playKind: 'kickoff', isTry: false, down: 1, yardsToGo: 0 })).toBe('KICKOFF')
  expect(formatSituation({ playKind: 'scrimmage', isTry: true, down: 1, yardsToGo: 2 })).toBe('PAT')
  expect(formatSituation({ playKind: 'extraPoint', isTry: true, down: 1, yardsToGo: 0 })).toBe('PAT')
  expect(formatSituation({ playKind: 'punt', isTry: false, down: 4, yardsToGo: 16 })).toBe('4TH & 16')
  expect(formatSituation({ playKind: 'scrimmage', isTry: false, down: 3, yardsToGo: 4 })).toBe('3RD & 4')
})
