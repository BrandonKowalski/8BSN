import { useCallback, useEffect, useRef, useState } from 'react'
import { Emulator } from './emu/Emulator'
import { useGame } from './game/useGame'
import type { GameState } from './game/types'
import RomGate from './rom/RomGate'
import { useHotkeys } from './views/useHotkeys'

const GATE_COPY = 'Press any button or click to start'
const STALE_START_MS = 1500

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
  const emulatorRef = useRef<Emulator | null>(null)
  const attemptRef = useRef(0)
  const startingRef = useRef(false)
  const { view, crtStyle } = useHotkeys()
  const { state } = useGame(emulator, rom)

  const stopEmulator = useCallback(() => {
    attemptRef.current += 1
    startingRef.current = false
    emulatorRef.current?.stop()
    emulatorRef.current = null
    setEmulator(null)
  }, [])

  const start = useCallback(() => {
    const canvas = canvasRef.current
    if (!rom || !canvas || startingRef.current || emulatorRef.current) return
    startingRef.current = true
    const attempt = ++attemptRef.current
    const stale = setTimeout(() => {
      if (attemptRef.current === attempt) startingRef.current = false
    }, STALE_START_MS)
    Emulator.start(rom, canvas).then(
      (started) => {
        clearTimeout(stale)
        if (attemptRef.current !== attempt || emulatorRef.current) {
          started.stop()
          return
        }
        startingRef.current = false
        emulatorRef.current = started
        setEmulator(started)
      },
      () => {
        clearTimeout(stale)
        if (attemptRef.current === attempt) startingRef.current = false
      },
    )
  }, [rom])

  const gateUp = rom !== null && emulator === null

  useEffect(() => {
    if (!gateUp) return
    const onKey = () => start()
    window.addEventListener('keydown', onKey)
    let raf = 0
    const poll = () => {
      if (anyPadPressed()) start()
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(raf)
    }
  }, [gateUp, start])

  useEffect(
    () => () => {
      attemptRef.current += 1
      emulatorRef.current?.stop()
      emulatorRef.current = null
    },
    [],
  )

  const attach = useCallback((node: HTMLDivElement | null) => {
    if (node && canvasRef.current && canvasRef.current.parentElement !== node) node.appendChild(canvasRef.current)
  }, [])

  return (
    <main className="app" data-crt-style={crtStyle}>
      <div className="chrome" hidden={emulator !== null}>
        <h1>Tecmo Broadcast</h1>
        <RomGate onReady={setRom} onClear={() => { setRom(null); stopEmulator() }} />
      </div>
      {gateUp && (
        <button type="button" className="gate" onClick={start}>
          {GATE_COPY}
        </button>
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
