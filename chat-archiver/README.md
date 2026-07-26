# Chat Archiver

Manifest V3 extension: capture your own conversations from ChatGPT, Claude, and
Gemini into local storage, export as JSON, and inject prompts into the active
chat input.

## Install (unpacked)
1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open chatgpt.com, claude.ai, or gemini.google.com, then click the extension icon.

## Use
- **Capture this conversation** — scrapes visible turns on the page and saves
  them to `chrome.storage.local`.
- **Inject prompt** — types text into the site's input box; check **Auto-send**
  to submit it immediately, or leave it for manual review first.
- **Export JSON** — downloads everything captured so far as one file.
- **Clear all** — wipes local storage.

## Selector maintenance
`content.js` has one config block per site (`CONFIGS`) with the DOM selectors
for message turns and the input/submit controls. These sites change their DOM
often, so if capture starts returning 0 messages or injection stops finding
the input box:

1. Open DevTools on the chat page, inspect a message bubble or the input box.
2. Update the matching selector in `CONFIGS[hostname]`.
3. Reload the extension from `chrome://extensions`.

If specific selectors find nothing, capture falls back to grabbing the
`<main>` element's plain text so it never silently returns empty — but that
fallback won't split messages by role.

## Notes
- Only reads pages you're already logged into and viewing — no network
  scraping, no other users' data.
- Storage is local to your browser; nothing is sent anywhere.
