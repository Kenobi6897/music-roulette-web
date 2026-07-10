import { NextRequest, NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/base-url'

const SCOPES = 'user-library-read'

export function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get('returnTo') ?? ''
  const playerId = request.nextUrl.searchParams.get('playerId') ?? ''

  // Both the room code and the player id ride through Spotify in `state` — the
  // callback hands the id back so the browser can restore it even if localStorage
  // was lost across the redirect.
  const state = Buffer.from(JSON.stringify({ code: returnTo, playerId })).toString(
    'base64url'
  )

  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: `${getBaseUrl(request)}/api/auth/spotify/callback`,
    scope: SCOPES,
    state,
  })

  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  )
}
