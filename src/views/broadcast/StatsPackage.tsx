import { formatBallOn, formatClock, formatSituation } from '../../game/format'
import type { BigMoment, DriveResult, PlayTracker } from '../../game/playTracker'
import type { GameState, PlayerStats, TeamState } from '../../game/types'
import type { Names } from '../crt/Ticker'
import { defLine, passLine, recLine, rushLine } from '../crt/statLines'
import RouteReplay from './RouteReplay'
import { teamColor } from './teamColors'

const MAX_LINES = 5
const MOMENT_PLAYS = 3

type Line = { side: 0 | 1; text: string; rank: number }
type Section = { id: string; title: string; totals: string; lines: Line[]; footer?: string }

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
  TURNOVER: 'TURNOVER',
  END_OF_HALF: 'END OF HALF',
  IN_PROGRESS: 'IN PROGRESS',
}

const total = (team: TeamState, pick: (p: PlayerStats) => number | undefined) =>
  team.players.reduce((sum, p) => sum + (pick(p) ?? 0), 0)

const minutes = (seconds: number) => formatClock({ min: Math.floor(seconds / 60), sec: seconds % 60 })

function collect(state: GameState, names: Names, make: (p: PlayerStats, name: string) => Omit<Line, 'side'> | null): Line[] {
  const lines: Line[] = []
  for (const side of [0, 1] as const) {
    for (const player of state.teams[side].players) {
      const name = names(side, player.rosterIndex)
      if (!name) continue
      const line = make(player, name)
      if (line) lines.push({ side, ...line })
    }
  }
  return lines.sort((a, b) => b.rank - a.rank).slice(0, MAX_LINES)
}

function longFooter(state: GameState, tracker: PlayTracker, kind: 'rush' | 'rec'): string | undefined {
  const parts = ([0, 1] as const)
    .map((side) => ({ abbr: state.teams[side].abbr, yards: tracker.longest(side, kind) }))
    .filter((p) => p.yards > 0)
    .map((p) => `${p.abbr} ${p.yards}`)
  return parts.length > 0 ? `LONG ${parts.join('  ')}` : undefined
}

export function statSections(state: GameState, tracker: PlayTracker, names: Names): Section[] {
  const [a, b] = state.teams
  const totals = (pick: (p: PlayerStats) => number | undefined) => `${a.abbr} ${total(a, pick)}  ${b.abbr} ${total(b, pick)}`
  return [
    {
      id: 'rushing',
      title: 'RUSHING',
      totals: totals((p) => p.rush?.yds),
      lines: collect(state, names, ({ rush }, name) => (rush && rush.att > 0 ? { text: rushLine(name, rush), rank: rush.yds } : null)),
      footer: longFooter(state, tracker, 'rush'),
    },
    {
      id: 'passing',
      title: 'PASSING',
      totals: totals((p) => p.pass?.yds),
      lines: collect(state, names, ({ pass }, name) => (pass && pass.att > 0 ? { text: passLine(name, pass), rank: pass.yds } : null)),
    },
    {
      id: 'receiving',
      title: 'RECEIVING',
      totals: totals((p) => p.rec?.yds),
      lines: collect(state, names, ({ rec }, name) => (rec && rec.rec > 0 ? { text: recLine(name, rec), rank: rec.yds } : null)),
      footer: longFooter(state, tracker, 'rec'),
    },
    {
      id: 'defense',
      title: 'DEFENSE',
      totals: `${a.abbr} ${total(a, (p) => p.def?.sacks)} SK ${total(a, (p) => p.def?.int)} INT  ${b.abbr} ${total(b, (p) => p.def?.sacks)} SK ${total(b, (p) => p.def?.int)} INT`,
      lines: collect(state, names, ({ def }, name) =>
        def && (def.sacks > 0 || def.int > 0) ? { text: defLine(name, def), rank: def.sacks + def.int * 2 } : null,
      ),
    },
  ]
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
        {last && <RouteReplay key={last.index} play={last} />}
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

function Stats({ state, tracker, names }: { state: GameState; tracker: PlayTracker; names: Names }) {
  return (
    <section className="pkg-panel pkg-stats">
      {statSections(state, tracker, names).map((section) => (
        <div className={`pkg-section pkg-${section.id}`} data-testid={`stats-${section.id}`} key={section.id}>
          <h2 className="pkg-head" data-testid="stat-title">
            {section.title} <span className="pkg-totals">{section.totals}</span>
          </h2>
          {section.lines.map((line, i) => (
            <div className="pkg-line" data-testid="stat-line" key={i}>
              <Chip abbr={state.teams[line.side].abbr} />
              {line.text}
            </div>
          ))}
          {section.footer && <div className="pkg-footer">{section.footer}</div>}
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

export default function StatsPackage({ state, tracker, names }: { state: GameState; tracker: PlayTracker; names: Names }) {
  return (
    <>
      <LastPlay state={state} tracker={tracker} />
      <Stats state={state} tracker={tracker} names={names} />
      <CurrentDrive state={state} tracker={tracker} />
      <Moment state={state} tracker={tracker} />
    </>
  )
}
