const HEADER_BYTES = 8
const WRITE = 0
const READ = 1

export class AudioRing {
  private readonly header: Int32Array
  private readonly data: Float32Array
  private readonly capacity: number
  private readonly span: number

  constructor(sab: SharedArrayBuffer) {
    this.header = new Int32Array(sab, 0, 2)
    this.data = new Float32Array(sab, HEADER_BYTES, (sab.byteLength - HEADER_BYTES) / 4)
    this.capacity = this.data.length / 2
    this.span = this.capacity * 2
  }

  static bytes(capacityFrames: number): number {
    return HEADER_BYTES + capacityFrames * 2 * 4
  }

  readIndexView(): Int32Array {
    return new Int32Array(this.header.buffer, READ * 4, 1)
  }

  available(): number {
    const w = Atomics.load(this.header, WRITE)
    const r = Atomics.load(this.header, READ)
    return (w - r + this.span) % this.span
  }

  free(): number {
    return this.capacity - this.available()
  }

  clear(): void {
    Atomics.store(this.header, READ, Atomics.load(this.header, WRITE))
  }

  write(samples: Float32Array): number {
    const w = Atomics.load(this.header, WRITE)
    const r = Atomics.load(this.header, READ)
    const free = this.capacity - ((w - r + this.span) % this.span)
    const frames = Math.min(free, samples.length >> 1)
    for (let i = 0; i < frames; i++) {
      const slot = ((w + i) % this.capacity) * 2
      this.data[slot] = samples[i * 2]
      this.data[slot + 1] = samples[i * 2 + 1]
    }
    Atomics.store(this.header, WRITE, (w + frames) % this.span)
    return frames
  }

  read(out: [Float32Array, Float32Array]): number {
    const w = Atomics.load(this.header, WRITE)
    const r = Atomics.load(this.header, READ)
    const available = (w - r + this.span) % this.span
    const want = out[0].length
    const frames = Math.min(available, want)
    for (let i = 0; i < frames; i++) {
      const slot = ((r + i) % this.capacity) * 2
      out[0][i] = this.data[slot]
      out[1][i] = this.data[slot + 1]
    }
    for (let i = frames; i < want; i++) {
      out[0][i] = 0
      out[1][i] = 0
    }
    Atomics.store(this.header, READ, (r + frames) % this.span)
    return frames
  }
}
