// Live updates: one connection per browser tab to the server's /api/stream (Server-Sent Events).
// The server only says WHICH events changed; each page then re-reads its own data through the normal API.
import { useEffect, useRef, useSyncExternalStore } from 'react'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080'

/** 'all' means "you may have missed something, reload everything" (after a reconnect or coming back to the tab). */
export type Change = Set<number> | 'all'
type Listener = (change: Change) => void
export type LiveStatus = 'connecting' | 'live' | 'offline'

const listeners = new Set<Listener>()
const statusListeners = new Set<() => void>()
let status: LiveStatus = 'connecting'
let source: EventSource | null = null
let connectedBefore = false

function setStatus(next: LiveStatus) {
  if (status !== next) {
    status = next
    statusListeners.forEach((l) => l())
  }
}

function emit(change: Change) {
  listeners.forEach((l) => l(change))
}

function connect() {
  if (source || typeof EventSource === 'undefined') return
  source = new EventSource(`${API_URL}/api/stream`)
  source.addEventListener('ready', () => {
    setStatus('live')
    // On a reconnect, changes made while we were away were never sent to us.
    if (connectedBefore) emit('all')
    connectedBefore = true
  })
  source.addEventListener('changed', (e) => {
    const ids = (e as MessageEvent<string>).data.split(',').map(Number).filter(Number.isFinite)
    emit(new Set(ids))
  })
  // The browser retries by itself; we only show that we're reconnecting.
  source.onerror = () => setStatus(source?.readyState === EventSource.CLOSED ? 'offline' : 'connecting')
}

if (typeof document !== 'undefined') {
  // Phones pause background tabs. When the tab comes back, catch up.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (source?.readyState === EventSource.CLOSED) {
        source = null
        connect()
      }
      emit('all')
    }
  })
}

/**
 * Calls `reload` when something this page shows has changed.
 * `relevant` gets the changed event ids; return true if this page should refresh.
 */
export function useLive(reload: () => void, relevant: (ids: Set<number>) => boolean = () => true) {
  const latest = useRef({ reload, relevant })
  latest.current = { reload, relevant }

  useEffect(() => {
    connect()
    const listener: Listener = (change) => {
      if (change === 'all' || latest.current.relevant(change)) latest.current.reload()
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(
    (onChange) => {
      connect()
      statusListeners.add(onChange)
      return () => {
        statusListeners.delete(onChange)
      }
    },
    () => status,
  )
}
