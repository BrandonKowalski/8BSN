import { Btn } from './buttons'

const KEY_MAP: Record<string, readonly [0 | 1, number]> = {
  ArrowUp: [0, Btn.UP],
  ArrowDown: [0, Btn.DOWN],
  ArrowLeft: [0, Btn.LEFT],
  ArrowRight: [0, Btn.RIGHT],
  KeyX: [0, Btn.A],
  KeyZ: [0, Btn.B],
  Enter: [0, Btn.START],
  ShiftRight: [0, Btn.SELECT],
  KeyW: [1, Btn.UP],
  KeyS: [1, Btn.DOWN],
  KeyA: [1, Btn.LEFT],
  KeyD: [1, Btn.RIGHT],
  KeyK: [1, Btn.A],
  KeyJ: [1, Btn.B],
  Space: [1, Btn.START],
  ShiftLeft: [1, Btn.SELECT],
}

export class KeyboardInput {
  private held = new Set<string>()
  private readonly target: EventTarget
  private readonly onDown = (event: Event) => this.handle(event as KeyboardEvent, true)
  private readonly onUp = (event: Event) => this.handle(event as KeyboardEvent, false)
  private readonly onBlur = () => this.held.clear()

  constructor(target: EventTarget) {
    this.target = target
    target.addEventListener('keydown', this.onDown)
    target.addEventListener('keyup', this.onUp)
    target.addEventListener('blur', this.onBlur)
  }

  masks(): [number, number] {
    const masks: [number, number] = [0, 0]
    for (const code of this.held) {
      const entry = KEY_MAP[code]
      if (entry) masks[entry[0]] |= entry[1]
    }
    return masks
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown)
    this.target.removeEventListener('keyup', this.onUp)
    this.target.removeEventListener('blur', this.onBlur)
    this.held.clear()
  }

  private handle(event: KeyboardEvent, down: boolean): void {
    if (!Object.hasOwn(KEY_MAP, event.code)) return
    event.preventDefault()
    if (down) this.held.add(event.code)
    else this.held.delete(event.code)
  }
}
