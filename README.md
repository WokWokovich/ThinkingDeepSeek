# Thinking DeepSeek

Browser extension for chat.deepseek.com built with WXT (vanilla TypeScript).

## Features

- Copy button above every DeepThink reasoning block (toggleable).
- Attache the last reasoning block to your next message as a `<previous_thinking>` tag, injected at the network level (fetch + XHR), so the composer stays untouched.
- Gray frame inside each user message shows what was attached. Raw `<previous_thinking>` tags are hidden from view.
- Settings page with two switches, opens in its own tab (works on Firefox for Android).

## Development

```
npm install
npm run dev            # Chrome (MV3)
npm run dev:firefox    # Firefox (MV3)
```

## Build

```
npm run build
npm run build:firefox
```

Output: `.output/chrome-mv3` and `.output/firefox-mv3`.

## Test

```
npm test
```

Unit tests cover the pure helpers in `src/utils/thinking.ts`
(`stripWrappedThinking`, `injectIntoContent`, `inject`, `isCompletionEndpoint`).

## Load unpacked

**Chrome**: `chrome://extensions`, enable Developer mode, Load unpacked, pick `.output/chrome-mv3`.

**Firefox**: `about:debugging#/runtime/this-firefox`, Load Temporary Add-on, pick `.output/firefox-mv3/manifest.json`.

Minimum Firefox: 158.

## Smoke checklist (Firefox MV3)

1. Load `.output/firefox-mv3/manifest.json` in `about:debugging`.
2. Open chat.deepseek.com, send a message that triggers DeepThink.
3. Copy button appears above the reasoning block; clicking copies the text.
4. Send a second message with "attach previous thinking" on; the network request body contains `<previous_thinking>`.
5. The user message shows the gray "Previous thinking" frame; raw tags are hidden.
6. Toggle both switches on the settings page and reload the tab: behavior follows.
7. Navigate between conversations (SPA): buttons and previews re-sync.

## Notes

- Requires Node.js 22 or newer.
- The page-context hook lives in `src/entrypoints/main-world.content.ts` and is declared with `world: "MAIN"`. It runs at `document_start` before page scripts, so it patches `fetch`/`XHR` early. No `web_accessible_resources` and no `<script src>` injection are needed.
- Content script and main-world script talk over `window.postMessage`. On startup the main-world script posts `TDS_MAIN_WORLD_READY`, and the content script replies with the current cached thinking, so a late-loading hook still gets the state.
- `previous_thinking` payloads are stripped of nested wrappers both before and after injection, so the LLM echoing our tag back does not create infinite recursion.
- The last thinking block is cached and updated only when the number of reasoning blocks grows — scrolling through the conversation does not change what gets attached.

## About AI
This project was made with AI. Sorry if this matters.
