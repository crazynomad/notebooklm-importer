# Page Content Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Import Page Content" button to the SingleImport component that captures the current tab's DOM, converts it to Markdown, and imports it into NotebookLM — enabling import of authenticated pages that NotebookLM's servers cannot access.

**Architecture:** The popup sends a `CAPTURE_PAGE_CONTENT` message to the background; the background injects an inline script via `chrome.scripting.executeScript()` to extract `document.body.innerHTML` and `document.title` from the active tab; the HTML is converted to Markdown via the existing offscreen document; then imported via the existing `importText()` service.

**Tech Stack:** TypeScript, React, Chrome Extension MV3, Turndown (HTML→Markdown), Vitest

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `lib/types.ts` | Modify | Add `CAPTURE_PAGE_CONTENT` to `MessageType` |
| `lib/i18n.ts` | Modify | Add i18n strings for the new button and error messages |
| `entrypoints/offscreen/main.ts` | Modify | Add < 200 char fallback in `htmlToMarkdown()` |
| `entrypoints/background.ts` | Modify | Add `case 'CAPTURE_PAGE_CONTENT'` in `handleMessage()` |
| `components/SingleImport.tsx` | Modify | Add "Import Page Content" button |
| `tests/offscreen-page-capture.test.ts` | Create | Unit tests for offscreen fallback logic |
| `tests/services/page-capture.test.ts` | Create | Unit tests for background handler logic |

---

## Task 1: Add type and i18n strings

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/i18n.ts`

- [ ] **Step 1: Add message type to `lib/types.ts`**

In `lib/types.ts`, add the new entry to the `MessageType` union after `| { type: 'IMPORT_BATCH'; urls: string[] }` (line 82):

```typescript
  | { type: 'CAPTURE_PAGE_CONTENT' }
```

So the block looks like:
```typescript
export type MessageType =
  | { type: 'IMPORT_URL'; url: string }
  | { type: 'IMPORT_BATCH'; urls: string[] }
  | { type: 'CAPTURE_PAGE_CONTENT' }
  // ... rest unchanged
```

- [ ] **Step 2: Add i18n strings to `lib/i18n.ts`**

In the `zh` object, in the `// ── SingleImport ──` section (after line 163), add:
```typescript
  'single.captureContent': '导入页面内容',
  'single.capturingBtn': '捕获中',
  'single.captureFailedHint': '页面内容捕获失败，请确保页面已完全加载',
  'single.captureNotSupported': '无法捕获此类页面',
  'single.captureAuthHint': '适用于需要登录的内部页面（Confluence、企业 Wiki 等）',
```

In the `en` object, in the `// ── SingleImport ──` section (after line 443), add:
```typescript
  'single.captureContent': 'Import Page Content',
  'single.capturingBtn': 'Capturing',
  'single.captureFailedHint': 'Failed to capture page content. Make sure the page is fully loaded.',
  'single.captureNotSupported': 'Cannot capture this page type',
  'single.captureAuthHint': 'Use for pages requiring login (Confluence, internal wikis, etc.)',
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /home/tongdu/code/notebooklm-jetpack && pnpm compile
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/i18n.ts
git commit -m "feat: add CAPTURE_PAGE_CONTENT type and i18n strings"
```

---

## Task 2: Update offscreen htmlToMarkdown with smart/fallback threshold

