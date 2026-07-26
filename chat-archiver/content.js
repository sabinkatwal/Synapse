// Chat Archiver - content script
// Runs on chatgpt.com, claude.ai, gemini.google.com
// Captures conversation turns into chrome.storage.local and can inject a prompt into the page's input box.

(function () {
  const host = location.hostname;

  // ---- Per-site config ------------------------------------------------
  // Selectors change often on these sites. Each config also has a
  // genericFallback used if the specific selectors find nothing.
  const CONFIGS = {
    "chatgpt.com": {
      site: "chatgpt",
      turnSelector: '[data-testid^="conversation-turn-"]',
      roleOf(turnEl) {
        const roleEl = turnEl.querySelector("[data-message-author-role]");
        return roleEl ? roleEl.getAttribute("data-message-author-role") : "unknown";
      },
      textOf(turnEl) {
        const roleEl = turnEl.querySelector("[data-message-author-role]");
        return (roleEl || turnEl).innerText.trim();
      },
      inputSelector: "#prompt-textarea",
      submitSelector: 'button[data-testid="send-button"]',
    },
    "chat.openai.com": null, // filled below (alias of chatgpt.com)
    "claude.ai": {
      site: "claude",
      turnSelector: '[data-testid="user-message"], div.font-claude-message',
      roleOf(turnEl) {
        return turnEl.matches('[data-testid="user-message"]') ? "user" : "assistant";
      },
      textOf(turnEl) {
        return turnEl.innerText.trim();
      },
      inputSelector: 'div.ProseMirror[contenteditable="true"]',
      submitSelector: 'button[aria-label="Send message"]',
    },
    "gemini.google.com": {
      site: "gemini",
      turnSelector: "user-query, model-response",
      roleOf(turnEl) {
        return turnEl.tagName.toLowerCase() === "user-query" ? "user" : "assistant";
      },
      textOf(turnEl) {
        return turnEl.innerText.trim();
      },
      inputSelector: "div.ql-editor",
      submitSelector: 'button[aria-label="Send message"]',
    },
  };
  CONFIGS["chat.openai.com"] = CONFIGS["chatgpt.com"];

  const config = CONFIGS[host];
  if (!config) return;

  // ---- Capture ----------------------------------------------------------
  function captureConversation() {
    let turns = Array.from(document.querySelectorAll(config.turnSelector));
    let messages = [];

    if (turns.length > 0) {
      messages = turns
        .map((t) => {
          const role = config.roleOf(t);
          const text = config.textOf(t);
          return { role, text };
        })
        .filter((m) => m.text && m.text.length > 0);
    }

    // Generic fallback: if specific selectors found nothing, grab the
    // main scrollable region's text as a single blob so capture never
    // silently returns empty.
    if (messages.length === 0) {
      const main = document.querySelector("main") || document.body;
      const text = main.innerText.trim();
      if (text) {
        messages = [{ role: "unknown", text }];
      }
    }

    return {
      site: config.site,
      url: location.href,
      title: document.title,
      capturedAt: new Date().toISOString(),
      messages,
    };
  }

  async function saveCapture() {
    const convo = captureConversation();
    if (convo.messages.length === 0) {
      return { ok: false, error: "No messages found on this page." };
    }

    const { authToken } = await chrome.storage.local.get("authToken");
    if (!authToken) {
      return { ok: false, error: "Please log in first from the extension popup." };
    }

    const response = await fetch("http://127.0.0.1:8000/chats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        site: convo.site,
        title: convo.title,
        url: convo.url,
        captured_at: convo.capturedAt,
        messages: convo.messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return { ok: false, error: errorData || "Failed to save chat." };
    }

    return { ok: true, count: convo.messages.length };
  }

  // ---- Inject -------------------------------------------------------------
  function setEditableText(el, text) {
    el.focus();
    // Clear existing content
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    // Insert new text, preserving newlines as separate insertText calls
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      document.execCommand("insertText", false, line);
      if (i < lines.length - 1) {
        document.execCommand("insertParagraph", false, null);
      }
    });
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setTextareaText(el, text) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function injectPrompt(text, autoSubmit) {
    const input = document.querySelector(config.inputSelector);
    if (!input) return { ok: false, error: "Input box not found on this page." };

    if (input.tagName === "TEXTAREA") {
      setTextareaText(input, text);
    } else {
      // contenteditable div (ChatGPT prompt box, Claude ProseMirror, Gemini Quill)
      setEditableText(input, text);
    }

    if (autoSubmit) {
      // Give the site's framework a tick to register the input before submitting.
      await new Promise((r) => setTimeout(r, 150));
      const submitBtn = document.querySelector(config.submitSelector);
      if (submitBtn && !submitBtn.disabled) {
        submitBtn.click();
      } else {
        // Fallback: simulate Enter key
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })
        );
      }
    }
    return { ok: true };
  }

  // ---- Message bridge to popup -------------------------------------------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "CAPTURE_CHAT") {
      saveCapture().then(sendResponse);
      return true; // async response
    }
    if (msg.type === "INJECT_PROMPT") {
      injectPrompt(msg.text, msg.autoSubmit).then(sendResponse);
      return true;
    }
    if (msg.type === "PING") {
      sendResponse({ ok: true, site: config.site });
    }
  });
})();
