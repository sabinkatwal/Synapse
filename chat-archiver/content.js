// Chat Archiver - content script
// Runs on chatgpt.com, claude.ai, gemini.google.com
// Captures conversation turns into chrome.storage.local and can inject a prompt into the page's input box.

(function () {
  if (window !== window.top) return;

  const host = location.hostname;

  // ---- Per-site config ------------------------------------------------
  const CONFIGS = {
    "chatgpt.com": {
      site: "chatgpt",
      roleSelector: "[data-message-author-role]",
      articleSelector: 'article[data-testid^="conversation-turn"]',
      roleOf(turnEl) {
        const roleEl = turnEl.matches("[data-message-author-role]")
          ? turnEl
          : turnEl.querySelector("[data-message-author-role]");
        return roleEl?.getAttribute("data-message-author-role") || "unknown";
      },
      textOf(turnEl) {
        const roleEl = turnEl.matches("[data-message-author-role]")
          ? turnEl
          : turnEl.querySelector("[data-message-author-role]");
        const role = roleEl?.getAttribute("data-message-author-role");
        const contentRoot = roleEl || turnEl;
        const body =
          contentRoot.querySelector(
            role === "assistant" ? ".markdown" : ".whitespace-pre-wrap"
          ) || contentRoot;
        const clone = body.cloneNode(true);
        clone
          .querySelectorAll(
            'button, svg, sup, .sr-only, [data-testid*="citation"], [aria-hidden="true"]'
          )
          .forEach((el) => el.remove());
        const text = (clone.innerText || clone.textContent || "").trim();
        const withoutAttachmentPlaceholder = text
          .replace(/#attachment:\s*Pasted text\s*#\d+/gi, "")
          .replace(/\n{2,}/g, "\n")
          .trim();
        return withoutAttachmentPlaceholder || text;
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
  function getTurns() {
    if (config.site !== "chatgpt") {
      return Array.from(document.querySelectorAll(config.turnSelector));
    }

    const roleTurns = Array.from(document.querySelectorAll(config.roleSelector));
    return roleTurns.length
      ? roleTurns
      : Array.from(document.querySelectorAll(config.articleSelector));
  }

  async function waitForChatGPTMessages() {
    if (config.site !== "chatgpt") return getTurns();

    const deadline = Date.now() + 5000;
    let turns = getTurns();
    while (turns.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      turns = getTurns();
    }
    return turns;
  }

  async function captureConversation() {
    const turns = await waitForChatGPTMessages();
    if (config.site === "chatgpt" && turns.length === 0) {
      console.warn("[Chat Archiver] ChatGPT message elements were not found.");
    }
    const messages = turns
      .map((turn) => ({ role: config.roleOf(turn), text: config.textOf(turn) }))
      .filter((message) =>
        ["user", "assistant"].includes(message.role) && message.text.length > 0
      );

    return {
      site: config.site,
      url: location.href,
      title: document.title,
      capturedAt: new Date().toISOString(),
      messages,
    };
  }

  function waitForChatGPTResponseComplete() {
    if (config.site !== "chatgpt") return Promise.resolve();

    const stopSelector =
      '[data-testid="stop-button"], button[aria-label*="Stop"], button[title*="Stop"]';
    return new Promise((resolve) => {
      let stableTimer;
      const observer = new MutationObserver(check);
      const timeout = setTimeout(finish, 30000);

      function finish() {
        clearTimeout(stableTimer);
        clearTimeout(timeout);
        observer.disconnect();
        resolve();
      }

      function check() {
        if (document.querySelector(stopSelector)) {
          clearTimeout(stableTimer);
          stableTimer = undefined;
          return;
        }
        clearTimeout(stableTimer);
        stableTimer = setTimeout(finish, 250);
      }

      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      check();
    });
  }

  async function saveCapture() {
    await waitForChatGPTResponseComplete();
    const convo = await captureConversation();
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