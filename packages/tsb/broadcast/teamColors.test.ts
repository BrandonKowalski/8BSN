import { afterEach, expect, test } from 'vitest'
import { leagueColor, setTeamEra, teamColor, teamColors, TSB1991_COLORS } from './teamColors'

afterEach(() => setTeamEra({}))

test('the original game paints the Oilers and the 1991 teams in their own colors', () => {
  setTeamEra(TSB1991_COLORS)
  expect(teamColor('HOU')).toEqual(TSB1991_COLORS.HOU)
  expect(teamColor('RAMS')).toEqual(TSB1991_COLORS.RAMS)
  expect(teamColor('BUF')).toEqual(teamColors.BUF)
})

test('around the league keeps the modern colors whatever the game era', () => {
  setTeamEra(TSB1991_COLORS)
  expect(leagueColor('HOU')).toEqual(teamColors.HOU)
})

test('without an era the game uses the modern colors', () => {
  expect(teamColor('HOU')).toEqual(teamColors.HOU)
})
