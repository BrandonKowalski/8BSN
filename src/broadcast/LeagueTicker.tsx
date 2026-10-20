import Wordmark from '../brand/Wordmark'
import type { LeagueGame, TeamColor } from '../sdk/types'

const SECONDS_PER_GAME = 4
const MIN_SECONDS = 16
const NEUTRAL: TeamColor = { primary: '#333', secondary: '#999' }

const neutralColor = (): TeamColor => NEUTRAL

const plainDetail = (s: string): string => s.trim().toUpperCase()

export function startLabel(date: string, timeZone?: string): string {
  const t = new Date(date)
  if (Number.isNaN(t.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).formatToParts(t)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('weekday')} ${get('hour')}:${get('minute')} ${get('dayPeriod')}`.toUpperCase()
}

const pendingDetail = (g: LeagueGame, detail: (espn: string) => string, timeZone?: string): string => startLabel(g.date, timeZone) || detail(g.detail)

export const leagueEntry = (g: LeagueGame, timeZone?: string, detail: (espn: string) => string = plainDetail): string =>
  g.state === 'pre'
    ? `${g.away.abbr} AT ${g.home.abbr} ${pendingDetail(g, detail, timeZone)}`
    : `${g.away.abbr} ${g.away.score} ${g.home.abbr} ${g.home.score} ${detail(g.detail)}`

function Entry({ game, tagged, color, detail }: { game: LeagueGame; tagged: boolean; color: (abbr: string) => TeamColor; detail: (espn: string) => string }) {
  if (game.state === 'pre') {
    return (
      <span className="league-game" data-testid={tagged ? 'league-game' : undefined} data-state={game.state}>
        <span className="league-team" style={{ borderColor: color(game.away.abbr).primary }}>
          {game.away.abbr}
        </span>{' '}
        AT{' '}
        <span className="league-team" style={{ borderColor: color(game.home.abbr).primary }}>
          {game.home.abbr}
        </span>{' '}
        <span className="league-detail">{pendingDetail(game, detail)}</span>
      </span>
    )
  }
  return (
    <span className="league-game" data-testid={tagged ? 'league-game' : undefined} data-state={game.state}>
      <span className="league-team" style={{ borderColor: color(game.away.abbr).primary }}>
        {game.away.abbr} {game.away.score}
      </span>{' '}
      <span className="league-team" style={{ borderColor: color(game.home.abbr).primary }}>
        {game.home.abbr} {game.home.score}
      </span>{' '}
      <span className="league-detail">{detail(game.detail)}</span>
    </span>
  )
}

type Props = { games: LeagueGame[] | null; entering?: boolean; color?: (abbr: string) => TeamColor; detail?: (espn: string) => string }

export default function LeagueTicker({ games, entering = false, color = neutralColor, detail = plainDetail }: Props) {
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
  const key = games.map((g) => leagueEntry(g, undefined, detail)).join('|')
  const seconds = Math.max(MIN_SECONDS, games.length * SECONDS_PER_GAME)
  return (
    <div className={className} data-testid="around-the-league">
      <span className="league-title">AROUND THE LEAGUE</span>
      <div className="league-roll">
        <div className="league-track" key={key} style={{ animationDuration: `${seconds}s` }}>
          {[0, 1].map((copy) => (
            <div className="league-strip" key={copy} aria-hidden={copy === 1 ? true : undefined}>
              {games.map((g) => (
                <Entry game={g} tagged={copy === 0} color={color} detail={detail} key={g.id} />
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
