import { describe, expect, it } from 'vitest';
import { cleanRichText, richTextPlain, safeHref } from '@/lib/rich-text';

const p = (text: string, marks?: unknown[]) => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] });

describe('cleanRichText', () => {
  it('keeps the allowed formats', () => {
    const doc = cleanRichText({
      type: 'doc',
      content: [
        p('Paiement à 30 jours', [{ type: 'bold' }, { type: 'italic' }]),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p('Pénalités : 1 %')] }] },
        { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'Merci' }] },
      ],
    });
    expect(doc?.content).toHaveLength(3);
    expect(doc?.content[0]).toEqual(p('Paiement à 30 jours', [{ type: 'bold' }, { type: 'italic' }]));
    expect(doc?.content[2]).toMatchObject({ attrs: { textAlign: 'center' } });
  });

  it('drops unknown nodes and marks, and unsafe links', () => {
    const doc = cleanRichText({
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'https://x.test/a.png' } },
        { type: 'codeBlock', content: [{ type: 'text', text: 'rm -rf' }] },
        p('Lien', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'highlight' }]),
        p('Site', [{ type: 'link', attrs: { href: 'https://exemple.bf' } }]),
      ],
    });
    expect(doc?.content).toEqual([p('Lien'), p('Site', [{ type: 'link', attrs: { href: 'https://exemple.bf' } }])]);
  });

  it('drops empty paragraphs at the end', () => {
    expect(cleanRichText({ type: 'doc', content: [p('Merci'), { type: 'paragraph' }, { type: 'paragraph' }] })?.content).toEqual([p('Merci')]);
  });

  it('returns null for empty or foreign input', () => {
    expect(cleanRichText(null)).toBeNull();
    expect(cleanRichText('texte')).toBeNull();
    expect(cleanRichText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBeNull();
  });

  it('limits list nesting', () => {
    let node: unknown = p('fond');
    for (let i = 0; i < 6; i++) node = { type: 'bulletList', content: [{ type: 'listItem', content: [p(`n${i}`), node] }] };
    const doc = cleanRichText({ type: 'doc', content: [node] });
    expect(richTextPlain(doc)).not.toContain('fond');
    expect(richTextPlain(doc)).toContain('n5');
  });
});

describe('safeHref', () => {
  it('accepts web and mail links only', () => {
    expect(safeHref('https://a.bf')).toBe('https://a.bf');
    expect(safeHref('mailto:a@b.bf')).toBe('mailto:a@b.bf');
    expect(safeHref('javascript:x')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
  });
});
