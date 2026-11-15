import { describe, expect, it } from 'vitest';
import { creditIssueProblem, creditLines, creditTotals, creditableAmount, creditableQty, invoiceChargedVat } from '@/lib/credit-note';
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
