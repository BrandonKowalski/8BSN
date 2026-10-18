import { formatBallOn, formatClock, formatSituation, playerName } from '../../game/format'
import type { BigMoment, DriveResult, PlayTracker } from '../../game/playTracker'
import type { GameState, PlayerStats, TeamState } from '../../game/types'
import type { NameLookup as Names, PlayerLookup } from '../../game/useGame'
import RouteReplay from './RouteReplay'
import { teamColor } from './teamColors'

const MAX_LINES = 4
const MOMENT_PLAYS = 3

export type Cell = { value: string; unit: string; zero: boolean }
type Line = { side: 0 | 1; name: string; number: number; cells: Cell[]; rank: number }
type TeamFigure = { abbr: string; cells: Cell[] }
type Section = { id: string; title: string; totals: TeamFigure[]; lines: Line[]; footer?: TeamFigure[] }

const MOMENT_LABEL: Record<BigMoment['kind'], string> = {
  LONG_TD: 'LONG TOUCHDOWN',
  BIG_PLAY: 'BIG PLAY',
  SACK: 'SACK',
  INT: 'INTERCEPTION',
}

const RESULT_TEXT: Record<DriveResult, string> = {
  TD: 'TOUCHDOWN',
  FG: 'FIELD GOAL',
  PUNT: 'PUNT',
  INT: 'INTERCEPTION',
  FUMBLE: 'FUMBLE',
  DOWNS: 'DOWNS',
  END_OF_HALF: 'END OF HALF',
  IN_PROGRESS: 'IN PROGRESS',
}

const cell = (value: number | string, unit: string, zero = value === 0): Cell => ({ value: String(value), unit, zero })

const total = (team: TeamState, pick: (p: PlayerStats) => number | undefined) =>
  team.players.reduce((sum, p) => sum + (pick(p) ?? 0), 0)

const minutes = (seconds: number) => formatClock({ min: Math.floor(seconds / 60), sec: seconds % 60 })

function collect(state: GameState, player: PlayerLookup, make: (p: PlayerStats) => { cells: Cell[]; rank: number } | null): Line[] {
  const lines: Line[] = []
  for (const side of [0, 1] as const) {
    for (const stats of state.teams[side].players) {
      const who = player(side, stats.rosterIndex)
      if (!who || !who.last) continue
      const line = make(stats)
      if (line) lines.push({ side, name: playerName(who, 'initial'), number: who.number, ...line })
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

function LastPlay({ state, tracker }: { state: GameState; tracker: PlayTracker }) {
  const last = tracker.latestPlay()
  return (
    <section className="pkg-panel pkg-last" data-testid="last-play">
      <h2 className="pkg-head">LAST PLAY</h2>
      <div className="pkg-replay" data-testid="route-replay-slot">
        {last && <RouteReplay key={last.index} play={last} abbrs={[state.teams[0].abbr, state.teams[1].abbr]} />}
      </div>
      {last && last.summary && (
        <div className="pkg-summary">
          <Chip abbr={state.teams[last.offense].abbr} />
          {last.summary}
        </div>
      )}
    </section>
  )
}

function Stats({ state, tracker, player }: { state: GameState; tracker: PlayTracker; player: PlayerLookup }) {
  return (
    <section className="pkg-panel pkg-stats">
      {statSections(state, tracker, player).map((section) => (
        <div className={`pkg-section pkg-${section.id}`} data-testid={`stats-${section.id}`} key={section.id}>
          <h2 className="pkg-head" data-testid="stat-title">
            {section.title} <Figures figures={section.totals} className="pkg-totals" />
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
          {section.footer && (
            <div className="pkg-footer">
              LONG <Figures figures={section.footer} className="pkg-footer-figures" />
            </div>
          )}
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

function Moment({ state, tracker }: { state: GameState; tracker: PlayTracker }) {
  const moments = tracker.moments()
  const moment = moments[moments.length - 1]
  if (!moment || moment.play.index < tracker.plays().length - MOMENT_PLAYS) return null
  const offense = moment.play.offense
  const side = moment.kind === 'SACK' || moment.kind === 'INT' ? (offense === 0 ? 1 : 0) : offense
  const colors = teamColor(state.teams[side].abbr)
  return (
    <section
      className="pkg-moment"
      data-testid="big-moment"
      style={{ background: `linear-gradient(90deg, ${colors.primary}, #0a142d)`, borderColor: colors.secondary }}
    >
      <span className="pkg-moment-kind">{MOMENT_LABEL[moment.kind]}</span>
      <span className="pkg-moment-text">
        {state.teams[side].abbr} {moment.text}
      </span>
    </section>
  )
}

export default function StatsPackage({ state, tracker, player }: { state: GameState; tracker: PlayTracker; names: Names; player: PlayerLookup }) {
  return (
    <>
      <LastPlay state={state} tracker={tracker} />
      <Stats state={state} tracker={tracker} player={player} />
      <CurrentDrive state={state} tracker={tracker} />
      <Moment state={state} tracker={tracker} />
    </>
  )
}
