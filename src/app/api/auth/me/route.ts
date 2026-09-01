import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load session";
    // #region agent log
    fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
      body: JSON.stringify({
        sessionId: "cb7553",
        runId: "auth-me-post-fix",
        hypothesisId: "H-AUTH",
        location: "api/auth/me/route.ts:GET",
        message: "auth me handler error",
        data: { error: message },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.json({ user: null, error: message }, { status: 500 });
  }
}
