"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { GuestJoinForm } from "@/components/GuestJoinForm";
import { apiJson } from "@/lib/api-client";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"code" | "name">("code");
  const [error, setError] = useState<string | null>(null);

  async function handleJoined() {
    router.push(`/room/${code.trim().toUpperCase()}`);
  }

  async function joinWithExistingSession() {
    const roomCode = code.trim().toUpperCase();
    setError(null);
    try {
      const meData = await apiJson<{ user?: { id: string } }>("/api/auth/me");
      if (meData.user) {
        await apiJson(`/api/rooms/${roomCode}/join`, { method: "POST" });
        router.push(`/room/${roomCode}`);
        return;
      }
      setStep("name");
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Failed to join room");
    }
  }

  if (step === "name") {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
        <GuestJoinForm
          roomCode={code.trim().toUpperCase()}
          onJoined={() => void handleJoined()}
          title="Almost there"
          description="Pick a name your friends will see in the game."
        />
        <Button className="w-full" variant="ghost" onClick={() => setStep("code")}>
          Back
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Join a Room</h1>
        <p className="mt-2 text-muted">Enter the room code from your host. No Spotify account needed.</p>
      </div>

      <input
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        maxLength={6}
        placeholder="ABC123"
        className="w-full rounded-full border border-white/10 bg-card px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] outline-none focus:border-spotify"
      />

      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      <Button className="w-full" disabled={code.trim().length < 4} onClick={() => void joinWithExistingSession()}>
        Continue
      </Button>

      <Button className="w-full" variant="ghost" onClick={() => router.push("/")}>
        Back home
      </Button>
    </main>
  );
}
