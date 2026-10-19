import { AudioRing } from './ringBuffer'
import { AUDIO_PROCESSOR, Ctl } from './shared'

export type AudioProcessorOptions = { ring: SharedArrayBuffer; control: SharedArrayBuffer }

declare class AudioWorkletProcessor {
  constructor(options?: AudioWorkletNodeOptions)
}

declare function registerProcessor(
  name: string,
  processor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void

class RingProcessor extends AudioWorkletProcessor {
  private readonly ring: AudioRing
  private readonly readIndex: Int32Array
  private readonly control: Int32Array

  constructor(options: AudioWorkletNodeOptions) {
    super(options)
    const { ring, control } = options.processorOptions as AudioProcessorOptions
    this.ring = new AudioRing(ring)
    this.readIndex = this.ring.readIndexView()
    this.control = new Int32Array(control)
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const [left, right] = outputs[0]
    if (this.ring.read([left, right]) < left.length && Atomics.load(this.control, Ctl.Running) === 1) {
      Atomics.add(this.control, Ctl.Underruns, 1)
    }
    Atomics.notify(this.readIndex, 0)
    return true
  }
}

registerProcessor(AUDIO_PROCESSOR, RingProcessor)
