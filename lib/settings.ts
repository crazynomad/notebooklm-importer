/**
 * User-facing settings. Stored in chrome.storage.local for consistency with
 * the rest of the extension (notebook cache, bookmarks, history all use local).
 */

export interface Settings {
  /** Auto-rename sources NotebookLM names with a default placeholder like "Pasted Text". */
  autoRenamePastedSources: boolean;
}

const STORAGE_KEY = 'jetpackSettings';

const DEFAULTS: Settings = {
  autoRenamePastedSources: true,
};

export async function getSettings(): Promise<Settings> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] as Partial<Settings> | undefined;
    return { ...DEFAULTS, ...(stored || {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const newValue = (changes[STORAGE_KEY].newValue || {}) as Partial<Settings>;
    listener({ ...DEFAULTS, ...newValue });
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
