import { db } from "@/lib/db";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function createOAuthState(state: string, verifier: string, returnTo: string) {
  await purgeExpiredOAuthStates();

  await db.oAuthState.create({
    data: {
      state,
      verifier,
      returnTo,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    },
  });
}

export async function consumeOAuthState(state: string) {
  await purgeExpiredOAuthStates();

  const record = await db.oAuthState.findUnique({ where: { state } });
  if (!record || record.expiresAt < new Date()) {
    if (record) {
      await db.oAuthState.delete({ where: { state } });
    }
    return null;
  }

  await db.oAuthState.delete({ where: { state } });
  return record;
}

async function purgeExpiredOAuthStates() {
  await db.oAuthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
