import createCore from '../emu/core/tb_core.mjs'
import wasmUrl from '../emu/core/tb_core.wasm?url'
import type { CoreModule } from '../emu/core/types'

export type { CoreModule }

export async function bootCore(): Promise<CoreModule> {
  const core = await createCore({ locateFile: () => wasmUrl })
  core._tb_init()
  return core
}
