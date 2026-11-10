/**
 * Backend warm-up for hosts that sleep when idle (Render free plan).
 *
 * The free Render instance spins down after ~15 min without traffic and takes
 * 30–60 s to boot on the next request. Without this, the first API call after
 * a quiet period fails or hangs (candidate link "Failed to load interview",
 * dashboard empty after login).
 *
 * - `wakeBackend()` pings /api/v1/health until it answers (shared promise, so
 *   any number of callers trigger only one wake-up loop).
 * - `subscribeBackendStatus()` lets the UI show a "Connecting to server…" notice.
 * - `fetchWithWake()` retries a request after waking the backend. Use it only
 *   for requests that are safe to repeat (GETs, idempotent updates).
 */

export type BackendStatus = 'unknown' | 'waking' | 'ready' | 'unreachable'

const HEALTH_URL = '/api/v1/health'
const PING_TIMEOUT_MS = 20_000      // per health request
const WAKE_BUDGET_MS = 120_000      // give up after this long (cold boot is ~60 s)
const RETRY_DELAY_MS = 3_000
const READY_TTL_MS = 5 * 60_000     // trust a successful ping for this long

let status: BackendStatus = 'unknown'
let lastReadyAt = 0
let inflight: Promise<boolean> | null = null
const listeners = new Set<(s: BackendStatus) => void>()

function setStatus(next: BackendStatus) {
  if (status === next) return
  status = next
  listeners.forEach((fn) => fn(next))
}

export function getBackendStatus(): BackendStatus {
  return status
}

export function subscribeBackendStatus(fn: (s: BackendStatus) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function pingOnce(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
  try {
    const res = await fetch(HEALTH_URL, {
      cache: 'no-store',
      headers: { 'ngrok-skip-browser-warning': 'true' },
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolve once the backend answers its health check (true), or after the wake
 * budget is spent (false). Concurrent callers share one wake-up loop.
 */
export function wakeBackend(opts: { force?: boolean } = {}): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(true)
  if (!opts.force && status === 'ready' && Date.now() - lastReadyAt < READY_TTL_MS) {
    return Promise.resolve(true)
  }
  if (inflight) return inflight

  inflight = (async () => {
    const deadline = Date.now() + WAKE_BUDGET_MS
    let first = true
    while (Date.now() < deadline) {
      if (await pingOnce()) {
        lastReadyAt = Date.now()
        setStatus('ready')
        return true
      }
      // First ping failed or timed out — the backend is cold-starting.
      if (first) { setStatus('waking'); first = false }
      await sleep(RETRY_DELAY_MS)
    }
    setStatus('unreachable')
    return false
  })().finally(() => { inflight = null })

  // Only surface "waking" if the first ping is slow, so warm loads stay silent.
  const slowTimer = setTimeout(() => { if (inflight && status !== 'ready') setStatus('waking') }, 2_500)
  inflight.finally(() => clearTimeout(slowTimer))

  return inflight
}

/** Status codes the proxy/host returns while the backend is asleep or booting. */
const COLD_START_STATUSES = new Set([502, 503, 504])

/**
 * fetch() that survives a cold start: on a network error or 502/503/504 it
 * waits for the backend to wake and retries once. Only use for requests that
 * are safe to send twice.
 */
export async function fetchWithWake(input: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(input, init)
    if (!COLD_START_STATUSES.has(res.status)) return res
  } catch {
    // network error — fall through to wake + retry
  }
  await wakeBackend({ force: true })
  return fetch(input, init)
}
