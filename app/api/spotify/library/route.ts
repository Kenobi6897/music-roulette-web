import { NextRequest, NextResponse } from 'next/server'

export interface SpotifyTrack {
  id: string
  name: string
  artists: string[]
  albumArt: string
  previewUrl: string | null
}

async function fetchAllSavedTracks(accessToken: string): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = []
  let url: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50'

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) break

    const data = await res.json()

    for (const item of data.items) {
      const track = item.track
      if (!track) continue
      tracks.push({
        id: track.id,
        name: track.name,
        artists: track.artists.map((a: { name: string }) => a.name),
        albumArt: track.album.images[0]?.url ?? '',
        previewUrl: track.preview_url,
      })
    }

    url = data.next
  }

  return tracks
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('spotify_access_token')?.value

  if (!accessToken) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const tracks = await fetchAllSavedTracks(accessToken)

  return NextResponse.json({ tracks, total: tracks.length })
}
