// SYNAPSE side panel. Requires api.js (loaded before this file in sidepanel.html).

const SUPPORTED_HOSTS = ["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com"];

// ============================================================
// Theme Management
// ============================================================

const THEME_KEY = "synapse-theme";
const DARK_THEME = "dark";
const LIGHT_THEME = "light";

function initTheme() {
  const themeLink = document.getElementById("themeLink");
  const themeToggle = document.getElementById("themeToggle");

  let savedTheme = localStorage.getItem(THEME_KEY);
  if (!savedTheme) {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    savedTheme = prefersDark ? DARK_THEME : LIGHT_THEME;
  }
  applyTheme(savedTheme, themeLink, themeToggle);

  themeToggle.addEventListener("click", () => {
    const currentTheme = themeLink.href.includes("dark") ? DARK_THEME : LIGHT_THEME;
    const newTheme = currentTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME;
    applyTheme(newTheme, themeLink, themeToggle);
    localStorage.setItem(THEME_KEY, newTheme);
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(e.matches ? DARK_THEME : LIGHT_THEME, themeLink, themeToggle);
    }
  });
}

function applyTheme(theme, themeLink, themeToggle) {
  const isDark = theme === DARK_THEME;
  themeLink.href = isDark ? "sidepanel-dark.css" : "sidepanel-light.css";
  themeToggle.textContent = isDark ? "☀️" : "🌙";
  themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTheme);
} else {
  initTheme();
}

// ============================================================

const siteStatusEl = document.getElementById("siteStatus");
const serverStateEl = document.getElementById("serverState");
const captureBtn = document.getElementById("captureBtn");
const captureMsgEl = document.getElementById("captureMsg");
const injectBtn = document.getElementById("injectBtn");
const injectMsgEl = document.getElementById("injectMsg");
const promptTextEl = document.getElementById("promptText");
const autoSubmitEl = document.getElementById("autoSubmit");
const includeMemoryContextEl = document.getElementById("includeMemoryContext");
const emailInputEl = document.getElementById("emailInput");
const passwordInputEl = document.getElementById("passwordInput");
const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const authMsgEl = document.getElementById("authMsg");
const loggedOutViewEl = document.getElementById("loggedOutView");
const loggedInViewEl = document.getElementById("loggedInView");
const userEmailEl = document.getElementById("userEmail");
const avatarInitialEl = document.getElementById("avatarInitial");
const logoutBtn = document.getElementById("logoutBtn");
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

async function getStoredEmail() {
  const { userEmail } = await chrome.storage.local.get("userEmail");
  return userEmail || null;
}

// ---- server "waking up" state (Render cold start) --------------------------
function showServerState(text) {
  serverStateEl.textContent = text;
  serverStateEl.style.display = text ? "block" : "none";
}
const apiHooks = {
  onWaking: () =>
    showServerState("Server is waking up (free-tier cold start). This can take up to a minute…"),
  onAwake: () => showServerState(""),
};
function apiRequest(path, options = {}) {
  return synapseFetch(path, options, apiHooks);
}

// The background worker reports its own slow requests (saves), and the content
// script reports capture progress.
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "SERVER_WAKING") {
    apiHooks[msg.waking ? "onWaking" : "onAwake"]();
  } else if (msg.type === "CAPTURE_PROGRESS" && captureBtn.disabled) {
    setMsg(captureMsgEl, msg.text, true, true);
  }
});

// ---- message helper (timer per element so old timeouts can't wipe new text) --
const msgTimers = new WeakMap();
function setMsg(el, text, ok, sticky = false) {
  clearTimeout(msgTimers.get(el));
  el.textContent = text;
  el.classList.remove("ok", "err");
  if (text) el.classList.add(ok ? "ok" : "err");
  if (text && !sticky) {
    msgTimers.set(
      el,
      setTimeout(() => {
        el.textContent = "";
        el.classList.remove("ok", "err");
      }, 6000)
    );
  }
}

function h(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// ---- Active tab tracking ------------------------------------------------
async function refreshActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    activeTabId = null;
    siteSupported = false;
    siteStatusEl.textContent = "No active tab.";
    siteStatusEl.classList.remove("active");
    captureBtn.disabled = true;
    injectBtn.disabled = true;
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
    siteStatusEl.classList.remove("active");
  }
  captureBtn.disabled = !siteSupported;
  injectBtn.disabled = !siteSupported;
}

chrome.tabs.onActivated.addListener(refreshActiveTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // status "complete" = full load; changeInfo.url = SPA navigation to another chat
  if (tabId === activeTabId && (changeInfo.status === "complete" || changeInfo.url)) {
    refreshActiveTab();
  }
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) refreshActiveTab();
});

