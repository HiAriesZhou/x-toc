// Tag normalization shared by the background writer, AI suggestions and the Library UI.
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
