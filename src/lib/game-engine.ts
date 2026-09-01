import { shouldRevealTrack } from "@/lib/active-round";

import {

  CORRECT_GUESS_POINTS,

  REVEAL_BEFORE_END_MS,

  REVEAL_DELAY_MS,

  SONG_END_PROGRESS_MS,

  SOLO_CORRECT_BONUS,

  SPOTIFY_HOT_ROOM_END_THRESHOLD_MS,

} from "@/lib/constants";

import { db } from "@/lib/db";

import { getCachedRoomPlayback, invalidateRoom, setCachedRoomPlayback } from "@/lib/playback-cache";

import { getRoomState } from "@/lib/room";

import { buildRoomStateFromCache, mergeUserRoomState } from "@/lib/room-state";

import { getSocketServer } from "@/lib/socket-server";

import { SOCKET_EVENTS } from "@/lib/socket-events";

import { isRoomClosing } from "@/lib/room-lifecycle";

import {
  addToQueue,
  getPlayerPlayback,
  getValidAccessToken,
  startPlayback,
  type SpotifyPlayback,
} from "@/lib/spotify";



const lastSeenTrackByRoom = new Map<string, string | null>();

const revealTimeouts = new Map<string, NodeJS.Timeout>();

const revealScheduleTimeouts = new Map<

  string,

  { timeout: NodeJS.Timeout; scheduledAt: number }

>();

const lastSpotifyQueuedHeadByRoom = new Map<string, string>();

const refreshInFlightByRoom = new Map<string, number>();

const roomRefreshLocks = new Set<string>();

const headQueueSyncLocks = new Set<string>();



function clearRevealSchedule(roomTrackId: string) {

  const existing = revealScheduleTimeouts.get(roomTrackId);

  if (existing) {

    clearTimeout(existing.timeout);

    revealScheduleTimeouts.delete(roomTrackId);

  }

}



export function clearRoomEngineState(roomId: string, trackIds: string[]) {

  lastSeenTrackByRoom.delete(roomId);

  lastSpotifyQueuedHeadByRoom.delete(roomId);

  for (const trackId of trackIds) {

    const timeout = revealTimeouts.get(trackId);

    if (timeout) {

      clearTimeout(timeout);

      revealTimeouts.delete(trackId);

    }

    clearRevealSchedule(trackId);

  }

}



function liveTrackMatchers(spotifyTrackId: string, trackUri?: string | null) {

  const matchers: Array<{ spotifyTrackId: string } | { trackUri: string }> = [

    { spotifyTrackId },

  ];

  if (trackUri) {

    matchers.push({ trackUri });

  }

  return matchers;

}



async function broadcastRoundRevealed(code: string, roomTrackId: string) {

  const io = getSocketServer();

  if (!io) {

    return;

  }



  const roomCode = code.toUpperCase();

  const baseState = await buildRoomStateFromCache(roomCode);

  const cached = baseState?.nowPlaying ?? null;



  const sockets = await io.in(roomCode).fetchSockets();

  await Promise.all(

    sockets.map(async (socket) => {

      const userId = socket.data.userId as string | undefined;

      const userState = await getRoomState(roomCode, userId, {

        liveSpotifyTrackId: cached?.spotifyTrackId ?? null,

        liveNowPlaying: cached,

      });



      if (userState?.reveal?.roomTrackId === roomTrackId) {

        socket.emit(SOCKET_EVENTS.ROUND_REVEALED, userState.reveal);

      }

    }),

  );

}



export async function broadcastCachedRoomState(code: string) {

  const io = getSocketServer();

  if (!io) {

    console.warn("[socket] Server not ready — live update skipped for room", code);

    return;

  }



  const roomCode = code.toUpperCase();

  const baseState = await buildRoomStateFromCache(roomCode);

  if (!baseState) {

    return;

  }



  if (baseState.status === "lobby") {

    io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, baseState);

  }



  const sockets = await io.in(roomCode).fetchSockets();

  if (sockets.length === 0) {

    if (baseState.status === "lobby") {

      console.warn(`[socket] No sockets in room ${roomCode} — shared state emitted via io.to()`);

    }

    return;

  }



  const cached = baseState.nowPlaying;



  await Promise.all(

    sockets.map(async (socket) => {

      const userId = socket.data.userId as string | undefined;

      if (!userId) {

        socket.emit(SOCKET_EVENTS.ROOM_STATE, baseState);

        return;

      }



      const userState = await getRoomState(roomCode, userId, {

        liveSpotifyTrackId: cached?.spotifyTrackId ?? null,

        liveNowPlaying: cached,

      });

      if (!userState) {

        socket.emit(SOCKET_EVENTS.ROOM_STATE, baseState);

        return;

      }



      socket.emit(

        SOCKET_EVENTS.ROOM_STATE,

        mergeUserRoomState(baseState, userState, userId),

      );

    }),

  );

}



