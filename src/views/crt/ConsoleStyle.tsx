import type { PlayTracker } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import type { SlotRef } from './slot'
import StatBoard from './StatBoard'
import type { Names } from './Ticker'

type Props = { state: GameState | null; tracker: PlayTracker; names: Names; canvasSlot: SlotRef }

export default function ConsoleStyle({ state, tracker, names, canvasSlot }: Props) {
  return (
    <div className="console-frame" data-testid="console-style">
      <StatBoard state={state} tracker={tracker} names={names} />
      <div className="console-stage">
        <div className="console-cabinet">
          <div className="console-screen">
            <div className="canvas-slot" ref={canvasSlot} />
            <div className="tube-scanlines" />
            <div className="tube-glass" />
          </div>
          <div className="console-knobs">
            <i />
            <i />
          </div>
        </div>
      </div>
    </div>
  )
}
