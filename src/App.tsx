import { useCallback, useEffect, useRef, useState } from 'react'
import { Emulator } from './emu/Emulator'
import { useGame } from './game/useGame'
import type { GameState } from './game/types'
import RomGate from './rom/RomGate'
import { useHotkeys } from './views/useHotkeys'

const GATE_COPY = 'Press any button or click to start'

function clockText(state: GameState) {
  const quarter = state.quarter >= 4 ? 'OT' : `Q${state.quarter + 1}`
  const sec = String(state.clock.sec).padStart(2, '0')
  return `${quarter} ${state.clock.min}:${sec}`
}

function Overlay({ state }: { state: GameState | null }) {
  if (!state || !state.inGame) return null
  const [a, b] = state.teams
  return (
    <div className="overlay">
      {a.abbr} {a.score} - {b.abbr} {b.score} {clockText(state)}
    </div>
  )
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
  const emulatorRef = useRef<Emulator | null>(null)
  const startingRef = useRef(false)
  const generationRef = useRef(0)
  const { view, crtStyle } = useHotkeys()
  const { state } = useGame(emulator, rom)

  const stopEmulator = useCallback(() => {
    generationRef.current += 1
    emulatorRef.current?.stop()
    emulatorRef.current = null
    setEmulator(null)
    setAudioOn(false)
  }, [])

  const gesture = useCallback(() => {
    const running = emulatorRef.current
    if (running) {
      const generation = generationRef.current
      void running.resumeAudio().then((on) => {
        if (on && generationRef.current === generation) setAudioOn(true)
      })
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
        setAudioOn(started.audioRunning())
        void started.resumeAudio().then((on) => {
          if (on && generationRef.current === generation) setAudioOn(true)
        })
      },
      (reason: unknown) => {
        startingRef.current = false
        setError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }, [rom])

  const gateUp = rom !== null && (emulator === null || !audioOn)

  useEffect(() => {
    if (!gateUp) return
    window.addEventListener('keydown', gesture)
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
      window.removeEventListener('keydown', gesture)
      cancelAnimationFrame(raf)
    }
  }, [gateUp, gesture])

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
      if (emulatorRef.current) stopEmulator()
      setRom(bytes)
    },
    [stopEmulator],
  )

  const onRomClear = useCallback(() => {
    setRom(null)
    stopEmulator()
  }, [stopEmulator])

  const attach = useCallback((node: HTMLDivElement | null) => {
    if (node && canvasRef.current && canvasRef.current.parentElement !== node) node.appendChild(canvasRef.current)
  }, [])

  return (
    <main className="app" data-crt-style={crtStyle}>
      <div className="chrome" hidden={emulator !== null}>
        <h1>Tecmo Broadcast</h1>
        <RomGate onReady={onRomReady} onClear={onRomClear} />
      </div>
      {gateUp && (
        <div className="gate" onClick={gesture}>
          <button type="button">
            {GATE_COPY}
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {view === 'crt' ? (
        <div className="view view-crt" data-testid="crt-view">
          <div className="canvas-slot" ref={attach} />
          <Overlay state={state} />
        </div>
      ) : (
        <div className="view view-broadcast" data-testid="broadcast-view">
          <div className="canvas-slot" ref={attach} />
          <Overlay state={state} />
        </div>
      )}
    </main>
  )
}
