import { parseRssFeed } from '@/services/rss-parser';
import { fetchNotebooksCached as fetchNotebooksApi } from '@/services/notebook-api';
import {
  importUrl,
  importBatch,
  importText,
  getCurrentTabUrl,
  getAllTabUrls,
} from '@/services/notebooklm';
import { analyzeDocSite, fetchSitemap, fetchHuaweiCatalog, fetchLlmsTxt, fetchLlmsFullTxt } from '@/services/docs-site';
import { fetchAllPages, buildDocsHtml, cleanComponentMd, convertHtmlToMarkdown } from '@/services/pdf-generator';
import { getHistory, clearHistory } from '@/services/history';
import { fetchPodcast, sanitizeFilename, buildFilename } from '@/services/podcast';
import type { PodcastInfo, PodcastEpisode } from '@/services/podcast';

// Helper: render HTML to PDF via CDP and download
async function handleExportPdfFromHtml(html: string, title: string): Promise<void> {
  const filename = `${(title || 'docs').replace(/[^a-zA-Z0-9\u4e00-\u9fff-_ ]/g, '').trim().slice(0, 60)}.pdf`;
  console.log('[EXPORT_PDF] Starting, HTML size:', (html.length / 1024).toFixed(1), 'KB');

  // Create blank tab, then inject HTML content via CDP
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  if (!tab?.id) throw new Error('Failed to create tab');
  const tabId = tab.id;

  // Brief wait for about:blank to be ready
  await new Promise(r => setTimeout(r, 500));

  // Attach debugger
  await new Promise<void>((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) reject(new Error('[EXPORT_PDF] debugger.attach failed: ' + chrome.runtime.lastError.message));
      else resolve();
    });
  });
  console.log('[EXPORT_PDF] Debugger attached to tab', tabId);

  // Get the actual frameId from the page
  let frameId: string;
  try {
    const frameTree = await new Promise<{ frameTree: { frame: { id: string } } }>((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, 'Page.getFrameTree', {}, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res as { frameTree: { frame: { id: string } } });
      });
    });
    frameId = frameTree.frameTree.frame.id;
    console.log('[EXPORT_PDF] Got frameId:', frameId);
  } catch (err) {
    console.warn('[EXPORT_PDF] Failed to get frameId, using fallback:', err);
    frameId = '';
  }

  // Set HTML content via CDP
  if (frameId) {
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, 'Page.setDocumentContent', {
        frameId,
        html,
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[EXPORT_PDF] setDocumentContent failed:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('[EXPORT_PDF] setDocumentContent succeeded');
          resolve();
        }
      });
    }).catch(async () => {
      // Fallback: inject via Runtime.evaluate in chunks if needed
      console.log('[EXPORT_PDF] Falling back to Runtime.evaluate');
      await cdpEvaluate(tabId, `document.open(); document.close();`);
      // Write in chunks to avoid CDP command size limits
      const chunkSize = 1024 * 512; // 512KB chunks
      for (let i = 0; i < html.length; i += chunkSize) {
        const chunk = html.slice(i, i + chunkSize);
        await cdpEvaluate(tabId, `document.write(${JSON.stringify(chunk)});`);
      }
      await cdpEvaluate(tabId, `document.close();`);
      console.log('[EXPORT_PDF] Fallback write completed');
    });
  } else {
    // No frameId, use evaluate directly
    await cdpEvaluate(tabId, `document.open(); document.close();`);
    const chunkSize = 1024 * 512;
    for (let i = 0; i < html.length; i += chunkSize) {
      const chunk = html.slice(i, i + chunkSize);
      await cdpEvaluate(tabId, `document.write(${JSON.stringify(chunk)});`);
    }
    await cdpEvaluate(tabId, `document.close();`);
  }

  // Wait for render
  await new Promise(r => setTimeout(r, 2000));

  // Print to PDF
  console.log('[EXPORT_PDF] Printing to PDF...');
  const result = await new Promise<{ data: string }>((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, 'Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      marginTop: 0.4,
      marginBottom: 0.4,
      marginLeft: 0.4,
      marginRight: 0.4,
    }, (res) => {
      if (chrome.runtime.lastError) reject(new Error('[EXPORT_PDF] printToPDF failed: ' + chrome.runtime.lastError.message));
      else resolve(res as { data: string });
    });
  });

  chrome.debugger.detach({ tabId });
  chrome.tabs.remove(tabId);

  const pdfSizeMB = (result.data.length * 3 / 4 / 1024 / 1024).toFixed(2);
  console.log('[EXPORT_PDF] PDF generated, ~size:', pdfSizeMB, 'MB, downloading as:', filename);

  // Use data URL for download (Service Worker has no URL.createObjectURL)
  const pdfDataUrl = 'data:application/pdf;base64,' + result.data;
  chrome.downloads.download({ url: pdfDataUrl, filename, saveAs: true }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('[EXPORT_PDF] download failed:', chrome.runtime.lastError.message);
    } else {
      console.log('[EXPORT_PDF] Download started, id:', downloadId);
    }
  });
}

