import { useEffect, useRef, useState } from 'react'
import { Emulator } from './emu/Emulator'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rom, setRom] = useState<Uint8Array | null>(null)
  const [emulator, setEmulator] = useState<Emulator | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!emulator) return
    const timer = setInterval(() => console.log('emulator stats', emulator.stats()), 1000)
    return () => clearInterval(timer)
  }, [emulator])

  const choose = (file: File | undefined) => {
    setRom(null)
    if (file) file.arrayBuffer().then((buffer) => setRom(new Uint8Array(buffer)))
  }

  const start = () => {
    const canvas = canvasRef.current
    if (!rom || !canvas || starting) return
    setStarting(true)
    setError(null)
    Emulator.start(rom, canvas).then(setEmulator, (reason: unknown) => {
      setStarting(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  return (
    <main>
      <h1>Tecmo Broadcast</h1>
      {!emulator && (
        <p>
          <input type="file" accept=".nes" onChange={(event) => choose(event.target.files?.[0])} />
          <button type="button" disabled={!rom || starting} onClick={start}>
            Press to start
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <canvas ref={canvasRef} width={256} height={224} style={{ imageRendering: 'pixelated', width: 768, height: 672 }} />
    </main>
  )
}
