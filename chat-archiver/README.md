# Synapse Chat Archiver

Manifest V3 extension: capture your own conversations from ChatGPT, Claude, and
Gemini into local storage, export as JSON, and inject prompts into the active
chat input.

## React popup migration
The popup UI now runs as a React application bundled into the extension popup.
The content script and background script remain compatible with the existing
Manifest V3 structure.

## Install (unpacked)
1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open chatgpt.com, claude.ai, or gemini.google.com, then click the extension icon.

## Build the popup
Run:

```bash
npm install
npm run build
```

The bundle is emitted to `dist/popup.js` and loaded by `popup.html`.
