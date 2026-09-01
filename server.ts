import { createServer } from "http";

import { parse } from "url";

import next from "next";

import { Server as SocketServer } from "socket.io";

import { unsealData } from "iron-session";

import {

  GAME_STATE_BROADCAST_MS,

  ROOM_SWEEPER_INTERVAL_MS,

  SPOTIFY_SYNC_FAST_MS,

  SPOTIFY_SYNC_INTERVAL_MS,

} from "./src/lib/constants";

import {

  broadcastActivePlayingRooms,

  broadcastRoomMembers,

  pollActiveRooms,

  pollHotPlayingRooms,

} from "./src/lib/game-engine";

import {

  onRoomPresenceChanged,

  sweepIdleRooms,

  trackSocketJoin,

  trackSocketLeave,

} from "./src/lib/room-lifecycle";

import { sessionOptions, type SessionData } from "./src/lib/session-config";

import { setSocketServer } from "./src/lib/socket-server";

import { SOCKET_EVENTS } from "./src/lib/socket-events";

import { db } from "./src/lib/db";



const dev = process.env.NODE_ENV !== "production";

const hostname = process.env.HOSTNAME || "0.0.0.0";

const port = parseInt(process.env.PORT || "3000", 10);



const app = next({ dev, hostname: "localhost", port });

const handle = app.getRequestHandler();



function getSessionCookie(cookieHeader?: string) {

  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(

    cookieHeader.split(";").map((part) => {

      const [key, ...rest] = part.trim().split("=");

      return [key, rest.join("=")];

    }),

  );

  const raw = cookies[sessionOptions.cookieName];

  if (!raw) return null;

  try {

    return decodeURIComponent(raw);

  } catch {

    return raw;

  }

}



async function getUserIdFromSocketCookie(cookieHeader?: string) {

  const sealed = getSessionCookie(cookieHeader);

  if (!sealed) return null;



  try {

    const session = await unsealData<SessionData>(sealed, {

      password: sessionOptions.password,

      ttl: sessionOptions.cookieOptions?.maxAge ?? 60 * 60 * 24 * 7,

    });

    return session.userId ?? null;

  } catch {

    return null;

  }

}



app.prepare().then(() => {

  const httpServer = createServer((req, res) => {

    const parsedUrl = parse(req.url || "", true);

    handle(req, res, parsedUrl);

  });



  const io = new SocketServer(httpServer, {

    cors: {

      origin: true,

      credentials: true,

    },

  });



  setSocketServer(io);



  io.on("connection", async (socket) => {

    const userId = await getUserIdFromSocketCookie(socket.handshake.headers.cookie);

    if (!userId) {

      socket.emit(SOCKET_EVENTS.ERROR, { message: "Unauthorized" });

      socket.disconnect();

      return;

    }



    socket.data.userId = userId;



    socket.on(SOCKET_EVENTS.ROOM_JOIN, async (code: string) => {

      const roomCode = code.toUpperCase();

      const membership = await db.roomMember.findFirst({

        where: {

          room: { code: roomCode },

          userId,

        },

        include: { room: true },

      });



      if (!membership) {

        socket.emit(SOCKET_EVENTS.ERROR, { message: "Not a member of this room" });

        return;

      }



      socket.join(roomCode);

      await trackSocketJoin(roomCode, socket.id, membership.room.hostUserId);

      await broadcastRoomMembers(roomCode);

    });



    socket.on(SOCKET_EVENTS.ROOM_LEAVE, (code: string) => {

      const roomCode = code.toUpperCase();

      trackSocketLeave(roomCode, socket.id);

      socket.leave(roomCode);

      void onRoomPresenceChanged(roomCode, userId);

    });



    socket.on("disconnect", () => {

      for (const roomCode of socket.rooms) {

        if (roomCode === socket.id) {

          continue;

        }

        trackSocketLeave(roomCode, socket.id);

        void onRoomPresenceChanged(roomCode, userId);

      }

    });

  });



  setInterval(() => {

    void pollActiveRooms();

  }, SPOTIFY_SYNC_INTERVAL_MS);



  setInterval(() => {

    void pollHotPlayingRooms();

  }, SPOTIFY_SYNC_FAST_MS);



  setInterval(() => {

    void sweepIdleRooms();

  }, ROOM_SWEEPER_INTERVAL_MS);



  setInterval(() => {

    void broadcastActivePlayingRooms();

  }, GAME_STATE_BROADCAST_MS);



  httpServer.listen(port, hostname, () => {

    console.log(`> Ready on http://127.0.0.1:${port}`);

  });

});


