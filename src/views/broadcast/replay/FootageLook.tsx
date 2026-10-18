import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { emptySnapshot } from '../../../emu/snapshot'
import { ballSamples, pressure, separation } from '../../../game/analysis'
import { fieldToScreenBody, fieldToScreenFeet } from '../../../game/camera'
import { fitTag, playHeadline, type TagFit } from '../../../game/format'
import { TSB2026_MAP } from '../../../game/maps/tsb2026'
import type { PlayResult } from '../../../game/playTracker'
import type { PlayerLookup } from '../../../game/useGame'
import { AirKey, beforeFumble, crossing, FumbleMark, fumbleLabel, PassMark, passEndLabel, passEnded, recoveryRun, SIDE_BOTTOM, SIDE_TOP } from '../RouteReplay'
import { teamColor } from '../teamColors'
import Separation from './Separation'
import type { ReplayView } from './useReplay'

type Point = { x: number; y: number }

const MAP = TSB2026_MAP
const CAPTION_CHARS = 40
const SENTENCE_FITS: readonly TagFit[] = ['full', 'initial', 'last']
const RING = 10
const RING_STROKE = 1
const JUMP = 16

export function captionText(play: PlayResult, player: PlayerLookup): string {
  return fitTag((fit) => playHeadline(play, player, fit), CAPTION_CHARS, SENTENCE_FITS)
}

export function Caption({ play, player }: { play: PlayResult; player: PlayerLookup }) {
  return (
    <div className="replay-caption" data-testid="replay-caption">
      <span className="replay-caption-text">{captionText(play, player)}</span>
    </div>
  )
}

const teamOf = (slot: number): 0 | 1 => (slot < 11 ? 0 : 1)

const openText = (yards: number) => `${yards.toFixed(1)} YDS OPEN`

function readSlot(ram: Uint8Array, slot: number): Point {
  const at = MAP.players.base.offset + MAP.players.stride * slot
  return { x: ram[at + MAP.players.x] | (ram[at + MAP.players.x + 1] << 8), y: ram[at + MAP.players.y] }
}

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

const path = (points: Point[]) =>
  points.map((p, i) => `${i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > JUMP ? 'M' : 'L'}${p.x},${p.y}`).join('')

export default function FootageLook({ view, abbrs, player }: { view: ReplayView; abbrs: [string, string]; player: PlayerLookup }) {
  const { play, canvas } = view
  const replay = view.player
  const snap = useMemo(emptySnapshot, [])
  const [frame, setFrame] = useState<number | null>(null)
  const open = useMemo(() => separation(play), [play])
  const rush = useMemo(() => (play.sack || play.thrown ? pressure(play) : null), [play])
  const stamps = useMemo(() => ballFrames(play), [play])

  useLayoutEffect(() => {
    setFrame(null)
    if (!replay) return
    let raf = 0
    let last = -1
    const tick = () => {
      if (replay.readSnapshot(snap) && snap.frame !== last) {
        last = snap.frame
        setFrame(last)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [replay, snap])

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
  const carried = beforeFumble(sofar)
  const caughtAt = carried.findIndex((p) => p.slot !== carried[0]?.slot)
  const split = caught && caughtAt > 0
  const lostAt = split ? carried.findIndex((p, i) => i >= caughtAt && teamOf(p.slot) !== play.offense) : -1
  const runEnd = lostAt < 0 ? carried.length : lostAt
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
  const body = (slot: number) => (shown && frame !== null ? fieldToScreenBody(snap.ram, MAP, readSlot(snap.ram, slot)) : null)
  const ring = open ? body(open.slot) : null
  const rival = open && ring && now >= play.tracks.frames[open.sample] ? body(open.defender) : null
  const tags = [open && !ring ? openText(open.yards) : null, rush ? `CLOSEST RUSH ${rush.yards.toFixed(1)} YDS AT ${rush.seconds.toFixed(1)} S` : null].filter(
    (t): t is string => t !== null,
  )

  return (
    <>
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
              <path data-testid="footage-recovery" className="footage-recovery" d={path(recovery)} fill="none" stroke={recoveryColor.primary} strokeWidth={1.5} />
            </>
          )}
          {burst && play.fumble && <FumbleMark at={burst} label={fumbleLabel(play.fumble, player)} u={0.6} view={{ x: 0, y: 0, w: 256, h: 224 }} />}
          {thrown?.to && play.pass && passEnded(play.pass) && (
            <PassMark at={thrown.to} label={passEndLabel(play.pass, player)} u={0.6} view={{ x: 0, y: 0, w: 256, h: 224 }} />
          )}
          {ring && open && (
            <g className="footage-open">
              <circle data-testid="open-ring" cx={ring.x} cy={ring.y} r={RING} fill="none" strokeWidth={RING_STROKE} />
              {!rival && (
                <text x={ring.x} y={ring.y - RING - 3} fontSize={8} textAnchor="middle">
                  {openText(open.yards)}
                </text>
              )}
            </g>
          )}
          {ring && rival && open && <Separation receiver={ring} defender={rival} yards={open.yards} r={RING} font={6} stroke={RING_STROKE} testId="footage-separation" />}
        </svg>
        {tags.length > 0 && (
          <div className="footage-tags">
            {tags.map((tag) => (
              <span key={tag} className={tag.endsWith('OPEN') ? 'footage-tag footage-tag-open' : 'footage-tag'}>
                {tag}
              </span>
            ))}
          </div>
        )}
        <AirKey play={play} />
      </div>
      <Caption play={play} player={player} />
    </>
  )
}
