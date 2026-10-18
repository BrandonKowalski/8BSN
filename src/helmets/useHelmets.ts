import { useEffect, useState } from 'react'
import { parseRoster } from '../game/roster'
import { TARGET_ROM_SHA1 } from '../rom/validateRom'
import type { HelmetReply, HelmetRequest } from './helmet.worker'
import { helmetStore, type HelmetSet } from './helmetStore'

export type Helmets = ReadonlyMap<number, string>

const NONE: Helmets = new Map()

function extract(rom: Uint8Array): Promise<HelmetSet> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./helmet.worker.ts', import.meta.url), { type: 'module' })
    const done = () => worker.terminate()
    worker.addEventListener('message', (event: MessageEvent<HelmetReply>) => {
      done()
      if (event.data.ok) resolve(Object.fromEntries(event.data.helmets))
      else reject(new Error(event.data.message))
    })
    worker.addEventListener('error', (event) => {
      done()
      reject(new Error(event.message || 'The helmet worker failed'))
    })
    const request: HelmetRequest = { rom, teamIds: parseRoster(rom).map((team) => team.id) }
    worker.postMessage(request)
  })
}

export function useHelmets(rom: Uint8Array | null): Helmets {
  const [helmets, setHelmets] = useState<Helmets>(NONE)

  useEffect(() => {
    if (!rom) {
      setHelmets(NONE)
      return
    }
    let cancelled = false
    const urls: string[] = []
    const show = (set: HelmetSet) => {
      if (cancelled) return
      const map = new Map<number, string>()
      for (const [id, blob] of Object.entries(set)) {
        const url = URL.createObjectURL(blob)
        urls.push(url)
        map.set(Number(id), url)
      }
      setHelmets(map)
    }
    helmetStore
      .load(TARGET_ROM_SHA1)
      .then(async (cached) => {
        if (cached) return show(cached)
        const fresh = await extract(rom)
        await helmetStore.save(TARGET_ROM_SHA1, fresh)
        show(fresh)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [rom])

  return helmets
}
