import type { CSSProperties } from 'react'
import Wordmark from '../../../brand/Wordmark'
import { teamColor } from '../teamColors'

export const LEAD_IN_MS = 2000
export const LEAD_OUT_MS = 450

export default function ReplayLeadIn({ label, abbr, leaving = false }: { label: string | null; abbr: string; leaving?: boolean }) {
  const colors = teamColor(abbr)
  const style = { '--lead-primary': colors.primary, '--lead-secondary': colors.secondary, '--lead-ms': `${leaving ? LEAD_OUT_MS : LEAD_IN_MS}ms` } as CSSProperties
  return (
    <div className={leaving ? 'replay-lead replay-lead-leaving' : 'replay-lead'} data-testid={leaving ? 'replay-lead-out' : 'replay-lead-in'} style={style}>
      <span className="replay-lead-band replay-lead-back" />
      <span className="replay-lead-band replay-lead-front" />
      <div className="replay-lead-mark">
        <Wordmark variant="c3" />
        {label && <span className="replay-lead-label">{label}</span>}
      </div>
    </div>
  )
}
