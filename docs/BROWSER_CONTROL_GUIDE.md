# Claude Code 浏览器操控方案指南

> 本文档记录了在 Claude Code 中操控用户真实浏览器的三种方案，包括环境配置、能力对比和推荐结论。
> 基于 macOS + Chrome 145 + Claude Code 2.1.71 环境验证。

---

## 背景与需求

在开发 Chrome 扩展（如 NotebookLM Jetpack）时，常需要 AI 直接操控浏览器来：
- 探查文档站 DOM 结构
- 测试扩展功能
- 截图验证 UI
- 提取页面内容

核心诉求：**操控用户已打开的真实浏览器**（而非隔离的 Playwright 实例），保留登录态、Cookie、已安装的扩展。

---

## 方案一：Claude in Chrome 扩展（`claude --chrome`）

### 原理

Anthropic 官方方案。通过 Chrome 扩展 + Native Messaging Host 建立双向通信：

```
Claude Code CLI ←→ Native Messaging Host ←→ Claude in Chrome 扩展 ←→ 浏览器
```

### 环境要求

| 依赖 | 最低版本 |
|---|---|
| Google Chrome 或 Microsoft Edge | 最新稳定版 |
| Claude in Chrome 扩展 | v1.0.36+ |
| Claude Code | v2.0.73+ |
| Anthropic 订阅 | Pro / Max / Teams / Enterprise |

### 安装步骤

