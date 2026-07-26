// SYNAPSE - background service worker

const API_BASE = "http://127.0.0.1:8000";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("archivedChats").then(({ archivedChats }) => {
    if (!archivedChats) chrome.storage.local.set({ archivedChats: [] });
  });
});

// Clicking the toolbar icon opens the side panel (no default_popup is set,
// so action.onClicked fires normally).
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("[SYNAPSE background] setPanelBehavior failed:", err));

// Handles network requests to the local archive server on behalf of
// content scripts. Content scripts inherit the page's security context
// (e.g. https://claude.ai), so fetching http://127.0.0.1:8000 from them
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