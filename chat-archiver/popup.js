const msg = document.getElementById("msg");
const siteStatus = document.getElementById("siteStatus");
const captureBtn = document.getElementById("capture");
const injectBtn = document.getElementById("inject");
const promptEl = document.getElementById("prompt");
const autoSubmitEl = document.getElementById("autoSubmit");
const supportedHosts = new Set([
  "chatgpt.com",
  "www.chatgpt.com",
  "chat.openai.com",
  "claude.ai",
  "gemini.google.com",
]);
let activeTabId = null;

function showMessage(text, ok = false) {
  msg.textContent = text;
  msg.style.color = ok ? "#82e6a8" : "#ff8a8a";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url) throw new Error("No active tab found.");
  const hostname = new URL(tab.url).hostname;
  if (!supportedHosts.has(hostname)) {
    throw new Error("Open a ChatGPT, Claude, or Gemini chat first.");
  }
  return tab;
}

async function sendToTab(tabId, message) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  return chrome.tabs.sendMessage(tabId, message);
}

async function capture() {
  captureBtn.disabled = true;
  try {
    const { authToken } = await chrome.storage.local.get("authToken");
    if (!authToken) throw new Error("Please log in from the side panel before capturing.");
    const res = await sendToTab(activeTabId, { type: "CAPTURE_CHAT_V4" });
    let result = res;
    if (res && res.duplicate) {
      const replace = confirm(
        `This conversation is already archived (${res.existing?.messageCount ?? "?"} messages).\n\n` +
        "OK = replace it. Cancel = keep the old copy."
      );
      if (replace) {
        result = await sendToTab(activeTabId, {
          type: "CAPTURE_CHAT_V4",
          mode: "replace",
          reuse: true,
        });
      } else if (confirm("Save it as an additional copy instead?")) {
        result = await sendToTab(activeTabId, {
          type: "CAPTURE_CHAT_V4",
          mode: "duplicate",
          reuse: true,
        });
      } else {
        showMessage("Not saved (already archived).", true);
        return;
      }
    }
    if (result && result.ok) showMessage(`Captured ${result.count} messages.`, true);
    else showMessage(result?.error || "Capture failed.");
  } catch (error) {
    showMessage(error.message || String(error));
  } finally {
    captureBtn.disabled = false;
  }
}

async function inject() {
  const text = promptEl.value.trim();
  if (!text) {
    showMessage("Type a prompt first.");
    return;
  }
  injectBtn.disabled = true;
  try {
    const result = await sendToTab(activeTabId, {
      type: "INJECT_PROMPT",
      text,
      autoSubmit: autoSubmitEl.checked,
    });
    if (!result || !result.ok) throw new Error(result?.error || "Injection failed.");
    promptEl.value = "";
    showMessage("Prompt injected.", true);
  } catch (error) {
    showMessage(error.message || String(error));
  } finally {
    injectBtn.disabled = false;
  }
}

async function init() {
  try {
    const tab = await getActiveTab();
    activeTabId = tab.id;
    siteStatus.textContent = `Connected: ${new URL(tab.url).hostname}`;
    captureBtn.disabled = false;
    injectBtn.disabled = false;
  } catch (error) {
    siteStatus.textContent = "Unsupported page";
    captureBtn.disabled = true;
    injectBtn.disabled = true;
    showMessage(error.message || String(error));
  }
}

captureBtn.addEventListener("click", capture);
injectBtn.addEventListener("click", inject);

document.getElementById("openPanel").addEventListener("click", async () => {
  try {
    const win = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: win.id });
    window.close();
  } catch (error) {
    showMessage(`Could not open the side panel: ${error.message || error}`);
  }
});

init();
