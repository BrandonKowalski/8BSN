import { useCallback, useEffect, useRef, useState } from 'react'
import LeaveTailgate from './tailgate/LeaveTailgate'
import type { TailgateInput } from './tailgate/useTailgate'
import { Emulator } from './emu/Emulator'
import { TSB_ANCHOR } from './game/maps/tsb2026'
import { useGame } from './game/useGame'
import { TSB_LEAGUE } from './game/league'
import { tsbTailgate } from './game/tailgate'
import { leagueData } from './league/leagueData'
import { useLeague } from './league/useLeague'
import { useStandings } from './league/useStandings'
import ChantIntro, { canPlayIntro } from './brand/ChantIntro'
import Wordmark from './brand/Wordmark'
import { BUILD_HASH, commitUrl, REPO_URL } from './build'
import InfoModal from './InfoModal'
import type { LoadedRom } from './rom/profiles'
import RomGate from './rom/RomGate'
import { useHelmets } from './helmets/useHelmets'
import { useSaveStates } from './saves/useSaveStates'
import BroadcastView from './views/broadcast/BroadcastView'
import { useForceWindow, useHotkeys } from './views/useHotkeys'
import { setTeamEra } from './views/broadcast/teamColors'

const SOUND_COPY = 'CLICK OR PRESS A KEY TO TURN ON SOUND'

function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

const PAD_A = 0
const PAD_START = 9
const PAD_UP = 12
const PAD_DOWN = 13
const PAD_LEFT = 14
const PAD_RIGHT = 15
const PAD_WATCHED = [PAD_A, PAD_START, PAD_UP, PAD_DOWN, PAD_LEFT, PAD_RIGHT]