export async function broadcastRoomMembers(code: string) {

  return broadcastCachedRoomState(code);

}



export async function broadcastRoomState(code: string) {

  return broadcastCachedRoomState(code);

}



export async function broadcastActivePlayingRooms() {

  const rooms = await db.room.findMany({

    where: { status: "playing" },

    select: { code: true },

  });



  for (const room of rooms) {

    if (isRoomClosing(room.code)) {

      continue;

    }



    try {

      await broadcastCachedRoomState(room.code);

    } catch (error) {

      console.error(`[broadcast] Cache broadcast failed for ${room.code}:`, error);

    }

  }

}



export async function revealRound(roomTrackId: string) {

  clearRevealSchedule(roomTrackId);



  const track = await db.roomTrack.findUnique({

    where: { id: roomTrackId },

    include: {

      room: { include: { members: true } },

      guesses: true,

    },

  });



  if (!track || track.revealedAt) {

    return;

  }



  const correctGuessers = track.guesses.filter((guess) => guess.isCorrect);

  const soloWinner = correctGuessers.length === 1 ? correctGuessers[0] : null;



  for (const guess of track.guesses) {

    let points = 0;

    if (guess.isCorrect) {

      points = CORRECT_GUESS_POINTS;

      if (soloWinner && guess.id === soloWinner.id) {

        points += SOLO_CORRECT_BONUS;

      }

    }



    await db.guess.update({

      where: { id: guess.id },

      data: { points },

    });



    if (points > 0) {

      await db.roomMember.update({

        where: {

          roomId_userId: {

            roomId: track.roomId,

            userId: guess.guesserUserId,

          },

        },

        data: { score: { increment: points } },

      });

    }

  }



  await db.roomTrack.update({

    where: { id: roomTrackId },

    data: { revealedAt: new Date(), status: "revealed" },

  });



  const room = await db.room.findUnique({ where: { id: track.roomId } });

  if (room) {

    await broadcastCachedRoomState(room.code);

    await broadcastRoundRevealed(room.code, roomTrackId);

    void requestSpotifyHeadQueueSync(track.roomId);

  }



  const existingTimeout = revealTimeouts.get(roomTrackId);

  if (existingTimeout) {

    clearTimeout(existingTimeout);

  }



  const timeout = setTimeout(async () => {

    if (room) {

      await broadcastCachedRoomState(room.code);

    }

    revealTimeouts.delete(roomTrackId);

  }, REVEAL_DELAY_MS);



  revealTimeouts.set(roomTrackId, timeout);

}



export async function scheduleRevealForTrack(

  roomTrackId: string,

  playback: { progressMs: number; durationMs: number } | null,

) {

  const track = await db.roomTrack.findUnique({

    where: { id: roomTrackId },

    include: {

      room: { include: { members: true } },

      guesses: true,

    },

  });



  if (!track || track.revealedAt || !track.playingAt) {

    clearRevealSchedule(roomTrackId);

    return;

  }



  if (!playback || playback.durationMs <= 0) {

    return;

  }



  if (

    shouldRevealTrack(track, track.guesses, track.room.members, playback)

  ) {

    clearRevealSchedule(roomTrackId);

    await revealRound(roomTrackId);

    return;

  }



  const eligibleGuessers = track.room.members.filter(

    (member) => member.userId !== track.addedByUserId,

  );

  const allGuessed =

    eligibleGuessers.length > 0 && track.guesses.length >= eligibleGuessers.length;

  const msUntilEnd = playback.durationMs - playback.progressMs;



  const delayMs = allGuessed

    ? Math.max(0, msUntilEnd - REVEAL_BEFORE_END_MS)

    : Math.max(0, msUntilEnd - SONG_END_PROGRESS_MS);



  const targetTime = Date.now() + delayMs;

  const existing = revealScheduleTimeouts.get(roomTrackId);

  if (existing && Math.abs(existing.scheduledAt - targetTime) < 1000) {

    return;

  }



  clearRevealSchedule(roomTrackId);



  const timeout = setTimeout(() => {

    revealScheduleTimeouts.delete(roomTrackId);

    void revealRound(roomTrackId);

  }, delayMs);



  revealScheduleTimeouts.set(roomTrackId, { timeout, scheduledAt: targetTime });

}



