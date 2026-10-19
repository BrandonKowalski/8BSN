import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import Wordmark from '../../brand/Wordmark'
import type { Emulator } from '../../emu/Emulator'
import { replayWorthy } from '../../game/analysis'
import { formatSituation } from '../../game/format'
import type { Drive, PlayResult, PlayTracker } from '../../game/playTracker'
import { drivePlays, teamComparison } from '../../game/teamStats'
import type { GameState } from '../../game/types'
import type { PlayerLookup } from '../../game/useGame'
import type { Helmets } from '../../helmets/useHelmets'
import { driveWord, fieldPercent, fromOwnGoal, RESULT_TEXT } from './DriveCard'
import ReplayStage from './replay/ReplayStage'
import { useReel } from './replay/useReplay'
import { teamColor } from './teamColors'

export const BREAK_STATS_MS = 12000
export const BREAK_TAIL_MS = 5000
const DRIVE_ROWS = 14
const SECOND_HALF = 2
const OVERTIME = 4
const HALFTIME = 'HALFTIME'
const FINAL = 'FINAL'
const SCORING = ['TOUCHDOWN', 'FIELD GOAL']
const NO_PLAYS: readonly PlayResult[] = []

type Title = typeof HALFTIME | typeof FINAL
type Phase = 'stats' | 'reel' | 'tail'
type Charted = { drive: Drive; plays: readonly PlayResult[] }

export function breakTitle(state: GameState | null, ended: number | null): Title | null {
  if (!state?.inBreak) return null
  if (ended === null) {
    const situation = formatSituation(state)
    return situation === HALFTIME || situation === FINAL ? situation : null
  }
  if (ended === SECOND_HALF - 1) return HALFTIME
  if (ended >= OVERTIME) return FINAL
  if (ended === OVERTIME - 1) return state.teams[0].score === state.teams[1].score ? null : FINAL
  return null
}

function useEndedQuarter(state: GameState | null, tracker: PlayTracker): number | null {
  const seen = useRef<number | null>(null)
  if (state?.inGame) seen.current = state.quarter
  const plays = tracker.plays()
  return seen.current ?? plays[plays.length - 1]?.quarter ?? null
}

const inSpan = (title: Title, quarter: number) => title === FINAL || quarter < SECOND_HALF

function chartWord(drive: Drive, plays: readonly PlayResult[], title: Title): string {
  if (drive.result !== 'IN_PROGRESS') return driveWord(drive, plays)
  const last = plays[plays.length - 1]
  if (last?.interception) return RESULT_TEXT.INT
  if (last?.summary === 'FUMBLE LOST') return RESULT_TEXT.FUMBLE
  if (last?.touchdown) return RESULT_TEXT.TD
  if (last?.kind === 'fieldGoal' && last.scoreAfter[drive.offense] > last.scoreBefore[drive.offense]) return RESULT_TEXT.FG
  return title === FINAL ? 'END OF GAME' : RESULT_TEXT.END_OF_HALF
}

function span(tracker: PlayTracker, title: Title) {
  const plays = tracker.plays()
  const drives = tracker.drives()
  const groups = drivePlays(plays, drives)
  const charted: Charted[] = drives.map((drive, i) => ({ drive, plays: groups[i] ?? [] })).filter((d) => inSpan(title, d.plays[0]?.quarter ?? 0))
  return { plays: plays.filter((p) => inSpan(title, p.quarter)), charted }
}

const reelLabel = (title: Title) => (title === FINAL ? 'GAME HIGHLIGHTS' : 'FIRST HALF HIGHLIGHTS')

function pressedButtons(): Set<string> {
  const held = new Set<string>()
  const pads = navigator.getGamepads?.() ?? []
  for (let p = 0; p < pads.length; p++) {
    const pad = pads[p]
    if (!pad) continue
    pad.buttons.forEach((button, b) => {
      if (button.pressed || button.value > 0.5) held.add(`${p}:${b}`)
    })
  }
  return held
}

