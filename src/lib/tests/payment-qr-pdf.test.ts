// The payment QR code on the invoice PDF (PRO-171): « Scanner pour payer »
// beside the payment methods when the invoice has a payment link, and nothing
// without one. The texts are read from the PDF's layout.
import { describe, expect, it } from 'vitest';
import { cloneElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePDFDocument } from '@/components/InvoicePDF';
import { registerPdfFonts } from '@/lib/pdf-fonts';
import type { Invoice } from '@/lib/schemas';

const mod = (path: string) => decodeURIComponent(new URL(`../../../node_modules/${path}`, import.meta.url).pathname);
const file = (pkg: string, w: number, style = 'normal') => mod(`@fontsource/${pkg}/files/${pkg}-latin-${w}-${style}.woff`);
registerPdfFonts({
  Jakarta: [file('plus-jakarta-sans', 400), file('plus-jakarta-sans', 700), file('plus-jakarta-sans', 400, 'italic'), file('plus-jakarta-sans', 700, 'italic')],
  Grotesk: [file('space-grotesk', 400), file('space-grotesk', 700)],
  Lora:    [file('lora', 400), file('lora', 700), file('lora', 400, 'italic'), file('lora', 700, 'italic')],
  Plex:    [mod('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Regular.woff'), mod('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Bold.woff'),
            mod('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Italic.woff'), mod('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-BoldItalic.woff')],
});

type Node = { lines?: { string?: string }[]; children?: Node[] };
const collect = (n: Node | undefined, out: string[]) => {
  for (const l of n?.lines ?? []) if (l.string) out.push(l.string.replace(/[\s  ]+/g, ' ').trim());
  for (const c of n?.children ?? []) collect(c, out);
};

async function printedTexts(props: Parameters<typeof InvoicePDFDocument>[0]): Promise<string[]> {
  let texts: string[] = [];
  const doc = InvoicePDFDocument(props) as Parameters<typeof cloneElement>[0];
  const onRender = (d: { _INTERNAL__LAYOUT__DATA_?: Node }) => { texts = []; collect(d._INTERNAL__LAYOUT__DATA_, texts); };
  await renderToBuffer(cloneElement(doc, { onRender } as never) as Parameters<typeof renderToBuffer>[0]);
  return texts;
}

const invoice: Invoice = { id: 'F-1', number: 'FACT-2026-0001', subject: 'Audit', client: 'TK', issued: '2026-11-10', due: '2026-11-24', amount: 118_000, status: 'pending', discountPct: 0 };
const base = {
  invoice,
  lines: [{ id: 'l1', desc: 'Audit', unit: 'forfait', qty: 1, price: 100_000 }],
  client: { name: 'TechKonsult', city: 'Ouagadougou' },
  biz: { name: 'Studio Wend', country: 'Burkina Faso', taxRegime: 'RNI' } as never,
  paymentMethods: [{ label: 'Orange Money', value: '70 00 00 00' }],
};

describe('payment QR code on the PDF', () => {
  it('prints « Scanner pour payer » with a payment link', async () => {
    // The caption wraps under the narrow QR code: its lines are read together
    expect((await printedTexts({ ...base, paymentUrl: 'https://billio.app/payer/abc' })).join(' ')).toContain('Scanner pour payer');
  }, 30000);

  it('prints nothing without a payment link, or on a paid invoice', async () => {
    expect((await printedTexts(base)).join(' ')).not.toContain('Scanner');
    expect((await printedTexts({ ...base, invoice: { ...invoice, status: 'paid' }, paymentUrl: 'https://billio.app/payer/abc' })).join(' ')).not.toContain('Scanner');
  }, 30000);
});
