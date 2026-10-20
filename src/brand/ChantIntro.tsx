import { useEffect, useRef, type RefObject } from 'react'
import './chantIntro.css'

const LINES = ['8-BIT', 'SPORTS', 'NETWORK']
const BEATS: [number, number, number][] = [
  [0, 0, 1],
  [0, 1, 5],
  [1, 0, 6],
  [2, 0, 7],
]
const INITIALS: [number, number][] = [
  [0, 0],
  [0, 2],
  [1, 0],
  [2, 0],
]
const BEAT = 430
const FLIGHT = 640
const STAGGER = 80
const TAN = Math.tan((12 * Math.PI) / 180)
const INITIAL_COLORS = ['#ffb400', '#ffb400', '#c8102e', '#3b8cff']
const INITIAL_CLASSES = ['chant-initial', 'chant-initial', 'chant-initial chant-red', 'chant-initial chant-blue']

export function canPlayIntro() {
  if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return false
  return typeof window.matchMedia !== 'function' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const initialClass = (line: number, col: number) => {
  const index = INITIALS.findIndex(([l, c]) => l === line && c === col)
  return index < 0 ? undefined : INITIAL_CLASSES[index]
}
const center = (r: DOMRect) => [r.left + r.width / 2, r.top + r.height / 2]

type Props = { chromeRef: RefObject<HTMLElement | null>; onDone: () => void }

export default function ChantIntro({ chromeRef, onDone }: Props) {
  const stackRef = useRef<HTMLDivElement | null>(null)
  const flashRef = useRef<HTMLDivElement | null>(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const skipRef = useRef(() => onDoneRef.current())

  useEffect(() => {
    let live = true
    const running: Animation[] = []
    const stack = stackRef.current
    const flash = flashRef.current
    const chrome = chromeRef.current
    if (!stack || !flash || !chrome) return onDoneRef.current()
    const lines = Array.from(stack.children, (line) => Array.from(line.children) as HTMLElement[])
    const letters = Array.from(chrome.querySelectorAll<HTMLElement>('.brand .wm-letter'))
    const stripes = Array.from(chrome.querySelectorAll<HTMLElement>('.brand .wm-stripe'))

    const animate = (el: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
      running.push(el.animate(frames, options))
    }
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

    const finish = () => {
      if (!live) return
      live = false
      running.forEach((a) => a.cancel())
      onDoneRef.current()
    }
    skipRef.current = finish

    const slam = (spans: HTMLElement[], big: boolean) => {
      spans.forEach((span, i) => {
        span.style.opacity = ''
        animate(
          span,
          [
            { transform: 'scale(2.6) translateY(-0.2em)', opacity: 0 },
            { transform: 'scale(0.92)', opacity: 1, offset: 0.7 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 170, delay: i * 18, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' },
        )
      })
      const kick = big ? 14 : 8
      animate(
        stack,
        [
          { transform: 'translate(0,0)' },
          { transform: `translate(${-kick}px,${kick * 0.6}px)` },
          { transform: `translate(${kick * 0.7}px,${-kick * 0.4}px)` },
          { transform: 'translate(0,0)' },
        ],
        { duration: 160, delay: 120, easing: 'steps(4, end)' },
      )
      animate(flash, [{ opacity: big ? 0.3 : 0.16 }, { opacity: 0 }], { duration: 180, delay: 120, easing: 'ease-out' })
    }

    const play = async () => {
      await Promise.race([document.fonts?.load('1em "Press Start 2P"'), wait(1500)]).catch(() => undefined)
      await wait(300)
      for (let b = 0; b < BEATS.length; b++) {
        if (!live) return
        const [line, from, to] = BEATS[b]
        slam(lines[line].slice(from, to), b === BEATS.length - 1)
        await wait(BEAT)
      }
      await wait(380)
      if (!live) return

      const initials = INITIALS.map(([l, c]) => lines[l][c])
      lines.flat().filter((span) => !initials.includes(span)).forEach((span) => {
        const spin = (Math.random() * 2 - 1) * 50
        animate(
          span,
          [
            { transform: 'none', opacity: 1 },
            { transform: `translate(${spin * 0.3}px, 40vh) rotate(${spin}deg)`, opacity: 0 },
          ],
          { duration: 520, delay: Math.random() * 140, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' },
        )
      })
      initials.forEach((span) => animate(span, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' }))
      await wait(480)
      if (!live) return

      const scale = parseFloat(getComputedStyle(initials[0]).fontSize) / parseFloat(getComputedStyle(letters[0]).fontSize)
      const base = letters.map((letter) => getComputedStyle(letter).color)
      letters.forEach((letter, i) => {
        const [sx, sy] = center(initials[i].getBoundingClientRect())
        const [tx, ty] = center(letter.getBoundingClientRect())
        const dy = sy - ty
        const lx = sx - tx + TAN * dy
        const color = base[i]
        animate(
          letter,
          [
            { transform: `translate(${lx}px, ${dy}px) scale(${scale}) skewX(12deg)`, color: INITIAL_COLORS[i], opacity: 1 },
            { color, offset: 0.12 },
            { transform: `translate(${lx * 0.1}px, ${dy * 0.1}px) scale(1.12) skewX(0deg)`, color, opacity: 1, offset: 0.8 },
            { transform: 'none', color, opacity: 1 },
          ],
          { duration: FLIGHT, delay: i * STAGGER, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'both' },
        )
        animate(initials[i], [{ opacity: 0 }, { opacity: 0 }], { duration: 1, delay: i * STAGGER, fill: 'forwards' })
      })
      await wait(FLIGHT + STAGGER * 3)
      if (!live) return

      stripes.forEach((stripe, i) =>
        animate(stripe, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 240, delay: 40 + i * 90, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }),
      )
      await wait(560)
      finish()
    }

    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      finish()
    }
    window.addEventListener('keydown', onKey, true)

    let raf = 0
    const pressed = () => {
      let count = 0
      for (const pad of navigator.getGamepads?.() ?? []) for (const button of pad?.buttons ?? []) if (button.pressed) count++
      return count
    }
    let was = pressed()
    const poll = () => {
      const now = pressed()
      if (now > was) return finish()
      was = now
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)

    play()
    return () => {
      live = false
      running.forEach((a) => a.cancel())
      window.removeEventListener('keydown', onKey, true)
      cancelAnimationFrame(raf)
    }
  }, [chromeRef])

  return (
    <div className="chant" aria-hidden="true" onClick={() => skipRef.current()}>
      <div className="chant-flash" ref={flashRef} />
      <div className="chant-stack" ref={stackRef}>
        {LINES.map((word, line) => (
          <div className="chant-line" key={word}>
            {[...word].map((ch, col) => (
              <span key={col} className={initialClass(line, col)} style={{ opacity: 0 }}>
                {ch}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
