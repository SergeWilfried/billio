import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { DEFAULT_CONFIG, FONT_FAMILIES, PRESETS, accentDark, accentTint, mixHex, normalizeConfig, paperBands, pdfFont } from '@/lib/invoice-template';
import { registerPdfFonts } from '@/lib/pdf-fonts';
import { qrMatrix, qrRuns } from '@/lib/certification';
import { InvoicePDFDocument, type InvoicePDFProps } from '@/components/InvoicePDF';

describe('header and footer bands', () => {
  it('are on by default, also for templates saved before them', () => {
    expect(DEFAULT_CONFIG.bands).toBe(true);
    const old = normalizeConfig({ layout: 'classic', color: '#185FA5' });
    expect(old.bands).toBe(true);
    expect(old.bandColor).toBe('#F3F4F6');
  });
  it('keep a switched-off choice and refuse a tint outside the list', () => {
    expect(normalizeConfig({ bands: false }).bands).toBe(false);
    expect(normalizeConfig({ bandColor: '#000000' }).bandColor).toBe('#F3F4F6');
    expect(normalizeConfig({ bandColor: '#EEF2F7' }).bandColor).toBe('#EEF2F7');
  });
  it('apply to Classique and Minimal only', () => {
    const on = { bands: true, bandColor: '#F3F4F6' };
    expect(paperBands({ ...on, layout: 'classic' })).toBe('#F3F4F6');
    expect(paperBands({ ...on, layout: 'minimal' })).toBe('#F3F4F6');
    expect(paperBands({ ...on, layout: 'band' })).toBeNull();
    expect(paperBands({ ...on, layout: 'sidebar' })).toBeNull();
    expect(paperBands({ ...on, layout: 'receipt' })).toBeNull();
    expect(paperBands({ ...on, bands: false, layout: 'classic' })).toBeNull();
  });
});

describe('normalizeConfig', () => {
  it('keeps a valid config as is', () => {
    for (const p of PRESETS) expect(normalizeConfig(p.config)).toEqual(p.config);
  });

  it('falls back to the default for missing or malformed values', () => {
    expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig('nope')).toEqual(DEFAULT_CONFIG);
    const c = normalizeConfig({ layout: 'poster', color: 'red', fontFamily: 'Comic Sans', density: 7, showSignature: 'yes', footer: 42 });
    expect(c).toEqual(DEFAULT_CONFIG);
  });

  it('keeps known values and caps the footer', () => {
    const c = normalizeConfig({ layout: 'sidebar', color: '#5B2D8E', fontFamily: FONT_FAMILIES.lora, footer: 'x'.repeat(500) });
    expect(c.layout).toBe('sidebar');
    expect(c.color).toBe('#5B2D8E');
    expect(pdfFont(c.fontFamily)).toBe('Lora');
    expect(c.footer).toHaveLength(200);
  });
});

describe('accent colours', () => {
  it('mixes like CSS color-mix', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(accentTint('#185FA5')).toBe('#e6edf5');
    expect(accentDark('#185FA5')).toBe('#12467a');
  });
});

describe('QR code', () => {
  it('encodes text as a square matrix with finder patterns', () => {
    const m = qrMatrix('https://example.invalid/verify?c=TX-1');
    expect(m.size).toBeGreaterThanOrEqual(21);
    // Top-left finder pattern: dark border, light ring, dark centre
    expect(m.dark(0, 0)).toBe(true);
    expect(m.dark(6, 6)).toBe(true);
    expect(m.dark(1, 1)).toBe(false);
    expect(m.dark(3, 3)).toBe(true);
  });

  it('draws exactly the dark modules as runs', () => {
    const m = qrMatrix('SECEF-BF-000123');
    const runs = qrRuns(m);
    let dark = 0;
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.dark(x, y)) dark++;
    expect(runs.reduce((n, r) => n + r.w, 0)).toBe(dark);
    expect(runs.every(r => r.w > 0 && r.x + r.w <= m.size)).toBe(true);
  });
});

