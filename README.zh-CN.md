<p align="center">
  <img src="src/logo.png" width="96" height="96" alt="X-TOC logo">
</p>

<h1 align="center">X-TOC</h1>

<p align="center">
  面向 X/Twitter 长文的阅读目录与轻量摘录工具。
</p>

<p align="center">
  <a href="README.md">English</a> · 中文
</p>

<p align="center">
  <a href="https://github.com/HiAriesZhou/x-toc/releases"><img src="https://img.shields.io/badge/version-0.4.7-blue" alt="Version 0.4.7"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <a href="https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb"><img src="https://img.shields.io/chrome-web-store/size/nbdgpckkcfkomnmdefinikjijgljgjfp" alt="Chrome Web Store"></a>
</p>

X-TOC 是一个面向 X.com 和 Twitter.com 长文的浏览器扩展。它提供文章目录、浮动阅读目录，以及本地摘录保存工作流，帮助你把长文中的有用片段保存下来。

## 功能

- 识别 X/Twitter 长文标题结构。
- 在 Popup 中显示当前文章目录。
- 在阅读页固定浮动目录。
- 支持拖动浮动目录并记住位置。
- 选中文章文本后点击 `save to xtoc` 保存摘录。
- 在 Options 页面查看已保存 clips。
- 将全部或选中的 clips 导出为 Markdown 或 JSON。
- 使用 `chrome.storage.local` 在本地保存 clip 数据。

## 从源码安装

```bash
git clone https://github.com/HiAriesZhou/x-toc.git
cd x-toc
npm install
npm run build
```

加载扩展：

1. 打开 `chrome://extensions/`。
2. 启用开发者模式。
3. 点击“加载已解压的扩展程序”。
4. 选择 `dist/chromium`。

## 开发

```bash
npm run dev
npm run build
npm run build:firefox
npm run build:edge
```

## 隐私

已保存 clips 存储在浏览器扩展的本地 storage 中。X-TOC 不会把 clips 发送到外部服务器。

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

MIT。见 [LICENSE](LICENSE)。
