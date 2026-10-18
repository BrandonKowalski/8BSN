import { useCallback } from 'react'
import type { Look } from '../../../game/analysis'
import type { ReplayView } from './useReplay'

const LOOK_LABEL: Record<Look, string> = {
  footage: 'GAME FOOTAGE',
  topdown: 'TOP DOWN',
  telestrator: 'TELESTRATOR',
}

export default function ReplayStage({ view }: { view: ReplayView }) {
  const { canvas, look } = view
  const mount = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !canvas || canvas.parentElement === node) return
      canvas.className = 'replay-canvas'
      node.appendChild(canvas)
    },
    [canvas],
  )
  return (
    <section className={`replay replay-${look}`} data-testid="replay-stage">
      <div className="replay-head">
        <span className="replay-title">INSTANT REPLAY</span>
        <span className="replay-look">{LOOK_LABEL[look]}</span>
      </div>
      {look === 'footage' ? (
        <div key="footage" className="replay-picture" ref={mount} />
      ) : (
        <div key={look} className="replay-picture">
          <div className="replay-placeholder">{view.play.summary}</div>
        </div>
      )}
    </section>
  )
}
