import { PLAYBACK_CACHE_TTL_MS } from "@/lib/constants";
import type { SpotifyPlayback } from "@/lib/spotify";

export type CachedLiveNowPlaying = {
  spotifyTrackId: string;
  trackUri: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
};

type RoomPlaybackCache = {
  playback: SpotifyPlayback | null;
  liveNowPlaying: CachedLiveNowPlaying | null;
  fetchedAt: number;
  rateLimitedUntil: number;
};

const cacheByRoomId = new Map<string, RoomPlaybackCache>();

export function nowPlayingFromPlayback(
  playback: SpotifyPlayback | null,
): CachedLiveNowPlaying | null {
  if (!playback?.item) {
    return null;
  }

  return {
    spotifyTrackId: playback.item.id,
    trackUri: playback.item.uri,
    trackName: playback.item.name,
    artistName: playback.item.artists.map((artist) => artist.name).join(", "),
    albumArtUrl: playback.item.album.images[0]?.url ?? null,
    progressMs: playback.progress_ms,
    durationMs: playback.item.duration_ms,
    isPlaying: playback.is_playing,
  };
}

function getOrCreateEntry(roomId: string): RoomPlaybackCache {
  const existing = cacheByRoomId.get(roomId);
  if (existing) {
    return existing;
  }

  const entry: RoomPlaybackCache = {
    playback: null,
    liveNowPlaying: null,
    fetchedAt: 0,
    rateLimitedUntil: 0,
  };
  cacheByRoomId.set(roomId, entry);
  return entry;
}

export function getCachedRoomPlayback(roomId: string) {
  const entry = cacheByRoomId.get(roomId);
  if (!entry) {
    return {
      playback: null,
      liveNowPlaying: null,
      isStale: true,
      isRateLimited: false,
      fetchedAt: 0,
    };
  }

  const age = Date.now() - entry.fetchedAt;
  const isStale = entry.fetchedAt === 0 || age > PLAYBACK_CACHE_TTL_MS;

  return {
    playback: entry.playback,
    liveNowPlaying: entry.liveNowPlaying,
    isStale,
    isRateLimited: isRateLimited(roomId),
    fetchedAt: entry.fetchedAt,
  };
}

export function setCachedRoomPlayback(roomId: string, playback: SpotifyPlayback | null) {
  const entry = getOrCreateEntry(roomId);
  entry.playback = playback;
  entry.liveNowPlaying = nowPlayingFromPlayback(playback);
  entry.fetchedAt = Date.now();
  cacheByRoomId.set(roomId, entry);
}

export function setRateLimited(roomId: string, retryAfterSeconds: number) {
  const entry = getOrCreateEntry(roomId);
  const backoffMs = Math.max(retryAfterSeconds, 5) * 1000;
  entry.rateLimitedUntil = Date.now() + backoffMs;
  cacheByRoomId.set(roomId, entry);
}

export function isRateLimited(roomId: string) {
  const entry = cacheByRoomId.get(roomId);
  if (!entry) {
    return false;
  }
  return Date.now() < entry.rateLimitedUntil;
}

export function invalidateRoom(roomId: string) {
  cacheByRoomId.delete(roomId);
}

export function isPlaybackDegraded(roomId: string) {
  const cached = getCachedRoomPlayback(roomId);
  return cached.isRateLimited || (cached.isStale && cached.fetchedAt > 0);
}
