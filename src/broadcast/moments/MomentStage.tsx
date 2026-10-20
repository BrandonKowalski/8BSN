import type { ReactNode } from 'react'
import type { ReplayView } from '../../sdk/types'
import ReplayLeadIn from './ReplayLeadIn'

export default function MomentStage({ view, children }: { view: ReplayView; children: ReactNode }) {
  const { call, leadIn } = view
  if (call.kind === 'graphic') {
    return (
      <section className="replay" data-testid="replay-stage">
        {children}
      </section>
    )
  }
  return (
    <section className={leadIn ? 'replay replay-lead-in' : 'replay'} data-testid="replay-stage">
      {children}
      <ReplayLeadIn label={call.label} colors={call.colors} leaving={!leadIn} />
    </section>
  )
}
