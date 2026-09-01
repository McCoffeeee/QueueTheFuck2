import { RoomPageClient } from "@/components/RoomPageClient";
import { getRoomState } from "@/lib/room";
import { notFound } from "next/navigation";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const room = await getRoomState(code);

  if (!room) {
    notFound();
  }

  return <RoomPageClient initialRoom={room} />;
}
