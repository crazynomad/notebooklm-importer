# Chrome Web Store 产品说明

> 以下内容用于 Chrome Web Store 上架提交。
> 包含两个版本：纯文本版（直接粘贴到商店）和详细版（完整参考文档）。

---

## 扩展名称

**NotebookLM Jetpack**

---

## 简短描述（132 字符以内，商店搜索结果显示）

给 NotebookLM 装上喷射背包 🚀 一键导入网页、YouTube、播客、文档站、AI 对话，聚合多篇突破来源限制。

---

## 详细描述（纯文本版 — 直接粘贴到商店）

NotebookLM 是最好的 AI 知识工具，但「把内容喂进去」这一步太痛苦了。Jetpack 解决这个问题。


🔌 智能导入 — 修复那些导不进去的链接

NotebookLM 的网址导入对很多网站水土不服，Jetpack 逐一击破：

• Substack — 精准提取正文，自动过滤 14 种噪音元素（Subscribe 按钮、评论区等）。免费文章去噪导入，付费文章提取可见部分
• 微信公众号 — 绕过反爬机制，浏览器内渲染后提取完整内容，告别「假性成功」
• X.com (Twitter) 长文 — 自动识别 Article 格式，通过浏览器渲染提取完整长文
• 其他动态页面 — SPA、JS 渲染页面均可处理

🛟 智能失败检测：打开笔记本页面，扩展自动扫描所有来源，发现失败或内容为空的来源后，一键批量抢救，无需逐个重试。


📦 突破 50 个来源限制

每个笔记本只有 50 个来源配额？Jetpack 内置「稍后阅读」收藏夹，积累文章后一键聚合导出为 PDF。20 篇文章合并为 1 个 PDF，只占 1 个配额。支持分组管理，按项目或主题分类。


📚 文档站批量导入

学新框架不用手动粘贴 200 个链接。打开文档站任意页面，点击「分析当前站点」，自动识别框架并提取全站页面树，勾选章节后一键导入或导出 PDF。

已支持 14+ 主流文档框架（含 Docusaurus、MkDocs、Mintlify 等），以及任何提供 sitemap.xml 或 llms.txt 的站点。


🎙️ 播客导入

粘贴 Apple Podcasts 或小宇宙链接，选择单集，一键下载音频，拖入笔记本即可用 AI 生成笔记。


▶️ YouTube 视频导入 🆕

粘贴 YouTube 视频、播放列表或频道链接，自动提取视频列表，勾选后批量导入到 NotebookLM。在 YouTube 页面打开扩展可一键导入当前视频。支持限制最近 N 个视频，NotebookLM 会自动解析 YouTube 字幕生成笔记。


🤖 AI 对话导入

在 Claude、ChatGPT 或 Gemini 的对话页面打开扩展，自动提取问答对，按需勾选导入，格式化为结构化内容存入笔记本。无需手动点击提取按钮，打开即用。


🗑️ 批量删除来源

来源太多管理困难？使用 NotebookLM 原生复选框勾选来源，点击源列表底部的「更多操作」即可批量删除，删除前有确认提示防止误操作。


🎴 AI 对话分享卡片

和 AI 的精彩对话想分享到社交媒体？在「AI 对话」tab 选择问答对后，点击「生成分享卡片」。温暖书籍风格排版，支持导出 JPEG/PNG/PDF 或直接复制到剪贴板。适配 iPhone 灵动岛安全区，3x Retina 高清渲染。


🎯 智能 Notebook 选择

在扩展弹窗顶部选择目标 Notebook，导入内容自动发送到选中的 Notebook，无需手动切换标签页。支持一键导入当前页面，省去收藏再导入的繁琐步骤。首次安装提供新手引导，5 步了解全部核心功能。


⚡ 更多能力
• 🖨️ PDF 导出升级 — 温暖书籍风格排版（Noto Serif SC 衬线字体 + 奶油色背景），支持 X.com 文章和 CJK 中文
• 📋 剪贴板复制 — 收藏夹和文档站导出时，PDF 按钮旁一键复制 Markdown 到剪贴板
• 🏗️ 华为开发者文档 — 新增 HarmonyOS 文档站支持，自动遍历目录树
• 📡 RSS 源导入 — 支持 Substack、Medium 等主流格式
• 🖱️ 右键菜单 — 浏览网页时右键直接导入
• 📋 导入历史 — 自动记录最近 100 条
• 🌐 中英双语界面 — 自动适配，可手动切换


