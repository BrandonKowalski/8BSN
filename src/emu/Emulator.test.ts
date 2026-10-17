import { describe, expect, it } from 'vitest'
import { Emulator } from './Emulator'

describe('Emulator.resumeAudio', () => {
  it('calls resume on every call so a later gesture can succeed after a never-settling first call', async () => {
    let state = 'suspended'
    let calls = 0
    const audio = {
      get state() {
        return state
      },
      resume: () => {
        calls += 1
        if (calls === 1) return new Promise<void>(() => undefined)
        state = 'running'
        return Promise.resolve()
      },
    }
    const emu = Object.create(Emulator.prototype) as Emulator
    Object.assign(emu, { audio })
    void emu.resumeAudio()
    expect(await emu.resumeAudio()).toBe(true)
    expect(calls).toBe(2)
  })
})
