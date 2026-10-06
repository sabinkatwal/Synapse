import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const SUPPORTED_HOSTS = ["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com"];

export default function MainPage() {
  const { user, logout } = useAuth();
  const [siteStatus, setSiteStatus] = useState("Checking…");
  const [siteSupported, setSiteSupported] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("ok");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function checkTab() {
      if (!chrome?.tabs) return;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) {
        setSiteStatus("No active tab.");
        setSiteSupported(false);
        return;
      }

      const hostname = new URL(tab.url).hostname;
      const supported = SUPPORTED_HOSTS.includes(hostname);
      setSiteSupported(supported);
      setSiteStatus(
        supported ? `Connected: ${hostname}` : "Open ChatGPT, Claude, or Gemini to use this."
      );
    }

    checkTab().catch(() => {
      setSiteStatus("Unable to detect the active tab.");
      setSiteSupported(false);
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    chrome.storage.local.get("pendingPrompt").then(({ pendingPrompt }) => {
      if (mounted && pendingPrompt) setPromptText(pendingPrompt);
    });

    const handleStorageChange = (changes, areaName) => {
      if (areaName === "local" && changes.pendingPrompt?.newValue) {
        setPromptText(changes.pendingPrompt.newValue);
        showMessage("Prompt received from Synapse webapp.", "ok");
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const showMessage = (text, type = "ok") => {
    setMessage(text);
    setMessageType(type);
  };

  const captureConversation = async () => {
    if (!chrome?.tabs) return;

    setBusy(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        showMessage("No active tab found.", "err");
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_CHAT" });
      if (response?.ok) {
        showMessage(`Captured ${response.count} messages.`, "ok");
      } else {
        showMessage(response?.error || "Capture failed.", "err");
      }
    } catch (error) {
      showMessage("Could not reach the page. Reload the tab and try again.", "err");
    } finally {
      setBusy(false);
    }
  };

  const injectPrompt = async () => {
    if (!promptText.trim()) {
      showMessage("Type a prompt first.", "err");
      return;
    }

    setBusy(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        showMessage("No active tab found.", "err");
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "INJECT_PROMPT",
        text: promptText.trim(),
        autoSubmit,
      });

      if (response?.ok) {
        showMessage("Injected.", "ok");
        setPromptText("");
        await chrome.storage.local.remove("pendingPrompt");
      } else {
        showMessage(response?.error || "Injection failed.", "err");
      }
    } catch (error) {
      showMessage("Could not reach the page. Reload the tab and try again.", "err");
    } finally {
      setBusy(false);
    }
  };

  const openSidePanel = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        window.close();
      }
    } catch (error) {
      showMessage("Could not open side panel.", "err");
    }
  };

  return (
    <div style={{ display: "grid", gap: 16, padding: 16, minWidth: 320 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 18 }}>⚡</div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Synapse</h1>
        </div>
        <button onClick={logout} style={{ padding: "8px 10px", cursor: "pointer" }}>
          Log out
        </button>
      </header>

      <div>
        <strong>Status:</strong> {siteStatus}
      </div>

      <section style={{ display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Capture</h2>
        <button disabled={!siteSupported || busy} onClick={captureConversation}>
          Capture this conversation
        </button>
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Inject Prompt</h2>
        <textarea
          value={promptText}
          onChange={(event) => setPromptText(event.target.value)}
          placeholder="Type a prompt to inject into the active chat..."
          rows={4}
          style={{ width: "100%", boxSizing: "border-box" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={autoSubmit}
            onChange={(event) => setAutoSubmit(event.target.checked)}
          />
          Auto-submit after inserting
        </label>
        <button disabled={!siteSupported || busy} onClick={injectPrompt}>
          Inject prompt
        </button>
      </section>

      <button onClick={openSidePanel}>Open side panel</button>

      {message ? (
        <div
          style={{
            color: messageType === "ok" ? "#0b6b3a" : "#a31d1d",
            fontWeight: 600,
            minHeight: 20,
          }}
        >
          {message}
        </div>
      ) : null}

      <div>
        <strong>User:</strong> {user?.email || "Not signed in"}
      </div>
    </div>
  );
}
