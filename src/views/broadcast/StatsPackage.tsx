import { useEffect, useState } from 'react'
import { formatBallOn, formatClock, formatSituation, playerName, type Fit } from '../../game/format'
import type { DriveResult, PlayResult, PlayTracker } from '../../game/playTracker'
import type { GameState, PlayerStats, TeamState } from '../../game/types'
import type { NameLookup as Names, PlayerLookup } from '../../game/useGame'
import Wordmark from '../../brand/Wordmark'
import RouteReplay from './RouteReplay'
import { teamColor } from './teamColors'

const MAX_LINES = 3
const NAME_BUDGET = 16
const ACTION_BUDGET = 30
export const STATS_PAGE_MS = 6000
const PAGES = [['rushing', 'passing'], ['receiving', 'defense']]

export type Cell = { value: string; unit: string; zero: boolean }
type Line = { side: 0 | 1; name: string; number: number; cells: Cell[]; rank: number }
type TeamFigure = { abbr: string; cells: Cell[] }
type Section = { id: string; title: string; totals: TeamFigure[]; lines: Line[]; footer?: TeamFigure[] }

const RESULT_TEXT: Record<DriveResult, string> = {
  TD: 'TOUCHDOWN',
  FG: 'FIELD GOAL',
  PUNT: 'PUNT',
  INT: 'INTERCEPTION',
  FUMBLE: 'FUMBLE',
  MISSED_FG: 'MISSED FG',
  DOWNS: 'DOWNS',
  END_OF_HALF: 'END OF HALF',
  IN_PROGRESS: 'IN PROGRESS',
}

const cell = (value: number | string, unit: string, zero = value === 0): Cell => ({ value: String(value), unit, zero })

const total = (team: TeamState, pick: (p: PlayerStats) => number | undefined) =>
  team.players.reduce((sum, p) => sum + (pick(p) ?? 0), 0)

const minutes = (seconds: number) => formatClock({ min: Math.floor(seconds / 60), sec: seconds % 60 })

const FITS: Fit[] = ['full', 'initial']

export function playLines(play: PlayResult, player: PlayerLookup): { action: string; result: string } {
  const cut = play.summary.indexOf(', ')
  const said = cut < 0 ? play.summary : play.summary.slice(0, cut)
  const result = cut < 0 ? '' : play.summary.slice(cut + 2)
  const who = (index: number | undefined) => (index === undefined ? null : player(play.offense, index))
  const passer = who(play.people.passer)
  const receiver = who(play.people.receiver)
  const rusher = who(play.people.rusher)
  const build = (fit: Fit) => {
    if (passer && receiver && said.includes(' PASS TO ')) return `${playerName(passer, fit)} PASS TO ${playerName(receiver, fit)}`
    if (passer && said.endsWith(' PASS INCOMPLETE')) return `${playerName(passer, fit)} PASS INCOMPLETE`
    if (rusher && !passer && said.endsWith(' RUSH')) return `${playerName(rusher, fit)} RUSH`
    return said
  }
  const action = FITS.map(build).find((text) => text.length <= ACTION_BUDGET) ?? build('last')
  return { action, result }
}

export function fitName(who: { first: string; last: string }): string {
  const fit = FITS.find((f) => playerName(who, f).length <= NAME_BUDGET) ?? 'last'
  return playerName(who, fit)
}

function collect(state: GameState, player: PlayerLookup, make: (p: PlayerStats) => { cells: Cell[]; rank: number } | null): Line[] {
  const lines: Line[] = []
  for (const side of [0, 1] as const) {
    for (const stats of state.teams[side].players) {
      const who = player(side, stats.rosterIndex)
      if (!who || !who.last) continue
      const line = make(stats)
      if (line) lines.push({ side, name: fitName(who), number: who.number, ...line })
    }
  }
  return lines.sort((a, b) => b.rank - a.rank).slice(0, MAX_LINES)
}

