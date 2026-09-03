# X-TOC Agent Rules

## Repository role

- This is the public source repository for the X-TOC browser extension at `github.com/HiAriesZhou/x-toc`.
- X-TOC provides an X/Twitter long-form article table of contents and a local clip workflow.
- Keep this repository small, implementation-led, and safe for users, contributors, extension reviewers, and the public.
- This is not the product-planning home for X-TOC and is not the source repository for Bookmark Assistant, Bookmark Assistant Pro, or LiteContext.

## Source-of-truth routing

1. Treat the current code and configuration as the source of truth for shipped behavior: `src/`, `src/manifest.json`, `extension.config.js`, `package.json`, and tests.
2. Use repository documentation only when it is necessary to maintain, build, test, or use the current code; fully suitable for public release; and limited to implemented behavior.
3. Keep `README.md` and `README.zh-CN.md` as entry points, not product requirements or roadmaps. Do not create `docs/` by default. If a public implementation document is genuinely required, put product-facing current behavior in `docs/product`, architecture in `docs/architecture`, feature contracts in `docs/specs`, and stable decisions in `docs/decisions`.
4. Route original design, planning, roadmaps, business strategy, competitive analysis, unreleased capabilities, Prompt/Agent process, private infrastructure, and personal workflow material to the Obsidian vault, never Git:
   - private material: `02-Projects/X-TOC/private-docs/`
   - public-candidate drafts awaiting approval: `02-Projects/X-TOC/repo-docs/docs/`
5. Use the `obsidian` CLI to read or write the vault. If it is unavailable, report that and stop the documentation-routing work; do not substitute a repository document.
6. Never copy private Vault content into Git merely because it already exists as a draft. Reduce an approved public draft to the minimum current implementation contract before adding it.

## Before changing files

- Read these rules, check `git status`, and preserve all user changes. Do not overwrite or reformat unrelated work.
- Identify whether the request concerns X-TOC code, public maintenance documentation, or private/product material, then route it accordingly.
- Audit the relevant README, package scripts, manifest/build configuration, tests, and implementation before describing behavior.
- Do not commit, push, publish, deploy, create a release, or update a browser-store listing unless the user explicitly requests that action.

## Commands

Use the repository's npm scripts; do not invent undocumented tool entry points.

```bash
npm install
npm run dev
npm run start
npm test
npm run build
npm run build:firefox
npm run build:edge
npm run build:zip
```

- `npm test` runs the Node test suite under `test/`.
- There is currently no lint script. Do not report lint as passed and do not run `npm run lint`. Add lint tooling only when that is part of the requested implementation work.
- `npm run build` creates the Chromium build in `dist/chromium`; `build:firefox` and `build:edge` exercise their respective Extension.js targets. `dist/` and generated ZIP files are build artifacts and must stay untracked.
- `build:zip` packages the Chromium build for release. Do not run it as a substitute for Firefox or Edge validation.

## Browser boundaries and manual validation

- Chrome/Chromium is the documented load-unpacked and store path. Load `dist/chromium` from `chrome://extensions/`.
- Edge is Chromium-based but has its own build target. Load the generated Edge output from `edge://extensions/` and verify affected behavior there; a Chrome pass alone is not an Edge pass.
- Firefox uses the manifest's Firefox branch (Manifest V2), while Chromium uses Manifest V3. Validate the generated Firefox manifest and load it as a temporary add-on from `about:debugging`; a successful build does not establish runtime API parity.
- The implementation uses the `chrome.*` extension namespace and browser-conditional manifest keys. When changing manifest permissions, background behavior, popup opening, storage, messaging, or downloads, test every affected browser rather than assuming compatibility.
- Host access and content-script behavior are limited to `https://x.com/*` and `https://twitter.com/*`. Do not broaden them without a concrete implemented requirement and privacy review.
- For browser-facing changes, inspect extension/background and page console errors, then manually verify the affected flow on a real X/Twitter long-form article: popup TOC, heading navigation, floating panel visibility/position, selection save, Options management, local persistence after reload, deletion, and Markdown/JSON export as applicable.

