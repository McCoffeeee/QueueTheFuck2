import {
  EMPTY_ROOM_GRACE_MS,
  HOST_RECONNECT_GRACE_MS,
} from "@/lib/constants";
import { db } from "@/lib/db";
import { invalidateRoom } from "@/lib/playback-cache";
import { getSocketServer } from "@/lib/socket-server";
import { SOCKET_EVENTS } from "@/lib/socket-events";

const closingRooms = new Set<string>();
const socketsByRoom = new Map<string, Set<string>>();
const hostByRoom = new Map<string, string>();
const idleCloseTimers = new Map<string, NodeJS.Timeout>();
const hostGraceTimers = new Map<string, NodeJS.Timeout>();

export type RoomCloseReason = "host_left" | "idle";

export function isRoomClosing(roomCode: string) {
  return closingRooms.has(roomCode.toUpperCase());
}

function normalizeCode(roomCode: string) {
  return roomCode.toUpperCase();
}

function getSocketSet(roomCode: string) {
  const code = normalizeCode(roomCode);
  let sockets = socketsByRoom.get(code);
  if (!sockets) {
    sockets = new Set();
    socketsByRoom.set(code, sockets);
  }
  return sockets;
}

export function getTrackedSocketCount(roomCode: string) {
  return getSocketSet(roomCode).size;
}

async function getLiveSocketCount(roomCode: string) {
  const io = getSocketServer();
  if (!io) {
    return getTrackedSocketCount(roomCode);
  }
  return (await io.in(normalizeCode(roomCode)).fetchSockets()).length;
}

async function isHostSocketPresent(roomCode: string) {
  const code = normalizeCode(roomCode);
  const hostUserId = hostByRoom.get(code);
  if (!hostUserId) {
    return false;
  }

  const io = getSocketServer();
  if (!io) {
    return false;
  }

  const sockets = await io.in(code).fetchSockets();
  return sockets.some((socket) => socket.data.userId === hostUserId);
}

async function isLobbyRoom(roomCode: string) {
  const room = await db.room.findUnique({
    where: { code: normalizeCode(roomCode) },
    select: { status: true },
  });
  return room?.status === "lobby";
}

function cancelIdleTimer(roomCode: string) {
  const code = normalizeCode(roomCode);
  const timer = idleCloseTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    idleCloseTimers.delete(code);
  }
}

function cancelHostGraceTimer(roomCode: string) {
  const code = normalizeCode(roomCode);
  const timer = hostGraceTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    hostGraceTimers.delete(code);
  }
}

export async function scheduleIdleClose(roomCode: string) {
  const code = normalizeCode(roomCode);
  if (isRoomClosing(code) || idleCloseTimers.has(code)) {
    return;
  }

  if (!(await isLobbyRoom(code))) {
    return;
  }

  const liveSockets = await getLiveSocketCount(code);
  if (liveSockets > 0) {
    return;
  }

  const timer = setTimeout(() => {
    idleCloseTimers.delete(code);
    void closeRoom(code, "idle");
  }, EMPTY_ROOM_GRACE_MS);

  idleCloseTimers.set(code, timer);
}

