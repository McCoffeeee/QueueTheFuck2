import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { readSession } from "@/lib/session";

const userSelect = {
  id: true,
  spotifyId: true,
  displayName: true,
  avatarUrl: true,
  isGuest: true,
} as const;

export async function getCurrentUser(request: NextRequest) {
  const session = await readSession(request);
  if (!session.userId) {
    return null;
  }

  return db.user.findUnique({
    where: { id: session.userId },
    select: userSelect,
  });
}

export async function requireCurrentUser(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireSpotifyUser(request: NextRequest) {
  const user = await requireCurrentUser(request);
  if (user.isGuest) {
    throw new Error("Spotify sign-in required");
  }
  return user;
}
