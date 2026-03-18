// Quick Collection service — lightweight session-based URL collector
// Uses chrome.storage.session (cleared when browser closes)

export interface CollectionItem {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  addedAt: number;
}

const STORAGE_KEY = 'nlm_collection_queue';

async function loadQueue(): Promise<CollectionItem[]> {
  const result = await chrome.storage.session.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as CollectionItem[]) || [];
}

async function saveQueue(items: CollectionItem[]): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: items });
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Add current page to collection queue */
export async function addToCollection(
  url: string,
  title: string,
  favicon?: string,
): Promise<CollectionItem | null> {
  const queue = await loadQueue();

  // Dedup
  if (queue.some((item) => item.url === url)) return null;

  const item: CollectionItem = {
    id: generateId(),
    url,
    title,
    favicon,
    addedAt: Date.now(),
  };

  queue.unshift(item);
  await saveQueue(queue);
  await updateBadge(queue.length);
  return item;
}

/** Remove item from collection queue */
export async function removeFromCollection(id: string): Promise<void> {
  const queue = await loadQueue();
  const filtered = queue.filter((item) => item.id !== id);
  await saveQueue(filtered);
  await updateBadge(filtered.length);
}

/** Remove multiple items */
export async function removeFromCollectionBatch(ids: string[]): Promise<void> {
  const queue = await loadQueue();
  const idSet = new Set(ids);
  const filtered = queue.filter((item) => !idSet.has(item.id));
  await saveQueue(filtered);
  await updateBadge(filtered.length);
}

/** Get all collected items */
export async function getCollection(): Promise<CollectionItem[]> {
  return loadQueue();
}

/** Clear entire collection queue */
export async function clearCollection(): Promise<void> {
  await saveQueue([]);
  await updateBadge(0);
}

/** Check if URL is in the collection */
export async function isInCollection(url: string): Promise<boolean> {
  const queue = await loadQueue();
  return queue.some((item) => item.url === url);
}

/** Get collection count */
export async function getCollectionCount(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}

/** Update extension badge with collection count */
export async function updateBadge(count?: number): Promise<void> {
  const n = count ?? (await loadQueue()).length;
  if (n > 0) {
    await chrome.action.setBadgeText({ text: String(n) });
    await chrome.action.setBadgeBackgroundColor({ color: '#1A73E8' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}
