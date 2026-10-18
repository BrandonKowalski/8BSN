import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import createCore from '../src/emu/core/tb_core.mjs'
import type { CoreModule } from '../src/emu/core/types'

export type Step =
  | { frames: number; p1?: string[]; p2?: string[] }
  | { dump: string }
  | { trace: string; frames: number; ram: number[]; sram?: number[]; p1?: string[]; p2?: string[] }
  | { include: string }
  | { state: string }

const BUTTON_BITS: Record<string, number> = {
  B: 1 << 0,
  SELECT: 1 << 2,
  START: 1 << 3,
  UP: 1 << 4,
  DOWN: 1 << 5,
  LEFT: 1 << 6,
  RIGHT: 1 << 7,
  A: 1 << 8,
}

const WIDTH = 256
const HEIGHT = 240

export function mask(buttons: string[] = []): number {
  let result = 0
  for (const name of buttons) {
    const bit = BUTTON_BITS[name.toUpperCase()]
    if (bit === undefined) throw new Error(`Unknown button ${name}`)
    result |= bit
  }
  return result
}

function hex(address: number): string {
  return address.toString(16).toUpperCase().padStart(4, '0')
}

export function loadScript(path: string): Step[] {
  const steps = JSON.parse(readFileSync(path, 'utf8')) as Step[]
  return steps.flatMap((step) => ('include' in step ? loadScript(resolve(dirname(path), step.include)) : [step]))
}

export function runScript(core: CoreModule, rom: Uint8Array, script: Step[], outDir: string): void {
  mkdirSync(outDir, { recursive: true })
  core._tb_init()
  const ptr = core._malloc(rom.length)
  core.HEAPU8.set(rom, ptr)
  if (core._tb_load_rom(ptr, rom.length) !== 1) throw new Error('ROM rejected by core')

  const ram = () => core.HEAPU8.subarray(core._tb_ram_ptr(), core._tb_ram_ptr() + core._tb_ram_size())
  const sram = () => core.HEAPU8.subarray(core._tb_sram_ptr(), core._tb_sram_ptr() + core._tb_sram_size())

  const run = (frames: number, p1: number, p2: number, onFrame?: () => void) => {
    core._tb_set_input(0, p1)
    core._tb_set_input(1, p2)
    for (let i = 0; i < frames; i++) {
      core._tb_run_frame()
      onFrame?.()
    }
  }

  for (const step of script) {
    if ('include' in step) throw new Error('include steps must be expanded with loadScript')
    if ('state' in step) {
      const data = readFileSync(step.state)
      const at = core._malloc(data.length)
      core.HEAPU8.set(data, at)
      const ok = core._tb_load_state(at, data.length)
      core._free(at)
      if (ok !== 1) throw new Error(`State ${step.state} rejected by core`)
      continue
    }
    if ('dump' in step) {
      const png = new PNG({ width: WIDTH, height: HEIGHT })
      const start = core._tb_video_ptr()
      png.data = Buffer.from(core.HEAPU8.subarray(start, start + WIDTH * HEIGHT * 4))
      writeFileSync(join(outDir, `${step.dump}.png`), PNG.sync.write(png))
      writeFileSync(join(outDir, `${step.dump}.ram`), ram())
      writeFileSync(join(outDir, `${step.dump}.sram`), sram())
    } else if ('trace' in step) {
      const sramAddresses = step.sram ?? []
      const rows = [['frame', ...step.ram.map((a) => `ram_${hex(a)}`), ...sramAddresses.map((a) => `sram_${hex(a)}`)].join(',')]
      let frame = 0
      run(step.frames, mask(step.p1), mask(step.p2), () => {
        const r = ram()
        const s = sram()
        rows.push([frame++, ...step.ram.map((a) => r[a]), ...sramAddresses.map((a) => s[a])].join(','))
      })
      writeFileSync(join(outDir, `${step.trace}.csv`), `${rows.join('\n')}\n`)
    } else {
      run(step.frames, mask(step.p1), mask(step.p2))
    }
  }
}

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index === -1 ? undefined : process.argv[index + 1]
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const core = await createCore()
  runScript(core, readFileSync(arg('rom')), loadScript(arg('script')), arg('out'))
}
