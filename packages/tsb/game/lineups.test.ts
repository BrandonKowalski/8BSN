import { expect, test } from 'vitest'
import { loadReplayFixture, replaySnapshots } from '../tools/replayFixture'
import { decodeGameState, rosterIndexAt } from './decode'
import { DEFENSE_ROLES, OFFENSE_ROLES, startersAt } from './lineups'
import { TSB2026_MAP } from './maps/tsb2026'

const fixture = loadReplayFixture('packages/tsb/fixtures/tsb2026/replay-game-a.json.gz')

function playSelectOf(window: string) {
  for (const snap of replaySnapshots(fixture, window)) if (decodeGameState(snap, TSB2026_MAP, []).playSelect) return snap
  throw new Error('no play select')
}

test('the starters at play select list each unit in role order with their roster index', () => {
  const snap = playSelectOf('kickoff')
  expect(snap.frame).toBe(2928)
  const offense = startersAt(snap, TSB2026_MAP, 0, 'offense')
  expect(offense.map((p) => p.role)).toEqual(OFFENSE_ROLES)
  expect(offense.map((p) => p.rosterIndex)).toEqual([0, 2, 3, 6, 7, 10, 12, 13, 14, 15, 16])
  const defense = startersAt(snap, TSB2026_MAP, 1, 'defense')
  expect(defense.map((p) => p.role)).toEqual(DEFENSE_ROLES)
  expect(defense.map((p) => p.rosterIndex)).toEqual([17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27])
  expect(defense.map((p) => p.entry)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21])
})

test('the starters are the players the game puts on the field at the snap', () => {
  for (const snap of replaySnapshots(fixture, 'kickoff')) {
    if (snap.frame !== 3172) continue
    const onField = (from: number) => Array.from({ length: 11 }, (_, i) => rosterIndexAt(snap, TSB2026_MAP, from + i)).sort((a, b) => (a ?? 0) - (b ?? 0))
    expect(onField(0)).toEqual(startersAt(snap, TSB2026_MAP, 0, 'offense').map((p) => p.rosterIndex))
    expect(onField(11)).toEqual(startersAt(snap, TSB2026_MAP, 1, 'defense').map((p) => p.rosterIndex))
  }
})

test("an entry whose team byte is not that side's team is left out", () => {
  const snap = playSelectOf('kickoff')
  const copy = { ...snap, sram: snap.sram.slice() }
  copy.sram[TSB2026_MAP.lineups.addrs[1].offset + 22] = 0xff
  expect(startersAt(copy, TSB2026_MAP, 1, 'defense').map((p) => p.role)).toEqual(DEFENSE_ROLES.slice(1))
})
