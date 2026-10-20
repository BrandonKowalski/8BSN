import type { LeagueData, LeagueGame, LeagueSpec, Records } from '../sdk/types'

export const leagueData = (spec: LeagueSpec | undefined, games: LeagueGame[] | null, records: Records | null): LeagueData => ({
  games,
  records,
  toRom: (abbr) => spec?.aliases?.[abbr] ?? abbr,
})
