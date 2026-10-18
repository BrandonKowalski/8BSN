import { useCallback, useEffect, useRef, useState } from 'react'
import { Emulator } from './emu/Emulator'
import { useGame } from './game/useGame'
import { useLeague } from './league/useLeague'
import RomGate from './rom/RomGate'
import { useHelmets } from './helmets/useHelmets'
import { useSaveStates } from './saves/useSaveStates'
import BroadcastView from './views/broadcast/BroadcastView'
import { useHotkeys } from './views/useHotkeys'

const GATE_COPY = 'Press any button or click to start'
const SOUND_COPY = 'Click or press a key to turn on sound'

function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

function anyPadPressed() {
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (pad?.buttons.some((button) => button.pressed)) return true
  }
  return false
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
  const { state, tracker, names } = game
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

  const gateUp = rom !== null && (emulator === null || !audioOn)
  const toast = useSaveStates(emulator, game, !gateUp && !romOpen)

  useEffect(() => {
    if (!gateUp) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof Node && chromeRef.current?.contains(event.target)) return
      gesture()
    }
    window.addEventListener('keydown', onKey)
    let raf = 0
    let wasPressed = anyPadPressed()
    const poll = () => {
      const pressed = anyPadPressed()
      if (pressed && !wasPressed) gesture()
      wasPressed = pressed
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(raf)
    }
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
      <div className="chrome" ref={chromeRef} hidden={emulator !== null && !romOpen}>
        <h1>Tecmo Broadcast</h1>
        <RomGate onReady={onRomReady} onClear={onRomClear} onCancel={emulator !== null ? () => setRomOpen(false) : undefined} />
      </div>
      {gateUp && (
        <div className="gate" onClick={gesture}>
          <button type="button">
            {GATE_COPY}
          </button>
          {emulator && !audioOn && <p>{SOUND_COPY}</p>}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <BroadcastView state={state} tracker={tracker} names={names} forcePackage={forcePackage} canvasSlot={attach} games={games} helmets={helmets} />
    </main>
  )
}
