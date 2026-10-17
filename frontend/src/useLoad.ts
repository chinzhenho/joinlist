import { useCallback, useEffect, useState } from 'react'
import { ApiError } from './api'

/** Loads data once (and again on reload()), tracking loading and error states. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return run()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e : new ApiError(0, 'error', 'Something went wrong.')))
      .finally(() => setLoading(false))
  }, [run])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, error, loading, reload, setData }
}
