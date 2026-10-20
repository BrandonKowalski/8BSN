import { useEffect, useState } from 'react'
import { fetchStandings, type Records } from './espn'

const REFRESH_MS = 900_000
const RETRY_MS = 60_000

export const useStandings = (path: string | null): Records | null => {
  const [records, setRecords] = useState<Records | null>(null)

  useEffect(() => {
    if (path === null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      const next = await fetchStandings(path)
      if (cancelled) return
      if (next) setRecords(next)
      timer = setTimeout(tick, next ? REFRESH_MS : RETRY_MS)
    }

    void tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [path])

  return records
}