type Props = {
  state: GameState | null
  tracker: PlayTracker
  player: PlayerLookup
  helmets: Helmets
  emulator: Emulator | null
  rom: Uint8Array | null
  onClose?: () => void
}

export default function BreakScreen({ state, tracker, player, helmets, emulator, rom, onClose }: Props) {
  const ended = useEndedQuarter(state, tracker)
  const title = breakTitle(state, ended)
  const inBreak = state?.inBreak ?? false
  const [open, setOpen] = useState<Title | null>(null)
  const [phase, setPhase] = useState<Phase>('stats')
  const [reelPlays, setReelPlays] = useState<readonly PlayResult[]>(NO_PLAYS)
  const seen = useRef(false)
  const closer = useRef(onClose)
  closer.current = onClose
  const latest = useRef({ tracker, open })
  latest.current = { tracker, open }
  const up = open !== null

  useEffect(() => {
    if (!inBreak) {
      seen.current = false
      setOpen(null)
      return
    }
    if (!title || seen.current) return
    seen.current = true
    setPhase('stats')
    setReelPlays(NO_PLAYS)
    setOpen(title)
  }, [inBreak, title])

  const close = useCallback(() => {
    setOpen(null)
    closer.current?.()
  }, [])

  useEffect(() => {
    if (!up || !emulator) return
    emulator.pause()
    return () => emulator.resume()
  }, [up, emulator])

  useEffect(() => {
    if (!up || phase !== 'stats') return
    const timer = setTimeout(() => {
      const { tracker, open } = latest.current
      if (open) setReelPlays(span(tracker, open).plays.filter(replayWorthy))
      setPhase('reel')
    }, BREAK_STATS_MS)
    return () => clearTimeout(timer)
  }, [up, phase])

  const reel = useReel({ emulator, rom, plays: reelPlays, label: reelLabel(open ?? HALFTIME), active: up && phase === 'reel' })

  useEffect(() => {
    if (phase === 'reel' && reel.done) setPhase('tail')
  }, [phase, reel.done])

  useEffect(() => {
    if (!up || phase !== 'tail') return
    const timer = setTimeout(close, BREAK_TAIL_MS)
    return () => clearTimeout(timer)
  }, [up, phase, close])

  useEffect(() => {
    if (!up) return
    const onKey = (event: KeyboardEvent) => {
      if (!event.repeat) close()
    }
    window.addEventListener('keydown', onKey)
    let held = pressedButtons()
    let raf = 0
    const poll = () => {
      const now = pressedButtons()
      for (const button of now) {
        if (!held.has(button)) {
          close()
          return
        }
      }
      held = now
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(raf)
    }
  }, [up, close])

  if (!open || !state) return null
  const abbrs: [string, string] = [state.teams[0].abbr, state.teams[1].abbr]
  return (
    <section className="break-screen" data-testid="break-screen">
      {phase === 'reel' && reel.at !== null ? (
        <div className="break-reel" data-testid="break-reel">
          {reel.view && <ReplayStage view={reel.view} abbrs={abbrs} player={player} />}
          <span className="break-reel-count" data-testid="break-reel-count">{`HIGHLIGHT ${reel.at + 1} OF ${reel.total}`}</span>
        </div>
      ) : (
        <Board state={state} tracker={tracker} helmets={helmets} title={open} />
      )}
    </section>
  )
}

