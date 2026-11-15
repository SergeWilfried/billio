import { describe, expect, it } from 'vitest';
import { amountTotals, creditIssueProblem, creditLines, creditTotals, creditableAmount, creditableQty, invoiceChargedVat, reconcileFinalCredit, vatFromSalesEntry } from '@/lib/credit-note';
import { documentAmounts } from '@/lib/document-amounts';
import { docRows, invoiceRows } from '@/lib/sales-tables';
import type { CreditNote, Invoice, LineItem } from '@/lib/schemas';

const line = (id: string, desc: string, qty: number, price: number): LineItem => ({ id, desc, qty, price, unit: 'jour' });
const invLines = [line('a', 'Intégration', 1, 2_500_000), line('b', 'Formation', 3, 150_000), line('c', 'Support', 4, 20_000)];
const cn = (over: Partial<CreditNote>): CreditNote => ({ id: 'AV-1', invoiceId: 'F-42', subject: '', client: 'SB', issued: '2026-11-20', amount: 0, reason: '', status: 'issued', lines: [], discountPct: 0, ...over });
const invoice = (over: Partial<Invoice> = {}): Invoice => ({ id: 'F-42', subject: 'API', client: 'SB', issued: '2026-11-15', due: '2026-11-29', amount: 3_396_630, status: 'pending', discountPct: 5, ...over });

describe('what is left to credit', () => {
  it('takes off the quantities of issued credit notes, per line', () => {
    const earlier = cn({ lines: [{ id: 'x', desc: 'Formation', unit: 'jour', qty: 1, price: 150_000, sourceId: 'b' }] });
    expect(creditableQty(invLines, [earlier])).toEqual({ a: 1, b: 2, c: 4 });
  });
  it('counts older credit notes (no lines) in the amount only', () => {
    expect(creditableQty(invLines, [cn({ amount: 100_000 })])).toEqual({ a: 1, b: 3, c: 4 });
    expect(creditableAmount(invoice(), [cn({ amount: 100_000 })])).toBe(3_296_630);
  });
});

describe('credit note totals', () => {
  it('applies the invoice discount and VAT to the credited lines (the mockup example)', () => {
    const lines = creditLines(invLines, { b: 1, c: 2 });
    expect(lines.map(l => [l.sourceId, l.qty])).toEqual([['b', 1], ['c', 2]]);
    const t = creditTotals(lines, { discountPct: 5 }, true);
    expect([t.subtotal, t.discount, t.net, t.tax, t.total]).toEqual([190_000, 9_500, 180_500, 32_490, 212_990]);
  });
  it('crediting everything gives back the invoice total', () => {
    const t = creditTotals(creditLines(invLines, { a: 1, b: 3, c: 4 }), { discountPct: 5 }, true);
    expect(t.total).toBe(invoice().amount);
  });
  it('reads the VAT from the invoice total, not today’s regime', () => {
    expect(invoiceChargedVat(invoice(), invLines, false)).toBe(true);
    expect(invoiceChargedVat(invoice({ amount: 2_878_500 }), invLines, true)).toBe(false);
  });
});

describe('creditIssueProblem', () => {
  const ok = { nature: 'RAM' as const, reason: 'Retour', total: 1000, max: 5000, paid: 0 };
  it('needs a nature, a reason and an amount within what is left', () => {
    expect(creditIssueProblem(ok)).toBeNull();
    expect(creditIssueProblem({ ...ok, nature: '' })).toMatch(/nature/);
    expect(creditIssueProblem({ ...ok, reason: '  ' })).toMatch(/motif/);
    expect(creditIssueProblem({ ...ok, total: 0 })).toMatch(/quantité/);
    expect(creditIssueProblem({ ...ok, total: 6000 })).toMatch(/dépasse/);
  });
  it('refuses RAN once the invoice received a payment', () => {
    expect(creditIssueProblem({ ...ok, nature: 'RAN' })).toBeNull();
    expect(creditIssueProblem({ ...ok, nature: 'RAN', paid: 1 })).toMatch(/RAM/);
  });
});

