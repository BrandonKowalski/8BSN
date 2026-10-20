import type { Press } from '../sdk/types'

export type { Press }

export const HOLD_FRAMES = 6

export function scriptEnd(presses: readonly Press[]): number {
  const last = presses[presses.length - 1]
  return last ? last.at + HOLD_FRAMES : 0
}

export function maskAt(presses: readonly Press[], frame: number): number {
  const hit = presses.find((p) => frame >= p.at && frame < p.at + HOLD_FRAMES)
  return hit ? hit.mask : 0
}
