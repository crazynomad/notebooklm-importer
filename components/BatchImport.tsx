import { useState } from 'react';
import {
  List,
  Loader2,
  CheckCircle,
  AlertCircle,
  LayoutGrid,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ImportProgress, ImportItem } from '@/lib/types';
import { isValidUrl } from '@/lib/utils';

interface Props {
  onProgress: (progress: ImportProgress | null) => void;
}

type ImportState = 'idle' | 'loading' | 'importing' | 'success' | 'error';

export function BatchImport({ onProgress }: Props) {
  const [urlsText, setUrlsText] = useState('');
  const [state, setState] = useState<ImportState>('idle');
  const [error, setError] = useState('');
  const [importResults, setImportResults] = useState<ImportItem[] | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const parseUrls = (text: string): string[] => {
    return text
      .split(/[\n,]/)
      .map((url) => url.trim())
      .filter((url) => url && isValidUrl(url));
  };

  const handleImportFromTabs = async () => {
    setState('loading');

    chrome.runtime.sendMessage({ type: 'GET_ALL_TABS' }, (response) => {
      if (response?.success && Array.isArray(response.data)) {
        const urls = response.data as string[];
        setUrlsText(urls.join('\n'));
        setState('idle');
      } else {
        setState('error');
        setError('获取标签页失败');
      }
    });
  };

  const handleImport = async (urls?: string[]) => {
    const urlsToImport = urls || parseUrls(urlsText);

    if (urlsToImport.length === 0) {
      setError('请输入有效的 URL');
      setState('error');
      return;
    }

    setState('importing');
    setError('');
    if (!urls) {
      setImportResults(null);
    }

    const progress: ImportProgress = {
      total: urlsToImport.length,
      completed: 0,
      items: urlsToImport.map((url) => ({ url, status: 'pending' })),
    };
    onProgress(progress);

    chrome.runtime.sendMessage({ type: 'IMPORT_BATCH', urls: urlsToImport }, (response) => {
      onProgress(null);

      if (response?.success && response.data) {
        const result = response.data as ImportProgress;
        const hasErrors = result.items.some((i) => i.status === 'error');

        // Merge with existing results if retrying
        if (urls && importResults) {
          const updatedResults = importResults.map((item) => {
            const newResult = result.items.find((r) => r.url === item.url);
            return newResult || item;
          });
          setImportResults(updatedResults);
        } else {
          setImportResults(result.items);
        }

        setState(hasErrors ? 'error' : 'success');

        // Show notification
        const successCount = result.items.filter((i) => i.status === 'success').length;
        const failedCount = result.items.filter((i) => i.status === 'error').length;
        showNotification(successCount, failedCount);
      } else {
        setState('error');
        setError(response?.error || '批量导入失败');
      }
    });
  };

  const showNotification = (success: number, failed: number) => {
    if (success > 0 || failed > 0) {
      const message = failed > 0 ? `成功 ${success} 个，失败 ${failed} 个` : `成功导入 ${success} 个`;
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
        title: '批量导入完成',
        message,
      });
    }
  };

  const handleRetryFailed = () => {
    if (!importResults) return;
    const failedUrls = importResults.filter((i) => i.status === 'error').map((i) => i.url);
    if (failedUrls.length > 0) {
      handleImport(failedUrls);
    }
  };

  const handleRetrySingle = (url: string) => {
    handleImport([url]);
  };

  const urlCount = parseUrls(urlsText).length;
  const successCount = importResults?.filter((i) => i.status === 'success').length || 0;
  const failedCount = importResults?.filter((i) => i.status === 'error').length || 0;

  return (
    <div className="space-y-4">
      {/* Quick action: import all tabs */}
      <button
        onClick={handleImportFromTabs}
        disabled={state === 'loading' || state === 'importing'}
        className="w-full py-2 px-3 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {state === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <LayoutGrid className="w-4 h-4" />
        )}
        导入所有打开的标签页
      </button>

      {/* URL list input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          URL 列表 {urlCount > 0 && <span className="text-gray-400">({urlCount} 个)</span>}
        </label>
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder="每行一个 URL，或用逗号分隔&#10;https://example.com/article1&#10;https://example.com/article2"
          rows={6}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-notebooklm-blue focus:border-transparent font-mono"
        />
      </div>

      {/* Import button */}
      <button
        onClick={() => handleImport()}
        disabled={urlCount === 0 || state === 'importing'}
        className="w-full py-2.5 bg-notebooklm-blue text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {state === 'importing' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            正在导入...
          </>
        ) : (
          <>
            <List className="w-4 h-4" />
            批量导入 {urlCount > 0 && `(${urlCount})`}
          </>
        )}
      </button>

      {/* Results summary */}
      {importResults && importResults.length > 0 && (
        <div className="space-y-2">
          <div
            className={`flex items-center justify-between text-sm rounded-lg p-3 ${
              failedCount > 0 ? 'bg-yellow-50' : 'bg-green-50'
            }`}
          >
            <div className="flex items-center gap-2">
              {failedCount > 0 ? (
                <AlertCircle className="w-4 h-4 text-yellow-600" />
              ) : (
                <CheckCircle className="w-4 h-4 text-green-600" />
              )}
              <span className={failedCount > 0 ? 'text-yellow-700' : 'text-green-600'}>
                成功 {successCount} 个{failedCount > 0 && `，失败 ${failedCount} 个`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {failedCount > 0 && (
                <button
                  onClick={handleRetryFailed}
                  disabled={state === 'importing'}
                  className="text-xs text-yellow-700 hover:text-yellow-800 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  重试失败
                </button>
              )}
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    收起
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    详情
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Detailed results */}
          {showDetails && (
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {importResults.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50"
                >
                  {item.status === 'success' ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate text-gray-600" title={item.url}>
                    {item.url}
                  </span>
                  {item.status === 'error' && (
                    <button
                      onClick={() => handleRetrySingle(item.url)}
                      disabled={state === 'importing'}
                      className="text-gray-400 hover:text-notebooklm-blue flex-shrink-0"
                      title="重试"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {state === 'error' && !importResults && (
        <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 rounded-lg p-3">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
}
