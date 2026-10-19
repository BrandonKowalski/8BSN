import { useEffect, useMemo, useState } from 'react'
import type { PlayResult } from '../../../game/playTracker'
import type { PlayerLookup } from '../../../game/useGame'
import { carrierSamples } from '../../../game/analysis'
import { playerTag } from '../../../game/format'
import { crossing, dotBox, Field, fieldWindow, FumbleMark, fumbleLabel, numeralBoxes, PassMark, passEnded, playStrokes, SIDE_BOTTOM, SIDE_TOP, textBox, useAspect, type Box } from '../RouteReplay'
import PixelFootball, { FOOTBALL_HEIGHT, FOOTBALL_WIDTH } from '../PixelFootball'
import { teamColor } from '../teamColors'

type Point = { x: number; y: number }
type Who = { team: 0 | 1; rosterIndex: number }
type Sample = { sample: number; slot: number }

const FRAMES_PER_SECOND = 60
const TRAIL_FRAMES = 60
const HOLD_MS = 1500
const SCALE = 560
const BALL_WIDTH = 16

const teamOf = (slot: number): 0 | 1 => (slot < 11 ? 0 : 1)

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

function withFumble(play: PlayResult, keys: Map<number, Who>): Map<number, Who> {
  const fumble = play.fumble ?? null
  if (!fumble) return keys
  const out = new Map(keys)
  const fumbler = play.ball[fumble.index]?.slot
  if (fumble.by && fumbler !== undefined && !out.has(fumbler)) out.set(fumbler, fumble.by)
  if (fumble.recovery && fumble.recoveredBy) out.set(fumble.recovery.slot, fumble.recoveredBy)
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

function useElapsed(play: PlayResult, until: number, loop: boolean, restart: number): number {
  const run = `${play.index}:${play.endFrame}:${restart}`
  const [shown, setShown] = useState({ run, ms: 0 })
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const period = until + HOLD_MS
    const tick = (now: number) => {
      const real = loop ? (now - start) % period : now - start
      const ms = Math.min(real, until)
      setShown((prev) => (prev.run === run && prev.ms === ms ? prev : { run, ms }))
      if (loop || real < until) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, until, loop])
  return shown.run === run ? shown.ms : 0
}

function flightAt(play: PlayResult, frame: number): { ball: Point; landed: boolean } | null {
  const pass = play.pass
  if (!pass?.frames || frame < pass.frames[0]) return null
  const [start, end] = pass.frames
  const t = end > start ? Math.min(1, (frame - start) / (end - start)) : 1
  return { ball: { x: pass.from.x + (pass.to.x - pass.from.x) * t, y: pass.from.y + (pass.to.y - pass.from.y) * t }, landed: frame >= end }
}

function afterCatch(play: PlayResult, at: number): Point[] {
  const pass = play.pass
  const catcher = play.ball.find((p) => p.slot !== play.ball[0]?.slot)?.slot
  if (pass?.outcome !== 'caught' || !pass.frames || catcher === undefined) return []
  const caughtAt = pass.frames[1]
  const fumbledAt = play.fumble?.frame ?? Infinity
  const { frames, players } = play.tracks
  const run = players.slice(0, at + 1).filter((_, i) => frames[i] > caughtAt && frames[i] <= fumbledAt).map((row) => row[catcher])
  return run.length > 0 ? [pass.to, ...run] : []
}

function recoveryAt(play: PlayResult, at: number): Point[] {
  const fumble = play.fumble ?? null
  const recovery = fumble?.recovery
  if (!fumble || !recovery) return []
  const { frames, players } = play.tracks
  const run = players.slice(0, at + 1).filter((_, i) => frames[i] >= recovery.frame).map((row) => row[recovery.slot])
  return run.length > 0 ? [fumble.at, ...run] : []
}

type Spot = { at: Point; slot: number | null }

function ballAt(play: PlayResult, samples: Sample[], at: number, target: number): Spot | null {
  const pass = play.pass
  const flight = flightAt(play, target)
  if (pass && flight && !flight.landed) return { at: flight.ball, slot: null }
  if (pass && flight && passEnded(pass)) return { at: pass.to, slot: null }
  const fumble = play.fumble ?? null
  if (fumble && target >= fumble.frame && (!fumble.recovery || target < fumble.recovery.frame)) return { at: fumble.at, slot: null }
  const { frames, players } = play.tracks
  let k = -1
  while (k + 1 < samples.length && samples[k + 1].sample <= at) k++
  if (k < 0) return null
  const held = samples[k]
  if (pass?.frames && flight && frames[held.sample] < pass.frames[1]) return { at: pass.to, slot: null }
  const next = samples[k + 1]
  if (held.sample === at || !next || next.slot === held.slot) return { at: players[at][held.slot], slot: held.slot }
  const a = players[held.sample][held.slot]
  const b = players[next.sample][next.slot]
  const t = Math.min(1, Math.max(0, (target - frames[held.sample]) / (frames[next.sample] - frames[held.sample])))
  return { at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, slot: null }
}

const trail = (points: Point[]) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join('')

