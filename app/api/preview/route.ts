import { NextRequest, NextResponse } from 'next/server'

/**
 * Resolves a 30s preview MP3 for an ISRC via Deezer.
 *
 * Spotify's own preview_url is deprecated and returns null for apps registered
 * after Nov 2024, so previews come from Deezer instead — matched on ISRC, which
 * identifies the same recording across every DSP.
 *
 * The returned URL is signed and expires ~15 minutes after issue, so it must be
 * resolved at round start and used immediately. Never persist it.
 */
export async function GET(request: NextRequest) {
  const isrc = request.nextUrl.searchParams.get('isrc')

  if (!isrc) {
    return NextResponse.json({ error: 'missing_isrc' }, { status: 400 })
  }

  let res: Response
  try {
    res = await fetch(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`, {
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'deezer_unreachable' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'deezer_error' }, { status: 502 })
  }

  // Deezer answers a miss with HTTP 200 and an `error` body, so the status is not
  // enough — the body has to be inspected.
  const data = await res.json()
  if (data?.error || !data?.preview) {
    return NextResponse.json({ error: 'no_preview' }, { status: 404 })
  }

  return NextResponse.json({ previewUrl: data.preview as string })
}
