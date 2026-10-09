import { bookmarkList, clipGroups, validId } from './model.js';
import { escapeMarkdown, escapeText, safeMarkdown } from './markdown.js';

// Obsidian-style export: one note per article or post, YAML properties,
// tag lists, and clips as quote callouts. Plain Markdown, no plugins needed.
export const EXPORT_FOLDER = 'XTOC';
const MAX_NAME_LENGTH = 80;

export function noteName(title, fallback) {
  const cleaned = String(title || '')
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned || fallback;
}

export function obsidianTag(tag) {
  const cleaned = String(tag || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_/-]/gu, '');
  if (!cleaned) return '';
  return /^\d+$/.test(cleaned) ? `tag-${cleaned}` : cleaned;
}

const tagList = (tags) => [...new Set((tags || []).map(obsidianTag).filter(Boolean))];
const day = (value) =>
  value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString().slice(0, 10) : '';

// JSON strings are valid YAML scalars, so titles cannot break out of the block.
function properties(entries) {
  const lines = Object.entries(entries)
    .filter(
      ([, value]) => value !== '' && value !== null && !(Array.isArray(value) && !value.length)
    )
    .map(([key, value]) =>
      Array.isArray(value)
        ? `${key}:\n${value.map((item) => `  - ${JSON.stringify(item)}`).join('\n')}`
        : `${key}: ${/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : JSON.stringify(value)}`
    );
  return `---\n${lines.join('\n')}\n---`;
}

const callout = (type, title, text) =>
  [`> [!${type}]${title ? ` ${title}` : ''}`, ...text.split('\n').map((line) => `> ${line}`)].join(
    '\n'
  );

function renderClip(clip) {
  const parts = [callout('quote', '', clip.text.split('\n').map(escapeMarkdown).join('\n'))];
  const tags = tagList(clip.tags);
  if (tags.length) parts.push(tags.map((tag) => `#${tag}`).join(' '));
  if (clip.note) parts.push(escapeText(clip.note));
  return parts.join('\n\n');
}

function renderNote({ article, bookmark, clips }) {
  const tags = tagList([...(bookmark?.tags || []), ...clips.flatMap((clip) => clip.tags || [])]);
  const sections = [
    properties({
      title: article.title || 'Untitled',
      source: article.url || article.canonicalUrl || '',
      author: article.authorHandle || article.authorName || '',
      published: day(article.publishedAt),
      saved: day(bookmark?.capturedAt || clips.at(-1)?.createdAt),
      type: bookmark ? `x-${bookmark.kind}` : 'x-clips',
      tags,
      xtoc_id: article.id
    })
  ];
  if (bookmark?.summary)
    sections.push(callout('summary', 'AI summary', escapeText(bookmark.summary)));
  if (bookmark?.note) sections.push('## Note', escapeText(bookmark.note));
  if (bookmark) {
    sections.push(
      '## Content',
      bookmark.markdown
        ? safeMarkdown(bookmark.markdown)
        : '_No saved text. Open the source to read it._'
    );
  }
  if (clips.length) sections.push('## Clips', clips.map(renderClip).join('\n\n'));
  return `${sections.join('\n\n')}\n`;
}

function addFile(files, used, title, fallback, suffix, content) {
  const base = `${noteName(title, fallback)}${suffix}`;
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
  used.add(name.toLowerCase());
  files[`${EXPORT_FOLDER}/${name}.md`] = content;
}

export function bookmarkFiles(state, ids) {
  const selected = new Set(ids);
  const bookmarks = bookmarkList(state).filter((item) => selected.has(item.id) && validId(item.id));
  if (!bookmarks.length) throw new Error('Nothing to export.');
  const files = {};
  const used = new Set();
  for (const bookmark of bookmarks) {
    const article = { id: bookmark.id, ...bookmark };
    addFile(
      files,
      used,
      bookmark.title,
      bookmark.id,
      '',
      renderNote({ article, bookmark, clips: bookmark.clips })
    );
  }
  return files;
}

export function clipFiles(state, ids) {
  const selected = new Set(ids);
  const groups = clipGroups(state)
    .map((group) => ({
      ...group,
      excerpts: group.excerpts.filter((clip) => selected.has(clip.id))
    }))
    .filter((group) => group.excerpts.length);
  if (!groups.length) throw new Error('Nothing to export.');
  const files = {};
  const used = new Set();
  for (const { article, excerpts } of groups) {
    addFile(
      files,
      used,
      article.title,
      article.id,
      ' (clips)',
      renderNote({ article, clips: excerpts })
    );
  }
  return files;
}

// Minimal ZIP STORE writer: UTF-8 names, CRC32, no compression or dependencies.
// Paths come from noteName(), which strips separators and reserved characters.
export function zipFiles(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  let centralSize = 0;
  const crc32 = (bytes) => {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ -1) >>> 0;
  };
  const header = (size, signature) => {
    const buffer = new Uint8Array(size);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, signature, true);
    return [buffer, view];
  };
  for (const [path, text] of Object.entries(files)) {
    if (!/^XTOC\/[^/\\\u0000-\u001f]+\.md$/.test(path)) throw new Error('Unsafe archive path.');
    const name = encoder.encode(path),
      data = encoder.encode(text),
      crc = crc32(data);
    const [local, l] = header(30, 0x04034b50);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    chunks.push(local, name, data);
    const [entry, c] = header(46, 0x02014b50);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(entry, name);
    centralSize += entry.length + name.length;
    offset += local.length + name.length + data.length;
  }
  const count = Object.keys(files).length;
  if (count > 65535 || offset + centralSize > 0xffffffff)
    throw new Error('Select fewer items to export.');
  const [end, e] = header(22, 0x06054b50);
  e.setUint16(8, count, true);
  e.setUint16(10, count, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}
