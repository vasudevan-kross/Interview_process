import type { NextApiRequest, NextApiResponse } from 'next'
import http from 'http'

/**
 * Raw streaming proxy for video recording uploads.
 *
 * bodyParser: false → Next.js never reads or limits the request body.
 * The raw IncomingMessage stream is piped directly to FastAPI via Node http,
 * bypassing all Next.js body size limits entirely.
 */
export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { sessionId } = req.query as { sessionId: string }

  const headers: Record<string, string> = {}
  if (req.headers['content-type'])   headers['content-type']   = req.headers['content-type']
  if (req.headers['content-length']) headers['content-length'] = req.headers['content-length']
  if (req.headers['transfer-encoding']) headers['transfer-encoding'] = req.headers['transfer-encoding']

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: 8000,
      path: `/api/v1/video-interviews/sessions/${sessionId}/recording`,
      method: 'POST',
      headers,
    },
    (proxyRes) => {
      res.status(proxyRes.statusCode ?? 200)
      // Forward response headers
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (value !== undefined) res.setHeader(key, value)
      }
      proxyRes.pipe(res)
    },
  )

  proxyReq.on('error', (err) => {
    console.error('[video-upload proxy] error:', err.message)
    if (!res.headersSent) res.status(502).json({ error: 'Upload proxy failed' })
  })

  // Pipe the raw request body straight through — no buffering, no size limit
  req.pipe(proxyReq)
}
