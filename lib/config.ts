// NotebookLM Configuration
export const NOTEBOOKLM_CONFIG = {
  baseUrl: 'https://notebooklm.google.com',
  importDelay: 1500, // Delay between batch imports (ms)
} as const;

// Selected notebook storage key
const SELECTED_NOTEBOOK_KEY = 'selected_notebook';

export interface SelectedNotebook {
  id: string;
  title: string;
  url: string;
}

/** Save user's chosen target notebook for imports */
export async function setSelectedNotebook(notebook: SelectedNotebook): Promise<void> {
  await chrome.storage.local.set({ [SELECTED_NOTEBOOK_KEY]: notebook });
}

/** Get user's chosen target notebook (null if not set) */
export async function getSelectedNotebook(): Promise<SelectedNotebook | null> {
  const result = await chrome.storage.local.get(SELECTED_NOTEBOOK_KEY);
  return result[SELECTED_NOTEBOOK_KEY] ?? null;
}
