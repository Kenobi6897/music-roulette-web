import { NextRequest } from 'next/server'

/**
 * The app's public origin, e.g. https://musicroulette.live — no trailing slash.
 *
 * Prefers NEXT_PUBLIC_BASE_URL, but falls back to the incoming request's
 * forwarded host. That fallback matters: NEXT_PUBLIC_BASE_URL is inlined at
 * build time, so a deploy made without it set would otherwise emit
 * `undefined/api/...` as the Spotify redirect_uri and Spotify rejects it as
 * unsafe. Deriving from the request means the OAuth flow works on whatever
 * domain actually served the page.
 *
 * Note: the resulting callback URL must still be registered in the Spotify app
 * dashboard — Spotify matches redirect_uri exactly.
 */
export function getBaseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_BASE_URL
  if (env && /^https?:\/\//.test(env)) return env.replace(/\/+$/, '')

  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (host) return `${proto}://${host}`

  return request.nextUrl.origin
}
