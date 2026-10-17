import type { SlotRef } from './slot'

export default function ConsoleStyle({ canvasSlot }: { canvasSlot: SlotRef }) {
  return (
    <div className="console-frame" data-testid="console-style">
      <div className="canvas-slot" ref={canvasSlot} />
    </div>
  )
}
