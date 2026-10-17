import type { LeagueGame } from '../../league/espn'
import { teamColor } from './teamColors'

const SECONDS_PER_GAME = 4
const MIN_SECONDS = 16
const QUARTER = /^(1st|2nd|3rd|4th)\s+(.*)$/i

export function leagueDetail(detail: string): string {
  const quarter = QUARTER.exec(detail.trim())
  if (quarter) return `${quarter[1][0]}Q ${quarter[2]}`.toUpperCase()
  if (/^halftime$/i.test(detail.trim())) return 'HALF'
  return detail.trim().toUpperCase()
}

export const leagueEntry = (g: LeagueGame): string =>
  `${g.away.abbr} ${g.away.score} ${g.home.abbr} ${g.home.score} ${leagueDetail(g.detail)}`

function Entry({ game, tagged }: { game: LeagueGame; tagged: boolean }) {
  return (
    <span className="league-game" data-testid={tagged ? 'league-game' : undefined} data-state={game.state}>
      <span className="league-team" style={{ borderColor: teamColor(game.away.abbr).primary }}>
        {game.away.abbr} {game.away.score}
      </span>{' '}
      <span className="league-team" style={{ borderColor: teamColor(game.home.abbr).primary }}>
        {game.home.abbr} {game.home.score}
      </span>{' '}
      <span className="league-detail">{leagueDetail(game.detail)}</span>
    </span>
  )
}

export default function AroundTheLeague({ games }: { games: LeagueGame[] | null }) {
  if (!games || games.length === 0) return null
  const key = games.map(leagueEntry).join('|')
  const seconds = Math.max(MIN_SECONDS, games.length * SECONDS_PER_GAME)
  return (
    <div className="league" data-testid="around-the-league">
      <span className="league-title">AROUND THE NFL</span>
      <div className="league-roll">
        <div className="league-track" key={key} style={{ animationDuration: `${seconds}s` }}>
          {[0, 1].map((copy) => (
            <div className="league-strip" key={copy} aria-hidden={copy === 1 ? true : undefined}>
              {games.map((g) => (
                <Entry game={g} tagged={copy === 0} key={g.id} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
