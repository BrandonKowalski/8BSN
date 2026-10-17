import type { SlotRef } from './slot'

export default function TubeStyle({ canvasSlot }: { canvasSlot: SlotRef }) {
  return (
    <div className="tube-wrap" data-testid="tube-style">
      <div className="tube">
        <div className="canvas-slot" ref={canvasSlot} />
        <div className="tube-scanlines" />
        <div className="tube-glass" />
      </div>
    </div>
  )
}
