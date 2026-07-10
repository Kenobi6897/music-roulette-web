# Music Roulette — Build Log

## What This App Is
A live party game. One person hosts a room, 30-second song previews play from their phone (connected to a speaker). Everyone guesses whose Spotify/Apple Music library the song came from. Points are awarded on a sliding scale based on how fast you guess correctly.

- 3–8 players, 5 rounds (hardcoded for now, easy to make configurable)
- Multi-DSP: multiple correct answers if the same song appears in several players' libraries
- The host controls round start/reveal; all players see results on their own phone

## Tech Stack
- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **Firebase Firestore** — real-time room/game state synced across all devices
- **Spotify Web API** — OAuth + library fetch (ISRCs; `preview_url` is deprecated and null)
- **Deezer API** (keyless public API) — two uses: resolves a 30s preview MP3 from a track's ISRC at round start, and imports a public playlist as a library source for Deezer users
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
  api/spotify/library/route.ts      — Fetches all saved tracks (with ISRC) for authed user
  api/deezer/playlist/route.ts      — Imports a public Deezer playlist (keyless) -> Track[] with ISRC
  api/preview/route.ts              — ISRC -> 30s preview MP3 via Deezer (URL expires ~15min)
lib/
  firebase.ts                       — Firebase app init
  game.ts                           — All Firestore game logic (createRoom, joinRoom, startRound, etc.)
```

## Solo Test Mode
Open a room as `/room/XXXX?solo=1` to play alone:
- "Start Game" enables with a single player
- The 4-button guess grid is padded with stand-in names (`Alex`, `Sam`, ...), so the
  wrong-guess path is still reachable — you are always the correct answer
- The flag is remembered in `localStorage`, because the OAuth callback returns to
  `/room/{code}?pid=...` and would otherwise drop it. Clear it with `?solo=0`
- Real multiplayer games are unaffected: no padding, still requires 2+ players

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
  tracks: Track[]   — {id, name, artists, albumArt, isrc}, filtered to isrc !== null
```
Note: no preview URL is stored per-track. Deezer signs previews with a ~15 min expiry,
so `startRound` resolves one on demand and writes it into `currentRound_data.previewUrl`.

## Game Flow
1. Host enters name → Create Room → lands on `/room/XXXX`
2. Host connects a library: "Connect Spotify" (OAuth, auto-connects on return) OR "Use a public Deezer playlist" (paste link) → tracks saved to Firestore
3. Players join via code → each connects a library (Spotify or Deezer) → tracks saved
4. Host clicks "Start Game" (enabled once all players connected)
5. Round starts: a track is picked, its ISRC is resolved to a Deezer preview (retrying up to 8 candidates if some aren't on Deezer), host's audio plays, all players see album art + 4 name options
6. Players tap a name → points calculated (100pts minus 2pts per second elapsed). A 30s countdown bar runs on every phone
7. When the clip ends or all players have guessed, the answer lights up green (red if you were wrong) and points are shown for `RESULT_LINGER_SECONDS` (4s), then it auto-reveals. Host can "Skip to Reveal" early
8. Scoreboard shown → host clicks "Next Round"
9. After final round: "Game Over" + final scores + "Play Again" resets room (same players, no rejoin needed)

## Spotify Auth Notes
- OAuth Authorization Code Flow
- Scope: `user-library-read`
- Room code **and player id** are packed into the OAuth `state` param (base64url JSON). The callback redirects to `/room/{code}?pid={playerId}`, and the room page restores the id into `localStorage` before calling `getPlayerId()`, then strips the query param.
- This matters: `localStorage` does not reliably survive the Spotify round-trip. If it comes back empty, `getPlayerId()` mints a fresh id and the player is orphaned from their row in the room. See `warnings.md`.
- Tokens stored in httpOnly cookies (`spotify_access_token`, `spotify_refresh_token`)
- Before redirecting to Spotify, a `spotifyConnecting` flag is set in `localStorage`; on return, either that flag *or* the `?pid=` param triggers an automatic library fetch so the user doesn't click Connect twice
- A denied or failed auth now redirects back to the room with `?error=`, not to the home page
- No token refresh logic yet — token expires in ~1 hour

## Player Identity
- Player ID is a random string stored in `localStorage`, and carried through OAuth in the `state` param so it survives the redirect even if `localStorage` is lost
- `savePlayerTracks` refuses to write if the id isn't already a member of the room — a dot-path `updateDoc` would otherwise create a nameless "connected" ghost player
- `namedPlayers()` in `lib/game.ts` filters out any such ghosts left in existing room docs
- No login/auth — closing the browser and reopening generates a new ID, so the player would appear as a new person in the room

## What's Not Built Yet
- Apple Music (MusicKit JS) — needs $99 Apple Developer account
- Full-length tracks. The Web Playback SDK **cannot** do this — it doesn't run on mobile browsers, and the host is a phone. The mobile path is Spotify Connect (`/me/player/play`), which remote-controls the host's Spotify app. Requires Premium. See `warnings.md`.
- Token refresh (Spotify access token expires after 1 hour)
- Configurable round count in UI
- Server-authoritative round timing (today the host's browser drives the reveal; if they close it, the round stalls)
- Any auth/security beyond Firestore test mode