// Helper: evaluate JS via CDP
function cdpEvaluate(tabId: number, expression: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}
import {
  extractClaudeConversation,
  formatConversationForImport,
} from '@/services/claude-conversation';
import {
  addBookmark,
  removeBookmark,
  removeBookmarks,
  moveBookmark,
  getBookmarks,
  getCollections,
  createCollection,
  isBookmarked,
} from '@/services/bookmarks';
import type { MessageType, MessageResponse, ClaudeConversation } from '@/lib/types';

// Dev reload: allow external messages to trigger extension reload
try {
  chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'DEV_RELOAD') {
      console.log('[DEV] Reload triggered externally');
      sendResponse({ ok: true });
      setTimeout(() => chrome.runtime.reload(), 100);
      return true;
    }
  });
} catch { /* fake-browser in WXT build doesn't support onMessageExternal */ }

// Context menu IDs
const MENU_ID_PAGE = 'import-page';
const MENU_ID_LINK = 'import-link';

export default defineBackground(() => {
  console.log('NotebookLM Jetpack background service started');

  // Create context menus on install
  chrome.runtime.onInstalled.addListener((details) => {
    // Open welcome page on first install
    if (details.reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') });
    }

    // Menu item for importing current page
    chrome.contextMenus.create({
      id: MENU_ID_PAGE,
      title: '导入此页面到 NotebookLM',
      contexts: ['page'],
    });

    // Menu item for importing a link
    chrome.contextMenus.create({
      id: MENU_ID_LINK,
      title: '导入此链接到 NotebookLM',
      contexts: ['link'],
    });
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    let url: string | undefined;

    if (info.menuItemId === MENU_ID_PAGE) {
      url = tab?.url;
    } else if (info.menuItemId === MENU_ID_LINK) {
      url = info.linkUrl;
    }

    if (!url || !url.startsWith('http')) {
      console.warn('Context menu import: invalid URL');
      return;
    }

    try {
      await importUrl(url);
    } catch (error) {
      console.error('Context menu import failed:', error);
    }
  });

  // Handle PDF export via persistent port connection (supports progress updates)
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'podcast-download') {
      port.onMessage.addListener(async (msg) => {
        if (msg.type !== 'DOWNLOAD_PODCAST') return;

        const podcastInfo = msg.podcast as PodcastInfo;
        const episodes = msg.episodes as PodcastEpisode[];
        const sendProgress = (data: Record<string, unknown>) => {
          try { port.postMessage(data); } catch { /* disconnected */ }
        };

        const folderName = sanitizeFilename(podcastInfo.name);
        console.log(`[podcast] Downloading ${episodes.length} episodes of "${podcastInfo.name}"`);

        try {
          for (let i = 0; i < episodes.length; i++) {
            const ep = episodes[i];
            const filename = `${folderName}/${buildFilename(i + 1, ep.title, ep.fileExtension)}`;
            sendProgress({ phase: 'downloading', current: i + 1, total: episodes.length, title: ep.title });
            console.log(`[podcast] ${i + 1}/${episodes.length}: ${ep.title}`);

            await new Promise<void>((resolve, reject) => {
              chrome.downloads.download(
                { url: ep.audioUrl, filename, conflictAction: 'uniquify' },
                (downloadId) => {
                  if (chrome.runtime.lastError) {
                    console.error(`[podcast] Download failed:`, chrome.runtime.lastError.message);
                    reject(new Error(chrome.runtime.lastError.message));
                  } else {
                    console.log(`[podcast] Download started: ${downloadId}`);
                    resolve();
                  }
                },
              );
            });
          }
          sendProgress({ phase: 'done' });
        } catch (err) {
          sendProgress({ phase: 'error', error: String(err) });
        }
      });
      return;
    }

    if (port.name !== 'pdf-export') return;

    port.onMessage.addListener(async (msg) => {
      if (msg.type !== 'GENERATE_PDF' && msg.type !== 'GENERATE_CLIPBOARD') return;

      const isClipboard = msg.type === 'GENERATE_CLIPBOARD';
      const si = msg.siteInfo;
      const sendProgress = (data: Record<string, unknown>) => {
        try { port.postMessage(data); } catch { /* port disconnected */ }
      };

      const logPrefix = isClipboard ? '[GENERATE_CLIPBOARD]' : '[GENERATE_PDF]';
      console.log(`${logPrefix} Starting via port, pages:`, si.pages.length);

      try {
        // Helper: finalize output — either copy to clipboard (return markdown) or generate PDF
        const finalizeOutput = async (contents: { title: string; markdown: string; section?: string; url: string; wordCount: number }[]) => {
          if (isClipboard) {
            // Concatenate all markdown for clipboard
            const markdown = contents.map(c => {
              const header = `# ${c.title}\n`;
              const source = `\n> Source: ${c.url}\n`;
              return header + c.markdown + source;
            }).join('\n\n---\n\n');
            sendProgress({ phase: 'clipboard', markdown });
            sendProgress({ phase: 'done' });
          } else {
            sendProgress({ phase: 'rendering', current: 1, total: 1 });
            const html = buildDocsHtml(si, contents);
            const pdfTitle = contents.length === 1 ? contents[0].title : si.title;
            await handleExportPdfFromHtml(html, pdfTitle);
            sendProgress({ phase: 'done' });
          }
        };

        // Fast path: llms-full.txt
        if (si.hasLlmsFullTxt) {
          sendProgress({ phase: 'fetching', current: 0, total: 1, currentPage: 'llms-full.txt' });
          const origin = new URL(si.baseUrl).origin;
          const r = await fetch(`${origin}/llms-full.txt`, { signal: AbortSignal.timeout(30000) });
          if (r.ok) {
            const fullText = await r.text();
            if (fullText.length > 1000) {
              const sections = fullText.split(/(?=^# )/m).filter(s => s.trim().length > 50);
              const contents = sections.map((section, i) => {
                const titleMatch = section.match(/^#\s+(.+)/m);
                const title = titleMatch?.[1] || `Section ${i + 1}`;
                const cleaned = cleanComponentMd(section);
                return {
                  url: `${origin}/#section-${i}`,
                  title,
                  markdown: cleaned,
                  section: undefined as string | undefined,
                  wordCount: cleaned.split(/\s+/).length,
                };
              });
              sendProgress({ phase: 'fetching', current: 1, total: 1 });
              await finalizeOutput(contents);
              return;
            }
          }
        }

        // Standard path: fetch pages individually
        const maxPages = 1000;
        const pagesToFetch = si.pages.slice(0, maxPages);
        console.log('[GENERATE_PDF] Fetching', pagesToFetch.length, 'pages...');

        // Split: SPA pages (x.com etc.) need tab-based extraction
        const spaPages = pagesToFetch.filter((p: { url: string }) => needsTabBasedExtraction(p.url));
        const fetchPages = pagesToFetch.filter((p: { url: string }) => !needsTabBasedExtraction(p.url));

        let contents: Awaited<ReturnType<typeof fetchAllPages>> = [];

        // Tab-based extraction for SPA pages
        if (spaPages.length > 0) {
          console.log('[GENERATE_PDF] Tab-extracting', spaPages.length, 'SPA pages...');
          const spaResults = await repairDynamicSources(spaPages.map((p: { url: string }) => p.url), true);
          for (const result of spaResults) {
            if (result.status === 'success' && result.title) {
              const content = result.content || '';
              // innerText from SPA pages is plain text with \n line breaks.
              // Convert single \n to \n\n so marked.parse() creates proper paragraphs.
              const markdown = content.replace(/(?<!\n)\n(?!\n)/g, '\n\n');
              contents.push({
                url: result.url,
                title: result.title,
                markdown,
                section: undefined,
                wordCount: content.split(/\s+/).length,
              });
            } else if (result.status === 'error') {
              console.warn('[GENERATE_PDF] SPA extraction failed:', result.url, result.error);
            }
            sendProgress({ phase: 'fetching', current: contents.length, total: pagesToFetch.length, currentPage: result.title });
          }
        }

        // Fetch-based extraction for regular pages
        if (fetchPages.length > 0) {
          const fetchedOffset = contents.length;
          const fetchContents = await fetchAllPages(fetchPages, {
            concurrency: 5,
            onProgress: (p) => {
              sendProgress({ phase: 'fetching', current: fetchedOffset + p.current, total: pagesToFetch.length, currentPage: p.currentPage });
              if (p.current % 50 === 0) console.log(`[GENERATE_PDF] Progress: ${fetchedOffset + p.current}/${pagesToFetch.length}`);
            },
          });
          contents.push(...fetchContents);
        }

        if (contents.length === 0) {
          sendProgress({ phase: 'error', error: '未能获取任何页面内容' });
          return;
        }

        console.log(`${logPrefix} Fetched`, contents.length, 'pages, finalizing...');
        await finalizeOutput(contents);
      } catch (err) {
        console.error(`${logPrefix} Error:`, err);
        sendProgress({ phase: 'error', error: String(err) });
      }
    });
  });

  // Handle messages from popup and content scripts
  chrome.runtime.onMessage.addListener(
    (
      message: MessageType,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: MessageResponse) => void
    ) => {
      handleMessage(message)
        .then((data) => sendResponse({ success: true, data }))
        .catch((error) =>
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        );

      // Return true to indicate we'll send response asynchronously
      return true;
    }
  );
});

