// Subscription status
export interface SubscriptionStatus {
  isSubscribed: boolean;
  checkedAt: number;
  channelTitle?: string;
}

// Document site framework types
export type DocFramework =
  | 'docusaurus'
  | 'mkdocs'
  | 'gitbook'
  | 'vitepress'
  | 'readthedocs'
  | 'sphinx'
  | 'mintlify'
  | 'anthropic'
  | 'unknown';

// Document page item
export interface DocPageItem {
  url: string;
  title: string;
  path: string;
  level: number;
  section?: string;
}

// Document site info
export interface DocSiteInfo {
  baseUrl: string;
  title: string;
  framework: DocFramework;
  pages: DocPageItem[];
}

// Import item
export interface ImportItem {
  url: string;
  title?: string;
  status: 'pending' | 'importing' | 'success' | 'error';
  error?: string;
}

// Import progress
export interface ImportProgress {
  total: number;
  completed: number;
  current?: ImportItem;
  items: ImportItem[];
}

// YouTube Playlist Item
export interface PlaylistItem {
  videoId: string;
  title: string;
  thumbnail?: string;
}

// RSS Feed Item
export interface RssFeedItem {
  url: string;
  title: string;
  pubDate?: string;
}

// Message types for communication between popup and background
export type MessageType =
  | { type: 'CHECK_SUBSCRIPTION' }
  | { type: 'GET_CACHED_SUBSCRIPTION' }
  | { type: 'IMPORT_URL'; url: string }
  | { type: 'IMPORT_BATCH'; urls: string[] }
  | { type: 'GET_PLAYLIST_VIDEOS'; playlistUrl: string }
  | { type: 'PARSE_RSS'; rssUrl: string }
  | { type: 'GET_CURRENT_TAB' }
  | { type: 'GET_ALL_TABS' }
  | { type: 'ANALYZE_DOC_SITE'; tabId: number }
  | { type: 'GET_HISTORY'; limit?: number }
  | { type: 'CLEAR_HISTORY' };

export type MessageResponse =
  | { success: true; data: unknown }
  | { success: false; error: string };

// Import history item
export interface HistoryItem {
  id: string;
  url: string;
  title?: string;
  importedAt: number;
  status: 'success' | 'error';
  error?: string;
}
