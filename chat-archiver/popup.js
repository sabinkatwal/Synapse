const SUPPORTED_HOSTS = ["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com"];

const siteStatusEl = document.getElementById("siteStatus");
const captureBtn = document.getElementById("captureBtn");
const captureMsgEl = document.getElementById("captureMsg");
const injectBtn = document.getElementById("injectBtn");
const injectMsgEl = document.getElementById("injectMsg");
const promptTextEl = document.getElementById("promptText");
const autoSubmitEl = document.getElementById("autoSubmit");
const openSidePanelBtn = document.getElementById("openSidePanelBtn");

let activeTabId = null;
let activeWindowId = null;
let siteSupported = false;

function setMsg(el, text, ok) {
  el.textContent = text;
  el.classList.remove("ok", "err");
  el.classList.add(ok ? "ok" : "err");
  setTimeout(() => {
    el.textContent = "";
    el.classList.remove("ok", "err");
  }, 4000);
}

// The popup re-runs this fresh every time it's opened, so a one-time check
// (unlike the side panel's onActivated/onUpdated listeners) is enough.
async function checkActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    siteStatusEl.textContent = "No active tab.";
    captureBtn.disabled = true;
    injectBtn.disabled = true;
    return;
  }

  activeTabId = tab.id;
  activeWindowId = tab.windowId;

  let hostname;
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    hostname = "";
  }
  siteSupported = SUPPORTED_HOSTS.includes(hostname);

  if (siteSupported) {
    siteStatusEl.textContent = `Connected: ${hostname}`;
    siteStatusEl.classList.add("active");
    captureBtn.disabled = false;
    injectBtn.disabled = false;
  } else {
    siteStatusEl.textContent = "Open ChatGPT, Claude, or Gemini to use this.";
    siteStatusEl.classList.remove("active");
    captureBtn.disabled = true;
    injectBtn.disabled = true;
  }
}

captureBtn.addEventListener("click", async () => {
  if (!activeTabId) return;
  captureBtn.disabled = true;
  try {
    const res = await chrome.tabs.sendMessage(activeTabId, { type: "CAPTURE_CHAT" });
    if (res && res.ok) {
      setMsg(captureMsgEl, `Captured ${res.count} messages.`, true);
    } else {
      setMsg(captureMsgEl, res?.error || "Capture failed.", false);
    }
  } catch (e) {
    setMsg(captureMsgEl, "Could not reach page. Reload the tab and try again.", false);
  }
  captureBtn.disabled = !siteSupported;
});

injectBtn.addEventListener("click", async () => {
  if (!activeTabId) return;
  const text = promptTextEl.value.trim();
  if (!text) {
    setMsg(injectMsgEl, "Type a prompt first.", false);
    return;
  }
  injectBtn.disabled = true;
  try {
    const res = await chrome.tabs.sendMessage(activeTabId, {
      type: "INJECT_PROMPT",
      text,
      autoSubmit: autoSubmitEl.checked,
    });
    if (res && res.ok) {
      setMsg(injectMsgEl, "Injected.", true);
      promptTextEl.value = "";
    } else {
      setMsg(injectMsgEl, res?.error || "Injection failed.", false);
    }
  } catch (e) {
    setMsg(injectMsgEl, "Could not reach page. Reload the tab and try again.", false);
  }
  injectBtn.disabled = !siteSupported;
});

openSidePanelBtn.addEventListener("click", async () => {
  try {
    if (activeWindowId == null) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeWindowId = tab?.windowId;
    }
    await chrome.sidePanel.open({ windowId: activeWindowId });
    window.close();
  } catch (error) {
    console.error("[SYNAPSE popup] Could not open side panel:", error);
    setMsg(captureMsgEl, "Could not open side panel.", false);
  }
});

checkActiveTab();