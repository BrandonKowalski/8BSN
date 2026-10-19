import { expect, test } from 'vitest'
import { formatBallOn, formatClock, formatDownDistance, formatQuarter, formatSituation, goalToGo, playHeadline, playerLabel, playerName, redZone, scoreWord, TAG_FITS, fitTag } from './format'
import type { RosterPlayer } from './roster'
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

const field = { inBreak: false, quarter: 0, teams, ballOn: { yard: 30, side: 1 as const }, offense: 0 as const }

test('formatSituation shows KICKOFF, PAT or down and distance', () => {
  expect(formatSituation({ ...field, playKind: 'kickoff', isTry: false, down: 1, yardsToGo: 0 })).toBe('KICKOFF')
  expect(formatSituation({ ...field, playKind: 'scrimmage', isTry: true, down: 1, yardsToGo: 2 })).toBe('PAT')
  expect(formatSituation({ ...field, playKind: 'extraPoint', isTry: true, down: 1, yardsToGo: 0 })).toBe('PAT')
  expect(formatSituation({ ...field, playKind: 'punt', isTry: false, down: 4, yardsToGo: 16 })).toBe('4TH & 16')
  expect(formatSituation({ ...field, playKind: 'scrimmage', isTry: false, down: 3, yardsToGo: 4 })).toBe('3RD & 4')
})

const spot = (yard: number, side: 0 | 1, down = 1, yardsToGo = 10) => ({ ...field, playKind: 'scrimmage' as const, isTry: false, ballOn: { yard, side }, down, yardsToGo })

test('goalToGo is true once the line to gain reaches the goal line', () => {
  expect(goalToGo(spot(8, 1, 1, 8))).toBe(true)
  expect(goalToGo(spot(8, 1, 2, 0))).toBe(true)
  expect(goalToGo(spot(12, 1, 1, 10))).toBe(false)
  expect(goalToGo({ ...spot(8, 0, 1, 8), offense: 1 })).toBe(true)
  expect(goalToGo(spot(8, 0, 1, 8))).toBe(false)
})

test('formatSituation reads 1ST & GOAL whenever the line to gain is the goal line', () => {
  expect(formatSituation(spot(8, 1, 1, 8))).toBe('1ST & GOAL')
  expect(formatSituation(spot(3, 1, 3, 3))).toBe('3RD & GOAL')
  expect(formatSituation(spot(12, 1, 1, 10))).toBe('1ST & 10')
})

test('redZone is true with the offense within 20 yards of the goal', () => {
  expect(redZone(spot(20, 1))).toBe(true)
  expect(redZone(spot(1, 1))).toBe(true)
  expect(redZone(spot(21, 1))).toBe(false)
  expect(redZone(spot(15, 0))).toBe(false)
  expect(redZone({ ...spot(15, 0), offense: 1 })).toBe(true)
})

