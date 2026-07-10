import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')
  const state = request.nextUrl.searchParams.get('state') ?? ''

  if (error || !code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/?error=spotify_denied`
    )
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
      redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/spotify/callback`,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/?error=spotify_token_failed`
    )
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json()

  const destination = state
    ? `${process.env.NEXT_PUBLIC_BASE_URL}/room/${state}`
    : `${process.env.NEXT_PUBLIC_BASE_URL}/`

  const response = NextResponse.redirect(destination)

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