describe('invoice PDF', () => {
  // The app loads the fonts by URL; under Node they are read from disk
  const mod = (path: string) => decodeURIComponent(new URL(`../../../node_modules/${path}`, import.meta.url).pathname);
  const file = (pkg: string, w: number, style = 'normal') => mod(`@fontsource/${pkg}/files/${pkg}-latin-${w}-${style}.woff`);
  registerPdfFonts({
    Jakarta: [file('plus-jakarta-sans', 400), file('plus-jakarta-sans', 700), file('plus-jakarta-sans', 400, 'italic'), file('plus-jakarta-sans', 700, 'italic')],
    Grotesk: [file('space-grotesk', 400), file('space-grotesk', 700)],
    Lora:    [file('lora', 400), file('lora', 700), file('lora', 400, 'italic'), file('lora', 700, 'italic')],
    Plex:    [mod('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Regular.woff'),
              mod('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Bold.woff'),
              mod('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Italic.woff'),
              mod('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-BoldItalic.woff')],
  });

  const props: InvoicePDFProps = {
    invoice: { id: 'BR-1A2B3C4D5E6F7A8B', number: 'FACT-2026-0012', subject: 'Audit', client: 'TK', issued: '2026-11-10', due: '2026-11-24', amount: 118000, status: 'pending', discountPct: 0, firstIssuedAt: '2026-11-10T09:30:00Z', issuedByName: 'Awa Ouédraogo' },
    lines: Array.from({ length: 40 }, (_, i) => ({ id: String(i), desc: `Prestation ${i + 1}`, unit: 'u', qty: 1, price: 2950 })),
    client: { name: 'TechKonsult', city: 'Ouagadougou', ifu: '00067890C', rccm: 'BF-OUA-2020-B-5678' },
    biz: { name: 'Studio Wend', address: 'Av. Kwame Nkrumah', city: 'Ouagadougou', country: 'Burkina Faso', email: 'a@b.bf', phone: '70', ifu: '00012345B', rccm: 'BF-OUA-2021-B-1234', taxRegime: 'RNI', divisionFiscale: 'DME Centre', cadastralRef: '01234567890' },
    paymentMethods: [{ label: 'Virement bancaire', value: 'BF00 0000' }],
  };

  // Every preset (each layout, font, table and total style) renders, over several pages
  it.each(PRESETS.map(p => [p.key, p.config] as const))('renders the %s template', async (_key, template) => {
    const buf = await renderToBuffer(createElement(InvoicePDFDocument, { ...props, template }) as Parameters<typeof renderToBuffer>[0]);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(5000);
  }, 30000);

  // A credit note (« FACTURE D'AVOIR », PRO-168) renders in every layout
  it.each(PRESETS.map(p => [p.key, p.config] as const))('renders a credit note in the %s template', async (_key, template) => {
    const buf = await renderToBuffer(createElement(InvoicePDFDocument, {
      ...props, template, lines: props.lines.slice(0, 2), title: 'Facture d’avoir', documentKind: 'avoir', clientLabel: 'Avoir au profit de',
      invoice: { ...props.invoice, id: 'AV-0003', number: 'AV-2026-0001', amount: 6962 },
      creditNote: { nature: 'RAM · Après paiement ou livraison', originalRef: 'FACT-2026-0012', originalIssued: '2026-11-10', reason: 'Prestation non rendue' },
    }) as Parameters<typeof renderToBuffer>[0]);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 30000);

  // A certified invoice prints its SECeF block in every layout
  it.each(PRESETS.map(p => [p.key, p.config] as const))('prints the SECeF block in the %s template', async (_key, template) => {
    const certification = { secefId: 'SECEF-BF-000123', transactionCode: 'TX-9F2A-77C1', qrPayload: 'https://example.invalid/verify?c=TX-9F2A-77C1', certifiedAt: '2026-11-10T09:30:00Z' };
    const buf = await renderToBuffer(createElement(InvoicePDFDocument, { ...props, lines: props.lines.slice(0, 3), template, certification }) as Parameters<typeof renderToBuffer>[0]);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const plain = await renderToBuffer(createElement(InvoicePDFDocument, { ...props, lines: props.lines.slice(0, 3), template }) as Parameters<typeof renderToBuffer>[0]);
    expect(buf.length).toBeGreaterThan(plain.length);
  }, 30000);

  // Long notes continue on the next page instead of disappearing
  it('lets long notes run onto more pages', async () => {
    const pages = (b: Buffer) => (b.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    const para = (text: string) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] });
    const long = { type: 'doc' as const, content: [
      ...Array.from({ length: 80 }, (_, i) => para(`Condition ${i + 1} : paiement par virement, référence de la facture rappelée.`)),
      { type: 'bulletList' as const, content: [{ type: 'listItem' as const, content: [{ type: 'paragraph' as const, content: Array.from({ length: 40 }, (_, i) => i % 2 ? { type: 'hardBreak' as const } : { type: 'text' as const, text: `Ligne ${i}` }) }] }] },
    ] };
    const short = { ...props, lines: props.lines.slice(0, 3) };
    const withNotes = await renderToBuffer(createElement(InvoicePDFDocument, { ...short, invoice: { ...short.invoice, notes: long } }) as Parameters<typeof renderToBuffer>[0]);
    const without = await renderToBuffer(createElement(InvoicePDFDocument, short) as Parameters<typeof renderToBuffer>[0]);
    expect(pages(without)).toBe(1);
    expect(pages(withNotes)).toBeGreaterThan(1);
  }, 30000);

  // Bands change the drawing (a filled header and footer), on every page
  it('draws the bands only when they are on', async () => {
    const classic = PRESETS[0].config;
    const on = await renderToBuffer(createElement(InvoicePDFDocument, { ...props, template: classic }) as Parameters<typeof renderToBuffer>[0]);
    const off = await renderToBuffer(createElement(InvoicePDFDocument, { ...props, template: { ...classic, bands: false } }) as Parameters<typeof renderToBuffer>[0]);
    expect(on.subarray(0, 5).toString()).toBe('%PDF-');
    expect(on.length).not.toBe(off.length);
  }, 30000);

  // Notes and conditions (PRO-167): bold, italic, underline, links and lists in every font
  it.each(PRESETS.map(p => [p.key, p.config] as const))('prints formatted notes in the %s template', async (_key, template) => {
    const notes = {
      type: 'doc' as const,
      content: [
        { type: 'paragraph' as const, content: [
          { type: 'text' as const, text: 'Paiement à ' },
          { type: 'text' as const, text: '30 jours', marks: [{ type: 'bold' as const }, { type: 'italic' as const }] },
          { type: 'text' as const, text: ' — ' },
          { type: 'text' as const, text: 'conditions', marks: [{ type: 'link' as const, attrs: { href: 'https://example.invalid/cgv' } }, { type: 'underline' as const }] },
        ] },
        { type: 'bulletList' as const, content: [{ type: 'listItem' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Pénalités : 1 %', marks: [{ type: 'italic' as const }] }] }] }] },
      ],
    };
    const short = { ...props, lines: props.lines.slice(0, 3) };
    const buf = await renderToBuffer(createElement(InvoicePDFDocument, { ...short, template, invoice: { ...short.invoice, notes } }) as Parameters<typeof renderToBuffer>[0]);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const plain = await renderToBuffer(createElement(InvoicePDFDocument, { ...short, template }) as Parameters<typeof renderToBuffer>[0]);
    expect(buf.length).not.toBe(plain.length);
  }, 30000);
});
