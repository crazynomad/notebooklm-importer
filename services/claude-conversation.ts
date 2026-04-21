import type { ClaudeConversation, ClaudeMessage } from '@/lib/types';
import { ensureOffscreen, sendOffscreenMessage } from '@/services/offscreen';

// Extract Claude conversation from current tab.
// Content scripts return raw HTML fragments per message; we batch-convert them
// to Markdown via the offscreen Turndown so structural formatting (paragraphs,
// lists, blockquotes, bold) survives into both NotebookLM import and the
// share-card renderer.
export async function extractClaudeConversation(
  tabId: number
): Promise<ClaudeConversation> {
  const raw = await new Promise<ClaudeConversation>((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'EXTRACT_CONVERSATION' },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || '提取对话失败'));
          return;
        }
        resolve(response.data as ClaudeConversation);
      }
    );
  });

  return await convertConversationContent(raw);
}

async function convertConversationContent(
  conv: ClaudeConversation
): Promise<ClaudeConversation> {
  // Collect every HTML payload across messages and pairs into a flat array,
  // remember each slot's location, batch-convert, then write back.
  type Slot = { kind: 'msg' | 'q' | 'a'; index: number };
  const htmls: string[] = [];
  const slots: Slot[] = [];

  conv.messages.forEach((m, i) => {
    htmls.push(m.content || '');
    slots.push({ kind: 'msg', index: i });
  });
  (conv.pairs || []).forEach((p, i) => {
    htmls.push(p.question || '');
    slots.push({ kind: 'q', index: i });
    htmls.push(p.answer || '');
    slots.push({ kind: 'a', index: i });
  });

  if (htmls.length === 0) return conv;

  let markdowns: string[];
  try {
    await ensureOffscreen();
    const resp = await sendOffscreenMessage<{ success: true; markdowns: string[] }>({
      type: 'CONVERT_HTML_BATCH',
      htmls,
    });
    markdowns = resp.markdowns;
  } catch (err) {
    console.warn('[claude-conversation] HTML→MD conversion failed, falling back to raw:', err);
    return conv;
  }

  const pairs = conv.pairs ? conv.pairs.map((p) => ({ ...p })) : undefined;
  const messages = conv.messages.map((m) => ({ ...m }));

  slots.forEach((slot, k) => {
    const md = markdowns[k] ?? '';
    if (slot.kind === 'msg') messages[slot.index].content = md;
    else if (pairs && slot.kind === 'q') pairs[slot.index].question = md;
    else if (pairs && slot.kind === 'a') pairs[slot.index].answer = md;
  });

  return { ...conv, messages, pairs };
}

// Format selected messages for import to NotebookLM
export function formatConversationForImport(
  conversation: ClaudeConversation,
  selectedMessageIds: string[]
): string {
  const selectedMessages = conversation.messages.filter((msg) =>
    selectedMessageIds.includes(msg.id)
  );

  if (selectedMessages.length === 0) {
    throw new Error('未选择任何消息');
  }

  const lines: string[] = [];

  // Detect platform from URL
  const platform = conversation.url.includes('chatgpt.com') || conversation.url.includes('chat.openai.com')
    ? 'ChatGPT'
    : conversation.url.includes('gemini.google.com')
      ? 'Gemini'
      : 'Claude';

  // Header
  lines.push(`# ${conversation.title}`);
  lines.push('');
  lines.push(`**来源**: ${platform} 对话`);
  lines.push(`**URL**: ${conversation.url}`);
  lines.push(
    `**提取时间**: ${new Date(conversation.extractedAt).toLocaleString('zh-CN')}`
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  // Messages
  for (const message of selectedMessages) {
    const assistantLabel = platform === 'ChatGPT' ? 'ChatGPT' : platform === 'Gemini' ? 'Gemini' : 'Claude';
    const roleLabel = message.role === 'human' ? '👤 Human' : `🤖 ${assistantLabel}`;
    lines.push(`## ${roleLabel}`);
    if (message.timestamp) {
      lines.push(`*${message.timestamp}*`);
    }
    lines.push('');
    lines.push(message.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
