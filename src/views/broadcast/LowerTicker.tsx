import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { fitTag, playerTag, returningTeam, type TagFit } from '../../game/format'
import type { Lineup } from '../../game/lineups'
import type { PlayResult, PlayTracker, TrackerEvent } from '../../game/playTracker'
import type { RosterPlayer } from '../../game/roster'
import type { PlayerLookup } from '../../game/useGame'
import { teamColor } from './teamColors'

export const RETURN_TICKER_MS = 5000
const LINEUP_MS_PER_NAME = 1470
const NAME_CHARS = 22
const NAME_FITS: readonly TagFit[] = ['full', 'initial', 'last']
const KICK_WORDS: Partial<Record<PlayResult['kind'], string>> = { kickoff: 'KICKOFF', punt: 'PUNT' }

export const lineupMs = (count: number) => (count + 1) * LINEUP_MS_PER_NAME

export type Ticker = { kind: 'lineup'; lineup: Lineup } | { kind: 'return'; play: PlayResult }

const tickerMs = (ticker: Ticker) => (ticker.kind === 'lineup' ? lineupMs(ticker.lineup.players.length) : RETURN_TICKER_MS)

const returnable = (play: PlayResult) => KICK_WORDS[play.kind] !== undefined && play.kickResult !== null

function nameTag(p: RosterPlayer): string {
  return fitTag((fit) => {
    const { number, name } = playerTag(p, fit)
    return number ? `${number} ${name}` : name
  }, NAME_CHARS, NAME_FITS)
}

export function returnText(play: PlayResult, player: PlayerLookup): string | null {
  const word = KICK_WORDS[play.kind]
  if (!word || !returnable(play)) return null
  if (play.kickResult === 'touchback') return 'TOUCHBACK'
  if (play.kickResult === 'fairCatch') return 'FAIR CATCH'
  if (play.kickResult === 'outOfBounds') return `${word} OUT OF BOUNDS`
  const who = play.returner === null ? null : player(returningTeam(play), play.returner)
  const label = who && who.last ? `${nameTag(who)} ` : ''
  const yards = play.returnYards ?? 0
  return yards > 0 ? `${label}${yards} YARD ${word} RETURN` : `${label}NO RETURN`
}

export function useLowerTicker(events: TrackerEvent[], tracker: PlayTracker): Ticker | null {
  const [queue, setQueue] = useState<Ticker[]>([])
  const seen = useRef(new WeakSet<TrackerEvent>())
  const owner = useRef(tracker)

  useEffect(() => {
    const reset = owner.current !== tracker
    owner.current = tracker
    const fresh = events.filter((event) => !seen.current.has(event))
    for (const event of fresh) seen.current.add(event)
    if (!reset && fresh.length === 0) return
    setQueue((prior) =>
      fresh.reduce<Ticker[]>((queued, event) => {
        if (event.type === 'snap') return []
        if (event.type === 'lineup') return [...queued, { kind: 'lineup', lineup: event.lineup }]
        if (event.type === 'playEnd' && returnable(event.play)) return [...queued, { kind: 'return', play: event.play }]
        return queued
      }, reset ? [] : prior),
    )
  }, [events, tracker])

  const current = queue[0] ?? null
  useEffect(() => {
    if (!current) return
    const timer = window.setTimeout(() => setQueue((q) => (q[0] === current ? q.slice(1) : q)), tickerMs(current))
    return () => window.clearTimeout(timer)
  }, [current])

  return current
}

type Props = { ticker: Ticker | null; abbrs: [string, string]; player: PlayerLookup }

export default function LowerTicker({ ticker, abbrs, player }: Props) {
  if (!ticker) return null
  const team = ticker.kind === 'lineup' ? ticker.lineup.team : returningTeam(ticker.play)
  const abbr = abbrs[team]
  const color = teamColor(abbr)
  const style = { '--team-primary': color.primary, '--team-secondary': color.secondary } as CSSProperties
  const title = ticker.kind === 'lineup' ? `${abbr} ${ticker.lineup.unit === 'offense' ? 'OFFENSE' : 'DEFENSE'}` : abbr
  return (
    <div className={`lower-ticker lower-ticker-${ticker.kind}`} data-testid="lower-ticker" style={style}>
      <span className="lower-ticker-title" data-testid="lower-ticker-title">
        {title}
      </span>
      <div className="lower-ticker-roll">
        {ticker.kind === 'lineup' ? (
          <div className="lower-ticker-track" style={{ animationDuration: `${tickerMs(ticker)}ms` }}>
            {ticker.lineup.players.map(({ entry, role, rosterIndex }) => {
              const who = player(team, rosterIndex)
              if (!who || !who.last) return null
              return (
                <span className="lower-ticker-item" data-testid="lower-ticker-item" key={entry}>
                  <span className="lower-ticker-role">{role}</span> {nameTag(who)}
                </span>
              )
            })}
          </div>
        ) : (
          <span className="lower-ticker-item lower-ticker-text" data-testid="lower-ticker-item">
            {returnText(ticker.play, player)}
          </span>
        )}
      </div>
    </div>
  )
}
