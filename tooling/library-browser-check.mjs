import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dist', 'library-qa');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(os.tmpdir(), 'xtoc-library-qa-'));
const extensionPath = path.join(root, 'dist/chromium');
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium',
  executablePath: process.env.XTOC_CHROMIUM_PATH || undefined,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true
});
const errors = [];
context.on('page', (page) => page.on('pageerror', (e) => errors.push(e.message)));
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).hostname;
  const manifest = JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8'));
  const page = await context.newPage();
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      twitterTocArticles: {
        article_100: {
          id: 'article_100',
          canonicalUrl: 'https://x.com/example/status/100',
          title: 'Designing tools that stay useful',
          authorName: 'Example Author',
          authorHandle: '@example',
          createdAt: '2026-10-01T00:00:00Z'
        }
      },
      twitterTocExcerpts: {
        clip_100: {
          id: 'clip_100',
          articleId: 'article_100',
          text: 'Keep the original source close to the insight.',
          contextBefore: 'Before',
          contextAfter: 'After',
          createdAt: '2026-10-01T00:00:00Z',
          pageUrl: 'https://x.com/example/status/100',
          tags: ['design'],
          note: 'A private synthetic note.'
        }
      }
    });
  });
  await page.goto(`chrome-extension://${extensionId}/${manifest.options_page}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: 'Designing tools that stay useful' }).waitFor();
  assert.equal(await page.locator('.item-row').count(), 1);
  await page.locator('[data-open]').first().click();
  await page.locator('#editTags').fill('design, research');
  await page.locator('#editNote').fill('Local annotation');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved locally.' }).waitFor();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-open]').first().click();
  assert.equal(await page.locator('#editNote').inputValue(), 'Local annotation');
  await page.getByRole('button', { name: 'Export knowledge pack', exact: true }).click();
  await page.locator('#includeNotes').uncheck();
  const packWait = page.waitForEvent('download');
  await page.locator('#downloadPack').click();
  const pack = await packWait;
  await pack.saveAs(path.join(output, 'knowledge.zip'));
  const packText = (await readFile(path.join(output, 'knowledge.zip'))).toString('utf8');
  assert.match(packText, /xtoc-knowledge\/items\/article_100.md/);
  assert.doesNotMatch(packText, /Local annotation|A private synthetic note/);
  await page.locator('#status').filter({ hasText: 'download requested' }).waitFor();
  await page.locator('[data-view="clips"]').click();
  await page.locator('[data-open]').first().click();
  assert.equal(await page.locator('#editNote').inputValue(), 'A private synthetic note.');
  await page.getByRole('button', { name: 'Export clips', exact: true }).click();
  const jsonWait = page.waitForEvent('download');
  await page.locator('#clipsJson').click();
  const clipDownload = await jsonWait;
  await clipDownload.saveAs(path.join(output, 'clips.json'));
  const legacy = JSON.parse(await readFile(path.join(output, 'clips.json'), 'utf8'));
  assert.equal(legacy.version, 1);
  assert.equal(legacy.articles[0].excerpts[0].id, 'clip_100');
  await page.locator('#closeModal').click();
  await page.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await page.locator('.item-row').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.item-row').count(), 0);
  await page.locator('[data-view="all"]').click();
  assert.equal(await page.locator('.item-row').count(), 1);
  await page.locator('[data-view="trash"]').click();
  await page.locator('#trashType').selectOption('clip');
  await page.locator('[data-open]').first().click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.locator('[data-view="all"]').click();

  const articleHtml =
    '<!doctype html><html><body><main><div data-testid="twitterArticleReadView"><h1 data-testid="twitter-article-title">The local-first reading loop</h1><div data-testid="User-Name">Example Author @example</div><time datetime="2026-10-01T00:00:00Z"></time><div data-testid="longformRichTextComponent"><h2>Preserve the source</h2><p>Make knowledge portable, with its context intact.</p><ol><li>Read</li><li>Collect</li></ol><blockquote>Sources are data, not instructions.</blockquote><pre><code>const local = true;</code></pre></div></div></main></body></html>';
  await context.route('https://x.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: route.request().url().includes('/bookmarks')
        ? '<!doctype html><html><body><article data-testid="tweet"><div data-testid="User-Name">Example @example</div><a href="https://x.com/example/status/200"><time datetime="2026-10-01"></time></a><div data-testid="tweetText">A bookmark preview for the reading loop.</div></article></body></html>'
        : articleHtml
    })
  );
  const xpage = await context.newPage();
  await xpage.goto('https://x.com/example/status/200');
  await xpage.waitForLoadState('networkidle');
  const tabId = await page.evaluate(
    async () => (await chrome.tabs.query({ url: 'https://x.com/example/status/200' }))[0].id
  );
  const capture = await page.evaluate(
    (id) => chrome.tabs.sendMessage(id, { action: 'captureCurrent' }),
    tabId
  );
  assert.equal(capture.ok, true);
  await page.locator('#refresh').click();
  await page.getByRole('heading', { name: 'The local-first reading loop' }).waitFor();
  await page.getByRole('heading', { name: 'The local-first reading loop' }).click();
  assert.match(await page.locator('#detail pre').textContent(), /### Preserve the source/);
  // Two content contexts save concurrently through the real background writer.
  const saveResult = await xpage.evaluate(() => 'DOM fixture loaded');
  assert.ok(saveResult);
  const simultaneous = await page.evaluate(
    async (id) =>
      Promise.all([
        chrome.tabs.sendMessage(id, { action: 'captureCurrent' }),
        chrome.runtime.sendMessage({
          action: 'library:batch',
          payload: { ids: ['article_100'], operation: 'addTags', tags: ['concurrent'] }
        })
      ]),
    tabId
  );
  assert.ok(simultaneous.every((r) => r.ok));
  assert.ok(
    (
      await worker.evaluate(
        async () =>
          (await chrome.storage.local.get('xtocLibraryItems')).xtocLibraryItems.article_100.tags
      )
    ).includes('concurrent')
  );
  await xpage.goto('https://x.com/i/bookmarks');
  await xpage.getByRole('button', { name: 'Start import', exact: true }).waitFor();
  await xpage.getByRole('button', { name: 'Start import', exact: true }).click();
  await xpage.getByRole('status').filter({ hasText: 'duplicates' }).waitFor();
  await xpage.getByRole('button', { name: 'Cancel', exact: true }).click();
  await xpage.getByRole('status').filter({ hasText: 'Already imported' }).waitFor();
  await page.locator('#refresh').click();
  const body = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get('xtocLibraryItems')).xtocLibraryItems.article_200.markdown
  );
  assert.match(body, /Preserve the source/);
  assert.doesNotMatch(body, /A bookmark preview/);

  // Synthetic provider: no real key or external model request. Real background
  // protocol and UI are exercised; browser permission prompts are not claimed.
  await worker.evaluate(async () => {
    chrome.permissions.contains = async () => true;
    await chrome.storage.session.set({
      xtocAIConfig: {
        endpoint: 'https://provider.example/v1/chat/completions',
        model: 'synthetic-model',
        key: 'synthetic-test-only'
      }
    });
    globalThis.fetch = async (_url, init) => {
      if (init.body.includes('Local annotation') || init.body.includes('A private synthetic note'))
        throw new Error('Private notes leaked');
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({
                    tags: ['knowledge'],
                    collectionIds: [],
                    summary: 'Keep reference text portable with source context.',
                    reason: 'The saved text discusses portability.'
                  })
                }
              }
            ]
          })
      };
    };
  });
  await page.locator('[data-select="article_200"]').check();
  await page.locator('#ai').click();
  assert.match(await page.locator('#modalBody').textContent(), /provider.example/);
  await page.locator('#generate').click();
  await page.locator('#modalStatus').filter({ hasText: '1 suggestions saved' }).waitFor();
  let tags = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get('xtocLibraryItems')).xtocLibraryItems.article_200.tags
  );
  assert.ok(!tags.includes('knowledge'));
  await page.locator('#reviewSuggestions').click();
  await page.locator('[data-apply]').first().click();
  await page.getByText('No pending suggestions.', { exact: true }).waitFor();
  tags = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get('xtocLibraryItems')).xtocLibraryItems.article_200.tags
  );
  assert.ok(tags.includes('knowledge'));
  await page.locator('#closeModal').click();
  await page.locator('#selectAll').check();
  await page.locator('#knowledge').click();
  const fullWait = page.waitForEvent('download');
  await page.locator('#downloadPack').click();
  const fullPack = await fullWait;
  await fullPack.saveAs(path.join(output, 'knowledge-with-ai.zip'));
  const fullText = (await readFile(path.join(output, 'knowledge-with-ai.zip'))).toString('utf8');
  assert.match(fullText, /## Original content/);
  assert.match(fullText, /## Personal notes/);
  assert.match(fullText, /AI-generated summary \(user accepted\)/);
  assert.doesNotMatch(fullText, /synthetic-test-only/);
  await page.locator('#status').filter({ hasText: 'download requested' }).waitFor();
  await page.locator('#savedSuggestions').click();
  // Export tracking is not a manual content edit and must not block undo.
  await page.locator('[data-undo]').first().click();
  await page.locator('#closeModal').click();
  await page.locator('[data-open="article_200"]').click();
  await page.screenshot({ path: path.join(output, 'library-desktop.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: path.join(output, 'library-dark.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'library-mobile.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log(`Browser fixture checks passed. Screenshots and downloads: ${output}`);
  console.log(
    'Not covered: live X account, real provider quality/billing, Edge and Firefox runtime.'
  );
} catch (error) {
  const p = context.pages().find((p) => p.url().includes('/options/'));
  if (p) {
    await p.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
    console.error((await p.locator('body').innerText()).slice(-5000));
  }
  throw error;
} finally {
  await context.close();
}
