import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { emptySnapshot, type Snapshot, type ReplayView } from '@8bsn/sdk'
import { ballSamples, separation } from '../../game/analysis'
import { fieldOnScreen, fieldToScreenFeet } from '../../game/camera'
import { fitTag, playHeadline, type TagFit } from '../../game/format'
import { TSB2026_MAP } from '../../game/maps/tsb2026'
import type { BallPoint, PlayResult } from '../../game/playTracker'
import type { PlayerLookup } from '../../game/useGame'
import { beforeTurnover, crossing, FumbleMark, PassMark, passEnded, recoveryRun, SIDE_BOTTOM, SIDE_TOP } from '../RouteReplay'
import { teamColor } from '../teamColors'
import type { Replayed } from './tsbMoments'

type Point = { x: number; y: number }

const MAP = TSB2026_MAP
const CAPTION_CHARS = 40
const SENTENCE_FITS: readonly TagFit[] = ['full', 'initial', 'last']
export const CAPTION_BUDGET = 120
const CAPTION_MAX = 3.8
export const STRIP_BUDGET = 120
export const STRIP_MAX = 2.4
const STRIP_GAP = '  '
const JUMP = 16

export function captionText(play: PlayResult, player: PlayerLookup): string {
  return fitTag((fit) => playHeadline(play, player, fit), CAPTION_CHARS, SENTENCE_FITS)
}

export const captionSize = (text: string) => Math.min(CAPTION_MAX, CAPTION_BUDGET / Math.max(1, text.length))

function Caption({ play, player }: { play: PlayResult; player: PlayerLookup }) {
  const text = captionText(play, player)
  return (
    <div className="replay-caption" data-testid="replay-caption" style={{ fontSize: `${captionSize(text)}cqh` }}>
      <span className="replay-caption-text">{text}</span>
    </div>
  )
}

const teamOf = (slot: number): 0 | 1 => (slot < 11 ? 0 : 1)

function ballFrames(play: PlayResult): number[] {
  const { frames } = play.tracks
  const out: number[] = []
  for (const sample of ballSamples(play)) out.push(sample === null ? (out[out.length - 1] ?? play.startFrame) : frames[sample])
  return out
}

const reachedBy = (stamps: number[], now: number) => {
  let n = 0
  while (n < stamps.length && stamps[n] <= now) n++
  return n
}

export type Stat = { label: string; value: string; swatch?: 'air' | 'yac' }

const statText = (stats: Stat[]) => stats.map((s) => `${s.label} ${s.value} YDS`).join(STRIP_GAP)

export const stripSize = (text: string) => Math.min(STRIP_MAX, STRIP_BUDGET / Math.max(1, text.length))

export function Strip({ stats }: { stats: Stat[] }) {
  return (
    <div className="replay-stats" data-testid="replay-stats" style={{ fontSize: `${stripSize(statText(stats))}cqh` }}>
      {stats.map((s) => (
        <span key={s.label} className="replay-stat">
          {s.swatch && <span className={`air-swatch air-swatch-${s.swatch}`} />}
          {`${s.label} ${s.value} `}
          <span className="replay-stat-unit">YDS</span>
        </span>
      ))}
    </div>
  )
}

export function replayStats(play: PlayResult): Stat[] {
  const open = separation(play)
  const keyed = typeof play.airYards === 'number' && typeof play.yac === 'number'
  return [
    ...(keyed ? [{ label: 'AIR', value: String(play.airYards), swatch: 'air' as const }] : []),
    ...(keyed ? [{ label: 'YAC', value: String(play.yac), swatch: 'yac' as const }] : []),
    ...(open ? [{ label: 'SEPARATION', value: open.yards.toFixed(1) }] : []),
  ]
}

function afterCatch(carried: BallPoint[], caught: boolean, offense: 0 | 1) {
  const caughtAt = carried.findIndex((p) => p.slot !== carried[0]?.slot)
  const split = caught && caughtAt > 0
  const lostAt = split ? carried.findIndex((p, i) => i >= caughtAt && teamOf(p.slot) !== offense) : -1
  return { caughtAt, split, lostAt, runEnd: lostAt < 0 ? carried.length : lostAt }
}

const path = (points: Point[]) =>
  points.map((p, i) => `${i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > JUMP ? 'M' : 'L'}${p.x},${p.y}`).join('')