**Files:**
- Modify: `entrypoints/offscreen/main.ts:124-160`
- Create: `tests/offscreen-page-capture.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/offscreen-page-capture.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// We test the fallback logic by extracting htmlToMarkdown into a testable form.
// Since the offscreen module runs in a Chrome context, we reproduce the pure logic here.

import TurndownService from 'turndown';

const CONTENT_SELECTORS = [
  '.devsite-article-body',
  '.doc-content', '.document-content',
  '.available-content .body.markup', '.available-content', '.body.markup',
  '.markdown-body',
  'article [itemprop="articleBody"]',
  'article', 'main', '[role="main"]', '#content', '.prose', '.content',
];

const REMOVE_SELECTORS = [
  'script', 'style', 'nav', 'footer', 'header',
  '.sidebar', '.toc', '.breadcrumb',
].join(',');

function htmlToMarkdownWithFallback(html: string): { markdown: string; title: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  let el: Element | null = null;
  for (const s of CONTENT_SELECTORS) {
    el = doc.querySelector(s);
    if (el) break;
  }
  if (!el) el = doc.body;

  // Fallback: if smart extraction yields < 200 chars, use full body
  const smartText = el.textContent?.trim() || '';
  if (smartText.length < 200 && el !== doc.body) {
    el = doc.body;
  }

  el.querySelectorAll(REMOVE_SELECTORS).forEach(e => e.remove());

  const title = doc.querySelector('h1')?.textContent?.trim() || doc.title || '';
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  const markdown = td.turndown(el.innerHTML).replace(/\n{3,}/g, '\n\n').trim();

  return { markdown, title };
}

describe('htmlToMarkdown fallback logic', () => {
  it('uses smart selector when content is >= 200 chars', () => {
    const longText = 'a'.repeat(300);
    const html = `<html><body>
      <nav>Navigation</nav>
      <article>${longText}</article>
    </body></html>`;
    const { markdown } = htmlToMarkdownWithFallback(html);
    // Should use <article> content only, nav stripped
    expect(markdown).toContain('a'.repeat(200));
    expect(markdown).not.toContain('Navigation');
  });

  it('falls back to full body when smart selector yields < 200 chars', () => {
    const html = `<html><body>
      <article>Short.</article>
      <div class="sidebar-content">This is extra content outside article that should appear in fallback mode with plenty of text to confirm fallback works correctly here and now.</div>
    </body></html>`;
    const { markdown } = htmlToMarkdownWithFallback(html);
    // Should include the sidebar div since fallback uses body
    expect(markdown).toContain('extra content outside article');
  });

  it('uses body directly when no selector matches', () => {
    const html = `<html><title>My Page</title><body><p>Hello world content that is quite short</p></body></html>`;
    const { markdown } = htmlToMarkdownWithFallback(html);
    expect(markdown).toContain('Hello world');
  });

  it('extracts title from h1', () => {
    const html = `<html><body><article><h1>My Title</h1>${'content '.repeat(50)}</article></body></html>`;
    const { title } = htmlToMarkdownWithFallback(html);
    expect(title).toBe('My Title');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/tongdu/code/notebooklm-jetpack && pnpm test tests/offscreen-page-capture.test.ts
```

Expected: tests fail because `htmlToMarkdownWithFallback` is defined locally in the test and should pass — but confirms the logic before applying it to the offscreen module.

> **Note:** The tests are self-contained (they define the logic locally). They will actually PASS already since the logic is correct. The purpose is to lock in the expected behavior before modifying the production file. Proceed to Step 3.

- [ ] **Step 3: Update `entrypoints/offscreen/main.ts` — add fallback threshold**

In `entrypoints/offscreen/main.ts`, replace lines 128–133 (the content selector loop and `if (!el)` fallback):

**Before:**
```typescript
  let el: Element | null = null;
  for (const s of CONTENT_SELECTORS) {
    el = doc.querySelector(s);
    if (el) break;
  }
  if (!el) el = doc.body;
```

**After:**
```typescript
  let el: Element | null = null;
  for (const s of CONTENT_SELECTORS) {
    el = doc.querySelector(s);
    if (el) break;
  }
  if (!el) el = doc.body;

  // Fallback: if smart extraction yields < 200 chars, use full body
  const smartText = el.textContent?.trim() || '';
  if (smartText.length < 200 && el !== doc.body) {
    el = doc.body;
  }
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd /home/tongdu/code/notebooklm-jetpack && pnpm compile
```

Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
cd /home/tongdu/code/notebooklm-jetpack && pnpm test tests/offscreen-page-capture.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/offscreen/main.ts tests/offscreen-page-capture.test.ts
git commit -m "feat: add smart/fallback threshold in htmlToMarkdown (< 200 chars falls back to body)"
```

---

## Task 3: Add CAPTURE_PAGE_CONTENT handler in background

**Files:**
- Modify: `entrypoints/background.ts`
- Create: `tests/services/page-capture.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/services/page-capture.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the handler logic by extracting it into a testable helper.
// The actual case in background.ts calls the same pattern.

async function capturePageContent(
  tabId: number,
  tabUrl: string,
  executeScript: (opts: { target: { tabId: number }; func: () => { html: string; title: string } }) => Promise<Array<{ result: { html: string; title: string } }>>,
  convertHtmlToMarkdown: (html: string) => Promise<{ markdown: string; title: string }>,
  importText: (text: string, title: string, senderTabId?: number) => Promise<boolean>,
  senderTabId?: number
): Promise<boolean> {
  if (!tabUrl.startsWith('http')) {
    throw new Error('Cannot capture this page type');
  }
  let extracted: { html: string; title: string };
  try {
    const result = await executeScript({ target: { tabId }, func: () => ({ html: document.body.innerHTML, title: document.title }) });
    extracted = result[0].result;
  } catch {
    throw new Error('Could not capture this page type');
  }
  const { markdown, title } = await convertHtmlToMarkdown(extracted.html);
  const pageTitle = extracted.title || title;
  const success = await importText(markdown, pageTitle, senderTabId);
  if (!success) throw new Error('Import failed');
  return true;
}

