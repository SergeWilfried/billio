// Notes and conditions (PRO-167): the rich text the invoice editor writes
// (Tiptap's JSON), cut down to what the invoice, its page and its PDF can show.
// Everything read back is cleaned by `cleanRichText` first: unknown nodes and
// marks are dropped, links keep only http(s) and mailto addresses.

export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type RichMark =
  | { type: 'bold' } | { type: 'italic' } | { type: 'underline' } | { type: 'strike' }
  | { type: 'link'; attrs: { href: string } };
export type RichInline = { type: 'text'; text: string; marks?: RichMark[] } | { type: 'hardBreak' };
export type RichBlock =
  | { type: 'paragraph'; attrs?: { textAlign?: TextAlign }; content?: RichInline[] }
  | { type: 'heading'; attrs: { level: 3; textAlign?: TextAlign }; content?: RichInline[] }
  | { type: 'bulletList' | 'orderedList'; content: RichListItem[] };
export type RichListItem = { type: 'listItem'; content: RichBlock[] };
export interface RichDoc { type: 'doc'; content: RichBlock[] }

const ALIGNS: TextAlign[] = ['left', 'center', 'right', 'justify'];
const SIMPLE_MARKS = ['bold', 'italic', 'underline', 'strike'] as const;
const MAX_DEPTH = 3;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A link the invoice may carry: http(s) or mailto only. */
export function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  const h = href.trim();
  return /^(https?:\/\/|mailto:)/i.test(h) && h.length <= 2000 ? h : null;
}

function cleanMarks(raw: unknown): RichMark[] | undefined {
  const out: RichMark[] = [];
  for (const m of list(raw)) {
    if (!isObj(m)) continue;
    if ((SIMPLE_MARKS as readonly unknown[]).includes(m.type) && !out.some(o => o.type === m.type)) {
      out.push({ type: m.type as (typeof SIMPLE_MARKS)[number] });
    } else if (m.type === 'link') {
      const href = safeHref(isObj(m.attrs) ? m.attrs.href : undefined);
      if (href && !out.some(o => o.type === 'link')) out.push({ type: 'link', attrs: { href } });
    }
  }
  return out.length ? out : undefined;
}

function cleanInline(raw: unknown): RichInline[] {
  const out: RichInline[] = [];
  for (const n of list(raw)) {
    if (!isObj(n)) continue;
    if (n.type === 'text' && typeof n.text === 'string' && n.text !== '') {
      const marks = cleanMarks(n.marks);
      out.push(marks ? { type: 'text', text: n.text, marks } : { type: 'text', text: n.text });
    } else if (n.type === 'hardBreak') {
      out.push({ type: 'hardBreak' });
    }
  }
  return out;
}

function alignOf(attrs: unknown): TextAlign | undefined {
  const a = isObj(attrs) ? attrs.textAlign : undefined;
  return ALIGNS.includes(a as TextAlign) && a !== 'left' ? (a as TextAlign) : undefined;
}

function cleanBlocks(raw: unknown, depth: number): RichBlock[] {
  const out: RichBlock[] = [];
  for (const n of list(raw)) {
    if (!isObj(n)) continue;
    if (n.type === 'paragraph' || n.type === 'heading') {
      const content = cleanInline(n.content);
      const textAlign = alignOf(n.attrs);
      if (n.type === 'heading') out.push({ type: 'heading', attrs: { level: 3, ...(textAlign ? { textAlign } : {}) }, ...(content.length ? { content } : {}) });
      else out.push({ type: 'paragraph', ...(textAlign ? { attrs: { textAlign } } : {}), ...(content.length ? { content } : {}) });
    } else if ((n.type === 'bulletList' || n.type === 'orderedList') && depth < MAX_DEPTH) {
      const items: RichListItem[] = list(n.content)
        .filter((i): i is Raw => isObj(i) && i.type === 'listItem')
        .map(i => ({ type: 'listItem' as const, content: cleanBlocks(i.content, depth + 1) }))
        .filter(i => i.content.length > 0);
      if (items.length) out.push({ type: n.type, content: items });
    }
  }
  return out;
}

/** The notes as the invoice may show them, or null when there is nothing to show. */
export function cleanRichText(raw: unknown): RichDoc | null {
  if (!isObj(raw) || raw.type !== 'doc') return null;
  const content = cleanBlocks(raw.content, 0);
  // Empty paragraphs at the end (Enter pressed last) print as blank space
  while (content.length && content[content.length - 1].type === 'paragraph' && !(content[content.length - 1] as { content?: unknown[] }).content) content.pop();
  const doc: RichDoc = { type: 'doc', content };
  return richTextPlain(doc).trim() === '' ? null : doc;
}

function inlineText(content: RichInline[] | undefined): string {
  return (content ?? []).map(i => (i.type === 'text' ? i.text : '\n')).join('');
}

/** The notes as plain text, one line per paragraph or list item. */
export function richTextPlain(doc: RichDoc | null | undefined): string {
  if (!doc) return '';
  const walk = (blocks: RichBlock[]): string[] => blocks.flatMap(b =>
    b.type === 'bulletList' || b.type === 'orderedList'
      ? b.content.flatMap(item => walk(item.content))
      : [inlineText((b as { content?: RichInline[] }).content)]);
  return walk(doc.content).join('\n');
}
