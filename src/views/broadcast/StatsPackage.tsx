import { useEffect, useState } from 'react'
import { headline, lastPlayView } from '../../game/analysis'
import { featuredTeam, formatBallOn, formatClock, formatSituation, playHeadline, playerTag, TAG_FITS, type TagFit } from '../../game/format'
import type { PlayResult, PlayTracker } from '../../game/playTracker'
import type { RosterPlayer } from '../../game/roster'
import type { GameState, PlayerStats, TeamState } from '../../game/types'
import type { PlayerLookup } from '../../game/useGame'
import { drivePlays } from '../../game/teamStats'
import DriveCard, { driveWord, RESULT_TEXT } from './DriveCard'
import PlayerCard from './PlayerCard'
import PlayerTag from './PlayerTag'
import RouteReplay from './RouteReplay'
import TopDownLook from './replay/TopDownLook'
import { teamColor } from './teamColors'

const MAX_LINES = 3
const NAME_BUDGET = 16
const LINE_UNITS = 37.5
const DIGIT_UNITS = 0.9
const UNIT_UNITS = 0.52
const CELL_UNITS = 0.9
const SPACE_UNITS = 0.4
const LINE_FONT_CQH = 4
const HEADLINE_BUDGET = 40
export const STATS_PAGE_MS = 6000
const PAGES = [['rushing', 'passing'], ['receiving', 'defense']]

export type Paging = { by: -1 | 1; n: number }

export type Cell = { value: string; unit: string; zero: boolean }
type Line = { side: 0 | 1; who: RosterPlayer; fit: TagFit; cells: Cell[]; rank: number; squeeze?: number }
type TeamFigure = { abbr: string; cells: Cell[] }
type Section = { id: string; title: string; totals: TeamFigure[]; lines: Line[]; footer?: TeamFigure[] }

const cell = (value: number | string, unit: string, zero = value === 0): Cell => ({ value: String(value), unit, zero })

const total = (team: TeamState, pick: (p: PlayerStats) => number | undefined) =>
  team.players.reduce((sum, p) => sum + (pick(p) ?? 0), 0)

const minutes = (seconds: number) => formatClock({ min: Math.floor(seconds / 60), sec: seconds % 60 })

const FITS: TagFit[] = ['full', 'initial']

export function fitHeadline(play: PlayResult, player: PlayerLookup): { text: string; wraps: boolean } {
  for (const fit of FITS) {
    const text = playHeadline(play, player, fit)
    if (text.length <= HEADLINE_BUDGET) return { text, wraps: false }
  }
  const text = playHeadline(play, player, 'last')
  return { text, wraps: text.length > HEADLINE_BUDGET }
}

const cellUnits = (c: Cell) => c.value.length * DIGIT_UNITS + c.unit.length * UNIT_UNITS + CELL_UNITS

function tagUnits(who: RosterPlayer, fit: TagFit): number {
  const { number, name, position } = playerTag(who, fit)
  return (number ? number.length * DIGIT_UNITS + SPACE_UNITS : 0) + name.length + (position ? SPACE_UNITS + position.length * UNIT_UNITS : 0)
}

function tagFit(who: RosterPlayer, room: number): { fit: TagFit; squeeze?: number } {
  const fits = (fit: TagFit) => playerTag(who, fit).name.length <= NAME_BUDGET && tagUnits(who, fit) <= room
  const fit = TAG_FITS.find(fits)
  if (fit) return { fit }
  const name = playerTag(who, 'lastNoPos').name.length
  return { fit: 'lastNoPos', squeeze: Math.max(Math.min(NAME_BUDGET / name, room / tagUnits(who, 'lastNoPos')), 0.05) }
}

function collect(
  state: GameState,
  player: PlayerLookup,
  make: (p: PlayerStats, side: 0 | 1) => { cells: Cell[]; rank: number } | null,
): Line[] {
  const rows: { side: 0 | 1; who: RosterPlayer; cells: Cell[]; rank: number }[] = []
  for (const side of [0, 1] as const) {
    for (const stats of state.teams[side].players) {
      const who = player(side, stats.rosterIndex)
      if (!who || !who.last) continue
      const line = make(stats, side)
      if (line) rows.push({ side, who, ...line })
    }
  }
  const top = rows.sort((a, b) => b.rank - a.rank).slice(0, MAX_LINES)
  const columns = top.reduce<number[]>((widest, row) => row.cells.map((c, i) => Math.max(widest[i] ?? 0, cellUnits(c))), [])
  const room = LINE_UNITS - columns.reduce((sum, w) => sum + w, 0)
  return top.map(({ side, who, cells, rank }) => ({ side, who, cells, rank, ...tagFit(who, room) }))
}

