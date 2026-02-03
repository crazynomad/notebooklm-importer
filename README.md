# NotebookLM Importer - 社群版

一键导入网页、YouTube 视频、播放列表、RSS 到 NotebookLM 的 Chrome 扩展。

**需订阅「绿皮火车」YouTube 频道解锁使用。**

## 功能

| 功能 | 描述 |
|------|------|
| 一键导入 | 当前网页/YouTube 视频一键导入到 NotebookLM |
| 批量导入 | 多个 URL 或所有浏览器标签页批量导入 |
| 播放列表导入 | YouTube 播放列表批量导入 |
| RSS 导入 | RSS 源文章批量导入 |
| 文档站点导入 | 自动分析文档站点结构，批量导入所有页面 |

### 文档站点导入

支持自动检测并提取以下框架的文档站点：

- **Docusaurus** - Meta 开源的文档框架
- **MkDocs / Material for MkDocs** - Python 文档生成器
- **VitePress** - Vue 驱动的静态站点生成器
- **GitBook** - 现代文档平台
- **ReadTheDocs / Sphinx** - Python 生态文档托管

使用方法：
1. 打开文档站点首页（确保侧边栏可见）
2. 点击扩展，切换到「文档站点」标签
3. 点击「分析当前站点」
4. 选择要导入的页面，批量导入到 NotebookLM

## 技术栈

- **框架**: WXT (Chrome Extension Framework for Manifest V3)
- **语言**: TypeScript
- **UI**: React 18 + Tailwind CSS + Radix UI
- **构建**: Vite

## 开发

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

然后在 Chrome 中加载 `dist/` 目录作为未打包的扩展。

### 构建

```bash
pnpm build
```

### 打包

```bash
pnpm zip
```

## 配置 Google Cloud 项目

使用前需要配置 Google Cloud 项目以启用 YouTube Data API：

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 **YouTube Data API v3**
4. 创建 **OAuth 2.0 客户端 ID**（类型选择 Chrome 扩展）
5. 将 Client ID 填入 `wxt.config.ts` 的 `oauth2.client_id`

## 项目结构

```
notebooklm-importer/
├── wxt.config.ts              # WXT 配置
├── entrypoints/
│   ├── background.ts          # Service Worker
│   ├── notebooklm.content.ts  # NotebookLM 页面自动化
│   ├── docs.content.ts        # 文档站点分析 (动态注入)
│   └── popup/                 # Popup UI
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       └── style.css
├── components/                # React 组件
│   ├── SingleImport.tsx
│   ├── BatchImport.tsx
│   ├── PlaylistImport.tsx
│   ├── RssImport.tsx
│   └── DocsImport.tsx         # 文档站点导入
├── services/                  # 业务逻辑
│   ├── youtube-api.ts         # 订阅验证、播放列表
│   ├── rss-parser.ts          # RSS 解析
│   ├── notebooklm.ts          # 自动化操作
│   ├── docs-analyzer.ts       # 文档框架检测与页面提取
│   └── docs-site.ts           # 文档站点分析服务
├── lib/
│   ├── config.ts              # 配置常量
│   ├── types.ts               # TypeScript 类型
│   └── utils.ts               # 工具函数
└── assets/
    └── icons/                 # 图标
```

## 注意事项

1. **NotebookLM 无官方 API** - 使用 Content Script 模拟用户操作
2. **选择器可能变化** - DOM 选择器需要定期维护
3. **速率限制** - 批量导入有 1.5 秒间隔避免被检测

## 许可

MIT
