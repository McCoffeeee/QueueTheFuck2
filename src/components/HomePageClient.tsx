"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { apiFetch, apiJson } from "@/lib/api-client";

interface User {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest?: boolean;
}

export function HomePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      const canonical = new URL(appUrl);
      if (window.location.hostname !== canonical.hostname) {
        window.location.replace(
          `${canonical.origin}${window.location.pathname}${window.location.search}`,
        );
        return;
      }
    }
  }, []);

  useEffect(() => {
    const authError = searchParams.get("error");
    if (authError) {
      setError(`Sign-in failed: ${authError}`);
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadUser() {
      try {
        const data = await apiJson<{ user?: User | null }>("/api/auth/me");
        setUser(data.user ?? null);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    void loadUser();
  }, []);

  async function createRoom() {
    setCreating(true);
    setError(null);
    try {
      const data = await apiJson<{ code?: string; room?: { code?: string } }>("/api/rooms", {
        method: "POST",
      });
      const roomCode = data.code ?? data.room?.code;
      if (!roomCode) {
        throw new Error("Server did not return a room code");
      }

      // #region agent log
      fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
        body: JSON.stringify({
          sessionId: "cb7553",
          runId: "post-fix",
          hypothesisId: "H7,H8",
          location: "HomePageClient.tsx:createRoom",
          message: "navigating to room",
          data: { roomCode },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      window.location.assign(`/room/${roomCode}`);
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Failed to create room";
      setError(message);

      // #region agent log
      fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
        body: JSON.stringify({
          sessionId: "cb7553",
          runId: "post-fix",
          hypothesisId: "H7,H8",
          location: "HomePageClient.tsx:createRoom",
          message: "create room failed",
          data: { error: message },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-6">
        <p className="text-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-8 p-6">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-spotify">Party Game</p>
        <h1 className="mt-2 text-4xl font-bold">QUEUE THE F!#@!K</h1>
        <p className="mt-3 text-muted">
          Build a Spotify queue with friends and ask Queue the F#@!*&K added this???
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">{error}</p>}

      {!user ? (
        <div className="space-y-4">
          <Button className="w-full" variant="secondary" onClick={() => router.push("/join")}>
            Join Room as Guest
          </Button>
          <Button
            className="w-full"
            onClick={() => {
              window.location.href = "/api/auth/spotify";
            }}
          >
            Sign in with Spotify to Host
          </Button>
          <p className="text-center text-xs text-muted">
            Guests only need a name. Hosts need Spotify Premium and an active device.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card p-4">
            <Avatar name={user.displayName} src={user.avatarUrl} size={48} />
            <div>
              <p className="font-medium">{user.displayName}</p>
              <p className="text-sm text-muted">{user.isGuest ? "Playing as guest" : "Signed in with Spotify"}</p>
            </div>
          </div>

          {!user.isGuest && (
            <Button className="w-full" onClick={() => void createRoom()} disabled={creating}>
              {creating ? "Creating room..." : "Create Room"}
            </Button>
          )}
          <Button className="w-full" variant={user.isGuest ? "primary" : "secondary"} onClick={() => router.push("/join")}>
            Join Room
          </Button>
          <Button
            className="w-full"
            variant="ghost"
            onClick={async () => {
              await apiFetch("/api/auth/logout", { method: "POST" });
              setUser(null);
            }}
          >
            Sign out
          </Button>
        </div>
      )}
    </main>
  );
}
