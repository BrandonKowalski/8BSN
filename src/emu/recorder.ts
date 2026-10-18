export type Clip = { from: number; to: number; state: Uint8Array; inputs: Uint16Array; hashes: Uint32Array }
export type RecordingData = { origin: number; inputs: Uint16Array; hashes: Uint32Array; snaps: [number, Uint8Array][] }

const FPS = 60
const DEFAULT_MAX_FRAMES = 4 * 60 * 60 * FPS
const INITIAL_FRAMES = 1 << 14

export function ramHash(ram: Uint8Array): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < ram.length; i++) hash = Math.imul(hash ^ ram[i], 0x01000193)
  return hash >>> 0
}

export class Recorder {
  private origin = 0
  private length = 0
  private inputs = new Uint16Array(0)
  private hashes = new Uint32Array(0)
  private snaps: [number, Uint8Array][] = []
  private wasLive = false

  constructor(private readonly maxFrames = DEFAULT_MAX_FRAMES) {}

  frame(frame: number, p1: number, p2: number, ram: Uint8Array, live: boolean, saveState: () => Uint8Array | null): void {
    if (this.length >= this.maxFrames) return
    if (this.length === 0 || frame !== this.origin + this.length) this.restart(frame)
    if (this.length === this.hashes.length) this.grow()
    const at = this.length
    this.inputs[at * 2] = p1
    this.inputs[at * 2 + 1] = p2
    this.hashes[at] = ramHash(ram)
    this.length = at + 1
    if (live && !this.wasLive) {
      const state = saveState()
      if (state) this.snaps.push([frame, state])
    }
    this.wasLive = live
  }

  clip(from: number, to: number): Clip | null {
    if (from > to || from < this.origin || to >= this.origin + this.length) return null
    let snap: [number, Uint8Array] | null = null
    for (let i = this.snaps.length - 1; i >= 0 && !snap; i--) if (this.snaps[i][0] <= from) snap = this.snaps[i]
    if (!snap) return null
    const start = snap[0] - this.origin
    const end = to - this.origin + 1
    return {
      from: snap[0],
      to,
      state: snap[1].slice(),
      inputs: this.inputs.slice(start * 2, end * 2),
      hashes: this.hashes.slice(start, end),
    }
  }

  export(): RecordingData {
    return {
      origin: this.origin,
      inputs: this.inputs.slice(0, this.length * 2),
      hashes: this.hashes.slice(0, this.length),
      snaps: this.snaps.map(([frame, state]) => [frame, state.slice()]),
    }
  }

  import(data: RecordingData, upTo: number): void {
    const length = Math.max(0, Math.min(data.hashes.length, data.inputs.length >> 1, upTo - data.origin + 1, this.maxFrames))
    this.clear()
    if (length === 0) return
    this.origin = data.origin
    this.length = length
    this.inputs = data.inputs.slice(0, length * 2)
    this.hashes = data.hashes.slice(0, length)
    this.snaps = data.snaps.filter(([frame]) => frame >= data.origin && frame < data.origin + length).map(([frame, state]) => [frame, state.slice()])
  }

  clear(): void {
    this.restart(0)
  }

  private restart(frame: number): void {
    this.origin = frame
    this.length = 0
    this.snaps = []
    this.wasLive = false
  }

  private grow(): void {
    const frames = Math.min(this.maxFrames, Math.max(INITIAL_FRAMES, this.hashes.length * 2))
    const inputs = new Uint16Array(frames * 2)
    const hashes = new Uint32Array(frames)
    inputs.set(this.inputs.subarray(0, this.length * 2))
    hashes.set(this.hashes.subarray(0, this.length))
    this.inputs = inputs
    this.hashes = hashes
  }
}