// ── Rescue failed sources ──
// Fetch page content ourselves and import as text (bypasses NotebookLM's URL fetch)
interface RescueResult {
  url: string;
  status: 'success' | 'error';
  title?: string;
  content?: string;
  error?: string;
}

/**
 * Detect if fetched content is a blocked/anti-scraping page rather than real article content.
 * Returns error message if blocked, null if content looks legit.
 */
function detectBlockedContent(markdown: string, html: string, url: string): string | null {
  // Too short — no real content
  if (markdown.length < 50) {
    return '内容太少，可能是付费/登录墙';
  }

  // WeChat-specific: blocked page has no rich_media_content and empty title
  if (url.includes('mp.weixin.qq.com')) {
    const hasContent = /rich_media_content|js_content/.test(html);
    const hasTitle = /<title>[^<]{2,}<\/title>/.test(html);
    if (!hasContent && !hasTitle) {
      return '微信公众号反爬拦截，需在微信内打开';
    }
  }

  // Generic anti-scraping signals
  const blockedPatterns = [
    /环境异常.*验证/s,
    /完成验证后.*继续访问/s,
    /访问过于频繁/,
    /请完成.*安全验证/s,
    /robot.*verification/i,
    /captcha.*required/i,
    /access.*denied.*bot/i,
    /please.*verify.*human/i,
    /cloudflare.*checking/i,
    /just.*moment.*checking/i,
    /enable.*javascript.*cookies/i,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(markdown)) {
      return '页面被反爬机制拦截';
    }
  }

  // Content ratio check: if markdown is mostly boilerplate (very few words relative to HTML size)
  const wordCount = markdown.split(/\s+/).filter((w) => w.length > 1).length;
  const htmlSize = html.length;
  if (htmlSize > 10000 && wordCount < 30) {
    return '页面内容为空壳，可能需要登录';
  }

  return null;
}

