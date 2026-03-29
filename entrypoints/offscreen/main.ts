/**
 * Offscreen document — provides DOM environment for HTML→Markdown conversion.
 * Service workers can't use DOMParser/Turndown reliably, so we delegate here.
 */
import TurndownService from 'turndown';
import { tables } from 'turndown-plugin-gfm';

function createTurndownService(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  // DevSite: <pre class="devsite-click-to-copy"> → fenced code block
  td.addRule('devsiteCode', {
    filter: (node) =>
      node.nodeName === 'PRE' &&
      (node.getAttribute('class') || '').includes('devsite-click-to-copy'),
    replacement: (_content, node) => {
      const lang = (node.getAttribute('syntax') || '').toLowerCase();
      const codeEl = (node as Element).querySelector('code') || node;
      const text = codeEl.textContent || '';
      return `\n\n\`\`\`${lang}\n${text.trim()}\n\`\`\`\n\n`;
    },
  });

  td.addRule('removeStyle', {
    filter: 'style',
    replacement: () => '',
  });

  td.addRule('removeDevsiteUI', {
    filter: (node) => {
      const tag = node.nodeName.toLowerCase();
      return (
        tag.startsWith('devsite-') &&
        tag !== 'devsite-code' &&
        tag !== 'devsite-content'
      );
    },
    replacement: () => '',
  });

  td.addRule('removeNavElements', {
    filter: (node) => {
      const cl = node.getAttribute('class') || '';
      return /breadcrumb|sidebar|devsite-nav|devsite-toc/.test(cl);
    },
    replacement: () => '',
  });

  // Substack: remove subscribe buttons, share widgets, like buttons
  td.addRule('removeSubstackNoise', {
    filter: (node) => {
      const cl = node.getAttribute('class') || '';
      const testId = node.getAttribute('data-testid') || '';
      return (
        /subscribe-widget|subscription-widget|button-wrapper|like-button|share-dialog|post-ufi|paywall/.test(cl) ||
        /paywall|navbar/.test(testId)
      );
    },
    replacement: () => '',
  });

  // Substack: image captions are in <figcaption>
  td.addRule('substackFigcaption', {
    filter: 'figcaption',
    replacement: (content) => content.trim() ? `\n*${content.trim()}*\n` : '',
  });

  // GFM table support (converts <table> to Markdown pipe tables)
  td.use(tables);

  return td;
}

// Content selectors in priority order
const CONTENT_SELECTORS = [
  '.devsite-article-body',
  // Huawei Developer Docs
  '.doc-content',
  '.document-content',
  // Substack
  '.available-content .body.markup',
  '.available-content',
  '.body.markup',
  // General — specific content containers before broad layout landmarks
  '.markdown-body',
  'article [itemprop="articleBody"]',
  '#main-content',          // Confluence, WordPress, many CMSes
  '.wiki-content',          // Confluence wiki body
  '.entry-content',         // WordPress posts
  '.post-content',          // WordPress/Ghost
  '.page-content',          // Generic CMS
  '.article-content',       // Generic
  '.article-body',          // Generic
  'article',
  'main',
  '[role="main"]',
  '#content',
  '.prose',
  '.content',
];

// Elements to remove before conversion
const REMOVE_SELECTORS = [
  'script', 'style', 'nav', 'footer', 'header',
  '.sidebar', '.toc', '.breadcrumb',
  '.nocontent', '[role="navigation"]',
  // DevSite
  '.devsite-article-meta', '.devsite-breadcrumb-list',
  'devsite-toc', 'devsite-page-rating', 'devsite-thumbs-rating',
  'devsite-feedback', 'devsite-bookmark', 'devsite-actions',
  '.devsite-banner', '.devsite-collections-banner',
  // Substack
  '[data-testid="paywall"]',              // paywall boundary + subscription prompts
  '.subscription-widget-wrap',
  '.subscribe-widget',
  '.subscribe-prompt',
  '.button-wrapper',
  '.like-button-container',
  '.post-ufi',                            // like/comment/share bar
  '.post-footer',
  '.comments-section',
  '.recommendation-container',
  '.footer-wrap',
  '.pencraft.pc-display-flex.pc-gap-4',   // Substack nav buttons (Previous/Next)
  '.share-dialog',
  '.social-share',
  '[data-testid="navbar"]',
  '.header-anchor-widget',
  // Confluence: sections outside the article body
  '#labels-section',
  '#comments-section',
  '#space-tools-web-items',
  '.page-metadata',
  // Generic: like/reaction widgets and interactive toolbars
  '[role="toolbar"]',
  '.like-button-container',
  '.likes-section',
  // Stiltsoft Table Filter & Charts plugin (Confluence)
  '[id^="tfac-"]',
].join(',');

