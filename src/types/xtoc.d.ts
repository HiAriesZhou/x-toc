export type XtocExportFormat = 'markdown' | 'json';

export interface XtocArticle {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  authorName: string | null;
  authorHandle: string | null;
  publishedAt: string | null;
  platform: string;
  createdAt: string;
  updatedAt: string;
}

export interface XtocClip {
  id: string;
  articleId: string;
  text: string;
  contextBefore: string;
  contextAfter: string;
  pageUrl: string;
  selectionLength: number;
  createdAt: string;
  updatedAt?: string;
  source: string;
  tags?: string[];
  note?: string;
}

export interface XtocSettings {
  contextLength: number;
  defaultExportFormat: XtocExportFormat;
}

export interface XtocStorageShape {
  twitterTocArticles: Record<string, XtocArticle>;
  twitterTocExcerpts: Record<string, XtocClip>;
  twitterTocExcerptSettings: XtocSettings;
}

export interface XtocJsonExportClip {
  id: string;
  text: string;
  contextBefore: string;
  contextAfter: string;
  pageUrl: string;
  selectionLength: number;
  createdAt: string;
  updatedAt?: string;
  source: string;
  tags?: string[];
  note?: string;
}

export interface XtocJsonExportArticle {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  authorName: string | null;
  authorHandle: string | null;
  publishedAt: string | null;
  platform: string;
  createdAt: string | null;
  updatedAt: string | null;
  excerpts: XtocJsonExportClip[];
}

export interface XtocJsonExportV1 {
  version: 1;
  source: 'twitter-toc-extension';
  exportedAt: string;
  articles: XtocJsonExportArticle[];
}

export type XtocContentStatus = 'complete' | 'partial' | 'excerpts_only';
export interface XtocLibraryItem {
  id: string;
  kind: 'article' | 'post';
  markdown: string;
  contentStatus: XtocContentStatus;
  capturedAt: string;
  updatedAt: string;
  tags: string[];
  collectionIds: string[];
  note: string;
  organized: boolean;
  bookmarked: boolean;
  summary: string;
  summaryModel: string;
  trashedAt: string;
  lastExportedAt: string;
}
export interface XtocCollection { id: string; name: string; }
export interface XtocLibraryBackupV1 {
  format: 'xtoc-library';
  version: 1;
  exportedAt: string;
  articles: XtocArticle[];
  clips: XtocClip[];
  items: XtocLibraryItem[];
  collections: XtocCollection[];
}
