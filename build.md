# Music Roulette — Build Log

## What This App Is
A live party game. One person hosts a room, 30-second song previews play from their phone (connected to a speaker). Everyone guesses whose Spotify/Apple Music library the song came from. Points are awarded on a sliding scale based on how fast you guess correctly.

- 3–8 players, 5 rounds (hardcoded for now, easy to make configurable)
- Multi-DSP: multiple correct answers if the same song appears in several players' libraries
- The host controls round start/reveal; all players see results on their own phone

## Tech Stack
- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **Firebase Firestore** — real-time room/game state synced across all devices
- **Spotify Web API** — OAuth + library fetch (30s preview URLs)
- **Vercel** — hosting (HTTPS required for MusicKit JS later)
- Audio: HTML5 `<audio>` on the host's device playing `preview_url`

## Live URLs
- Production: `https://music-roulette-web-t1.vercel.app`
- GitHub: `https://github.com/Kenobi6897/music-roulette-web`

## Environment Variables (set in Vercel + .env.local)
```
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
NEXT_PUBLIC_BASE_URL=https://music-roulette-web-t1.vercel.app
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

## Key Files
```
app/
  page.tsx                          — Home: create room / join room
  lobby/page.tsx                    — Debug page: shows all Spotify tracks (not in main flow)
  room/[code]/page.tsx              — Main game screen (waiting, round, reveal, finished)
  api/auth/spotify/route.ts         — Redirects to Spotify OAuth (passes room code via state param)
  api/auth/spotify/callback/route.ts — Exchanges code for tokens, redirects back to room
  api/spotify/library/route.ts      — Fetches all saved tracks for authed user
lib/
  firebase.ts                       — Firebase app init
  game.ts                           — All Firestore game logic (createRoom, joinRoom, startRound, etc.)
```

## Firestore Data Model
```
rooms/{roomCode}
  status: 'waiting' | 'round_active' | 'reveal' | 'finished'
  hostId: string
  currentRound: number
  totalRounds: number
  players: { [playerId]: { name, score, spotifyConnected } }
  currentRound_data: { previewUrl, songName, artists, albumArt, ownerId, ownerName, options, startedAt }
  guesses: { [playerId]: { guess, correct, points } }

rooms/{roomCode}/tracks/{playerId}
  tracks: Track[]   — filtered to previewUrl !== null
```

## Game Flow
1. Host enters name → Create Room → lands on `/room/XXXX`
2. Host clicks "Connect Spotify" → OAuth → auto-connects on return → tracks saved to Firestore
3. Players join via code → each connects Spotify → tracks saved
4. Host clicks "Start Game" (enabled once all players connected)
5. Round starts: host's audio plays, all players see album art + 4 name options
6. Players tap a name → points calculated (100pts minus 2pts per second elapsed)
7. Host clicks "Reveal" (or it auto-reveals when all have guessed)
8. Scoreboard shown → host clicks "Next Round"
9. After final round: "Game Over" + final scores + "Play Again" resets room (same players, no rejoin needed)

## Spotify Auth Notes
- OAuth Authorization Code Flow
- Scope: `user-library-read`
- Room code passed through OAuth `state` param so callback knows where to redirect after auth
- Tokens stored in httpOnly cookies (`spotify_access_token`, `spotify_refresh_token`)
- Before redirecting to Spotify, a `spotifyConnecting` flag is set in `localStorage`; on return to the room page, this flag triggers an automatic library fetch so the user doesn't need to click Connect a second time
- No token refresh logic yet — token expires in ~1 hour

## Player Identity
- Player ID is a random string stored in `localStorage` (survives page navigations and OAuth redirects)
- No login/auth — closing the browser and reopening generates a new ID, so the player would appear as a new person in the room

## What's Not Built Yet
- Apple Music (MusicKit JS) — needs $99 Apple Developer account
- Spotify Web Playback SDK (full track, not just 30s preview) — user has Premium
- Token refresh (Spotify access token expires after 1 hour)
- Round timer / auto-reveal (currently host manually triggers reveal)
- Configurable round count in UI
- Any auth/security beyond Firestore test mode
