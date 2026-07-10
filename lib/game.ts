import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'

export interface Track {
  id: string
  name: string
  artists: string[]
  albumArt: string
  previewUrl: string
}

export interface Player {
  name: string
  score: number
  spotifyConnected: boolean
}

export interface Round {
  previewUrl: string
  songName: string
  artists: string[]
  albumArt: string
  ownerId: string
  ownerName: string
  options: string[]
  startedAt: number
}

export interface Guess {
  guess: string
  correct: boolean
  points: number
}

export interface RoomState {
  status: 'waiting' | 'round_active' | 'reveal' | 'finished'
  hostId: string
  currentRound: number
  totalRounds: number
  players: Record<string, Player>
  currentRound_data: Round | null
  guesses: Record<string, Guess>
}

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function getPlayerId(): string {
  let id = localStorage.getItem('playerId')
  if (!id) {
    id = Math.random().toString(36).slice(2, 10)
    localStorage.setItem('playerId', id)
  }
  return id
}

/**
 * Restores an identity handed back through the OAuth `state` param. localStorage
 * is not guaranteed to survive the Spotify round-trip: if the browser lands back
 * on a different origin than it left from, it reads as empty and getPlayerId()
 * would mint a new id, orphaning the player from their row in the room.
 */
export function setPlayerId(id: string): void {
  localStorage.setItem('playerId', id)
}

/** Players with a name — filters out any rows orphaned by the id bug above. */
export function namedPlayers(room: RoomState): [string, Player][] {
  return Object.entries(room.players).filter(([, p]) => Boolean(p?.name))
}

export async function createRoom(hostName: string, totalRounds: number): Promise<string> {
  const code = randomCode()
  const hostId = getPlayerId()

  await setDoc(doc(db, 'rooms', code), {
    status: 'waiting',
    hostId,
    currentRound: 0,
    totalRounds,
    players: {
      [hostId]: { name: hostName, score: 0, spotifyConnected: false },
    },
    currentRound_data: null,
    guesses: {},
    createdAt: serverTimestamp(),
  })

  return code
}

export async function joinRoom(code: string, playerName: string): Promise<boolean> {
  const playerId = getPlayerId()
  const ref = doc(db, 'rooms', code)
  const snap = await getDoc(ref)

  if (!snap.exists()) return false

  await updateDoc(ref, {
    [`players.${playerId}`]: { name: playerName, score: 0, spotifyConnected: false },
  })

  return true
}

export async function savePlayerTracks(code: string, tracks: Track[]): Promise<void> {
  const playerId = getPlayerId()

  // A dot-path updateDoc silently creates players.<id> if it doesn't exist, so an
  // unrecognised id would add a nameless "connected" ghost to the room. Refuse.
  const snap = await getDoc(doc(db, 'rooms', code))
  if (!snap.exists()) throw new Error('room_not_found')
  if (!(snap.data() as RoomState).players?.[playerId]) throw new Error('player_not_in_room')

  await setDoc(doc(db, 'rooms', code, 'tracks', playerId), { tracks })
  await updateDoc(doc(db, 'rooms', code), {
    [`players.${playerId}.spotifyConnected`]: true,
  })
}

export async function startRound(code: string, room: RoomState): Promise<void> {
  const allTracksSnaps = await Promise.all(
    Object.keys(room.players).map((pid) => getDoc(doc(db, 'rooms', code, 'tracks', pid)))
  )

  const pool: { track: Track; ownerId: string }[] = []
  allTracksSnaps.forEach((snap) => {
    if (snap.exists()) {
      const pid = snap.id
      const tracks: Track[] = snap.data().tracks ?? []
      tracks.forEach((t) => pool.push({ track: t, ownerId: pid }))
    }
  })

  if (pool.length === 0) return

  const pick = pool[Math.floor(Math.random() * pool.length)]
  const playerNames = namedPlayers(room).map(([id, p]) => ({ id, name: p.name }))
  const ownerName = room.players[pick.ownerId]?.name ?? 'Unknown'

  const options = [ownerName]
  const others = playerNames.filter((p) => p.id !== pick.ownerId).map((p) => p.name)
  const shuffled = others.sort(() => Math.random() - 0.5).slice(0, 3)
  options.push(...shuffled)
  options.sort(() => Math.random() - 0.5)

  const nextRound = room.currentRound + 1

  await updateDoc(doc(db, 'rooms', code), {
    status: 'round_active',
    currentRound: nextRound,
    guesses: {},
    currentRound_data: {
      previewUrl: pick.track.previewUrl,
      songName: pick.track.name,
      artists: pick.track.artists,
      albumArt: pick.track.albumArt,
      ownerId: pick.ownerId,
      ownerName,
      options,
      startedAt: Date.now(),
    },
  })
}

export async function submitGuess(code: string, guess: string, room: RoomState): Promise<void> {
  const playerId = getPlayerId()
  const round = room.currentRound_data
  if (!round) return

  const correct = guess === round.ownerName
  const elapsed = (Date.now() - round.startedAt) / 1000
  const points = correct ? Math.max(10, Math.round(100 - elapsed * 2)) : 0

  await updateDoc(doc(db, 'rooms', code), {
    [`guesses.${playerId}`]: { guess, correct, points },
  })
}

export async function revealRound(code: string, room: RoomState): Promise<void> {
  const scoreUpdates: Record<string, number> = {}
  Object.entries(room.guesses).forEach(([pid, g]) => {
    scoreUpdates[`players.${pid}.score`] =
      (room.players[pid]?.score ?? 0) + g.points
  })

  const isLastRound = room.currentRound >= room.totalRounds

  await updateDoc(doc(db, 'rooms', code), {
    status: isLastRound ? 'finished' : 'reveal',
    ...scoreUpdates,
  })
}

export async function nextRound(code: string, room: RoomState): Promise<void> {
  await startRound(code, room)
}

export async function resetRoom(code: string, room: RoomState): Promise<void> {
  const resetScores: Record<string, number> = {}
  Object.keys(room.players).forEach((pid) => {
    resetScores[`players.${pid}.score`] = 0
  })

  await updateDoc(doc(db, 'rooms', code), {
    status: 'waiting',
    currentRound: 0,
    guesses: {},
    currentRound_data: null,
    ...resetScores,
  })
}

export function subscribeRoom(code: string, cb: (room: RoomState) => void): Unsubscribe {
  return onSnapshot(doc(db, 'rooms', code), (snap) => {
    if (snap.exists()) cb(snap.data() as RoomState)
  })
}