🔒 安全与隐私
• 完全免费，无需注册登录
• 纯客户端运行，不上传任何数据到第三方服务器
• 开源代码，可审计：github.com/crazynomad/notebooklm-jetpack
• 符合 Chrome Manifest V3 最新安全规范

Made by 绿皮火车 🚂
https://www.youtube.com/@greentrainpodcast

---

## 详细描述（完整参考文档）

> 以下为详细版，包含完整痛点分析和方案说明，供产品文档、博客、社交媒体等场景参考。

NotebookLM 是最好的 AI 知识工具，但「把内容喂进去」这一步，太痛苦了。

### 😤 痛点一：Substack、微信公众号等链接 NotebookLM 导不进去

NotebookLM 的网址导入对很多网站水土不服：

- **Substack 付费文章**：免费文章 NotebookLM 能导入但夹带大量噪音（Subscribe 按钮、评论区），付费文章（Paid）则完全无法导入
- **微信公众号**：看着"导入成功"，打开一看内容是空的验证页面（假性成功）
- **动态渲染页面**：SPA 或需要 JS 渲染的页面，NotebookLM 只抓到空壳
- **X.com (Twitter) 长文**：Article 格式的长推文，NotebookLM 无法解析动态加载内容

这些是 NotebookLM 用户最常遇到的问题——链接明明没错，导入就是失败或内容不对。

✅ **Jetpack 方案：智能提取 + 失败自动修复**
- **Substack 文章**：精准提取正文区域，自动过滤 Subscribe 按钮、评论区、推荐文章等 14 种噪音元素。付费文章（Paid）提取免费可见部分
- **微信公众号**：在浏览器中渲染完整页面后提取内容，绕过反爬机制
- **X.com 长文**：自动识别 Twitter Article 格式，通过浏览器渲染提取完整长文内容
- **智能失败检测**：打开 NotebookLM 页面，扩展自动扫描所有来源，标记导入失败和「假性成功」（内容为空）的来源
- **🟠 一键批量抢救**：琥珀色横幅显示失败数量，一键重新导入全部失败来源，无需逐个重试
- **🔵 假性成功修复**：蓝色横幅检测到「看似成功实则内容为空」的来源，一键修复全部

### 😤 痛点二：50 个来源上限，免费用户很快就用完

NotebookLM 免费版每个笔记本只有 50 个来源配额。你想导入 20 篇博客文章做一个专题研究，就用掉了将近一半。

✅ **Jetpack 方案：多篇聚合为一个来源**
1. 日常浏览中看到好文章 → 一键收藏到扩展内置的"稍后阅读"
2. 积累够了 → 勾选 10-20 篇 → 点击"聚合导出 PDF"
3. 扩展自动抓取每篇内容、转为 Markdown、合并为一个 PDF
4. 把这一个 PDF 拖入 NotebookLM → 只占一个来源配额 = 20 篇文章的知识

搭配分组管理功能，按项目或主题分类收藏，告别手忙脚乱。

### 😤 痛点三：想把整个文档站导入，手动粘贴 200 个链接？

你刚开始学一个新框架，想把官方文档全丢进 NotebookLM 用 AI 问答的方式学习。但文档有 200 个页面，手动复制粘贴要一下午。

✅ **Jetpack 方案：文档站智能导入**
- 打开文档站任意页面 → 点击"分析当前站点"
- 自动识别文档框架，提取全站页面树
- 勾选需要的章节 → 一键批量导入，或导出为 PDF

**已支持 14+ 种文档框架**，涵盖主流技术文档平台，以及任何有 sitemap.xml 或 llms.txt 的站点。

还支持 AI 原生的 llms.txt 标准 —— 越来越多站点提供此文件，扩展会优先使用它获取完整结构化内容。

### 😤 痛点四：听了一期好播客，想让 NotebookLM 帮忙做笔记

两小时的播客，靠手动总结太累。你想把音频丢进 NotebookLM 让 AI 生成摘要。但 NotebookLM 不支持直接输入播客链接。

✅ **Jetpack 方案：播客音频下载导入**
- 粘贴 Apple Podcasts 或小宇宙的节目链接
- 自动获取节目信息和单集列表
- 选择要下载的单集 → 一键下载音频文件
- 将音频拖入 NotebookLM → AI 生成完整笔记

### 😤 痛点五：YouTube 上的好视频，怎么批量整理？

