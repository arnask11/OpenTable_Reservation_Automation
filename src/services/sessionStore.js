const SESSION_TTL_MS = 6 * 60 * 1000; // 6 minutes

/** @type {Map<string, { browser: import('playwright-core').Browser, page: import('playwright-core').Page, createdAt: number, lastUsedAt: number, locked: boolean, warmed: boolean }>} */
const sessions = new Map();

function isExpired(entry) {
  return Date.now() - entry.createdAt > SESSION_TTL_MS;
}

export function putSession(sessionId, { browser, page }) {
  sessions.set(sessionId, {
    browser,
    page,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    locked: false,
    warmed: true,
  });
}

/**
 * Locks a warm session for exclusive use. Returns null if missing/expired.
 * Throws if the session is already in use.
 */
export function acquireSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return null;

  if (isExpired(entry)) {
    void releaseSession(sessionId);
    return null;
  }

  if (entry.locked) {
    throw new Error(`Warm session ${sessionId} is busy`);
  }

  entry.locked = true;
  entry.lastUsedAt = Date.now();
  return entry;
}

export function unlockSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (entry) {
    entry.locked = false;
    entry.lastUsedAt = Date.now();
  }
}

export async function releaseSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return;

  sessions.delete(sessionId);
  await entry.browser.close().catch(() => {});
}

export function getSessionTtlMs() {
  return SESSION_TTL_MS;
}
