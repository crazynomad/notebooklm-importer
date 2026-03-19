import { useState } from 'react';
import {
  Rss,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ExternalLink,
  Youtube,
  Github,
  Heart,
  Info,
  HelpCircle,
} from 'lucide-react';
import type { ImportProgress, ImportItem, RssFeedItem } from '@/lib/types';
import { t } from '@/lib/i18n';
import { resetOnboarding } from '@/components/OnboardingTour';

interface Props {
  onProgress: (progress: ImportProgress | null) => void;
}

type ImportState = 'idle' | 'loading' | 'importing' | 'success' | 'error';

export function MorePanel({ onProgress }: Props) {
  const [rssUrl, setRssUrl] = useState('');
  const [rssArticles, setRssArticles] = useState<RssFeedItem[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [state, setState] = useState<ImportState>('idle');
  const [error, setError] = useState('');
  const [importResults, setImportResults] = useState<ImportItem[] | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showRss, setShowRss] = useState(false);

  const resetState = () => {
    setState('idle');
    setError('');
    setImportResults(null);
  };

  // ── RSS ──
  const handleRssLoad = () => {
    if (!rssUrl) { setError(t('more.enterRssLink')); setState('error'); return; }
    setState('loading');
    setError('');
    setRssArticles([]);

    chrome.runtime.sendMessage({ type: 'PARSE_RSS', rssUrl }, (response) => {
      if (response?.success && Array.isArray(response.data)) {
        const items = response.data as RssFeedItem[];
        setRssArticles(items);
        setSelectedArticles(new Set(items.map((a) => a.url)));
        setState('idle');
      } else {
        setState('error');
        setError(response?.error || t('more.rssFailed'));
      }
    });
  };

  const handleBatchImport = (urls: string[]) => {
    setState('importing');
    setError('');
    setImportResults(null);

    const items: ImportItem[] = urls.map((u) => ({ url: u, status: 'pending' as const }));
    onProgress({ total: urls.length, completed: 0, items });

    chrome.runtime.sendMessage(
      { type: 'RESCUE_SOURCES', urls },
      (response) => {
        onProgress(null);
        if (response?.success && Array.isArray(response.data)) {
          setImportResults(response.data);
          setState('success');
        } else {
          setState('error');
          setError(response?.error || t('importFailed'));
        }
      }
    );
  };

  const handleRssImport = () => {
    const urls = rssArticles.filter((a) => selectedArticles.has(a.url)).map((a) => a.url);
    if (urls.length === 0) { setError(t('selectAtLeastOneArticle')); setState('error'); return; }
    handleBatchImport(urls);
  };

  const handleRetryFailed = () => {
    if (!importResults) return;
    const failedUrls = importResults.filter((i) => i.status === 'error').map((i) => i.url);
    if (failedUrls.length > 0) handleBatchImport(failedUrls);
  };

  const successCount = importResults?.filter((i) => i.status === 'success').length || 0;
  const failedCount = importResults?.filter((i) => i.status === 'error').length || 0;

  return (
    <div className="space-y-4">
      {/* RSS Import — collapsible section */}
      <div className="border border-border rounded-lg overflow-hidden shadow-soft">
        <button
          onClick={() => { setShowRss(!showRss); resetState(); }}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-surface-sunken hover:bg-gray-100/80 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Rss className="w-4 h-4 text-orange-500" />
            {t('more.rssImport')}
          </div>
          {showRss ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showRss && (
          <div className="p-3 space-y-3 border-t border-gray-200">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Rss className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="url"
                  value={rssUrl}
                  onChange={(e) => setRssUrl(e.target.value)}
                  placeholder="https://example.com/feed.xml"
                  className="w-full pl-10 pr-3 py-2 border border-gray-200/60 rounded-lg text-sm placeholder:text-gray-400/70 focus:outline-none focus:ring-2 focus:ring-notebooklm-blue/40 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleRssLoad}
                disabled={!rssUrl || state === 'loading'}
                className="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-500/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-btn hover:shadow-btn-hover transition-all duration-150 btn-press"
              >
                {state === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {t('load')}
              </button>
            </div>

            {rssArticles.length > 0 && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">{t('more.selectedArticles', { selected: selectedArticles.size, total: rssArticles.length })}</span>
                    <div className="flex gap-2 text-xs">
                      <button onClick={() => setSelectedArticles(new Set(rssArticles.map((a) => a.url)))} className="text-notebooklm-blue hover:underline">{t('selectAll')}</button>
                      <button onClick={() => setSelectedArticles(new Set())} className="text-gray-400 hover:underline">{t('deselectAll')}</button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-border-strong rounded-lg shadow-soft">
                    {rssArticles.map((article) => (
                      <label key={article.url} className="flex items-start gap-3 p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0">
                        <input
                          type="checkbox"
                          checked={selectedArticles.has(article.url)}
                          onChange={() => {
                            setSelectedArticles((prev) => {
                              const next = new Set(prev);
                              if (next.has(article.url)) next.delete(article.url);
                              else next.add(article.url);
                              return next;
                            });
                          }}
                          className="mt-1 rounded border-gray-300 text-notebooklm-blue focus:ring-notebooklm-blue"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 line-clamp-2">{article.title}</p>
                          {article.pubDate && <p className="text-xs text-gray-400 mt-0.5">{new Date(article.pubDate).toLocaleDateString(undefined)}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleRssImport}
                  disabled={selectedArticles.size === 0 || state === 'importing'}
                  className="w-full py-2.5 bg-notebooklm-blue text-white text-sm rounded-lg hover:bg-notebooklm-blue/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-btn hover:shadow-btn-hover transition-all duration-150 btn-press"
                >
                  {state === 'importing' ? <><Loader2 className="w-4 h-4 animate-spin" />{t('importing')}</> : <><Rss className="w-4 h-4" />{t('more.importSelected')} (<span className="font-mono tabular-nums">{selectedArticles.size}</span>)</>}
                </button>
              </>
            )}

            {rssArticles.length === 0 && state === 'idle' && (
              <div className="bg-surface-sunken rounded-lg p-3">
                <p className="text-xs text-gray-400">{t('more.rssFormats')}</p>
              </div>
            )}

            {state === 'error' && !importResults && (
              <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-lg p-3 shadow-soft border border-red-100/60">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Import Results */}
      {importResults && importResults.length > 0 && (
        <div className="space-y-2">
          <div className={`flex items-center justify-between text-sm rounded-lg p-3 shadow-soft ${failedCount > 0 ? 'bg-yellow-50 border border-yellow-100/60' : 'bg-green-50 border border-green-100/60'}`}>
            <div className="flex items-center gap-2">
              {failedCount > 0 ? <AlertCircle className="w-4 h-4 text-yellow-600" /> : <CheckCircle className="w-4 h-4 text-green-600" />}
              <span className={failedCount > 0 ? 'text-yellow-700' : 'text-green-600'}>
                {failedCount > 0 ? t('successFailCount', { success: successCount, failed: failedCount }) : t('successCount', { success: successCount })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {failedCount > 0 && (
                <button onClick={handleRetryFailed} disabled={state === 'importing'} className="text-xs text-yellow-700 hover:text-yellow-800 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" />{t('retryFailed')}
                </button>
              )}
              <button onClick={() => setShowDetails(!showDetails)} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                {showDetails ? <><ChevronUp className="w-3 h-3" />{t('collapse')}</> : <><ChevronDown className="w-3 h-3" />{t('details')}</>}
              </button>
            </div>
          </div>
          {showDetails && (
            <div className="max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-gray-100">
              {importResults.map((item, index) => (
                <div key={index} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50">
                  {item.status === 'success'
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    : <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                  <span className="flex-1 truncate text-gray-600" title={item.url}>{item.url}</span>
                  {item.status === 'error' && (
                    <button onClick={() => handleBatchImport([item.url])} disabled={state === 'importing'} className="text-gray-400 hover:text-notebooklm-blue flex-shrink-0" title={t('retry')}>
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Replay Tour */}
      <button
        onClick={async () => {
          await resetOnboarding();
          window.location.reload();
        }}
        className="w-full flex items-center gap-3 p-2.5 bg-blue-50/60 border border-blue-100/40 rounded-xl hover:bg-blue-100/80 transition-colors group"
      >
        <div className="w-8 h-8 bg-notebooklm-blue rounded-lg flex items-center justify-center flex-shrink-0">
          <HelpCircle className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-gray-800 group-hover:text-notebooklm-blue">{t('onboarding.replayTour')}</p>
          <p className="text-xs text-gray-500">{t('onboarding.replayTourDesc')}</p>
        </div>
      </button>

      {/* About Section */}
      <div className="border border-border rounded-lg overflow-hidden shadow-soft">
        <div className="px-3 py-2.5 bg-surface-sunken">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Info className="w-4 h-4 text-blue-500" />
            {t('more.about')}
          </div>
        </div>
        <div className="p-3 space-y-3">
          {/* YouTube Channel */}
          <a
            href="https://www.youtube.com/@greentrainpodcast"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-2.5 bg-red-50/60 border border-red-100/40 rounded-xl hover:bg-red-100/80 transition-colors group"
          >
            <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Youtube className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 group-hover:text-red-700">{t('more.ytChannel')}</p>
              <p className="text-xs text-gray-500">{t('more.ytDesc')}</p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500 flex-shrink-0" />
          </a>

          {/* GitHub */}
          <a
            href="https://github.com/crazynomad/notebooklm-jetpack"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-2.5 bg-gray-100/60 border border-gray-200/40 rounded-xl hover:bg-gray-200/80 transition-colors group"
          >
            <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <Github className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 group-hover:text-gray-900">crazynomad/notebooklm-jetpack</p>
              <p className="text-xs text-gray-500">{t('more.ghDesc')} ⭐</p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
          </a>

          {/* Version & Copyright */}
          <div className="pt-2.5 border-t border-gray-100 text-center space-y-1.5">
            <p className="text-xs text-gray-400 font-mono tabular-nums">
              v{__VERSION__}+{__GIT_HASH__}
            </p>
            <a
              href="https://www.youtube.com/@greentrainpodcast"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 flex items-center justify-center gap-1 hover:text-red-500 transition-colors"
            >
              Made with <Heart className="w-3 h-3 text-red-400 inline" /> by {t('more.madeBy')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
