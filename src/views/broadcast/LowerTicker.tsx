import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { fitTag, playerTag, type TagFit } from '../../game/format'
import type { Lineup } from '../../game/lineups'
import type { PlayTracker, TrackerEvent } from '../../game/playTracker'
import type { RosterPlayer } from '../../game/roster'
import type { PlayerLookup } from '../../game/useGame'
import { teamColor } from './teamColors'

export const LINEUP_SEEN_MS = 3000
export const BAND_EXIT_MS = 400
const LINEUP_MS_PER_NAME = 1470
const NAME_CHARS = 22
const NAME_FITS: readonly TagFit[] = ['full', 'initial', 'last']

export const lineupMs = (count: number) => count * LINEUP_MS_PER_NAME

export type Ticker = { kind: 'lineup'; lineup: Lineup }
export type Band = { ticker: Ticker | null; leaving: boolean; entering: boolean; offsetMs: number }

const tickerMs = (ticker: Ticker) => lineupMs(ticker.lineup.players.length)

function nameTag(p: RosterPlayer): string {
  return fitTag((fit) => {
    const { number, name } = playerTag(p, fit)
    return number ? `${number} ${name}` : name
  }, NAME_CHARS, NAME_FITS)
}

export function useLowerTicker(events: TrackerEvent[], tracker: PlayTracker, visible = true, generation = 0): Band {
  const [queue, setQueue] = useState<Ticker[]>([])
  const [leavingTicker, setLeavingTicker] = useState<Ticker | null>(null)
  const [entering, setEntering] = useState(false)
  const seen = useRef(new WeakSet<TrackerEvent>())
  const owner = useRef({ tracker, generation })

  useEffect(() => {
    const reset = owner.current.tracker !== tracker || owner.current.generation !== generation
    owner.current = { tracker, generation }
    const fresh = events.filter((event) => !seen.current.has(event))
    for (const event of fresh) seen.current.add(event)
    if (reset) {
      setQueue([])
      setLeavingTicker(null)
      return
    }
    if (fresh.length === 0) return
    setQueue((prior) =>
      fresh.reduce<Ticker[]>((queued, event) => {
        if (event.type === 'snap') return []
        if (event.type === 'lineup') return [...queued, { kind: 'lineup', lineup: event.lineup }]
        return queued
      }, prior),
    )
  }, [events, tracker, generation])

  const current = queue[0] ?? null
  const spent = useRef<{ ticker: Ticker | null; ms: number }>({ ticker: null, ms: 0 })
  if (spent.current.ticker !== current) spent.current = { ticker: current, ms: 0 }
  const leaving = current !== null && leavingTicker === current

  useEffect(() => {
    if (!current || leaving || !visible) return
    const started = Date.now()
    const used = spent.current.ms
    const timers: number[] = []
    const seenAt = Math.min(LINEUP_SEEN_MS, tickerMs(current))
    if (used < seenAt) timers.push(window.setTimeout(() => tracker.lineupSeen(current.lineup), seenAt - used))
    timers.push(window.setTimeout(() => setLeavingTicker(current), Math.max(0, tickerMs(current) - used)))
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
      if (spent.current.ticker === current) spent.current.ms += Date.now() - started
    }
  }, [current, leaving, visible, tracker])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => {
      setQueue((q) => (q[0] === current ? q.slice(1) : q))
      setLeavingTicker(null)
      setEntering(true)
    }, BAND_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, current])

  useEffect(() => {
    if (!entering) return
    const timer = window.setTimeout(() => setEntering(false), BAND_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [entering])

  return { ticker: current, leaving, entering: entering && current === null, offsetMs: spent.current.ms }
}

type Props = { band: Band; abbrs: [string, string]; player: PlayerLookup }

export default function LowerTicker({ band, abbrs, player }: Props) {
  const { ticker, leaving, offsetMs } = band
  if (!ticker) return null
  const team = ticker.lineup.team
  const abbr = abbrs[team]
  const color = teamColor(abbr)
  const style = { '--team-primary': color.primary, '--team-secondary': color.secondary } as CSSProperties
  const title = `${abbr} ${ticker.lineup.unit === 'offense' ? 'OFFENSE' : 'DEFENSE'}`
  return (
    <div className={`lower-ticker lower-ticker-lineup${leaving ? ' lower-ticker-leaving' : ''}`} data-testid="lower-ticker" style={style}>
      <span className="lower-ticker-title" data-testid="lower-ticker-title">
        {title}
      </span>
      <div className="lower-ticker-roll">
        <div className="lower-ticker-track" data-testid="lower-ticker-track" style={{ animationDuration: `${tickerMs(ticker)}ms`, animationDelay: `-${offsetMs}ms` }}>
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
      </div>
    </div>
  )
}
