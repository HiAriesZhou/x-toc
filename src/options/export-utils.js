// JSON export (contract version 1). Markdown export lives in src/library/obsidian.js.
export function renderAllJson(groups, exportedAt) {
  return JSON.stringify(
    {
      version: 1,
      source: 'twitter-toc-extension',
      exportedAt,
      articles: groups.map(({ article, excerpts }) => ({
        id: article.id,
        url: article.url || '',
        canonicalUrl: article.canonicalUrl || '',
        title: article.title || '',
        authorName: article.authorName || null,
        authorHandle: article.authorHandle || null,
        publishedAt: article.publishedAt || null,
        platform: article.platform || '',
        createdAt: article.createdAt || null,
        updatedAt: article.updatedAt || null,
        excerpts: excerpts.map((excerpt) => ({
          id: excerpt.id,
          text: excerpt.text,
          contextBefore: excerpt.contextBefore || '',
          contextAfter: excerpt.contextAfter || '',
          pageUrl: excerpt.pageUrl || '',
          selectionLength: excerpt.selectionLength || excerpt.text.length,
          createdAt: excerpt.createdAt,
          updatedAt: excerpt.updatedAt || null,
          source: excerpt.source || '',
          tags: Array.isArray(excerpt.tags) ? excerpt.tags : [],
          note: excerpt.note || ''
        }))
      }))
    },
    null,
    2
  );
}
