import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createGuestUser } from "@/lib/guest";
import { writeSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const existing = await getCurrentUser(request);
    if (existing) {
      return NextResponse.json({ user: existing });
    }

    const { displayName } = (await request.json()) as { displayName?: string };
    if (!displayName) {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }

    const user = await createGuestUser(displayName);
    const response = NextResponse.json({
      user: {
        id: user.id,
        spotifyId: user.spotifyId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isGuest: user.isGuest,
      },
    });

    await writeSession(response, { userId: user.id });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create guest session";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
