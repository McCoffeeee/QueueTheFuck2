import { sealData, unsealData } from "iron-session";
import type { NextRequest, NextResponse } from "next/server";
import { sessionOptions, type SessionData } from "@/lib/session-config";

export type { SessionData } from "@/lib/session-config";
export { sessionOptions } from "@/lib/session-config";

const cookieTtl = sessionOptions.cookieOptions?.maxAge ?? 60 * 60 * 24 * 7;

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: cookieTtl,
    path: "/",
  };
}

/** Read session from request cookies (custom-server safe). */
export async function readSession(request: NextRequest): Promise<SessionData> {
  const cookie = request.cookies.get(sessionOptions.cookieName)?.value;
  if (!cookie) {
    return {};
  }

  try {
    return await unsealData<SessionData>(cookie, {
      password: sessionOptions.password,
      ttl: cookieTtl,
    });
  } catch {
    return {};
  }
}

/** Write session cookie onto a response. */
export async function writeSession(response: NextResponse, data: SessionData) {
  const sealed = await sealData(data, {
    password: sessionOptions.password,
    ttl: cookieTtl,
  });

  response.cookies.set(sessionOptions.cookieName, sealed, getCookieOptions());
}

/** Clear session cookie. */
export function destroySession(response: NextResponse) {
  response.cookies.set(sessionOptions.cookieName, "", {
    ...getCookieOptions(),
    maxAge: 0,
  });
}
