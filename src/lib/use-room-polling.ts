"use client";

import { useEffect, useRef } from "react";
import { apiFetch, parseApiJson } from "@/lib/api-client";
import { CLIENT_FALLBACK_POLL_MS } from "@/lib/constants";
import type { RoomStateView } from "@/lib/types";

export function useRoomPolling(
  code: string,
  enabled: boolean,
  onState: (state: RoomStateView) => void,
  intervalMs: number = CLIENT_FALLBACK_POLL_MS,
) {
  const onStateRef = useRef(onState);

  useEffect(() => {
    onStateRef.current = onState;
  }, [onState]);

  useEffect(() => {
    if (!enabled || !code) {
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const response = await apiFetch(`/api/rooms/${code}`);
        if (!response.ok || cancelled) {
          if (!cancelled && response.status === 404) {
            // #region agent log
            fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
              body: JSON.stringify({
                sessionId: "cb7553",
                runId: "host-leave-post-fix",
                hypothesisId: "H4",
                location: "use-room-polling.ts:poll",
                message: "poll got 404 navigating home",
                data: { roomCode: code, pathname: window.location.pathname },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            window.location.assign("/");
          }
          return;
        }

        const data = await parseApiJson<{ room: RoomStateView }>(response);
        if (!cancelled && data.room) {
          onStateRef.current(data.room);
        }
      } catch {
        // Polling is best-effort fallback when socket is disconnected
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), intervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [code, enabled, intervalMs]);
}
