import { playOfDrive, replayWorthy } from '../../../game/analysis'
import { featuredTeam } from '../../../game/format'
import type { PlayResult, PlayTracker, TrackerEvent } from '../../../game/playTracker'
import { drivePlays } from '../../../game/teamStats'
import type { PlayerLookup } from '../../../game/useGame'
import type { MomentDef, Moments, ReplayCall, ReplayView } from '../../../sdk/types'
import { teamColor } from '../teamColors'
import FootageLook, { replayStats, Strip } from './FootageLook'

export const CLIP_TAIL_FRAMES = 20
export const INSTANT_REPLAY = 'INSTANT REPLAY'
export const PLAY_OF_THE_DRIVE = 'PLAY OF THE DRIVE'

export type TsbView = { tracker: PlayTracker; events: readonly TrackerEvent[]; celebrating: boolean; screened: boolean; abbrs: [string, string]; player: PlayerLookup }
export type Replayed = { play: PlayResult }

export function playCall(play: PlayResult, game: number, abbrs: [string, string], key: string, label: string | null): ReplayCall<Replayed> {
  return {
    kind: 'replay',
    key,
    subject: `play:${game}:${play.index}`,
    clip: { from: play.startFrame, to: play.endFrame + CLIP_TAIL_FRAMES },
    label,
    colors: teamColor(abbrs[featuredTeam(play)]),
    payload: { play },
  }
}

type ReplayProps = { data: Pick<TsbView, 'abbrs' | 'player'>; view: ReplayView<Replayed> }

export function TsbReplay({ data, view }: ReplayProps) {
  const { play } = view.call.payload
  const label = view.call.kind === 'replay' ? view.call.label : null
  return (
    <>
      {label && (
        <div className="replay-head">
          <span className="replay-title">{label}</span>
        </div>
      )}
      {view.leadIn ? <Strip stats={replayStats(play)} /> : <FootageLook view={view} abbrs={data.abbrs} player={data.player} />}
    </>
  )
}

function latestEnded(events: readonly TrackerEvent[]): PlayResult | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type === 'playEnd') return event.play
  }
  return null
}

const instant: MomentDef<TsbView, Replayed> = {
  id: 'instant',
  priority: 2,
  when: (d) => {
    const play = latestEnded(d.events)
    if (!play || !replayWorthy(play)) return null
    const game = d.tracker.epoch()
    return playCall(play, game, d.abbrs, `instant:${game}:${play.index}`, null)
  },
  Render: TsbReplay,
}

const drive: MomentDef<TsbView, Replayed> = {
  id: 'drive',
  priority: 1,
  when: (d) => {
    const last = d.tracker.lastDrive()
    if (!last) return null
    const drives = d.tracker.drives().filter((x) => x.result !== 'IN_PROGRESS')
    const groups = drivePlays(d.tracker.plays(), drives)
    const best = playOfDrive(groups[groups.length - 1] ?? [], last)
    if (!best) return null
    const game = d.tracker.epoch()
    return playCall(best, game, d.abbrs, `drive:${game}:${drives.length}`, PLAY_OF_THE_DRIVE)
  },
  Render: TsbReplay,
}

let manualCalls = 0

const manual: MomentDef<TsbView, Replayed> = {
  id: 'manual',
  priority: 2,
  when: (d) => {
    const plays = d.tracker.plays()
    const latest = plays[plays.length - 1]
    if (!latest) return null
    manualCalls += 1
    const game = d.tracker.epoch()
    return playCall(latest, game, d.abbrs, `manual:${game}:${latest.index}:${manualCalls}`, null)
  },
  Render: TsbReplay,
}

export const tsbMoments: Moments<TsbView> = {
  defs: [instant, drive],
  manual,
  defer: (d) => d.celebrating,
  cancel: (d) => d.screened || d.events.some((e) => e.type === 'snap'),
}
