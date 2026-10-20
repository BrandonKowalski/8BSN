import { useCallback, useEffect, useRef, useState } from 'react'
import { ROM_PROFILES, type LoadedRom, type RomProfile } from './profiles'
import { romStore } from './romStore'
import { validateRom } from './validateRom'

const NOT_NES = "That doesn't look like an NES ROM."
const NOT_REMEMBERED = "This browser won't remember the ROM, so you'll pick it again next time."
const STORED_NOTE = 'ROMs are stored locally in this browser and never leave your device.'

const wrongGame = (picked: RomProfile | null, wanted: RomProfile) =>
  picked ? `That file is ${picked.title}, not ${wanted.title}.` : `That file isn't ${wanted.title}.`

type Props = { active: string | null; onReady: (rom: LoadedRom) => void; onCleared: () => void; onClose: () => void }

export default function RomManager({ active, onReady, onCleared, onClose }: Props) {
  const [stored, setStored] = useState<Map<string, Uint8Array>>(new Map())
  const [message, setMessage] = useState<{ sha1: string; text: string } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const targetRef = useRef<RomProfile | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  const refresh = useCallback(async () => {
    const found = new Map<string, Uint8Array>()
    for (const bytes of await romStore.loadAll()) {
      const result = await validateRom(bytes)
      if (result.ok) found.set(result.profile.sha1, bytes)
    }
    setStored(found)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const upload = (profile: RomProfile) => {
    targetRef.current = profile
    inputRef.current?.click()
  }

  const choose = async (file: File | undefined) => {
    const wanted = targetRef.current
    if (inputRef.current) inputRef.current.value = ''
    if (!file || !wanted) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await validateRom(bytes)
    if (!result.ok || result.profile.sha1 !== wanted.sha1) {
      setMessage({ sha1: wanted.sha1, text: result.ok ? wrongGame(result.profile, wanted) : result.reason === 'not-nes' ? NOT_NES : wrongGame(null, wanted) })
      return
    }
    const saved = await romStore.save(bytes, wanted.sha1)
    setMessage(saved ? null : { sha1: wanted.sha1, text: NOT_REMEMBERED })
    onReady({ bytes, profile: wanted })
    await refresh()
  }

  const use = async (profile: RomProfile, from = stored) => {
    const bytes = from.get(profile.sha1)
    if (!bytes) return
    await romStore.select(profile.sha1)
    setMessage(null)
    onReady({ bytes, profile })
  }

  const clear = async (profile: RomProfile) => {
    await romStore.remove(profile.sha1)
    setMessage(null)
    const left = new Map(stored)
    left.delete(profile.sha1)
    setStored(left)
    if (active !== profile.sha1) return
    const [next] = ROM_PROFILES.filter((other) => left.has(other.sha1))
    if (next) await use(next, left)
    else onCleared()
  }

  return (
    <div className="info-backdrop" onClick={onClose}>
      <div className="info-modal rom-manager" role="dialog" aria-modal="true" aria-labelledby="rom-manager-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="rom-manager-title">GAME SELECTOR</h2>
        <input ref={inputRef} type="file" accept=".nes" aria-label="ROM file" hidden onChange={(event) => choose(event.target.files?.[0])} />
        <ul className="rom-list">
          {ROM_PROFILES.map((profile) => {
            const present = stored.has(profile.sha1) || active === profile.sha1
            const inUse = active === profile.sha1
            return (
              <li key={profile.sha1} className="rom-row" data-testid="rom-row">
                <div className="rom-row-text">
                  <span className="info-rom-title">{profile.title}</span>
                  <span className="info-rom-about">{profile.about}</span>
                  <span className={present ? 'rom-status rom-status-present' : 'rom-status'} data-testid="rom-status">
                    {inUse ? 'ACTIVE' : present ? 'STORED' : 'NOT LOADED'}
                  </span>
                  {message?.sha1 === profile.sha1 && <span className="rom-message" role="alert">{message.text}</span>}
                </div>
                <div className="rom-row-actions">
                  {present && !inUse && (
                    <button type="button" data-nav onClick={() => use(profile)}>
                      USE
                    </button>
                  )}
                  {present ? (
                    <button type="button" data-nav aria-label={`Clear ${profile.title}`} onClick={() => clear(profile)}>
                      CLEAR
                    </button>
                  ) : (
                    <button type="button" data-nav aria-label={`Upload ${profile.title}`} onClick={() => upload(profile)}>
                      UPLOAD
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        <p className="info-note">{STORED_NOTE}</p>
        <button type="button" data-nav ref={closeRef} onClick={onClose}>
          CLOSE
        </button>
      </div>
    </div>
  )
}
