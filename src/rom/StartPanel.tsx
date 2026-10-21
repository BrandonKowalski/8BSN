import { useCallback, useEffect, useRef, useState } from 'react'
import { PACKAGES, romsOf, type LoadedRom } from '../packages/registry'
import type { BroadcastPackage } from '../sdk/types'
import { romStore } from './romStore'
import { validateRom } from './validateRom'

export type LaunchMode = 'play' | 'tailgate'

type Props = { running: boolean; onLaunch: (rom: LoadedRom, mode: LaunchMode) => void; onResume: () => void; packages?: readonly BroadcastPackage[] }
type Last = { rom?: string; mode?: LaunchMode }

const LAST_KEY = '8bsn.start'
const NOT_NES = "That doesn't look like an NES ROM."
const NOT_SUPPORTED = "That file isn't a supported ROM."
const OTHER = 'other'
const NOT_REMEMBERED = "This browser won't remember the ROM, so you'll pick it again next time."
const STORED_NOTE = 'ROMs are stored locally in this browser and never leave your device.'

const titleOf = (name: string) => name.replace(/\.nes$/i, '')

function readLast(): Last {
  try {
    return (JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as Last) ?? {}
  } catch {
    return {}
  }
}

function writeLast(last: Last) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(last))
  } catch {
    return
  }
}

export default function StartPanel({ running, onLaunch, onResume, packages = PACKAGES }: Props) {
  const known = romsOf(packages)
  const last = useRef<Last>(readLast())
  const [selected, setSelected] = useState(() => last.current.rom ?? known[0]?.rom.sha1 ?? '')
  const [stored, setStored] = useState<Map<string, LoadedRom> | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const root = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const target = known.find((e) => e.rom.sha1 === selected)?.rom ?? null
  const loaded = stored?.get(selected) ?? null
  const choices = [
    ...known.map(({ rom }) => ({ value: rom.sha1, label: rom.title })),
    ...[...(stored?.values() ?? [])].filter(({ rom }) => rom.unverified).map(({ rom }) => ({ value: rom.sha1, label: `${rom.title} (UNVERIFIED)` })),
    ...(packages.some((pkg) => pkg.scan) ? [{ value: OTHER, label: 'OTHER ROM...' }] : []),
  ]

  const refresh = useCallback(async () => {
    const found = new Map<string, LoadedRom>()
    for (const { bytes, title } of await romStore.loadAll()) {
      const result = await validateRom(bytes, packages, title ?? undefined)
      if (result.ok) found.set(result.rom.sha1, { bytes, rom: result.rom, pkg: result.pkg })
    }
    const fallback = romsOf(packages)[0]?.rom.sha1 ?? OTHER
    setSelected((current) => (current === OTHER || found.has(current) || romsOf(packages).some(({ rom }) => rom.sha1 === current) ? current : fallback))
    setStored(found)
  }, [packages])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const focusedOnce = useRef(false)
  useEffect(() => {
    if (!stored || focusedOnce.current) return
    focusedOnce.current = true
    const node = root.current
    const want = running ? 'resume' : last.current.rom === selected ? last.current.mode : null
    const preferred = want ? node?.querySelector<HTMLElement>(`[data-choice="${want}"]`) : null
    ;(preferred ?? node?.querySelector<HTMLElement>('[data-nav]'))?.focus()
  }, [stored, running, selected])

  const pickGame = (sha1: string) => {
    setMessage(null)
    setSelected(sha1)
  }

  const step = (by: number) => {
    const at = choices.findIndex((choice) => choice.value === selected)
    const next = choices[Math.min(choices.length - 1, Math.max(0, at + by))]
    if (next) pickGame(next.value)
  }

  const launch = (mode: LaunchMode) => {
    if (!loaded) return
    last.current = { rom: loaded.rom.sha1, mode }
    writeLast(last.current)
    onLaunch(loaded, mode)
  }

  const choose = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = ''
    if (!file || (!target && selected !== OTHER)) return
    const data = new Uint8Array(await file.arrayBuffer())
    const title = titleOf(file.name)
    const result = await validateRom(data, packages, title)
    if (!result.ok) {
      if (result.reason === 'not-nes') setMessage(NOT_NES)
      else if (target) setMessage(`That file isn't ${target.title}.`)
      else setMessage(result.detail ? `That file isn't a compatible ROM: ${result.detail}.` : NOT_SUPPORTED)
      return
    }
    if (target && result.rom.sha1 !== target.sha1) {
      setMessage(`That file is ${result.rom.title}, not ${target.title}.`)
      return
    }
    const { sha1 } = result.rom
    const saved = await (result.rom.unverified ? romStore.save(data, sha1, title) : romStore.save(data, sha1))
    setMessage(saved ? null : NOT_REMEMBERED)
    setStored((current) => new Map(current ?? []).set(sha1, { bytes: data, rom: result.rom, pkg: result.pkg }))
    setSelected(sha1)
  }

  return (
    <div className="start-panel" ref={root}>
      {running && (
        <button type="button" data-nav data-choice="resume" className="start-primary" onClick={onResume}>
          RESUME
        </button>
      )}
      <label className="start-game">
        <select
          data-nav
          aria-label="GAME"
          value={selected}
          onChange={(event) => pickGame(event.target.value)}
          onKeyDown={(event) => {
            if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return
            event.preventDefault()
            event.stopPropagation()
            step(event.code === 'ArrowRight' ? 1 : -1)
          }}
        >
          {choices.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <input ref={inputRef} type="file" accept=".nes" aria-label="ROM file" hidden onChange={(event) => void choose(event.target.files?.[0])} />
      {stored && loaded && (
        <div className="start-actions">
          <button type="button" data-nav data-choice="play" className={running ? 'start-secondary' : 'start-primary'} onClick={() => launch('play')}>
            PLAY
          </button>
          {loaded.pkg.tailgate && (
            <button type="button" data-nav data-choice="tailgate" className="start-secondary" onClick={() => launch('tailgate')}>
              {loaded.pkg.tailgate.label}
            </button>
          )}
        </div>
      )}
      {stored && !loaded && (
        <button type="button" data-nav className="start-primary" onClick={() => inputRef.current?.click()}>
          UPLOAD ROM
        </button>
      )}
      {message && (
        <p className="start-message" role="alert">
          {message}
        </p>
      )}
      {stored && !loaded && <p className="info-note">{STORED_NOTE}</p>}
    </div>
  )
}