async function maybeRevealRound(

  roomTrackId: string,

  playback: { progressMs: number; durationMs: number } | null,

  forceBecauseTrackEnded = false,

) {

  const track = await db.roomTrack.findUnique({

    where: { id: roomTrackId },

    include: {

      room: { include: { members: true } },

      guesses: true,

    },

  });



  if (!track) {

    return;

  }



  if (forceBecauseTrackEnded) {

    clearRevealSchedule(roomTrackId);

    if (!track.revealedAt) {

      await revealRound(roomTrackId);

    }

    return;

  }



  if (

    shouldRevealTrack(track, track.guesses, track.room.members, playback)

  ) {

    await revealRound(roomTrackId);

    return;

  }



  await scheduleRevealForTrack(roomTrackId, playback);

}



async function revealPlayingTrackForLivePlayback(

  roomId: string,

  spotifyTrackId: string,

  trackUri?: string | null,

) {

  const track = await db.roomTrack.findFirst({

    where: {

      roomId,

      status: "playing",

      revealedAt: null,

      OR: liveTrackMatchers(spotifyTrackId, trackUri),

    },

  });



  if (track) {

    await maybeRevealRound(track.id, null, true);

  }

}



export async function isRoomHotForFastPoll(roomId: string): Promise<boolean> {

  const activeTrack = await db.roomTrack.findFirst({

    where: {

      roomId,

      status: "playing",

      revealedAt: null,

      playingAt: { not: null },

    },

    include: {

      guesses: true,

      room: { include: { members: true } },

    },

  });



  if (!activeTrack) {

    return false;

  }



  const eligibleGuessers = activeTrack.room.members.filter(

    (member) => member.userId !== activeTrack.addedByUserId,

  );

  const allGuessed =

    eligibleGuessers.length > 0 &&

    activeTrack.guesses.length >= eligibleGuessers.length;



  if (allGuessed) {

    return true;

  }



  const cached = getCachedRoomPlayback(roomId);

  const live = cached.liveNowPlaying;

  if (!live || live.durationMs <= 0) {

    return false;

  }



  const msUntilEnd = live.durationMs - live.progressMs;

  return msUntilEnd <= SPOTIFY_HOT_ROOM_END_THRESHOLD_MS;

}



function trackMatchesPlayback(

  track: { spotifyTrackId: string; trackUri: string },

  spotifyTrackId: string | null,

  trackUri: string | null,

) {

  if (!spotifyTrackId && !trackUri) {

    return false;

  }



  return (

    (!!spotifyTrackId && track.spotifyTrackId === spotifyTrackId) ||

    (!!trackUri && track.trackUri === trackUri)

  );

}



export async function getHeadQueuedTrack(roomId: string) {

  return db.roomTrack.findFirst({

    where: {

      roomId,

      status: "queued",

      revealedAt: null,

    },

    orderBy: { queuePosition: "asc" },

  });

}



async function getSpotifyHeadCandidate(roomId: string, playback: SpotifyPlayback | null) {

  const head = await getHeadQueuedTrack(roomId);

  if (!head) {

    return null;

  }



  const currentTrackId = playback?.item?.id ?? null;

  const currentTrackUri = playback?.item?.uri ?? null;



  if (trackMatchesPlayback(head, currentTrackId, currentTrackUri)) {

    return null;

  }



  if (head.spotifyQueuedAt) {

    return null;

  }



  return head;

}



