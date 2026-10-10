// Clip search and selection helpers for the Library UI.
function normalizeSearchValue(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase();
}

function articleAuthorText(article) {
  return [article?.authorName, article?.authorHandle].filter(Boolean).join(' ');
}

function excerptSearchText(article, excerpt) {
  return [
    excerpt?.text,
    excerpt?.note,
    ...(Array.isArray(excerpt?.tags) ? excerpt.tags : []),
    article?.title,
    articleAuthorText(article)
  ]
    .filter(Boolean)
    .join(' ');
}

export function filterExcerptGroups(groups, query) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return groups;

  return groups
    .map(({ article, excerpts }) => ({
      article,
      excerpts: excerpts.filter((excerpt) =>
        normalizeSearchValue(excerptSearchText(article, excerpt)).includes(normalizedQuery)
      )
    }))
    .filter((group) => group.excerpts.length > 0);
}

export function getSelectionState(visibleIds, selectedIds) {
  const selectedSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const selectedVisibleCount = visibleIds.reduce(
    (count, excerptId) => count + (selectedSet.has(excerptId) ? 1 : 0),
    0
  );

  return {
    selectedVisibleCount,
    allSelected: visibleIds.length > 0 && selectedVisibleCount === visibleIds.length,
    someSelected: selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length
  };
}
