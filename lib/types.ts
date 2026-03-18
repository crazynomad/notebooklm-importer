// Document site framework types
export type DocFramework =
  | 'docusaurus'
  | 'mkdocs'
  | 'gitbook'
  | 'vitepress'
  | 'readthedocs'
  | 'sphinx'
  | 'mintlify'
  | 'devsite'
  | 'anthropic'
  | 'sitemap'
  | 'yuque'
  | 'wechat'
  | 'huawei'
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
  hasLlmsFullTxt?: boolean; // Site supports /llms-full.txt for bulk content export
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

// RSS Feed Item
export interface RssFeedItem {
  url: string;
  title: string;
  pubDate?: string;
}

// Message types for communication between popup and background
export type MessageType =
  | { type: 'IMPORT_URL'; url: string }
  | { type: 'IMPORT_BATCH'; urls: string[] }
  | { type: 'PARSE_RSS'; rssUrl: string }
  | { type: 'GET_CURRENT_TAB' }
  | { type: 'GET_ALL_TABS' }
  | { type: 'ANALYZE_DOC_SITE'; tabId: number }
  | { type: 'GET_HISTORY'; limit?: number }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'EXTRACT_CLAUDE_CONVERSATION'; tabId: number }
  | { type: 'IMPORT_CLAUDE_CONVERSATION'; conversation: ClaudeConversation; selectedMessageIds: string[] }
  | { type: 'EXPORT_PDF'; blobUrl: string; title: string }
  | { type: 'GENERATE_PDF'; siteInfo: DocSiteInfo }
  | { type: 'FETCH_PODCAST'; url: string; count?: number }
  | { type: 'DOWNLOAD_PODCAST' }
  | { type: 'GET_FAILED_SOURCES'; tabId: number }
  | { type: 'RESCUE_SOURCES'; urls: string[] }
  | { type: 'GET_WECHAT_SOURCES'; tabId: number }
  | { type: 'REPAIR_WECHAT_SOURCES'; urls: string[] }
  | { type: 'ADD_BOOKMARK'; url: string; title: string; favicon?: string; collection?: string }
  | { type: 'REMOVE_BOOKMARK'; id: string }
  | { type: 'REMOVE_BOOKMARKS'; ids: string[] }
  | { type: 'MOVE_BOOKMARK'; id: string; collection: string }
  | { type: 'MOVE_BOOKMARKS'; ids: string[]; collection: string }
  | { type: 'GET_BOOKMARKS' }
  | { type: 'GET_COLLECTIONS' }
  | { type: 'CREATE_COLLECTION'; name: string }
  | { type: 'IS_BOOKMARKED'; url: string }
  // Quick Collection
  | { type: 'COLLECT_ADD'; url: string; title: string; favicon?: string }
  | { type: 'COLLECT_REMOVE'; id: string }
  | { type: 'COLLECT_REMOVE_BATCH'; ids: string[] }
  | { type: 'COLLECT_GET' }
  | { type: 'COLLECT_CLEAR' }
  | { type: 'COLLECT_IS_COLLECTED'; url: string }
  // Data Export/Import
  | { type: 'EXPORT_USER_DATA' }
  | { type: 'IMPORT_USER_DATA'; data: string };

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

// AI conversation types (Claude / ChatGPT / Gemini)
export type ClaudeRole = 'human' | 'assistant';

export interface ClaudeMessage {
  id: string;
  role: ClaudeRole;
  content: string;
  timestamp?: string;
}

/** A question-answer pair (basic import unit) */
export interface QAPair {
  id: string;
  question: string;
  answer: string;
  questionTimestamp?: string;
  answerTimestamp?: string;
}

export interface ClaudeConversation {
  id: string;
  title: string;
  url: string;
  messages: ClaudeMessage[];
  /** Grouped Q&A pairs for import */
  pairs?: QAPair[];
  extractedAt: number;
}
