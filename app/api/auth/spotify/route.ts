import { NextRequest, NextResponse } from 'next/server'

const SCOPES = 'user-library-read'

export function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get('returnTo')

  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/spotify/callback`,
    scope: SCOPES,
  })

  const response = NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  )

  if (returnTo) {
    response.cookies.set('returnToRoom', returnTo, { maxAge: 600, path: '/', httpOnly: true })
  }

  return response
}