export default function FootageLook({ view, abbrs, player }: { view: ReplayView<Replayed>; abbrs: [string, string]; player: PlayerLookup }) {
  const { canvas } = view
  const { play } = view.call.payload
  const replay = view.player
  const snap = useMemo(emptySnapshot, [])
  const [frame, setFrame] = useState<number | null>(null)
  const stats = useMemo(() => replayStats(play), [play])
  const stamps = useMemo(() => ballFrames(play), [play])

  useLayoutEffect(() => {
    setFrame(null)
    if (!replay) return
    let raf = 0
    let last = -1
    let over = false
    const gone = (s: Snapshot) => replay.from + s.frame > play.endFrame && !fieldOnScreen(s.ram, MAP)
    replay.setGate(gone)
    const tick = () => {
      if (replay.readSnapshot(snap) && snap.frame !== last) {
        last = snap.frame
        if (!over && gone(snap)) {
          over = true
          replay.finish()
          return
        }
        setFrame(last)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      replay.setGate(null)
    }
  }, [replay, snap, play])

  const mount = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !canvas || canvas.parentElement === node) return
      canvas.className = 'replay-canvas'
      node.prepend(canvas)
    },
    [canvas],
  )

  const project = (p: Point) => (frame === null ? null : fieldToScreenFeet(snap.ram, MAP, p))
  const shown = project({ x: play.field.losX, y: SIDE_TOP }) !== null
  const yardLine = (x: number) => {
    const top = project({ x, y: SIDE_TOP })
    const bottom = project({ x, y: SIDE_BOTTOM })
    return top && bottom ? { x1: top.x, x2: bottom.x, y1: top.y, y2: bottom.y } : null
  }
  const los = shown ? yardLine(play.field.losX) : null
  const gain = shown && play.field.toGainX !== null && play.kind === 'scrimmage' ? yardLine(play.field.toGainX) : null
  const projectAll = (points: Point[]) => (shown ? points.map(project).filter((p): p is Point => p !== null) : [])
  const now = frame === null || !replay ? -Infinity : replay.from + frame
  const reached = reachedBy(stamps, now)
  const sofar = reached === play.ball.length ? play : { ...play, ball: play.ball.slice(0, reached) }
  const pass = play.pass
  const landed = pass !== null && now >= (pass.frames?.[1] ?? play.endFrame)
  const caught = pass?.outcome === 'caught'
  const carried = beforeTurnover(sofar)
  const { caughtAt, split, lostAt, runEnd } = afterCatch(carried, caught, play.offense)
  const ball = projectAll(split ? carried.slice(0, caughtAt) : carried)
  const yac = split && pass ? projectAll([pass.to, ...carried.slice(caughtAt, runEnd)]) : []
  const lost = lostAt > 0 ? projectAll(carried.slice(lostAt - 1)) : []
  const run = recoveryRun(sofar)
  const recovery = run ? projectAll(run.points) : []
  const recoveryColor = run ? teamColor(abbrs[run.team]) : null
  const burst = shown && play.fumble && now >= play.fumble.frame ? project(play.fumble.at) : null
  const cross = caught && pass ? crossing(pass.from, pass.to, play.field.losX) : null
  const thrown = shown && pass && landed ? { from: project(pass.from), to: project(pass.to), cross: cross && project(cross) } : null
  const line = (a: Point, b: Point) => `M${a.x},${a.y}L${b.x},${b.y}`

  return (
    <>
      <Strip stats={stats} />
      <div className="replay-picture" ref={mount}>
        <svg className="footage-overlay" viewBox="0 0 256 224" preserveAspectRatio="none">
          {los && <line className="footage-los" {...los} strokeWidth={1.5} />}
          {gain && <line className="footage-gain" {...gain} strokeWidth={1.5} />}
          {ball.length > 1 && <path data-testid="footage-ball" className="footage-ball" d={path(ball)} fill="none" strokeWidth={1.5} />}
          {thrown?.from && thrown.to && !caught && (
            <path data-testid="footage-flight" className="footage-ball" d={line(thrown.from, thrown.to)} fill="none" strokeWidth={1.5} />
          )}
          {thrown?.from && thrown.to && caught && (
            <>
              {thrown.cross && <path data-testid="footage-flight" className="footage-ball" d={line(thrown.from, thrown.cross)} fill="none" strokeWidth={1.5} />}
              <path data-testid="footage-air" className="footage-ball footage-air" d={line(thrown.cross ?? thrown.from, thrown.to)} fill="none" strokeWidth={1.5} />
            </>
          )}
          {yac.length > 1 && <path data-testid="footage-yac" className="footage-ball footage-yac" d={path(yac)} fill="none" strokeWidth={1.5} />}
          {lost.length > 1 && <path data-testid="footage-return" className="footage-ball" d={path(lost)} fill="none" strokeWidth={1.5} />}
          {recoveryColor && recovery.length > 1 && (
            <>
              <path className="footage-recovery" d={path(recovery)} fill="none" stroke={recoveryColor.secondary} strokeWidth={2.7} />
              <path data-testid={play.interception ? 'footage-int-return' : 'footage-recovery'} className="footage-recovery" d={path(recovery)} fill="none" stroke={recoveryColor.primary} strokeWidth={1.5} />
            </>
          )}
          {burst && play.fumble && <FumbleMark at={burst} u={0.6} />}
          {thrown?.to && play.pass && passEnded(play.pass) && (
            <PassMark at={thrown.to} u={0.6} />
          )}
        </svg>
      </div>
      <Caption play={play} player={player} />
    </>
  )
}
