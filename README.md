<h1 align="center">
  <img src="assets/brand/wordmark.svg" width="280" alt="XTOC">
</h1>

<p align="center">
  <strong>Jump to a section. Keep the lines that matter.</strong><br>
  A lightweight, open-source reading companion for X/Twitter long-form articles.
</p>

<p align="center">
  English · <a href="README.zh-CN.md">中文</a>
</p>

<p align="center">
  <a href="https://github.com/HiAriesZhou/x-toc/releases"><img src="https://img.shields.io/badge/version-0.7.0-blue" alt="Version 0.7.0"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <a href="https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb"><img src="https://img.shields.io/chrome-web-store/size/nbdgpckkcfkomnmdefinikjijgljgjfp" alt="Chrome Web Store"></a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb"><strong>Install from the Chrome Web Store</strong></a>
</p>

**A star won't fix bugs, but it makes the person fixing them happy.**

XTOC helps you navigate structured X Articles, save useful passages with their source context, and move your clips into an open format when you are done reading.

## Video demo

https://github.com/user-attachments/assets/b107995f-3b2a-4432-9530-48a93c886aa3

Watch the 40-second demo: navigate an article, save passages, edit tags and notes, and export clips.

[Try the interactive demo](https://x-toc.vercel.app/)

## How it works

1. **Navigate the article.** Open the popup to see detected headings, jump to a section, or pin a movable table of contents beside the article.
2. **Save a passage.** Select text and click `save to xtoc`. XTOC stores the passage locally with its article, author when available, timestamps, and surrounding context.
3. **Organize and export.** Open Library to search clips, add tags or notes, delete items, and export all or selected clips as Markdown or JSON.

## Library in this source checkout (0.7.0)

Open **Library** from the popup or the pinned contents panel. It has three pages:

- **Clips** — search, tag, annotate, delete and export your saved passages.
- **Bookmarks** — articles and posts saved with **Save to Bookmarks** in the popup, or imported from your X Bookmarks page. Imports only read loaded previews and never change your X bookmarks.
- **Settings** — optional AI and local storage usage.

Clips and bookmarks export as Obsidian-style Markdown: a ZIP with one note per article or post, YAML properties, tags, and clips as quote callouts. Clips can also be exported as JSON v1.

Optional AI suggests up to three tags and a short summary for one bookmark at a time. In **Settings**, pick a provider (OpenAI, Anthropic Claude, Google Gemini, DeepSeek, OpenRouter, Qwen, Moonshot Kimi, or any OpenAI-compatible URL), paste your API key and connect; XTOC lists that provider's models and preselects a fast one. It sends only that bookmark's saved text and your existing tag names; notes are never sent. Nothing changes until you choose **Apply**. By default the key is kept only for the browser session; turn on **Remember on this device** to keep it encrypted in the extension's own storage on this device. It is never synced, exported or readable by X pages. Provider charges apply.

This source version is not yet published; `.portfolio/project.json` describes the latest release.

## Published 0.6.2 behavior

- Heading detection and section navigation for X.com and Twitter.com long-form articles.
- Popup and floating table-of-contents views.
- A draggable floating panel whose position is remembered.
- One-click local clipping from text selections in supported articles.
- An article-grouped clip library with search, tags, and notes.
- Selected or full-library export to Markdown and JSON.
- Local storage with no clip uploads or separate XTOC account.

XTOC currently saves passages for later review; it does not restore highlights in the original article or sync clips to a cloud service.

## Install

The [Chrome Web Store version](https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb) is the quickest way to start.

<details>
<summary>Install from source</summary>

```bash
git clone https://github.com/HiAriesZhou/x-toc.git
cd x-toc
npm install
npm run build
```

Then open `chrome://extensions/`, enable Developer mode, choose **Load unpacked**, and select `dist/chromium`.

</details>

## Development

```bash
npm run dev
npm test
npm run build
npm run build:firefox
npm run build:edge
```

For day-to-day debugging, `npm run build:dev` additionally writes `dist/chromium-dev`: the same build renamed **XTOC (Development)** with an orange, striped toolbar icon, so it is easy to tell apart from the store version. Load that folder instead of `dist/chromium`; it gets its own extension ID and local storage. Release ZIPs always use the unbranded builds.

`npm run build:zip` builds all three targets and writes the store packages to `release/`: `xtoc-chrome-v<version>.zip`, `xtoc-edge-v<version>.zip`, `xtoc-firefox-v<version>.zip`, plus `xtoc-source-v<version>.zip` (the committed source, for Firefox Add-ons review). Commit first; the source archive is skipped when there are uncommitted changes.

Chrome/Chromium is the documented store and load-unpacked path. Firefox and Edge have separate build targets and should be tested in their own browsers before distribution.

Public product metadata for downstream sites lives in [`.portfolio/project.json`](.portfolio/project.json). Update the manifest and its referenced assets as part of a public release. The release workflow can notify a configured portfolio immediately; otherwise the portfolio's scheduled pull discovers the change.

## Privacy

Saved text, clips, tags, notes and settings remain in `chrome.storage.local`; the `unlimitedStorage` permission keeps saved article bodies from hitting the default local quota and grants no site access. The `scripting` permission lets XTOC restart itself in X tabs that were already open when it is installed or updated, so they work without a reload; it adds no sites beyond X/Twitter. Exports are user-triggered downloads. Optional AI sends one bookmark's saved text and your tag names directly to the configured provider, only when you ask. AI host access is requested for that provider only; page scripts remain limited to X/Twitter. The API key lives in extension session storage, or, if you choose **Remember on this device**, encrypted (AES-GCM, non-extractable browser key) in the extension's IndexedDB; this keeps it out of plain-text files but does not protect against someone who controls the device. It is never synced, exported or saved with your library. **Remove key** deletes it everywhere and revokes that provider permission. There is no telemetry, X credential collection, cloud library storage or automatic upload.

## Project links

[Product website](https://x-toc.vercel.app) · [Project story](https://www.arieszhou.com/projects/x-toc) · [Contributing](CONTRIBUTING.md)

## License

MIT. See [LICENSE](LICENSE).
