import { HOLD_FRAMES, type Press } from '../emu/autoplay'
import { Btn } from '../input/buttons'
import type { Cell } from './matchup'

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