function htmlToMarkdown(html: string): { markdown: string; title: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Find content element
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

  // Remove non-content elements
  el.querySelectorAll(REMOVE_SELECTORS).forEach(e => e.remove());

  // Flatten block elements inside table cells so GFM table rows stay single-line.
  // Confluence (and other editors) wrap cell content in <p> tags, which Turndown
  // treats as block elements and adds newlines around — breaking pipe table format.
  el.querySelectorAll('td, th').forEach(cell => {
    cell.querySelectorAll('p, div, span').forEach(inner => {
      const text = inner.textContent || '';
      inner.replaceWith(doc.createTextNode(text.trim()));
    });
  });

  const title = doc.querySelector('h1')?.textContent?.trim() || doc.title || '';

  // Convert to markdown
  const td = createTurndownService();
  let markdown = td.turndown(el.innerHTML);

  // Post-process
  markdown = markdown
    .replace(/\.dcc-[\s\S]*?\n\n/g, '\n\n')
    // Substack: remove trailing subscription prompts
    .replace(/Continue reading this post for free.*$/s, '')
    .replace(/Claim my free post.*$/s, '')
    .replace(/Already a paid subscriber\?.*$/s, '')
    .replace(/Get more from .* in the Substack app.*$/s, '')
    .replace(/Start your Substack.*$/s, '')
    .replace(/This site requires JavaScript.*$/s, '')
    .replace(/© \d{4} .*?[·∙].*?Terms.*$/s, '')
    // General cleanup
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { markdown, title };
}

// ── RSS/Atom XML parsing ──────────────────────────────────────

interface RssFeedItem {
  url: string;
  title: string;
  pubDate?: string;
}

function parseRssXml(xml: string): RssFeedItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid RSS/XML format');
  }

  const items: RssFeedItem[] = [];

  // Try RSS 2.0 format first
  const rssItems = doc.querySelectorAll('item');
  if (rssItems.length > 0) {
    rssItems.forEach((item) => {
      const link = item.querySelector('link')?.textContent;
      const title = item.querySelector('title')?.textContent;
      const pubDate = item.querySelector('pubDate')?.textContent;

      if (link) {
        items.push({
          url: link.trim(),
          title: title?.trim() || link,
          pubDate: pubDate?.trim(),
        });
      }
    });
    return items;
  }

  // Try Atom format
  const atomEntries = doc.querySelectorAll('entry');
  if (atomEntries.length > 0) {
    atomEntries.forEach((entry) => {
      const linkEl =
        entry.querySelector('link[rel="alternate"]') || entry.querySelector('link');
      const link = linkEl?.getAttribute('href');
      const title = entry.querySelector('title')?.textContent;
      const published =
        entry.querySelector('published')?.textContent ||
        entry.querySelector('updated')?.textContent;

      if (link) {
        items.push({
          url: link.trim(),
          title: title?.trim() || link,
          pubDate: published?.trim(),
        });
      }
    });
    return items;
  }

  throw new Error('No items found in feed');
}

// ── Sitemap XML parsing ──────────────────────────────────────

function parseSitemapXml(xml: string): { urls: string[]; sitemapUrls: string[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const urls: string[] = [];
  const sitemapUrls: string[] = [];

  // Check for sitemap index
  const sitemaps = doc.querySelectorAll('sitemap > loc');
  if (sitemaps.length > 0) {
    sitemaps.forEach((loc) => {
      const url = loc.textContent?.trim();
      if (url) sitemapUrls.push(url);
    });
    return { urls, sitemapUrls };
  }

  // Extract page URLs
  const locs = doc.querySelectorAll('url > loc');
  locs.forEach((loc) => {
    const url = loc.textContent?.trim();
    if (url) urls.push(url);
  });

  return { urls, sitemapUrls };
}

// ── Message listener ─────────────────────────────────────────

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'HTML_TO_MARKDOWN') {
    try {
      const result = htmlToMarkdown(msg.html);
      sendResponse({ success: true, ...result });
    } catch (err) {
      console.error('[offscreen] htmlToMarkdown error:', err);
      sendResponse({ success: false, error: String(err) });
    }
    return true;
  }

  if (msg.type === 'PARSE_RSS_XML') {
    try {
      const items = parseRssXml(msg.xml);
      sendResponse({ success: true, items });
    } catch (err) {
      console.error('[offscreen] parseRssXml error:', err);
      sendResponse({ success: false, error: String(err) });
    }
    return true;
  }

  if (msg.type === 'PARSE_SITEMAP_XML') {
    try {
      const result = parseSitemapXml(msg.xml);
      sendResponse({ success: true, ...result });
    } catch (err) {
      console.error('[offscreen] parseSitemapXml error:', err);
      sendResponse({ success: false, error: String(err) });
    }
    return true;
  }
});

console.log('[offscreen] Ready');