function scheduleHostGraceClose(roomCode: string) {
  const code = normalizeCode(roomCode);
  if (isRoomClosing(code) || hostGraceTimers.has(code)) {
    return;
  }

  // #region agent log
  fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
    body: JSON.stringify({
      sessionId: "cb7553",
      runId: "post-fix",
      hypothesisId: "H1,H4",
      location: "room-lifecycle.ts:scheduleHostGraceClose",
      message: "host grace scheduled",
      data: { roomCode: code, graceMs: HOST_RECONNECT_GRACE_MS },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const timer = setTimeout(() => {
    hostGraceTimers.delete(code);
    void (async () => {
      if (await isHostSocketPresent(code)) {
        return;
      }
      await closeRoom(code, "host_left");
    })();
  }, HOST_RECONNECT_GRACE_MS);

  hostGraceTimers.set(code, timer);
}

function cleanupPresenceForRoom(roomCode: string) {
  const code = normalizeCode(roomCode);
  cancelIdleTimer(code);
  cancelHostGraceTimer(code);
  socketsByRoom.delete(code);
  hostByRoom.delete(code);
}

async function clearRoomRuntimeState(roomId: string, roomCode: string) {
  invalidateRoom(roomId);

  const tracks = await db.roomTrack.findMany({
    where: { roomId },
    select: { id: true },
  });
  const trackIds = tracks.map((track) => track.id);

  const { clearRoomEngineState } = await import("@/lib/game-engine");
  clearRoomEngineState(roomId, trackIds);

  cleanupPresenceForRoom(roomCode);
}

export async function closeRoom(roomCode: string, reason: RoomCloseReason) {
  const code = normalizeCode(roomCode);
  if (closingRooms.has(code)) {
    return;
  }
  closingRooms.add(code);

  try {
    const room = await db.room.findUnique({
      where: { code },
      include: {
        members: {
          include: { user: true },
        },
      },
    });

    if (!room) {
      return;
    }

    if (reason === "idle" && room.status === "playing") {
      console.warn(`[room] Refusing idle close of active game ${code}`);
      return;
    }

    const io = getSocketServer();
    if (io) {
      io.to(code).emit(SOCKET_EVENTS.ROOM_ENDED, { reason });
    }

    const guestUserIds = room.members
      .filter((member) => member.user.isGuest && member.userId !== room.hostUserId)
      .map((member) => member.userId);

    await clearRoomRuntimeState(room.id, code);

    await db.room.delete({ where: { id: room.id } });

    for (const userId of guestUserIds) {
      const remainingMemberships = await db.roomMember.count({ where: { userId } });
      if (remainingMemberships === 0) {
        await db.user.delete({ where: { id: userId } });
      }
    }

    console.info(`[room] Closed ${code} (${reason})`);

    // #region agent log
    fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
      body: JSON.stringify({
        sessionId: "cb7553",
        runId: "post-fix",
        hypothesisId: "H5",
        location: "room-lifecycle.ts:closeRoom",
        message: "room closed",
        data: { roomCode: code, reason, roomStatus: room.status },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  } catch (error) {
    console.error(`[room] Failed to close ${code}:`, error);
  } finally {
    closingRooms.delete(code);
  }
}

export async function onRoomPresenceChanged(
  roomCode: string,
  departedUserId: string,
  options?: { immediateHostClose?: boolean },
) {
  const code = normalizeCode(roomCode);
  if (isRoomClosing(code)) {
    return;
  }

  let hostUserId = hostByRoom.get(code);
  if (!hostUserId) {
    const room = await db.room.findUnique({
      where: { code },
      select: { hostUserId: true },
    });
    hostUserId = room?.hostUserId;
    if (hostUserId) {
      hostByRoom.set(code, hostUserId);
    }
  }

  const liveSockets = await getLiveSocketCount(code);
  const roomStatus = (
    await db.room.findUnique({ where: { code }, select: { status: true } })
  )?.status;

  // #region agent log
  fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
    body: JSON.stringify({
      sessionId: "cb7553",
      runId: "post-fix",
      hypothesisId: "H1,H2",
      location: "room-lifecycle.ts:onRoomPresenceChanged",
      message: "presence changed",
      data: {
        roomCode: code,
        departedUserId,
        hostUserId: hostUserId ?? null,
        isHostDeparting: !!(departedUserId && hostUserId && departedUserId === hostUserId),
        roomStatus: roomStatus ?? null,
        liveSockets,
        immediateHostClose: options?.immediateHostClose ?? false,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (departedUserId && hostUserId && departedUserId === hostUserId) {
    if (options?.immediateHostClose) {
      cancelHostGraceTimer(code);
      await closeRoom(code, "host_left");
      return;
    }

    scheduleHostGraceClose(code);
    return;
  }

  if (liveSockets === 0) {
    await scheduleIdleClose(code);
    return;
  }

  cancelIdleTimer(code);
}

export async function trackSocketJoin(
  roomCode: string,
  socketId: string,
  hostUserId: string,
) {
  const code = normalizeCode(roomCode);
  if (isRoomClosing(code)) {
    return;
  }

  getSocketSet(code).add(socketId);
  hostByRoom.set(code, hostUserId);
  cancelIdleTimer(code);
  cancelHostGraceTimer(code);
}

export function trackSocketLeave(roomCode: string, socketId: string) {
  const code = normalizeCode(roomCode);
  const sockets = socketsByRoom.get(code);
  if (!sockets) {
    return;
  }

  sockets.delete(socketId);
  if (sockets.size === 0) {
    socketsByRoom.delete(code);
  }
}

export async function handleMemberLeave(
  roomCode: string,
  userId: string,
  options?: { immediateHostClose?: boolean },
) {
  const code = normalizeCode(roomCode);
  if (isRoomClosing(code)) {
    return;
  }

  const room = await db.room.findUnique({ where: { code } });
  if (!room) {
    return;
  }

  hostByRoom.set(code, room.hostUserId);

  await db.roomMember.deleteMany({
    where: {
      roomId: room.id,
      userId,
    },
  });

  if (userId === room.hostUserId) {
    // #region agent log
    fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
      body: JSON.stringify({
        sessionId: "cb7553",
        runId: "post-fix",
        hypothesisId: "H3",
        location: "room-lifecycle.ts:handleMemberLeave",
        message: "host leave via API",
        data: {
          roomCode: code,
          roomStatus: room.status,
          immediateHostClose: options?.immediateHostClose ?? true,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (options?.immediateHostClose ?? true) {
      await closeRoom(code, "host_left");
    } else {
      await onRoomPresenceChanged(code, userId, { immediateHostClose: false });
    }
    return;
  }

  const liveSockets = await getLiveSocketCount(code);
  if (liveSockets === 0) {
    await scheduleIdleClose(code);
  }
}

export async function sweepIdleRooms() {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  const rooms = await db.room.findMany({
    where: { status: "lobby" },
    select: { code: true, hostUserId: true },
  });

  for (const room of rooms) {
    const code = room.code;
    if (isRoomClosing(code)) {
      continue;
    }

    hostByRoom.set(code, room.hostUserId);

    const liveSockets = await io.in(code).fetchSockets();
    const tracked = getSocketSet(code);
    tracked.clear();
    for (const socket of liveSockets) {
      tracked.add(socket.id);
    }

    if (liveSockets.length === 0) {
      await scheduleIdleClose(code);
    } else {
      cancelIdleTimer(code);
      cancelHostGraceTimer(code);
    }
  }
}
