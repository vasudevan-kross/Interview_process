'use client'

import { useEffect, useState } from 'react'
import { Loader2, WifiOff } from 'lucide-react'
import {
  wakeBackend,
  getBackendStatus,
  subscribeBackendStatus,
  type BackendStatus,
} from '@/lib/backend-warmup'

const KEEP_ALIVE_MS = 10 * 60_000   // under Render's 15-min idle limit
const UNREACHABLE_RETRY_MS = 10_000

/**
 * Mounted once in the root layout. Wakes the backend as soon as any page loads
 * (login, dashboard, candidate link), keeps it awake while a tab is visible,
 * and shows a small notice while a cold start is in progress.
 */
export function BackendWarmup() {
  const [status, setStatus] = useState<BackendStatus>(getBackendStatus())

  useEffect(() => {
    const unsubscribe = subscribeBackendStatus(setStatus)
    wakeBackend()

    const keepAlive = setInterval(() => {
      if (document.visibilityState === 'visible') wakeBackend({ force: true })
    }, KEEP_ALIVE_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') wakeBackend()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      unsubscribe()
      clearInterval(keepAlive)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // Keep trying if the backend could not be reached within the wake budget.
  useEffect(() => {
    if (status !== 'unreachable') return
    const t = setTimeout(() => wakeBackend({ force: true }), UNREACHABLE_RETRY_MS)
    return () => clearTimeout(t)
  }, [status])

  if (status !== 'waking' && status !== 'unreachable') return null

  const unreachable = status === 'unreachable'
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-md border border-slate-700 bg-slate-900/95 px-4 py-3 text-sm text-slate-100 shadow-lg backdrop-blur"
    >
      <div className="flex items-start gap-3">
        {unreachable ? (
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        ) : (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-indigo-400" />
        )}
        <div>
          <p className="font-medium">
            {unreachable ? 'Server is not responding' : 'Connecting to server…'}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {unreachable
              ? 'Still trying to reconnect. Please keep this page open.'
              : 'The server is starting up. This can take up to a minute — please keep this page open.'}
          </p>
        </div>
      </div>
    </div>
  )
}
