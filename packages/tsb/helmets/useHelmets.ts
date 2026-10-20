import { useEffect, useState } from 'react'
import { rosterOf, tsbRom, type RomImage } from '../game/roms'
import type { HelmetReply, HelmetRequest } from './helmet.worker'
import { helmetStore, type HelmetSet } from './helmetStore'

export type Helmet = { right: string; left: string }
export type Helmets = ReadonlyMap<number, Helmet>

const NONE: Helmets = new Map()

function extract(rom: RomImage): Promise<HelmetSet> {
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
    const { logos, ...art } = tsbRom(rom.rom.sha1).helmets
    const teams = rosterOf(rom).map((team) => ({ id: team.id, logo: logos[team.abbr] ?? 'mirror' }))
    const request: HelmetRequest = { rom: rom.bytes, teams, art }
    worker.postMessage(request)
  })
}

export function useHelmets(rom: RomImage | null): Helmets {
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
      const map = new Map<number, Helmet>()
      const url = (blob: Blob) => {
        const made = URL.createObjectURL(blob)
        urls.push(made)
        return made
      }
      for (const [id, { right, left }] of Object.entries(set)) map.set(Number(id), { right: url(right), left: url(left) })
      setHelmets(map)
    }
    helmetStore
      .load(rom.rom.sha1)
      .then(async (cached) => {
        if (cached) return show(cached)
        const fresh = await extract(rom)
        await helmetStore.save(rom.rom.sha1, fresh)
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
