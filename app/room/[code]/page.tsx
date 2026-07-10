'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  getPlayerId,
  savePlayerTracks,
  startRound,
  submitGuess,
  revealRound,
  nextRound,
  subscribeRoom,
  RoomState,
  Track,
} from '@/lib/game'

export default function RoomPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [room, setRoom] = useState<RoomState | null>(null)
  const [myId, setMyId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [guessed, setGuessed] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    setMyId(getPlayerId())
    const unsub = subscribeRoom(code, setRoom)
    return unsub
  }, [code])

  // Play/stop audio when round changes
  useEffect(() => {
    if (!room) return
    if (room.status === 'round_active' && room.currentRound_data?.previewUrl) {
      audioRef.current?.load()
      audioRef.current?.play().catch(() => {})
      setGuessed(false)
    } else {
      audioRef.current?.pause()
    }
  }, [room?.status, room?.currentRound])

  async function connectSpotify() {
    setConnecting(true)
    // Fetch library then redirect back
    const res = await fetch('/api/spotify/library')
    if (res.status === 401) {
      document.cookie = `returnToRoom=${code}; path=/; max-age=600`
      window.location.href = '/api/auth/spotify'
      return
    }
    const data = await res.json()
    const tracks: Track[] = (data.tracks ?? []).filter((t: Track) => t.previewUrl)
    await savePlayerTracks(code, tracks)
    setConnecting(false)
  }

  async function handleGuess(option: string) {
    if (guessed || !room) return
    setGuessed(true)
    await submitGuess(code, option, room)
  }

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-zinc-400">Loading room...</p>
      </main>
    )
  }

  const isHost = myId === room.hostId
  const me = room.players[myId]
  const players = Object.entries(room.players)
  const round = room.currentRound_data
  const myGuess = room.guesses?.[myId]
  const allGuessed = players.every(([pid]) => room.guesses?.[pid])

  return (
    <main className="flex min-h-screen flex-col items-center bg-black text-white p-6">
      {/* Header */}
      <div className="w-full max-w-sm flex justify-between items-center mb-6">
        <div>
          <span className="text-2xl font-bold tracking-widest">{code}</span>
          <span className="text-zinc-500 text-sm ml-2">room</span>
        </div>
        <span className="text-zinc-400 text-sm">
          Round {room.currentRound}/{room.totalRounds}
        </span>
      </div>

      {/* Audio (host only) */}
      {isHost && round?.previewUrl && (
        <audio ref={audioRef} src={round.previewUrl} className="hidden" />
      )}

      {/* WAITING */}
      {room.status === 'waiting' && (
        <div className="w-full max-w-sm flex flex-col items-center gap-6 mt-8">
          <div className="w-full bg-zinc-900 rounded-2xl p-5">
            <p className="text-zinc-400 text-sm mb-3">Players ({players.length})</p>
            <ul className="space-y-2">
              {players.map(([pid, p]) => (
                <li key={pid} className="flex items-center justify-between">
                  <span className="font-medium">{p.name} {pid === room.hostId && <span className="text-xs text-zinc-500">host</span>}</span>
                  <span className={`text-xs ${p.spotifyConnected ? 'text-green-400' : 'text-zinc-600'}`}>
                    {p.spotifyConnected ? 'Spotify ✓' : 'Not connected'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {!me?.spotifyConnected && (
            <button
              onClick={connectSpotify}
              disabled={connecting}
              className="w-full bg-green-500 text-black font-semibold py-3 rounded-xl hover:bg-green-400 disabled:opacity-50"
            >
              {connecting ? 'Connecting...' : 'Connect Spotify'}
            </button>
          )}

          {isHost && (
            <button
              onClick={() => startRound(code, room)}
              disabled={players.length < 2 || !players.every(([, p]) => p.spotifyConnected)}
              className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200 disabled:opacity-40"
            >
              Start Game
            </button>
          )}

          {isHost && (
            <p className="text-zinc-600 text-xs text-center">
              All players must connect Spotify before starting
            </p>
          )}
        </div>
      )}

      {/* ROUND ACTIVE */}
      {room.status === 'round_active' && round && (
        <div className="w-full max-w-sm flex flex-col items-center gap-5 mt-4">
          <img
            src={round.albumArt}
            alt="Album art"
            className="w-48 h-48 rounded-2xl object-cover shadow-lg"
          />
          <div className="text-center">
            <p className="font-semibold text-lg">{round.songName}</p>
            <p className="text-zinc-400 text-sm">{round.artists.join(', ')}</p>
          </div>

          <p className="text-zinc-400 text-sm">Whose library is this from?</p>

          <div className="grid grid-cols-2 gap-3 w-full">
            {round.options.map((option) => {
              const isMyGuess = myGuess?.guess === option
              const isCorrect = guessed && option === round.ownerName
              return (
                <button
                  key={option}
                  onClick={() => handleGuess(option)}
                  disabled={guessed}
                  className={`py-4 rounded-2xl font-medium text-sm transition-all
                    ${isCorrect ? 'bg-green-500 text-black' : ''}
                    ${isMyGuess && !isCorrect ? 'bg-red-500 text-white' : ''}
                    ${!guessed ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : ''}
                    ${guessed && !isMyGuess && !isCorrect ? 'bg-zinc-900 text-zinc-600' : ''}
                  `}
                >
                  {option}
                </button>
              )
            })}
          </div>

          {guessed && (
            <p className="text-zinc-400 text-sm">
              {myGuess?.correct ? `+${myGuess.points} pts` : 'Wrong — no points'}
            </p>
          )}

          {isHost && allGuessed && (
            <button
              onClick={() => revealRound(code, room)}
              className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200 mt-2"
            >
              Reveal
            </button>
          )}
        </div>
      )}

      {/* REVEAL */}
      {room.status === 'reveal' && round && (
        <div className="w-full max-w-sm flex flex-col items-center gap-5 mt-4">
          <p className="text-zinc-400">The song was from</p>
          <p className="text-3xl font-bold">{round.ownerName}</p>
          <img src={round.albumArt} alt="" className="w-32 h-32 rounded-xl object-cover" />
          <p className="font-medium">{round.songName}</p>

          <div className="w-full bg-zinc-900 rounded-2xl p-4 space-y-2">
            {players
              .sort(([, a], [, b]) => b.score - a.score)
              .map(([pid, p]) => (
                <div key={pid} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-zinc-300">{p.score} pts</span>
                </div>
              ))}
          </div>

          {isHost && (
            <button
              onClick={() => nextRound(code, room)}
              className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200"
            >
              Next Round
            </button>
          )}
        </div>
      )}

      {/* FINISHED */}
      {room.status === 'finished' && (
        <div className="w-full max-w-sm flex flex-col items-center gap-5 mt-8">
          <p className="text-3xl font-bold">Game Over</p>
          <div className="w-full bg-zinc-900 rounded-2xl p-4 space-y-3">
            {players
              .sort(([, a], [, b]) => b.score - a.score)
              .map(([pid, p], i) => (
                <div key={pid} className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500 w-5">{i + 1}</span>
                    <span className="font-medium">{p.name}</span>
                  </div>
                  <span className="text-zinc-300 font-semibold">{p.score} pts</span>
                </div>
              ))}
          </div>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200"
          >
            Play Again
          </button>
        </div>
      )}
    </main>
  )
}
