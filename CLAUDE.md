# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

`AGENTS.md` (imported above) is the authoritative rule set: repository role, public/private routing to Obsidian, browser validation, local-data and export contracts, version policy, the Portfolio release contract, and the required completion report. This file only adds orientation that is not covered there.

## Commands

```bash
npm test                                   # runs `check:store-assets` (pretest), then `node --test`
node --test test/clip-utils.test.js        # single test file (skips the store-asset check)
node --test --test-name-pattern="clamp"    # tests matching a name
npm run check:store-assets                 # store/ upload copies must match marketing/store/ + icons
npm run dev                                # Extension.js dev mode with hot reload
npm run build                              # dist/chromium
npm run build:firefox / build:edge         # per-browser targets
npm run build:dev                          # dist/chromium-dev: local debug copy with DEV name/icons
npm run build:zip                          # release/: Chrome, Edge, Firefox store ZIPs + Firefox source ZIP
```

There is no lint script. Extension.js (`extension` devDependency) bundles each entry, so `src/` files may use ES `import` even in the content script. `extension.config.js` pins persistent browser profiles under `dist/extension-profile-*`.

## Architecture

Plain JavaScript, no framework, no runtime dependencies. Four runtime surfaces communicate only through `chrome.runtime`/`chrome.tabs` messages and `chrome.storage.local`:

- **Content script** (`src/content/scripts.js`, runs on x.com/twitter.com) owns everything that touches the page: TOC extraction (`extractTOC` → `findArticleContainer`, title via `data-testid="twitter-article-title"` or a non-chrome `h1`, then headings), the draggable `TOCPanel` class (floating pinned panel, active-section tracking), and the selection → "save to xtoc" clip flow that writes articles and clips to storage. A `MutationObserver` re-extracts the TOC after SPA navigation, ignoring mutations caused by the extension's own elements (`isExtensionMutation`). The default export is the Extension.js hot-reload teardown.
- **Popup** (`src/popup/scripts.js`) holds no state: it asks the content script for `getTOC`, then sends `scrollTo` / `togglePanel`. The content script also handles `showPanel` / `hidePanel`.
- **Background** (`src/background.js`) only registers the "Show Table of Contents" context menu and handles `openClips` (from the pinned panel) by opening the Options page.
- **Options page** (`src/options/scripts.js`) is the clip library: grouping by article, search, tag/note editor, deletion, and Markdown/JSON export via downloads.

Pure, testable logic is deliberately split out of the DOM-heavy scripts, and tests import only these modules:
- `src/content/navigation-utils.js` — active-section index, scroll clamping, TOC equality.
- `src/options/clip-utils.js` — tag/note normalization, filtering, selection state, display metadata.
- `src/options/export-utils.js` — Markdown and JSON (`version: 1`) rendering.

When adding logic that can be unit-tested, put it in one of these modules (or a sibling) rather than in `scripts.js`.

Data model: articles keyed by `articleId` (`article_<statusId>` from the `/status/<id>` URL, else a hash of the canonical URL); clips reference `articleId`. Storage key names are duplicated as constants in both content and options scripts — change both together. `src/types/xtoc.d.ts` documents the article/clip/export shapes (types only, not proof of shipped behavior).

## Manifest and metadata

- `src/manifest.json` uses Extension.js browser-prefixed keys (`chromium:` → MV3 with `action`/service worker; `firefox:` → MV2 with `browser_action`/background scripts). Check the generated manifest in `dist/<browser>` after changes.
- `test/release-metadata.test.js` enforces that `package.json`, `src/manifest.json`, and both READMEs' version badges agree, that the version is not older than `.portfolio/project.json` `releaseVersion`, and that every Portfolio asset path exists.
- `store/` holds the browser-store release definition (`store/release.yml`, listing text, release copies of assets); `marketing/` holds how they are made (`store-art.html` template, real UI captures in `ui/`, fixtures, social card); `assets/brand/` holds the logo and wordmark sources. `tooling/check-store-assets.js` fails `npm test` and `build:zip` when they diverge.
