<h1 align="center">
  <img src="src/wordmark.svg" width="280" alt="XTOC">
</h1>

<p align="center">
  <strong>跳到想读的章节，留下值得记住的原句。</strong><br>
  面向 X/Twitter 长文的轻量、开源阅读伴侣。
</p>

<p align="center">
  <a href="README.md">English</a> · 中文
</p>

<p align="center">
  <a href="https://github.com/HiAriesZhou/x-toc/releases"><img src="https://img.shields.io/badge/version-0.7.0-blue" alt="Version 0.7.0"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <a href="https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb"><img src="https://img.shields.io/chrome-web-store/size/nbdgpckkcfkomnmdefinikjijgljgjfp" alt="Chrome Web Store"></a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb"><strong>从 Chrome 应用商店安装</strong></a>
</p>

**Star 不会修复 Bug，但会让修 Bug 的人开心。**

XTOC 帮你浏览有标题结构的 X 长文，在阅读时连同来源上下文保存有用段落，并在读完后把摘录带到开放格式中。

## 视频演示

https://github.com/user-attachments/assets/b107995f-3b2a-4432-9530-48a93c886aa3

观看约 40 秒演示：目录导航、保存摘录、编辑标签与笔记，以及导出。

[体验交互演示](https://x-toc.vercel.app/)

## 使用方式

1. **浏览文章。** 打开 Popup 查看识别出的标题，跳到指定章节，或把可移动的目录固定在文章旁边。
2. **保存原句。** 选中文字并点击 `save to xtoc`。XTOC 会在本地保存原文、所属文章、可识别到的作者、时间和前后文。
3. **整理并导出。** 在 Library 中搜索摘录、添加标签或笔记、删除内容，并将全部或选中摘录导出为 Markdown 或 JSON。

## 当前源码中的 Library（0.7.0）

从 Popup 或浮动目录打开 **Library**，包含三个页面：

- **Clips**：搜索、标注、删除和导出已保存的摘录。
- **Bookmarks**：在 Popup 点击 **Save to Bookmarks** 保存的文章和帖子，或从 X 书签页导入的书签。导入只读取已加载的预览，不会修改你的 X 书签。
- **Settings**：可选的 AI 设置和本地存储用量。

Clips 和书签可导出为 Obsidian 风格的 Markdown：ZIP 中每篇文章或帖子一个笔记，带 YAML 属性和标签，摘录以引用 callout 呈现。Clips 也可导出为 JSON v1。

可选 AI 每次为一条书签建议最多三个标签和一段简短摘要。在 **Settings** 中选择服务商（OpenAI、Anthropic Claude、Google Gemini、DeepSeek、OpenRouter、通义千问、Moonshot Kimi，或任意 OpenAI 兼容地址），粘贴 API Key 并连接；XTOC 会读取该服务商的模型列表并预选一个轻量模型。只发送该书签已保存的正文和已有标签名，不发送笔记；点击 **Apply** 前不会修改任何内容。Key 默认只保存在本次浏览器会话中；开启 **Remember on this device** 后，会加密保存在本设备的扩展存储里，不会同步、导出，X 页面也无法读取。费用由服务商收取。

该源码版本尚未发布；`.portfolio/project.json` 对应最新正式版本。

## 正式版 0.6.2 的已上线能力

- 识别 X.com 和 Twitter.com 长文标题并跳转章节。
- 在 Popup 和浮动目录中查看文章结构。
- 拖动浮动目录，并记住它的位置。
- 在支持的长文中选中文字，一键保存到本地。
- 按文章分组的摘录库，以及搜索、标签和笔记。
- 将选中摘录或全部摘录导出为 Markdown / JSON。
- 本地存储，无需单独注册 XTOC 账号，也不会上传摘录。

当前版本会保存摘录供之后查看；它不会在原文中恢复高亮，也不会把摘录同步到云端。

## 安装

推荐直接安装 [Chrome 应用商店版本](https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp?utm_source=item-share-cb)。

<details>
<summary>从源码安装</summary>

```bash
git clone https://github.com/HiAriesZhou/x-toc.git
cd x-toc
npm install
npm run build
```

然后打开 `chrome://extensions/`，启用开发者模式，点击**加载已解压的扩展程序**，选择 `dist/chromium`。

</details>

## 开发

```bash
npm run dev
npm test
npm run build
npm run build:firefox
npm run build:edge
```

Chrome/Chromium 是当前有文档说明的商店与本地加载路径。Firefox 和 Edge 有各自的构建目标，分发前仍需在对应浏览器中验证。

日常调试可运行 `npm run build:dev`，会额外生成 `dist/chromium-dev`：内容与正式构建相同，但名称为 **XTOC (Development)**，工具栏图标为带斜纹的橙色版本，便于与商店正式版区分。加载该目录代替 `dist/chromium`；它拥有独立的扩展 ID 和本地存储。发布 ZIP 始终使用未改标识的正式构建。

`npm run build:zip` 会构建三个平台，并把商店安装包写入 `release/`：`xtoc-chrome-v<版本>.zip`、`xtoc-edge-v<版本>.zip`、`xtoc-firefox-v<版本>.zip`，以及供 Firefox 附加组件审核使用的源码包 `xtoc-source-v<版本>.zip`（来自已提交的代码）。请先提交；存在未提交改动时会跳过源码包。

供下游站点使用的公开产品元数据位于 [`.portfolio/project.json`](.portfolio/project.json)。发布公开版本时，请同步更新清单及其引用的资源。发布工作流可在完成配置后立即通知作品集；否则作品集会通过定时拉取发现变更。

## 隐私

正文、摘录、标签、笔记和设置保存在 `chrome.storage.local` 中；`unlimitedStorage` 权限仅用于避免保存的正文触及默认本地配额，不授予任何网站访问。`scripting` 权限用于在安装或更新后，让已打开的 X 标签页无需刷新即可继续使用 XTOC，不增加 X/Twitter 以外的网站访问。导出由用户主动触发。可选 AI 仅在你主动请求时，将一条书签的已保存正文和标签名直接发给配置的服务商；只按需申请该服务商的域名权限，页面脚本仍限于 X/Twitter。API Key 保存在扩展会话存储中；若选择 **Remember on this device**，则以 AES-GCM 加密（密钥为浏览器生成的不可导出密钥）保存在扩展自己的 IndexedDB 中，可避免明文落盘，但无法防范能控制该设备的人。Key 不会同步、导出或随资料库保存。“Remove key” 会在所有位置删除 Key 并撤销该服务商权限。不添加遥测、X 登录凭据收集、云端资料库或自动上传。

## 项目链接

[产品网站](https://x-toc.vercel.app) · [项目案例](https://www.arieszhou.com/zh/projects/x-toc) · [参与贡献](CONTRIBUTING.md)

## 许可证

MIT。见 [LICENSE](LICENSE)。
