import { expect, it } from 'vitest'
import { leagueData } from './leagueData'

it('maps ESPN abbreviations through the spec aliases and passes the feed through', () => {
  const records = new Map([['KC', '5-0']])
  const data = leagueData({ path: 'football/nfl', aliases: { WSH: 'WAS' } }, [], records)
  expect(data.toRom('WSH')).toBe('WAS')
  expect(data.toRom('KC')).toBe('KC')
  expect(data.games).toEqual([])
  expect(data.records).toBe(records)
})

it('leaves abbreviations alone without a spec', () => {
  const data = leagueData(undefined, null, null)
  expect(data.toRom('WSH')).toBe('WSH')
  expect(data.games).toBeNull()
  expect(data.records).toBeNull()
})