type Credit = (play: PlayResult) => number | undefined

function splitSum(plays: readonly PlayResult[], side: 0 | 1, pick: (play: PlayResult) => number | null, who?: Credit, rosterIndex?: number): number {
  return plays.reduce((sum, play) => {
    const value = pick(play)
    if (play.offense !== side || typeof value !== 'number') return sum
    if (who && who(play) !== rosterIndex) return sum
    return sum + value
  }, 0)
}

const airOf = (play: PlayResult) => play.airYards
const yacOf = (play: PlayResult) => play.yac
const passerOf: Credit = (play) => play.people.passer
const receiverOf: Credit = (play) => play.people.receiver

function longest(state: GameState, tracker: PlayTracker, kind: 'rush'): TeamFigure[] | undefined {
  const figures = ([0, 1] as const)
    .map((side) => ({ abbr: state.teams[side].abbr, yards: tracker.longest(side, kind) }))
    .filter((p) => p.yards > 0)
    .map((p) => ({ abbr: p.abbr, cells: [cell(p.yards, 'YDS')] }))
  return figures.length > 0 ? figures : undefined
}

const shown = (figures: TeamFigure[]): TeamFigure[] =>
  figures.map((f) => ({ ...f, cells: f.cells.filter((c) => c.value !== '0') })).filter((f) => f.cells.length > 0)

export function statPages(sections: Section[]): Section[][] {
  return PAGES.map((ids) => sections.filter((s) => ids.includes(s.id))).filter((page) => page.length > 0)
}

export function statSections(state: GameState, tracker: PlayTracker, player: PlayerLookup): Section[] {
  return buildSections(state, tracker, player)
    .filter((section) => section.lines.length > 0)
    .map((section) => ({ ...section, totals: shown(section.totals), footer: section.footer && shown(section.footer) }))
}

