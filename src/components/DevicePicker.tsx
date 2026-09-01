"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { apiFetch, apiMutation, parseApiJson } from "@/lib/api-client";

interface Device {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
}

interface DevicePickerProps {
  roomCode: string;
  selectedDeviceId?: string | null;
}

export function DevicePicker({ roomCode, selectedDeviceId }: DevicePickerProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    async function loadDevices() {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch(`/api/spotify/devices?room=${roomCode}`);
        const data = await parseApiJson<{ devices?: Device[]; error?: string }>(response);
        if (!response.ok) {
          throw new Error(data.error || "Failed to load devices");
        }
        setDevices(data.devices || []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load devices");
      } finally {
        setLoading(false);
      }
    }

    void loadDevices();
  }, [roomCode]);

  async function selectDevice(deviceId: string) {
    setSaving(deviceId);
    setError(null);
    try {
      await apiMutation(`/api/rooms/${roomCode}/device`, {
        method: "POST",
        body: JSON.stringify({ deviceId }),
      });
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "Failed to select device");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading Spotify devices...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (devices.length === 0) {
    return (
      <p className="text-sm text-muted">
        No Spotify devices found. Open Spotify on your phone, desktop, or speaker, then refresh.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">Playback device</p>
      {devices.map((device) => (
        <Button
          key={device.id || device.name}
          variant={selectedDeviceId === device.id ? "primary" : "secondary"}
          className="w-full justify-between"
          disabled={!device.id || saving === device.id}
          onClick={() => device.id && void selectDevice(device.id)}
        >
          <span>{device.name}</span>
          <span className="text-xs opacity-70">{device.type}</span>
        </Button>
      ))}
    </div>
  );
}
