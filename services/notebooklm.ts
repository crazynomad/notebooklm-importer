import { NOTEBOOKLM_CONFIG, getSelectedNotebook } from '@/lib/config';
import { delay } from '@/lib/utils';
import type { ImportItem, ImportProgress } from '@/lib/types';
import { addToHistory } from './history';

// Send message to content script to import a URL
async function sendImportMessage(tabId: number, url: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'IMPORT_URL', url }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Content script error:', chrome.runtime.lastError);
        resolve(false);
      } else {
        resolve(response?.success ?? false);
      }
    });
  });
}

// Send message to content script to import text
async function sendImportTextMessage(
  tabId: number,
  text: string,
  title?: string
): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'IMPORT_TEXT', text, title },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Content script error:', chrome.runtime.lastError);
          resolve(false);
        } else {
          resolve(response?.success ?? false);
        }
      }
    );
  });
}

// Wait for a tab to reach status 'complete', with timeout
function waitForTabLoad(tabId: number, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timed out'));
    }, timeout);
    const listener = (id: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Ensure the target notebook is open in a tab and ready for import.
// Strategy: find existing tab on the right notebook, or open a new one.
async function getNotebookLMTab(): Promise<chrome.tabs.Tab> {
  const selected = await getSelectedNotebook();
  const targetUrl = selected?.url || NOTEBOOKLM_CONFIG.baseUrl;

  // Check if there's already a tab on the target notebook
  if (selected) {
    const exact = await chrome.tabs.query({ url: `${NOTEBOOKLM_CONFIG.baseUrl}/notebook/${selected.id}*` });
    if (exact.length > 0 && exact[0].id) {
      await chrome.tabs.update(exact[0].id, { active: true });
      return exact[0];
    }
  }

  // No matching tab — create a new one
  const newTab = await chrome.tabs.create({ url: targetUrl });
  await waitForTabLoad(newTab.id!);
  // Extra wait for NLM SPA to render after DOM 'complete'
  await delay(2000);
  return (await chrome.tabs.get(newTab.id!));
}

// Inject content script into the tab
async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/notebooklm.js'],
    });
  } catch {
    // Script might already be injected
  }
  await delay(500);
}

// Import a single URL to NotebookLM
export async function importUrl(url: string): Promise<boolean> {
  try {
    const tab = await getNotebookLMTab();
    if (!tab.id) throw new Error('Failed to get NotebookLM tab');

    await ensureContentScript(tab.id);

    const success = await sendImportMessage(tab.id, url);

    // Record to history
    await addToHistory(url, success ? 'success' : 'error', undefined, success ? undefined : 'Import failed');

    return success;
  } catch (error) {
    console.error('Failed to import URL:', error);
    // Record failure to history
    await addToHistory(url, 'error', undefined, error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

// Import multiple URLs with progress callback
export async function importBatch(
  urls: string[],
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportProgress> {
  const items: ImportItem[] = urls.map((url) => ({
    url,
    status: 'pending',
  }));

  const progress: ImportProgress = {
    total: urls.length,
    completed: 0,
    items,
  };

  // Get NotebookLM tab first
  const tab = await getNotebookLMTab();
  if (!tab.id) throw new Error('Failed to get NotebookLM tab');

  await ensureContentScript(tab.id);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    item.status = 'importing';
    progress.current = item;
    onProgress?.(progress);

    try {
      const success = await sendImportMessage(tab.id, item.url);
      item.status = success ? 'success' : 'error';
      if (!success) {
        item.error = 'Import failed';
      }
      // Record to history
      await addToHistory(item.url, item.status, undefined, item.error);
    } catch (error) {
      item.status = 'error';
      item.error = error instanceof Error ? error.message : 'Unknown error';
      // Record to history
      await addToHistory(item.url, 'error', undefined, item.error);
    }

    progress.completed++;
    onProgress?.(progress);

    // Add delay between imports to avoid rate limiting
    if (i < items.length - 1) {
      await delay(NOTEBOOKLM_CONFIG.importDelay);
    }
  }

  progress.current = undefined;
  return progress;
}

// Import text content to NotebookLM
export async function importText(text: string, title?: string): Promise<boolean> {
  try {
    const tab = await getNotebookLMTab();
    if (!tab.id) throw new Error('Failed to get NotebookLM tab');

    await ensureContentScript(tab.id);

    const success = await sendImportTextMessage(tab.id, text, title);

    // Record to history
    const historyTitle = title || 'Imported text';
    await addToHistory(
      `text://${historyTitle}`,
      success ? 'success' : 'error',
      historyTitle,
      success ? undefined : 'Import failed'
    );

    return success;
  } catch (error) {
    console.error('Failed to import text:', error);
    const historyTitle = title || 'Imported text';
    await addToHistory(
      `text://${historyTitle}`,
      'error',
      historyTitle,
      error instanceof Error ? error.message : 'Unknown error'
    );
    return false;
  }
}

// Get current tab URL
export async function getCurrentTabUrl(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url || null;
}

// Get all open tab URLs
export async function getAllTabUrls(): Promise<string[]> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs
    .map((tab) => tab.url)
    .filter((url): url is string => !!url && url.startsWith('http'));
}
