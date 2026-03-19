import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { BookOpen, History, MessageCircle, Headphones, MoreHorizontal, Bookmark } from 'lucide-react';
import type { ImportProgress } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { DocsImport } from '@/components/DocsImport';
import { PodcastImport } from '@/components/PodcastImport';
import { ClaudeImport } from '@/components/ClaudeImport';
import { MorePanel } from '@/components/MorePanel';
import { BookmarkPanel } from '@/components/BookmarkPanel';
import { HistoryPanel } from '@/components/HistoryPanel';
import { RescueBanner } from '@/components/RescueBanner';
import { NotebookSelector } from '@/components/NotebookSelector';
import { OnboardingTour } from '@/components/OnboardingTour';

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('bookmark');
  const [initialPodcastUrl, setInitialPodcastUrl] = useState('');
  const [notebookLMTabId, setNotebookLMTabId] = useState<number | null>(null);

  // Auto-detect URL from current tab
  useState(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url || '';
      const tabId = tabs[0]?.id;
      if (/podcasts\.apple\.com\//.test(url) || /xiaoyuzhoufm\.com\/(episode|podcast)\//.test(url)) {
        setActiveTab('podcast');
        setInitialPodcastUrl(url);
      } else if (/claude\.ai\/|chatgpt\.com\/|chat\.openai\.com\/|gemini\.google\.com\//.test(url)) {
        setActiveTab('claude');
      }
      if (/notebooklm\.google\.com/.test(url) && tabId) {
        setNotebookLMTabId(tabId);
      }
    });
  });

  if (showHistory) {
    return <HistoryPanel onClose={() => setShowHistory(false)} />;
  }

  return (
    <div className="min-h-[480px] bg-surface">
      {/* Header — frosted glass */}
      <div className="glass px-3.5 py-2.5 border-b border-border flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <img src="/icons/icon-128.png" alt="NotebookLM Jetpack" className="w-7 h-7" />
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-[13px] text-gray-900 tracking-tight">NotebookLM Jetpack</span>
            <span className="font-mono text-[9px] text-gray-400/80 tabular-nums" title={`Build: ${__BUILD_TIME__}`}>v{__VERSION__}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
            className="px-1.5 py-1 text-[10px] font-medium text-gray-400 hover:text-notebooklm-blue hover:bg-notebooklm-light rounded-md transition-all duration-150 btn-press"
            title={locale === 'zh' ? 'Switch to English' : '切换到中文'}
          >
            {locale === 'zh' ? 'EN' : '中'}
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="p-1.5 text-gray-400 hover:text-notebooklm-blue hover:bg-notebooklm-light rounded-lg transition-all duration-150 btn-press"
            title={t('app.importHistory')}
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notebook selector — shows current connected notebook */}
      <div className="px-3.5 pt-3" data-tour="notebook-selector">
        <NotebookSelector />
      </div>

      {/* Progress indicator */}
      {importProgress && (
        <div className="px-4 py-2.5 bg-notebooklm-light/60 border-b border-notebooklm-blue/10">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-notebooklm-blue font-medium text-xs">
              {t('app.importingProgress', { completed: importProgress.completed, total: importProgress.total })}
            </span>
            {importProgress.current && (
              <span className="text-blue-400/70 truncate max-w-[200px] text-xs font-mono">
                {importProgress.current.url}
              </span>
            )}
          </div>
          <div className="w-full bg-notebooklm-blue/10 rounded-full h-1 overflow-hidden">
            <div
              className="bg-gradient-to-r from-notebooklm-blue to-blue-500 h-1 rounded-full transition-all duration-500 ease-spring relative"
              style={{
                width: `${(importProgress.completed / importProgress.total) * 100}%`,
              }}
            >
              <div className="absolute inset-0 progress-shimmer rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* Rescue banner — shown when on NotebookLM page */}
      {notebookLMTabId && <RescueBanner tabId={notebookLMTabId} />}

      {/* Tabs */}
      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
        <Tabs.List className="flex glass border-b border-border px-2 gap-0.5" data-tour="tab-list">
          {[
            { value: 'bookmark', icon: Bookmark, label: t('app.tabBookmarks') },
            { value: 'docs', icon: BookOpen, label: t('app.tabDocs') },
            { value: 'podcast', icon: Headphones, label: t('app.tabPodcast') },
            { value: 'claude', icon: MessageCircle, label: t('app.tabAI') },
            { value: 'more', icon: MoreHorizontal, label: t('app.tabMore') },
          ].map(({ value, icon: Icon, label }) => (
            <Tabs.Trigger
              key={value}
              value={value}
              data-tour={`tab-${value}`}
              className={cn(
                'flex-1 py-2 text-[11px] font-medium text-gray-400',
                'flex flex-col items-center gap-0.5 relative',
                'border-b-2 border-transparent',
                'hover:text-gray-500',
                'transition-all duration-200 ease-spring',
                'data-[state=active]:text-notebooklm-blue data-[state=active]:border-notebooklm-blue',
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="docs" className="p-4 animate-fade-in">
          <DocsImport onProgress={setImportProgress} />
        </Tabs.Content>

        <Tabs.Content value="podcast" className="p-4 animate-fade-in">
          <PodcastImport initialUrl={initialPodcastUrl} />
        </Tabs.Content>

        <Tabs.Content value="claude" className="p-4 animate-fade-in">
          <ClaudeImport onProgress={setImportProgress} />
        </Tabs.Content>

        <Tabs.Content value="bookmark" className="p-4 animate-fade-in">
          <BookmarkPanel onProgress={setImportProgress} />
        </Tabs.Content>

        <Tabs.Content value="more" className="p-4 animate-fade-in">
          <MorePanel onProgress={setImportProgress} />
        </Tabs.Content>
      </Tabs.Root>

      {/* First-time onboarding tour */}
      <OnboardingTour />
    </div>
  );
}
