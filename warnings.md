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

### ~30–40% of Spotify Tracks Have No Preview URL
Tracks without `preview_url` are silently filtered out of the game pool. This means a player's effective library for the game may be significantly smaller than their actual saved tracks.

**Fix (longer term):** Add Spotify Web Playback SDK for the host (requires Premium — user has it). Plays full tracks, eliminates the preview URL problem entirely.

### No Round Timer
Currently the host manually clicks "Reveal" after everyone has guessed (or at their discretion). There is no countdown timer.

**Fix:** Add a 30-second countdown using `startedAt` timestamp from the round data. Auto-trigger reveal when timer hits 0 or all players have guessed.

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

## Infrastructure

### Vercel Deployment URL
The production URL has a `-t1` suffix: `music-roulette-web-t1.vercel.app`
This is set as `NEXT_PUBLIC_BASE_URL` in Vercel env vars and must match the Spotify registered redirect URI exactly:
`https://music-roulette-web-t1.vercel.app/api/auth/spotify/callback`

If the Vercel URL ever changes, update both the env var and the Spotify dashboard redirect URI.

### No User Authentication
Players are identified by a random ID stored in `localStorage`. The ID survives page navigations and OAuth redirects within the same browser, but closing and reopening the browser generates a new ID — the player would appear as a new person in the room. Fine for a party game on a single session.
