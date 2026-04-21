// Content script for extracting ChatGPT conversations
import type { ClaudeConversation, ClaudeMessage, QAPair } from '@/lib/types';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  runAt: 'document_idle',

  main() {
    console.log('ChatGPT conversation extractor loaded');

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'EXTRACT_CONVERSATION') {
        extractConversation()
          .then((data) => sendResponse({ success: true, data }))
          .catch((error) => {
            console.error('ChatGPT extraction error:', error);
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
    throw new Error('未找到对话消息，请确保在 ChatGPT 对话页面');
  }

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
    if (messages[i].role === 'human') i++;
    const answer = i < messages.length && messages[i].role === 'assistant' ? messages[i].content : '';
    if (i < messages.length && messages[i].role === 'assistant') i++;
    if (question || answer) {
      pairs.push({ id: `pair-${pairs.length}`, question, answer });
    }
  }
  return pairs;
}

function extractConversationId(): string {
  const match = window.location.pathname.match(/\/c\/([a-f0-9-]+)/);
  return match ? match[1] : `chatgpt-${Date.now()}`;
}

function extractTitle(): string {
  // ChatGPT page title format: "Title" or "ChatGPT"
  const pageTitle = document.title;
  if (pageTitle && pageTitle !== 'ChatGPT' && pageTitle !== 'New chat') {
    return pageTitle;
  }

  // Fallback: first user message
  const firstUser = document.querySelector('[data-message-author-role="user"]');
  if (firstUser) {
    const text = firstUser.textContent?.trim() || '';
    return text.length > 60 ? text.slice(0, 60) + '...' : text;
  }

  return 'ChatGPT 对话';
}

function extractMessages(): ClaudeMessage[] {
  const messages: ClaudeMessage[] = [];

  // ChatGPT uses data-message-author-role attribute on message containers
  const messageEls = document.querySelectorAll('[data-message-author-role]');

  if (messageEls.length > 0) {
    for (const el of messageEls) {
      const role = el.getAttribute('data-message-author-role');
      if (role !== 'user' && role !== 'assistant') continue;

      const text = cleanText(el);
      if (text) {
        messages.push({
          id: `msg-${messages.length}`,
          role: role === 'user' ? 'human' : 'assistant',
          content: text,
        });
      }
    }
    return messages;
  }

  // Fallback: look for turn containers
  const turns = document.querySelectorAll('[class*="group"][class*="text-token"]');
  for (const turn of turns) {
    const isUser = turn.querySelector('[data-message-author-role="user"]') !== null
      || turn.classList.toString().includes('user');
    const text = cleanText(turn);
    if (text) {
      messages.push({
        id: `msg-${messages.length}`,
        role: isUser ? 'human' : 'assistant',
        content: text,
      });
    }
  }

  return messages;
}

// Returns cleaned innerHTML so background can Turndown it into faithful Markdown
// (paragraphs, lists, code blocks, bold/italic preserved).
function cleanText(element: Element): string {
  const clone = element.cloneNode(true) as Element;

  clone
    .querySelectorAll('button, [role="button"], svg, [class*="sr-only"], [class*="agent-turn-action"]')
    .forEach((el) => el.remove());

  return (clone.innerHTML || '').trim();
}
