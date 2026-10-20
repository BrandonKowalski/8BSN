import { Btn } from '../input/buttons'
import type { Cell } from './matchup'

export type Press = { at: number; mask: number }

export const HOLD_FRAMES = 6

type Step = { wait: number } | { press: number }

const press = (mask: number, gap: number): Step[] => [{ press: mask }, { wait: gap }]
const repeat = (mask: number, times: number, gap: number): Step[] => Array.from({ length: times }, () => press(mask, gap)).flat()
const moves = ([across, down]: Cell): Step[] => [...repeat(Btn.RIGHT, across, 15), ...repeat(Btn.DOWN, down, 15)]

export function attractScript([first, second]: [Cell, Cell]): Press[] {
  const steps: Step[] = [
    { wait: 300 },
    ...press(Btn.START, 120),
    ...press(Btn.START, 90),
    ...press(Btn.A, 90),
    ...press(Btn.A, 90),
    ...repeat(Btn.DOWN, 5, 20),
    ...press(Btn.A, 60),
    ...moves(first),
    ...press(Btn.A, 45),
    ...moves(second),
    ...press(Btn.A, 60),
    ...press(Btn.A, 120),
  ]
  const presses: Press[] = []
  let at = 0
  for (const step of steps) {
    if ('wait' in step) at += step.wait
    else {
      presses.push({ at, mask: step.press })
      at += HOLD_FRAMES
    }
  }
  return presses
}

export function scriptEnd(presses: readonly Press[]): number {
  const last = presses[presses.length - 1]
  return last ? last.at + HOLD_FRAMES : 0
}

export function maskAt(presses: readonly Press[], frame: number): number {
  const hit = presses.find((p) => frame >= p.at && frame < p.at + HOLD_FRAMES)
  return hit ? hit.mask : 0
}