function longest(state: GameState, tracker: PlayTracker, kind: 'rush' | 'rec'): TeamFigure[] | undefined {
  const figures = ([0, 1] as const)
    .map((side) => ({ abbr: state.teams[side].abbr, yards: tracker.longest(side, kind) }))
    .filter((p) => p.yards > 0)
    .map((p) => ({ abbr: p.abbr, cells: [cell(p.yards, 'YDS')] }))
  return figures.length > 0 ? figures : undefined
}

export function statSections(state: GameState, tracker: PlayTracker, player: PlayerLookup): Section[] {
  const teams = state.teams
  const totals = (make: (team: TeamState) => Cell[]): TeamFigure[] => teams.map((team) => ({ abbr: team.abbr, cells: make(team) }))
  const yards = (pick: (p: PlayerStats) => number | undefined) => totals((team) => [cell(total(team, pick), 'YDS', false)])
  return [
    {
      id: 'rushing',
      title: 'RUSHING',
      totals: yards((p) => p.rush?.yds),
      lines: collect(state, player, ({ rush }) =>
        rush && rush.att > 0 ? { cells: [cell(rush.att, 'CAR'), cell(rush.yds, 'YDS', false), cell(rush.td, 'TD')], rank: rush.yds } : null,
      ),
      footer: longest(state, tracker, 'rush'),
    },
    {
      id: 'passing',
      title: 'PASSING',
      totals: yards((p) => p.pass?.yds),
      lines: collect(state, player, ({ pass }) =>
        pass && pass.att > 0
          ? { cells: [cell(`${pass.comp}/${pass.att}`, 'C/A'), cell(pass.yds, 'YDS', false), cell(pass.td, 'TD'), cell(pass.int, 'INT')], rank: pass.yds }
          : null,
      ),
    },
    {
      id: 'receiving',
      title: 'RECEIVING',
      totals: yards((p) => p.rec?.yds),
      lines: collect(state, player, ({ rec }) =>
        rec && rec.rec > 0 ? { cells: [cell(rec.rec, 'REC'), cell(rec.yds, 'YDS', false), cell(rec.td, 'TD')], rank: rec.yds } : null,
      ),
      footer: longest(state, tracker, 'rec'),
    },
    {
      id: 'defense',
      title: 'DEFENSE',
      totals: totals((team) => [cell(total(team, (p) => p.def?.sacks), 'SK', false), cell(total(team, (p) => p.def?.int), 'INT', false)]),
      lines: collect(state, player, ({ def }) =>
        def && (def.sacks > 0 || def.int > 0) ? { cells: [cell(def.sacks, 'SK'), cell(def.int, 'INT')], rank: def.sacks + def.int * 2 } : null,
      ),
    },
  ]
}

function Value({ cell }: { cell: Cell }) {
  return (
    <span className={cell.zero ? 'pkg-value pkg-zero' : 'pkg-value'}>
      {cell.value}
      <span className="pkg-unit">{cell.unit}</span>
    </span>
  )
}

function Figures({ figures, className }: { figures: TeamFigure[]; className: string }) {
  return (
    <span className={className}>
      {figures.map((figure) => (
        <span className="pkg-figure" key={figure.abbr}>
          <span className="pkg-figure-abbr">{figure.abbr}</span>
          {figure.cells.map((c) => (
            <Value cell={c} key={c.unit} />
          ))}
        </span>
      ))}
    </span>
  )
}

function Chip({ abbr }: { abbr: string }) {
  const colors = teamColor(abbr)
  return <span className="pkg-chip" style={{ background: colors.primary, borderColor: colors.secondary }} />
}

