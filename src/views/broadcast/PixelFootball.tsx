const FOOTBALL = ['..#######..', '.##w#w#w##.', '###wwwww###', '.##w#w#w##.', '..#######..']

export const FOOTBALL_WIDTH = FOOTBALL[0].length
export const FOOTBALL_HEIGHT = FOOTBALL.length

type Props = { className: string; testId: string; x?: number; y?: number; width?: number; height?: number }

export default function PixelFootball({ className, testId, x, y, width, height }: Props) {
  return (
    <svg className={className} data-testid={testId} x={x} y={y} width={width} height={height} viewBox={`0 0 ${FOOTBALL_WIDTH} ${FOOTBALL_HEIGHT}`} shapeRendering="crispEdges">
      {FOOTBALL.flatMap((row, py) =>
        [...row].map((px, col) => (px === '.' ? null : <rect key={`${col}-${py}`} x={col} y={py} width={1} height={1} fill={px === 'w' ? '#fff' : '#8b4a1c'} />)),
      )}
    </svg>
  )
}
