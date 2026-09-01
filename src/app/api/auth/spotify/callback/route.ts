import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { consumeOAuthState } from "@/lib/oauth-state";
import { writeSession } from "@/lib/session";
import { exchangeCodeForTokens, getSpotifyProfile } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, appUrl));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?error=invalid_oauth_state", appUrl));
  }

  const oauthState = await consumeOAuthState(state);
  if (!oauthState) {
    return NextResponse.redirect(new URL("/?error=invalid_oauth_state", appUrl));
  }

  try {
    const tokens = await exchangeCodeForTokens(code, oauthState.verifier);
    const profile = await getSpotifyProfile(tokens.access_token);
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const user = await db.user.upsert({
      where: { spotifyId: profile.id },
      update: {
        displayName: profile.display_name || "Spotify User",
        avatarUrl: profile.images[0]?.url ?? null,
        isGuest: false,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        tokenExpiresAt,
      },
      create: {
        spotifyId: profile.id,
        displayName: profile.display_name || "Spotify User",
        avatarUrl: profile.images[0]?.url ?? null,
        isGuest: false,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || "",
        tokenExpiresAt,
      },
    });

    const returnTo = oauthState.returnTo || "/";
    const response = NextResponse.redirect(new URL(returnTo, appUrl));
    await writeSession(response, { userId: user.id });

    return response;
  } catch (callbackError) {
    console.error("Spotify callback error:", callbackError);
    return NextResponse.redirect(new URL("/?error=auth_failed", appUrl));
  }
}
