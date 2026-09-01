import crypto from "crypto";
import { db } from "@/lib/db";

const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 24;

export function normalizeDisplayName(name: string) {
  return name.trim().slice(0, DISPLAY_NAME_MAX);
}

export function validateDisplayName(name: string) {
  const normalized = normalizeDisplayName(name);
  if (normalized.length < DISPLAY_NAME_MIN) {
    return { ok: false as const, error: `Name must be at least ${DISPLAY_NAME_MIN} characters.` };
  }
  return { ok: true as const, value: normalized };
}

export async function createGuestUser(displayName: string) {
  const validation = validateDisplayName(displayName);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  return db.user.create({
    data: {
      spotifyId: `guest_${crypto.randomUUID()}`,
      displayName: validation.value,
      isGuest: true,
    },
  });
}
