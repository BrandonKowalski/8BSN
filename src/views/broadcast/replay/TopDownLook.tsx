import { useEffect, useState } from 'react'
import type { PlayResult } from '../../../game/playTracker'
import type { PlayerLookup } from '../../../game/useGame'
import { Field, fieldWindow, playStrokes, SIDE_BOTTOM, SIDE_TOP } from '../RouteReplay'
import { teamColor } from '../teamColors'

type Point = { x: number; y: number }
type Who = { team: 0 | 1; rosterIndex: number }

const FRAMES_PER_SECOND = 60
const TRAIL_FRAMES = 60
const HOLD_MS = 1500
const SCALE = 560

const teamOf = (slot: number): 0 | 1 => (slot < 11 ? 0 : 1)

export function topDownMs(play: PlayResult, rate = 1): number | null {
  const { frames } = play.tracks
  if (frames.length < 2) return null
  return (((frames[frames.length - 1] - frames[0]) / FRAMES_PER_SECOND) * 1000) / rate + HOLD_MS
}

function carriers(play: PlayResult): number[] {
  const out: number[] = []
  for (const point of play.ball) if (out[out.length - 1] !== point.slot) out.push(point.slot)
  return out
}

export function keyPlayers(play: PlayResult): Map<number, Who> {
  const out = new Map<number, Who>()
  const [first, next] = carriers(play)
  if (first === undefined) return out
  const { passer, receiver, rusher, defender } = play.people
  const offense = play.offense
  const lead = passer ?? (next === undefined || teamOf(next) !== offense ? rusher : undefined)
  if (lead !== undefined && teamOf(first) === offense) out.set(first, { team: offense, rosterIndex: lead })
  if (next === undefined) return out
  const after = receiver ?? rusher
  if (teamOf(next) === offense && after !== undefined) out.set(next, { team: offense, rosterIndex: after })
  else if (teamOf(next) !== offense && defender?.kind === 'int') out.set(next, { team: defender.team, rosterIndex: defender.rosterIndex })
  return out
}

function sampleAt(frames: number[], target: number): number {
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (frames[mid] <= target) lo = mid
    else hi = mid - 1
  }
  return lo
}

function useElapsed(rate: number, until: number): number {
  const [ms, setMs] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = (now - start) * rate
      setMs(elapsed)
      if (elapsed < until) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [rate, until])
  return ms
}

const trail = (points: Point[]) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join('')

export default function TopDownLook({ play, abbrs, player, rate = 1 }: { play: PlayResult; abbrs: [string, string]; player: PlayerLookup; rate?: number }) {
  const { frames, players } = play.tracks
  const span = frames.length > 1 ? ((frames[frames.length - 1] - frames[0]) / FRAMES_PER_SECOND) * 1000 : 0
  const ms = useElapsed(rate, span)
  if (players.length === 0) return null
  const target = frames[0] + (ms / 1000) * FRAMES_PER_SECOND
  const at = sampleAt(frames, target)
  let from = at
  while (from > 0 && frames[from - 1] >= frames[at] - TRAIL_FRAMES) from--
  const spots = [...players[0], ...players[players.length - 1]]
  const view = fieldWindow(play, playStrokes(play), [{ slot: 0, points: spots }])
  const u = view.w / SCALE
  const keys = keyPlayers(play)
  const colors = [teamColor(abbrs[0]), teamColor(abbrs[1])]
  const now = players[at]
  return (
    <svg className="topdown" data-testid="topdown" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid slice">
      <Field view={view} abbrs={abbrs} u={u} />
      <line className="field-los" x1={play.field.losX} x2={play.field.losX} y1={SIDE_TOP} y2={SIDE_BOTTOM} strokeWidth={2.5 * u} />
      {play.field.toGainX !== null && play.kind === 'scrimmage' && (
        <line className="field-gain" x1={play.field.toGainX} x2={play.field.toGainX} y1={SIDE_TOP} y2={SIDE_BOTTOM} strokeWidth={2.5 * u} />
      )}
      {now.map((_, slot) => (
        <path
          key={`t${slot}`}
          className="topdown-trail"
          d={trail(players.slice(from, at + 1).map((row) => row[slot]))}
          fill="none"
          stroke={colors[teamOf(slot)].primary}
          strokeWidth={2.5 * u}
        />
      ))}
      {now.map((p, slot) => (
        <circle
          key={`p${slot}`}
          data-testid="token"
          className={keys.has(slot) ? 'topdown-token topdown-key' : 'topdown-token'}
          cx={p.x}
          cy={p.y}
          r={6 * u}
          fill={colors[teamOf(slot)].primary}
          stroke={colors[teamOf(slot)].secondary}
          strokeWidth={1.8 * u}
        />
      ))}
      {[...keys].map(([slot, who]) => {
        const number = player(who.team, who.rosterIndex)?.number
        const p = now[slot]
        if (number === undefined || !p) return null
        return (
          <text key={`n${slot}`} data-testid="token-number" className="topdown-number" x={p.x} y={p.y - 9 * u} fontSize={12 * u} strokeWidth={2.5 * u} textAnchor="middle">
            {number}
          </text>
        )
      })}
    </svg>
  )
}
