import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

/**
 * Loads data once (and again on reload()), tracking loading and error states.
 * refresh() reloads quietly for live updates: no spinner, and a failed refresh keeps showing the old data.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  // Several refreshes can be in flight at once; only the newest one may update the page.
  const latest = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)

  const reload = useCallback(() => {
    const ticket = ++latest.current
    setLoading(true)
    setError(null)
    return run()
      .then((d) => ticket === latest.current && setData(d))
      .catch(
        (e) => ticket === latest.current && setError(e instanceof ApiError ? e : new ApiError(0, 'error', 'Something went wrong.')),
      )
      .finally(() => ticket === latest.current && setLoading(false))
  }, [run])

  const refresh = useCallback(() => {
    const ticket = ++latest.current
    return run()
      .then((d) => {
        if (ticket === latest.current) {
          setData(d)
          setError(null)
        }
      })
      .catch(() => {
        // Keep showing what we had; the next live update or a manual reload will try again.
      })
  }, [run])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, error, loading, reload, refresh, setData }
}
