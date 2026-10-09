import test from 'node:test';
import assert from 'node:assert/strict';
import { domToMarkdown, safeMarkdown } from '../src/library/markdown.js';

test('Markdown link sanitization drops encoded dangerous schemes', () => {
  assert.doesNotMatch(
    safeMarkdown('[bad](jav&#x61;script:evil)\n[ref]: data:text/html,bad'),
    /jav&#x61;script:|data:text/
  );
});

function node(tag, children, attrs = {}) {
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes: children.map((c) => (typeof c === 'string' ? { nodeType: 3, textContent: c } : c)),
    children: children.filter((c) => typeof c !== 'string'),
    textContent: children.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''),
    classList: { contains: (v) => (attrs.class || '').split(' ').includes(v) },
    getAttribute: (k) => attrs[k] ?? null,
    ...attrs
  };
}

test('deterministic DOM conversion preserves headings, paragraphs, lists, quotes and code fences', () => {
  const root = node('div', [
    node('h2', ['中文标题']),
    node('p', ['Text ', node('a', ['source'], { href: 'https://example.com' })]),
    node('ol', [node('li', ['one']), node('li', ['two'])]),
    node('blockquote', ['Quoted']),
    node('pre', ['const a = `<tag>````;']),
    node('script', ['unsafe()'])
  ]);
  const md = domToMarkdown(root);
  assert.match(md, /### 中文标题/);
  assert.match(md, /1\. one\n2\. two/);
  assert.match(md, /> Quoted/);
  assert.match(md, /````\nconst a = `<tag>````;\n````/);
  assert.doesNotMatch(md, /unsafe/);
});

test('restored Markdown neutralizes HTML, active links and remote images, preserves fenced code', () => {
  const md = safeMarkdown(
    '<script>alert(1)</script>\n![image](https://example.com/a.png)\n[bad](javascript:alert(1))\n```html\n<b>literal</b>\n```'
  );
  assert.doesNotMatch(md, /<script>|!\[|javascript:/);
  assert.match(md, /<b>literal<\/b>/);
});

test('DOM conversion keeps ordinary punctuation readable and escapes only block markers', () => {
  const root = node('div', [
    node('p', ['C# is great! a|b > c']),
    node('p', ['# not a heading']),
    node('p', ['- not a list']),
    node('p', ['1. not ordered']),
    node('p', [node('img', [], { src: 'https://pbs.twimg.com/media/a.jpg', alt: '' })])
  ]);
  const md = domToMarkdown(root);
  assert.match(md, /^C# is great! a\|b &gt; c$/m);
  assert.match(md, /^\\# not a heading$/m);
  assert.match(md, /^\\- not a list$/m);
  assert.match(md, /^1\\\. not ordered$/m);
  assert.match(md, /\[Image\]\(<https:\/\/pbs\.twimg\.com\/media\/a\.jpg>\)/);
});