function prepare(play: PlayResult, abbrs: [string, string], player: PlayerLookup, aspect: number) {
  const { players } = play.tracks
  if (players.length === 0) return null
  const spots = [...players[0], ...players[players.length - 1]]
  const view = fieldWindow(play, playStrokes(play), [{ slot: 0, points: spots }], aspect)
  const u = view.w / SCALE
  const keys = withFumble(play, keyPlayers(play))
  const colors = [teamColor(abbrs[0]), teamColor(abbrs[1])]
  const tags = (row: Point[]) =>
    [...keys].flatMap(([slot, who]) => {
      const p = row[slot]
      const found = player(who.team, who.rosterIndex)
      const text = found && playerTag(found, 'lastNoPos').number
      return p && text ? [{ slot, x: p.x, y: p.y - 9 * u, text }] : []
    })
  const end = players[players.length - 1]
  const avoid: Box[] = [
    ...numeralBoxes(view, u),
    ...end.map((p) => dotBox(p, 6 * u + u)),
    ...tags(end).map((t) => textBox(t.x, t.y, t.text, 12 * u, u)),
  ]
  return { view, u, keys, colors, tags, avoid, samples: carrierSamples(play) }
}

function Ball({ at, u, beside }: { at: Point; u: number; beside: boolean }) {
  const width = BALL_WIDTH * u
  const height = (width * FOOTBALL_HEIGHT) / FOOTBALL_WIDTH
  const x = beside ? at.x + 4 * u : at.x - width / 2
  const y = beside ? at.y + 3 * u - height / 2 : at.y - height / 2
  return <PixelFootball className="topdown-football" testId="topdown-football" x={x} y={y} width={width} height={height} />
}

type Props = { play: PlayResult; abbrs: [string, string]; player: PlayerLookup; loop?: boolean; restart?: number }

export default function TopDownLook({ play, abbrs, player, loop = false, restart = 0 }: Props) {
  const [measure, aspect] = useAspect()
  const [home, away] = abbrs
  const setup = useMemo(() => prepare(play, [home, away], player, aspect), [play, home, away, player, aspect])
  const { frames, players } = play.tracks
  const span = frames.length > 1 ? ((frames[frames.length - 1] - frames[0]) / FRAMES_PER_SECOND) * 1000 : 0
  const ms = useElapsed(play, span, loop, restart)
  if (!setup) return null
  const { view, u, keys, colors, tags, avoid, samples } = setup
  const target = frames[0] + (ms / 1000) * FRAMES_PER_SECOND
  const at = sampleAt(frames, target)
  let from = at
  while (from > 0 && frames[from - 1] >= frames[at] - TRAIL_FRAMES) from--
  const now = players[at]
  const flight = flightAt(play, target)
  const pass = play.pass
  const caught = pass?.outcome === 'caught'
  const throughLine = pass && caught ? crossing(pass.from, pass.to, play.field.losX) : null
  const cross = pass && flight && throughLine ? crossing(pass.from, flight.ball, play.field.losX) : null
  const yac = afterCatch(play, at)
  const fumble = play.fumble ?? null
  const fumbled = fumble !== null && target >= fumble.frame
  const recovered = fumble?.recovery ? target >= fumble.recovery.frame : fumbled
  const recovery = recoveryAt(play, at)
  const recoveryColor = fumble?.recovery ? colors[teamOf(fumble.recovery.slot)] : null
  const ball = ballAt(play, samples, at, target)
  return (
    <svg ref={measure} className="topdown" data-testid="topdown" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid slice">
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
      {recoveryColor && recovery.length > 1 && (
        <>
          <path className="topdown-recovery" d={trail(recovery)} fill="none" stroke={recoveryColor.secondary} strokeWidth={5 * u} />
          <path data-testid="topdown-recovery" className="topdown-recovery" d={trail(recovery)} fill="none" stroke={recoveryColor.primary} strokeWidth={3 * u} />
        </>
      )}
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
      {pass && flight && (!caught || throughLine) && (
        <path data-testid="topdown-flight" className="topdown-flight" d={trail([pass.from, cross ?? flight.ball])} fill="none" strokeWidth={2.5 * u} strokeDasharray={`${6 * u} ${4 * u}`} />
      )}
      {pass && flight && caught && (cross || !throughLine) && (
        <path data-testid="topdown-air" className="topdown-flight topdown-air" d={trail([cross ?? pass.from, flight.ball])} fill="none" strokeWidth={2.5 * u} strokeDasharray={`${6 * u} ${4 * u}`} />
      )}
      {yac.length > 1 && <path data-testid="topdown-yac" className="topdown-yac" d={trail(yac)} fill="none" strokeWidth={3 * u} />}
      {ball && ball.slot !== null && (
        <circle data-testid="topdown-carrier" className="topdown-carrier" cx={ball.at.x} cy={ball.at.y} r={9 * u} fill="none" strokeWidth={2 * u} />
      )}
      {tags(now).map(({ slot, x, y, text }) => (
        <text key={`n${slot}`} data-testid="token-number" className="topdown-number" x={x} y={y} fontSize={12 * u} strokeWidth={2.5 * u} textAnchor="middle">
          {text}
        </text>
      ))}
      {fumble && fumbled && <FumbleMark at={fumble.at} label={recovered ? fumbleLabel(fumble, player) : ''} u={u} view={view} avoid={avoid} />}
      {ball && <Ball at={ball.at} u={u} beside={ball.slot !== null} />}
      {pass && flight?.landed && passEnded(pass) && <PassMark at={pass.to} label="" u={u} view={view} />}
    </svg>
  )
}
