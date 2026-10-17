export const TARGET_FILL_FRAMES = 2048

const MAX_DRIFT = 0.005
const MAX_FRAMES_PER_TICK = 2

export function resampleRatio(fill: number, target: number): number {
  const error = Math.max(-1, Math.min(1, (target - fill) / target))
  return 1 + error * MAX_DRIFT
}

export function framesToRun(fill: number, target: number, samplesPerFrame: number): number {
  const wanted = Math.ceil((target - fill) / samplesPerFrame)
  return Math.max(0, Math.min(MAX_FRAMES_PER_TICK, wanted))
}
