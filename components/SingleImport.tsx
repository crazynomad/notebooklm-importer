import { useState, useEffect } from 'react';
import { Link, Loader2, CheckCircle, AlertCircle, ExternalLink, FileText } from 'lucide-react';
import type { ImportProgress } from '@/lib/types';
import { isValidUrl } from '@/lib/utils';
import { t } from '@/lib/i18n';

interface Props {
  onProgress: (progress: ImportProgress | null) => void;
}

type ImportState = 'idle' | 'loading' | 'importing' | 'capturing' | 'success' | 'error';

export function SingleImport({ onProgress }: Props) {
  const [url, setUrl] = useState('');
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null);
  const [state, setState] = useState<ImportState>('idle');
  const [error, setError] = useState('');

  // Load current tab URL on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB' }, (response) => {
      if (response?.success && response.data) {
        setCurrentTabUrl(response.data as string);
      }
    });
  }, []);

  const handleImport = async (targetUrl: string) => {
    if (!isValidUrl(targetUrl)) {
      setError(t('invalidUrl'));
      setState('error');
      return;
    }

    setState('importing');
    setError('');

    onProgress({
      total: 1,
      completed: 0,
      items: [{ url: targetUrl, status: 'importing' }],
    });

    chrome.runtime.sendMessage({ type: 'IMPORT_URL', url: targetUrl }, (response) => {
      onProgress(null);

      if (response?.success && response.data) {
        setState('success');
        setTimeout(() => setState('idle'), 3000);
      } else {
        setState('error');
        setError(response?.error || t('single.importFailedHint'));
      }
    });
  };

  const handleImportCurrentTab = () => {
    if (currentTabUrl) {
      setUrl(currentTabUrl);
      handleImport(currentTabUrl);
    }
  };

  const handleCaptureContent = () => {
    setState('capturing');
    setError('');

    chrome.runtime.sendMessage({ type: 'CAPTURE_PAGE_CONTENT' }, (response) => {
      if (response?.success) {
        setState('success');
        setTimeout(() => setState('idle'), 3000);
      } else {
        setState('error');
        setError(response?.error || t('single.captureFailedHint'));
      }
    });
  };

  const isCapturableUrl = currentTabUrl?.startsWith('http');
  const isBusy = state === 'importing' || state === 'capturing';

  return (
    <div className="space-y-4">
      {/* Current tab quick import */}
      {currentTabUrl && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-2">{t('single.currentTab')}</p>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-gray-700 truncate">{currentTabUrl}</span>
            <button
              onClick={handleImportCurrentTab}
              disabled={isBusy}
              className="px-3 py-1.5 bg-notebooklm-blue text-white text-xs rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {state === 'importing' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ExternalLink className="w-3 h-3" />
              )}
              {t('import')}
            </button>
            <button
              onClick={handleCaptureContent}
              disabled={isBusy || !isCapturableUrl}
              title={!isCapturableUrl ? t('single.captureNotSupported') : t('single.captureAuthHint')}
              className="px-3 py-1.5 bg-gray-600 text-white text-xs rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {state === 'capturing' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <FileText className="w-3 h-3" />
              )}
              {t('single.captureContent')}
            </button>
          </div>
        </div>
      )}

      {/* Manual URL input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{t('single.enterUrl')}</label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-notebooklm-blue focus:border-transparent"
            />
          </div>
          <button
            onClick={() => handleImport(url)}
            disabled={!url || isBusy}
            className="px-4 py-2 bg-notebooklm-blue text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {state === 'importing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('single.importingBtn')}
              </>
            ) : (
              t('import')
            )}
          </button>
        </div>
      </div>

      {/* Status messages */}
      {state === 'success' && (
        <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 rounded-lg p-3">
          <CheckCircle className="w-4 h-4" />
          {t('importSuccess')}
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Tips */}
      <div className="text-xs text-gray-400 space-y-1">
        <p>{t('single.supportedImports')}</p>
        <ul className="list-disc list-inside space-y-0.5 text-gray-400">
          <li>{t('single.webArticles')}</li>
          <li>{t('single.substackWechat')}</li>
          <li>{t('single.pdfLinks')}</li>
          <li>{t('single.captureAuthHint')}</li>
        </ul>
      </div>
    </div>
  );
}
