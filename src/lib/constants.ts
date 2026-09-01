export const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
].join(" ");

export const GUESS_PHASE_SECONDS = 30;
export const GUESS_OPEN_DELAY_MS = 15_000;
/** Reveal early when everyone has guessed — this many ms before the song ends. */
export const REVEAL_BEFORE_END_MS = 10_000;
/** Treat playback as finished within this many ms of track duration. */
export const SONG_END_PROGRESS_MS = 2000;
export const REVEAL_DELAY_MS = 5000;
export const REVEAL_MODAL_DISMISS_AFTER_NEXT_SONG_MS = 5000;
export const SPOTIFY_SYNC_INTERVAL_MS = 6000;
export const SPOTIFY_SYNC_FAST_MS = 3000;
export const SPOTIFY_HOT_ROOM_END_THRESHOLD_MS = 30_000;
export const CLIENT_FALLBACK_POLL_MS = 15000;
export const LOBBY_POLL_MS = 5000;
export const GAME_STATE_BROADCAST_MS = 1500;
export const PLAYING_DB_POLL_MS = 8000;
export const SYNC_STALE_THRESHOLD_MS = 8000;
export const PLAYBACK_CACHE_TTL_MS = 8000;
export const EMPTY_ROOM_GRACE_MS = 120_000;
export const HOST_RECONNECT_GRACE_MS = 30_000;
export const ROOM_SWEEPER_INTERVAL_MS = 60_000;

/** @deprecated Use SPOTIFY_SYNC_INTERVAL_MS */
export const POLL_INTERVAL_MS = SPOTIFY_SYNC_INTERVAL_MS;
export const CORRECT_GUESS_POINTS = 10;
export const SOLO_CORRECT_BONUS = 5;

export const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
