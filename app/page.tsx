'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRoom, joinRoom } from '@/lib/game'

export default function Home() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const rounds = 5
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!name.trim()) return setError('Enter your name')
    setLoading(true)
    const roomCode = await createRoom(name.trim(), rounds)
    router.push(`/room/${roomCode}`)
  }

  async function handleJoin() {
    if (!name.trim()) return setError('Enter your name')
    if (!code.trim()) return setError('Enter a room code')
    setLoading(true)
    const ok = await joinRoom(code.trim().toUpperCase(), name.trim())
    if (!ok) {
      setError('Room not found')
      setLoading(false)
      return
    }
    router.push(`/room/${code.trim().toUpperCase()}`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-8">
      <h1 className="text-5xl font-bold mb-2 tracking-tight">Music Roulette</h1>
      <p className="text-zinc-400 mb-10 text-center">Guess whose song is playing</p>

      <div className="w-full max-w-sm">
        <div className="flex mb-6 rounded-xl overflow-hidden border border-zinc-800">
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'create' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
            onClick={() => { setTab('create'); setError('') }}
          >
            Create Room
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'join' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
            onClick={() => { setTab('join'); setError('') }}
          >
            Join Room
          </button>
        </div>

        <div className="space-y-4">
          <input
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {tab === 'join' && (
            <input
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 uppercase tracking-widest focus:outline-none focus:border-zinc-400"
              placeholder="Room code"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          )}

{error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={tab === 'create' ? handleCreate : handleJoin}
            disabled={loading}
            className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : tab === 'create' ? 'Create Room' : 'Join Room'}
          </button>
        </div>
      </div>
    </main>
  )
}
