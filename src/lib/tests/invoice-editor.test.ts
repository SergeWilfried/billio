import { describe, expect, it } from 'vitest';
import { draftProblem, editorTotals, issueProblem, lineProblems } from '@/lib/invoice-editor';
import type { LineItem } from '@/lib/schemas';

const line = (id: string, desc: string, qty: number, price: number): LineItem => ({ id, desc, qty, price, unit: 'unité' });

describe('editorTotals', () => {
  it('applies the discount before VAT and ignores empty lines', () => {
    const t = editorTotals([line('a', 'Conseil', 2, 50_000), line('b', '', 1, 0)], 10, true);
    expect(t).toEqual({ subtotal: 100_000, discount: 10_000, net: 90_000, tax: 16_200, total: 106_200 });
  });
  it('charges no VAT outside the VAT regime', () => {
    expect(editorTotals([line('a', 'Conseil', 1, 50_000)], 0, false).total).toBe(50_000);
  });
});

describe('lineProblems', () => {
  it('flags each bad line, and a zero amount', () => {
    const p = lineProblems([line('a', '', 1, 10), line('b', 'X', 0, 10), line('c', 'Y', 1, 0), line('d', 'Z', 1, 5), line('e', '', 1, 0)]);
    expect(Object.keys(p).sort()).toEqual(['a', 'b', 'c']);
    expect(p.c).toMatch(/Montant nul/);
  });
});

describe('draft and issue checks', () => {
  const ok = [line('a', 'Conseil', 1, 10)];
  it('needs a client, a line and a due date after the billing date', () => {
    expect(draftProblem('', '2026-11-15', '2026-11-29', ok)).toMatch(/client/);
    expect(draftProblem('C1', '2026-11-15', '2026-11-29', [])).toMatch(/ligne/);
    expect(draftProblem('C1', '2026-11-15', '2026-11-01', ok)).toMatch(/échéance/);
    expect(draftProblem('C1', '2026-11-15', '2026-11-29', ok)).toBeNull();
  });
  it('lets a zero line be saved as a draft but not issued', () => {
    const zero = [...ok, line('b', 'Offert', 1, 0)];
    expect(draftProblem('C1', '2026-11-15', '2026-11-29', zero)).toBeNull();
    expect(issueProblem('C1', '2026-11-15', '2026-11-29', zero)).toMatch(/montant nul/);
  });
});
