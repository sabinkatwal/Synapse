// SYNAPSE - background service worker

const API_BASE = "https://synapse-wqm8.onrender.com";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("archivedChats").then(({ archivedChats }) => {
    if (!archivedChats) chrome.storage.local.set({ archivedChats: [] });
  });
});

// IMPORTANT: this must be false. The toolbar icon opens popup.html (see
// manifest.json's action.default_popup) — the side panel is opened on
// demand from a button inside the popup via chrome.sidePanel.open().
// A previous version of this file set this to `true`, and Chrome persists
// that preference per-extension; simply removing the call later does NOT
// clear the stored value. Setting it to `false` here explicitly overwrites
// that leftover state so the toolbar icon reliably opens the popup again.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => console.error("[SYNAPSE background] setPanelBehavior failed:", err));

// Handles network requests to the local archive server on behalf of
// content scripts. Content scripts inherit the page's security context
// (e.g. https://claude.ai), so fetching the API from them
// can be blocked as mixed content. The service worker runs in the
// extension's own context (chrome-extension://...) and is not subject
// to that restriction.
async function saveChatToServer(payload) {
  const { authToken } = await chrome.storage.local.get("authToken");
  if (!authToken) {
    return { ok: false, error: "Please log in first from the extension popup." };
  }

  let response;
  try {
    response = await fetch(`${API_BASE}/chats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[SYNAPSE background] fetch failed:", err);
    return {
      ok: false,
      error: `Could not reach the archive server at ${API_BASE}. Is it running?`,
    };
  }

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.text();
    } catch {
      errorData = `Server returned ${response.status}`;
    }
    return { ok: false, error: errorData || "Failed to save chat." };
  }

  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SAVE_CHAT") {
    saveChatToServer(msg.payload)
      .then(sendResponse)
      .catch((err) => {
        console.error("[SYNAPSE background] Unhandled error:", err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true; // keep the message channel open for async sendResponse
  }
});

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "PUSH_PROMPT_TO_ACTIVE_AI") return;

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