import { NextRequest, NextResponse } from "next/server";
import { requireSpotifyUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createUniqueRoomCode, getRoomState } from "@/lib/room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSpotifyUser(request);
    const code = await createUniqueRoomCode();

    const room = await db.room.create({
      data: {
        code,
        hostUserId: user.id,
        members: {
          create: {
            userId: user.id,
          },
        },
      },
    });

    // #region agent log
    fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
      body: JSON.stringify({
        sessionId: "cb7553",
        runId: "post-fix",
        hypothesisId: "H7",
        location: "api/rooms/route.ts:POST",
        message: "room created in db",
        data: { code: room.code, roomId: room.id },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    let state = null;
    try {
      state = await getRoomState(room.code, user.id);
    } catch (stateError) {
      console.warn(`[rooms] getRoomState failed after create for ${room.code}:`, stateError);
      // #region agent log
      fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
        body: JSON.stringify({
          sessionId: "cb7553",
          runId: "post-fix",
          hypothesisId: "H7",
          location: "api/rooms/route.ts:POST",
          message: "getRoomState failed after create",
          data: {
            code: room.code,
            error: stateError instanceof Error ? stateError.message : "unknown",
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    }

    return NextResponse.json(
      { code: room.code, room: state ?? { code: room.code } },
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create room";
    const status =
      message === "Unauthorized" || message === "Spotify sign-in required" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
