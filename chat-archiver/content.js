// SYNAPSE Web Archiver - content script
// Runs (top frame only) on chatgpt.com, chat.openai.com, claude.ai, gemini.google.com.
// Message types (unchanged): CAPTURE_CHAT, INJECT_PROMPT, PING.
// Network calls are delegated to the background worker (SAVE_CHAT).

(function () {
  "use strict";
  if (window !== window.top) return;

  const SCRIPT_VERSION = "2026-10-10-chatgpt-turn-container-v4";

  // Guard against double injection (manifest + chrome.scripting retry). If the
  // page still has an older copy after the unpacked extension is reloaded, allow
  // this version to register so selector fixes take effect without a tab restart.
  try {
    if (window.__SYNAPSE_ARCHIVER__ === SCRIPT_VERSION && chrome.runtime && chrome.runtime.id) return;
  } catch (_) {
    /* invalidated context: fall through and re-register */
  }
  window.__SYNAPSE_ARCHIVER__ = SCRIPT_VERSION;

  const LOG = "[SYNAPSE]";

  // =====================================================================
  // SELECTOR CONFIG  -  EDIT HERE when a site changes its DOM.
  // `turns` is a fallback chain: the first selector that matches anything wins.
  // =====================================================================
  const SITES = {
    chatgpt: {
      site: "chatgpt",
      label: "ChatGPT",
      hosts: ["chatgpt.com", "chat.openai.com"],
      turns: [
        '[data-testid^="conversation-turn"]',
        '[data-testid*="conversation-turn"]',
        'article[data-testid^="conversation-turn"]',
        'article:has([data-message-author-role])',
        'section:has([data-message-author-role])',
        'main [data-message-author-role]',
        'main [data-message-id]',
        'main article',
        "[data-turn]",
        "[data-message-author-role]",
        "article:has(.markdown), article:has(.whitespace-pre-wrap), section:has(.markdown), section:has(.whitespace-pre-wrap)",
      ],
      // Prefer stable message-body selectors; fall back to the scoped turn if ChatGPT renames them.
      textSelectors: {
        assistant: '.markdown, [data-message-content], [class*="markdown"], .prose',
        user: '.whitespace-pre-wrap, [data-message-content], [class*="whitespace-pre-wrap"]',
      },
      strictText: false,
      junk: 'button, svg, sup, form, textarea, [contenteditable="true"], .sr-only, [data-testid*="citation"], [class*="citation"], [data-testid*="feedback"], [data-testid*="copy"], [data-testid*="share"]',
      stop: '[data-testid="stop-button"]',
      scrollSelector: null, // null = climb from the first turn to the scrollable ancestor
      diagnose: ["main", "main article", "[data-message-author-role]", "[data-message-id]", ".markdown", ".whitespace-pre-wrap", '[data-message-content]', '[data-testid^="conversation-turn"]', ".sr-only", '[data-testid="stop-button"]', ".katex", "pre", ".cm-content"],
      roleOf: chatgptRoleOf,
      containerOf: chatgptContainerOf,
      postProcess: (t) =>
        t.replace(/#attachment:\s*Pasted text\s*#\d+/gi, "").replace(/\n{3,}/g, "\n\n").trim(),
      inputSelector: '#prompt-textarea, div[contenteditable="true"]',
      submitSelector: 'button[data-testid="send-button"], button[aria-label="Send prompt"]',
    },
    claude: {
      site: "claude",
      label: "Claude",
      hosts: ["claude.ai"],
      turns: ['[data-testid="user-message"], div.font-claude-message, div.font-claude-response'],
      userMatch: '[data-testid="user-message"]',
      assistantMatch: "div.font-claude-message, div.font-claude-response",
      textSelectors: null, // whole turn element
      strictText: false,
      junk: 'button, svg, .sr-only, [data-testid*="action-bar"]',
      stop: 'button[aria-label="Stop response"]',
      scrollSelector: null,
      diagnose: ['[data-testid="user-message"]', "div.font-claude-message", "div.font-claude-response", "[data-message-id]", "pre"],
      inputSelector: 'div.ProseMirror[contenteditable="true"]',
      submitSelector: 'button[aria-label="Send message"]',
    },
    gemini: {
      site: "gemini",
      label: "Gemini",
      hosts: ["gemini.google.com"],
      turns: ["user-query, model-response"],
      userMatch: "user-query",
      assistantMatch: "model-response",
      textSelectors: { user: ".query-text", assistant: "message-content, .markdown" },
      strictText: false, // falls back to the turn element if the inner selectors miss
      junk: "button, svg, mat-icon, .cdk-visually-hidden, .sr-only",
      stop: 'button[aria-label*="Stop"]',
      scrollSelector: "infinite-scroller",
      diagnose: ["user-query", "model-response", ".query-text", "message-content", ".markdown", "infinite-scroller"],
      inputSelector: "div.ql-editor",
      submitSelector: 'button[aria-label="Send message"]',
    },
  };

  const cfg = Object.values(SITES).find((s) => s.hosts.includes(location.hostname));
  if (!cfg) return;

  // ---- role detection --------------------------------------------------
  function chatgptContainerOf(el) {
    const roleEl = el.matches("[data-message-author-role]")
      ? el
      : el.closest("[data-message-author-role]") || el.querySelector("[data-message-author-role]");
    const roleText = roleEl ? (roleEl.textContent || "").trim() : "";
    const useful = (node) => {
      if (!node) return false;
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      return text.length > Math.max(10, roleText.length + 10);
    };

    const stableCandidates = [
      el.closest('[data-testid^="conversation-turn"]') ||
        el.closest('[data-testid*="conversation-turn"]'),
      el.closest("article"),
      el.closest("[data-message-id]"),
      el.closest("[data-turn]"),
    ];
    for (const candidate of stableCandidates) {
      if (useful(candidate)) return candidate;
    }

    if (!roleEl) return el;

    for (let p = roleEl; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (useful(p)) return p;
    }
    return roleEl;
  }

  function chatgptRoleOf(el) {
    // 1) data-message-author-role (on the element or a descendant)
    const roleEl = el.matches("[data-message-author-role]")
      ? el
      : el.querySelector("[data-message-author-role]");
    let role = roleEl && roleEl.getAttribute("data-message-author-role");

    // 2) data-turn (on the element, an ancestor or a descendant)
    if (!role) {
      const turnEl = el.matches("[data-turn]")
        ? el
        : el.closest("[data-turn]") || el.querySelector("[data-turn]");
      role = turnEl && turnEl.getAttribute("data-turn");
    }

    // 3) last resort: hidden screen-reader heading "You said" / "ChatGPT said"
    if (!role) {
      for (const h of el.querySelectorAll(".sr-only")) {
        const t = (h.textContent || "").trim().toLowerCase();
        if (/^you said/.test(t)) { role = "user"; break; }
        if (/^chatgpt said/.test(t)) { role = "assistant"; break; }
      }
    }

    // 4) Some ChatGPT builds expose the speaker on accessible labels instead.
    if (!role) {
      const labelled = el.matches("[aria-label]") ? [el] : [];
      labelled.push(...el.querySelectorAll("[aria-label]"));
      for (const node of labelled) {
        const t = (node.getAttribute("aria-label") || "").trim().toLowerCase();
        if (/^you said/.test(t)) { role = "user"; break; }
        if (/^chatgpt said/.test(t)) { role = "assistant"; break; }
      }
    }
    return role === "user" || role === "assistant" ? role : null; // never guess
  }

  function roleOf(el) {
    if (cfg.roleOf) return cfg.roleOf(el);
    if (cfg.userMatch && el.matches(cfg.userMatch)) return "user";
    if (cfg.assistantMatch && el.matches(cfg.assistantMatch)) return "assistant";
    return null;
  }

  // ---- DOM -> text ---------------------------------------------------------
  const BLOCK_TAGS = new Set([
    "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI",
    "BLOCKQUOTE", "TABLE", "TR", "SECTION", "ARTICLE", "FIGURE", "DETAILS", "SUMMARY",
  ]);

  // Walks the live DOM (no clone: detached nodes have no layout, so innerText
  // would lose line breaks). Skips junk, keeps KaTeX as TeX, keeps code fences.
  function serialize(root, junkSelector, preserveWhitespace) {
    let out = "";
    const codeBlocks = [];
    const nl = () => { if (out && !out.endsWith("\n")) out += "\n"; };

    function walk(n) {
      if (n.nodeType === Node.TEXT_NODE) {
        out += preserveWhitespace ? n.nodeValue : n.nodeValue.replace(/\s+/g, " ");
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      if (junkSelector && n.matches(junkSelector)) return;
      const tag = n.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return;

      // KaTeX: take the TeX source; do NOT strip aria-hidden blindly.
      if (n.classList.contains("katex")) {
        const ann = n.querySelector('annotation[encoding="application/x-tex"]');
        const tex = ann ? ann.textContent : (n.querySelector(".katex-html") || n).textContent;
        if (n.closest(".katex-display")) { nl(); out += `$$${tex}$$`; nl(); }
        else out += `$${tex}$`;
        return;
      }

      if (tag === "PRE") {
        const cm = n.querySelector(".cm-content");
        const code = n.querySelector("code");
        let body;
        if (cm) body = Array.from(cm.querySelectorAll(".cm-line")).map((l) => l.textContent).join("\n");
        else body = (code || n).textContent;
        const m = code && code.className.match(/language-([\w+#.-]+)/);
        const lang = m ? m[1] : "";
        codeBlocks.push("```" + lang + "\n" + body.replace(/\n$/, "") + "\n```");
        nl();
        out += `\u0000CODE${codeBlocks.length - 1}\u0000`;
        nl();
        return;
      }
      if (tag === "CODE") { out += "`" + n.textContent + "`"; return; }
      if (tag === "BR") { out += "\n"; return; }
      if (tag === "HR") { nl(); out += "---"; nl(); return; }

      const block = BLOCK_TAGS.has(tag);
      if (block) nl();
      if (tag === "LI") {
        const parent = n.parentElement;
        if (parent && parent.tagName === "OL") {
          out += `${Array.prototype.indexOf.call(parent.children, n) + 1}. `;
        } else out += "- ";
      } else if (/^H[1-6]$/.test(tag)) {
        out += "#".repeat(Number(tag[1])) + " ";
      }
      for (const child of n.childNodes) walk(child);
      if (tag === "TD" || tag === "TH") out += " | ";
      if (tag === "TR") out = out.replace(/ \| $/, "");
      if (block) nl();
    }

    walk(root);
    out = out.replace(/[ \t]+\n/g, "\n");
    if (!preserveWhitespace) out = out.replace(/\n[ \t]+/g, "\n");
    out = out.replace(/\n{3,}/g, "\n\n").trim();
    return out.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => codeBlocks[Number(i)]);
  }

  function outermost(list) {
    const set = new Set(list);
    return list.filter((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
      return true;
    });
  }

  function extractText(turnEl, role) {
    const sel = cfg.textSelectors && cfg.textSelectors[role];
    let roots = [];
    if (sel) roots = outermost(Array.from(turnEl.querySelectorAll(sel)));
    if (!roots.length) {
      if (cfg.strictText) return "";
      roots = [turnEl];
    }
    const pre = role === "user";
    let text = roots.map((r) => serialize(r, cfg.junk, pre)).filter(Boolean).join("\n\n");
    if (cfg.postProcess) text = cfg.postProcess(text);
    return text;
  }

  // ---- turn discovery --------------------------------------------------------
  function findTurns() {
    for (const sel of cfg.turns) {
      let list;
      try {
        list = Array.from(document.querySelectorAll(sel));
        if (cfg.containerOf) list = list.map((el) => cfg.containerOf(el));
        list = outermost(Array.from(new Set(list)));
      }
      catch (_) { continue; }
      if (list.length) return { selector: sel, elements: list };
    }
    return { selector: null, elements: [] };
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + ":" + str.length;
  }

  function stableId(el) {
    const own = el.getAttribute("data-message-id");
    if (own) return own;
    const inner = el.querySelector("[data-message-id]");
    if (inner) return inner.getAttribute("data-message-id");
    const outer = el.closest("[data-message-id]");
    return outer ? outer.getAttribute("data-message-id") : null;
  }

  function harvest() {
    const { elements } = findTurns();
    const items = [];
    for (const el of elements) {
      const role = roleOf(el);
      if (!role) continue;
      const text = extractText(el, role);
      if (!text) continue;
      items.push({ key: stableId(el) || "h:" + hash(role + "\u0001" + text), role, text });
    }
    return items;
  }

  // Merge a DOM snapshot into the accumulated, ordered list. Uses suffix/prefix
  // overlap instead of a plain Map so that repeated identical messages
  // ("continue", "ok") are not collapsed into one.
  function mergeItems(acc, batch) {
    if (!batch.length) return acc;
    if (!acc.length) return batch.slice();
    for (let k = Math.min(acc.length, batch.length); k >= 1; k--) {
      let same = true;
      for (let i = 0; i < k; i++) {
        if (acc[acc.length - k + i].key !== batch[i].key) { same = false; break; }
      }
      if (same) return acc.concat(batch.slice(k));
    }
    // batch fully inside acc (we scrolled back over known turns)?
    for (let s = 0; s + batch.length <= acc.length; s++) {
      let same = true;
      for (let i = 0; i < batch.length; i++) {
        if (acc[s + i].key !== batch[i].key) { same = false; break; }
      }
      if (same) return acc;
    }
    return acc.concat(batch);
  }

  // ---- diagnostics -------------------------------------------------------------
  function count(sel) {
    try { return document.querySelectorAll(sel).length; } catch (_) { return "invalid selector"; }
  }
  function diagnostics() {
    const d = { site: cfg.site, url: location.href, turnSelectors: {}, other: {}, roles: {}, text: {} };
    cfg.turns.forEach((s) => (d.turnSelectors[s] = count(s)));
    cfg.diagnose.forEach((s) => (d.other[s] = count(s)));
    const { selector, elements } = findTurns();
    d.winningSelector = selector;
    elements.forEach((el) => {
      const r = roleOf(el) || "unknown";
      d.roles[r] = (d.roles[r] || 0) + 1;
      if (r === "user" || r === "assistant") {
        const text = extractText(el, r);
        const key = text ? `${r}WithText` : `${r}Empty`;
        d.text[key] = (d.text[key] || 0) + 1;
      }
    });
    return d;
  }
  window.__synapseDiagnose = diagnostics; // run from DevTools with the extension context selected

  // ---- progress to the side panel -------------------------------------------------
  let lastProgress = 0;
  function progress(text, force) {
    const now = Date.now();
    if (!force && now - lastProgress < 400) return;
    lastProgress = now;
    try { chrome.runtime.sendMessage({ type: "CAPTURE_PROGRESS", text }).catch(() => {}); } catch (_) {}
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- wait for streaming to finish -------------------------------------------------
  function waitForIdle() {
    return new Promise((resolve) => {
      let timer;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer); clearTimeout(hard); obs.disconnect();
        resolve();
      };
      const check = () => {
        clearTimeout(timer);
        if (cfg.stop && document.querySelector(cfg.stop)) return; // still streaming
        timer = setTimeout(finish, 600); // DOM stable for 600ms
      };
      const obs = new MutationObserver(check);
      const hard = setTimeout(finish, 45000);
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      check();
    });
  }

  async function waitForTurns(ms) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (findTurns().elements.length) return;
      await sleep(250);
    }
  }

  // ---- load the whole conversation ------------------------------------------------------
  function findScrollContainer(startEl) {
    const isScrollable = (el) => {
      const oy = getComputedStyle(el).overflowY;
      return (oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 4;
    };
    if (cfg.scrollSelector) {
      const hinted = document.querySelector(cfg.scrollSelector);
      if (hinted && isScrollable(hinted)) return hinted;
    }
    for (let el = startEl && startEl.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (isScrollable(el)) return el;
    }
    return document.scrollingElement || document.documentElement;
  }

  async function collectAll() {
    const first0 = findTurns().elements[0];
    if (!first0) return [];
    const box = findScrollContainer(first0);
    const original = box.scrollTop;

    try {
      // Phase 1: scroll to the top until turn count and scrollHeight are stable x3.
      let stable = 0, lastCount = -1, lastHeight = -1;
      for (let i = 0; i < 60 && stable < 3; i++) {
        box.scrollTop = 0;
        await sleep(i < 2 ? 500 : 700);
        const n = findTurns().elements.length;
        const h = box.scrollHeight;
        stable = n === lastCount && h === lastHeight ? stable + 1 : 0;
        lastCount = n; lastHeight = h;
        progress(`Loading older messages… (${n} turns in view)`);
      }

      // Phase 2: is the list virtualized? Jump to the bottom and see whether
      // the first turn we saw at the top was removed from the DOM.
      const topFirst = findTurns().elements[0];
      box.scrollTop = box.scrollHeight;
      await sleep(600);
      const virtualized = !!topFirst && !topFirst.isConnected;

      if (!virtualized) {
        progress("Reading messages…", true);
        return harvest();
      }

      // Phase 3 (virtualized): sweep top -> bottom in steps, accumulating turns.
      console.info(LOG, "virtualized list detected; sweeping");
      box.scrollTop = 0;
      await sleep(500);
      const step = Math.max(200, Math.floor((box.clientHeight || window.innerHeight) * 0.8));
      let acc = [];
      for (let guard = 0; guard < 800; guard++) {
        acc = mergeItems(acc, harvest());
        progress(`Collecting messages… (${acc.length} so far)`);
        const maxTop = box.scrollHeight - box.clientHeight;
        if (box.scrollTop >= maxTop - 2) {
          await sleep(350); // let late renders / height re-measurement settle
          acc = mergeItems(acc, harvest());
          if (box.scrollHeight - box.clientHeight <= box.scrollTop + 2) break;
          continue;
        }
        box.scrollTop = Math.min(box.scrollTop + step, maxTop);
        await sleep(180);
      }
      return acc;
    } finally {
      box.scrollTop = original; // restore the user's position
    }
  }

  // ---- capture + save -------------------------------------------------------------------------
  let capturing = false;
  let lastCapture = null; // cached so "replace" after a duplicate warning needn't re-scroll

  async function saveCapture(opts) {
    const mode = (opts && opts.mode) || "check";
    if (capturing) return { ok: false, error: "A capture is already running on this tab." };
    capturing = true;
    try {
      let convo;
      if (opts && opts.reuse && lastCapture && lastCapture.url === location.href && Date.now() - lastCapture.at < 120000) {
        convo = lastCapture.convo;
      } else {
        progress("Waiting for the response to finish…", true);
        await waitForIdle();
        await waitForTurns(5000);
        const items = await collectAll();
        if (!items.length) {
          const diag = diagnostics();
          console.warn(LOG, `${cfg.label} messages were not found. Selector diagnostics:`, diag);
          return {
            ok: false,
            error: `No ${cfg.label} messages found on this page. The site layout may have changed (selector diagnostics are in the console).`,
            diagnostics: diag,
          };
        }
        convo = {
          site: cfg.site,
          url: location.href,
          title: document.title,
          capturedAt: new Date().toISOString(),
          messages: items.map(({ role, text }) => ({ role, text })),
        };
        lastCapture = { url: location.href, at: Date.now(), convo };
      }

      progress("Saving to SYNAPSE…", true);
      let result;
      try {
        result = await chrome.runtime.sendMessage({
          type: "SAVE_CHAT",
          mode,
          payload: {
            site: convo.site,
            title: convo.title,
            url: convo.url,
            captured_at: convo.capturedAt,
            messages: convo.messages,
          },
        });
      } catch (err) {
        console.error(LOG, "sendMessage to background failed:", err);
        return { ok: false, error: "The extension was reloaded. Refresh this page and try again." };
      }
      if (!result) return { ok: false, error: "No response from the background worker." };
      return { ...result, count: convo.messages.length };
    } finally {
      capturing = false;
    }
  }

  // ---- inject --------------------------------------------------------------------------------------
  function setEditableText(el, text) {
    el.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      document.execCommand("insertText", false, line);
      if (i < lines.length - 1) document.execCommand("insertParagraph", false, null);
    });
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setTextareaText(el, text) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(el, text); else el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function injectPrompt(text, autoSubmit) {
    const input = document.querySelector(cfg.inputSelector);
    if (!input) return { ok: false, error: "Input box not found on this page." };
    if (input.tagName === "TEXTAREA") setTextareaText(input, text);
    else setEditableText(input, text);

    if (autoSubmit) {
      await sleep(150);
      const btn = document.querySelector(cfg.submitSelector);
      if (btn && !btn.disabled) btn.click();
      else input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    }
    return { ok: true };
  }

  // ---- message bridge ---------------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "CAPTURE_CHAT" || msg.type === "CAPTURE_CHAT_V2") {
      saveCapture({ mode: msg.mode, reuse: msg.reuse })
        .then(sendResponse)
        .catch((err) => {
          console.error(LOG, "Unhandled error in saveCapture:", err);
          sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
        });
      return true;
    }
    if (msg.type === "INJECT_PROMPT") {
      injectPrompt(msg.text, msg.autoSubmit)
        .then(sendResponse)
        .catch((err) => {
          console.error(LOG, "Unhandled error in injectPrompt:", err);
          sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
        });
      return true;
    }
    if (msg.type === "PING") {
      sendResponse({ ok: true, site: cfg.site, diagnostics: msg.diagnose ? diagnostics() : undefined });
    }
  });
})();