function padHeld() {
  const held = new Set<number>()
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (!pad) continue
    for (const index of PAD_WATCHED) if (pad.buttons[index]?.pressed) held.add(index)
  }
  return held
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  if (!canvasRef.current) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 224
    canvas.className = 'emu-canvas'
    canvasRef.current = canvas
  }
  const [rom, setRom] = useState<LoadedRom | null>(null)
  const [emulator, setEmulator] = useState<Emulator | null>(null)
  const [audioOn, setAudioOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [romOpen, setRomOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [tailgate, setTailgate] = useState(false)
  const [asking, setAsking] = useState(false)
  const leaveInputRef = useRef<((input: TailgateInput) => void) | null>(null)
  const [intro, setIntro] = useState(canPlayIntro)
  const endIntro = useCallback(() => setIntro(false), [])
  const closeInfo = useCallback(() => setInfoOpen(false), [])
  const chromeRef = useRef<HTMLDivElement | null>(null)
  const emulatorRef = useRef<Emulator | null>(null)
  const startingRef = useRef(false)
  const generationRef = useRef(0)
  const [forcePackage, toggleForce] = useForceWindow()
  useHotkeys()
  const game = useGame(emulator, rom)
  const { state, tracker, player } = game
  const games = useLeague(TSB_LEAGUE.path)
  const records = useStandings(TSB_LEAGUE.path)
  const helmets = useHelmets(rom)

  const stopEmulator = useCallback(() => {
    generationRef.current += 1
    emulatorRef.current?.stop()
    emulatorRef.current = null
    setEmulator(null)
    setAudioOn(false)
    setError(null)
  }, [])

  const launch = useCallback(() => {
    const canvas = canvasRef.current
    if (!rom || !canvas || startingRef.current) return
    startingRef.current = true
    const generation = generationRef.current
    setError(null)
    Emulator.start(rom.bytes, canvas, { anchor: TSB_ANCHOR }).then(
      (started) => {
        startingRef.current = false
        if (generationRef.current !== generation) {
          started.stop()
          return
        }
        emulatorRef.current = started
        setEmulator(started)
        void started.resumeAudio()
      },
      (reason: unknown) => {
        startingRef.current = false
        if (generationRef.current !== generation) return
        setError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }, [rom])

  const gesture = useCallback(() => {
    const running = emulatorRef.current
    if (running) void running.resumeAudio()
    else launch()
  }, [launch])

  const startTailgate = useCallback(() => {
    stopEmulator()
    setTailgate(true)
    launch()
  }, [stopEmulator, launch])

  const nextTailgate = useCallback(() => {
    stopEmulator()
    launch()
  }, [stopEmulator, launch])

  const endTailgate = useCallback(() => {
    setAsking(false)
    setTailgate(false)
    stopEmulator()
  }, [stopEmulator])

  const stayTailgate = useCallback(() => setAsking(false), [])

  const tailgateInput = useCallback(
    (input: TailgateInput) => {
      if (!asking) setAsking(true)
      else leaveInputRef.current?.(input)
    },
    [asking],
  )

  const tailgateSpec = rom ? tsbTailgate : undefined
  const pick = rom ? { games, toRom: leagueData(TSB_LEAGUE, games, records).toRom, sha1: rom.profile.sha1, random: Math.random } : null

  useEffect(() => {
    if (error) setTailgate(false)
  }, [error])

  const gateUp = rom !== null && emulator !== null && !audioOn
  const chromeUp = (emulator === null && !tailgate) || romOpen
  const onStartClick = () => {
    if (gateUp && !chromeUp) gesture()
  }
  const toast = useSaveStates(emulator, game, !chromeUp && !tailgate, rom?.profile.sha1 ?? null)

  const moveFocus = useCallback((step: number) => {
    const root = chromeRef.current?.querySelector('.info-modal') ?? chromeRef.current
    const buttons = Array.from(root?.querySelectorAll<HTMLButtonElement>('button[data-nav]') ?? [])
    if (buttons.length === 0) return
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = at < 0 ? 0 : Math.min(buttons.length - 1, Math.max(0, at + step))
    buttons[next].focus()
  }, [])

  useEffect(() => {
    if (!chromeUp || intro) return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target instanceof HTMLInputElement) return
      const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.code]
      if (step === undefined) return
      event.preventDefault()
      moveFocus(step)
    }
    window.addEventListener('keydown', onKey)
    let raf = 0
    let was = padHeld()
    const poll = () => {
      const now = padHeld()
      const rose = (index: number) => now.has(index) && !was.has(index)
      if (rose(PAD_UP) || rose(PAD_LEFT)) moveFocus(-1)
      else if (rose(PAD_DOWN) || rose(PAD_RIGHT)) moveFocus(1)
      else if (rose(PAD_A) || rose(PAD_START)) {
        const focused = document.activeElement
        if (focused instanceof HTMLButtonElement && chromeRef.current?.contains(focused)) focused.click()
      }
      was = now
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(raf)
    }
  }, [chromeUp, intro, moveFocus])

  useEffect(() => {
    if (!gateUp) return
    const onKey = () => gesture()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gateUp, gesture])

  useEffect(() => {
    if (!emulator) return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      if (event.code === 'Escape') setRomOpen(false)
      else if (event.code === 'KeyR' && !typing(event.target)) setRomOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [emulator])

  useEffect(() => {
    if (!romOpen || !emulator) return
    emulator.pause()
    return () => emulator.resume()
  }, [romOpen, emulator])

  useEffect(() => {
    if (!emulator) return
    const sync = () => setAudioOn(emulator.audioRunning())
    sync()
    const off = emulator.onAudioChange(sync)
    return off
  }, [emulator])

  useEffect(
    () => () => {
      generationRef.current += 1
      emulatorRef.current?.stop()
      emulatorRef.current = null
    },
    [],
  )

  const onRomReady = useCallback(
    (loaded: LoadedRom) => {
      stopEmulator()
      setRomOpen(false)
      setTeamEra(loaded.profile.colors)
      setRom(loaded)
    },
    [stopEmulator],
  )

  const onRomClear = useCallback(() => {
    setRomOpen(false)
    setRom(null)
    stopEmulator()
  }, [stopEmulator])

  const attach = useCallback((node: HTMLDivElement | null) => {
    if (node && canvasRef.current && canvasRef.current.parentElement !== node) node.appendChild(canvasRef.current)
  }, [])

  return (
    <main className="app">
      <div className={`start${chromeUp ? ' start-full' : ''}`} hidden={!chromeUp && !gateUp} onClick={onStartClick}>
        <div className={`chrome${intro ? ' chrome-intro' : ''}`} ref={chromeRef} hidden={!chromeUp}>
          <h1 className="brand" aria-label="8-Bit Sports Network">
            <Wordmark variant="c3" />
          </h1>
          <RomGate
            onReady={onRomReady}
            onClear={onRomClear}
            primaryLabel={emulator !== null ? 'RESUME' : 'START'}
            onStart={emulator !== null ? () => setRomOpen(false) : gesture}
            secondaryLabel={emulator === null ? tailgateSpec?.label : undefined}
            onSecondary={startTailgate}
            active={chromeUp && !infoOpen}
          />
          <footer className="start-footer">
            <button type="button" data-nav onClick={() => setInfoOpen(true)}>
              INFO
            </button>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GITHUB
            </a>
            <a href={commitUrl(BUILD_HASH)} target="_blank" rel="noreferrer" title="Build commit">
              {BUILD_HASH}
            </a>
          </footer>
          {infoOpen && <InfoModal onClose={closeInfo} />}
        </div>
        {intro && chromeUp && <ChantIntro chromeRef={chromeRef} onDone={endIntro} />}
        {gateUp && (
          <div className="gate">
            <p>{SOUND_COPY}</p>
          </div>
        )}
        {error && !emulator && (
          <div className="gate">
            <p role="alert">{error}</p>
          </div>
        )}
      </div>
      {tailgate && asking && <LeaveTailgate onLeave={endTailgate} onStay={stayTailgate} inputRef={leaveInputRef} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <BroadcastView state={state} tracker={tracker} player={player} forcePackage={forcePackage} onForceWindow={toggleForce} canvasSlot={attach} games={games} helmets={helmets} emulator={emulator} rom={rom?.bytes ?? null} events={game.events} generation={game.generation} tailgate={tailgate} asking={asking} pick={pick} onTailgateFinal={nextTailgate} onTailgateInput={tailgateInput} records={records} aftershow={game.final} onAftershowDone={tailgate ? nextTailgate : undefined} />
    </main>
  )
}