// ---- Send to tab, injecting content.js first so extension reloads pick up fixes.
const NO_RECEIVER = /Receiving end does not exist|Could not establish connection/i;

async function sendToTab(tabId, message) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  await new Promise((r) => setTimeout(r, 100));
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    if (!NO_RECEIVER.test(String(err && err.message))) throw err;
    await new Promise((r) => setTimeout(r, 200));
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

function friendlyTabError(e) {
  const m = String((e && e.message) || e);
  if (/Cannot access|cannot be scripted|extensions gallery/i.test(m)) {
    return "SYNAPSE can't run on this page. Open a ChatGPT, Claude or Gemini chat.";
  }
  return `Could not reach the page: ${m}`;
}

// ---- Auth ---------------------------------------------------------------
async function refreshAuthUI() {
  const token = await getAuthToken();
  if (token) {
    const email = await getStoredEmail();
    userEmailEl.textContent = email || "Logged in";
    avatarInitialEl.textContent = (email || "?").trim().charAt(0).toUpperCase();
    loggedOutViewEl.style.display = "none";
    loggedInViewEl.style.display = "block";
  } else {
    loggedOutViewEl.style.display = "block";
    loggedInViewEl.style.display = "none";
  }
}

async function loadPendingPrompt() {
  const { pendingPrompt } = await chrome.storage.local.get("pendingPrompt");
  if (!pendingPrompt || promptTextEl.value.trim()) return;
  promptTextEl.value = pendingPrompt;
  setMsg(injectMsgEl, "Prompt received from Synapse webapp.", true);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.authToken) refreshAuthUI();
  if (!changes.pendingPrompt?.newValue || promptTextEl.value.trim()) return;
  promptTextEl.value = changes.pendingPrompt.newValue;
  setMsg(injectMsgEl, "Prompt received from Synapse webapp.", true);
});

logoutBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove(["authToken", "userEmail"]);
  setMsg(authMsgEl, "Logged out.", true);
  await refreshAuthUI();
  await refreshChatList();
});

async function authenticate(path, successText) {
  const email = emailInputEl.value.trim();
  const password = passwordInputEl.value;
  if (!email || !password) {
    setMsg(authMsgEl, "Enter an email and password.", false);
    return;
  }
  setMsg(authMsgEl, "Contacting server…", true, true);
  try {
    const data = await apiRequest(path, {
      method: "POST",
      body: JSON.stringify({ email, password }),
      noAuth: true,
    });
    await chrome.storage.local.set({ authToken: data.access_token, userEmail: email });
    passwordInputEl.value = "";
    setMsg(authMsgEl, successText, true);
    await refreshAuthUI();
    await refreshChatList();
  } catch (error) {
    setMsg(authMsgEl, error.message, false);
  }
}
registerBtn.addEventListener("click", () => authenticate("/auth/register", "Registered and logged in."));
loginBtn.addEventListener("click", () => authenticate("/auth/login", "Logged in."));