## Local data and privacy

- Clips, article metadata, settings, and floating-panel state belong in `chrome.storage.local`. Current persistent keys include `twitterTocArticles`, `twitterTocExcerpts`, `twitterTocExcerptSettings`, `tocPanelPosition`, and `tocPanelVisible`.
- Preserve existing keys and tolerate older clips with missing optional fields. Storage migrations must be explicit, backward-compatible, tested, and loss-resistant.
- Current exports are local, user-triggered downloads. They can contain selected text, surrounding context, article URLs, author metadata, tags, and notes; treat all of it as user-private data.
- Do not add telemetry, remote storage, background sync, uploads, external endpoints, or new host permissions unless the user explicitly requests an implemented feature and the behavior is disclosed, opt-in where appropriate, and reviewed for least privilege.
- Never place secrets, tokens, webhook secrets, real credentials, private endpoints, or internal service details in code, fixtures, docs, screenshots, or examples.

## Public-content safety and product boundaries

- Describe only behavior verified in the current implementation. Types, drafts, mocks, and plans are not proof that a feature ships.
- Do not publish private strategy, unpublished roadmaps, competitive analysis, internal sequencing, speculative integrations, or unreleased capability claims.
- Keep X-TOC focused on X/Twitter reading navigation and local clips. Do not fold Bookmark Assistant or Bookmark Assistant Pro features, positioning, data, or promises into X-TOC.
- When those products must be referenced, use the names **Bookmark Assistant** and **Bookmark Assistant Pro**; do not use “OSS” and “Commercial” as public product names. Confirm that a change does not blur the Free/Pro boundary.
- LiteContext is a separate system. X-TOC must not claim direct LiteContext sync or integration merely because compatibility types or private plans exist. Any future integration must remain explicit, local-first, and limited to implemented, approved behavior.

## Export and ContextItem compatibility

- The current JSON export contract is version `1`, source `twitter-toc-extension`, with `articles[].excerpts`; Markdown and JSON exports support all or selected clips.
- Preserve the article-to-clip relationship, existing field meanings, filename behavior, and compatibility with older clips. Prefer optional additive fields; use a new export version and migration notes for breaking changes.
- Keep internal storage independent from LiteContext. If shared export compatibility is implemented, map clips to ContextItem at an export boundary rather than replacing the local storage model.
- ContextItem-compatible output must be additive, user-triggered, tested with legacy v1 consumers, and must not imply upload or synchronization. Do not expose a planned ContextItem mapping as a public contract before its implementation and approval.
- Update tests whenever storage serialization, selection filtering, Markdown rendering, JSON fields, or export versioning changes.

## Release-readiness checks

Before reporting a release-ready change:

1. Review `git diff` and `git status`; confirm generated artifacts and unrelated user changes are not included.
2. Run `npm test` and the builds for every supported or affected browser. State any skipped command and why.
3. Perform the relevant manual browser flows above. A build-only check is insufficient for runtime changes.
4. Confirm version references agree across `package.json`, `src/manifest.json`, README badges, and intended release metadata when a version change is requested.
5. Recheck permissions, local-data behavior, export compatibility, and absence of private material, credentials, internal services, or unimplemented claims.
6. Do not publish or deploy as part of validation.

## Completion report

Every completed task must report:

- **Files changed:** paths and concise purpose, including any Obsidian note changed separately from Git files.
- **Validation:** tests, builds, and manual browser checks run; include skips or failures.
- **Public/private review:** why repository content is safe to publish and what was routed to or retained in Obsidian.
- **Free/Pro review:** whether X-TOC stayed distinct from Bookmark Assistant and Bookmark Assistant Pro.
- **LiteContext/ContextItem impact:** compatibility effect, or explicitly “none.”
- **Follow-up tasks:** only concrete remaining work; say “none” when complete.
