// SYNAPSE - background service worker
importScripts("api.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("archivedChats").then(({ archivedChats }) => {
    if (!archivedChats) chrome.storage.local.set({ archivedChats: [] });
  });
});

// IMPORTANT: this must stay false. The toolbar icon opens popup.html; the side
// panel is opened on demand from a button inside the popup via
// chrome.sidePanel.open(). Chrome persists this preference per extension, so we
// set it explicitly on every service-worker start.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => console.error("[SYNAPSE background] setPanelBehavior failed:", err));

// ---- helpers --------------------------------------------------------------
function normalizeUrl(u) {
  try {
    const url = new URL(u);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`; // drop query + hash
  } catch {
    return String(u || "");
  }
}

function notifyWaking(waking) {
  // Goes to extension pages (the side panel). Ignore "no receiver" errors.
  try {
    chrome.runtime.sendMessage({ type: "SERVER_WAKING", waking }).catch(() => {});
  } catch (_) {}
}
const apiHooks = {
  onWaking: () => notifyWaking(true),
  onAwake: () => notifyWaking(false),
};

// ---- save (network calls live here, not in the content script) -------------
// mode: "check"     -> if this URL is already archived, return {duplicate:true}
//       "replace"   -> save the new capture, then delete the old copy/copies
//       "duplicate" -> save anyway as an additional copy
// The API has no update endpoint, so "replace" = POST new, then DELETE old
// (in that order, so a failed POST never loses the existing copy).
async function saveChatToServer(payload, mode = "check") {
  const { authToken } = await chrome.storage.local.get("authToken");
  if (!authToken) {
    return {
      ok: false,
      code: "AUTH",
      error: "You are not logged in. Open the SYNAPSE side panel and log in first.",
    };
  }

  try {
    const key = normalizeUrl(payload.url);
    const all = await synapseFetch("/chats", {}, apiHooks);
    const existing = (Array.isArray(all) ? all : []).filter(
      (c) => normalizeUrl(c.url) === key
    );

    if (existing.length && mode === "check") {
      const e = existing[0];
      return {
        ok: false,
        duplicate: true,
        existing: {
          id: e.id,
          title: e.title,
          captured_at: e.captured_at,
          messageCount: Array.isArray(e.messages) ? e.messages.length : undefined,
        },
        error: "This conversation is already archived.",
      };
    }

    await synapseFetch(
      "/chats",
      { method: "POST", body: JSON.stringify(payload) },
      apiHooks
    );

    let replaced = 0;
    if (mode === "replace") {
      for (const old of existing) {
        try {
          await synapseFetch(`/chats/${old.id}`, { method: "DELETE" }, apiHooks);
          replaced++;
        } catch (err) {
          console.warn("[SYNAPSE background] could not delete old copy", old.id, err);
        }
      }
    }
    return { ok: true, replaced };
  } catch (err) {
    console.error("[SYNAPSE background] save failed:", err);
    return {
      ok: false,
      code: err.code || "ERROR",
      error: err.message || "Failed to save chat.",
    };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "SAVE_CHAT") {
    saveChatToServer(msg.payload, msg.mode)
      .then(sendResponse)
      .catch((err) => {
        console.error("[SYNAPSE background] Unhandled error:", err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true; // keep the channel open for async sendResponse
  }
});

// ---- messages from the SYNAPSE web app --------------------------------------
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "PUSH_PROMPT_TO_ACTIVE_AI") return;

  storePushedPrompt(msg.text)
    .then(sendResponse)
    .catch((err) => {
      console.error("[SYNAPSE background] Could not store external prompt:", err);
      sendResponse({ ok: false, error: String(err.message || err) });
    });
  return true;
});

async function storePushedPrompt(text) {
  if (!text || typeof text !== "string") {
    return { ok: false, error: "Prompt is empty." };
  }
  await chrome.storage.local.set({
    pendingPrompt: text,
    pendingPromptUpdatedAt: new Date().toISOString(),
  });
  return { ok: true, stored: true };
}
