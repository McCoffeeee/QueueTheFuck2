import { db } from "@/lib/db";
import { SPOTIFY_SCOPES } from "@/lib/constants";
import type { SpotifyTrackResult } from "@/lib/types";
import crypto from "crypto";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";

export type SpotifyPlaybackItem = {
  id: string;
  name: string;
  duration_ms: number;
  uri: string;
  album: { images: { url: string }[] };
  artists: { name: string }[];
};

export type SpotifyPlayback = {
  is_playing: boolean;
  progress_ms: number;
  item: SpotifyPlaybackItem | null;
};

export function generatePkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function generateOAuthState() {
  return crypto.randomBytes(16).toString("hex");
}

export function getSpotifyAuthorizeUrl(state: string, codeChallenge: string) {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID || "",
    response_type: "code",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI || "",
    scope: SPOTIFY_SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });

  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

interface SpotifyTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export async function exchangeCodeForTokens(code: string, codeVerifier: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI || "",
    client_id: process.env.SPOTIFY_CLIENT_ID || "",
    code_verifier: codeVerifier,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
      ).toString("base64")}`,
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return (await response.json()) as SpotifyTokenResponse;
}

export async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.SPOTIFY_CLIENT_ID || "",
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
      ).toString("base64")}`,
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return (await response.json()) as SpotifyTokenResponse;
}

export async function getClientCredentialsToken() {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
      ).toString("base64")}`,
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Client credentials failed: ${error}`);
  }

  const data = (await response.json()) as SpotifyTokenResponse;
  return data.access_token;
}

export async function getValidAccessToken(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.accessToken || !user.refreshToken) {
    throw new Error("Spotify account not connected");
  }

  const expiresAt = user.tokenExpiresAt?.getTime() ?? 0;
  if (Date.now() < expiresAt - 60_000) {
    return user.accessToken;
  }

  const refreshed = await refreshAccessToken(user.refreshToken);
  const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  await db.user.update({
    where: { id: userId },
    data: {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? user.refreshToken,
      tokenExpiresAt,
    },
  });

  return refreshed.access_token;
}

async function spotifyFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SPOTIFY_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${error}`);
  }

  return (await response.json()) as T;
}

function deviceQuery(deviceId?: string | null) {
  return deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
}

function parsePlayerResponse(data: {
  is_playing?: boolean;
  progress_ms?: number;
  item?: SpotifyPlaybackItem | null;
}): SpotifyPlayback | null {
  if (!data.item) {
    return null;
  }

  return {
    is_playing: data.is_playing ?? false,
    progress_ms: data.progress_ms ?? 0,
    item: data.item,
  };
}

export class SpotifyRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Spotify API rate limit exceeded");
    this.name = "SpotifyRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function parseRetryAfterSeconds(response: Response) {
  const header = response.headers.get("retry-after");
  const parsed = header ? Number.parseInt(header, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

export async function getPlayerPlayback(
  accessToken: string,
  deviceId?: string | null,
  roomId?: string | null,
): Promise<SpotifyPlayback | null> {
  if (roomId) {
    const { getCachedRoomPlayback, isRateLimited } = await import("@/lib/playback-cache");
    if (isRateLimited(roomId)) {
      return getCachedRoomPlayback(roomId).playback;
    }
  }

  const query = deviceQuery(deviceId);
  const playerResponse = await fetch(`${SPOTIFY_API_URL}/me/player${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (playerResponse.status === 204 || playerResponse.status === 404) {
    return null;
  }

  if (playerResponse.status === 429) {
    const retryAfterSeconds = parseRetryAfterSeconds(playerResponse);
    if (roomId) {
      const { setRateLimited, getCachedRoomPlayback } = await import("@/lib/playback-cache");
      setRateLimited(roomId, retryAfterSeconds);
      console.warn(`[spotify] Rate limited for room ${roomId}, retry after ${retryAfterSeconds}s`);
      return getCachedRoomPlayback(roomId).playback;
    }
    throw new SpotifyRateLimitError(retryAfterSeconds);
  }

  if (!playerResponse.ok) {
    const error = await playerResponse.text();
    throw new Error(`Player state error (${playerResponse.status}): ${error}`);
  }

  const data = (await playerResponse.json()) as {
    is_playing: boolean;
    progress_ms: number;
    item: SpotifyPlaybackItem | null;
  };

  return parsePlayerResponse(data);
}

/** @deprecated Use getPlayerPlayback with deviceId */
export async function getCurrentlyPlaying(accessToken: string, deviceId?: string | null) {
  return getPlayerPlayback(accessToken, deviceId);
}

export async function getSpotifyProfile(accessToken: string) {
  return spotifyFetch<{
    id: string;
    display_name: string | null;
    images: { url: string }[];
    product: string;
  }>(accessToken, "/me");
}

export async function searchTracks(accessToken: string, query: string) {
  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: "10",
  });

  const data = await spotifyFetch<{
    tracks: {
      items: Array<{
        id: string;
        uri: string;
        name: string;
        album: { images: { url: string }[] };
        artists: { name: string }[];
      }>;
    };
  }>(accessToken, `/search?${params.toString()}`);

  return data.tracks.items.map(
    (track): SpotifyTrackResult => ({
      id: track.id,
      uri: track.uri,
      name: track.name,
      artistName: track.artists.map((a) => a.name).join(", "),
      albumArtUrl: track.album.images[0]?.url ?? null,
    }),
  );
}

export async function getDevices(accessToken: string) {
  const data = await spotifyFetch<{
    devices: Array<{
      id: string | null;
      is_active: boolean;
      name: string;
      type: string;
    }>;
  }>(accessToken, "/me/player/devices");

  return data.devices;
}

export async function addToQueue(accessToken: string, uri: string, deviceId?: string | null) {
  const params = new URLSearchParams({ uri });
  if (deviceId) {
    params.set("device_id", deviceId);
  }

  await spotifyFetch(accessToken, `/me/player/queue?${params.toString()}`, {
    method: "POST",
  });
}

export async function startPlayback(
  accessToken: string,
  uri: string,
  deviceId?: string | null,
) {
  await spotifyFetch(accessToken, `/me/player/play${deviceQuery(deviceId)}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [uri] }),
  });
}

export async function playbackControl(
  accessToken: string,
  action: "play" | "pause" | "next" | "previous",
  deviceId?: string | null,
) {
  const query = deviceQuery(deviceId);

  switch (action) {
    case "play":
      await spotifyFetch(accessToken, `/me/player/play${query}`, { method: "PUT" });
      break;
    case "pause":
      await spotifyFetch(accessToken, `/me/player/pause${query}`, { method: "PUT" });
      break;
    case "next":
      await spotifyFetch(accessToken, `/me/player/next${query}`, { method: "POST" });
      break;
    case "previous":
      await spotifyFetch(accessToken, `/me/player/previous${query}`, { method: "POST" });
      break;
  }
}
