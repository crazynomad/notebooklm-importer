import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ExternalLink, RefreshCw, Pencil } from 'lucide-react';
import type { NotebookInfo } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { setSelectedNotebook, getSelectedNotebook } from '@/lib/config';

interface NotebookData {
  current: NotebookInfo | null;
  notebooks: NotebookInfo[];
}

export function NotebookSelector() {
  const { t } = useI18n();
  const [data, setData] = useState<NotebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [selected, setSelected] = useState<NotebookInfo | null>(null);

  const fetchNotebooks = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const [resp, savedSelection] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_NOTEBOOKS', force }),
        getSelectedNotebook(),
      ]);
      if (resp?.success) {
        const nbData = resp.data as NotebookData;
        setData(nbData);
        // Restore saved selection if it still exists in the list
        if (savedSelection) {
          const found = nbData.notebooks.find(nb => nb.id === savedSelection.id);
          if (found) {
            setSelected(found);
          } else {
            // Saved notebook no longer exists, fall back and persist
            const fallback = nbData.current || nbData.notebooks[0] || null;
            setSelected(fallback);
            if (fallback) setSelectedNotebook(fallback);
          }
        } else {
          // No saved selection — use current from open tab, or first notebook, and persist
          const initial = nbData.current || nbData.notebooks[0] || null;
          setSelected(initial);
          if (initial) setSelectedNotebook(initial);
        }
      }
    } catch {
      // Extension context unavailable
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotebooks();
  }, [fetchNotebooks]);

  const activeNotebook = selected;
  const notebooks = data?.notebooks || [];

  const handleSelect = (nb: NotebookInfo) => {
    setSelected(nb);
    setSelectedNotebook(nb);
    setOpen(false);
  };

  const handleNavigate = (url: string) => {
    chrome.tabs.query({ url: 'https://notebooklm.google.com/*' }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        chrome.tabs.update(tabs[0].id, { url, active: true });
      } else {
        chrome.tabs.create({ url });
      }
    });
  };

  // Loading state — show skeleton while fetching notebooks
  if (loading) {
    return (
      <div className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200/80 px-3 py-2.5">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
          <RefreshCw className="w-4 h-4 text-gray-300 animate-spin" />
        </div>
        <div className="flex-1">
          <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  // No notebooks found — compact prompt to open NotebookLM
  if (!data || notebooks.length === 0) {
    return (
      <button
        onClick={() => {
          chrome.tabs.create({ url: 'https://notebooklm.google.com' });
        }}
        className="w-full flex items-center gap-2.5 rounded-xl border border-dashed border-gray-200 px-3 py-2.5 hover:border-notebooklm-blue/40 hover:bg-blue-50/30 transition-all group"
      >
        <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
          <img src="/icons/icon-48.png" alt="" className="w-5 h-5 opacity-40 group-hover:opacity-70 transition-opacity" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm text-gray-400 group-hover:text-notebooklm-blue transition-colors">
            {t('notebook.noNotebook')}
          </p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-notebooklm-blue transition-colors" />
      </button>
    );
  }

  return (
    <div className="relative">
      {/* Current notebook — main display */}
      <div className="flex items-center gap-2.5 rounded-xl border border-gray-200/80 bg-white px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">
            {activeNotebook?.title || 'NotebookLM'}
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {activeNotebook && (
            <button
              onClick={() => handleNavigate(activeNotebook.url)}
              className="p-1.5 text-gray-400 hover:text-notebooklm-blue rounded-md hover:bg-blue-50 transition-colors"
              title={t('notebook.openInTab')}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchNotebooks(true);
            }}
            className="p-1.5 text-gray-400 hover:text-notebooklm-blue rounded-md hover:bg-blue-50 transition-colors"
            title={t('notebook.refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {notebooks.length > 1 && (
            <button
              onClick={() => setOpen(!open)}
              className="p-1.5 text-gray-400 hover:text-notebooklm-blue rounded-md hover:bg-blue-50 transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown list */}
      {open && notebooks.length > 1 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg max-h-[240px] overflow-y-auto">
          {notebooks.map((nb) => {
            const isActive = nb.id === activeNotebook?.id;
            return (
              <button
                key={nb.id}
                onClick={() => handleSelect(nb)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                  isActive ? 'bg-blue-50/50' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`flex-1 text-xs truncate ${
                  isActive ? 'text-notebooklm-blue font-medium' : 'text-gray-600'
                }`}>
                  {nb.title}
                </span>
                {isActive && (
                  <span className="text-[9px] text-notebooklm-blue bg-blue-100/60 px-1.5 py-0.5 rounded-full font-medium">
                    {t('notebook.active')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