/** URLs that need tab-based rendering (SPA / dynamic content) */
function needsTabBasedExtraction(url: string): boolean {
  return /^https?:\/\/(www\.)?(x\.com|twitter\.com)\//.test(url)
    || /^https?:\/\/developer\.huawei\.com\//.test(url);
}

async function rescueSources(urls: string[]): Promise<RescueResult[]> {
  const results: RescueResult[] = [];

  // Split: SPA sites go to tab-based extraction, others use fetch
  const tabUrls = urls.filter(needsTabBasedExtraction);
  const fetchUrls = urls.filter(u => !needsTabBasedExtraction(u));

  // Handle tab-based URLs via the same repair/extract pipeline
  if (tabUrls.length > 0) {
    const tabResults = await repairDynamicSources(tabUrls);
    results.push(...tabResults);
  }

  for (const url of fetchUrls) {
    try {
      console.log(`[rescue] Fetching: ${url}`);
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        results.push({ url, status: 'error', error: `HTTP ${resp.status}` });
        continue;
      }

      const html = await resp.text();

      // Convert HTML to Markdown via offscreen document (Turndown)
      let markdown: string;
      let title: string;
      try {
        const result = await convertHtmlToMarkdown(html);
        markdown = result.markdown;
        title = result.title || new URL(url).hostname;
      } catch {
        // Fallback: basic text extraction
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        title = titleMatch?.[1]?.trim()?.replace(/\s+/g, ' ') || new URL(url).hostname;
        markdown = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      // Content quality check — detect anti-scraping / blocked pages
      const contentIssue = detectBlockedContent(markdown, html, url);
      if (contentIssue) {
        results.push({ url, status: 'error', error: contentIssue });
        continue;
      }

      // Prepend title and source URL for reference
      const content = `# ${title}\n\nSource: ${url}\n\n${markdown}`;

      // Import as text to NotebookLM
      const success = await importText(content, title);
      results.push({
        url,
        status: success ? 'success' : 'error',
        title,
        error: success ? undefined : '导入 NotebookLM 失败',
      });

      // Delay between imports (wait for dialog to fully close)
      if (urls.indexOf(url) < urls.length - 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (error) {
      results.push({
        url,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

// ── Repair WeChat sources ──
// Open page in browser tab → extract rendered content → import as text
// Tab-based content extraction for dynamic/SPA sites (X.com, WeChat, etc.)
// extractOnly=true returns content without importing to NotebookLM (for PDF export)
async function repairDynamicSources(urls: string[], extractOnly = false): Promise<RescueResult[]> {
  return _tabBasedExtract(urls, extractOnly);
}

async function repairWechatSources(urls: string[]): Promise<RescueResult[]> {
  return _tabBasedExtract(urls, false);
}

async function _tabBasedExtract(urls: string[], extractOnly = false): Promise<RescueResult[]> {
  const results: RescueResult[] = [];

  for (const url of urls) {
    try {
      console.log(`[repair] Opening: ${url}`);

      // For X.com article focus-mode URLs, use as-is; for /status/ URLs keep original
      // (we can't know if a /status/ URL is an article until we render it)
      let openUrl = url;
      const xArticleFocusMatch = url.match(/^https?:\/\/(www\.)?(x\.com|twitter\.com)\/(\w+)\/article\/(\d+)/);
      if (xArticleFocusMatch) {
        console.log(`[repair] X.com: already focus mode URL`);
      }

      // Open the URL in a new tab
      const tab = await chrome.tabs.create({ url: openUrl, active: false });
      if (!tab.id) throw new Error('Failed to create tab');

      // Wait for page to load
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(); // resolve even on timeout, we'll try to extract anyway
        }, 15000);

        const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timeout);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });

      // Give extra time for dynamic content to render (SPA sites need more)
      // X.com articles need 8s+ in background tabs for full content rendering
      const isXcom = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\//.test(url);
      const renderWait = isXcom ? 8000 : needsTabBasedExtraction(url) ? 5000 : 3000;
      await new Promise((r) => setTimeout(r, renderWait));

      // Extract content from the rendered page (site-specific extractors)
      const extractResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const currentUrl = window.location.href;

          // ── X.com / Twitter extractor ──
          // Articles: [data-testid="twitterArticleRichTextView"] for long-form articles
          // Regular tweets/threads: [data-testid="tweetText"] for tweet content
          if (currentUrl.includes('x.com/') || currentUrl.includes('twitter.com/')) {
            // Try Article extractor first (long-form X Articles)
            const xArticleContent = document.querySelector('[data-testid="twitterArticleRichTextView"]');
            if (xArticleContent) {
              const titleEl = document.querySelector('[data-testid="twitter-article-title"]');
              const title = titleEl?.textContent?.trim()
                || document.title.replace(/ \/ X$/, '').replace(/ on X:.*$/, '').trim();
              const content = (xArticleContent as HTMLElement).innerText?.trim() || '';
              if (content.length >= 100) {
                return { success: true, title, content };
              }
            }

            // Fallback: extract tweet text from the main tweet (for regular posts/threads)
            const tweetTexts = document.querySelectorAll('article [data-testid="tweetText"]');
            if (tweetTexts.length > 0) {
              const title = document.title.replace(/ \/ X$/, '').replace(/ on X:.*$/, '').trim();
              const parts: string[] = [];
              tweetTexts.forEach(el => {
                const text = (el as HTMLElement).innerText?.trim();
                if (text && text.length > 10) parts.push(text);
              });
              const content = parts.join('\n\n');
              if (content.length >= 50) {
                return { success: true, title, content };
              }
            }

            return { success: false, error: 'X.com: 未找到文章或推文内容' };
          }

          // ── Huawei Developer Docs extractor ──
          if (currentUrl.includes('developer.huawei.com')) {
            const docTitle = document.querySelector('h1')?.textContent?.trim()
              || document.title.replace(/-.*$/, '').trim();
            // Huawei uses Angular — content is in .markdown-body or #mark .idpContent
            const docContent = document.querySelector('.markdown-body')
              || document.querySelector('#mark .idpContent')
              || document.querySelector('.document-content-html')
              || document.querySelector('#document-content .layout-content');
            if (docContent && (docContent as HTMLElement).innerText?.trim().length > 50) {
              return { success: true, title: docTitle, content: (docContent as HTMLElement).innerText.trim() };
            }
            return { success: false, error: '华为文档内容提取失败' };
          }

          // ── WeChat / Generic extractor ──
          const contentEl = document.querySelector('#js_content')
            || document.querySelector('.rich_media_content')
            || document.querySelector('article')
            || document.querySelector('.rich_media_area_primary');

          const titleEl = document.querySelector('.rich_media_title, #activity-name, h1');
          const title = titleEl?.textContent?.trim() || document.title || '';

          if (!contentEl || contentEl.textContent?.trim().length === 0) {
            return { success: false, error: '页面内容为空，可能需要在微信中验证' };
          }

          // Get text content, preserving some structure
          const content = (contentEl as HTMLElement).innerText || contentEl.textContent || '';
          return { success: true, title, content: content.trim() };
        },
      });

      // Close the tab
      await chrome.tabs.remove(tab.id);

      const extracted = extractResult?.[0]?.result as {
        success: boolean;
        title?: string;
        content?: string;
        error?: string;
      } | undefined;

      if (!extracted?.success || !extracted.content) {
        results.push({
          url,
          status: 'error',
          error: extracted?.error || '无法提取内容',
        });
        continue;
      }

      // Content quality check
      if (extracted.content.length < 100) {
        results.push({
          url,
          status: 'error',
          error: '提取到的内容太少，可能被拦截',
        });
        continue;
      }

      const title = extracted.title || new URL(url).hostname;
      const rawContent = extracted.content;
      const content = `# ${title}\n\nSource: ${url}\n\n${rawContent}`;

      if (extractOnly) {
        // Return content without importing (for PDF export)
        results.push({ url, status: 'success', title, content: rawContent });
      } else {
        // Import as text
        const success = await importText(content, title);
        results.push({
          url,
          status: success ? 'success' : 'error',
          title,
          content: rawContent,
          error: success ? undefined : '导入 NotebookLM 失败',
        });
      }

      if (urls.indexOf(url) < urls.length - 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (error) {
      results.push({
        url,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

async function handleMessage(message: MessageType): Promise<unknown> {
  switch (message.type) {
    case 'IMPORT_URL':
      return await importUrl(message.url);

    case 'IMPORT_BATCH':
      return await importBatch(message.urls);

    case 'PARSE_RSS':
      return await parseRssFeed(message.rssUrl);

    case 'GET_CURRENT_TAB':
      return await getCurrentTabUrl();

    case 'GET_ALL_TABS':
      return await getAllTabUrls();

    case 'ANALYZE_DOC_SITE': {
      // AI-native fallback chain: llms.txt → sitemap → Huawei API → DOM
      const tabInfo = await chrome.tabs.get(message.tabId);
      const tabUrl = tabInfo.url || '';

      // 1. Try llms.txt first (AI-native, covers 66% of doc sites including React/Svelte with no sitemap)
      if (tabUrl.startsWith('http')) {
        try {
          const llmsPages = await fetchLlmsTxt(tabUrl);
          if (llmsPages.length >= 5) {
            const urlObj = new URL(tabUrl);
            // Check if llms-full.txt is also available (for PDF export optimization)
            const hasFullTxt = await fetchLlmsFullTxt(tabUrl).then(t => t !== null).catch(() => false);
            return {
              baseUrl: urlObj.origin,
              title: tabInfo.title || urlObj.hostname,
              framework: 'sitemap' as const,
              pages: llmsPages,
              hasLlmsFullTxt: hasFullTxt,
            };
          }
        } catch {
          // llms.txt not available, fall through
        }
      }

      // 2. Try sitemap.xml (covers 55% of sites)
      if (tabUrl.startsWith('http')) {
        try {
          const sitemapPages = await fetchSitemap(tabUrl);
          if (sitemapPages.length > 0) {
            const urlObj = new URL(tabUrl);
            const pathPrefix = urlObj.pathname.replace(/\/$/, '');

            // Filter to pages under the current path prefix (e.g. /docs)
            let filterPrefix = pathPrefix;
            if (filterPrefix) {
              const segments = filterPrefix.split('/').filter(Boolean);
              if (segments.length > 1) {
                const last = segments[segments.length - 1];
                if (last.includes('.') || !sitemapPages.some((p) => p.path.startsWith(filterPrefix + '/'))) {
                  segments.pop();
                  filterPrefix = '/' + segments.join('/');
                }
              }
            }

            let filteredPages = sitemapPages;
            if (filterPrefix && filterPrefix !== '/') {
              filteredPages = sitemapPages.filter((p) =>
                p.path.startsWith(filterPrefix)
              );
              if (filteredPages.length < 3 && sitemapPages.length > 10) {
                filteredPages = sitemapPages;
              }
            }

            // Multi-language handling: prefer English docs
            const langPattern = /\/(?:docs|documentation|guide|api)\/([a-z]{2}(?:-[a-z]{2,4})?)\//i;
            const languages = new Set<string>();
            for (const p of filteredPages) {
              const m = p.path.match(langPattern);
              if (m) languages.add(m[1].toLowerCase());
            }

            if (languages.size > 1 && languages.has('en')) {
              const enPages = filteredPages.filter((p) => {
                const m = p.path.match(langPattern);
                return m && m[1].toLowerCase() === 'en';
              });
              if (enPages.length > 0) {
                filteredPages = enPages;
              }
            }

            if (filteredPages.length >= 5) {
              return {
                baseUrl: urlObj.origin,
                title: tabInfo.title || urlObj.hostname,
                framework: 'sitemap' as const,
                pages: filteredPages,
              };
            }
          }
        } catch {
          // Sitemap not available, fallback
        }
      }

      // 3. Try Huawei catalog API for HarmonyOS docs (Angular SPA, no sitemap)
      if (tabUrl.includes('developer.huawei.com')) {
        try {
          const huaweiPages = await fetchHuaweiCatalog(tabUrl);
          if (huaweiPages.length > 0) {
            return {
              baseUrl: 'https://developer.huawei.com',
              title: tabInfo.title || 'HarmonyOS 文档',
              framework: 'huawei' as const,
              pages: huaweiPages,
            };
          }
        } catch {
          // Fall through to DOM analysis
        }
      }

      return await analyzeDocSite(message.tabId);
    }

    case 'GET_HISTORY':
      return await getHistory(message.limit);

    case 'CLEAR_HISTORY':
      return await clearHistory();

    case 'EXTRACT_CLAUDE_CONVERSATION':
      return await extractClaudeConversation(message.tabId);

    case 'IMPORT_CLAUDE_CONVERSATION': {
      const conv = message.conversation as ClaudeConversation;
      const pairs = conv.pairs || [];
      if (pairs.length > 0) {
        // New pairs-based import
        const platform = conv.url.includes('chatgpt.com') || conv.url.includes('chat.openai.com')
          ? 'ChatGPT' : conv.url.includes('gemini.google.com') ? 'Gemini' : 'Claude';
        const lines: string[] = [`# ${conv.title}`, '', `**来源**: ${platform} 对话`, `**URL**: ${conv.url}`, '', '---', ''];
        for (const pair of pairs) {
          if (pair.question) { lines.push('## 👤 Human', '', pair.question, ''); }
          if (pair.answer) { lines.push(`## 🤖 ${platform}`, '', pair.answer, ''); }
          lines.push('---', '');
        }
        return await importText(lines.join('\n'), conv.title);
      }
      // Fallback: old message-based import
      const formattedText = formatConversationForImport(conv, message.selectedMessageIds);
      return await importText(formattedText, conv.title);
    }

    case 'FETCH_PODCAST': {
      const result = await fetchPodcast(message.url, { count: message.count });
      return result;
    }

    case 'GET_FAILED_SOURCES': {
      // Ensure content script is injected, then forward
      try {
        await chrome.scripting.executeScript({
          target: { tabId: message.tabId },
          files: ['content-scripts/notebooklm.js'],
        });
      } catch { /* already injected */ }
      await new Promise((r) => setTimeout(r, 300));

      return new Promise((resolve) => {
        chrome.tabs.sendMessage(message.tabId, { type: 'GET_FAILED_SOURCES' }, (resp) => {
          if (chrome.runtime.lastError || !resp?.success) {
            console.log('[rescue] GET_FAILED_SOURCES error:', chrome.runtime.lastError?.message);
            resolve([]);
          } else {
            resolve(resp.data || []);
          }
        });
      });
    }

    case 'RESCUE_SOURCES': {
      return await rescueSources(message.urls);
    }

    case 'REPAIR_WECHAT_SOURCES': {
      return await repairWechatSources(message.urls);
    }

    case 'GENERATE_PDF':
    case 'EXPORT_PDF':
    case 'DOWNLOAD_PODCAST':
      // Handled via port connection (onConnect), not onMessage
      return { success: true };

    // ── Bookmarks ──
    case 'ADD_BOOKMARK':
      return await addBookmark(message.url, message.title, message.favicon, message.collection);

    case 'REMOVE_BOOKMARK':
      await removeBookmark(message.id);
      return true;

    case 'REMOVE_BOOKMARKS':
      await removeBookmarks(message.ids);
      return true;

    case 'GET_BOOKMARKS':
      return await getBookmarks();

    case 'GET_COLLECTIONS':
      return await getCollections();

    case 'CREATE_COLLECTION':
      await createCollection(message.name);
      return true;

    case 'MOVE_BOOKMARK':
      await moveBookmark(message.id, message.collection);
      return true;

    case 'MOVE_BOOKMARKS':
      for (const id of message.ids) {
        await moveBookmark(id, message.collection);
      }
      return true;

    case 'IS_BOOKMARKED':
      return await isBookmarked(message.url);

    // ── Notebook Info ──
    case 'GET_NOTEBOOKS': {
      // Primary: fetch via batchexecute API (works without open NLM tabs)
      const apiNotebooks = await fetchNotebooksApi(message.force);
      if (apiNotebooks.length > 0) {
        // Detect current notebook from any open NLM tab URL
        let current: { id: string; title: string; url: string } | null = null;
        const nlmTabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/notebook/*' });
        if (nlmTabs.length > 0) {
          const tabUrl = nlmTabs[0].url || '';
          const match = tabUrl.match(/\/notebook\/([^/?#]+)/);
          if (match) {
            current = apiNotebooks.find(nb => nb.id === match[1]) || null;
          }
        }
        return { current, notebooks: apiNotebooks };
      }

      // Fallback: content-script approach (requires open NLM tabs)
      console.log('[background] API fetch returned empty, falling back to content script');
      const fallbackTabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
      const notebooks: Array<{ id: string; title: string; url: string }> = [];
      const seen = new Set<string>();
      let fallbackCurrent: { id: string; title: string; url: string } | null = null;

      for (const tab of fallbackTabs) {
        if (!tab.id) continue;
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content-scripts/notebooklm.js'],
          }).catch(() => {});

          const resp = await new Promise<{ success: boolean; data?: { current: { id: string; title: string; url: string } | null; list: Array<{ id: string; title: string; url: string }> } }>((resolve) => {
            chrome.tabs.sendMessage(tab.id!, { type: 'GET_NOTEBOOK_INFO' }, (r) => {
              if (chrome.runtime.lastError) resolve({ success: false });
              else resolve(r || { success: false });
            });
          });

          if (resp.success && resp.data) {
            if (resp.data.current && !seen.has(resp.data.current.id)) {
              seen.add(resp.data.current.id);
              fallbackCurrent = resp.data.current;
              notebooks.push(resp.data.current);
            }
            for (const nb of resp.data.list) {
              if (!seen.has(nb.id)) {
                seen.add(nb.id);
                notebooks.push(nb);
              }
            }
          }
        } catch {
          // Tab may not be ready
        }
      }
      return { current: fallbackCurrent, notebooks };
    }

    default:
      throw new Error('Unknown message type');
  }
}