export async function syncSpotifyQueueHead(

  room: {

    id: string;

    code: string;

    hostUserId: string;

    hostDeviceId: string | null;

  },

  playback: SpotifyPlayback | null,

) {

  const currentTrackId = playback?.item?.id ?? null;

  const currentTrackUri = playback?.item?.uri ?? null;



  if (currentTrackId || currentTrackUri) {

    const liveQueued = await db.roomTrack.findFirst({

      where: {

        roomId: room.id,

        status: "queued",

        revealedAt: null,

        OR: [

          ...(currentTrackId ? [{ spotifyTrackId: currentTrackId }] : []),

          ...(currentTrackUri ? [{ trackUri: currentTrackUri }] : []),

        ],

      },

      orderBy: { queuePosition: "asc" },

    });



    if (liveQueued) {

      console.log(`[queue] live matches queued ${liveQueued.id} in ${room.code}, startRound`);

      await startRoundForTrack(liveQueued.id, room.code, { suppressHeadQueueSync: true });

    }

  }



  const head = await getSpotifyHeadCandidate(room.id, playback);

  if (!head) {

    return;

  }



  if (!playback?.item) {

    console.log(`[queue] idle fallback startPlayback ${head.id} in ${room.code}`);

    const accessToken = await getValidAccessToken(room.hostUserId);

    invalidateRoom(room.id);

    await startPlayback(accessToken, head.trackUri, room.hostDeviceId);

    await startRoundForTrack(head.id, room.code);

    lastSpotifyQueuedHeadByRoom.set(room.id, head.id);

    return;

  }



  const claimed = await db.roomTrack.updateMany({

    where: { id: head.id, spotifyQueuedAt: null },

    data: { spotifyQueuedAt: new Date() },

  });

  const willAddToQueue = claimed.count > 0;

  if (!willAddToQueue) {

    console.log(`[queue] head ${head.id} already queued on Spotify in ${room.code}, skip`);

    return;

  }



  console.log(`[queue] addToQueue head ${head.id} in ${room.code}`);

  lastSpotifyQueuedHeadByRoom.set(room.id, head.id);

  const accessToken = await getValidAccessToken(room.hostUserId);

  try {

    await addToQueue(accessToken, head.trackUri, room.hostDeviceId);

  } catch (error) {

    const message = error instanceof Error ? error.message : "addToQueue failed";

    console.warn(`[queue] addToQueue failed for ${head.id} in ${room.code}:`, message);

  }

}



export async function requestSpotifyHeadQueueSync(roomId: string): Promise<void> {

  if (headQueueSyncLocks.has(roomId)) {

    return;

  }



  headQueueSyncLocks.add(roomId);



  try {

    const room = await db.room.findUnique({

      where: { id: roomId },

      select: {

        id: true,

        code: true,

        hostUserId: true,

        hostDeviceId: true,

        status: true,

      },

    });



    if (!room || room.status !== "playing") {

      return;

    }



    invalidateRoom(roomId);

    const accessToken = await getValidAccessToken(room.hostUserId);

    const playback = await getPlayerPlayback(accessToken, room.hostDeviceId, roomId);

    setCachedRoomPlayback(roomId, playback);

    await syncSpotifyQueueHead(room, playback);

  } catch (error) {

    console.warn(`[queue] head queue sync failed for room ${roomId}:`, error);

  } finally {

    headQueueSyncLocks.delete(roomId);

  }

}



export async function startRoundForTrack(

  trackId: string,

  roomCode: string,

  options?: { suppressHeadQueueSync?: boolean },

) {

  const existing = await db.roomTrack.findUnique({ where: { id: trackId } });

  if (!existing || existing.revealedAt || existing.status === "revealed") {

    return;

  }



  if (existing.status !== "queued" && !(existing.status === "playing" && !existing.playingAt)) {

    return;

  }



  await db.roomTrack.update({

    where: { id: trackId },

    data: {

      status: "playing",

      playingAt: existing.playingAt ?? new Date(),

    },

  });



  await broadcastCachedRoomState(roomCode);



  if (!options?.suppressHeadQueueSync) {

    void requestSpotifyHeadQueueSync(existing.roomId);

  }

}



export async function ensureRoundForLiveTrack(

  roomId: string,

  roomCode: string,

  spotifyTrackId: string,

  trackUri?: string | null,

) {

  const activePlaying = await db.roomTrack.findFirst({

    where: {

      roomId,

      status: "playing",

      revealedAt: null,

      OR: liveTrackMatchers(spotifyTrackId, trackUri),

    },

  });



  if (activePlaying) {

    await startRoundForTrack(activePlaying.id, roomCode);

    return;

  }



  const head = await getHeadQueuedTrack(roomId);

  if (head && trackMatchesPlayback(head, spotifyTrackId, trackUri ?? null)) {

    await startRoundForTrack(head.id, roomCode);

  }

}



