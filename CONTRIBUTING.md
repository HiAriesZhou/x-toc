# Contributing

Thanks for your interest in XTOC.

## Before You Start

- Keep the extension focused on X/Twitter long-form reading, navigation, and local clipping.
- Keep the popup focused on the current article table of contents.
- Put heavier management flows in the Options page.
- Avoid adding network services or remote storage unless the behavior is explicit and user-controlled.

## Development

```bash
npm install
npm run dev
npm run build
```

Load `dist/chromium` from `chrome://extensions/` with Developer mode enabled.

## Pull Requests

- Keep changes scoped and easy to review.
- Include user-facing behavior in the PR description.
- Test the affected browser extension flow manually.
- Do not commit private project notes or local Obsidian files.

## 贡献说明

欢迎为 XTOC 提交改进。

- 保持项目聚焦在 X/Twitter 长文阅读、目录导航和本地摘录。
- Popup 只服务当前文章目录，不放复杂管理功能。
- Options 页面负责摘录管理、导出和设置。
- 不要提交私有项目笔记或本地 Obsidian 文件。
