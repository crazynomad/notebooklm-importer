import { describe, it, expect, beforeEach } from 'vitest';

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