describe('docRows', () => {
  it('puts each credit note just above its invoice, newest first, and orphans last', () => {
    const invs = [invoice({ id: 'F-43' }), invoice()];
    const rows = docRows(invoiceRows(invs, [], []), [
      cn({ id: 'AV-1', issued: '2026-11-18' }), cn({ id: 'AV-2', issued: '2026-11-20' }), cn({ id: 'AV-9', invoiceId: 'GONE' }),
    ], invs);
    expect(rows.map(r => r.kind === 'credit' ? r.creditNote.id : r.id)).toEqual(['F-43', 'AV-2', 'AV-1', 'F-42', 'AV-9']);
    const first = rows[1];
    expect(first.kind === 'credit' && first.origin?.id).toBe('F-42');
  });
});

describe('reconcileFinalCredit', () => {
  // Two units at 10 005 with 5 % discount, no VAT: the invoice is 19 009, each one-unit credit 9 505
  const two = [line('u', 'Unité', 2, 10_005)];
  const inv = { amount: 19_009, discountPct: 5 };
  it('lets the last credit take exactly what is left', () => {
    const first = creditTotals(creditLines(two, { u: 1 }), inv, false);
    expect(first.total).toBe(9_505);
    const left = creditableAmount(inv, [cn({ amount: first.total })]);
    expect(left).toBe(9_504);
    const last = reconcileFinalCredit(creditTotals(creditLines(two, { u: 1 }), inv, false), { emptiesInvoice: true, left, chargedVat: false, tolerance: 4 });
    expect(last.total).toBe(9_504);
    expect(last.net).toBe(9_504);
    expect(creditIssueProblem({ nature: 'RAM', reason: 'Retour', total: last.total, max: left, paid: 0 })).toBeNull();
  });
  it('puts the gap in the VAT when VAT was charged, and leaves a large gap to the checks', () => {
    const t = creditTotals(creditLines(invLines, { b: 1 }), { discountPct: 5 }, true);
    expect(reconcileFinalCredit(t, { emptiesInvoice: true, left: t.total - 1, chargedVat: true, tolerance: 2 }).tax).toBe(t.tax - 1);
    expect(reconcileFinalCredit(t, { emptiesInvoice: true, left: t.total - 500, chargedVat: true, tolerance: 2 })).toEqual(t);
    expect(reconcileFinalCredit(t, { emptiesInvoice: false, left: t.total - 1, chargedVat: true, tolerance: 2 })).toEqual(t);
  });
});

describe('credit note amounts on the PDF', () => {
  it('prints the stored total of an amount-only note (no franc lost or added by rounding)', () => {
    const ht = amountTotals(10_000, true).net;
    expect(ht + Math.round(ht * 0.18)).not.toBe(10_000); // does not round-trip on its own
    expect(documentAmounts(ht, 0, true, 10_000).total).toBe(10_000);
    expect(documentAmounts(ht, 0, true, 10_000).tax).toBe(1_525);
  });
  it('prints a reconciled last credit as stored, without VAT too', () => {
    const a = documentAmounts(10_005, 5, false, 9_504);
    expect([a.discountAmt, a.total]).toEqual([501, 9_504]);
    // Without a stored total, the usual rounding
    expect(documentAmounts(10_005, 5, false).total).toBe(9_505);
  });
});

describe('vatFromSalesEntry', () => {
  const entry = (piece: string, lines: { acct: string; d: number; c: number }[]) => ({ piece, lines });
  it('reads the VAT of an invoice without lines from its sales entry, whatever the regime today', () => {
    expect(vatFromSalesEntry([entry('VE-F-1', [{ acct: '411', d: 118, c: 0 }, { acct: '706', d: 0, c: 100 }, { acct: '443', d: 0, c: 18 }])], 'F-1')).toBe(true);
    expect(vatFromSalesEntry([entry('VE-F-1', [{ acct: '411', d: 100, c: 0 }, { acct: '706', d: 0, c: 100 }])], 'F-1')).toBe(false);
    // A credit note's own entry or another invoice's doesn't count; none found: unknown
    expect(vatFromSalesEntry([entry('AV-AV-1', [{ acct: '443', d: 18, c: 0 }]), entry('VE-F-2', [{ acct: '443', d: 0, c: 18 }])], 'F-1')).toBeNull();
  });
});
