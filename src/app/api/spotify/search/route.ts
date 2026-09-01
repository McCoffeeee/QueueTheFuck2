import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getClientCredentialsToken, getValidAccessToken, searchTracks } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const query = request.nextUrl.searchParams.get("q")?.trim();

    if (!query) {
      return NextResponse.json({ tracks: [] });
    }

    const accessToken = user.isGuest
      ? await getClientCredentialsToken()
      : await getValidAccessToken(user.id);
    const tracks = await searchTracks(accessToken, query);

    return NextResponse.json({ tracks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