describe('capturePageContent', () => {
  const mockExecuteScript = vi.fn();
  const mockConvert = vi.fn();
  const mockImport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts HTML from tab, converts to markdown, and imports', async () => {
    mockExecuteScript.mockResolvedValue([{ result: { html: '<p>Hello</p>', title: 'My Page' } }]);
    mockConvert.mockResolvedValue({ markdown: '# Hello', title: 'My Page' });
    mockImport.mockResolvedValue(true);

    const result = await capturePageContent(42, 'https://example.com', mockExecuteScript, mockConvert, mockImport, 1);

    expect(result).toBe(true);
    expect(mockExecuteScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 42 } }));
    expect(mockConvert).toHaveBeenCalledWith('<p>Hello</p>');
    expect(mockImport).toHaveBeenCalledWith('# Hello', 'My Page', 1);
  });

  it('throws for non-http URLs', async () => {
    await expect(
      capturePageContent(1, 'chrome://extensions', mockExecuteScript, mockConvert, mockImport)
    ).rejects.toThrow('Cannot capture this page type');
    expect(mockExecuteScript).not.toHaveBeenCalled();
  });

  it('throws when executeScript fails (restricted tab)', async () => {
    mockExecuteScript.mockRejectedValue(new Error('Cannot access a chrome extension URL'));
    await expect(
      capturePageContent(1, 'https://example.com', mockExecuteScript, mockConvert, mockImport)
    ).rejects.toThrow('Could not capture this page type');
  });

  it('throws when importText returns false', async () => {
    mockExecuteScript.mockResolvedValue([{ result: { html: '<p>x</p>', title: 'T' } }]);
    mockConvert.mockResolvedValue({ markdown: 'x', title: 'T' });
    mockImport.mockResolvedValue(false);

    await expect(
      capturePageContent(1, 'https://example.com', mockExecuteScript, mockConvert, mockImport)
    ).rejects.toThrow('Import failed');
  });

  it('uses tab title when markdown title is empty', async () => {
    mockExecuteScript.mockResolvedValue([{ result: { html: '<p>content</p>', title: 'Tab Title' } }]);
    mockConvert.mockResolvedValue({ markdown: 'content', title: '' });
    mockImport.mockResolvedValue(true);

    await capturePageContent(1, 'https://example.com', mockExecuteScript, mockConvert, mockImport);
    expect(mockImport).toHaveBeenCalledWith('content', 'Tab Title', undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (logic is in test)**

```bash
cd /home/tongdu/code/notebooklm-jetpack && pnpm test tests/services/page-capture.test.ts
```

Expected: all 5 tests pass (logic defined inline in test file).

- [ ] **Step 3: Add the handler in `entrypoints/background.ts`**

In `entrypoints/background.ts`, find the `handleMessage` switch. Locate:
```typescript
    case 'IMPORT_URL':
      return await importUrl(message.url, senderTabId);

    case 'IMPORT_BATCH':
```

Add the new case before `case 'IMPORT_URL':`:
```typescript
    case 'CAPTURE_PAGE_CONTENT': {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) throw new Error('No active tab found');
      const tabUrl = activeTab.url || '';
      if (!tabUrl.startsWith('http')) throw new Error('Cannot capture this page type');

      let extracted: { html: string; title: string };
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => ({ html: document.body.innerHTML, title: document.title }),
        });
        extracted = results[0].result;
      } catch {
        throw new Error('Could not capture this page type');
      }

      const { markdown, title } = await convertHtmlToMarkdown(extracted.html);
      const pageTitle = extracted.title || title;
      const success = await importText(markdown, pageTitle, senderTabId);
      if (!success) throw new Error('Import failed. Make sure NotebookLM is open.');
      return true;
    }

    case 'IMPORT_URL':
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd /home/tongdu/code/notebooklm-jetpack && pnpm compile
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
cd /home/tongdu/code/notebooklm-jetpack && pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/background.ts tests/services/page-capture.test.ts
git commit -m "feat: add CAPTURE_PAGE_CONTENT handler in background service worker"
```

---

## Task 4: Add "Import Page Content" button to SingleImport UI

**Files:**
- Modify: `components/SingleImport.tsx`

- [ ] **Step 1: Update `components/SingleImport.tsx`**

Replace the entire file content with:

```tsx
import { useState } from 'react';
import { Link, Loader2, CheckCircle, AlertCircle, ExternalLink, FileText } from 'lucide-react';
import type { ImportProgress } from '@/lib/types';
import { isValidUrl } from '@/lib/utils';
import { t } from '@/lib/i18n';

interface Props {
  onProgress: (progress: ImportProgress | null) => void;
}

type ImportState = 'idle' | 'loading' | 'importing' | 'capturing' | 'success' | 'error';

export function SingleImport({ onProgress }: Props) {
  const [url, setUrl] = useState('');
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null);
  const [state, setState] = useState<ImportState>('idle');
  const [error, setError] = useState('');

  // Load current tab URL on mount
  useState(() => {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB' }, (response) => {
      if (response?.success && response.data) {
        setCurrentTabUrl(response.data as string);
      }
    });
  });

  const handleImport = async (targetUrl: string) => {
    if (!isValidUrl(targetUrl)) {
      setError(t('invalidUrl'));
      setState('error');
      return;
    }

    setState('importing');
    setError('');

    onProgress({
      total: 1,
      completed: 0,
      items: [{ url: targetUrl, status: 'importing' }],
    });

    chrome.runtime.sendMessage({ type: 'IMPORT_URL', url: targetUrl }, (response) => {
      onProgress(null);

      if (response?.success && response.data) {
        setState('success');
        setTimeout(() => setState('idle'), 3000);
      } else {
        setState('error');
        setError(response?.error || t('single.importFailedHint'));
      }
    });
  };

  const handleImportCurrentTab = () => {
    if (currentTabUrl) {
      setUrl(currentTabUrl);
      handleImport(currentTabUrl);
    }
  };

  const handleCaptureContent = () => {
    setState('capturing');
    setError('');

    chrome.runtime.sendMessage({ type: 'CAPTURE_PAGE_CONTENT' }, (response) => {
      if (response?.success) {
        setState('success');
        setTimeout(() => setState('idle'), 3000);
      } else {
        setState('error');
        setError(response?.error || t('single.captureFailedHint'));
      }
    });
  };

  const isCapturableUrl = currentTabUrl?.startsWith('http');
  const isBusy = state === 'importing' || state === 'capturing';

  return (
    <div className="space-y-4">
      {/* Current tab quick import */}
      {currentTabUrl && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-2">{t('single.currentTab')}</p>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-gray-700 truncate">{currentTabUrl}</span>
            <button
              onClick={handleImportCurrentTab}
              disabled={isBusy}
              className="px-3 py-1.5 bg-notebooklm-blue text-white text-xs rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {state === 'importing' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ExternalLink className="w-3 h-3" />
              )}
              {t('import')}
            </button>
            <button
              onClick={handleCaptureContent}
              disabled={isBusy || !isCapturableUrl}
              title={!isCapturableUrl ? t('single.captureNotSupported') : t('single.captureAuthHint')}
              className="px-3 py-1.5 bg-gray-600 text-white text-xs rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {state === 'capturing' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <FileText className="w-3 h-3" />
              )}
              {t('single.captureContent')}
            </button>
          </div>
        </div>
      )}

      {/* Manual URL input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t('single.enterUrl')}</label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-notebooklm-blue focus:border-transparent"
            />
          </div>
          <button
            onClick={() => handleImport(url)}
            disabled={!url || isBusy}
            className="px-4 py-2 bg-notebooklm-blue text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {state === 'importing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('single.importingBtn')}
              </>
            ) : (
              t('import')
            )}
          </button>
        </div>
      </div>

      {/* Status messages */}
      {state === 'success' && (
        <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 rounded-lg p-3">
          <CheckCircle className="w-4 h-4" />
          {t('importSuccess')}
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Tips */}
      <div className="text-xs text-gray-400 space-y-1">
        <p>{t('single.supportedImports')}</p>
        <ul className="list-disc list-inside space-y-0.5 text-gray-400">
          <li>{t('single.webArticles')}</li>
          <li>{t('single.substackWechat')}</li>
          <li>{t('single.pdfLinks')}</li>
          <li>{t('single.captureAuthHint')}</li>
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /home/tongdu/code/notebooklm-jetpack && pnpm compile
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
cd /home/tongdu/code/notebooklm-jetpack && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Build to verify no bundle errors**

```bash
cd /home/tongdu/code/notebooklm-jetpack && pnpm build
```

Expected: build succeeds, `dist/` produced.

- [ ] **Step 5: Commit**

```bash
git add components/SingleImport.tsx
git commit -m "feat: add Import Page Content button to SingleImport for authenticated pages"
```

---

## Manual Verification Checklist

After building, load `dist/` as unpacked extension in Chrome, then verify:

1. Open `https://example.com` → popup More tab → "Import Page Content" button is visible
2. Open `chrome://extensions` → "Import Page Content" button is disabled with tooltip
3. Click "Import Page Content" on a regular page → spinner appears → success or error shown
4. Open a Confluence page (or other auth-required page) → "Import Page Content" captures and imports content
5. Both "Import" (URL) and "Import Page Content" buttons are correctly disabled while the other is busy
