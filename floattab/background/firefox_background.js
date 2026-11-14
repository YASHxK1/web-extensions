"use strict";

const api = globalThis.browser;
const policy = globalThis.FloatTabPolicy;
const runtime = globalThis.FloatTabRuntime;
const SESSION_KEY = "firefoxCompactSessions";
const sessions = new Map();

function serializeSessions() {
  return [...sessions.values()];
}

async function persistSessions() {
  await api.storage.session.set({ [SESSION_KEY]: serializeSessions() });
}

function updateBadge() {
  const count = sessions.size;
  api.action.setBadgeText({ text: count ? String(count) : "" });
  if (count) {
    api.action.setBadgeBackgroundColor({ color: "#6366f1" });
  }
}

async function removeSession(sourceTabId, options = {}) {
  const { closeWindow = false } = options;
  const session = sessions.get(sourceTabId);
  if (!session) return;

  sessions.delete(sourceTabId);
  if (closeWindow) {
    try {
      await api.windows.remove(session.windowId);
    } catch (_) {
      // The user may already have closed the compact window.
    }
  }

  await persistSessions();
  updateBadge();
}

async function reconcileSessions() {
  const stored = await api.storage.session.get(SESSION_KEY);
  const candidates = Array.isArray(stored[SESSION_KEY])
    ? stored[SESSION_KEY]
    : serializeSessions();

  const liveState = new Map();
  for (const candidate of candidates) {
    try {
      const [sourceTab, floatTab, compactWindow] = await Promise.all([
        api.tabs.get(candidate.sourceTabId),
        api.tabs.get(candidate.floatTabId),
        api.windows.get(candidate.windowId),
      ]);

      liveState.set(candidate.sourceTabId, {
        sourceTab,
        floatTab,
        window: compactWindow,
      });
    } catch (_) {
      // Any missing tab or window makes the stored session stale.
    }
  }

  sessions.clear();
  for (const candidate of runtime.retainLiveSessions(candidates, liveState)) {
    sessions.set(candidate.sourceTabId, candidate);
  }

  await persistSessions();
  updateBadge();
}

async function openCompactWindow(sourceTabId) {
  await reconcileSessions();

  const existing = sessions.get(sourceTabId);
  if (existing) {
    await api.windows.update(existing.windowId, { focused: true });
    return { success: true, mode: "compact", focusedExisting: true };
  }

  const sourceTab = await api.tabs.get(sourceTabId);
  if (policy.isRestrictedUrl(sourceTab.url || "")) {
    return { success: false, errorCode: "RESTRICTED_URL" };
  }

  let duplicate;
  try {
    duplicate = await api.tabs.duplicate(sourceTabId);
    const compactWindow = await api.windows.create({
      tabId: duplicate.id,
      type: "popup",
      width: 854,
      height: 480,
      focused: true,
    });

    const session = {
      sourceTabId,
      floatTabId: duplicate.id,
      windowId: compactWindow.id,
    };
    sessions.set(sourceTabId, session);
    await persistSessions();
    updateBadge();

    return { success: true, mode: "compact" };
  } catch (error) {
    if (duplicate?.id !== undefined) {
      try {
        await api.tabs.remove(duplicate.id);
      } catch (_) {}
    }
    return {
      success: false,
      errorCode: "COMPACT_WINDOW_FAILED",
      message: error.message,
    };
  }
}

api.tabs.onRemoved.addListener((tabId) => {
  for (const [sourceTabId, session] of sessions) {
    if (tabId === sourceTabId) {
      void removeSession(sourceTabId, { closeWindow: true });
      return;
    }
    if (tabId === session.floatTabId) {
      void removeSession(sourceTabId);
      return;
    }
  }
});

api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url || !sessions.has(tabId)) return;
  if (policy.isRestrictedUrl(changeInfo.url)) {
    void removeSession(tabId, { closeWindow: true });
  }
});

api.windows.onRemoved.addListener((windowId) => {
  for (const [sourceTabId, session] of sessions) {
    if (session.windowId === windowId) {
      void removeSession(sourceTabId);
      return;
    }
  }
});

api.runtime.onMessage.addListener(async (message) => {
  switch (message.type) {
    case "GET_PLATFORM_CAPABILITIES":
      return runtime.getCapabilities("firefox");

    case "GET_PIP_STATE": {
      await reconcileSessions();
      const session = sessions.get(message.tabId);
      return {
        success: true,
        pipState: session
          ? { active: true, mode: "compact", tabId: message.tabId }
          : { active: false, mode: null, tabId: message.tabId ?? null },
      };
    }

    case "GET_ALL_PIP_COUNT":
      await reconcileSessions();
      return { success: true, count: sessions.size };

    case "OPEN_COMPACT_WINDOW":
      return openCompactWindow(message.tabId);

    case "CLOSE_PIP":
      await removeSession(message.tabId, { closeWindow: true });
      return { success: true };

    default:
      return { success: false, errorCode: "UNKNOWN_MESSAGE" };
  }
});

void reconcileSessions();
