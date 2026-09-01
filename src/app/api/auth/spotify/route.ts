import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/oauth-state";
import { generateOAuthState, generatePkcePair, getSpotifyAuthorizeUrl } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/";

  const { verifier, challenge } = generatePkcePair();
  const state = generateOAuthState();
  const authorizeUrl = getSpotifyAuthorizeUrl(state, challenge);

  await createOAuthState(state, verifier, returnTo);

  return NextResponse.redirect(authorizeUrl);
}
