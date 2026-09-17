# Store asset fixtures

`mock-storage-data.json` contains fictional, public-safe content for taking screenshots of the Saved Clips interface. It matches the current `chrome.storage.local` keys and includes three articles and seven clips.

The fixture deliberately covers:

- clips with tags and notes;
- clips with tags only;
- a clip with no optional metadata;
- a long clip that reveals the **Show full clip** control;
- multiple clips grouped under one article.

To use it:

1. Open `chrome://extensions/`.
2. Find **X-TOC**, choose **Details**, then choose **Extension options**.
3. Open DevTools from that Options tab. Do not run the command from an X.com tab or another normal webpage.
4. In the Console, confirm that the selected execution context belongs to the `chrome-extension://...` Options page:

```js
location.protocol
// "chrome-extension:"

Boolean(chrome?.storage?.local)
// true
```

5. Copy the JSON object into a variable named `mockStorageData`, then run:

```js
await chrome.storage.local.set(mockStorageData)
location.reload()
```

If `chrome.storage` is undefined, use the Console's execution-context selector to switch from the inspected web page to the X-TOC extension context. The same command can also run in the X-TOC service-worker console opened from `chrome://extensions/`.

Use an isolated browser profile for screenshots. Restoring real data after loading the fixture is intentionally left to the profile boundary instead of adding a destructive reset command.

`chrome-store-assets.html` is the source for the generated 1280 × 800 screenshot and 1400 × 560 marquee image.

`chrome-store-small-440x280.png` is the small promotional tile. Open `chrome-store-assets.html?variant=small` and capture `.small` at a device scale factor of 1. Export an opaque RGB PNG at 440 × 280. Its outline and bookmark are illustrations of navigation and clipping, with no real article or user data.

## Social preview

`x-toc-social-1280x640.png` is an opaque RGB PNG for GitHub and website link cards. It reflows the reading demo at 1280 × 640 rather than cropping the store screenshot. The content is fictional demo data describing released behavior.

To reproduce it, open `chrome-store-assets.html?variant=social` and capture the `.screenshot` element at a device scale factor of 1. Keep the output below 1 MB for GitHub.

For the repository card, upload the PNG in GitHub **Settings → Social preview → Edit**. Committing the file alone does not configure GitHub's preview.

The website repository serves an identical copy at `public/images/x-toc-social-1280x640.png`. Its metadata references that public path for both Open Graph and the X large-image card. When updating the artwork, update both copies and their dimensions together.
