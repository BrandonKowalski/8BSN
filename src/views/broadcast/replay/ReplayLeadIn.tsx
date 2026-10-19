import type { CSSProperties } from 'react'
import Wordmark from '../../../brand/Wordmark'
import { teamColor } from '../teamColors'

export const LEAD_IN_MS = 2000

export default function ReplayLeadIn({ label, abbr }: { label: string | null; abbr: string }) {
  const colors = teamColor(abbr)
  const style = { '--lead-primary': colors.primary, '--lead-secondary': colors.secondary, '--lead-ms': `${LEAD_IN_MS}ms` } as CSSProperties
  return (
    <div className="replay-lead" data-testid="replay-lead-in" style={style}>
      <span className="replay-lead-band replay-lead-back" />
      <span className="replay-lead-band replay-lead-front" />
      <div className="replay-lead-mark">
        <Wordmark variant="c3" />
        {label && <span className="replay-lead-label">{label}</span>}
      </div>
    </div>
  )
}
