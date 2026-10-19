import { useCallback, useEffect, useRef, useState } from 'react'
import { Emulator } from './emu/Emulator'
import { useGame } from './game/useGame'
import { useLeague } from './league/useLeague'
import Wordmark from './brand/Wordmark'
import RomGate from './rom/RomGate'
import { useHelmets } from './helmets/useHelmets'
import { useSaveStates } from './saves/useSaveStates'
import BroadcastView from './views/broadcast/BroadcastView'
import { useHotkeys } from './views/useHotkeys'

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
  const [rom, setRom] = useState<Uint8Array | null>(null)
  const [emulator, setEmulator] = useState<Emulator | null>(null)
  const [audioOn, setAudioOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [romOpen, setRomOpen] = useState(false)
  const chromeRef = useRef<HTMLDivElement | null>(null)
  const emulatorRef = useRef<Emulator | null>(null)
  const startingRef = useRef(false)
  const generationRef = useRef(0)
  const { forcePackage } = useHotkeys()
  const game = useGame(emulator, rom)
  const { state, tracker, names, player } = game
  const games = useLeague()
  const helmets = useHelmets(rom)

  const stopEmulator = useCallback(() => {
    generationRef.current += 1
    emulatorRef.current?.stop()
    emulatorRef.current = null
    setEmulator(null)
    setAudioOn(false)
    setError(null)
  }, [])

  const gesture = useCallback(() => {
    const running = emulatorRef.current
    if (running) {
      void running.resumeAudio()
      return
    }
    const canvas = canvasRef.current
    if (!rom || !canvas || startingRef.current) return
    startingRef.current = true
    const generation = generationRef.current
    setError(null)
    Emulator.start(rom, canvas).then(
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

  const gateUp = rom !== null && emulator !== null && !audioOn
  const chromeUp = emulator === null || romOpen
  const onStartClick = () => {
    if (gateUp && !chromeUp) gesture()
  }
  const toast = useSaveStates(emulator, game, !chromeUp)

  const moveFocus = useCallback((step: number) => {
    const buttons = Array.from(chromeRef.current?.querySelectorAll<HTMLButtonElement>('button[data-nav]') ?? [])
    if (buttons.length === 0) return
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = at < 0 ? 0 : Math.min(buttons.length - 1, Math.max(0, at + step))
    buttons[next].focus()
  }, [])

  useEffect(() => {
    if (!chromeUp) return
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
  }, [chromeUp, moveFocus])

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
    (bytes: Uint8Array) => {
      stopEmulator()
      setRomOpen(false)
      setRom(bytes)
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
        <div className="chrome" ref={chromeRef} hidden={!chromeUp}>
          <h1 className="brand">
            <Wordmark variant="c3" />
            <span className="brand-name">8-BIT SPORTS NETWORK</span>
          </h1>
          <RomGate
            onReady={onRomReady}
            onClear={onRomClear}
            primaryLabel={emulator !== null ? 'RESUME' : 'START GAME'}
            onStart={emulator !== null ? () => setRomOpen(false) : gesture}
            active={chromeUp}
          />
        </div>
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
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <BroadcastView state={state} tracker={tracker} names={names} player={player} forcePackage={forcePackage} canvasSlot={attach} games={games} helmets={helmets} emulator={emulator} rom={rom} events={game.events} generation={game.generation} />
    </main>
  )
}
