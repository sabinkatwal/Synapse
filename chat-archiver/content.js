// Chat Archiver - content script
// Runs on chatgpt.com, claude.ai, gemini.google.com
// Captures conversation turns into chrome.storage.local and can inject a prompt into the page's input box.

(function () {
  const host = location.hostname;

  // ---- Per-site config ------------------------------------------------
  const CONFIGS = {
    "chatgpt.com": {
      site: "chatgpt",
      // Updated: OpenAI now uses article[data-testid^="conversation-turn-"]
      // wrapping a div[data-message-author-role]. Keep both old + new as fallback list.
      turnSelector:
        'article[data-testid^="conversation-turn-"], [data-testid^="conversation-turn-"], div[data-message-author-role]',
      roleOf(turnEl) {
        const roleEl = turnEl.hasAttribute("data-message-author-role")
          ? turnEl
          : turnEl.querySelector("[data-message-author-role]");
        return roleEl ? roleEl.getAttribute("data-message-author-role") : "unknown";
      },
      textOf(turnEl) {
        const roleEl = turnEl.hasAttribute("data-message-author-role")
          ? turnEl
          : turnEl.querySelector("[data-message-author-role]");
        return (roleEl || turnEl).innerText.trim();
      },
      inputSelector: '#prompt-textarea, div[contenteditable="true"]',
      submitSelector: 'button[data-testid="send-button"], button[aria-label="Send prompt"]',
    },
    "chat.openai.com": null,
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

    // De-dupe: new ChatGPT selector list can match nested elements twice.
    turns = turns.filter((el, i) => !turns.slice(0, i).some((prev) => prev.contains(el)));

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

    if (messages.length === 0) {
      console.warn(
        `[Chat Archiver] turnSelector "${config.turnSelector}" matched 0 usable messages on ${host}. Site DOM may have changed. Falling back to full-page text capture.`
      );
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

    // Delegate the actual network request to the background service worker.
    // Content scripts inherit the page's security context (https://claude.ai),
    // so an http:// fetch to a local dev server can be blocked as mixed
    // content. The background worker runs in the extension's own context
    // and isn't subject to that restriction.
    let result;
    try {
      result = await chrome.runtime.sendMessage({
        type: "SAVE_CHAT",
        payload: {
          site: convo.site,
          title: convo.title,
          url: convo.url,
          captured_at: convo.capturedAt,
          messages: convo.messages,
        },
      });
    } catch (err) {
      // Extension context invalidated (extension reloaded/updated while page open)
      console.error("[Chat Archiver] sendMessage to background failed:", err);
      return {
        ok: false,
        error: "Extension was reloaded. Please refresh this page and try again.",
      };
    }

    if (!result || !result.ok) {
      return { ok: false, error: (result && result.error) || "Failed to save chat." };
    }

    return { ok: true, count: convo.messages.length };
  }

  // ---- Inject -------------------------------------------------------------
  function setEditableText(el, text) {
    el.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
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
      setEditableText(input, text);
    }

    if (autoSubmit) {
      await new Promise((r) => setTimeout(r, 150));
      const submitBtn = document.querySelector(config.submitSelector);
      if (submitBtn && !submitBtn.disabled) {
        submitBtn.click();
      } else {
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
      saveCapture()
        .then(sendResponse)
        .catch((err) => {
          console.error("[Chat Archiver] Unhandled error in saveCapture:", err);
          sendResponse({ ok: false, error: String(err) });
        });
      return true;
    }
    if (msg.type === "INJECT_PROMPT") {
      injectPrompt(msg.text, msg.autoSubmit)
        .then(sendResponse)
        .catch((err) => {
          console.error("[Chat Archiver] Unhandled error in injectPrompt:", err);
          sendResponse({ ok: false, error: String(err) });
        });
      return true;
    }
    if (msg.type === "PING") {
      sendResponse({ ok: true, site: config.site });
    }
  });
})();