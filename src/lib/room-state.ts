import { db } from "@/lib/db";
import {
  getCachedRoomPlayback,
  isPlaybackDegraded,
} from "@/lib/playback-cache";
import { getRoomState } from "@/lib/room";
import type { RoomStateView } from "@/lib/types";

export async function buildRoomStateFromCache(
  code: string,
  currentUserId?: string | null,
): Promise<RoomStateView | null> {
  const roomCode = code.toUpperCase();
  const room = await db.room.findUnique({ where: { code: roomCode } });

  if (!room) {
    return null;
  }

  let liveNowPlaying = null;
  let spotifySyncDegraded = false;

  if (room.status === "playing") {
    const cached = getCachedRoomPlayback(room.id);
    liveNowPlaying = cached.liveNowPlaying;
    spotifySyncDegraded = isPlaybackDegraded(room.id);
  }

  const state = await getRoomState(roomCode, currentUserId, {
    liveSpotifyTrackId: liveNowPlaying?.spotifyTrackId ?? null,
    liveTrackUri: liveNowPlaying?.trackUri ?? null,
    liveNowPlaying,
  });

  if (!state) {
    return null;
  }

  return {
    ...state,
    spotifySyncDegraded,
  };
}

/** Reads cached Spotify playback only — does not call the Spotify API. */
export async function getEnrichedRoomState(
  code: string,
  currentUserId?: string | null,
): Promise<RoomStateView | null> {
  return buildRoomStateFromCache(code, currentUserId);
}

export function personalizeRoomState(state: RoomStateView, userId?: string | null): RoomStateView {
  return {
    ...state,
    currentUserId: userId ?? null,
    isCurrentUserHost: userId === state.hostUserId,
  };
}

export function mergeUserRoomState(
  sharedState: RoomStateView,
  userState: RoomStateView,
  userId: string,
): RoomStateView {
  const mergedActiveRound = userState.activeRound
    ? {
        ...userState.activeRound,
        guessEndsAt: sharedState.activeRound?.guessEndsAt ?? userState.activeRound.guessEndsAt,
        guessOpensAt: sharedState.activeRound?.guessOpensAt ?? userState.activeRound.guessOpensAt,
        progressMs: sharedState.activeRound?.progressMs ?? userState.activeRound.progressMs,
        durationMs: sharedState.activeRound?.durationMs ?? userState.activeRound.durationMs,
        guessesSubmitted:
          sharedState.activeRound?.guessesSubmitted ?? userState.activeRound.guessesSubmitted,
        totalPlayers: sharedState.activeRound?.totalPlayers ?? userState.activeRound.totalPlayers,
      }
    : sharedState.activeRound;

  return {
    ...sharedState,
    activeRound: mergedActiveRound,
    reveal: userState.reveal ?? sharedState.reveal,
    currentUserId: userId,
    isCurrentUserHost: userId === sharedState.hostUserId,
  };
}
