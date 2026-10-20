import { describe, expect, it } from 'vitest'
import { CONTRACT, PHASES } from '@8bsn/sdk'

describe('sdk alias', () => {
  it('resolves value imports from @8bsn/sdk', () => {
    expect(CONTRACT).toBe(1)
    expect(PHASES).toHaveLength(5)
  })
})
