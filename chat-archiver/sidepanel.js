const SUPPORTED_HOSTS = ["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com"];
const API_BASE_URL = "http://127.0.0.1:8000";

// ============================================================
// Theme Management
// ============================================================

const THEME_KEY = "synapse-theme";
const DARK_THEME = "dark";
const LIGHT_THEME = "light";

function initTheme() {
  const themeLink = document.getElementById("themeLink");
  const themeToggle = document.getElementById("themeToggle");
  
  // Get saved theme or use system preference
  let savedTheme = localStorage.getItem(THEME_KEY);
  
  if (!savedTheme) {
    // Use system preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    savedTheme = prefersDark ? DARK_THEME : LIGHT_THEME;
  }
  
  applyTheme(savedTheme, themeLink, themeToggle);
  
  // Listen for theme toggle
  themeToggle.addEventListener("click", () => {
    const currentTheme = themeLink.href.includes("dark") ? DARK_THEME : LIGHT_THEME;
    const newTheme = currentTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME;
    applyTheme(newTheme, themeLink, themeToggle);
    localStorage.setItem(THEME_KEY, newTheme);
  });
  
  // Listen for system theme changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      const newTheme = e.matches ? DARK_THEME : LIGHT_THEME;
      applyTheme(newTheme, themeLink, themeToggle);
    }
  });
}

function applyTheme(theme, themeLink, themeToggle) {
  const isDark = theme === DARK_THEME;
  themeLink.href = isDark ? "sidepanel-dark.css" : "sidepanel-light.css";
  themeToggle.textContent = isDark ? "☀️" : "🌙";
  themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
}

// Initialize theme when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTheme);
} else {
  initTheme();
}

// ============================================================

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
const authSectionEl = document.getElementById("authSection");
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

function setMsg(el, text, ok) {
  el.textContent = text;
  el.classList.remove("ok", "err");
  el.classList.add(ok ? "ok" : "err");
  setTimeout(() => {
    el.textContent = "";
    el.classList.remove("ok", "err");
  }, 4000);
}

// ---- Active tab tracking ------------------------------------------------
// Unlike a popup (which re-runs init() fresh every time it's opened), the
// side panel stays mounted while the user switches tabs. Re-check the
// active tab whenever it changes so siteStatus/capture/inject stay correct.
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
    captureBtn.disabled = false;
    injectBtn.disabled = false;
  } else {
    siteStatusEl.textContent = "Open ChatGPT, Claude, or Gemini to use this.";
    siteStatusEl.classList.remove("active");
    captureBtn.disabled = true;
    injectBtn.disabled = true;
  }
}

chrome.tabs.onActivated.addListener(refreshActiveTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.status === "complete") refreshActiveTab();
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) refreshActiveTab();
});

// ---- Auth ---------------------------------------------------------------
async function refreshAuthUI() {
  const token = await getAuthToken();
  authSectionEl.style.display = token ? "none" : "block";
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
    await refreshAuthUI();
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
    await refreshAuthUI();
    await refreshChatList();
  } catch (error) {
    setMsg(authMsgEl, error.message, false);
  }
});

// ---- Capture / Inject ----------------------------------------------------
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
  captureBtn.disabled = siteSupported ? false : true;
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
  injectBtn.disabled = siteSupported ? false : true;
});

// ---- Chat list ------------------------------------------------------------
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
        div.innerHTML = `
          <div class="site">${escapeHtml(c.site)}</div>
          <div class="meta">${c.messages.length} msgs \u00b7 ${date}</div>
          <div class="meta">${escapeHtml(c.title || c.url)}</div>
          <div class="actions">
            <button data-action="open" data-url="${escapeHtml(c.url || "")}">Open</button>
            <button data-action="delete" data-id="${c.id}">Delete</button>
          </div>
        `;
        chatListEl.appendChild(div);
      });

    chatListEl.querySelectorAll("button[data-action='open']").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.url) chrome.tabs.create({ url: btn.dataset.url });
      });
    });
    chatListEl.querySelectorAll("button[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await apiRequest(`/chats/${btn.dataset.id}`, { method: "DELETE" });
          await refreshChatList();
        } catch (error) {
          setMsg(captureMsgEl, error.message, false);
        }
      });
    });
  } catch (error) {
    chatCountEl.textContent = "0";
    chatListEl.innerHTML = `<div id="emptyState">${escapeHtml(error.message)}</div>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
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

async function init() {
  await refreshAuthUI();
  await refreshActiveTab();
  await refreshChatList();
}

init();