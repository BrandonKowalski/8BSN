import { formatClock, formatQuarter, formatSituation } from '../../game/format'
import type { PlayTracker } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import { defLine, passLine, recLine, rushLine } from './statLines'

export type Names = (team: 0 | 1, rosterIndex: number) => string

const SCROLL_SECONDS_PER_CHAR = 0.22
const SCROLL_MIN_SECONDS = 20

export function fixedSegment(state: GameState): string {
  const [a, b] = state.teams
  return `${a.abbr} ${a.score}  ${b.abbr} ${b.score}  ${formatQuarter(state.quarter)} ${formatClock(state.clock)}  ${formatSituation(state)}`
}

export function tickerItems(state: GameState, tracker: PlayTracker, names: Names): string[] {
  const items: string[] = []
  for (const side of [0, 1] as const) {
    for (const player of state.teams[side].players) {
      const name = names(side, player.rosterIndex)
      if (!name) continue
      const { pass, rush, rec, def } = player
      if (pass && pass.att > 0) items.push(passLine(name, pass))
      if (rush && rush.att > 0) items.push(rushLine(name, rush))
      if (rec && rec.rec > 0) items.push(recLine(name, rec))
      if (def && (def.sacks > 0 || def.int > 0)) items.push(defLine(name, def))
    }
  }
  for (const side of [0, 1] as const) {
    const run = tracker.longest(side, 'rush')
    if (run > 0) items.push(`LONG RUN ${state.teams[side].abbr} ${run}`)
    const catchYards = tracker.longest(side, 'rec')
    if (catchYards > 0) items.push(`LONG REC ${state.teams[side].abbr} ${catchYards}`)
  }
  const moments = tracker.moments()
  const last = moments[moments.length - 1]
  if (last) items.push(last.text)
  return items
}

type Props = { state: GameState | null; tracker: PlayTracker; names: Names }

export default function Ticker({ state, tracker, names }: Props) {
  if (!state || !state.inGame) {
    return (
      <div className="ticker">
        <span className="ticker-title">TECMO BROADCAST</span>
      </div>
    )
  }
  const items = tickerItems(state, tracker, names)
  const joined = items.join('|')
  const seconds = Math.max(SCROLL_MIN_SECONDS, joined.length * SCROLL_SECONDS_PER_CHAR)
  return (
    <div className="ticker">
      <span className="ticker-fixed">{fixedSegment(state)}</span>
      <div className="ticker-roll">
        {items.length > 0 && (
          <div className="ticker-track" key={joined} style={{ animationDuration: `${seconds}s` }}>
            {[0, 1].map((copy) => (
              <div className="ticker-strip" key={copy} aria-hidden={copy === 1 ? true : undefined}>
                {items.map((item, i) => (
                  <span className="ticker-item" key={i}>
                    {item}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
