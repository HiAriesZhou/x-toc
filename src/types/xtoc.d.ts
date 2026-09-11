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
