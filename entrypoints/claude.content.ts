// Content script for extracting Claude conversations
// Updated: 2026-02-22 — adapted to current Claude UI
import type { ClaudeConversation, ClaudeMessage, QAPair } from '@/lib/types';

export default defineContentScript({
  matches: ['https://claude.ai/*'],
  runAt: 'document_idle',

  main() {
    console.log('Claude conversation extractor loaded');

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'EXTRACT_CONVERSATION') {
        extractConversation()
          .then((data) => sendResponse({ success: true, data }))
          .catch((error) => {
            console.error('Extraction error:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : '提取失败',
            });
          });
        return true;
      }
    });
  },
});

async function extractConversation(): Promise<ClaudeConversation> {
  const title = extractTitle();
  const messages = extractMessages();

  if (messages.length === 0) {
    throw new Error('未找到对话消息，请确保在 Claude 对话页面');
  }

  // Group messages into Q&A pairs
  const pairs = groupIntoPairs(messages);

  return {
    id: extractConversationId(),
    title,
    url: window.location.href,
    messages,
    pairs,
    extractedAt: Date.now(),
  };
}

function groupIntoPairs(messages: ClaudeMessage[]): QAPair[] {
  const pairs: QAPair[] = [];
  let i = 0;
  while (i < messages.length) {
    const question = messages[i].role === 'human' ? messages[i].content : '';
    const qTimestamp = messages[i].role === 'human' ? messages[i].timestamp : undefined;
    if (messages[i].role === 'human') i++;

    const answer = i < messages.length && messages[i].role === 'assistant' ? messages[i].content : '';
    const aTimestamp = i < messages.length && messages[i].role === 'assistant' ? messages[i].timestamp : undefined;
    if (i < messages.length && messages[i].role === 'assistant') i++;

    if (question || answer) {
      pairs.push({
        id: `pair-${pairs.length}`,
        question,
        answer,
        questionTimestamp: qTimestamp,
        answerTimestamp: aTimestamp,
      });
    }
  }
  return pairs;
}

function extractConversationId(): string {
  const match = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/);
  return match ? match[1] : `claude-${Date.now()}`;
}

function extractTitle(): string {
  // Claude page title format: "Title - Claude"
  const pageTitle = document.title;
  if (pageTitle && pageTitle.includes(' - Claude')) {
    return pageTitle.replace(/ - Claude$/, '');
  }
  if (pageTitle && !pageTitle.includes('Claude')) {
    return pageTitle;
  }
  return 'Claude 对话';
}

function extractMessages(): ClaudeMessage[] {
  const messages: ClaudeMessage[] = [];

  // Direct approach: match user messages and Claude responses by precise selectors
  const userEls = document.querySelectorAll('[data-testid="user-message"]');
  const claudeEls = document.querySelectorAll('div.font-claude-response');

  const maxLen = Math.max(userEls.length, claudeEls.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < userEls.length) {
      const text = userEls[i].textContent?.trim();
      if (text) {
        messages.push({ id: `msg-${messages.length}`, role: 'human', content: text });
      }
    }
    if (i < claudeEls.length) {
      const text = cleanText(claudeEls[i]);
      if (text) {
        messages.push({ id: `msg-${messages.length}`, role: 'assistant', content: text });
      }
    }
  }

  // Fallback to old approach if direct selectors fail
  if (messages.length === 0) {
    return extractMessagesFallback();
  }

  return messages;
}

function findMessageContainer(): Element | null {
  // Look for the main content column that holds message turns
  // Claude uses: .flex-1.flex.flex-col.px-4.max-w-3xl.mx-auto.w-full
  const selectors = [
    '.max-w-3xl.mx-auto.w-full',
    '.flex-1.flex.flex-col.max-w-3xl',
    '[class*="max-w-3xl"][class*="mx-auto"]',
  ];

  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el && el.children.length >= 2) {
        // Verify it contains message elements
        const hasUser = !!el.querySelector('[data-testid="user-message"]');
        const hasClaude = !!el.querySelector('[class*="font-claude-response"]');
        if (hasUser || hasClaude) return el;
      }
    } catch {
      // Invalid selector
    }
  }

  return null;
}

function extractContentFromElement(
  container: Element,
  role: 'human' | 'assistant'
): string | null {
  if (role === 'human') {
    // User messages: find data-testid="user-message" or class containing font-user-message
    const userEl =
      container.querySelector('[data-testid="user-message"]') ||
      container.querySelector('[class*="font-user-message"]');
    if (userEl) {
      return cleanText(userEl);
    }
  } else {
    // Claude responses: find the element with font-claude-response class
    // Get the parent container that holds all response paragraphs
    const responseEls = container.querySelectorAll('[class*="font-claude-response"]');
    if (responseEls.length > 0) {
      // If there's a single container with this class, use it
      if (responseEls.length === 1) {
        return cleanText(responseEls[0]);
      }
      // Multiple elements — they might be individual paragraphs
      // Find their common parent
      const firstEl = responseEls[0];
      const parent = firstEl.closest('[class*="group"]') || firstEl.parentElement;
      if (parent) {
        return cleanText(parent);
      }
      // Fallback: concatenate all
      return Array.from(responseEls)
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .join('\n\n');
    }
  }

  // Final fallback
  const text = container.textContent?.trim();
  return text && text.length > 0 ? text : null;
}

function extractTimestampFromElement(container: Element): string | undefined {
  // Look for time elements
  const timeEl = container.querySelector('time, [datetime]');
  if (timeEl) {
    return (
      timeEl.getAttribute('datetime') || timeEl.textContent?.trim() || undefined
    );
  }

  // Look for timestamp-like text (e.g., "9:43 AM")
  const text = container.textContent || '';
  const timeMatch = text.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i);
  if (timeMatch) {
    return timeMatch[0];
  }

  return undefined;
}

function extractMessagesFallback(): ClaudeMessage[] {
  const messages: ClaudeMessage[] = [];

  // Fallback: find all user messages and claude responses independently
  const userEls = document.querySelectorAll(
    '[data-testid="user-message"], [class*="font-user-message"]'
  );
  const claudeEls = document.querySelectorAll('[class*="font-claude-response"]');

  // Collect unique claude response containers
  const claudeContainers: Element[] = [];
  const seen = new Set<Element>();
  for (const el of claudeEls) {
    // Find the top-level response container to avoid duplicates
    const container =
      el.closest('[class*="group relative"]') || el.parentElement;
    if (container && !seen.has(container)) {
      seen.add(container);
      claudeContainers.push(container);
    }
  }

  // Interleave: assume alternating user/assistant
  const maxLen = Math.max(userEls.length, claudeContainers.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < userEls.length) {
      const text = userEls[i].textContent?.trim();
      if (text) {
        messages.push({
          id: `msg-${messages.length}`,
          role: 'human',
          content: text,
        });
      }
    }
    if (i < claudeContainers.length) {
      const text = cleanText(claudeContainers[i]);
      if (text) {
        messages.push({
          id: `msg-${messages.length}`,
          role: 'assistant',
          content: text,
        });
      }
    }
  }

  return messages;
}

// Returns cleaned innerHTML for the message — preserves block structure
// (paragraphs, lists, blockquotes, code blocks, bold/italic) so the background
// can run it through Turndown for faithful Markdown.
function cleanText(element: Element): string {
  const clone = element.cloneNode(true) as Element;

  clone
    .querySelectorAll('button, [role="button"], svg, [class*="sr-only"]')
    .forEach((el) => el.remove());

  return (clone.innerHTML || '').trim();
}
