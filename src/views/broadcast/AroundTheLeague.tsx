import type { LeagueGame } from '../../league/espn'
import Wordmark from '../../brand/Wordmark'
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

export function kickoffLabel(date: string, timeZone?: string): string {
  const t = new Date(date)
  if (Number.isNaN(t.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).formatToParts(t)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('weekday')} ${get('hour')}:${get('minute')} ${get('dayPeriod')}`.toUpperCase()
}

const pendingDetail = (g: LeagueGame, timeZone?: string): string => kickoffLabel(g.date, timeZone) || leagueDetail(g.detail)

export const leagueEntry = (g: LeagueGame, timeZone?: string): string =>
  g.state === 'pre'
    ? `${g.away.abbr} AT ${g.home.abbr} ${pendingDetail(g, timeZone)}`
    : `${g.away.abbr} ${g.away.score} ${g.home.abbr} ${g.home.score} ${leagueDetail(g.detail)}`

function Entry({ game, tagged }: { game: LeagueGame; tagged: boolean }) {
  if (game.state === 'pre') {
    return (
      <span className="league-game" data-testid={tagged ? 'league-game' : undefined} data-state={game.state}>
        <span className="league-team" style={{ borderColor: teamColor(game.away.abbr).primary }}>
          {game.away.abbr}
        </span>{' '}
        AT{' '}
        <span className="league-team" style={{ borderColor: teamColor(game.home.abbr).primary }}>
          {game.home.abbr}
        </span>{' '}
        <span className="league-detail">{pendingDetail(game)}</span>
      </span>
    )
  }
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

export default function AroundTheLeague({ games, entering = false }: { games: LeagueGame[] | null; entering?: boolean }) {
  const className = entering ? 'league league-enter' : 'league'
  if (!games || games.length === 0) {
    return (
      <div className={`${className} league-fallback`} data-testid="around-the-league">
        <span className="league-brand">
          <Wordmark variant="c3" />
        </span>
        <span className="league-title">8-BIT SPORTS NETWORK</span>
      </div>
    )
  }
  const key = games.map((g) => leagueEntry(g)).join('|')
  const seconds = Math.max(MIN_SECONDS, games.length * SECONDS_PER_GAME)
  return (
    <div className={className} data-testid="around-the-league">
      <span className="league-title">AROUND THE LEAGUE</span>
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
      <span className="league-brand">
        <Wordmark variant="c3" />
      </span>
    </div>
  )
}
