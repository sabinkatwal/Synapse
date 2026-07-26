import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

const SUPPORTED_HOSTS = ["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com"];

export default function MainPage() {
  const { user, logout } = useAuth();
  const [siteStatus, setSiteStatus] = useState("Checking current tab…");
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [promptText, setPromptText] = useState("");
  const [autoSubmit, setAutoSubmit] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const tab = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tab[0];
        if (!activeTab?.url) {
          setSiteStatus("No active tab.");
          return;
        }
        const hostname = new URL(activeTab.url).hostname;
        const supported = SUPPORTED_HOSTS.includes(hostname);
        setSiteStatus(supported ? `Connected: ${hostname}` : "Open ChatGPT, Claude, or Gemini to use this.");
        const response = await api.getChats();
        setChats(response || []);
      } catch (err) {
        setError(err.message || "Unable to load chats");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const sendToActiveTab = async (message) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("No active tab found.");
    }

    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      if (error.message?.includes("Receiving end does not exist")) {
        throw new Error("This tab does not have the Synapse content script loaded. Refresh the page and try again.");
      }
      throw error;
    }
  };

  const handleCapture = async () => {
    try {
      const result = await sendToActiveTab({ type: "CAPTURE_CHAT" });
      if (result?.ok) {
        const response = await api.getChats();
        setChats(response || []);
      } else {
        setError(result?.error || "Capture failed");
      }
    } catch (err) {
      setError(err.message || "Capture failed");
    }
  };

  const handleInject = async () => {
    try {
      const result = await sendToActiveTab({
        type: "INJECT_PROMPT",
        text: promptText,
        autoSubmit,
      });
      if (!result?.ok) {
        setError(result?.error || "Injection failed");
      }
    } catch (err) {
      setError(err.message || "Injection failed");
    }
  };

  const handleDelete = async (chatId) => {
    await api.deleteChat(chatId);
    setChats((prev) => prev.filter((chat) => chat.id !== chatId));
  };

  const handleFavorite = async (chatId, favorite) => {
    const updated = await api.updateChat(chatId, { favorite: !favorite });
    setChats((prev) => prev.map((chat) => (chat.id === chatId ? updated : chat)));
  };

  const handleExport = async () => {
    const blob = new Blob([JSON.stringify(chats, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-archive-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>{user?.email || "Synapse"}</strong>
        <button onClick={logout}>Logout</button>
      </div>
      <div>{siteStatus}</div>
      <div style={{ display: "grid", gap: 8 }}>
        <button onClick={handleCapture}>Capture this conversation</button>
        {error ? <div style={{ color: "#c0392b" }}>{error}</div> : null}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <textarea value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="Type a prompt to inject" />
        <label>
          <input type="checkbox" checked={autoSubmit} onChange={(e) => setAutoSubmit(e.target.checked)} /> Auto-send
        </label>
        <button onClick={handleInject}>Inject prompt</button>
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <strong>Archived chats</strong>
          <button onClick={handleExport}>Export JSON</button>
        </div>
        {loading ? <div>Loading chats…</div> : null}
        {chats.length === 0 && !loading ? <div>No captures yet.</div> : null}
        {chats.map((chat) => (
          <div key={chat.id} style={{ border: "1px solid #ddd", padding: 8, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{chat.title || chat.url}</strong>
              <button onClick={() => handleFavorite(chat.id, chat.favorite)}>{chat.favorite ? "★" : "☆"}</button>
            </div>
            <div>{chat.site}</div>
            <div>{new Date(chat.captured_at).toLocaleString()}</div>
            <button onClick={() => handleDelete(chat.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