function Board({ state, tracker, helmets, title }: { state: GameState; tracker: PlayTracker; helmets: Helmets; title: Title }) {
  const { plays, charted } = span(tracker, title)
  const rows = teamComparison(
    plays,
    charted.map((d) => d.drive),
    state,
    tracker.timeOfPossession(),
  )
  const colors = [teamColor(state.teams[0].abbr), teamColor(state.teams[1].abbr)] as const
  const halves = title === FINAL ? [charted.filter((d) => (d.plays[0]?.quarter ?? 0) < SECOND_HALF), charted.filter((d) => (d.plays[0]?.quarter ?? 0) >= SECOND_HALF)] : [charted]
  const heads = title === FINAL ? ['1ST HALF', '2ND HALF'] : ['FIRST HALF']
  return (
    <div className="break-board">
      <header className="break-head">
        {state.teams.map((team, side) => (
          <div className={`break-team break-team-${side}`} key={side} style={{ backgroundColor: colors[side].primary, borderColor: colors[side].secondary }}>
            {helmets.get(team.id) && <img className="break-helmet" data-testid="break-helmet" src={helmets.get(team.id)} alt="" />}
            <span className="break-abbr">{team.abbr}</span>
            <span className="break-score" data-testid={`break-score-${side}`}>
              {team.score}
            </span>
          </div>
        ))}
        <div className="break-center">
          <Wordmark variant="c3" />
          <h1 className="break-title" data-testid="break-title">
            {title}
          </h1>
        </div>
      </header>
      <div className="break-body">
        <section className="break-panel break-compare">
          <h2 className="break-panel-head">TEAM STATS</h2>
          <div className="break-compare-teams">
            {state.teams.map((team, side) => (
              <span key={side} style={{ borderColor: colors[side].secondary }}>
                {team.abbr}
              </span>
            ))}
          </div>
          <div className="break-rows">
            {rows.map((row) => (
              <div className="break-row" data-testid="break-row" key={row.label}>
                <span className={row.leader === 0 ? 'break-value break-leader' : 'break-value'} data-testid="break-value">
                  {row.values[0]}
                </span>
                <span className="break-label">{row.label}</span>
                <span className={row.leader === 1 ? 'break-value break-leader' : 'break-value'} data-testid="break-value">
                  {row.values[1]}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className={title === FINAL ? 'break-panel break-chart break-chart-game' : 'break-panel break-chart'}>
          <h2 className="break-panel-head">DRIVE CHART</h2>
          <div className="break-halves">
            {halves.map((half, i) => (
              <div className="break-half" key={heads[i]}>
                <h3 className="break-half-head">{heads[i]}</h3>
                <div className="break-drives" style={{ gridTemplateRows: `repeat(${Math.max(DRIVE_ROWS, half.length)}, minmax(0, 1fr))` }}>
                  {half.map((d, n) => (
                    <DriveRow key={n} charted={d} abbrs={[state.teams[0].abbr, state.teams[1].abbr]} colors={colors} title={title} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

type RowProps = { charted: Charted; abbrs: [string, string]; colors: readonly [ReturnType<typeof teamColor>, ReturnType<typeof teamColor>]; title: Title }

function DriveRow({ charted, abbrs, colors, title }: RowProps) {
  const { drive, plays } = charted
  const color = colors[drive.offense]
  const from = fieldPercent(fromOwnGoal(drive.startSpot, 0))
  const to = fieldPercent(fromOwnGoal(drive.endSpot, 0))
  const word = chartWord(drive, plays, title)
  const bar = { left: `${Math.min(from, to)}%`, width: `${Math.abs(to - from)}%`, backgroundColor: color.primary, '--bar-color': color.primary, '--bar-edge': color.secondary } as CSSProperties
  return (
    <div className="break-drive" data-testid="break-drive">
      <span className="break-drive-team" data-testid="break-drive-team" style={{ backgroundColor: color.primary, borderColor: color.secondary }}>
        {abbrs[drive.offense]}
      </span>
      <span className="break-drive-field">
        <span className="break-zone break-zone-0" style={{ backgroundColor: colors[0].primary }} />
        <span className="break-zone break-zone-1" style={{ backgroundColor: colors[1].primary }} />
        <span className="break-drive-bar" data-testid="break-drive-bar" data-dir={to >= from ? 'right' : 'left'} style={bar} />
      </span>
      <span className={SCORING.includes(word) ? 'break-drive-word break-drive-score' : 'break-drive-word'} data-testid="break-drive-word">
        {word}
      </span>
    </div>
  )
}