function buildSections(state: GameState, tracker: PlayTracker, player: PlayerLookup): Section[] {
  const teams = state.teams
  const plays = tracker.plays()
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
      lines: collect(state, player, ({ pass, rosterIndex }, side) =>
        pass && pass.att > 0
          ? {
              cells: [
                cell(`${pass.comp}/${pass.att}`, 'C/A'),
                cell(pass.yds, 'YDS', false),
                cell(splitSum(plays, side, airOf, passerOf, rosterIndex), 'AIR'),
                cell(pass.td, 'TD'),
                cell(pass.int, 'INT'),
              ],
              rank: pass.yds,
            }
          : null,
      ),
    },
    {
      id: 'receiving',
      title: 'RECEIVING',
      totals: teams.map((team, side) => ({
        abbr: team.abbr,
        cells: [cell(total(team, (p) => p.rec?.yds), 'YDS', false), cell(splitSum(plays, side as 0 | 1, yacOf), 'YAC', false)],
      })),
      lines: collect(state, player, ({ rec, rosterIndex }, side) =>
        rec && rec.rec > 0
          ? { cells: [cell(rec.rec, 'REC'), cell(rec.yds, 'YDS', false), cell(splitSum(plays, side, yacOf, receiverOf, rosterIndex), 'YAC'), cell(rec.td, 'TD')], rank: rec.yds }
          : null,
      ),
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

function LastPlay({ state, tracker, player, restart, covered }: { state: GameState; tracker: PlayTracker; player: PlayerLookup; restart: number; covered: boolean }) {
  const last = tracker.latestPlay()
  const headline = last && last.summary ? fitHeadline(last, player) : null
  const abbrs: [string, string] = [state.teams[0].abbr, state.teams[1].abbr]
  const all22 = last !== null && last.tracks.players.length > 1 && lastPlayView(last) === 'all22'
  const keyed = last !== null && typeof last.airYards === 'number' && typeof last.yac === 'number'
  return (
    <section className="pkg-panel pkg-last" data-testid="last-play">
      <h2 className="pkg-head">
        LAST PLAY
        {(keyed || all22) && (
          <span className="pkg-last-side">
            {keyed && (
              <span className="pkg-air-key" data-testid="air-key">
                <span className="pkg-air-key-row">
                  <span className="air-swatch air-swatch-air" />
                  {`AIR ${last.airYards} YDS`}
                </span>
                <span className="pkg-air-key-row">
                  <span className="air-swatch air-swatch-yac" />
                  {`YAC ${last.yac} YDS`}
                </span>
              </span>
            )}
            {all22 && (
              <span className="pkg-last-view" data-testid="last-play-view">
                ALL 22
              </span>
            )}
          </span>
        )}
      </h2>
      {last ? (
        <div className="pkg-replay" data-testid="route-replay-slot">
          {all22 ? <TopDownLook key={last.index} play={last} abbrs={abbrs} player={player} loop restart={restart} paused={covered} /> : <RouteReplay key={last.index} play={last} abbrs={abbrs} />}
        </div>
      ) : (
        <div className="pkg-last-empty" data-testid="last-play-empty">
          NO PLAYS YET
        </div>
      )}
      {last && headline && (
        <div className={headline.wraps ? 'pkg-headline pkg-headline-wrap' : 'pkg-headline'} data-testid="last-play-headline">
          <Chip abbr={state.teams[featuredTeam(last)].abbr} />
          {headline.text}
        </div>
      )}
    </section>
  )
}

const NO_PAGING: Paging = { by: 1, n: 0 }

function Stats({ state, tracker, player, paging }: { state: GameState; tracker: PlayTracker; player: PlayerLookup; paging: Paging }) {
  const [tick, setTick] = useState(0)
  const [seen, setSeen] = useState(paging.n)
  if (seen !== paging.n) {
    setSeen(paging.n)
    setTick((t) => t + paging.by)
  }
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), STATS_PAGE_MS)
    return () => clearInterval(timer)
  }, [paging.n])
  const pages = statPages(statSections(state, tracker, player))
  const page = pages.length > 0 ? ((tick % pages.length) + pages.length) % pages.length : 0
  const sections = pages[page] ?? []
  return (
    <section className="pkg-panel pkg-stats">
      <div className="pkg-pages" data-testid="stats-pages">
        {pages.map((_, i) => (
          <span className={i === page ? 'pkg-dot pkg-dot-on' : 'pkg-dot'} key={i} />
        ))}
      </div>
      {pages.length === 0 && (
        <div className="pkg-stats-empty" data-testid="stats-empty">
          NO STATS YET
        </div>
      )}
      {sections.map((section) => (
        <div className={`pkg-section pkg-${section.id}`} data-testid={`stats-${section.id}`} key={section.id}>
          <h2 className="pkg-head" data-testid="stat-title">
            {section.title}{' '}
            <span className="pkg-head-figures">
              {section.footer && section.footer.length > 0 && (
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
                <span className="pkg-name" style={line.squeeze ? { fontSize: `${LINE_FONT_CQH * line.squeeze}cqh` } : undefined}>
                  <Chip abbr={state.teams[line.side].abbr} />
                  <PlayerTag player={line.who} fit={line.fit} />
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
          {drive.plays} {drive.plays === 1 ? 'PLAY' : 'PLAYS'} {drive.yards} YDS {open ? `START ${drive.startClock}` : RESULT_TEXT[drive.result]}
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

function DriveSlot({ state, tracker, player }: { state: GameState; tracker: PlayTracker; player: PlayerLookup }) {
  const drives = tracker.drives()
  const plays = tracker.plays()
  const drive = drives[drives.length - 1]
  const abbrs: [string, string] = [state.teams[0].abbr, state.teams[1].abbr]
  if (drive && drive.result !== 'IN_PROGRESS') {
    const group = drivePlays(plays, drives)[drives.length - 1] ?? []
    return <DriveCard drive={drive} abbrs={abbrs} colors={[teamColor(abbrs[0]), teamColor(abbrs[1])]} word={driveWord(drive, group)} />
  }
  const latest = plays[plays.length - 1]
  const lead = latest ? headline(latest, plays) : null
  if (lead) return <PlayerCard headline={lead} state={state} player={player} plays={plays} />
  return <CurrentDrive state={state} tracker={tracker} />
}

type Props = { state: GameState; tracker: PlayTracker; player: PlayerLookup; paging?: Paging; restart?: number; covered?: boolean }

export default function StatsPackage({ state, tracker, player, paging = NO_PAGING, restart = 0, covered = false }: Props) {
  return (
    <>
      <LastPlay state={state} tracker={tracker} player={player} restart={restart} covered={covered} />
      <Stats state={state} tracker={tracker} player={player} paging={paging} />
      <DriveSlot state={state} tracker={tracker} player={player} />
    </>
  )
}
