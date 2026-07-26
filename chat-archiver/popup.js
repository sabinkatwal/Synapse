const SUPPORTED_HOSTS = ["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com"];
const API_BASE_URL = "http://127.0.0.1:8000";

const siteStatusEl = document.getElementById("siteStatus");
const captureBtn = document.getElementById("captureBtn");
const captureMsgEl = document.getElementById("captureMsg");
const injectBtn = document.getElementById("injectBtn");
const injectMsgEl = document.getElementById("injectMsg");
const promptTextEl = document.getElementById("promptText");
const autoSubmitEl = document.getElementById("autoSubmit");
const emailInputEl = document.getElementById("emailInput");
const passwordInputEl = document.getElementById("passwordInput");
const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const authMsgEl = document.getElementById("authMsg");
const chatListEl = document.getElementById("chatList");
const chatCountEl = document.getElementById("chatCount");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");

let activeTabId = null;
let siteSupported = false;

async function getAuthToken() {
  const { authToken } = await chrome.storage.local.get("authToken");
  return authToken || null;
}

async function apiRequest(path, options = {}) {
  const token = await getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function init() {
  const tab = await getActiveTab();
  if (!tab || !tab.url) {
    siteStatusEl.textContent = "No active tab.";
    return;
  }
  activeTabId = tab.id;
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
  } else {
    siteStatusEl.textContent = "Open ChatGPT, Claude, or Gemini to use this.";
    captureBtn.disabled = true;
    injectBtn.disabled = true;
  }

  await refreshChatList();
}

function setMsg(el, text, ok) {
  el.textContent = text;
  el.classList.remove("ok", "err");
  el.classList.add(ok ? "ok" : "err");
  setTimeout(() => {
    el.textContent = "";
    el.classList.remove("ok", "err");
  }, 4000);
}

registerBtn.addEventListener("click", async () => {
  const email = emailInputEl.value.trim();
  const password = passwordInputEl.value;
  if (!email || !password) {
    setMsg(authMsgEl, "Enter an email and password.", false);
    return;
  }
  try {
    const data = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await chrome.storage.local.set({ authToken: data.access_token });
    setMsg(authMsgEl, "Registered and logged in.", true);
    await refreshChatList();
  } catch (error) {
    setMsg(authMsgEl, error.message, false);
  }
});

loginBtn.addEventListener("click", async () => {
  const email = emailInputEl.value.trim();
  const password = passwordInputEl.value;
  if (!email || !password) {
    setMsg(authMsgEl, "Enter an email and password.", false);
    return;
  }
  try {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await chrome.storage.local.set({ authToken: data.access_token });
    setMsg(authMsgEl, "Logged in.", true);
    await refreshChatList();
  } catch (error) {
    setMsg(authMsgEl, error.message, false);
  }
});

captureBtn.addEventListener("click", async () => {
  if (!activeTabId) return;
  captureBtn.disabled = true;
  try {
    const res = await chrome.tabs.sendMessage(activeTabId, { type: "CAPTURE_CHAT" });
    if (res && res.ok) {
      setMsg(captureMsgEl, `Captured ${res.count} messages.`, true);
      await refreshChatList();
    } else {
      setMsg(captureMsgEl, res?.error || "Capture failed.", false);
    }
  } catch (e) {
    setMsg(captureMsgEl, "Could not reach page. Reload the tab and try again.", false);
  }
  captureBtn.disabled = false;
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
  injectBtn.disabled = false;
});

async function refreshChatList() {
  try {
    const chats = await apiRequest("/chats");
    chatCountEl.textContent = chats.length;
    chatListEl.innerHTML = "";
    if (chats.length === 0) {
      chatListEl.innerHTML = '<div id="emptyState">No captures yet.</div>';
      return;
    }
    chats
      .slice()
      .reverse()
      .forEach((c) => {
        const div = document.createElement("div");
        div.className = "chatItem";
        const date = new Date(c.captured_at).toLocaleString();
        div.innerHTML = `<span class="site">${c.site}</span> — ${c.messages.length} msgs<br/><span class="meta">${date} · ${c.title || c.url}</span>`;
        chatListEl.appendChild(div);
      });
  } catch (error) {
    chatCountEl.textContent = "0";
    chatListEl.innerHTML = `<div id="emptyState">${error.message}</div>`;
  }
}

exportBtn.addEventListener("click", async () => {
  try {
    const chats = await apiRequest("/chats");
    const blob = new Blob([JSON.stringify(chats, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-archive-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    setMsg(captureMsgEl, error.message, false);
  }
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("Delete all archived chats? This cannot be undone.")) return;
  try {
    const chats = await apiRequest("/chats");
    for (const chat of chats) {
      await apiRequest(`/chats/${chat.id}`, { method: "DELETE" });
    }
    await refreshChatList();
  } catch (error) {
    setMsg(captureMsgEl, error.message, false);
  }
});

init();
