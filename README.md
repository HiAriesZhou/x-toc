<h1 align="center">
  <img src="src/wordmark.svg" width="280" alt="XTOC">
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

Open **Library** from the popup or pinned contents panel. Use **Save page to Library** in the popup to capture the loaded article or post. Captures start as partial; only mark a body complete after comparing it with the fully loaded original.

- Organize references with Inbox, collections, tags and notes. Deleted items go to local Trash; X bookmarks are never deleted remotely.
- Open your X Bookmarks page and start the on-page importer. Pause, cancel or repeat an import without duplicating items. Only loaded previews are captured, not guaranteed full history or article bodies.
- Export selected or filtered articles as a **Markdown knowledge pack**: one stable file per item and a source-linked index. Original text, clips, notes and accepted AI summaries stay separate. Notes can be excluded. The ZIP is a download, not folder sync or automatic Agent memory.
- Use **Settings → Download backup / Restore backup** for full-library JSON backup and merge. Existing records win on conflicts. Existing clip Markdown and JSON v1 exports remain available separately.
- Optional **AI suggestions** use your HTTPS OpenAI-compatible endpoint, model and session-only key. Review selected text and classification vocabulary before sending, then accept or discard tags, collection suggestions and summaries. Notes are not sent. Undo protects subsequent edits.

AI compatibility requires Chat Completions JSON mode; provider charges apply and exact cost is unavailable. Keys are excluded from backups, exports and page scripts, but browser compromise can still expose them. Article text is external reference material, not Agent instructions. Media are referenced, not downloaded. This source version does not imply browser-store publication; `.portfolio/project.json` still describes the confirmed published release.

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

Chrome/Chromium is the documented store and load-unpacked path. Firefox and Edge have separate build targets and should be tested in their own browsers before distribution.

After building, `npm run test:browser` loads `dist/chromium` in an isolated headless Playwright profile. Install its browser if needed with `npx playwright install chromium`, or set `XTOC_CHROMIUM_PATH` to an existing Chromium testing executable. This uses synthetic X pages and a synthetic AI provider, not a live account or model. Screenshots and downloads remain under ignored `dist/library-qa`. Live X markup, real provider quality, permission prompts and Firefox/Edge runtime need separate validation.

Public product metadata for downstream sites lives in [`.portfolio/project.json`](.portfolio/project.json). Update the manifest and its referenced assets as part of a public release. The release workflow can notify a configured portfolio immediately; otherwise the portfolio's scheduled pull discovers the change.

## Privacy

Saved text, clips, tags, notes and settings remain in `chrome.storage.local`; the `unlimitedStorage` permission keeps saved article bodies from hitting the default local quota and grants no site access. Exports are user-triggered downloads. Optional AI sends only previewed content and classification vocabulary directly to the configured provider after confirmation. AI host access is requested for that provider only; page scripts remain limited to X/Twitter. Keys use extension session storage, or worker memory when unavailable, and are never persisted in library data. **Forget key** clears the key and revokes that provider permission. There is no telemetry, X credential collection, cloud library storage or automatic upload.

## Project links

[Product website](https://x-toc.vercel.app) · [Project story](https://www.arieszhou.com/projects/x-toc) · [Contributing](CONTRIBUTING.md)

## License

MIT. See [LICENSE](LICENSE).
