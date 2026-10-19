import { beforeAll, expect, test } from 'vitest'
import { createShared, Ctl, type SharedBlocks } from './shared'

type Processor = { process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean }
type ProcessorClass = new (options: AudioWorkletNodeOptions) => Processor

let Registered: ProcessorClass | null = null

beforeAll(async () => {
  Object.assign(globalThis, {
    AudioWorkletProcessor: class {},
    registerProcessor: (_name: string, processor: ProcessorClass) => {
      Registered = processor
    },
  })
  await import('./audio.worklet')
})

function processor(shared: SharedBlocks): Processor {
  if (!Registered) throw new Error('not registered')
  return new Registered({ processorOptions: { ring: shared.ring, control: shared.control.buffer } })
}

function quantum(): Float32Array[][] {
  return [[new Float32Array(128), new Float32Array(128)]]
}

test('an empty ring counts an underrun while the core runs', () => {
  const shared = createShared()
  Atomics.store(shared.control, Ctl.Running, 1)
  processor(shared).process([], quantum())
  expect(Atomics.load(shared.control, Ctl.Underruns)).toBe(1)
})

test('a paused core counts no underruns', () => {
  const shared = createShared()
  const node = processor(shared)
  for (let i = 0; i < 10; i++) node.process([], quantum())
  expect(Atomics.load(shared.control, Ctl.Underruns)).toBe(0)
})