// ---- Capture / Inject ----------------------------------------------------
captureBtn.addEventListener("click", async () => {
  if (!activeTabId) return;

  if (!(await getAuthToken())) {
    setMsg(captureMsgEl, "Please log in first (Account section above), then capture again.", false);
    return;
  }

  captureBtn.disabled = true;
  setMsg(captureMsgEl, "Capturing… long chats take a while because every message is loaded first.", true, true);
  try {
    let res = await sendToTab(activeTabId, { type: "CAPTURE_CHAT_V2" });

    if (res && res.duplicate) {
      const ex = res.existing || {};
      const when = ex.captured_at ? new Date(ex.captured_at).toLocaleString() : "earlier";
      const replace = confirm(
        `This conversation is already archived (${ex.messageCount ?? "?"} messages, saved ${when}).\n\n` +
          "OK = replace the old copy with this new capture.\nCancel = don't replace."
      );
      if (replace) {
        res = await sendToTab(activeTabId, { type: "CAPTURE_CHAT_V2", mode: "replace", reuse: true });
      } else if (confirm("Save it as an additional copy instead?")) {
        res = await sendToTab(activeTabId, { type: "CAPTURE_CHAT_V2", mode: "duplicate", reuse: true });
      } else {
        setMsg(captureMsgEl, "Not saved (already archived).", true);
        return;
      }
    }

    if (res && res.ok) {
      const extra = res.replaced ? " (replaced the previous copy)" : "";
      setMsg(captureMsgEl, `Captured ${res.count} messages${extra}.`, true);
      await refreshChatList();
    } else if (res && res.code === "AUTH") {
      await refreshAuthUI();
      setMsg(captureMsgEl, res.error || "Please log in again.", false);
    } else {
      if (res && res.diagnostics) {
        console.warn("[SYNAPSE side panel] capture diagnostics:", res.diagnostics);
      }
      let detail = "";
      if (res && res.diagnostics) {
        const d = res.diagnostics;
        detail = ` Selector: ${d.winningSelector || "none"}. Roles: ${JSON.stringify(d.roles || {})}. Text: ${JSON.stringify(d.text || {})}.`;
      }
      setMsg(captureMsgEl, (res?.error || "Capture failed.") + detail, false);
    }
  } catch (e) {
    setMsg(captureMsgEl, friendlyTabError(e), false);
  } finally {
    captureBtn.disabled = !siteSupported;
  }
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
    let prompt = text;
    if (includeMemoryContextEl.checked && (await getAuthToken())) {
      try {
        const contextResponse = await apiRequest("/memories/context", {
          method: "POST",
          body: JSON.stringify({ query: text, limit: 5 }),
        });
        if (contextResponse && contextResponse.context) {
          prompt = `${contextResponse.context}\n\nUse this context only when relevant.\n\nUser request:\n${text}`;
        }
      } catch (error) {
        console.warn("[SYNAPSE side panel] Memory context unavailable:", error);
      }
    }

    const res = await sendToTab(activeTabId, {
      type: "INJECT_PROMPT",
      text: prompt,
      autoSubmit: autoSubmitEl.checked,
    });
    if (res && res.ok) {
      setMsg(injectMsgEl, "Injected.", true);
      promptTextEl.value = "";
      await chrome.storage.local.remove("pendingPrompt");
    } else {
      setMsg(injectMsgEl, res?.error || "Injection failed.", false);
    }
  } catch (e) {
    setMsg(injectMsgEl, friendlyTabError(e), false);
  } finally {
    injectBtn.disabled = !siteSupported;
  }
});

// ---- Chat list (DOM built with textContent; no innerHTML with page data) ------
function emptyState(text) {
  const d = h("div", "", text);
  d.id = "emptyState";
  return d;
}

function safeOpen(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.protocol === "http:") chrome.tabs.create({ url: u.href });
  } catch (_) {}
}

function buildChatItem(c) {
  const div = h("div", "chatItem");
  const date = c.captured_at ? new Date(c.captured_at).toLocaleString() : "";
  const n = Array.isArray(c.messages) ? c.messages.length : 0;
  div.appendChild(h("div", "site", c.site || ""));
  div.appendChild(h("div", "meta", `${n} msgs \u00b7 ${date}`));
  div.appendChild(h("div", "meta", c.title || c.url || ""));

  const actions = h("div", "actions");
  const openBtn = h("button", "", "Open");
  openBtn.addEventListener("click", () => c.url && safeOpen(c.url));
  const delBtn = h("button", "", "Delete");
  delBtn.addEventListener("click", async () => {
    try {
      await apiRequest(`/chats/${encodeURIComponent(c.id)}`, { method: "DELETE" });
      await refreshChatList();
    } catch (error) {
      if (error.code === "AUTH") await refreshAuthUI();
      setMsg(captureMsgEl, error.message, false);
    }
  });
  actions.append(openBtn, delBtn);
  div.appendChild(actions);
  return div;
}

async function refreshChatList() {
  chatListEl.textContent = "";
  if (!(await getAuthToken())) {
    chatCountEl.textContent = "0";
    chatListEl.appendChild(emptyState("Log in to see your archived chats."));
    return;
  }
  try {
    const chats = await apiRequest("/chats");
    chatCountEl.textContent = chats.length;
    if (chats.length === 0) {
      chatListEl.appendChild(emptyState("No captures yet."));
      return;
    }
    chats.slice().reverse().forEach((c) => chatListEl.appendChild(buildChatItem(c)));
  } catch (error) {
    chatCountEl.textContent = "0";
    if (error.code === "AUTH") await refreshAuthUI();
    chatListEl.appendChild(emptyState(error.message));
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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    setMsg(captureMsgEl, error.message, false);
  }
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("Delete all archived chats? This cannot be undone.")) return;
  try {
    const chats = await apiRequest("/chats");
    for (const chat of chats) {
      await apiRequest(`/chats/${encodeURIComponent(chat.id)}`, { method: "DELETE" });
    }
    await refreshChatList();
  } catch (error) {
    if (error.code === "AUTH") await refreshAuthUI();
    setMsg(captureMsgEl, error.message, false);
  }
});

async function init() {
  await refreshAuthUI();
  await refreshActiveTab();
  await refreshChatList();
  await loadPendingPrompt();
}

init();
