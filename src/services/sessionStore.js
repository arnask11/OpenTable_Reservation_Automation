const SESSION_TTL_MS = 6 * 60 * 1000; // 6 minutes

/** @type {Map<string, { browser: import('playwright-core').Browser, page: import('playwright-core').Page, createdAt: number, lastUsedAt: number, locked: boolean, warmed: boolean, callId?: string }>} */
const sessions = new Map();

/** @type {Map<string, string>} callId → sessionId */
const callIdIndex = new Map();

function isExpired(entry) {
  return Date.now() - entry.createdAt > SESSION_TTL_MS;
}

export function putSession(sessionId, { browser, page, callId }) {
  if (callId) {
    const existingSessionId = callIdIndex.get(callId);
    if (existingSessionId && existingSessionId !== sessionId) {
      void releaseSession(existingSessionId);
    }
    callIdIndex.set(callId, sessionId);
  }

  sessions.set(sessionId, {
    browser,
    page,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    locked: false,
    warmed: true,
    callId,
  });
}

export function getSessionIdByCallId(callId) {
  if (!callId) return null;
  const sessionId = callIdIndex.get(callId);
  if (!sessionId) return null;

  const entry = sessions.get(sessionId);
  if (!entry || isExpired(entry)) {
    void releaseSession(sessionId);
    return null;
  }

  return sessionId;
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
  if (entry.callId && callIdIndex.get(entry.callId) === sessionId) {
    callIdIndex.delete(entry.callId);
  }
  await entry.browser.close().catch(() => {});
}

export function getSessionTtlMs() {
  return SESSION_TTL_MS;
}
