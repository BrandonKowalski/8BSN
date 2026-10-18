import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { emptySnapshot } from '../../../emu/snapshot'
import { pressure, separation } from '../../../game/analysis'
import { fieldToScreen } from '../../../game/camera'
import { playerName, type Fit } from '../../../game/format'
import { TSB2026_MAP } from '../../../game/maps/tsb2026'
import type { PlayResult } from '../../../game/playTracker'
import type { RosterPlayer } from '../../../game/roster'
import type { PlayerLookup } from '../../../game/useGame'
import { PassMark, passEndLabel, passEnded, SIDE_BOTTOM, SIDE_TOP } from '../RouteReplay'
import type { ReplayView } from './useReplay'

type Point = { x: number; y: number }

const MAP = TSB2026_MAP
const CAPTION_CHARS = 36
const FITS: readonly Fit[] = ['full', 'initial', 'last']
const SPRITE_MID = 8
const RING = 11
const JUMP = 16

export function captionText(play: PlayResult, player: PlayerLookup): string {
  const { passer, receiver, rusher } = play.people
  const who = (index: number | undefined) => (index === undefined ? null : player(play.offense, index))
  const tag = (p: RosterPlayer, fit: Fit) => `#${p.number} ${playerName(p, fit)}`
  const thrower = who(passer)
  const target = who(receiver)
  const runner = who(rusher)
  let line: ((fit: Fit) => string) | null = null
  if (thrower && target) line = (fit) => `${tag(thrower, fit)} TO ${tag(target, fit)}`
  else if (thrower && receiver === undefined && !play.sack && !play.interception) line = (fit) => `${tag(thrower, fit)} PASS INCOMPLETE`
  else if (runner && passer === undefined) line = (fit) => `${tag(runner, fit)} RUSH`
  if (!line) return play.summary
  const make = line
  return FITS.map(make).find((text) => text.length <= CAPTION_CHARS) ?? make('last')
}

export function Caption({ play, player }: { play: PlayResult; player: PlayerLookup }) {
  const text = captionText(play, player)
  const gained = text !== play.summary && (play.people.receiver !== undefined || play.people.rusher !== undefined)
  return (
    <div className="replay-caption" data-testid="replay-caption">
      <span className="replay-caption-text">{text}</span>
      {gained && <span className="replay-caption-yards">{`${play.yards} YDS${play.touchdown ? ' TD' : ''}`}</span>}
    </div>
  )
}

const openText = (yards: number) => `${yards.toFixed(1)} YDS OPEN`

function readSlot(ram: Uint8Array, slot: number): Point {
  const at = MAP.players.base.offset + MAP.players.stride * slot
  return { x: ram[at + MAP.players.x] | (ram[at + MAP.players.x + 1] << 8), y: ram[at + MAP.players.y] }
}

const path = (points: Point[]) =>
  points.map((p, i) => `${i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > JUMP ? 'M' : 'L'}${p.x},${p.y}`).join('')

export default function FootageLook({ view, player }: { view: ReplayView; player: PlayerLookup }) {
  const { play, canvas } = view
  const replay = view.player
  const snap = useMemo(emptySnapshot, [])
  const [frame, setFrame] = useState<number | null>(null)
  const open = useMemo(() => separation(play), [play])
  const rush = useMemo(() => (play.sack || play.thrown ? pressure(play) : null), [play])

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

  const project = (p: Point) => (frame === null ? null : fieldToScreen(snap.ram, MAP, p))
  const shown = project({ x: play.field.losX, y: SIDE_TOP }) !== null
  const line = (x: number) => {
    const top = project({ x, y: SIDE_TOP })
    const bottom = project({ x, y: SIDE_BOTTOM })
    return top && bottom ? { x1: top.x, x2: bottom.x, y1: top.y, y2: bottom.y } : null
  }
  const los = shown ? line(play.field.losX) : null
  const gain = shown && play.field.toGainX !== null && play.kind === 'scrimmage' ? line(play.field.toGainX) : null
  const ball = shown ? play.ball.map(project).filter((p): p is Point => p !== null) : []
  const thrown = shown && play.pass ? { from: project(play.pass.from), to: project(play.pass.to) } : null
  const ring = shown && open ? project(readSlot(snap.ram, open.slot)) : null
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
          {thrown?.from && thrown.to && (
            <path data-testid="footage-flight" className="footage-ball" d={`M${thrown.from.x},${thrown.from.y}L${thrown.to.x},${thrown.to.y}`} fill="none" strokeWidth={1.5} />
          )}
          {thrown?.to && play.pass && passEnded(play.pass) && (
            <PassMark at={thrown.to} label={passEndLabel(play.pass, player)} u={0.6} view={{ x: 0, y: 0, w: 256, h: 224 }} />
          )}
          {ring && open && (
            <g className="footage-open">
              <circle data-testid="open-ring" cx={ring.x} cy={ring.y + SPRITE_MID} r={RING} fill="none" strokeWidth={1.5} />
              <text x={ring.x} y={ring.y + SPRITE_MID - RING - 3} fontSize={8} textAnchor="middle">
                {openText(open.yards)}
              </text>
            </g>
          )}
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
      </div>
      <Caption play={play} player={player} />
    </>
  )
}