YouTube 上有大量优质教程、讲座和访谈，你想把一个播放列表或频道的视频都导入 NotebookLM 做知识管理。但逐个复制链接太繁琐。

✅ **Jetpack 方案：YouTube 批量导入** 🆕
- 粘贴视频、播放列表或频道链接 → 自动提取视频列表
- 勾选要导入的视频，可限制「最近 N 个」
- 批量导入到 NotebookLM，自动解析 YouTube 字幕
- 在 YouTube 页面打开扩展，自动识别当前视频，一键导入
- 支持 youtube.com/watch、youtu.be、/playlist、/@频道、/shorts、/live 等所有格式

### 😤 痛点六：和 AI 聊出了好内容，怎么存进知识库？

你和 ChatGPT 讨论了一个技术方案，和 Gemini 做了一轮头脑风暴，和 Claude 深入分析了一篇论文。这些来回的对话就是知识，但 NotebookLM 不能直接导入 AI 对话。

✅ **Jetpack 方案：AI 对话一键导入**
- 在 Claude / ChatGPT / Gemini 的对话页面打开扩展
- 自动识别平台，提取所有问答对
- 以问答对为单位勾选，只导入有价值的部分
- 格式化为结构化 Markdown 存入 NotebookLM

支持三大平台：Claude (claude.ai)、ChatGPT (chatgpt.com)、Google Gemini (gemini.google.com)。

### 🗑️ 来源太多？批量删除

笔记本里积累了大量来源，逐个删除太痛苦？

✅ **Jetpack 方案：原生复选框 + 更多操作**
- 使用 NotebookLM 自带的复选框勾选来源
- 点击源列表底部的「更多操作」→ 批量删除
- 删除前弹出确认对话框，防止误操作
- 进度实时显示

### 🎴 AI 对话分享卡片

和 AI 的精彩对话想发到社交媒体？选择问答对后点击「生成分享卡片」，温暖书籍风格排版，适配 iPhone 灵动岛安全区。支持导出 JPEG / PNG / PDF 或直接复制到剪贴板，3x Retina 高清渲染。

### ⚡ 更多实用能力

🖨️ **PDF 导出升级** — 温暖书籍风格排版（Noto Serif SC 衬线字体、奶油色背景、锈红色强调色），底部带品牌签名和 YouTube 链接。系统字体回退链确保 CJK 字符离线可用。

📋 **剪贴板复制** — 收藏夹和文档站的 PDF 导出按钮旁新增剪贴板图标按钮，一键复制 Markdown 格式内容。

🏗️ **华为开发者文档** — 新增 HarmonyOS 文档站支持，自动解析目录树 API 获取全站页面结构。

📡 **RSS 源导入** — 粘贴博客或 Newsletter 的 RSS 地址，自动解析文章列表，批量导入。支持 Substack、Medium 等主流 RSS 格式。

🖱️ **右键菜单快捷导入** — 浏览任意网页时，右键 → "导入到 NotebookLM"，无需打开扩展弹窗。

📋 **导入历史记录** — 自动记录最近 100 条导入，随时回溯。

🛟 **智能失败检测与修复** — 在笔记本页面自动扫描导入失败或假性成功的来源，一键批量抢救。

🌐 **中英文双语界面** — 自动适配浏览器语言，也可手动切换。

### 🔒 安全与隐私

- ✅ 完全免费，无需注册登录
- ✅ 纯客户端运行，不上传任何数据到第三方服务器
- ✅ 开源代码，可审计：github.com/crazynomad/notebooklm-jetpack
- ✅ 符合 Chrome Manifest V3 最新安全规范

*Made by 绿皮火车 🚂*
https://www.youtube.com/@greentrainpodcast
https://space.bilibili.com/565619114

---
---

## English Version (for international listing)

### Extension Name

**NotebookLM Jetpack**

### Short Description (132 chars)

Supercharge NotebookLM 🚀 Import web pages, YouTube, podcasts, doc sites & AI chats. Merge articles into one source to save slots.

### Detailed Description (Plain Text — paste directly into store)

NotebookLM is an incredible AI knowledge tool, but getting your content into it shouldn't be the hard part. Jetpack fixes this.


🔌 Smart Import — Fix links that won't import

NotebookLM's URL import silently fails on many popular sources. Jetpack handles them all:

