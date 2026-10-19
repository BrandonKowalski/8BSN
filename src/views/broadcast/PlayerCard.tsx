import type { Headline } from '../../game/analysis'
import { fitTag, playerName } from '../../game/format'
import type { PlayResult } from '../../game/playTracker'
import type { GameState, PlayerStats } from '../../game/types'
import type { PlayerLookup } from '../../game/useGame'
import { teamColor } from './teamColors'

const NAME_BUDGET = 17

type Figure = { value: number | string; unit: string }

const own = (play: PlayResult, team: 0 | 1) => play.offense === team && play.kind === 'scrimmage' && !play.isTry && !play.sack

function long(plays: readonly PlayResult[], team: 0 | 1, carried: (play: PlayResult) => boolean): number {
  return plays.reduce((best, p) => (own(p, team) && carried(p) ? Math.max(best, p.yards) : best), 0)
}

export function gameLine(headline: Headline, stats: PlayerStats | undefined, plays: readonly PlayResult[]): Figure[] {
  const { team, rosterIndex: who, role } = headline
  if (role === 'rush' && stats?.rush) {
    const { att, yds, td } = stats.rush
    const longest = long(plays, team, (p) => p.people.rusher === who && p.people.passer === undefined)
    return [{ value: att, unit: 'CAR' }, { value: yds, unit: 'YDS' }, { value: td, unit: 'TD' }, { value: longest, unit: 'LONG' }]
  }
  if (role === 'rec' && stats?.rec) {
    const { rec, yds, td } = stats.rec
    return [{ value: rec, unit: 'REC' }, { value: yds, unit: 'YDS' }, { value: td, unit: 'TD' }, { value: long(plays, team, (p) => p.people.receiver === who), unit: 'LONG' }]
  }
  if (role === 'pass' && stats?.pass) {
    const { comp, att, yds, td, int } = stats.pass
    return [{ value: `${comp}/${att}`, unit: 'C/A' }, { value: yds, unit: 'YDS' }, { value: td, unit: 'TD' }, { value: int, unit: 'INT' }]
  }
  if (role === 'def' && stats?.def) return [{ value: stats.def.sacks, unit: 'SK' }, { value: stats.def.int, unit: 'INT' }]
  return []
}

type Props = { headline: Headline; state: GameState; player: PlayerLookup; plays: readonly PlayResult[] }

export default function PlayerCard({ headline, state, player, plays }: Props) {
  const who = player(headline.team, headline.rosterIndex)
  const colors = teamColor(state.teams[headline.team].abbr)
  const stats = state.teams[headline.team].players.find((p) => p.rosterIndex === headline.rosterIndex)
  const number = who && Number.isFinite(who.number) ? String(who.number) : null
  const name = who ? fitTag((fit) => playerName(who, fit), NAME_BUDGET, ['full', 'initial', 'last']) : ''
  return (
    <section className="pkg-panel pkg-drive player-card" data-testid="player-card">
      <div className="player-card-block" data-testid="player-card-block" style={{ backgroundColor: colors.primary, borderColor: colors.secondary }}>
        {number && <span className="player-card-num">{number}</span>}
        {who?.position && <span className="player-card-pos">{who.position}</span>}
      </div>
      <div className="player-card-body">
        <div className="player-card-name" data-testid="player-card-name">
          {name}
        </div>
        <div className="player-card-line" data-testid="player-card-line">
          {gameLine(headline, stats, plays).map((f) => (
            <span className="pkg-value" key={f.unit}>
              {f.value}
              <span className="pkg-unit">{f.unit}</span>
            </span>
          ))}
        </div>
        <div className="player-card-headline" data-testid="player-card-headline">
          {headline.text}
        </div>
      </div>
    </section>
  )
}