test('scoreWord names the score by its points', () => {
  expect(scoreWord(6, false)).toBe('TOUCHDOWN')
  expect(scoreWord(3, false)).toBe('FIELD GOAL')
  expect(scoreWord(2, false)).toBe('SAFETY')
  expect(scoreWord(1, true)).toBe('PAT')
  expect(scoreWord(2, true)).toBe('PAT')
  expect(scoreWord(5, false)).toBeNull()
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
      ballOn: { yard: 30, side: 1 },
      offense: 0,
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

const allen: RosterPlayer = { first: 'Josh', last: 'Allen', number: 17, position: 'QB' }

test('a player label reads number, name, position', () => {
  expect(playerLabel(allen, 'full')).toBe('#17 JOSH ALLEN QB')
  expect(playerLabel({ ...allen, first: '' }, 'full')).toBe('#17 ALLEN QB')
})

test('labels shorten in order and keep the number', () => {
  expect(TAG_FITS).toEqual(['full', 'initial', 'last', 'lastNoPos'])
  expect(TAG_FITS.map((fit) => playerLabel(allen, fit))).toEqual(['#17 JOSH ALLEN QB', '#17 J. ALLEN QB', '#17 ALLEN QB', '#17 ALLEN'])
  const knocked = (fit: (typeof TAG_FITS)[number]) => `KNOCKED DOWN BY ${playerLabel(allen, fit)}`
  expect(fitTag(knocked, 40)).toBe('KNOCKED DOWN BY #17 JOSH ALLEN QB')
  expect(fitTag(knocked, 31)).toBe('KNOCKED DOWN BY #17 J. ALLEN QB')
  expect(fitTag(knocked, 28)).toBe('KNOCKED DOWN BY #17 ALLEN QB')
  expect(fitTag(knocked, 25)).toBe('KNOCKED DOWN BY #17 ALLEN')
  expect(fitTag(knocked, 10)).toBe('KNOCKED DOWN BY #17 ALLEN')
})

const ROSTER: Record<number, { first: string; last: string }> = {
  0: { first: 'Kirk', last: 'Cousins' },
  1: { first: 'Davante', last: 'Adams' },
  2: { first: 'Bradley', last: 'Chubb' },
  3: { first: 'Jalen', last: 'Ramsey' },
  4: { first: 'Darius', last: 'Slay' },
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

const head = (overrides: Partial<PlayResult>, fit: 'full' | 'initial' | 'last' | 'lastNoPos' = 'full') => playHeadline(headPlay(overrides), lookup, fit)

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

test('playHeadline names the defender who knocked the pass down', () => {
  const thrown = { people: { passer: 0 }, yards: 0, thrown: true }
  const pass = { from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, target: null }
  expect(head({ ...thrown, pass: { ...pass, outcome: 'deflected', by: { team: 1, rosterIndex: 4 } } })).toBe('KIRK COUSINS PASS KNOCKED DOWN BY DARIUS SLAY')
  expect(head({ ...thrown, pass: { ...pass, outcome: 'deflected', by: { team: 1, rosterIndex: 4 } } }, 'last')).toBe('COUSINS PASS KNOCKED DOWN BY SLAY')
  expect(head({ ...thrown, pass: { ...pass, outcome: 'deflected' } })).toBe('KIRK COUSINS PASS INCOMPLETE')
  expect(head({ ...thrown, pass: { ...pass, outcome: 'incomplete' } })).toBe('KIRK COUSINS PASS INCOMPLETE')
})

test('playHeadline names the intended receiver on passes that are not caught', () => {
  const thrown = { people: { passer: 0 }, yards: 0, thrown: true }
  const pass = { from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, target: 1 }
  expect(head({ ...thrown, pass: { ...pass, outcome: 'incomplete' } })).toBe('KIRK COUSINS PASS INCOMPLETE, INTENDED FOR DAVANTE ADAMS')
  expect(head({ ...thrown, pass: { ...pass, outcome: 'deflected', by: { team: 1, rosterIndex: 4 } } })).toBe('KIRK COUSINS PASS INTENDED FOR DAVANTE ADAMS, KNOCKED DOWN BY DARIUS SLAY')
  expect(head({ ...thrown, pass: { ...pass, outcome: 'deflected' } })).toBe('KIRK COUSINS PASS INCOMPLETE, INTENDED FOR DAVANTE ADAMS')
  expect(head({ interception: true, summary: 'INTERCEPTED', thrown: true, pass: { ...pass, outcome: 'intercepted' }, people: { passer: 0, defender: { team: 1, rosterIndex: 3, kind: 'int' } } })).toBe('INTERCEPTED BY JALEN RAMSEY, INTENDED FOR DAVANTE ADAMS')
  expect(head({ ...thrown, pass: { ...pass, outcome: 'deflected', by: { team: 1, rosterIndex: 4 } } }, 'last')).toBe('COUSINS PASS INTENDED FOR ADAMS, KNOCKED DOWN BY SLAY')
  expect(head({ ...thrown, pass: { ...pass, outcome: 'incomplete', target: 9 } })).toBe('KIRK COUSINS PASS INCOMPLETE')
  expect(head({ ...thrown, pass: { ...pass, outcome: 'incomplete', target: null } })).toBe('KIRK COUSINS PASS INCOMPLETE')
})

test('playHeadline names who recovered a fumble', () => {
  const fumble = { at: { x: 0, y: 0 }, frame: 0, index: 0, by: { team: 0 as const, rosterIndex: 0 }, recovery: { slot: 0, frame: 0, index: 0 } }
  const run = { people: { rusher: 0 }, yards: 61, summary: 'COUSINS RUSH, 61 YDS, FUMBLE' }
  expect(head({ ...run, fumble: { ...fumble, recoveredBy: { team: 1, rosterIndex: 3 }, lost: true }, summary: 'FUMBLE LOST', people: {} })).toBe('KIRK COUSINS FUMBLE, RECOVERED BY JALEN RAMSEY')
  expect(head({ ...run, fumble: { ...fumble, recoveredBy: { team: 0, rosterIndex: 0 }, lost: false } })).toBe('KIRK COUSINS 61 YARD RUSH, FUMBLE, RECOVERED BY KIRK COUSINS')
  expect(head({ ...run, fumble: { ...fumble, recoveredBy: null, recovery: null, lost: false } }, 'last')).toBe('COUSINS 61 YARD RUSH, FUMBLE, OUT OF BOUNDS')
  expect(head({ fumble: { ...fumble, by: null, recoveredBy: { team: 1, rosterIndex: 3 }, lost: true }, summary: 'FUMBLE LOST' })).toBe('FUMBLE, RECOVERED BY JALEN RAMSEY')
  expect(head({ fumble: { ...fumble, recoveredBy: { team: 1, rosterIndex: 9 }, lost: true }, summary: 'FUMBLE LOST' })).toBe('FUMBLE LOST')
})

test('sentences use names only', () => {
  const fumble = { at: { x: 0, y: 0 }, frame: 0, index: 0, by: { team: 0 as const, rosterIndex: 0 }, recovery: { slot: 0, frame: 0, index: 0 } }
  const plays: Partial<PlayResult>[] = [
    { people: { passer: 0, receiver: 1 }, yards: 34, touchdown: true },
    { people: { rusher: 0 }, yards: 4 },
    { fumble: { ...fumble, recoveredBy: { team: 1, rosterIndex: 3 }, lost: true }, summary: 'FUMBLE LOST' },
    { people: { rusher: 0 }, fumble: { ...fumble, recoveredBy: { team: 0, rosterIndex: 1 }, lost: false } },
    { sack: true, yards: -7, people: { defender: { team: 1, rosterIndex: 2, kind: 'sack' } } },
  ]
  for (const fit of TAG_FITS) {
    for (const p of plays) {
      const text = head(p, fit)
      expect(text).not.toMatch(/#|\bQB\b/)
    }
  }
  expect(head(plays[0], 'lastNoPos')).toBe('COUSINS 34 YARD TOUCHDOWN PASS TO ADAMS')
  expect(head(plays[2])).toBe('KIRK COUSINS FUMBLE, RECOVERED BY JALEN RAMSEY')
})

test('playHeadline calls a QB run on a pass play a scramble', () => {
  expect(head({ people: { rusher: 0 }, scramble: true, yards: 12 })).toBe('KIRK COUSINS 12 YARD SCRAMBLE')
  expect(head({ people: { rusher: 0 }, scramble: true, yards: 12, touchdown: true })).toBe('KIRK COUSINS 12 YARD TOUCHDOWN SCRAMBLE')
  expect(head({ people: { rusher: 0 }, scramble: true, yards: -3 })).toBe('KIRK COUSINS 3 YARD LOSS')
  expect(head({ people: { rusher: 0 }, scramble: true, yards: 0 })).toBe('KIRK COUSINS NO GAIN')
})
