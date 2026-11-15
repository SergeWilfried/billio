// Shows the invoice notes (PRO-167) on screen: the same formats the PDF prints,
// built as React elements from the cleaned JSON (no HTML is injected).

import type { ReactNode } from 'react';
import type { RichBlock, RichDoc, RichInline, TextAlign } from '@/lib/rich-text';

function inline(content: RichInline[] | undefined): ReactNode[] {
  return (content ?? []).map((n, i) => {
    if (n.type === 'hardBreak') return <br key={i} />;
    let node: ReactNode = n.text;
    for (const m of n.marks ?? []) {
      if (m.type === 'bold') node = <strong>{node}</strong>;
      else if (m.type === 'italic') node = <em>{node}</em>;
      else if (m.type === 'underline') node = <u>{node}</u>;
      else if (m.type === 'strike') node = <s>{node}</s>;
      else if (m.type === 'link') node = <a href={m.attrs.href} target="_blank" rel="noopener noreferrer">{node}</a>;
    }
    return <span key={i}>{node}</span>;
  });
}

function blocks(list: RichBlock[]): ReactNode[] {
  return list.map((b, i) => {
    if (b.type === 'bulletList') return <ul key={i}>{b.content.map((it, j) => <li key={j}>{blocks(it.content)}</li>)}</ul>;
    if (b.type === 'orderedList') return <ol key={i}>{b.content.map((it, j) => <li key={j}>{blocks(it.content)}</li>)}</ol>;
    const tb = b as { attrs?: { textAlign?: TextAlign }; content?: RichInline[] };
    const style = tb.attrs?.textAlign ? { textAlign: tb.attrs.textAlign } : undefined;
    return b.type === 'heading'
      ? <h3 key={i} style={style}>{inline(tb.content)}</h3>
      : <p key={i} style={style}>{inline(tb.content)}</p>;
  });
}

export default function RichTextView({ doc, className = 'rich-text' }: { doc: RichDoc; className?: string }) {
  return <div className={className}>{blocks(doc.content)}</div>;
}
