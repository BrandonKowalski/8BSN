import type { TsbView } from '../../game/session'
import type { SlotProps, Slots } from '../../sdk/types'
import BreakScreen from './BreakScreen'
import HelmetClash from './HelmetClash'
import LowerTicker from './LowerTicker'
import { tsbMoments } from './replay/tsbMoments'
import Scorebug from './Scorebug'
import ScoringWipe from './ScoringWipe'
import { CurrentDrive, DriveEnd, endedDrive, LastPlay, latestHeadline, PlayerLead, Stats } from './StatsPackage'
import './broadcast.css'

type Props = SlotProps<TsbView>

function TsbScorebug({ data, generation }: Props) {
  const { wipe, held } = data.wipe
  return (
    <>
      <ScoringWipe wipe={wipe} state={data.state} helmets={data.helmets} />
      <Scorebug state={data.state} helmets={data.helmets} events={data.events} held={held} generation={generation} />
    </>
  )
}

function TsbPregame({ data, generation, league }: Props) {
  return <HelmetClash state={data.state} helmets={data.helmets} generation={generation} league={league} />
}

function TsbLastPlay({ data, restart, covered }: Props) {
  return data.state && <LastPlay state={data.state} tracker={data.tracker} player={data.player} restart={restart} covered={covered} />
}

function TsbStats({ data, paging }: Props) {
  return data.state && <Stats state={data.state} tracker={data.tracker} player={data.player} paging={paging} />
}

function TsbDriveEnd({ data }: Props) {
  return data.state && <DriveEnd state={data.state} tracker={data.tracker} />
}

function TsbPlayerLead({ data }: Props) {
  return data.state && <PlayerLead state={data.state} tracker={data.tracker} player={data.player} />
}

function TsbCurrentDrive({ data }: Props) {
  return data.state && <CurrentDrive state={data.state} tracker={data.tracker} />
}

function TsbLineup({ data }: Props) {
  return <LowerTicker band={data.band} abbrs={data.abbrs} player={data.player} />
}

function TsbBreaks({ data, emulator, rom }: Props) {
  return <BreakScreen state={data.state} tracker={data.tracker} player={data.player} helmets={data.helmets} emulator={emulator} rom={rom} />
}

function TsbPostgame({ data, emulator, rom, onPostgameDone }: Props) {
  return data.final && <BreakScreen state={data.state} tracker={data.tracker} player={data.player} helmets={data.helmets} emulator={emulator} rom={rom} aftershow={data.final} onClose={onPostgameDone} />
}

export const tsbSlots: Slots<TsbView> = {
  Scorebug: TsbScorebug,
  Pregame: TsbPregame,
  moments: { ...tsbMoments, Base: TsbLastPlay },
  Stats: TsbStats,
  left: {
    entries: [
      { id: 'drive', when: (d) => d.state !== null && endedDrive(d.tracker) !== null, Render: TsbDriveEnd },
      { id: 'player', when: (d) => d.state !== null && latestHeadline(d.tracker) !== null, Render: TsbPlayerLead },
    ],
    Fallback: TsbCurrentDrive,
  },
  tickers: [{ id: 'lineup', when: (d) => d.band.ticker !== null, Render: TsbLineup }],
  Breaks: TsbBreaks,
  Postgame: TsbPostgame,
}
