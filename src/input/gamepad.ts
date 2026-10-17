import { Btn } from './buttons'

const DEADZONE = 0.5

const BUTTON_MAP: readonly (readonly [number, number])[] = [
  [0, Btn.B],
  [1, Btn.A],
  [8, Btn.SELECT],
  [9, Btn.START],
  [12, Btn.UP],
  [13, Btn.DOWN],
  [14, Btn.LEFT],
  [15, Btn.RIGHT],
]

export function padToMask(pad: Pick<Gamepad, 'buttons' | 'axes'>): number {
  let mask = 0
  const buttons = pad.buttons ?? []
  for (const [index, bit] of BUTTON_MAP) {
    if (buttons[index]?.pressed) mask |= bit
  }
  const x = pad.axes?.[0] ?? 0
  const y = pad.axes?.[1] ?? 0
  if (x > DEADZONE) mask |= Btn.RIGHT
  if (x < -DEADZONE) mask |= Btn.LEFT
  if (y > DEADZONE) mask |= Btn.DOWN
  if (y < -DEADZONE) mask |= Btn.UP
  return mask
}

function padKey(pad: Gamepad): string {
  return `${pad.id}:${pad.index}`
}

export class PadSlots {
  private keys: [string | null, string | null] = [null, null]

  update(pads: ArrayLike<Gamepad | null>): [number, number] {
    const present = new Map<string, Gamepad>()
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i]
      if (pad && pad.connected !== false) present.set(padKey(pad), pad)
    }

    const claimed = new Set<string>()
    for (const key of this.keys) {
      if (key !== null && present.has(key)) claimed.add(key)
    }

    for (const [key] of present) {
      if (claimed.has(key) || this.keys.includes(key)) continue
      let slot = this.keys.indexOf(null)
      if (slot < 0) slot = this.keys.findIndex((k) => k !== null && !present.has(k))
      if (slot < 0) continue
      this.keys[slot] = key
      claimed.add(key)
    }

    const masks: [number, number] = [0, 0]
    for (let slot = 0; slot < 2; slot++) {
      const key = this.keys[slot]
      const pad = key === null ? undefined : present.get(key)
      if (pad) masks[slot] = padToMask(pad)
    }
    return masks
  }
}
