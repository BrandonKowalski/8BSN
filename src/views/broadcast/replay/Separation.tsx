type Point = { x: number; y: number }

export const DEFENDER_RING = '#ff5a36'
export const SEPARATION_HOLD_MS = 1500
export const SEPARATION_FADE_MS = 300

export function separationOpacity(sinceCatchMs: number): number {
  if (sinceCatchMs <= SEPARATION_HOLD_MS) return 1
  return Math.max(0, 1 - (sinceCatchMs - SEPARATION_HOLD_MS) / SEPARATION_FADE_MS)
}

export const separationText = (yards: number) => `${yards.toFixed(1)} YDS`

export function uprightAngle(a: Point, b: Point): number {
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  if (angle > 90) return angle - 180
  if (angle <= -90) return angle + 180
  return angle
}

type Props = { receiver: Point; defender: Point; yards: number; r: number; font: number; stroke: number; testId: string; opacity?: number }

export default function Separation({ receiver, defender, yards, r, font, stroke, testId, opacity = 1 }: Props) {
  const text = separationText(yards)
  const mid = { x: (receiver.x + defender.x) / 2, y: (receiver.y + defender.y) / 2 }
  const w = text.length * font * 0.5 + font * 0.3
  const h = font * 0.95
  return (
    <g className="separation" data-testid={testId} opacity={opacity}>
      <line data-testid={`${testId}-line`} className="separation-line" x1={receiver.x} y1={receiver.y} x2={defender.x} y2={defender.y} strokeWidth={stroke} />
      <circle data-testid={`${testId}-defender`} className="separation-defender" cx={defender.x} cy={defender.y} r={r} fill="none" stroke={DEFENDER_RING} strokeWidth={stroke} />
      <g data-testid={`${testId}-label`} transform={`rotate(${Math.round(uprightAngle(receiver, defender) * 10) / 10} ${mid.x} ${mid.y})`}>
        <rect className="separation-plate" x={mid.x - w / 2} y={mid.y - h / 2} width={w} height={h} rx={h / 4} />
        <text data-testid={`${testId}-text`} className="separation-text" x={mid.x} y={mid.y + font * 0.35} fontSize={font} textAnchor="middle">
          {text}
        </text>
      </g>
    </g>
  )
}
