// The rendered credit note PDF (PRO-168): an amount-only note of 10 000 TTC
// with VAT prints 10 000, in figures and in words, not 10 001 (HT 8 475 alone
// would give VAT 1 526).
import { describe, expect, it, vi } from 'vitest';

const words = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('@/lib/amount-in-words', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/amount-in-words')>();
  return { ...actual, invoiceTotalMention: (...args: Parameters<typeof actual.invoiceTotalMention>) => { words.calls.push(args); return actual.invoiceTotalMention(...args); } };
});
const render = vi.hoisted(() => ({ props: null as unknown }));
vi.mock('@/lib/render-pdf', async () => {
  const [{ createElement }, { renderToBuffer }, { InvoicePDFDocument }] = await Promise.all([import('react'), import('@react-pdf/renderer'), import('@/components/InvoicePDF')]);
  return {
    renderInvoicePdf: async (props: Parameters<typeof InvoicePDFDocument>[0]) => {
      render.props = props;
      const buf = await renderToBuffer(createElement(InvoicePDFDocument, props) as Parameters<typeof renderToBuffer>[0]);
      return new Blob([new Uint8Array(buf)]);
    },
  };
});

import { registerPdfFonts } from '@/lib/pdf-fonts';
import { renderCreditNotePdf } from '@/lib/credit-note-pdf';
import { documentAmounts } from '@/lib/document-amounts';
import type { CreditNote, Invoice } from '@/lib/schemas';

const mod = (path: string) => decodeURIComponent(new URL(`../../../node_modules/${path}`, import.meta.url).pathname);
const file = (pkg: string, w: number, style = 'normal') => mod(`@fontsource/${pkg}/files/${pkg}-latin-${w}-${style}.woff`);
registerPdfFonts({
  Jakarta: [file('plus-jakarta-sans', 400), file('plus-jakarta-sans', 700), file('plus-jakarta-sans', 400, 'italic'), file('plus-jakarta-sans', 700, 'italic')],
  Grotesk: [file('space-grotesk', 400), file('space-grotesk', 700)],
  Lora:    [file('lora', 400), file('lora', 700), file('lora', 400, 'italic'), file('lora', 700, 'italic')],
  Plex:    [mod('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Regular.woff'), mod('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Bold.woff'),
            mod('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Italic.woff'), mod('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-BoldItalic.woff')],
});

describe('credit note PDF', () => {
  it('prints the stored 10 000 TTC of an amount-only note, in figures and in words', async () => {
    const invoice: Invoice = { id: 'F-1', number: 'FACT-2026-0001', subject: 'Audit', client: 'TK', issued: '2026-11-10', due: '2026-11-24', amount: 118_000, status: 'pending', discountPct: 0 };
    const cn: CreditNote = { id: 'AV-1', invoiceId: 'F-1', subject: 'Avoir sur FACT-2026-0001', client: 'TK', issued: '2026-11-20', amount: 10_000, reason: 'Erreur de prix', status: 'issued', nature: 'COR', lines: [], discountPct: 0, number: 'AV-2026-0001' };
    const blob = await renderCreditNotePdf({
      creditNote: cn, invoice, chargedVat: true,
      client: { name: 'TechKonsult', city: 'Ouagadougou' },
      biz: { name: 'Studio Wend', address: '', city: '', country: 'Burkina Faso', email: '', phone: '', ifu: '', rccm: '', taxRegime: 'RNI' } as never,
      template: undefined,
    });
    expect(blob.size).toBeGreaterThan(1000);
    // The total in words is written from the printed total
    expect(words.calls).toContainEqual([10_000, 'avoir']);
    // And the figures the document prints add up to the stored total
    const props = render.props as { lines: { qty: number; price: number }[]; creditNote: { storedTotal: number } };
    const sub = props.lines.reduce((s, l) => s + l.qty * l.price, 0);
    expect(documentAmounts(sub, 0, true, props.creditNote.storedTotal)).toMatchObject({ discountedSub: 8_475, tax: 1_525, total: 10_000 });
  }, 30000);
});
