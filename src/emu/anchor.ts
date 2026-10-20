import type { RamTest } from '../sdk/types'

export function anchorMatches(ram: Uint8Array, tests: readonly RamTest[]): boolean {
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i]
    const value = ram[test.offset] & (test.mask ?? 0xff)
    if (test.oneOf && !test.oneOf.includes(value)) return false
    if (test.zero === true && value !== 0) return false
    if (test.zero === false && value === 0) return false
  }
  return true
}
