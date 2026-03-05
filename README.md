<p align="center">
  <img src="assets/icons/concepts/concept8-final.svg" width="128" height="128" alt="NotebookLM Jetpack Logo">
</p>

<h1 align="center">NotebookLM Jetpack 🚀</h1>

<p align="center">
  <strong>Supercharge NotebookLM — Import web pages, Substack, podcasts, doc sites & AI chats in one click.</strong><br>
  Merge articles into one source to break the 50-slot limit.
</p>

<p align="center">
  <a href="https://jetpack.boing.work/">📖 Docs</a> •
  <a href="https://www.youtube.com/watch?v=9gPTuJZRHJk">🎬 Demo Video</a> •
  <a href="https://jetpack.boing.work/privacy">🔒 Privacy Policy</a> •
  <a href="https://github.com/crazynomad/notebooklm-jetpack/releases/latest">📦 Download</a>
</p>

<p align="center">
  <strong>100% Free · No Login Required · Runs Locally · Open Source</strong>
</p>

---

## 🎬 Demo

[![NotebookLM Jetpack Demo](https://img.youtube.com/vi/9gPTuJZRHJk/maxresdefault.jpg)](https://www.youtube.com/watch?v=9gPTuJZRHJk)

---

## ✨ Features

### 🔌 Smart Import — Fix links that won't import

NotebookLM's URL import silently fails on many popular sources. Jetpack handles them all:

- **Substack** — Precision extraction with 14 noise filters (subscribe buttons, comments, etc.)
- **WeChat Articles** — Renders full page in-browser, bypassing anti-scraping
- **X.com (Twitter) Articles** — Auto-detects long-form article format, full extraction
- **Dynamic/SPA pages** — JS-rendered pages that NotebookLM can't fetch? Handled

### 📦 Break the 50-Source Limit

Jetpack's built-in **read-later list** lets you collect articles, then merge 10–20 into a single PDF. One PDF = one source slot = 20 articles of knowledge.

<img src="docs/screenshots/1280x800/01-bookmarks.png" width="640" alt="Bookmarks & Merge">

### 📚 Batch Import Entire Doc Sites

Open any doc page → **Analyze Site** → auto-detects the framework → select chapters → batch import or export as PDF.

Supports **14+ frameworks**: Docusaurus · VitePress · MkDocs · GitBook · Mintlify · Sphinx · ReadTheDocs · Google DevSite · Anthropic Docs · 语雀 · WeChat Docs · HarmonyOS Docs — plus any site with `sitemap.xml` or `llms.txt`.

<img src="docs/screenshots/1280x800/02-docs.png" width="640" alt="Doc Site Import">

### 🤖 AI Conversation Import

Open the extension on any **Claude, ChatGPT, or Gemini** conversation page. Auto-extracts Q&A pairs, selectively import into NotebookLM as structured content.

<img src="docs/screenshots/1280x800/03-ai-chat.png" width="640" alt="AI Chat Import">

### 🛟 Smart Failure Detection & Rescue

Auto-scans all sources in your notebook, flags failures and silently broken imports, then **rescues them all in one click**.

<img src="docs/screenshots/1280x800/04-rescue.png" width="640" alt="Smart Rescue">

### 🎙️ Podcast Import

Paste an Apple Podcasts or 小宇宙 link → pick episodes → download audio → drag into NotebookLM.

<img src="docs/screenshots/1280x800/05-podcast.png" width="640" alt="Podcast Import">

### ⚡ And More

| Feature | Description |
|---------|-------------|
| 📡 RSS Import | Substack, Medium, any standard RSS/Atom feed |
| 🖱️ Right-click Menu | Import any page instantly from context menu |
| 📋 Import History | Last 100 entries, always accessible |
| 🌐 Bilingual UI | Chinese & English, auto-detects browser language |

---

## 📥 Install

### Chrome Web Store

*Under review — coming soon.*

### From GitHub Release

1. Download the latest `.zip` from [Releases](https://github.com/crazynomad/notebooklm-jetpack/releases/latest)
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Drag the `.zip` file into the page, or unzip and click **Load unpacked**

### From Source

```bash
git clone https://github.com/crazynomad/notebooklm-jetpack.git
cd notebooklm-jetpack
pnpm install
pnpm build
```

Then load `dist/chrome-mv3` as an unpacked extension.

---

## 🛠️ Development

```bash
pnpm dev        # Dev mode (HMR, port 3003)
pnpm build      # Production build
pnpm test       # Run tests
pnpm compile    # TypeScript type check
pnpm lint       # Code lint
```

## 🏗️ Tech Stack

- [WXT](https://wxt.dev/) — Chrome Extension framework (Manifest V3)
- [React 18](https://react.dev/) — UI
- [TypeScript](https://www.typescriptlang.org/) — Type safety
- [Tailwind CSS](https://tailwindcss.com/) — Styling
- [Vitest](https://vitest.dev/) — Testing

---

## 🔒 Privacy

- No login required, no user data collected
- Runs entirely in your browser — zero data sent to third-party servers
- Open source & auditable
- Chrome Manifest V3 compliant

See [Privacy Policy](https://jetpack.boing.work/privacy).

---

## 📄 License

MIT

---

<p align="center">
  <em>Made by <a href="https://www.youtube.com/@greentrainpodcast">绿皮火车 🚂</a></em>
</p>
