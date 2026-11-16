import { describe, expect, it } from 'vitest';
import {
  accountLedger, balanceFns, balanceOnLine, draftsInMonth, entryProblem, entrySource, exerciseMovements,
  exerciseResult, isOpeningEntry, monthState, nextPiece, plannedDepreciation, withUnlisted,
} from '@/lib/ledger';
import { buildStatements } from '@/lib/financial-statements';
import type { JournalEntry } from '@/lib/accounting-data';

const e = (id: string, date: string, piece: string, lines: [string, number, number][], posted = true, journal = 'OD'): JournalEntry =>
  ({ id, journal, date, piece, label: id, posted, lines: lines.map(([acct, d, c]) => ({ acct, d, c })) });

const entries: JournalEntry[] = [
  e('an', '2026-01-01', 'AN-2026-001', [['521', 1000, 0], ['101', 0, 1000]]),
  e('sale', '2026-03-10', 'VE-F1', [['411', 1180, 0], ['706', 0, 1000], ['443', 0, 180]], true, 'VE'),
  e('pay', '2026-03-20', 'REG-F1', [['521', 1180, 0], ['411', 0, 1180]], true, 'BQ'),
  e('draft', '2026-03-25', 'OD-2026-004', [['622', 300, 0], ['401', 0, 300]], false),
  e('old', '2025-12-30', 'OD-2025-099', [['521', 50, 0], ['706', 0, 50]]),
];
const opening = { '521': 1000, '101': -1000 };

describe('exercise balances', () => {
  it('leaves the opening entry, other years and drafts out of the movements', () => {
    const m = exerciseMovements(entries, 2026);
    expect(m.get('521')).toEqual({ debit: 1180, credit: 0 });
    expect(m.get('101')).toBeUndefined();
    expect(m.get('622')).toBeUndefined();
    expect(isOpeningEntry({ piece: 'AN-2026-001' })).toBe(true);
  });

  it('counts drafts when asked (« Inclure brouillons »)', () => {
    expect(exerciseMovements(entries, 2026, { includeDraft: true }).get('622')).toEqual({ debit: 300, credit: 0 });
  });

  it('gives opening + movements, and lists every used account', () => {
    const f = balanceFns(exerciseMovements(entries, 2026), opening);
    expect(f.signedOf('521')).toBe(2180);
    expect(f.signedOf('411')).toBe(0);
    expect(f.accountNums()).toEqual(['101', '411', '443', '521', '706']);
    expect(exerciseResult(f.signedOf, f.accountNums())).toBe(1000);
  });

  it('builds a ledger from the opening balance', () => {
    const l = accountLedger(entries, '521', 2026, 1000);
    expect(l.map(r => r.running)).toEqual([2180]);
  });

  it('lists accounts used in the books but missing from the chart', () => {
    const list = withUnlisted([{ num: '521', label: 'Banque', nature: 'D' as const }], ['521', '4431']);
    expect(list.map(a => a.num)).toEqual(['4431', '521']);
    expect(list[0].label).toMatch(/non répertorié/);
  });
});

describe('Journaux helpers', () => {
  it('tells where an entry comes from by its piece', () => {
    expect(entrySource({ piece: 'VE-F1', journal: 'VE' })).toBe('Facture');
    expect(entrySource({ piece: 'VE-F1-R2', journal: 'VE' })).toBe('Correction de facture');
    expect(entrySource({ piece: 'AV-12', journal: 'VE' })).toBe('Avoir');
    expect(entrySource({ piece: 'REG-F1', journal: 'BQ' })).toBe('Règlement');
    expect(entrySource({ piece: 'AN-2026-001', journal: 'OD' })).toBe('À-nouveaux');
    expect(entrySource({ piece: 'FRN-0461', journal: 'AC' })).toBe('Facture fournisseur');
    expect(entrySource({ piece: 'OD-2026-004', journal: 'OD' })).toBe('Saisie');
  });

  it('proposes the journal’s next piece for the year', () => {
    expect(nextPiece(entries, 'OD', 2026)).toBe('OD-2026-005');
    expect(nextPiece(entries, 'CA', 2026)).toBe('CA-2026-001');
  });
});

describe('typed entry checks', () => {
  const ok = [{ acct: '622', debit: 150, credit: 0 }, { acct: '401', debit: 0, credit: 150 }];
  it('accepts a balanced entry with a label', () => {
    expect(entryProblem({ label: 'Loyer', lines: ok, periodClosed: false })).toBeNull();
  });
  it('refuses what can’t be posted', () => {
    expect(entryProblem({ label: '', lines: ok, periodClosed: false })).toMatch(/libellé/);
    expect(entryProblem({ label: 'L', lines: ok, periodClosed: true })).toMatch(/clôturé/);
    expect(entryProblem({ label: 'L', lines: [...ok, { acct: '', debit: 10, credit: 0 }], periodClosed: false })).toMatch(/compte/);
    expect(entryProblem({ label: 'L', lines: [{ acct: '622', debit: 10, credit: 10 }, ok[1]], periodClosed: false })).toMatch(/pas les deux/);
    expect(entryProblem({ label: 'L', lines: [ok[0]], periodClosed: false })).toMatch(/deux lignes/);
    expect(entryProblem({ label: 'L', lines: [ok[0], { acct: '401', debit: 0, credit: 100 }], periodClosed: false })).toMatch(/écart de 50/);
  });
  it('balances on the chosen line', () => {
    const lines = [{ acct: '622', debit: 150, credit: 0 }, { acct: '445', debit: 27, credit: 0 }, { acct: '401', debit: 0, credit: 0 }];
    expect(balanceOnLine(lines, 2)[2]).toEqual({ acct: '401', debit: 0, credit: 177 });
  });
});

describe('closing', () => {
  it('counts the drafts of a month', () => {
    expect(draftsInMonth(entries, 2026, 3)).toBe(1);
    expect(draftsInMonth(entries, 2026, 4)).toBe(0);
  });
  it('shows past open months as open, not upcoming', () => {
    expect(monthState({ status: 'open' }, 2026, 9, '2026-11-16')).toBe('open');
    expect(monthState(undefined, 2026, 12, '2026-11-16')).toBe('upcoming');
    expect(monthState({ status: 'closed' }, 2026, 1, '2026-11-16')).toBe('closed');
  });
});

describe('fixed assets', () => {
  it('depreciates on the plan, month by month, up to the gross value', () => {
    const a = { grossValue: 1_200_000, usefulLife: 5, acquisitionDate: '2025-01-15' };
    expect(plannedDepreciation(a, '2026-06-30')).toEqual({ accumulated: 360_000, net: 840_000 });
    expect(plannedDepreciation(a, '2035-01-01').net).toBe(0);
  });
});

describe('financial statements', () => {
  it('ties to the trial balance and leaves no account out', () => {
    const f = balanceFns(exerciseMovements(entries, 2026), { ...opening, '9999': 0 });
    const st = buildStatements([...f.accountNums(), '0001'], n => n === '0001' ? 0 : f.signedOf(n));
    expect(st.income.result).toBe(1000);
    expect(st.balance.totalAssets).toBe(2180);
    expect(st.balance.totalLiabilities).toBe(2180);
    expect(st.tied).toBe(true);
    expect(st.turnover).toBe(1000);
  });

  it('puts an unusual account under « Autres », not nowhere', () => {
    const st = buildStatements(['911', '101'], n => n === '911' ? 500 : -500);
    expect(st.balance.assets.flatMap(s => s.lines).map(l => l.label)).toContain('Comptes hors classes 1 à 8');
    expect(st.tied).toBe(true);
  });
});
