'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  getPlayerId,
  setPlayerId,
  namedPlayers,
  savePlayerTracks,
  startRound,
  submitGuess,
  revealRound,
  resetRoom,
  subscribeRoom,
  ROUND_SECONDS,
  RoomState,
  Track,
} from '@/lib/game'

export default function RoomPage() {
  const { code } = useParams<{ code: string }>()
  const [room, setRoom] = useState<RoomState | null>(null)
  const [myId, setMyId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [guessed, setGuessed] = useState(false)
  const [solo, setSolo] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const audioRef = useRef<HTMLAudioElement>(null)
  const connectAttempted = useRef(false)
  const returnedFromAuth = useRef(false)
  const revealedForRound = useRef(-1)

  useEffect(() => {
    const url = new URL(window.location.href)

    // Restore the identity the OAuth callback handed back before touching
    // getPlayerId(), which would otherwise mint a new one.
    const pid = url.searchParams.get('pid')
    if (pid) {
      setPlayerId(pid)
      returnedFromAuth.current = true
    }
    if (url.searchParams.get('error')) {
      setError('Spotify connection was cancelled. Try again.')
    }
    if (pid || url.searchParams.get('error')) {
      url.searchParams.delete('pid')
      url.searchParams.delete('error')
      window.history.replaceState({}, '', url.pathname + url.search)
    }

    if (localStorage.getItem('spotifyConnecting')) {
      localStorage.removeItem('spotifyConnecting')
      returnedFromAuth.current = true
    }

    // ?solo=1 enables single-player testing. It has to be remembered rather than
    // read straight off the URL, because the OAuth callback returns to
    // /room/{code}?pid=... and drops any other query params. ?solo=0 clears it.
    const soloParam = url.searchParams.get('solo')
    if (soloParam === '1') localStorage.setItem('soloMode', '1')
    if (soloParam === '0') localStorage.removeItem('soloMode')
    setSolo(localStorage.getItem('soloMode') === '1')

    setMyId(getPlayerId())
    const unsub = subscribeRoom(code, setRoom)
    return unsub
  }, [code])

  // Auto-connect Spotify if we just returned from OAuth
  useEffect(() => {
    if (!room || !myId || connectAttempted.current) return
    if (!returnedFromAuth.current) return
    if (!room.players[myId] || room.players[myId].spotifyConnected) return
    connectAttempted.current = true
    connectSpotify()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, myId])

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

  // Drive the countdown. Only ticks during a round.
  useEffect(() => {
    if (room?.status !== 'round_active') return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [room?.status, room?.currentRound])

  // Auto-reveal once the clip ends or everyone has guessed. Only the host writes,
  // and only once per round; revealRound() is transactional as a further guard.
  useEffect(() => {
    if (!room || !myId || room.status !== 'round_active') return
    if (myId !== room.hostId) return
    if (revealedForRound.current === room.currentRound) return

    const startedAt = room.currentRound_data?.startedAt
    if (!startedAt) return

    const timeUp = now - startedAt >= ROUND_SECONDS * 1000
    const everyoneGuessed = Object.entries(room.players)
      .filter(([, p]) => Boolean(p?.name))
      .every(([pid]) => room.guesses?.[pid])

    if (timeUp || everyoneGuessed) {
      revealedForRound.current = room.currentRound
      revealRound(code).catch(() => {
        revealedForRound.current = -1 // let it retry on the next tick
      })
    }
  }, [room, myId, now, code])

  async function connectSpotify() {
    setConnecting(true)
    setError('')
    try {
      const res = await fetch('/api/spotify/library')

      if (res.status === 401) {
        localStorage.setItem('spotifyConnecting', 'true')
        const params = new URLSearchParams({ returnTo: code, playerId: getPlayerId() })
        window.location.href = `/api/auth/spotify?${params.toString()}`
        return
      }
      if (!res.ok) {
        setError('Could not read your Spotify library. Try again.')
        return
      }

      const data = await res.json()
      const tracks: Track[] = (data.tracks ?? []).filter((t: Track) => t.isrc)
      if (tracks.length === 0) {
        setError('No usable songs found in your Spotify library.')
        return
      }

      await savePlayerTracks(code, tracks)
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'player_not_in_room'
          ? 'You are no longer in this room. Go back and rejoin with the code.'
          : 'Something went wrong connecting Spotify.'
      )
    } finally {
      setConnecting(false)
    }
  }

  async function handleStartRound() {
    if (!room || starting) return
    setStarting(true)
    setError('')
    try {
      await startRound(code, room, { solo })
    } catch (e) {
      const reason = e instanceof Error ? e.message : ''
      setError(
        reason === 'no_preview_found'
          ? 'Could not find a playable clip for any song we tried. Tap to try again.'
          : reason === 'no_tracks'
            ? 'No songs available to play.'
            : 'Could not start the round.'
      )
    } finally {
      setStarting(false)
    }
  }

  async function handleGuess(option: string) {
    if (guessed || !room) return
    if (room.currentRound_data && Date.now() - room.currentRound_data.startedAt >= ROUND_SECONDS * 1000) return
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

  if (myId && !room.players[myId]) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-white p-6">
        <p className="text-center text-zinc-300">
          You are not in room {code}. Rejoin with the code to get back in.
        </p>
        <a href="/" className="bg-white text-black font-semibold px-6 py-3 rounded-xl">
          Back to home
        </a>
      </main>
    )
  }

  const isHost = myId === room.hostId
  const me = room.players[myId]
  const players = namedPlayers(room)
  const round = room.currentRound_data
  const myGuess = room.guesses?.[myId]
  const allGuessed = players.every(([pid]) => room.guesses?.[pid])
  const secondsLeft = round
    ? Math.max(0, Math.ceil(ROUND_SECONDS - (now - round.startedAt) / 1000))
    : 0
  const timeUp = secondsLeft <= 0

  return (
    <main className="flex min-h-screen flex-col items-center bg-black text-white p-6">
      {/* Header */}
      <div className="w-full max-w-sm flex justify-between items-center mb-6">
        <div>
          <p className="text-xs text-zinc-500 tracking-widest">Room Code</p>
          <p className="text-2xl font-bold tracking-widest">{code}</p>
        </div>
        {(room.status === 'round_active' || room.status === 'reveal') && (
          <span className="text-zinc-400 text-sm">
            Round {room.currentRound}/{room.totalRounds}
          </span>
        )}
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
                  <span className="font-medium">
                    {p.name}{' '}
                    {pid === room.hostId && <span className="text-xs text-zinc-500">host</span>}
                  </span>
                  <span className={`text-xs ${p.spotifyConnected ? 'text-green-400' : 'text-zinc-600'}`}>
                    {p.spotifyConnected ? 'Spotify ✓' : 'Not connected'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <p className="w-full text-center text-sm text-red-400">{error}</p>
          )}

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
              onClick={handleStartRound}
              disabled={
                starting ||
                players.length < (solo ? 1 : 2) ||
                !players.every(([, p]) => p.spotifyConnected)
              }
              className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200 disabled:opacity-40"
            >
              {starting ? 'Finding a song...' : 'Start Game'}
            </button>
          )}

          {isHost && (
            <p className="text-zinc-600 text-xs text-center">
              All players must connect Spotify before starting
            </p>
          )}

          {solo && (
            <p className="text-amber-400/80 text-xs text-center">
              Solo test mode — you can start alone, and the other three names are
              stand-ins. Open <span className="font-mono">?solo=0</span> to turn off.
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

          {/* Countdown */}
          <div className="w-full">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-zinc-400 text-sm">Whose library is this from?</span>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  secondsLeft <= 5 ? 'text-red-400' : 'text-zinc-300'
                }`}
              >
                {secondsLeft}s
              </span>
            </div>
            <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-[width] duration-200 ease-linear ${
                  secondsLeft <= 5 ? 'bg-red-400' : 'bg-green-500'
                }`}
                style={{ width: `${(secondsLeft / ROUND_SECONDS) * 100}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
            {round.options.map((option) => {
              const isMyGuess = myGuess?.guess === option
              const isCorrect = guessed && option === round.ownerName
              return (
                <button
                  key={option}
                  onClick={() => handleGuess(option)}
                  disabled={guessed || timeUp}
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

          {guessed ? (
            <p className="text-zinc-400 text-sm">
              {myGuess?.correct ? `+${myGuess.points} pts` : 'Wrong — no points'}
            </p>
          ) : (
            timeUp && <p className="text-zinc-400 text-sm">Time&apos;s up</p>
          )}

          {/* The round reveals itself when the clip ends or everyone has guessed.
              This stays as a manual override for the host. */}
          {isHost && !allGuessed && !timeUp && (
            <button
              onClick={() => revealRound(code)}
              className="w-full bg-zinc-800 text-zinc-300 font-medium py-2.5 rounded-xl hover:bg-zinc-700 mt-2 text-sm"
            >
              Skip to Reveal
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

          {error && <p className="text-center text-sm text-red-400">{error}</p>}

          {isHost && (
            <button
              onClick={handleStartRound}
              disabled={starting}
              className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200 disabled:opacity-40"
            >
              {starting ? 'Finding a song...' : 'Next Round'}
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
          {isHost && (
            <button
              onClick={() => resetRoom(code, room)}
              className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200"
            >
              Play Again
            </button>
          )}
          {!isHost && (
            <p className="text-zinc-500 text-sm">Waiting for host to start a new game...</p>
          )}
        </div>
      )}
    </main>
  )
}
