# Warnings & Things That Need Fixing

## URGENT (time-sensitive)

### Firestore Test Mode Expires ~10 August 2026
Firestore was created in **test mode** which allows all reads/writes with no auth for 30 days.
After that, all Firestore operations will fail silently.

**Fix:** Go to Firebase Console → Firestore → Rules and replace the test rule with:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomCode} {
      allow read, write: if true;  // tighten this later
    }
    match /rooms/{roomCode}/tracks/{playerId} {
      allow read, write: if true;
    }
  }
}
```
This is still open but at least scoped to the rooms collection. Proper auth rules can come later.

---

## Known Limitations

### Spotify Token Expires After 1 Hour
The `spotify_access_token` cookie expires in ~1 hour. After that, `/api/spotify/library` returns 401 and players would need to reconnect Spotify.

**Fix needed:** Implement token refresh in `/api/spotify/library/route.ts` using the `spotify_refresh_token` cookie and Spotify's `/api/token` endpoint with `grant_type=refresh_token`.

### Audio Comes From Deezer, Not Spotify — Because Spotify Previews Are Dead
Spotify deprecated `preview_url` and stopped returning it to apps registered after Nov 2024. **This app's client ID is not grandfathered in** — `preview_url` is `null` for every track, which is why the library returned zero playable songs.

Spotify is now used only to read the library. Audio is resolved separately:
- `/v1/me/tracks` supplies `external_ids.isrc` per track (confirmed in Spotify's schema)
- ISRC identifies the same recording across every DSP
- `/api/preview?isrc=` looks it up on Deezer (`api.deezer.com/track/isrc:{isrc}`) and returns a 30s MP3

**Two traps in the Deezer API:**
1. **Preview URLs are signed and expire ~15 minutes after issue** (`hdnea=exp=`). They must be resolved at round start and used immediately. *Never persist them to Firestore* — a preview stored at connect time will be dead by the time it plays.
2. **A miss returns HTTP 200 with an `error` body**, not a 404. The status code alone is not enough; the body must be inspected.

Not every ISRC is on Deezer, so `startRound` walks a shuffled pool of up to 8 candidates until one resolves. If all 8 miss, the host sees an error and can retry. Real-world coverage against actual libraries hasn't been measured yet — if misses turn out to be common, raise `MAX_PREVIEW_ATTEMPTS` or add an iTunes Search fallback (free, no auth, but matches fuzzily on name+artist rather than exactly on ISRC).

**Before any public launch:** check Deezer's API terms. The endpoint is public and unauthenticated, which is fine for a private party game, but commercial use likely needs their agreement.

### The Web Playback SDK Is NOT the Fix (previous note was wrong)
Earlier versions of these docs recommended the Spotify Web Playback SDK. **It does not run on mobile browsers**, and this game's host is a phone plugged into a speaker, so it cannot work here.

The mobile-viable Spotify path, if full-length tracks are ever wanted, is **Spotify Connect**: `PUT /me/player/play` remote-controls the host's actual Spotify app. Requires Premium, an already-active device, and the `user-modify-playback-state` + `user-read-playback-state` scopes.

### Round Timer — Host Drives It
Rounds auto-reveal after `ROUND_SECONDS` (30s, matching the clip) or as soon as every player has guessed. The countdown is derived from `currentRound_data.startedAt`, so all devices agree without extra writes.

After the round ends the reveal is held for `RESULT_LINGER_SECONDS` so players can read the answer and their points. The effect that schedules it deliberately returns no cleanup — it re-runs on every countdown tick, and clearing the timeout each time would cancel the reveal before it ever fired.

**Only the host writes the reveal.** If the host closes their browser mid-round, the round will not advance — the other players stall. Acceptable for a party game where the host holds the speaker, but it is a single point of failure. A Cloud Function on a timer would be the proper fix.

`revealRound()` runs in a Firestore transaction and no-ops unless status is still `round_active`. This matters: the timer, the all-guessed check, and the manual "Skip to Reveal" button can race, and without the guard each player's points would be added to their score more than once.

Note the countdown trusts client clocks. A player whose device clock is badly skewed sees a wrong timer; scoring uses their own `Date.now()` against `startedAt`, so a skewed clock could award odd point values. Not worth fixing for a party game, but it is why `submitGuess` rejects guesses arriving after the clip ends.

### Apple Music Not Implemented
Requires $99/year Apple Developer Program membership to create MusicKit identifiers and private keys.

**When adding:**
1. Create MusicKit identifier in Apple Developer portal
2. Create + download private key (.p8 file)
3. Note Team ID and Key ID
4. Build `/api/auth/apple/route.ts` to sign a JWT with the private key
5. Add MusicKit JS to the client

### /lobby Page Still Exists
`/lobby` is a debug page that shows all of a user's Spotify tracks. It's not linked in the normal game flow but is still accessible at `/lobby`. Useful for debugging Spotify auth. Remove or gate it before any public launch.

---

### Always Start From the Canonical URL
Fixed, but worth understanding. Player identity lives in `localStorage`, which is **per-origin**. Vercel serves the same app on several hostnames (`music-roulette-web.vercel.app`, per-deployment preview URLs, and the canonical `-t1` one). The OAuth callback always redirects to `NEXT_PUBLIC_BASE_URL` — the `-t1` origin — because that's the only redirect URI Spotify will accept.

So if a player loads the game on any *other* origin, the Spotify round-trip lands them on `-t1` with an empty `localStorage`. The old code then minted a new player id, which caused:
- a nameless row with a green "Spotify ✓" (a dot-path `updateDoc` creating `players.<newId>`)
- the real player row stuck on "Not connected"
- "Start Game" vanishing for the host, because `myId === hostId` was no longer true

The id now rides through OAuth in the `state` param and is restored on return, so this survives an origin change. `savePlayerTracks` also refuses to write for a non-member id. **Still, share the `-t1` URL** — starting elsewhere means an origin switch mid-game.

---

## Infrastructure

### Vercel Deployment URL
The production URL has a `-t1` suffix: `music-roulette-web-t1.vercel.app`
This is set as `NEXT_PUBLIC_BASE_URL` in Vercel env vars and must match the Spotify registered redirect URI exactly:
`https://music-roulette-web-t1.vercel.app/api/auth/spotify/callback`

If the Vercel URL ever changes, update both the env var and the Spotify dashboard redirect URI.

### No User Authentication
Players are identified by a random ID stored in `localStorage`. The ID survives page navigations and OAuth redirects within the same browser, but closing and reopening the browser generates a new ID — the player would appear as a new person in the room. Fine for a party game on a single session.