function LastPlay({ state, tracker, player }: { state: GameState; tracker: PlayTracker; player: PlayerLookup }) {
  const last = tracker.latestPlay()
  const lines = last && last.summary ? playLines(last, player) : null
  return (
    <section className="pkg-panel pkg-last" data-testid="last-play">
      <h2 className="pkg-head">LAST PLAY</h2>
      <div className="pkg-brand">
        <Wordmark variant="c3" />
      </div>
      <div className="pkg-replay" data-testid="route-replay-slot">
        {last && <RouteReplay key={last.index} play={last} abbrs={[state.teams[0].abbr, state.teams[1].abbr]} />}
      </div>
      {last && lines && (
        <div className="pkg-summary">
          <div className="pkg-summary-action" data-testid="last-play-action">
            <Chip abbr={state.teams[last.offense].abbr} />
            {lines.action}
          </div>
          {lines.result && (
            <div className="pkg-summary-result" data-testid="last-play-result">
              {lines.result}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function Stats({ state, tracker, player }: { state: GameState; tracker: PlayTracker; player: PlayerLookup }) {
  const [page, setPage] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setPage((p) => (p + 1) % PAGES.length), STATS_PAGE_MS)
    return () => clearInterval(timer)
  }, [])
  const sections = statSections(state, tracker, player).filter((section) => PAGES[page].includes(section.id))
  return (
    <section className="pkg-panel pkg-stats">
      <div className="pkg-pages" data-testid="stats-pages">
        {PAGES.map((_, i) => (
          <span className={i === page ? 'pkg-dot pkg-dot-on' : 'pkg-dot'} key={i} />
        ))}
      </div>
      {sections.map((section) => (
        <div className={`pkg-section pkg-${section.id}`} data-testid={`stats-${section.id}`} key={section.id}>
          <h2 className="pkg-head" data-testid="stat-title">
            {section.title}{' '}
            <span className="pkg-head-figures">
              {section.footer && (
                <span className="pkg-long">
                  LONG <Figures figures={section.footer} className="pkg-long-figures" />
                </span>
              )}
              <Figures figures={section.totals} className="pkg-totals" />
            </span>
          </h2>
          <div className="pkg-table" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${section.lines[0]?.cells.length ?? 1}, auto)` }}>
            {section.lines.map((line, i) => (
              <div className="pkg-line" data-testid="stat-line" key={i}>
                <span className="pkg-name">
                  <Chip abbr={state.teams[line.side].abbr} />
                  <span className="pkg-num">#{line.number}</span>
                  {line.name}
                </span>
                {line.cells.map((c) => (
                  <Value cell={c} key={c.unit} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

function CurrentDrive({ state, tracker }: { state: GameState; tracker: PlayTracker }) {
  const drives = tracker.drives()
  const drive = drives[drives.length - 1]
  const [topA, topB] = tracker.timeOfPossession()
  const [a, b] = state.teams
  const open = drive?.result === 'IN_PROGRESS'
  const title = drive ? `${state.teams[drive.offense].abbr} ${open ? 'DRIVE' : 'LAST DRIVE'}` : `${state.teams[state.possession].abbr} BALL`
  return (
    <section className="pkg-panel pkg-drive" data-testid="current-drive">
      <h2 className="pkg-head">{title}</h2>
      {drive && (
        <div className="pkg-drive-line">
          {drive.plays} PLAYS {drive.yards} YDS {open ? `START ${drive.startClock}` : RESULT_TEXT[drive.result]}
        </div>
      )}
      <div className="pkg-drive-line">
        {state.inBreak ? formatSituation(state) : `${formatSituation(state)} AT ${formatBallOn(state.ballOn, state.teams)}`}
      </div>
      <div className="pkg-drive-line pkg-dim">
        TOP {a.abbr} {minutes(topA)} {b.abbr} {minutes(topB)}
      </div>
    </section>
  )
}

export default function StatsPackage({ state, tracker, player }: { state: GameState; tracker: PlayTracker; names: Names; player: PlayerLookup }) {
  return (
    <>
      <LastPlay state={state} tracker={tracker} player={player} />
      <Stats state={state} tracker={tracker} player={player} />
      <CurrentDrive state={state} tracker={tracker} />
    </>
  )
}