1. Chrome Web Store 搜索 "Claude" by Anthropic，点击 "Add to Chrome"
2. 安装后自动配置 Native Messaging Host 文件：
   - macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anthropic.claude_browser_extension.json`
   - Linux: `~/.config/google-chrome/NativeMessagingHosts/com.anthropic.claude_browser_extension.json`
3. 启动 Claude Code：`claude --chrome`
4. 或在已有会话中运行 `/chrome`

### 能力

- ✅ 导航、点击、输入、表单填充
- ✅ 截图（含 GIF 录制）
- ✅ 读取 console 日志和 DOM 状态
- ✅ 多标签页操作
- ✅ 共享用户登录态（Google Docs、Gmail、Notion 等已认证应用）
- ✅ 遇到登录/CAPTCHA 自动暂停，让用户手动处理
- ✅ 与编码任务无缝衔接（同一会话内修代码 + 测浏览器）

### 局限性

- ❌ **不能嵌套调用**：无法在一个 Claude Code 会话里启动另一个 `claude --chrome`，需要另开终端
- ❌ **需要付费订阅**：不支持第三方 provider（Bedrock、Vertex、Foundry）
- ❌ **仅支持 Chrome/Edge**：不支持 Brave、Arc 等 Chromium 变体
- ❌ **不支持 WSL**
- ❌ 无网络拦截/mock 能力
- ⚠️ Beta 阶段，长时间空闲后 service worker 可能断连（需 `/chrome` 重连）

### 适用场景

日常开发调试首选。编码→测试→修复的完整闭环，无需切换工具。

---

## 方案二：agent-browser + CDP（`agent-browser --cdp`）

### 原理

通过 Chrome DevTools Protocol（CDP）连接到用户用调试端口启动的 Chrome 实例：

```
Claude Code → Bash → agent-browser CLI → CDP (port 9222) → Chrome 浏览器
```

### 环境要求

| 依赖 | 说明 |
|---|---|
| agent-browser | Claude Code 内置 skill，已在 PATH |
| Chrome 调试端口 | 需用 `chrome-debug.sh` 启动 |
| Node.js | agent-browser 运行时 |

### 关键问题：Chrome 145+ 的调试端口限制

Chrome 145 起，`--remote-debugging-port` **强制要求** `--user-data-dir` 为非默认路径。这意味着：
- 不能直接对用户的主 Chrome Profile 开调试端口
- 必须**复制 Profile 数据**到独立目录，再用该目录启动

多 Profile 用户还需加 `--profile-directory` 参数跳过 Profile Picker，否则 Chrome 停在选择界面不会开端口。

### 解决方案：`scripts/chrome-debug.sh`

项目中已提供一键脚本：

```bash
bash scripts/chrome-debug.sh              # 默认 Profile 1, 端口 9222
bash scripts/chrome-debug.sh "Profile 4"  # 指定 Profile
bash scripts/chrome-debug.sh "" 9333      # 自定义端口
```

脚本流程：
1. 优雅退出当前 Chrome（Cmd+Q 关窗口不够，macOS 上 Chrome 会后台驻留）
2. 复制 Profile 关键文件到 `~/Chrome-Debug-Profile`（Cookies、Login Data、Extensions 等，约 14MB~400MB）
3. 用非默认 `--user-data-dir` + `--remote-debugging-port=9222` 启动 Chrome
4. 轮询等待 CDP 端口就绪

### 使用方式

```bash
# 在 Claude Code 会话内直接调用
agent-browser --cdp 9222 open https://example.com
agent-browser --cdp 9222 snapshot          # 获取 accessibility tree（带 @ref）
agent-browser --cdp 9222 screenshot /tmp/shot.png
agent-browser --cdp 9222 click @e3         # 点击 ref 元素
agent-browser --cdp 9222 fill @e1 "hello"  # 填充输入框
agent-browser --cdp 9222 eval "document.title"  # 执行 JS
```

### 能力

- ✅ 导航、点击、输入、表单填充、拖拽
- ✅ 截图 + 全页截图 + **录屏（WebM）**
- ✅ Accessibility tree 快照（紧凑 `@ref` 标记，token 效率高）
- ✅ JS 执行（`eval`）
- ✅ **网络拦截**：mock/block 请求
- ✅ 多标签页创建/切换/关闭
- ✅ Cookie/localStorage/sessionStorage 管理
- ✅ 命名 Session + 状态持久化
- ✅ 设备模拟（iPhone、iPad 等）
- ✅ 代理支持（HTTP/HTTPS/SOCKS5）
- ✅ 共享登录态（通过 Profile 复制）
- ✅ **可在当前 Claude Code 会话内直接使用**（通过 Bash 工具调用）

### 局限性

- ❌ **需要重启 Chrome**：必须退出主 Chrome，用调试端口重新启动
- ❌ **Profile 是快照副本**：复制时刻的登录态，之后主 Chrome 的新登录不会同步
- ❌ 每次命令都是独立的 Bash 调用，交互不如 MCP tools 自然
- ❌ 标签页切换需要通过 CDP API 手动激活（`agent-browser` 的 session 绑定特定 tab）
- ⚠️ 调试 Chrome 和主 Chrome 不能同时运行（同一 user-data-dir 锁冲突；不同目录则是两个独立实例）

### Token 效率

agent-browser 的 `@ref` 系统是核心优势：每次交互约 200-400 tokens，而完整 DOM/accessibility tree 通常 3000-5000 tokens。长流程任务下节省显著。

### 适用场景

当前 Claude Code 会话内需要操控浏览器时（不想另开终端）。也适合需要网络拦截、录屏、精细 session 管理的高级场景。

---

## 方案三：agent-browser 隔离模式（`agent-browser --headed`）

### 原理

agent-browser 启动自己的 Chromium 实例，与用户浏览器完全隔离：

```
Claude Code → Bash → agent-browser CLI → 独立 Chromium 实例
```

### 环境要求

| 依赖 | 说明 |
|---|---|
| agent-browser | Claude Code 内置 skill |
| Chromium | agent-browser 自带 |

无需任何额外配置。

### 使用方式

```bash
agent-browser --headed open https://example.com   # 有窗口
agent-browser open https://example.com             # 无窗口（headless，默认）
```

### 能力

与方案二相同的完整能力集，区别仅在于浏览器实例的隔离性。

### 局限性

- ❌ **无用户登录态**：空白 Profile，需要手动登录
- ❌ **无用户扩展**：不会加载用户已安装的 Chrome 扩展
- ❌ Cookie、书签、历史记录全部为空

### 适用场景

- 干净环境测试（不受用户状态影响）
- 不需要登录态的公开页面探查
- 快速验证 DOM 结构

---

## 补充方案：Playwright MCP Server

虽然本次未实际部署，但值得记录作为备选。

### 原理

Microsoft 官方 Playwright MCP server，以 MCP 协议集成到 Claude Code：

```
Claude Code → MCP 协议 → @playwright/mcp → Chrome (CDP / 独立实例)
```

### 安装

```bash
npx @playwright/mcp@latest --cdp-endpoint http://127.0.0.1:9222
```

或在 Claude Code MCP 配置中添加：

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

### 特点

- 26 个 MCP tools 直接在对话中调用（`browser_navigate`、`browser_click` 等），交互最自然
- 支持 Snapshot 模式（accessibility tree）和 Vision 模式（截图 + 坐标点击）
- 支持 CDP 连接已有浏览器
- 143+ 设备预设

### 局限性

- Accessibility tree 较大，token 消耗高于 agent-browser
- 无网络拦截能力
- 与 Claude Code 的兼容性偶有问题（GitHub Issues 有报告）

---

## 综合对比

| 维度 | claude --chrome | agent-browser --cdp | agent-browser --headed | Playwright MCP |
|---|---|---|---|---|
| **集成方式** | 原生 MCP tools | Bash CLI | Bash CLI | MCP tools |
| **交互自然度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **用户登录态** | ✅ 直接共享 | ✅ Profile 快照 | ❌ | ✅ 需 CDP |
| **需要重启 Chrome** | 不需要 | 需要 | 不需要 | 需要（CDP 模式） |
| **当前会话可用** | ❌ 需另开终端 | ✅ | ✅ | ✅ |
| **Token 效率** | 中等 | ⭐ 最优（@ref） | ⭐ 最优 | 中等 |
| **网络拦截** | ❌ | ✅ | ✅ | ❌ |
| **录屏** | ✅ GIF | ✅ WebM | ✅ WebM | ❌ |
| **设备模拟** | ❌ | ✅ | ✅ | ✅ 143+ |
| **环境配置** | 装扩展即可 | chrome-debug.sh | 零配置 | 需配 MCP |
| **付费要求** | Anthropic 订阅 | 无 | 无 | 无 |
| **稳定性** | Beta，偶尔断连 | 稳定 | 稳定 | 偶有兼容问题 |

---

## 推荐结论

### 首选：`claude --chrome`（另开终端）

适合 90% 的场景。最自然的交互方式，直接共享用户浏览器状态，零配置成本（装扩展即可）。编码→测试→修复的完整闭环。

**限制**：需要另开终端窗口，不能在当前会话内嵌套。

### 补充：`agent-browser --cdp 9222`（当前会话内）

当你不想切终端、或需要在当前 Claude Code 对话中操控浏览器时使用。配合 `scripts/chrome-debug.sh` 一键启动。

**典型场景**：文档站 DOM 探查、扩展功能测试、需要网络拦截的调试。

### 兜底：`agent-browser --headed`（隔离测试）

不需要登录态时的快速方案。零配置，随用随走。

**典型场景**：探查公开文档站结构、验证 CSS 选择器、干净环境回归测试。

### 组合工作流建议

```
日常开发循环：
  另开终端 → claude --chrome → 编码测试一体化

当前会话内需要看浏览器：
  bash scripts/chrome-debug.sh → agent-browser --cdp 9222

快速探查公开页面：
  agent-browser --headed open <url> → snapshot / screenshot
```

---

## 环境备忘

- macOS 上 Chrome 关闭窗口≠退出进程，必须 Cmd+Q 或 `osascript -e 'tell application "Google Chrome" to quit'`
- Chrome 145+ 的 `--remote-debugging-port` 要求 `--user-data-dir` 非默认路径（安全策略）
- 多 Profile 用户必须加 `--profile-directory` 跳过 Profile Picker
- Native Messaging Host 配置文件路径：`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- Patchright（github.com/Kaliiiiiiiiii-Vinyzu/patchright）：反检测 Playwright fork，应对有 bot 检测的站点

---

*最后更新：2026-03-09*
*验证环境：macOS Darwin 25.3.0 / Chrome 145.0.7632.160 / Claude Code 2.1.71*
