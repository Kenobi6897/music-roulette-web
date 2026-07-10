'use client'

import { useEffect, useState } from 'react'

interface Track {
  id: string
  name: string
  artists: string[]
  albumArt: string
  previewUrl: string | null
}

export default function LobbyPage() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/spotify/library')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setTracks(data.tracks)
          setTotal(data.total)
        }
      })
      .catch(() => setError('Failed to fetch library'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center bg-black text-white p-8">
      <h1 className="text-4xl font-bold mb-2">Music Roulette</h1>
      <p className="text-green-400 mb-8">Spotify connected ✓</p>

      {loading && <p className="text-zinc-400">Loading your library...</p>}

      {error && <p className="text-red-400">Error: {error}</p>}

      {total !== null && (
        <p className="text-zinc-300 mb-6 text-lg">
          {total} saved tracks found
        </p>
      )}

      <ul className="w-full max-w-md space-y-3">
        {tracks.slice(0, 20).map((track) => (
          <li key={track.id} className="flex items-center gap-3">
            {track.albumArt && (
              <img
                src={track.albumArt}
                alt={track.name}
                className="w-12 h-12 rounded object-cover shrink-0"
              />
            )}
            <div className="min-w-0">
              <p className="font-medium truncate">{track.name}</p>
              <p className="text-zinc-400 text-sm truncate">
                {track.artists.join(', ')}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
