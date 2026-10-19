import { useEffect, useState } from 'react'
import { fetchLeague, type LeagueGame } from './espn'

const LIVE_MS = 60_000
const IDLE_MS = 900_000
const RETRY_MS = 30_000

export const useLeague = (): LeagueGame[] | null => {
  const [games, setGames] = useState<LeagueGame[] | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let last: LeagueGame[] | null = null
    let failures = 0

    const tick = async () => {
      const next = await fetchLeague()
      if (cancelled) return
      if (next) {
        last = next
        failures = 0
        setGames(next)
      } else failures += 1
      const normal = last?.some((g) => g.state === 'in') ? LIVE_MS : IDLE_MS
      timer = setTimeout(tick, failures > 0 ? Math.min(RETRY_MS * 2 ** (failures - 1), normal) : normal)
    }

    void tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return games
}
