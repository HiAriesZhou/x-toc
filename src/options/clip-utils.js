export function normalizeClipTags(tags) {
  if (!Array.isArray(tags)) return [];

  const seen = new Set();
  const normalized = [];

  tags.forEach((tag) => {
    const value = String(tag || '').trim();
    if (!value) return;

    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    normalized.push(value);
  });

  return normalized;
}

export function splitClipTagInput(value) {
  return normalizeClipTags(String(value || '').split(/[,，\r\n]+/));
}

export function mergeClipTagInput(existingTags, value) {
  const tags = normalizeClipTags(existingTags);
  const candidates = splitClipTagInput(value);
  const existingKeys = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
  const added = [];
  const duplicates = [];

  candidates.forEach((tag) => {
    const key = tag.toLocaleLowerCase();
    if (existingKeys.has(key)) {
      duplicates.push(tag);
      return;
    }

    existingKeys.add(key);
    added.push(tag);
  });

  return {
    tags: [...tags, ...added],
    added,
    duplicates
  };
}

export function getAuthorProfileUrl(authorHandle) {
  const handle = String(authorHandle || '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]+$/.test(handle)) return null;
  return `https://x.com/${handle}`;
}

export function normalizeClipNote(note) {
  return String(note || '').trim();
}

export function updateClipTags(clip, tags, options = {}) {
  const now = options.now || new Date().toISOString();

  return {
    ...clip,
    tags: normalizeClipTags(tags),
    updatedAt: now
  };
}

export function addClipTag(clip, tag, options = {}) {
  const normalizedTag = normalizeClipTags([tag])[0];
  if (!normalizedTag) return clip;

  return updateClipTags(clip, [...normalizeClipTags(clip?.tags), normalizedTag], options);
}

export function removeClipTag(clip, tag, options = {}) {
  const target = String(tag || '').trim().toLocaleLowerCase();
  const nextTags = normalizeClipTags(clip?.tags).filter((value) => (
    value.toLocaleLowerCase() !== target
  ));

  return updateClipTags(clip, nextTags, options);
}

export function updateClipNote(clip, note, options = {}) {
  const now = options.now || new Date().toISOString();
  const normalizedNote = normalizeClipNote(note);
  const nextClip = {
    ...clip,
    updatedAt: now
  };

  if (normalizedNote) {
    nextClip.note = normalizedNote;
  } else {
    delete nextClip.note;
  }

  return nextClip;
}

function normalizeSearchValue(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function articleAuthorText(article) {
  return [
    article?.authorName,
    article?.authorHandle
  ].filter(Boolean).join(' ');
}

function excerptSearchText(article, excerpt) {
  return [
    excerpt?.text,
    excerpt?.note,
    ...(Array.isArray(excerpt?.tags) ? excerpt.tags : []),
    article?.title,
    articleAuthorText(article)
  ].filter(Boolean).join(' ');
}

export function filterExcerptGroups(groups, query) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return groups;

  return groups
    .map(({ article, excerpts }) => ({
      article,
      excerpts: excerpts.filter((excerpt) => (
        normalizeSearchValue(excerptSearchText(article, excerpt)).includes(normalizedQuery)
      ))
    }))
    .filter((group) => group.excerpts.length > 0);
}

export function getVisibleExcerptIds(groups) {
  return groups.flatMap(({ excerpts = [] }) => excerpts.map((excerpt) => excerpt.id));
}

export function getSelectionState(visibleIds, selectedIds) {
  const selectedSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const selectedVisibleCount = visibleIds.reduce((count, excerptId) => (
    count + (selectedSet.has(excerptId) ? 1 : 0)
  ), 0);

  return {
    selectedVisibleCount,
    allSelected: visibleIds.length > 0 && selectedVisibleCount === visibleIds.length,
    someSelected: selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length
  };
}

export function getClipLibraryEmptyState({ hasSavedClips, hasSearchQuery, hasMatchingClips = true }) {
  if (!hasSavedClips) {
    return {
      title: 'No clips saved yet',
      message: 'Select text in an X/Twitter article and click "save to xtoc".'
    };
  }

  if (hasSearchQuery && !hasMatchingClips) {
    return {
      title: 'No matching clips',
      message: 'Try a different search term.'
    };
  }

  return null;
}

export function getClipDisplayMeta(clip) {
  const tags = normalizeClipTags(clip?.tags);
  const note = normalizeClipNote(clip?.note);

  return {
    tags,
    hasTags: tags.length > 0,
    hasNote: note.length > 0
  };
}
