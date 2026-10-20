import type { LeagueSpec } from '../sdk/types'
import { teamColors } from '../views/broadcast/teamColors'
import { leagueDetail } from './format'

export const TSB_LEAGUE: LeagueSpec = {
  path: 'football/nfl',
  aliases: { ARI: 'ARZ', JAC: 'JAX', LA: 'LAR', WSH: 'WAS' },
  colors: teamColors,
  detail: leagueDetail,
}
