'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { getToken } from './api'
import { API_BASE, API_ENABLED } from './config'
import { useSession } from './session'

type RTEvent = { kind: string; [k: string]: unknown }
type Listener = (e: RTEvent) => void

const RealtimeContext = createContext<{
  subscribe: (fn: Listener) => () => void
  connected: boolean
}>({ subscribe: () => () => {}, connected: false })

/**
 * Opens a single WebSocket to the notifications stream while signed in and
 * fans every event out to subscribers. Powers the live match-fill rings and
 * the notification bell — no polling. Reconnects with backoff.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { authed } = useSession()
  const listeners = useRef<Set<Listener>>(new Set())
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!API_ENABLED || !authed) return
    const token = getToken()
    if (!token || typeof WebSocket === 'undefined') return

    let closed = false
    let retry = 0
    let ws: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout>
    const url = `${API_BASE.replace(/^http/, 'ws')}/v1/ws/notifications?token=${encodeURIComponent(token)}`

    const connect = () => {
      if (closed) return
      ws = new WebSocket(url)
      ws.onopen = () => {
        retry = 0
        setConnected(true)
      }
      ws.onmessage = (m) => {
        try {
          const e = JSON.parse(m.data) as RTEvent
          listeners.current.forEach((fn) => fn(e))
        } catch {
          /* ignore malformed frames */
        }
      }
      ws.onclose = () => {
        setConnected(false)
        if (closed) return
        retry = Math.min(retry + 1, 6)
        timer = setTimeout(connect, 500 * 2 ** retry)
      }
      ws.onerror = () => ws?.close()
    }
    connect()

    return () => {
      closed = true
      clearTimeout(timer)
      ws?.close()
    }
  }, [authed])

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn)
    return () => {
      listeners.current.delete(fn)
    }
  }, [])

  return (
    <RealtimeContext.Provider value={{ subscribe, connected }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime() {
  return useContext(RealtimeContext)
}

/**
 * Live fill state for one match. Seeds from the initial props, then tracks
 * spots_filled / status pushed over the socket, and flags the instant it locks.
 */
export function useMatchLive(matchId: string, initialFilled: number, total: number) {
  const { subscribe } = useRealtime()
  const [filled, setFilled] = useState(initialFilled)
  const [status, setStatus] = useState<'open' | 'confirmed' | string>('open')
  const [justConfirmed, setJustConfirmed] = useState(false)
  const statusRef = useRef<string>('open')

  useEffect(() => {
    return subscribe((e) => {
      if (e.kind !== 'match_update' || e.match_id !== matchId) return
      setFilled(e.spots_filled as number)
      const next = e.status as string
      if (next === 'confirmed' && statusRef.current !== 'confirmed') {
        setJustConfirmed(true)
        setTimeout(() => setJustConfirmed(false), 3400)
      }
      statusRef.current = next
      setStatus(next)
    })
  }, [matchId, subscribe])

  const optimisticJoin = useCallback(
    () => setFilled((f) => Math.min(total, f + 1)),
    [total],
  )

  return { filled, status, justConfirmed, optimisticJoin }
}
