import { safeUrl } from './model.js';

// Escape only characters that change inline meaning, so exported prose stays
// readable for people and agents. Line-start markers are handled separately.
export const escapeMarkdown = (text) =>
  String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/[\[\]*_`]/g, '\\$&')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const BLOCK_MARKER = /^(\s*)(#{1,6}(?=\s|$)|[-+](?=\s|$)|-{2,}\s*$|={2,}\s*$|\d{1,9}[.)](?=\s|$))/;
export function escapeBlockStart(line) {
  return line.replace(BLOCK_MARKER, (_, space, marker) =>
    /^\d/.test(marker)
      ? `${space}${marker.slice(0, -1)}\\${marker.slice(-1)}`
      : `${space}\\${marker}`
  );
}
// Plain multi-line text (notes, summaries, context) rendered as Markdown prose.
export const escapeText = (text) =>
  escapeMarkdown(text).split('\n').map(escapeBlockStart).join('\n');
export function markdownLink(text, url) {
  const safe = safeUrl(url);
  return safe
    ? `[${escapeMarkdown(text)}](<${safe.replace(/</g, '%3C').replace(/>/g, '%3E')}>)`
    : escapeMarkdown(text);
}
function fence(text) {
  return '`'.repeat(Math.max(3, ...(text.match(/`+/g) || []).map((s) => s.length + 1)));
}

// DOM is read, never cloned into the extension. No page HTML is rendered.
export function domToMarkdown(root) {
  function render(node) {
    if (node.nodeType === 3) return escapeMarkdown(node.textContent.replace(/\s+/g, ' '));
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    if (
      ['script', 'style', 'button', 'nav', 'footer', 'svg', 'input', 'textarea'].includes(tag) ||
      node.hidden ||
      node.getAttribute('aria-hidden') === 'true'
    )
      return '';
    const children = () => [...node.childNodes].map(render).join('');
    const heading =
      tag.match(/^h([1-6])$/)?.[1] ||
      (node.classList.contains('longform-header-one')
        ? 2
        : node.classList.contains('longform-header-two')
          ? 3
          : node.classList.contains('longform-header-three')
            ? 4
            : null);
    if (heading)
      return `\n\n${'#'.repeat(Math.min(6, Number(heading) + 1))} ${children().trim()}\n\n`;
    if (tag === 'pre') {
      const text = node.textContent;
      const f = fence(text);
      return `\n\n${f}\n${text}\n${f}\n\n`;
    }
    if (tag === 'code') {
      const text = node.textContent;
      const f = '`'.repeat(Math.max(1, ...(text.match(/`+/g) || []).map((s) => s.length + 1)));
      return `${f} ${text} ${f}`;
    }
    if (tag === 'br') return '\n';
    if (tag === 'a') return markdownLink(node.textContent, node.href);
    // Media stay as source links; nothing is embedded or fetched on render.
    if (tag === 'img')
      return ` ${markdownLink(node.alt ? `Image: ${node.alt}` : 'Image', node.src)} `;
    if (tag === 'video') return '\n\n[Video — view the original source]\n\n';
    if (tag === 'blockquote')
      return `\n\n${children()
        .trim()
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')}\n\n`;
    if (tag === 'strong' || tag === 'b') return `**${children()}**`;
    if (tag === 'em' || tag === 'i') return `*${children()}*`;
    if (tag === 'ul' || tag === 'ol')
      return (
        '\n\n' +
        [...node.children]
          .map(
            (li, i) =>
              `${tag === 'ol' ? `${i + 1}.` : '-'} ${render(li).trim().replace(/\n/g, '\n  ')}`
          )
          .join('\n') +
        '\n\n'
      );
    if (
      tag === 'p' ||
      node.getAttribute('data-block') === 'true' ||
      node.classList.contains('longform-text')
    )
      return `\n\n${children().trim().split('\n').map(escapeBlockStart).join('\n')}\n\n`;
    return children();
  }
  return render(root)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Restored Markdown can be supplied by another program. Neutralize active HTML,
// remote-image embeds and non-HTTP link targets without changing fenced code.
export function safeMarkdown(markdown) {
  let codeFence = null;
  return (
    String(markdown || '')
      .split('\n')
      .map((line) => {
        const match = line.match(/^\s*(`{3,}|~{3,})/);
        if (match) {
          if (!codeFence) codeFence = match[1];
          else if (match[1][0] === codeFence[0] && match[1].length >= codeFence.length)
            codeFence = null;
          return line;
        }
        if (codeFence) return line;
        return line
          .replace(/(!?)\[([^\]\n]*)\]\(\s*(<[^>\n]*>|[^)\n]*)\s*\)/g, (_, image, text, target) =>
            markdownLink(image ? `Image: ${text}` : text, target.trim().replace(/^<|>$/g, ''))
          )
          .replace(/!\[([^\]]*)\]/g, '[Image: $1]')
          .replace(
            /^(\s*\[[^\]]+\]:)\s*(.*)$/g,
            (_, prefix, target) => `${prefix} ${safeUrl(target.replace(/^<|>$/g, '')) || '#'}`
          )
          .replace(/<(?!https?:\/\/)([^>]*?)>/g, '&lt;$1&gt;');
      })
      .join('\n') + (codeFence ? `\n${codeFence}\n` : '')
  );
}