• Substack — Precision extraction with 14 noise filters (subscribe buttons, comments, etc.). Free posts imported cleanly, paid articles extract visible portions
• WeChat articles — Renders full page in-browser, bypassing anti-scraping. No more "silent failures" with empty content
• X.com (Twitter) Articles — Auto-detects long-form article format, renders in-browser for full extraction
• Dynamic/SPA pages — JS-rendered pages that NotebookLM can't fetch? Handled

🛟 Smart failure detection: Open your notebook page and the extension auto-scans all sources, flags failures and silently broken imports, then rescues them all in one click.


📦 Break the 50-source limit

Only 50 source slots per notebook? Jetpack's built-in read-later list lets you collect articles, then merge 10-20 into a single PDF. One PDF = one source slot = 20 articles of knowledge. Organize by collection for different projects.


📚 Batch import entire doc sites

No more pasting 200 URLs manually. Open any doc page, click "Analyze Site", and Jetpack auto-detects the framework and extracts the full page tree. Select chapters, then batch import or export as PDF.

Supports 14+ popular documentation frameworks (Docusaurus, MkDocs, Mintlify, and more). Also supports llms.txt for AI-native content discovery.


🎙️ Podcast import

Paste an Apple Podcasts link, pick episodes, download audio, drag into your notebook. AI-generated notes from a 2-hour podcast in minutes.


▶️ YouTube import 🆕

Paste a YouTube video, playlist, or channel link — the extension extracts the video list, lets you select which to import, and batch-sends them to NotebookLM. Open the extension on any YouTube page to auto-detect and one-click import the current video. NotebookLM auto-parses YouTube transcripts.


🤖 AI conversation import

Open the extension on any Claude, ChatGPT, or Gemini conversation page. It auto-detects the platform, extracts Q&A pairs, and lets you selectively import valuable exchanges as structured content.


🗑️ Bulk delete sources

Too many sources cluttering your notebook? Use NotebookLM's native checkboxes to select sources, then click "More actions" at the bottom of the source list to batch delete. Confirmation dialog prevents accidental deletion.


🎴 AI conversation share cards

Want to share a brilliant AI conversation on social media? Select Q&A pairs in the AI Chat tab, then click "Generate Share Card". Warm editorial styling with JPEG/PNG/PDF export or copy to clipboard. iPhone Dynamic Island safe area, 3x Retina rendering.


⚡ Also includes:
• 🖨️ PDF export upgrade — warm serif styling (Noto Serif SC + cream background), X.com articles and CJK support
• 📋 Clipboard copy — one-click Markdown copy button next to PDF export in bookmarks and doc sites
• 🏗️ Huawei Developer Docs — HarmonyOS docs now supported with full catalog traversal
• 📡 RSS feed import — Substack, Medium, any standard RSS/Atom feed
• 🖱️ Right-click context menu for instant import
• 📋 Import history — last 100 entries
• 🌐 Bilingual UI — Chinese and English, auto-detects browser language


🔒 Privacy & Security
• 100% free, no account required
• Runs entirely in your browser — zero data sent to third-party servers
• Open source: github.com/crazynomad/notebooklm-jetpack
• Chrome Manifest V3 compliant

Made by Green Train Podcast 🚂
https://www.youtube.com/@greentrainpodcast

---

### Detailed Description (Full Reference)

> Full version with detailed pain-point analysis, for blog posts, social media, and product docs.

NotebookLM is an incredible AI knowledge tool — but getting your content into it shouldn't be the hard part.

😤 **Problem: Many links just won't import into NotebookLM**

NotebookLM's URL import silently fails on many popular sources:

- **Substack paid articles** — free posts import but with tons of noise (subscribe buttons, comments); paid posts fail entirely
- **WeChat articles** — appears to import successfully, but the content is actually an empty verification page (silent failure)
- **Dynamic/SPA pages** — NotebookLM only fetches the empty HTML shell
- **X.com (Twitter) Articles** — long-form Twitter articles can't be parsed from static HTML

These are the most common frustrations for NotebookLM users — the link is correct, but the import fails or returns garbage.

✅ **Jetpack fixes this with smart extraction + automatic failure rescue:**
- **Substack**: Surgical precision extraction — 14 noise filters strip subscribe buttons, comments, and recommendations. Paid articles? Free-visible portions are still extracted.
- **WeChat**: Renders the full page in-browser before extracting, bypassing anti-scraping.
- **X.com Articles**: Auto-detects Twitter Article format, renders in-browser to extract full long-form content.
- **Smart failure detection**: Open your NotebookLM page and the extension auto-scans ALL sources, flagging both failed imports AND "silent failures" (sources that appear successful but contain empty/broken content).
- **🟠 One-click batch rescue**: Amber banner shows failed count → one click rescues all.
- **🔵 Silent failure repair**: Blue banner detects silently broken sources → one click repairs all. No manual retrying.