export async function syncRoomPlayback(

  roomId: string,

  roomCode: string,

  playback: SpotifyPlayback | null,

) {

  const currentTrackId = playback?.item?.id ?? null;

  const currentTrackUri = playback?.item?.uri ?? null;

  const previousTrackId = lastSeenTrackByRoom.get(roomId) ?? null;



  if (previousTrackId && currentTrackId !== previousTrackId) {

    await revealPlayingTrackForLivePlayback(roomId, previousTrackId);

  }



  if (!currentTrackId && previousTrackId) {

    await revealPlayingTrackForLivePlayback(roomId, previousTrackId);

  }



  const durationMs = playback?.item?.duration_ms ?? 0;

  if (

    playback?.item &&

    currentTrackId &&

    durationMs > 10_000 &&

    playback.progress_ms >= durationMs - SONG_END_PROGRESS_MS

  ) {

    const endingTrack = await db.roomTrack.findFirst({

      where: {

        roomId,

        status: "playing",

        revealedAt: null,

        OR: liveTrackMatchers(currentTrackId, currentTrackUri),

      },

    });



    if (endingTrack) {

      await maybeRevealRound(endingTrack.id, {

        progressMs: playback.progress_ms,

        durationMs,

      });

    }

  }



  if (currentTrackId || currentTrackUri) {

    const activePlaying = await db.roomTrack.findFirst({

      where: {

        roomId,

        status: "playing",

        revealedAt: null,

      },

    });



    const liveMatchesActive =

      activePlaying &&

      (activePlaying.spotifyTrackId === currentTrackId ||

        (!!currentTrackUri && activePlaying.trackUri === currentTrackUri));



    if (activePlaying && !liveMatchesActive) {

      await maybeRevealRound(activePlaying.id, null, true);

    } else if (!activePlaying) {

      const head = await getHeadQueuedTrack(roomId);

      if (head && trackMatchesPlayback(head, currentTrackId, currentTrackUri)) {

        await startRoundForTrack(head.id, roomCode);

      }

    }

  }



  const room = await db.room.findUnique({ where: { id: roomId } });

  if (room) {

    await syncSpotifyQueueHead(room, playback);

  }



  lastSeenTrackByRoom.set(roomId, currentTrackId);



  const activeTracks = await db.roomTrack.findMany({

    where: {

      roomId,

      status: "playing",

      revealedAt: null,

      playingAt: { not: null },

    },

  });



  for (const track of activeTracks) {

    const trackMatchesCurrent =

      !!playback?.item &&

      (track.spotifyTrackId === currentTrackId ||

        (!!currentTrackUri && track.trackUri === currentTrackUri));

    const trackPlayback =

      trackMatchesCurrent && durationMs > 0

        ? { progressMs: playback!.progress_ms, durationMs }

        : null;



    await maybeRevealRound(track.id, trackPlayback);

  }

}



export async function refreshRoomSpotifyPlayback(room: {

  id: string;

  code: string;

  hostUserId: string;

  hostDeviceId: string | null;

}) {

  if (roomRefreshLocks.has(room.id)) {

    const cached = getCachedRoomPlayback(room.id);

    return cached.playback;

  }

  roomRefreshLocks.add(room.id);

  const inFlight = (refreshInFlightByRoom.get(room.id) ?? 0) + 1;

  refreshInFlightByRoom.set(room.id, inFlight);

  try {

    const accessToken = await getValidAccessToken(room.hostUserId);

    const playback = await getPlayerPlayback(accessToken, room.hostDeviceId, room.id);

    setCachedRoomPlayback(room.id, playback);



    await syncRoomPlayback(room.id, room.code, playback);



    if (playback?.item) {

      await ensureRoundForLiveTrack(room.id, room.code, playback.item.id, playback.item.uri);

    }



    const remaining = (refreshInFlightByRoom.get(room.id) ?? 1) - 1;

    if (remaining <= 0) {

      refreshInFlightByRoom.delete(room.id);

    } else {

      refreshInFlightByRoom.set(room.id, remaining);

    }

    return playback;

  } finally {

    roomRefreshLocks.delete(room.id);

  }

}



export async function pollHotPlayingRooms() {

  const rooms = await db.room.findMany({

    where: { status: "playing" },

  });



  for (const room of rooms) {

    if (isRoomClosing(room.code)) {

      continue;

    }



    try {

      const hot = await isRoomHotForFastPoll(room.id);

      if (!hot) {

        continue;

      }



      await refreshRoomSpotifyPlayback(room);

      await broadcastCachedRoomState(room.code);

    } catch (error) {

      console.error(`Hot poller error for room ${room.code}:`, error);

    }

  }

}



export async function pollActiveRooms() {

  const rooms = await db.room.findMany({

    where: { status: { in: ["lobby", "playing"] } },

  });



  for (const room of rooms) {

    if (isRoomClosing(room.code)) {

      continue;

    }



    try {

      if (room.status === "lobby") {

        await broadcastCachedRoomState(room.code);

        continue;

      }



      await refreshRoomSpotifyPlayback(room);

      await broadcastCachedRoomState(room.code);

    } catch (error) {

      console.error(`Poller error for room ${room.code}:`, error);

      await broadcastCachedRoomState(room.code);

    }

  }

}



export const pollPlayingRooms = pollActiveRooms;


