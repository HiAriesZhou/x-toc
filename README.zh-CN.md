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

从 Popup 或浮动目录打开 **Library**。在 Popup 点击 **Save page to Library** 保存已加载的文章或帖子。采集结果默认标为部分内容；只有与完整加载的原文核对后，才应标记为完整。

- 使用待整理、合集、标签和笔记管理资料。删除先进入本地回收站，不修改 X 原始书签。
- 打开 X 书签页，手动启动页面内导入。支持暂停、取消和重复导入去重；仅保存已加载预览，不保证完整历史或文章全文。
- 将选中或筛选后的文章导出为 **Markdown 知识包**：每篇一个稳定文件，附来源索引，分开呈现原文、摘录、笔记与已确认的 AI 摘要。可以排除笔记。这是 ZIP 下载，不是目录同步或自动写入 Agent memory。
- 在设置中下载、恢复完整资料库 JSON 备份。恢复采用合并方式，冲突时保留本地记录。旧版摘录 Markdown 和 JSON v1 导出保持独立。
- 可选的 **AI suggestions** 使用自行配置的 HTTPS 兼容接口、模型和会话 Key。先预览将发送的正文及分类词表，再确认发送；结果需另行确认应用。个人笔记不发送，撤销会保护后续人工修改。

AI 接口需支持 Chat Completions JSON mode；费用由服务商收取，界面不提供精确费用估算。Key 不进入备份、导出或页面脚本，但浏览器被入侵仍有凭据泄露风险。原文属于外部参考资料，不是 Agent 指令。媒体仅保留说明或链接，不下载。源码版本不代表商店已发布；`.portfolio/project.json` 仍对应已确认的正式版本。

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

构建后运行 `npm run test:browser`，会在隔离的无头 Playwright 配置中加载 `dist/chromium`。必要时用 `npx playwright install chromium` 安装测试浏览器，或设置 `XTOC_CHROMIUM_PATH` 指向已有的 Chromium 测试程序。测试使用合成 X 页面和模拟 AI 服务，不使用真实账号或模型；截图与下载保留在被忽略的 `dist/library-qa` 中。真实 X 页面、模型质量、权限弹窗及 Firefox/Edge 运行行为需另行验收。

供下游站点使用的公开产品元数据位于 [`.portfolio/project.json`](.portfolio/project.json)。发布公开版本时，请同步更新清单及其引用的资源。发布工作流可在完成配置后立即通知作品集；否则作品集会通过定时拉取发现变更。

## 隐私

正文、摘录、标签、笔记和设置保存在 `chrome.storage.local` 中；`unlimitedStorage` 权限仅用于避免保存的正文触及默认本地配额，不授予任何网站访问。导出由用户主动触发。可选 AI 仅在确认后，将预览中的内容及分类词表直接发给配置的服务商；只按需申请该服务商的域名权限，页面脚本仍限于 X/Twitter。Key 使用扩展会话存储，不支持时退回后台内存，不持久化进资料库。“Forget key” 清除 Key 并撤销该服务商权限。不添加遥测、X 登录凭据收集、云端资料库或自动上传。

## 项目链接

[产品网站](https://x-toc.vercel.app) · [项目案例](https://www.arieszhou.com/zh/projects/x-toc) · [参与贡献](CONTRIBUTING.md)

## 许可证

MIT。见 [LICENSE](LICENSE)。
