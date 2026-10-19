// Live updates: one connection per browser tab to the server's /api/stream (Server-Sent Events).
// The server only says WHICH events changed; each page then re-reads its own data through the normal API.
import { useEffect, useRef, useSyncExternalStore } from 'react'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080'

/** The server pings every 25 s. Hearing nothing for this long means the connection died without telling us. */
const SILENCE_LIMIT_MS = 60_000

/** 'all' means "you may have missed something, reload everything" (after a reconnect or coming back to the tab). */
export type Change = Set<number> | 'all'
type Listener = (change: Change) => void
export type LiveStatus = 'connecting' | 'live' | 'offline'

const listeners = new Set<Listener>()
const statusListeners = new Set<() => void>()
let status: LiveStatus = 'connecting'
let source: EventSource | null = null
let connectedBefore = false
let lastHeard = Date.now()

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
  lastHeard = Date.now()
  const es = new EventSource(`${API_URL}/api/stream`)
  source = es
  es.addEventListener('ready', () => {
    lastHeard = Date.now()
    setStatus('live')
    // On a reconnect, changes made while we were away were never sent to us.
    if (connectedBefore) emit('all')
    connectedBefore = true
  })
  es.addEventListener('ping', () => {
    lastHeard = Date.now()
  })
  es.addEventListener('changed', (e) => {
    lastHeard = Date.now()
    const ids = (e as MessageEvent<string>).data.split(',').map(Number).filter(Number.isFinite)
    emit(new Set(ids))
  })
  // The browser retries by itself; we only show that we're reconnecting.
  es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? 'offline' : 'connecting')
}

/** Throw away the current connection and open a new one (which then reloads everything once it's ready). */
function reconnect() {
  source?.close()
  source = null
  setStatus('connecting')
  connect()
}

if (typeof window !== 'undefined') {
  // Watchdog: a connection can die silently (server restarted, network changed). Reconnect if it goes quiet.
  setInterval(() => {
    if (source && document.visibilityState === 'visible' && Date.now() - lastHeard > SILENCE_LIMIT_MS) {
      reconnect()
    }
  }, 10_000)

  // Phones pause background tabs. When the tab comes back, check the connection and catch up.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !source) return
    if (source.readyState === EventSource.CLOSED || Date.now() - lastHeard > SILENCE_LIMIT_MS) reconnect()
    else emit('all')
  })

  // Back online after losing the network (e.g. phone switched from Wi-Fi to data).
  window.addEventListener('online', () => {
    if (source) reconnect()
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
