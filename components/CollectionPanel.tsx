import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Send, X, CheckSquare, Square, Package } from 'lucide-react';
import type { ImportProgress } from '@/lib/types';
import type { CollectionItem } from '@/services/collection';
import { useI18n } from '@/lib/i18n';

interface Props {
  onProgress: (progress: ImportProgress | null) => void;
}

export function CollectionPanel({ onProgress }: Props) {
  const { t } = useI18n();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentTabInfo, setCurrentTabInfo] = useState<{ url: string; title: string; favicon?: string } | null>(null);
  const [isCurrentCollected, setIsCurrentCollected] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadItems = useCallback(async () => {
    const resp = await chrome.runtime.sendMessage({ type: 'COLLECT_GET' });
    if (resp?.success) {
      setItems(resp.data as CollectionItem[]);
    }
  }, []);

  const checkCurrentTab = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && tab.url.startsWith('http')) {
      setCurrentTabInfo({
        url: tab.url,
        title: tab.title || tab.url,
        favicon: tab.favIconUrl,
      });
      const resp = await chrome.runtime.sendMessage({ type: 'COLLECT_IS_COLLECTED', url: tab.url });
      setIsCurrentCollected(resp?.success ? resp.data as boolean : false);
    }
  }, []);

  useEffect(() => {
    loadItems();
    checkCurrentTab();
  }, [loadItems, checkCurrentTab]);

  const handleAdd = async () => {
    if (!currentTabInfo) return;
    await chrome.runtime.sendMessage({
      type: 'COLLECT_ADD',
      url: currentTabInfo.url,
      title: currentTabInfo.title,
      favicon: currentTabInfo.favicon,
    });
    setIsCurrentCollected(true);
    await loadItems();
  };

  const handleRemove = async (id: string) => {
    await chrome.runtime.sendMessage({ type: 'COLLECT_REMOVE', id });
    if (currentTabInfo) {
      const updated = items.filter((i) => i.id !== id);
      const stillCollected = updated.some((i) => i.url === currentTabInfo.url);
      setIsCurrentCollected(stillCollected);
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await loadItems();
  };

  const handleRemoveSelected = async () => {
    if (selectedIds.size === 0) return;
    await chrome.runtime.sendMessage({ type: 'COLLECT_REMOVE_BATCH', ids: Array.from(selectedIds) });
    setSelectedIds(new Set());
    setIsCurrentCollected(false);
    await loadItems();
    await checkCurrentTab();
  };

  const handleClear = async () => {
    await chrome.runtime.sendMessage({ type: 'COLLECT_CLEAR' });
    setItems([]);
    setSelectedIds(new Set());
    setIsCurrentCollected(false);
  };

  const handleImport = async () => {
    const toImport = selectedIds.size > 0
      ? items.filter((i) => selectedIds.has(i.id))
      : items;

    if (toImport.length === 0) return;

    setImporting(true);
    const urls = toImport.map((i) => i.url);

    const resp = await chrome.runtime.sendMessage({ type: 'RESCUE_SOURCES', urls });
    setImporting(false);

    if (resp?.success) {
      // Clear imported items
      if (selectedIds.size > 0) {
        await chrome.runtime.sendMessage({ type: 'COLLECT_REMOVE_BATCH', ids: Array.from(selectedIds) });
        setSelectedIds(new Set());
      } else {
        await chrome.runtime.sendMessage({ type: 'COLLECT_CLEAR' });
      }
      await loadItems();
      await checkCurrentTab();
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(items.map((i) => i.id)));
  const deselectAll = () => setSelectedIds(new Set());

  return (
    <div className="space-y-3">
      {/* Add current page */}
      {currentTabInfo && (
        <div className="bg-surface-sunken rounded-xl p-3 shadow-soft">
          <div className="flex items-center gap-2">
            {currentTabInfo.favicon && (
              <img src={currentTabInfo.favicon} className="w-4 h-4 flex-shrink-0" alt="" />
            )}
            <span className="flex-1 text-sm text-gray-700 truncate">{currentTabInfo.title}</span>
            {isCurrentCollected ? (
              <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50/80 px-2 py-1 rounded-md border border-blue-200/40">
                <Package className="w-3 h-3" />
                {t('collection.collected')}
              </span>
            ) : (
              <button
                onClick={handleAdd}
                className="btn-press flex items-center gap-1 px-3 py-1.5 bg-notebooklm-blue text-white text-xs rounded-md hover:bg-blue-600 transition-colors shadow-btn hover:shadow-btn-hover"
              >
                <Plus className="w-3 h-3" />
                {t('collection.collect')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Item count & actions */}
      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {t('collection.count', { count: items.length })}
            </span>
            <button
              onClick={selectedIds.size === items.length ? deselectAll : selectAll}
              className="text-xs text-notebooklm-blue hover:underline"
            >
              {selectedIds.size === items.length ? t('collection.deselectAll') : t('collection.selectAll')}
            </button>
          </div>
          <div className="flex items-center gap-1">
            {selectedIds.size > 0 && (
              <button
                onClick={handleRemoveSelected}
                className="btn-press p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                title={t('collection.removeSelected')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={handleClear}
              className="btn-press p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title={t('collection.clearAll')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Item list */}
      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group transition-colors"
            >
              <button onClick={() => toggleSelect(item.id)} className="flex-shrink-0 text-gray-400 hover:text-notebooklm-blue">
                {selectedIds.has(item.id) ? (
                  <CheckSquare className="w-4 h-4 text-notebooklm-blue" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
              {item.favicon && (
                <img src={item.favicon} className="w-3.5 h-3.5 flex-shrink-0" alt="" />
              )}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-xs text-gray-700 truncate hover:text-notebooklm-blue"
                title={item.url}
              >
                {item.title}
              </a>
              <button
                onClick={() => handleRemove(item.id)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('collection.empty')}</p>
          <p className="text-xs mt-1 text-gray-300">{t('collection.emptyHint')}</p>
        </div>
      )}

      {/* Import button */}
      {items.length > 0 && (
        <button
          onClick={handleImport}
          disabled={importing}
          className="btn-press w-full flex items-center justify-center gap-2 py-2.5 bg-notebooklm-blue text-white text-sm font-medium rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-btn hover:shadow-btn-hover"
        >
          <Send className="w-4 h-4" />
          {importing
            ? t('collection.importing')
            : selectedIds.size > 0
              ? t('collection.importSelected', { count: selectedIds.size })
              : t('collection.importAll', { count: items.length })}
        </button>
      )}
    </div>
  );
}