😤 **Problem: 50 source slots fill up fast**

Free-tier NotebookLM gives you 50 sources per notebook. Import 20 blog posts for a research project and you've used nearly half.

✅ **Jetpack's solution: Aggregate multiple articles into one source.**
1. Save articles to your built-in read-later list as you browse
2. Select 10-20 articles → export as a single merged PDF
3. Upload one PDF to NotebookLM → 20 articles, one source slot

Organize by collection for different projects or topics.

😤 **Problem: Importing an entire documentation site**

You want to study a framework by importing its 200-page docs into NotebookLM. Manually pasting 200 URLs? No thanks.

✅ Jetpack auto-detects **14+ popular documentation frameworks** (including Docusaurus, MkDocs, Mintlify, and more). Open any doc page → "Analyze Site" → select chapters → batch import or export as PDF.

Also supports the emerging **llms.txt** standard for AI-native content discovery.

😤 **Problem: Great podcast, no easy way to get it into NotebookLM**

You listened to a 2-hour podcast and want AI-generated notes. But NotebookLM doesn't accept podcast URLs.

✅ Paste an Apple Podcasts link → pick episodes → download audio → drag into NotebookLM. Done.

😤 **Problem: YouTube videos are great for learning, but importing them one by one?**

YouTube has incredible tutorials, lectures, and interviews. You want to import a whole playlist or channel into NotebookLM, but copying links individually is tedious.

✅ **Jetpack's solution: YouTube batch import** 🆕
- Paste a video, playlist, or channel link → auto-extract video list
- Select which videos to import, optionally limit to the latest N
- Batch import to NotebookLM — it auto-parses YouTube transcripts
- Open the extension on any YouTube page for one-click import of the current video
- Supports youtube.com/watch, youtu.be, /playlist, /@channel, /shorts, /live and more

😤 **Problem: Your best AI conversations are trapped in chat windows**

That brilliant ChatGPT brainstorm, that deep Claude analysis, that creative Gemini session — all locked inside their respective platforms.

✅ Open the extension on any **Claude, ChatGPT, or Gemini** conversation page. It auto-detects the platform, extracts Q&A pairs, and lets you selectively import the valuable exchanges into NotebookLM as structured markdown.

🗑️ **Problem: Too many sources, deleting them one by one is painful**

As you use NotebookLM more, notebooks accumulate dozens of sources. Removing outdated or failed ones individually is tedious.

✅ **Jetpack's solution: Native checkboxes + More Actions**
- Use NotebookLM's built-in checkboxes to select sources
- Click "More actions" at the bottom of the source list → batch delete
- Confirmation dialog prevents accidental deletion
- Real-time progress display

🎴 **AI Conversation Share Cards**

Want to share a brilliant AI conversation on social media? Select Q&A pairs → "Generate Share Card". Warm editorial styling with iPhone Dynamic Island safe area. Export as JPEG/PNG/PDF or copy image to clipboard. 3x Retina rendering for crisp results.

⚡ **Also includes:**
- 🖨️ **PDF export upgrade** — warm serif styling (Noto Serif SC, cream background, accent colors), branded footer with YouTube link. System font fallback for offline CJK rendering.
- 📋 **Clipboard copy** — compact icon button next to PDF export in bookmarks and doc sites, copies Markdown to clipboard.
- 🏗️ **Huawei Developer Docs** — HarmonyOS docs now supported with full catalog tree traversal
- 📡 **RSS feed import** — Substack, Medium, any standard RSS/Atom feed
- 🖱️ **Right-click context menu** for instant single-page import
- 📋 **Import history** — last 100 entries, always accessible
- 🛟 **Smart failure detection** — auto-scans for failed/silently broken imports on the NotebookLM page, one-click batch rescue
- 🌐 **Bilingual UI** — Chinese and English, auto-detects browser language with manual toggle

🔒 **Privacy & Security:**
- ✅ 100% free, no account required
- ✅ Runs entirely in your browser — zero data sent to third-party servers
- ✅ Open source: github.com/crazynomad/notebooklm-jetpack
- ✅ Chrome Manifest V3 compliant

*Made by Green Train Podcast 🚂*
