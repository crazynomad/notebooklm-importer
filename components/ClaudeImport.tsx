import { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Share2,
} from 'lucide-react';
import type { ClaudeConversation, ImportProgress } from '@/lib/types';
import { t } from '@/lib/i18n';

interface Props {
  onProgress: (progress: ImportProgress | null) => void;
}

type ImportState = 'idle' | 'extracting' | 'ready' | 'importing' | 'success' | 'error';
type AIPlatform = 'claude' | 'chatgpt' | 'gemini' | null;

const PLATFORM_CONFIG: Record<string, { name: string; platform: AIPlatform; script: string; icon: string }> = {
  'claude.ai': { name: 'Claude', platform: 'claude', script: 'content-scripts/claude.js', icon: '🟤' },
  'chatgpt.com': { name: 'ChatGPT', platform: 'chatgpt', script: 'content-scripts/chatgpt.js', icon: '🟢' },
  'chat.openai.com': { name: 'ChatGPT', platform: 'chatgpt', script: 'content-scripts/chatgpt.js', icon: '🟢' },
  'gemini.google.com': { name: 'Gemini', platform: 'gemini', script: 'content-scripts/gemini.js', icon: '🔵' },
};

function detectPlatform(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return PLATFORM_CONFIG[hostname] || null;
  } catch {
    return null;
  }
}

