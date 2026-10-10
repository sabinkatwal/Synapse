# SYNAPSE Web Archiver (Manifest V3)

Captures full ChatGPT / Claude / Gemini conversations and saves them to the
SYNAPSE backend (`https://synapse-wqm8.onrender.com`). Plain JavaScript, no
build step, no CDN scripts.

## Files
| File | Role |
|---|---|
| `manifest.json` | MV3 manifest (permissions: storage, activeTab, scripting, sidePanel) |
| `background.js` | Service worker: `SAVE_CHAT` (with de-duplication), `PUSH_PROMPT_TO_ACTIVE_AI`, `setPanelBehavior({openPanelOnActionClick:false})` |
| `api.js` | Shared fetch helper: 60 s timeout, "server waking up" state, one retry, 401 -> clears `authToken` |
| `content.js` | Per-site selector config, capture, load-everything logic, diagnostics, inject |
| `popup.html` / `popup.js` | Toolbar popup with one button that opens the side panel |
| `sidepanel.html` / `sidepanel.js` | Side panel UI |
| `sidepanel-light.css` / `sidepanel-dark.css` | Your existing themes (unchanged) |
| `icons/` | Your existing `icon16.png`, `icon48.png`, `icon128.png` (unchanged) |

The React popup (`dist/popup.js`, `src/index.jsx`, `package.json`, esbuild) is
replaced by the plain popup, so `npm install` / `npm run build` are no longer needed.

## Load unpacked
1. `chrome://extensions` -> enable **Developer mode**.
2. **Load unpacked** -> select this folder.
3. Open a chat on chatgpt.com / claude.ai / gemini.google.com, click the toolbar
   icon -> **Open side panel**, log in, press **Capture this conversation**.

## Test checklist
1. New ChatGPT chat, 2 turns -> capture reports exactly **4 messages**, no UI text ("Upgrade", "Share", "You said:" ...).
2. Long Claude chat opened from history -> all messages captured, not just the latest; scroll position is restored afterwards.
3. Gemini chat -> user/assistant roles alternate correctly.
4. Captured chat appears in the side-panel list and in `GET /chats`.
5. Logged out -> "Please log in first ..." (no scrolling is done).
6. Reload the extension at `chrome://extensions` while a chat tab stays open -> Capture still works (content script is re-injected automatically).
7. Capture the same chat twice -> you get a duplicate warning (OK = replace, Cancel -> "save as additional copy?").
8. Render cold start: after ~15 min idle, the first request shows "Server is waking up ...".

## When a site changes its DOM
All selectors live at the top of `content.js` in the `SITES` object:
- `turns`: fallback chain; the first selector that matches wins. Add a new selector at the front.
- `textSelectors`, `junk`, `stop`, `scrollSelector`, `userMatch` / `assistantMatch`.

Debugging selector drift:
1. Open DevTools on the chat tab, and in the console's context dropdown (top-left, says "top") pick **SYNAPSE Web Archiver**.
2. Run `__synapseDiagnose()`. It prints how many nodes every selector matched, which selector won, and the role counts.
3. A failed capture also logs the same diagnostics to the page console and the side panel console.

Quick manual checks (run in the normal "top" context):
```js
// ChatGPT
[...document.querySelectorAll('[data-message-author-role]')].map(e => e.dataset.messageAuthorRole)
// Claude
({user: document.querySelectorAll('[data-testid="user-message"]').length,
  msg: document.querySelectorAll('div.font-claude-message').length,
  resp: document.querySelectorAll('div.font-claude-response').length})
// Gemini
({u: document.querySelectorAll('user-query').length, m: document.querySelectorAll('model-response').length})
```

## Behaviour notes
- **Duplicates:** the API has no update endpoint, so "replace" = `POST` the new capture, then `DELETE` the old one (never the other way round). URLs are compared without query/hash.
- **Long chats:** every capture scrolls to the top until turn count and scrollHeight are stable 3 times. If old turns disappear from the DOM when you scroll away (virtualized list), it sweeps top to bottom and merges snapshots, then restores your scroll position.
- **ChatGPT text** comes only from `.markdown` / `.whitespace-pre-wrap`; it never falls back to page text. KaTeX is kept as `$...$` / `$$...$$`, code blocks as fenced blocks.
- **Foreign errors:** the content script never hooks global `error`/`unhandledrejection` events, so errors from other extensions or the page's CSP can't affect capture.
