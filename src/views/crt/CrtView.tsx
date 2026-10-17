import type { PlayTracker } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import type { CrtStyle } from '../useHotkeys'
import ConsoleStyle from './ConsoleStyle'
import type { SlotRef } from './slot'
import Ticker, { type Names } from './Ticker'
import TubeStyle from './TubeStyle'
import './crt.css'

type Props = { state: GameState | null; tracker: PlayTracker; names: Names; crtStyle: CrtStyle; canvasSlot: SlotRef }

export default function CrtView({ state, tracker, names, crtStyle, canvasSlot }: Props) {
  if (crtStyle === 'console') {
    return (
      <div className="view view-crt" data-testid="crt-view">
        <ConsoleStyle state={state} tracker={tracker} names={names} canvasSlot={canvasSlot} />
      </div>
    )
  }
  return (
    <div className="view view-crt crt-tube" data-testid="crt-view">
      <Ticker state={state} tracker={tracker} names={names} />
      <TubeStyle canvasSlot={canvasSlot} />
    </div>
  )
}
