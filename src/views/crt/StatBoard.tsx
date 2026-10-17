import { useEffect, useState } from 'react'
import { formatClock, formatQuarter, formatSituation, onAir } from '../../game/format'
import type { DriveResult, PlayTracker } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import { defLine, passLine, recLine, rushLine } from './statLines'
import type { Names } from './Ticker'

export type BoardPage = { title: string; lines: string[] }

const ROTATE_MS = 6000
const MAX_LINES = 4

const RESULT_TEXT: Record<DriveResult, string> = {
  TD: 'TD',
  FG: 'FG',
  PUNT: 'PUNT',
  TURNOVER: 'TURNOVER',
  END_OF_HALF: 'HALF',
  IN_PROGRESS: 'IN PROGRESS',
}

export function boardPages(state: GameState, tracker: PlayTracker, names: Names): BoardPage[] {
  const passing: string[] = []
  const rushing: string[] = []
  const receiving: string[] = []
  const defense: string[] = []
  for (const side of [0, 1] as const) {
    for (const player of state.teams[side].players) {
      const name = names(side, player.rosterIndex)
      if (!name) continue
      const { pass, rush, rec, def } = player
      if (pass && pass.att > 0) passing.push(passLine(name, pass))
      if (rush && rush.att > 0) rushing.push(rushLine(name, rush))
      if (rec && rec.rec > 0) receiving.push(recLine(name, rec))
      if (def && (def.sacks > 0 || def.int > 0)) defense.push(defLine(name, def))
    }
  }
  const drives = tracker
    .drives()
    .slice(-MAX_LINES)
    .map((d) => `${state.teams[d.offense].abbr} ${d.plays} PLAYS ${d.yards} YDS ${RESULT_TEXT[d.result]}`)
  const pages: BoardPage[] = [
    { title: 'PASSING', lines: passing.slice(0, MAX_LINES) },
    { title: 'RUSHING', lines: rushing.slice(0, MAX_LINES) },
    { title: 'RECEIVING', lines: receiving.slice(0, MAX_LINES) },
    { title: 'DEFENSE', lines: defense.slice(0, MAX_LINES) },
    { title: 'DRIVES', lines: drives },
  ]
  return pages.filter((p) => p.lines.length > 0)
}

type Props = { state: GameState | null; tracker: PlayTracker; names: Names }

export default function StatBoard({ state, tracker, names }: Props) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), ROTATE_MS)
    return () => clearInterval(id)
  }, [])

  if (!onAir(state)) {
    return (
      <div className="board">
        <div className="board-fixed" data-testid="board-fixed">
          <span className="board-title-line">TECMO BROADCAST</span>
        </div>
        <div className="board-roll" />
      </div>
    )
  }

  const [a, b] = state.teams
  const pages = boardPages(state, tracker, names)
  const page = pages.length > 0 ? pages[tick % pages.length] : null
  return (
    <div className="board">
      <div className="board-fixed" data-testid="board-fixed">
        <div className="board-score">
          <span>{a.abbr}</span>
          <span>{a.score}</span>
        </div>
        <div className="board-score">
          <span>{b.abbr}</span>
          <span>{b.score}</span>
        </div>
        <div className="board-situation">
          {formatQuarter(state.quarter)} {formatClock(state.clock)}
        </div>
        <div className="board-situation">{formatSituation(state)}</div>
      </div>
      <div className="board-roll">
        {page && (
          <div className="board-page" key={page.title}>
            <div className="board-title" data-testid="board-title">
              {page.title}
            </div>
            {page.lines.map((line, i) => (
              <div className="board-line" key={i}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
