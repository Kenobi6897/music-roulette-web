import { NextRequest, NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/base-url'

function parseState(raw: string): { code: string; playerId: string } {
  if (!raw) return { code: '', playerId: '' }
  try {
    const { code, playerId } = JSON.parse(Buffer.from(raw, 'base64url').toString())
    return { code: code ?? '', playerId: playerId ?? '' }
  } catch {
    return { code: raw, playerId: '' } // legacy: state was the bare room code
  }
}

function roomUrl(base: string, code: string, playerId: string): string {
  if (!code) return `${base}/`
  const query = playerId ? `?pid=${encodeURIComponent(playerId)}` : ''
  return `${base}/room/${encodeURIComponent(code)}${query}`
}

export async function GET(request: NextRequest) {
  const base = getBaseUrl(request)
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')
  const { code: roomCode, playerId } = parseState(
    request.nextUrl.searchParams.get('state') ?? ''
  )

  // Send a denied/failed auth back to the room rather than dumping the host home.
  if (error || !code) {
    const back = roomCode ? roomUrl(base, roomCode, playerId) : `${base}/`
    const sep = back.includes('?') ? '&' : '?'
    return NextResponse.redirect(`${back}${sep}error=spotify_denied`)
  }

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64')

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${base}/api/auth/spotify/callback`,
    }),
  })

  if (!tokenRes.ok) {
    const back = roomUrl(base, roomCode, playerId)
    const sep = back.includes('?') ? '&' : '?'
    return NextResponse.redirect(`${back}${sep}error=spotify_token_failed`)
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json()

  const response = NextResponse.redirect(roomUrl(base, roomCode, playerId))

  response.cookies.set('spotify_access_token', access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: expires_in,
    path: '/',
  })
  response.cookies.set('spotify_refresh_token', refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })

  return response
}
