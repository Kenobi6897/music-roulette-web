import { NextRequest, NextResponse } from 'next/server'

/**
 * Reads a public Deezer playlist into the game's Track shape.
 *
 * Deezer closed OAuth app registration, so there is no "log in with Deezer".
 * But the public API needs no auth and its playlist/tracks endpoint returns
 * `isrc` and `preview` inline — everything the game needs. The catch is the
 * playlist must be public; a private one comes back as an error body.
 */

interface DeezerTrack {
  id: number
  title: string
  artist?: { name?: string }
  album?: { cover_medium?: string; cover_big?: string; cover?: string }
  isrc?: string
}

interface GameTrack {
  id: string
  name: string
  artists: string[]
  albumArt: string
  isrc: string
}

const MAX_TRACKS = 500

/** Accepts a bare numeric id or any Deezer URL containing /playlist/{digits}. */
function parsePlaylistId(input: string): string | null {
  const s = input.trim()
  if (/^\d+$/.test(s)) return s
  const m = s.match(/playlist\/(\d+)/)
  return m ? m[1] : null
}

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get('input') ?? ''
  const id = parsePlaylistId(input)

  if (!id) {
    return NextResponse.json({ error: 'invalid_link' }, { status: 400 })
  }

  const collected: GameTrack[] = []
  const seenIsrc = new Set<string>()
  let playlistName = 'Deezer playlist'

  // Grab the playlist title (and surface a private/missing playlist early).
  try {
    const metaRes = await fetch(`https://api.deezer.com/playlist/${id}`, { cache: 'no-store' })
    const meta = await metaRes.json()
    if (meta?.error) {
      return NextResponse.json({ error: 'not_found_or_private' }, { status: 404 })
    }
    if (typeof meta?.title === 'string') playlistName = meta.title
  } catch {
    return NextResponse.json({ error: 'deezer_unreachable' }, { status: 502 })
  }

  let url: string | null = `https://api.deezer.com/playlist/${id}/tracks?limit=100`
  while (url && collected.length < MAX_TRACKS) {
    let data: { data?: DeezerTrack[]; next?: string; error?: unknown }
    try {
      const res: Response = await fetch(url, { cache: 'no-store' })
      data = await res.json()
    } catch {
      return NextResponse.json({ error: 'deezer_unreachable' }, { status: 502 })
    }
    if (data?.error) {
      return NextResponse.json({ error: 'not_found_or_private' }, { status: 404 })
    }

    for (const t of data.data ?? []) {
      const isrc = t.isrc?.trim()
      if (!isrc || seenIsrc.has(isrc)) continue // no ISRC -> no preview later
      seenIsrc.add(isrc)
      collected.push({
        id: String(t.id),
        name: t.title,
        artists: t.artist?.name ? [t.artist.name] : [],
        albumArt: t.album?.cover_medium ?? t.album?.cover_big ?? t.album?.cover ?? '',
        isrc,
      })
    }

    url = data.next ?? null
  }

  return NextResponse.json({ tracks: collected, playlistName })
}
