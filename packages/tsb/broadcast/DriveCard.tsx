import { endedInSafety } from '../game/analysis'
import type { Drive, DriveResult, PlayResult } from '../game/playTracker'
import type { GameState } from '../game/types'
import type { TeamColor } from './teamColors'

export const RESULT_TEXT: Record<DriveResult, string> = {
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

const FIELD_YARDS = 120
const END_ZONE_YARDS = 10
const YARD_LINES = [10, 20, 30, 40, 50, 60, 70, 80, 90]

const onField = (yards: number) => Math.min(100, Math.max(0, yards))

export const fieldPercent = (yards: number) => ((END_ZONE_YARDS + onField(yards)) / FIELD_YARDS) * 100

export function fromOwnGoal(spot: GameState['ballOn'], offense: 0 | 1): number {
  if (spot.side === null) return 50
  return spot.side === offense ? spot.yard : 100 - spot.yard
}

export function driveWord(drive: Drive, plays: readonly PlayResult[]): string {
  return endedInSafety(plays, drive.offense) ? 'SAFETY' : RESULT_TEXT[drive.result]
}

type Props = { drive: Drive; abbrs: [string, string]; colors: [TeamColor, TeamColor]; word?: string }

export default function DriveCard({ drive, abbrs, colors, word = RESULT_TEXT[drive.result] }: Props) {
  const defense = drive.offense === 0 ? 1 : 0
  const from = fromOwnGoal(drive.startSpot, drive.offense)
  const to = fromOwnGoal(drive.endSpot, drive.offense)
  const back = to < from
  const left = fieldPercent(Math.min(from, to))
  const width = (Math.abs(onField(to) - onField(from)) / FIELD_YARDS) * 100
  const zone = (side: 0 | 1) => (
    <span className="drive-card-zone" data-testid="drive-card-zone" style={{ backgroundColor: colors[side].primary, borderColor: colors[side].secondary }}>
      {abbrs[side]}
    </span>
  )
  return (
    <section className="pkg-panel pkg-drive drive-card" data-testid="drive-card">
      <h2 className="pkg-head drive-card-head" data-testid="drive-card-head">
        <span>{abbrs[drive.offense]} DRIVE</span> <span className="drive-card-word">{word}</span>
      </h2>
      <div className="drive-card-field">
        {zone(drive.offense)}
        <div className="drive-card-grass">
          {YARD_LINES.map((y) => (
            <span className="drive-card-yard" data-testid="drive-card-yard" key={y} style={{ left: `${y}%` }}>
              {y > 50 ? 100 - y : y}
            </span>
          ))}
        </div>
        {zone(defense)}
        <span className="drive-card-tick" data-testid="drive-card-tick" style={{ left: `${fieldPercent(from)}%` }} />
        <span className={back ? 'drive-card-arrow drive-card-back' : 'drive-card-arrow'} data-testid="drive-card-arrow" style={{ left: `${left}%`, width: `${width}%` }} />
      </div>
      <div className="drive-card-figures" data-testid="drive-card-figures">
        <Figure value={drive.plays} unit={drive.plays === 1 ? 'PLAY' : 'PLAYS'} />
        <Figure value={drive.yards} unit="YARDS" />
        <Figure value={drive.endTime} unit="TOP" />
      </div>
    </section>
  )
}

function Figure({ value, unit }: { value: number | string; unit: string }) {
  return (
    <span className="pkg-value">
      {value}
      <span className="pkg-unit">{unit}</span>
    </span>
  )
}
