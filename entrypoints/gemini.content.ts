// Content script for extracting Gemini conversations
import type { ClaudeConversation, ClaudeMessage, QAPair } from '@/lib/types';

export default defineContentScript({
  matches: ['https://gemini.google.com/*'],
  runAt: 'document_idle',

  main() {
    console.log('Gemini conversation extractor loaded');

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'EXTRACT_CONVERSATION') {
        extractConversation()
          .then((data) => sendResponse({ success: true, data }))
          .catch((error) => {
            console.error('Gemini extraction error:', error);
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
  const pairs = extractQAPairs();
  const messages = extractMessages();

  if (pairs.length === 0 && messages.length === 0) {
    throw new Error('未找到对话消息，请确保在 Gemini 对话页面');
  }

  return {
    id: extractConversationId(),
    title,
    url: window.location.href,
    messages,
    pairs,
    extractedAt: Date.now(),
  };
}

function extractConversationId(): string {
  const match = window.location.pathname.match(/\/app\/([a-f0-9]+)/);
  return match ? match[1] : `gemini-${Date.now()}`;
}

function extractTitle(): string {
  // Gemini shows conversation title in header
  const titleEl = document.querySelector('.conversation-title-container, [class*="conversation-title"]');
  if (titleEl?.textContent?.trim()) {
    return titleEl.textContent.trim();
  }

  const pageTitle = document.title;
  if (pageTitle && pageTitle !== 'Google Gemini' && !pageTitle.startsWith('Gemini')) {
    return pageTitle.replace(/ - Google Gemini$/, '');
  }

  // Fallback: first user message
  const firstQuery = document.querySelector('.query-text');
  if (firstQuery) {
    const text = firstQuery.textContent?.trim() || '';
    return text.length > 60 ? text.slice(0, 60) + '...' : text;
  }

  return 'Gemini 对话';
}

function extractQAPairs(): QAPair[] {
  const pairs: QAPair[] = [];

  // Each .conversation-container holds one Q&A pair (USER-QUERY + MODEL-RESPONSE)
  const containers = document.querySelectorAll('.conversation-container');

  for (const container of containers) {
    const queryEl = container.querySelector('.query-text');
    const responseEl = container.querySelector('.model-response-text');

    const question = queryEl?.textContent?.trim() || '';
    const answer = responseEl ? cleanText(responseEl) : '';

    if (question || answer) {
      pairs.push({
        id: `pair-${pairs.length}`,
        question,
        answer,
      });
    }
  }

  return pairs;
}

function extractMessages(): ClaudeMessage[] {
  const messages: ClaudeMessage[] = [];

  // Gemini uses conversation turns with user queries and model responses
  // Try multiple selectors for different Gemini UI versions

  // Strategy 1: precise Gemini selectors (.query-text for user, .model-response-text for AI)
  const queryEls = document.querySelectorAll('.query-text');
  const responseEls = document.querySelectorAll('.model-response-text');

  if (queryEls.length > 0 || responseEls.length > 0) {
    const maxLen = Math.max(queryEls.length, responseEls.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < queryEls.length) {
        const text = queryEls[i].textContent?.trim();
        if (text) {
          messages.push({
            id: `msg-${messages.length}`,
            role: 'human',
            content: text,
          });
        }
      }
      if (i < responseEls.length) {
        const text = cleanText(responseEls[i]);
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

  // Strategy 2: fallback with broader selectors
  const queryFallback = document.querySelectorAll('[class*="query-content"], .user-query');
  const responseFallback = document.querySelectorAll('.markdown-main-panel, [class*="response-content"]');

  if (queryFallback.length > 0 || responseFallback.length > 0) {
    const maxLen = Math.max(queryFallback.length, responseFallback.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < queryFallback.length) {
        const text = queryFallback[i].textContent?.trim();
        if (text) {
          messages.push({
            id: `msg-${messages.length}`,
            role: 'human',
            content: text,
          });
        }
      }
      if (i < responseFallback.length) {
        const text = cleanText(responseFallback[i]);
        if (text) {
          messages.push({
            id: `msg-${messages.length}`,
            role: 'assistant',
            content: text,
          });
        }
      }
    }
  }

  return messages;
}

// Returns cleaned innerHTML so background can Turndown it into faithful Markdown.
function cleanText(element: Element): string {
  const clone = element.cloneNode(true) as Element;

  clone
    .querySelectorAll('button, [role="button"], svg, [class*="sr-only"], .chip-container, .action-buttons, [class*="thought"], [class*="thinking-header"]')
    .forEach((el) => el.remove());

  return (clone.innerHTML || '').trim();
}
