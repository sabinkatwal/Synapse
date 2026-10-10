// SYNAPSE Web Archiver - content script
// Runs (top frame only) on chatgpt.com, chat.openai.com, claude.ai, gemini.google.com.
// Message types (unchanged): CAPTURE_CHAT, INJECT_PROMPT, PING.
// Network calls are delegated to the background worker (SAVE_CHAT).

(function () {
  "use strict";
  if (window !== window.top) return;

  const SCRIPT_VERSION = "2026-10-10-chatgpt-capture-v9";

  // Guard against double injection (manifest + chrome.scripting retry). If the
  // page still has an older copy after the unpacked extension is reloaded, allow
  // this version to register so selector fixes take effect without a tab restart.
  try {
    if (window.__SYNAPSE_ARCHIVER__ === SCRIPT_VERSION && chrome.runtime && chrome.runtime.id) return;
  } catch (_) {
    /* invalidated context: fall through and re-register */
  }
  window.__SYNAPSE_ARCHIVER__ = SCRIPT_VERSION;

  // Retire the previous copy's message listener so only one copy answers.
  try { window.__SYNAPSE_CLEANUP__ && window.__SYNAPSE_CLEANUP__(); } catch (_) {}

  const LOG = "[SYNAPSE]";

  // =====================================================================
  // SELECTOR CONFIG  -  EDIT HERE when a site changes its DOM.
  // `turns` is a fallback chain: the first selector that matches anything wins.
  // =====================================================================
  const SITES = {
    chatgpt: {
      site: "chatgpt",
      label: "ChatGPT",
      hosts: ["chatgpt.com", "www.chatgpt.com", "chat.openai.com"],
      turns: [
        '[data-message-author-role="user"], [data-message-author-role="assistant"]',
        '[data-testid^="conversation-turn"]',
        '[data-testid*="conversation-turn"]',
        'article[data-testid^="conversation-turn"]',
        'article:has([data-message-author-role])',
        'section:has([data-message-author-role])',
        'main [data-message-author-role]',
        'main [data-message-id]',
        'main article',
        '[role="main"] [data-message-id]',
        '[role="main"] article',
        'article[data-message-id]',
        '[data-message-content]',
        '.thread-scroll-container > *',
        'article',
        "[data-turn]",
        "[data-message-author-role]",
        "article:has(.markdown), article:has(.whitespace-pre-wrap), section:has(.markdown), section:has(.whitespace-pre-wrap)",
      ],
      // Narrow selectors only. When nothing matches, extractText falls back to
      // the whole message element (the new ChatGPT renderer has no .markdown).
      textSelectors: {
        assistant: ".markdown, [data-message-content]",
        user: ".whitespace-pre-wrap, [data-message-content]",
      },
      strictText: false,
      junk: 'button, svg, sup, form, textarea, [contenteditable="true"], .sr-only, [data-testid*="citation"], [class*="citation"], [data-testid*="feedback"], [data-testid*="copy"], [data-testid*="share"]',
      stop: '[data-testid="stop-button"]',
      scrollSelector: ".thread-scroll-container",
      diagnose: ["main", "main article", ".thread-scroll-container", ".thread-scroll-container > *", "[data-message-author-role]", "[data-message-id]", ".markdown", ".whitespace-pre-wrap", '[data-message-content]', '[data-testid^="conversation-turn"]', ".sr-only", '[data-testid="stop-button"]', ".katex", "pre", ".cm-content"],
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

    // In current ChatGPT builds the role attribute is on the message
    // container itself. Keep that node instead of climbing to an article that
    // may contain several turns.
    if (el.matches("[data-message-author-role]")) return el;

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
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (p.hasAttribute("aria-label")) labelled.push(p);
      }
      for (const node of labelled) {
        const t = (node.getAttribute("aria-label") || "").trim().toLowerCase();
        if (/^you said/.test(t)) { role = "user"; break; }
        if (/^chatgpt said/.test(t)) { role = "assistant"; break; }
      }
    }
    role = role ? String(role).trim().toLowerCase() : "";
    if (role === "user" || /\byou\b|user/.test(role)) return "user";
    if (role === "assistant" || /assistant|chatgpt/.test(role)) return "assistant";
    return null; // never guess
  }

  function chatgptThreadRole(el, index) {
    const labels = [el.getAttribute("aria-label") || "", el.className || ""];
    labels.push(...Array.from(el.querySelectorAll("[aria-label]"), (node) => node.getAttribute("aria-label") || ""));
    const marker = labels.join(" ").toLowerCase();
    if (/\b(user|you|human|question)\b/.test(marker)) return "user";
    if (/\b(assistant|chatgpt|model|response)\b/.test(marker)) return "assistant";
    return index % 2 === 0 ? "user" : "assistant";
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
    if (!items.length && cfg.site === "chatgpt") {
      const thread = document.querySelector(".thread-scroll-container");
      const threadEls = thread
        ? Array.from(thread.children).filter((el) => (el.textContent || "").replace(/\s+/g, " ").trim().length >= 2)
        : [];
      if (threadEls.length) {
        const seen = new Set();
        threadEls.forEach((el, index) => {
          const text = cfg.postProcess(serialize(el, cfg.junk, false));
          if (!text || text.length < 2 || seen.has(text)) return;
          seen.add(text);
          const role = chatgptRoleOf(el) || chatgptThreadRole(el, index);
          items.push({ key: stableId(el) || "h:" + hash(role + "\u0001" + text), role, text });
        });
      }
    }
    if (!items.length && cfg.site === "chatgpt") {
      const fallbackEls = outermost(
        Array.from(
          document.querySelectorAll(
            'main article, [role="main"] article, article[data-message-id], article'
              + ', [data-message-content], main .whitespace-pre-wrap, [role="main"] .whitespace-pre-wrap'
          )
        ).filter(
          (el) =>
            el.matches(".markdown, .prose, .whitespace-pre-wrap, [data-message-content]") ||
            el.querySelector(".markdown, .prose, .whitespace-pre-wrap, [data-message-content]")
        )
      );
      const seen = new Set();
      for (const el of fallbackEls) {
        const text = cfg.postProcess
          ? cfg.postProcess(serialize(el, cfg.junk, false))
          : serialize(el, cfg.junk, false);
        if (!text || text.length < 2 || seen.has(text)) continue;
        seen.add(text);
        const role = items.length % 2 === 0 ? "user" : "assistant";
        items.push({ key: stableId(el) || "h:" + hash(role + "\u0001" + text), role, text });
      }
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
    d.fallbackCandidates = count("main article, main [data-message-id]");
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
  window.__synapseHarvest = harvest;      // DevTools: see exactly what would be captured right now

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
      const isVisible = (el) => {
        if (!el) return false;
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
      };
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer); clearTimeout(hard); obs.disconnect();
        resolve();
      };
      const check = () => {
        clearTimeout(timer);
        if (cfg.stop && Array.from(document.querySelectorAll(cfg.stop)).some(isVisible)) return; // still streaming
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

  // ---- conversation identity (stops cross-chat captures) ------------------------------
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

  function convoId() {
    const m = location.pathname.match(/\/c\/([0-9a-f-]{8,})/i);
    return m ? m[1] : null;
  }

  // Title of this conversation as shown in the sidebar list (null if not found).
  function sidebarTitle(id) {
    const a = document.querySelector(`a[href$="/c/${id}"], a[href*="/c/${id}?"]`);
    const t = a ? norm(a.textContent) : "";
    return t || null;
  }

  function headerCheck() {
    if (cfg.site !== "chatgpt") return { ok: true, id: location.pathname, title: document.title };
    const id = convoId();
    if (!id) return { ok: false, reason: "this page has no /c/<id> in the URL, so it isn't a saved conversation" };
    const doc = norm(document.title);
    const side = sidebarTitle(id);
    if (side === null) return { ok: true, id, title: document.title, verified: false }; // sidebar hidden
    const match = doc && (doc.includes(side) || side.includes(doc));
    return match
      ? { ok: true, id, title: document.title, verified: true }
      : { ok: false, id, reason: `the tab title "${document.title}" does not match the sidebar title "${side}"` };
  }
  window.__synapseHeader = headerCheck; // DevTools: should return ok:true, verified:true

  async function waitForHeaderMatch(ms) {
    const deadline = Date.now() + ms;
    let last = headerCheck();
    while (!last.ok && Date.now() < deadline) { await sleep(300); last = headerCheck(); }
    return last;
  }

  function assertSame(startId) {
    const now = cfg.site === "chatgpt" ? convoId() : location.pathname;
    if (now !== startId) throw new Error("You switched conversations during capture. Nothing was saved. Try again.");
  }

  // ---- expand collapsed messages ("Show more") --------------------------------------------
  function expandCollapsed() {
    let clicked = 0;
    document.querySelectorAll('button[aria-expanded="false"]').forEach((b) => {
      const label = (b.textContent || "").trim().toLowerCase();
      if (!/^show more\b|^read more\b|^expand\b/.test(label)) return;
      if (!b.closest("[data-message-author-role], [data-turn]")) return; // only inside messages
      try { b.click(); clicked++; } catch (_) {}
    });
    return clicked;
  }

  // ---- load the whole conversation ------------------------------------------------------
  // Picks the scrollable ancestor with the LARGEST scroll range (the real chat
  // scroller), not merely the nearest one, which can be a small inner element.
  function findScrollContainer(startEl) {
    const scrollable = (el) => {
      const oy = getComputedStyle(el).overflowY;
      return /auto|scroll|overlay/.test(oy) && el.scrollHeight > el.clientHeight + 4;
    };
    if (cfg.scrollSelector) {
      const hinted = document.querySelector(cfg.scrollSelector);
      if (hinted && scrollable(hinted)) return hinted;
    }
    let best = null;
    for (let el = startEl && startEl.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (scrollable(el) && (!best || el.scrollHeight - el.clientHeight > best.scrollHeight - best.clientHeight)) best = el;
    }
    return best || document.scrollingElement || document.documentElement;
  }

  async function collectAll(startId) {
    const first0 = findTurns().elements[0];
    if (!first0) return [];
    const box = findScrollContainer(first0);
    const original = box.scrollTop;

    try {
      // Phase 1: scroll to the top until turn count and scrollHeight are stable x3.
      let stable = 0, lastCount = -1, lastHeight = -1;
      for (let i = 0; i < 60 && stable < 3; i++) {
        assertSame(startId);
        box.scrollTop = 0;
        await sleep(i < 2 ? 500 : 700);
        const n = findTurns().elements.length;
        const h = box.scrollHeight;
        stable = n === lastCount && h === lastHeight ? stable + 1 : 0;
        lastCount = n; lastHeight = h;
        progress(`Loading older messages… (${n} turns in view)`);
      }

      // Phase 2: ALWAYS sweep top -> bottom in overlapping steps, accumulating
      // turns. ChatGPT may unload off-screen messages without removing the first
      // turn node, so "is it virtualized?" detection is not reliable.
      console.info(LOG, "sweeping conversation");
      box.scrollTop = 0;
      await sleep(500);
      const step = Math.max(200, Math.floor((box.clientHeight || window.innerHeight) * 0.6));
      let acc = [], stalls = 0;
      const t0 = Date.now();
      for (let guard = 0; guard < 800 && Date.now() - t0 < 180000; guard++) {
        assertSame(startId);
        if (expandCollapsed()) await sleep(250); // let expanded text render
        acc = mergeItems(acc, harvest());
        const maxTop = box.scrollHeight - box.clientHeight;
        progress(`Collecting messages… (${acc.length} so far, scroll ${Math.round(box.scrollTop)}/${Math.round(maxTop)})`);
        if (box.scrollTop >= maxTop - 2) {
          await sleep(350); // let late renders / height re-measurement settle
          if (expandCollapsed()) await sleep(250);
          acc = mergeItems(acc, harvest());
          if (box.scrollHeight - box.clientHeight <= box.scrollTop + 2) break;
          continue;
        }
        const before = box.scrollTop;
        box.scrollTop = Math.min(before + step, maxTop);
        await sleep(350);
        if (Math.abs(box.scrollTop - before) < 1) {
          // Scroller didn't move: nudge by scrolling the last visible turn into view.
          stalls++;
          const els = findTurns().elements;
          const last = els[els.length - 1];
          if (last) last.scrollIntoView({ block: "start" });
          await sleep(350);
          if (stalls >= 6) break;
        } else stalls = 0;
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
        progress("Checking conversation…", true);
        const head = await waitForHeaderMatch(6000);
        if (!head.ok) {
          return { ok: false, error: `Capture stopped: ${head.reason}. Wait for the chat to finish loading and try again.` };
        }
        const startId = head.id;
        if (head.verified === false) console.warn(LOG, "Sidebar title not found; verified by URL id only.");

        progress("Waiting for the response to finish…", true);
        await waitForIdle();
        await waitForTurns(5000);
        const items = await collectAll(startId);

        // Re-check after the sweep, right before saving.
        const end = headerCheck();
        if (!end.ok || end.id !== startId) {
          return { ok: false, error: "The conversation changed while capturing. Nothing was saved. Try again." };
        }

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
  function handler(msg, sender, sendResponse) {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "CAPTURE_CHAT" || msg.type === "CAPTURE_CHAT_V2" || msg.type === "CAPTURE_CHAT_V4") {
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
  }

  chrome.runtime.onMessage.addListener(handler);
  window.__SYNAPSE_CLEANUP__ = () => {
    try { chrome.runtime.onMessage.removeListener(handler); } catch (_) {}
  };
})();