// Lightweight markdown stripper for popup previews — pair.answer is now full
// Markdown, so symbols like **, ##, > would otherwise leak into the preview.
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ClaudeImport({ onProgress }: Props) {
  const [state, setState] = useState<ImportState>('idle');
  const [error, setError] = useState('');
  const [conversation, setConversation] = useState<ClaudeConversation | null>(null);
  const [selectedPairIds, setSelectedPairIds] = useState<Set<string>>(new Set());
  const [platformInfo, setPlatformInfo] = useState<ReturnType<typeof detectPlatform>>(null);
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);

  const [autoExtracted, setAutoExtracted] = useState(false);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.url) {
        const info = detectPlatform(tab.url);
        setPlatformInfo(info);
        setCurrentTabId(info ? (tab.id || null) : null);
      }
    });
  }, []);

  const handleExtract = useCallback(async () => {
    if (!currentTabId || !platformInfo) return;

    setState('extracting');
    setError('');

    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        files: [platformInfo.script],
      });
    } catch { /* already injected */ }

    await new Promise((resolve) => setTimeout(resolve, 300));

    chrome.runtime.sendMessage(
      { type: 'EXTRACT_CLAUDE_CONVERSATION', tabId: currentTabId },
      (response) => {
        if (response?.success && response.data) {
          const conv = response.data as ClaudeConversation;
          setConversation(conv);
          const pairs = conv.pairs || [];
          setSelectedPairIds(new Set(pairs.map((p) => p.id)));
          setState('ready');
        } else {
          setState('error');
          setError(response?.error || t('claude.extractFailed'));
        }
      }
    );
  }, [currentTabId, platformInfo]);

  // Auto-extract when on a specific conversation page (not homepage)
  useEffect(() => {
    if (!currentTabId || !platformInfo || autoExtracted || state !== 'idle') return;
    chrome.tabs.get(currentTabId, (tab) => {
      if (chrome.runtime.lastError || !tab?.url) return;
      const url = tab.url;
      const isConversationPage =
        /claude\.ai\/chat\/[a-f0-9-]+/.test(url) ||
        /chatgpt\.com\/c\//.test(url) ||
        /chat\.openai\.com\/c\//.test(url) ||
        /gemini\.google\.com\/app\/[a-f0-9]+/.test(url);
      if (isConversationPage) {
        setAutoExtracted(true);
        handleExtract();
      }
    });
  }, [currentTabId, platformInfo, autoExtracted, state, handleExtract]);

  const handleImport = async () => {
    if (!conversation) return;
    const pairs = conversation.pairs || [];
    const selected = pairs.filter((p) => selectedPairIds.has(p.id));
    if (selected.length === 0) return;

    setState('importing');
    setError('');

    onProgress({
      total: 1,
      completed: 0,
      items: [{ url: conversation.url, status: 'importing' }],
    });

    chrome.runtime.sendMessage(
      {
        type: 'IMPORT_CLAUDE_CONVERSATION',
        conversation: { ...conversation, pairs: selected },
        selectedMessageIds: [], // Not used in new flow
      },
      (response) => {
        onProgress(null);
        if (response?.success) {
          setState('success');
          setTimeout(() => setState('ready'), 3000);
        } else {
          setState('error');
          setError(response?.error || t('importFailed'));
        }
      }
    );
  };

  const togglePair = (id: string) => {
    setSelectedPairIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleShareCard = async () => {
    if (!conversation) return;
    const pairs = conversation.pairs || [];
    const selected = pairs.filter((p) => selectedPairIds.has(p.id));
    if (selected.length === 0) return;

    await chrome.storage.local.set({
      shareCardData: {
        pairs: selected,
        title: conversation.title,
        platform: platformInfo?.name || 'AI',
        platformIcon: platformInfo?.icon || '🤖',
        url: conversation.url,
      },
    });

    chrome.tabs.create({ url: chrome.runtime.getURL('/share-card.html') });
  };

  const pairs = conversation?.pairs || [];
  const allSelected = pairs.length > 0 && selectedPairIds.size === pairs.length;

  // Not on a supported AI platform — show onboarding guide
  if (!platformInfo) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50/60 border border-amber-200/40 rounded-xl p-4 shadow-soft text-center">
          <MessageCircle className="w-10 h-10 text-amber-500 opacity-80 mx-auto mb-2" />
          <p className="text-sm font-medium text-amber-700">{t('claude.openAiPage')}</p>
          <p className="text-xs text-amber-600/70 mt-1">{t('claude.supported')}</p>
        </div>
        <div className="bg-surface-sunken rounded-xl p-4 space-y-3">
          <p className="text-xs font-medium text-gray-600">{t('claude.guideTitle')}</p>
          <ol className="text-xs text-gray-500 space-y-2 list-none">
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-notebooklm-blue/10 text-notebooklm-blue text-[10px] font-semibold flex items-center justify-center flex-shrink-0">1</span>
              <span>{t('claude.guideStep1')}</span>
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-notebooklm-blue/10 text-notebooklm-blue text-[10px] font-semibold flex items-center justify-center flex-shrink-0">2</span>
              <span>{t('claude.guideStep2')}</span>
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-notebooklm-blue/10 text-notebooklm-blue text-[10px] font-semibold flex items-center justify-center flex-shrink-0">3</span>
              <span>{t('claude.guideStep3')}</span>
            </li>
            <li className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-notebooklm-blue/10 text-notebooklm-blue text-[10px] font-semibold flex items-center justify-center flex-shrink-0">4</span>
              <span>{t('claude.guideStep4')}</span>
            </li>
          </ol>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-[10px] text-gray-400">{t('claude.guideTip')}</p>
          </div>
        </div>
      </div>
    );
  }

  // Initial / extracting state
  if (state === 'idle' || state === 'extracting' || (state === 'error' && !conversation)) {
    return (
      <div className="space-y-4">
        <button
          onClick={handleExtract}
          disabled={state === 'extracting'}
          className="w-full py-3 bg-notebooklm-blue text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-btn hover:shadow-btn-hover transition-all duration-150 btn-press"
        >
          {state === 'extracting' ? (
            <><Loader2 className="w-4 h-4 animate-spin" />{t('claude.extracting')}</>
          ) : (
            <><MessageCircle className="w-4 h-4" />{t('claude.extractCurrent')}</>
          )}
        </button>

        {state === 'error' && (
          <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 border border-red-100/60 rounded-lg p-3 shadow-soft">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="text-xs text-gray-400 space-y-1 bg-surface-sunken rounded-xl p-3.5">
          <p>{t('claude.currentPlatform')}{platformInfo.icon} {platformInfo.name}</p>
          <p className="mt-1">{t('claude.instructions')}</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>{t('claude.step1', { platform: platformInfo.name })}</li>
            <li>{t('claude.step2')}</li>
            <li>{t('claude.step3')}</li>
            <li>{t('claude.step4')}</li>
          </ol>
        </div>
      </div>
    );
  }

  // Ready state — show Q&A pairs
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface-sunken rounded-xl p-3 shadow-soft">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-gray-900 truncate flex items-center gap-2">
            <span>{platformInfo.icon}</span>
            {conversation?.title}
          </h3>
          <button
            onClick={handleExtract}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
            title={t('claude.reExtract')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {t('claude.qaPairs', { total: pairs.length, selected: selectedPairIds.size })}
        </p>
      </div>

      {/* Selection controls */}
      <div className="flex gap-2">
        <button
          onClick={() => setSelectedPairIds(new Set(pairs.map((p) => p.id)))}
          disabled={allSelected}
          className="flex-1 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors duration-150 btn-press"
        >
          {t('selectAll')}
        </button>
        <button
          onClick={() => setSelectedPairIds(new Set())}
          disabled={selectedPairIds.size === 0}
          className="flex-1 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors duration-150 btn-press"
        >
          {t('deselectAll')}
        </button>
      </div>

      {/* Q&A pair list */}
      <div className="max-h-[240px] overflow-y-auto border border-border-strong rounded-lg shadow-soft">
        {pairs.map((pair, index) => (
          <label
            key={pair.id}
            className="flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100/80 last:border-b-0"
          >
            <input
              type="checkbox"
              checked={selectedPairIds.has(pair.id)}
              onChange={() => togglePair(pair.id)}
              className="mt-1 rounded border-gray-300 text-notebooklm-blue focus:ring-notebooklm-blue"
            />
            <div className="flex-1 min-w-0 space-y-1">
                <p className="text-xs text-gray-700 line-clamp-2">
                  <span className="text-xs font-mono tabular-nums text-gray-400 mr-1">#{index + 1}</span>
                  <span className="text-gray-400">Q：</span>
                  {pair.question || t('claude.noQuestion')}
                </p>
                <p className="text-xs text-gray-500 line-clamp-2">
                  <span className="text-gray-400">A：</span>
                  {stripMarkdown(pair.answer).slice(0, 100) || t('claude.noAnswer')}
                  {pair.answer.length > 100 && '...'}
                </p>
            </div>
          </label>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleImport}
          disabled={state === 'importing' || selectedPairIds.size === 0}
          className="flex-1 py-2.5 bg-notebooklm-blue text-white text-sm rounded-lg hover:bg-notebooklm-blue/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-btn hover:shadow-btn-hover transition-all duration-150 btn-press"
        >
          {state === 'importing' ? (
            <><Loader2 className="w-4 h-4 animate-spin" />{t('claude.importingBtn')}</>
          ) : (
            <>{t('claude.importSelected', { count: selectedPairIds.size })}</>
          )}
        </button>
        <button
          onClick={handleShareCard}
          disabled={state === 'importing' || selectedPairIds.size === 0}
          className="py-2.5 px-4 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-500/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-btn hover:shadow-btn-hover transition-all duration-150 btn-press"
          title={t('claude.shareCard')}
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* Status */}
      {state === 'success' && (
        <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 border border-green-100/60 rounded-lg p-3 shadow-soft">
          <CheckCircle className="w-4 h-4" />
          {t('importSuccess')}
        </div>
      )}
      {state === 'error' && (
        <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 border border-red-100/60 rounded-lg p-3 shadow-soft">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}