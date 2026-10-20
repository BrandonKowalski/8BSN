import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { TailgateInput } from './useTailgate'

export const STAY_MS = 10000

const PAD_A = 0
const PAD_B = 1
const PAD_START = 9
const PAD_UP = 12
const PAD_DOWN = 13
const PAD_LEFT = 14
const PAD_RIGHT = 15
const MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']
const PICK_KEYS = ['Enter', 'Space', 'KeyX', 'NumpadEnter']
const STAY_KEYS = ['Escape', 'KeyZ', 'Backspace']

type Props = { onLeave: () => void; onStay: () => void; inputRef: MutableRefObject<((input: TailgateInput) => void) | null> }

export default function LeaveTailgate({ onLeave, onStay, inputRef }: Props) {
  const [choice, setChoice] = useState<'leave' | 'stay'>('leave')
  const [touched, setTouched] = useState(0)
  const leaveRef = useRef<HTMLButtonElement | null>(null)
  const stayRef = useRef<HTMLButtonElement | null>(null)
  const latest = useRef({ choice, onLeave, onStay })
  latest.current = { choice, onLeave, onStay }

  useEffect(() => {
    ;(choice === 'leave' ? leaveRef : stayRef).current?.focus()
  }, [choice])

  useEffect(() => {
    const timer = setTimeout(() => latest.current.onStay(), STAY_MS)
    return () => clearTimeout(timer)
  }, [touched])

  useEffect(() => {
    inputRef.current = (input) => {
      setTouched((n) => n + 1)
      const { choice, onLeave, onStay } = latest.current
      const pick = () => (choice === 'leave' ? onLeave() : onStay())
      const flip = () => setChoice((c) => (c === 'leave' ? 'stay' : 'leave'))
      if (input.kind === 'key') {
        if (MOVE_KEYS.includes(input.code)) flip()
        else if (PICK_KEYS.includes(input.code)) pick()
        else if (STAY_KEYS.includes(input.code)) onStay()
      } else if (input.kind === 'pad') {
        if ([PAD_UP, PAD_DOWN, PAD_LEFT, PAD_RIGHT].includes(input.button)) flip()
        else if (input.button === PAD_A || input.button === PAD_START) pick()
        else if (input.button === PAD_B) onStay()
      }
    }
    return () => {
      inputRef.current = null
    }
  }, [inputRef])

  return (
    <div className="info-backdrop leave-backdrop" onClick={onStay}>
      <div className="info-modal leave-modal" role="dialog" aria-modal="true" aria-labelledby="leave-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="leave-title">LEAVE THE TAILGATE?</h2>
        <div className="leave-actions">
          <button type="button" ref={leaveRef} className={choice === 'leave' ? 'leave-choice' : undefined} onClick={onLeave}>
            LEAVE
          </button>
          <button type="button" ref={stayRef} className={choice === 'stay' ? 'leave-choice' : undefined} onClick={onStay}>
            STAY
          </button>
        </div>
      </div>
    </div>
  )
}
