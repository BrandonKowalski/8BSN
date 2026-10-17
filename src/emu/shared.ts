import { AudioRing } from './ringBuffer'
import { SNAPSHOT_BYTES } from './snapshot'

export const Ctl = { Running: 0, FrameSeq: 1, VideoIndex: 2, Underruns: 3, FrameCount: 4 } as const

export const VIDEO_WIDTH = 256
export const VIDEO_HEIGHT = 240
export const VIDEO_FRAME_BYTES = VIDEO_WIDTH * VIDEO_HEIGHT * 4
export const VIDEO_FRAME_COUNT = 3
export const RING_CAPACITY_FRAMES = 8192

export type SharedBlocks = {
  control: Int32Array
  input: Int32Array
  video: SharedArrayBuffer
  snapshot: SharedArrayBuffer
  ring: SharedArrayBuffer
}

export function createShared(): SharedBlocks {
  return {
    control: new Int32Array(new SharedArrayBuffer(Object.keys(Ctl).length * 4)),
    input: new Int32Array(new SharedArrayBuffer(2 * 4)),
    video: new SharedArrayBuffer(VIDEO_FRAME_BYTES * VIDEO_FRAME_COUNT),
    snapshot: new SharedArrayBuffer(SNAPSHOT_BYTES),
    ring: new SharedArrayBuffer(AudioRing.bytes(RING_CAPACITY_FRAMES)),
  }
}
