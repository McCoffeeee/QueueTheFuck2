import { db } from "@/lib/db";

type QueueTrack = {
  id: string;
  addedByUserId: string;
};

function shuffleInPlace<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function isValidTailOrder(head: QueueTrack, tail: QueueTrack[]): boolean {
  if (tail.length > 0 && tail[0].addedByUserId === head.addedByUserId) {
    return false;
  }

  for (let index = 1; index < tail.length; index += 1) {
    if (tail[index].addedByUserId === tail[index - 1].addedByUserId) {
      return false;
    }
  }

  return true;
}

function shuffleTailConstrained(head: QueueTrack, tail: QueueTrack[]): QueueTrack[] {
  if (tail.length <= 1) {
    return tail;
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const shuffled = shuffleInPlace(tail);
    if (isValidTailOrder(head, shuffled)) {
      return shuffled;
    }
  }

  return shuffleInPlace(tail);
}

export async function backfillQueuePositions(): Promise<void> {
  const rooms = await db.room.findMany({ select: { id: true } });

  for (const room of rooms) {
    const tracks = await db.roomTrack.findMany({
      where: {
        roomId: room.id,
        revealedAt: null,
        status: { in: ["queued", "playing"] },
      },
      orderBy: { addedAt: "asc" },
    });

    await Promise.all(
      tracks.map((track, index) =>
        db.roomTrack.update({
          where: { id: track.id },
          data: { queuePosition: index },
        }),
      ),
    );
  }
}

export async function shuffleQueueTail(roomId: string): Promise<void> {
  const queued = await db.roomTrack.findMany({
    where: {
      roomId,
      status: "queued",
      revealedAt: null,
    },
    orderBy: { queuePosition: "asc" },
  });

  if (queued.length <= 1) {
    if (queued.length === 1) {
      await db.roomTrack.update({
        where: { id: queued[0].id },
        data: { queuePosition: 0 },
      });
      console.log(`[queue] shuffle skipped, single head ${queued[0].id} in room ${roomId}`);
    }
    return;
  }

  const head = queued[0];
  const tail = shuffleTailConstrained(head, queued.slice(1));
  const ordered = [head, ...tail];

  console.log(
    `[queue] shuffled tail (${tail.length} tracks), fixed head ${head.id} in room ${roomId}`,
  );

  await db.$transaction(
    ordered.map((track, index) =>
      db.roomTrack.update({
        where: { id: track.id },
        data: { queuePosition: index },
      }),
    ),
  );
}
