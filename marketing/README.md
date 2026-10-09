# Marketing sources

How XTOC's store images and social card are made. What actually gets uploaded lives in
[`../store`](../store); brand sources (logo, wordmark) live in [`../assets/brand`](../assets/brand).

| Path | Contents |
|---|---|
| `store-art.html` | Template for every store image and the social card, selected with `?variant=` |
| `store/` | Rendered store images. `store/assets` in the repository root holds the upload copies |
| `ui/` | Real Library captures embedded by the template |
| `fixtures/mock-storage-data.json` | Fictional, public-safe data for screenshots |
| `social/xtoc-social-1280x640.png` | GitHub and website link card |

`npm run check:store-assets` (run before `npm test` and `npm run build:zip`) verifies that every
file referenced by `store/release.yml` exists, that `store/assets` and `store/listing` contain no
unreferenced files, and that each upload copy matches its source here.

## Rendering store images

Serve the repository root over HTTP (for example `python3 -m http.server`) so the template can load
`../assets/brand/wordmark.svg` and `ui/*.png`. Open `marketing/store-art.html?variant=<name>` and
capture the viewport at a device scale factor of 1, at exactly the output size. Export opaque RGB PNGs.

| Variant | Output | Size | Upload copy |
|---|---|---|---|
| `screenshot` | `store/01-reading-1280x800.png` (illustrated) | 1280 × 800 | `store/assets/screenshots/01-x-toc-1280x800.png` |
| `library` | `store/02-bookmarks-1280x800.png` | 1280 × 800 | `store/assets/screenshots/02-bookmarks-1280x800.png` |
| `export` | `store/03-export-1280x800.png` | 1280 × 800 | `store/assets/screenshots/03-export-1280x800.png` |
| `marquee` | `store/marquee-1400x560.png` | 1400 × 560 | `store/assets/promo/marquee-1400x560.png` |
| `small` | `store/small-440x280.png` | 440 × 280 | `store/assets/promo/small-440x280.png` |
| `social` | `social/xtoc-social-1280x640.png` | 1280 × 640 | — |

After rendering, copy each store image to its upload path and run `npm run check:store-assets`.
The store icon is `src/icons/logo-128.png`, copied to `store/assets/icon/icon-128.png`. For Edge,
which recommends a 300 × 300 logo, upload `assets/brand/logo.png` (512 × 512).

## Real UI captures

The `library`, `export` and `marquee` variants embed captures from `ui/`:

- `ui/library-bookmarks.png` — Bookmarks with the detail drawer and an AI suggestion, 1180 × 700 viewport at 2× scale.
- `ui/library-clips-export.png` — Clips with three selected and the export menu open, 980 × 640 viewport at 2× scale.

Capture them from a release build (official logo, not the DEV build) loaded with the fixture below, in
an isolated profile, light theme, scrollbars hidden. The AI suggestion comes from a test provider; no
real model output or key appears in the image.

## Screenshot fixture

`fixtures/mock-storage-data.json` matches the current `chrome.storage.local` keys: seven articles and
posts, seven clips (`twitterTocExcerpts`) and six bookmarks (`xtocLibraryItems`, in X bookmark order,
one with an accepted AI summary). It covers clips with and without tags and notes, a long clip, several
clips under one article, and article and post bookmarks with and without tags, notes and summaries.
All names, handles and text are fictional.

This is separate from `tooling/dev-seed.json`, the 20 sample clips that the development build's
**Settings → Sample data** loads and removes. Changing this fixture changes what the store images show.

To load the fixture into a test profile:

1. Open `chrome://extensions/`, find **XTOC**, choose **Details**, then **Extension options** (the Library).
2. Open DevTools on that page and confirm the console runs in the extension context:

   ```js
   location.protocol // "chrome-extension:"
   Boolean(chrome?.storage?.local) // true
   ```

3. Assign the JSON object to `mockStorageData`, then run:

   ```js
   await chrome.storage.local.set(mockStorageData)
   location.reload()
   ```

Use an isolated browser profile: restoring real data afterwards is left to the profile boundary rather
than a destructive reset command.

## Social card

`social/xtoc-social-1280x640.png` reflows the reading illustration at 1280 × 640 for GitHub and website
link previews. Keep it under 1 MB. Committing it does not update GitHub's preview: upload it in
**Settings → Social preview → Edit**. The website repository serves its own copy at
`public/images/x-toc-social-1280x640.png`; update both together.
