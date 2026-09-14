<p align="center">
  <img src="src/logo.png" width="96" height="96" alt="X-TOC logo">
</p>

<h1 align="center">X-TOC</h1>

<p align="center">
  <strong>Jump to a section. Keep the lines that matter.</strong><br>
  A lightweight, open-source reading companion for X/Twitter long-form articles.
</p>

<p align="center">
  English · <a href="README.zh-CN.md">中文</a>
</p>

<p align="center">
  <a href="https://github.com/HiAriesZhou/x-toc/releases"><img src="https://img.shields.io/badge/version-0.5.0-blue" alt="Version 0.5.0"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <a href="https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb"><img src="https://img.shields.io/chrome-web-store/size/nbdgpckkcfkomnmdefinikjijgljgjfp" alt="Chrome Web Store"></a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb"><strong>Install from the Chrome Web Store</strong></a>
</p>

X-TOC helps you navigate structured X Articles, save useful passages with their source context, and move your clips into an open format when you are done reading.

<p align="center">
  <img src="store-assets/chrome-store-screenshot-1280x800.png" alt="X Article with the X-TOC table of contents pinned beside the reading column">
  <br>
  <sub>Keep the article structure visible and jump between sections while reading.</sub>
</p>

## How it works

1. **Navigate the article.** Open the popup to see detected headings, jump to a section, or pin a movable table of contents beside the article.
2. **Save a passage.** Select text and click `save to xtoc`. X-TOC stores the passage locally with its article, author when available, timestamps, and surrounding context.
3. **Organize and export.** Open Options to search clips, add tags or notes, delete items, and export all or selected clips as Markdown or JSON.

## What ships today

- Heading detection and section navigation for X.com and Twitter.com long-form articles.
- Popup and floating table-of-contents views.
- A draggable floating panel whose position is remembered.
- One-click local clipping from text selections in supported articles.
- An article-grouped clip library with search, tags, and notes.
- Selected or full-library export to Markdown and JSON.
- Local storage with no clip uploads or separate X-TOC account.

X-TOC currently saves passages for later review; it does not restore highlights in the original article or sync clips to a cloud service.

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

Public product metadata for downstream sites lives in [`.portfolio/project.json`](.portfolio/project.json). Update the manifest and its referenced assets as part of a public release. The release workflow can notify a configured portfolio immediately; otherwise the portfolio's scheduled pull discovers the change.

## Privacy

Saved clips, tags, notes, and settings remain in `chrome.storage.local`. Exports happen only when you request them. X-TOC does not send saved clips to an external server.

## Project links

[Product website](https://x-toc.vercel.app) · [Project story](https://www.arieszhou.com/projects/x-toc) · [Contributing](CONTRIBUTING.md)

## License

MIT. See [LICENSE](LICENSE).
