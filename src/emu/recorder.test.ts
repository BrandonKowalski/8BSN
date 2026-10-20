import { describe, expect, it } from 'vitest'
import { TSB2026_MAP } from '../game/maps/tsb2026'
import { isLive } from '../game/decode'
import { KEYFRAME_FRAMES, ramHash, Recorder } from './recorder'
import { RAM_BYTES } from './snapshot'

const ramFor = (frame: number) => {
  const ram = new Uint8Array(RAM_BYTES)
  ram[0] = frame & 0xff
  ram[1] = frame >> 8
  return ram
}

const stateFor = (frame: number) => new Uint8Array([frame & 0xff, 0xab, frame >> 8])

function feed(recorder: Recorder, from: number, to: number, liveFrom = 40, liveTo = 70) {
  for (let frame = from; frame <= to; frame++) {
    recorder.frame(frame, frame & 0xff, (frame * 3) & 0xff, ramFor(frame), frame >= liveFrom && frame <= liveTo, () => stateFor(frame))
  }
}

describe('Recorder', () => {
  it('null anchor keyframes every KEYFRAME_FRAMES frames', () => {
    const recorder = new Recorder()
    for (let frame = 0; frame < 1300; frame++) {
      recorder.frame(frame, 0, 0, ramFor(frame), null, () => stateFor(frame))
    }
    expect(KEYFRAME_FRAMES).toBe(600)
    expect(recorder.export().snaps.map(([frame]) => frame)).toEqual([0, 600, 1200])
  })

  it('a clip starts at the snap state and carries every input and hash through the end', () => {
    const recorder = new Recorder()
    feed(recorder, 1, 100)
    const clip = recorder.clip(45, 80)
    expect(clip).not.toBeNull()
    expect(clip?.from).toBe(40)
    expect(clip?.to).toBe(80)
    expect(clip?.inputs.length).toBe(82)
    expect(clip?.hashes.length).toBe(41)
    expect(clip?.state).toEqual(stateFor(40))
    expect(Array.from(clip?.inputs.subarray(0, 4) ?? [])).toEqual([40, 120, 41, 123])
    expect(clip?.hashes[0]).toBe(ramHash(ramFor(40)))
    expect(clip?.hashes[40]).toBe(ramHash(ramFor(80)))
  })

  it('a clip that reaches past what was recorded is null', () => {
    const recorder = new Recorder()
    feed(recorder, 1, 100)
    expect(recorder.clip(45, 101)).toBeNull()
    expect(recorder.clip(30, 50)).toBeNull()
  })

  it('importing a recording truncates it at the loaded frame and keeps earlier clips exact', () => {
    const recorder = new Recorder()
    feed(recorder, 1, 100)
    const before = recorder.clip(45, 58)
    const data = recorder.export()
    const loaded = new Recorder()
    loaded.import(data, 60)
    expect(loaded.clip(45, 58)).toEqual(before)
    expect(loaded.clip(45, 80)).toBeNull()
    feed(loaded, 61, 79)
    expect(loaded.clip(45, 80)).toBeNull()
    feed(loaded, 80, 80)
    expect(loaded.clip(45, 80)).toEqual(recorder.clip(45, 80))
  })

  it('clear drops every clip', () => {
    const recorder = new Recorder()
    feed(recorder, 1, 100)
    recorder.clear()
    expect(recorder.clip(45, 80)).toBeNull()
  })

  it('stops recording once full and keeps what it has', () => {
    const recorder = new Recorder(80)
    feed(recorder, 1, 100)
    expect(recorder.clip(45, 80)).not.toBeNull()
    expect(recorder.clip(45, 81)).toBeNull()
  })

  it('a gap in frame numbers starts a new recording', () => {
    const recorder = new Recorder()
    feed(recorder, 1, 50)
    feed(recorder, 60, 100, 65, 70)
    expect(recorder.clip(45, 48)).toBeNull()
    expect(recorder.clip(66, 90)?.from).toBe(65)
  })

  it('a clip leaves the recording intact when its buffers are taken', () => {
    const recorder = new Recorder()
    feed(recorder, 1, 100)
    const clip = recorder.clip(45, 80)
    clip?.state.fill(0)
    clip?.inputs.fill(0)
    expect(recorder.clip(45, 80)?.state).toEqual(stateFor(40))
  })
})

describe('ramHash', () => {
  it('is 32-bit FNV-1a over the RAM', () => {
    expect(ramHash(new Uint8Array(0))).toBe(0x811c9dc5)
    expect(ramHash(new TextEncoder().encode('a'))).toBe(0xe40c292c)
    expect(ramHash(ramFor(1))).not.toBe(ramHash(ramFor(2)))
  })
})

describe('isLive', () => {
  it('is true in game after the snap until the play is over', () => {
    const ram = new Uint8Array(RAM_BYTES)
    ram[TSB2026_MAP.gameStatus.offset] = TSB2026_MAP.inGameValues[0]
    ram[TSB2026_MAP.playStatus.offset] = TSB2026_MAP.bits.snapped
    expect(isLive(ram, TSB2026_MAP)).toBe(true)
    ram[TSB2026_MAP.playStatus.offset] |= TSB2026_MAP.bits.over
    expect(isLive(ram, TSB2026_MAP)).toBe(false)
    ram[TSB2026_MAP.playStatus.offset] = TSB2026_MAP.bits.snapped
    ram[TSB2026_MAP.gameStatus.offset] = TSB2026_MAP.breakValue
    expect(isLive(ram, TSB2026_MAP)).toBe(false)
  })
})
