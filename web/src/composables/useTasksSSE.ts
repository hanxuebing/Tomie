import { onUnmounted } from 'vue'
import api from '@/api'

export type TaskSSEEvent =
  | { type: 'task_created'; id: string }
  | { type: 'task_updated'; id: string }
  | { type: 'task_deleted'; id: string }

export function useTasksSSE(onEvent: (event: TaskSSEEvent) => void) {
  let abortCtrl: AbortController | null = null
  let reconnectTimer: number | null = null
  let retries = 0
  let stopped = false

  const MAX_RETRIES = 6
  const BASE_DELAY = 1000
  const MAX_DELAY = 15000

  function connect() {
    if (stopped) return
    const ctrl = new AbortController()
    abortCtrl = ctrl

    const baseURL = api.defaults.baseURL || ''
    const url = `${baseURL}/tasks/stream`

    ;(async () => {
      try {
        const res = await fetch(url, {
          headers: { Accept: 'text/event-stream' },
          signal: ctrl.signal,
        })
        if (!res.ok || !res.body) {
          scheduleReconnect(ctrl)
          return
        }

        retries = 0
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })

          let boundary: number
          while ((boundary = buf.indexOf('\n\n')) !== -1) {
            const frame = buf.slice(0, boundary)
            buf = buf.slice(boundary + 2)

            let event = 'message'
            let data = ''
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim()
              else if (line.startsWith('data:')) data = line.slice(5).trim()
            }

            if (event === 'connected') continue

            try {
              const parsed = JSON.parse(data)
              onEvent({ type: event as TaskSSEEvent['type'], id: parsed.id })
            } catch {
              /* ignore malformed frames */
            }
          }
        }

        scheduleReconnect(ctrl)
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        scheduleReconnect(ctrl)
      }
    })()
  }

  function scheduleReconnect(ctrl: AbortController) {
    if (abortCtrl !== ctrl || stopped) return
    abortCtrl = null

    if (retries >= MAX_RETRIES) {
      retries = 0
    }

    const delay = Math.min(BASE_DELAY * 2 ** retries, MAX_DELAY)
    retries++
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      if (!stopped) connect()
    }, delay)
  }

  function stop() {
    stopped = true
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (abortCtrl) {
      abortCtrl.abort()
      abortCtrl = null
    }
  }

  connect()
  onUnmounted(stop)

  return { stop }
}
