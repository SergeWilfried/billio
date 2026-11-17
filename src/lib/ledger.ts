// The books of one exercise, computed from its journal entries (PRO-180).
//
// Balances used to come from the v_account_balances view, which isn't
// filtered by year, can't leave drafts out or in, and may count the opening
// entry on top of the opening balances. Here everything is read from the
// entries of the exercise: the opening balances come from opening_balances,
// so the opening entry itself (piece « AN-… ») is left out of the movements.
// Kept free of React so it can be tested.

import type { FixedAsset, JournalEntry } from '@/lib/accounting-data';

export interface Movement { debit: number; credit: number }

/** The opening entry posted when the opening balances are adopted (À-nouveaux). */
export const isOpeningEntry = (e: Pick<JournalEntry, 'piece'>) => /^AN[-\s]/i.test(e.piece.trim());

const inYear = (date: string, year: number) => date.slice(0, 4) === String(year);

/** Debit and credit of each account over the exercise, opening entry left out. */
export function exerciseMovements(entries: JournalEntry[], year: number, opts: { includeDraft?: boolean } = {}): Map<string, Movement> {
  const map = new Map<string, Movement>();
  for (const e of entries) {
    if (!inYear(e.date, year) || isOpeningEntry(e) || (!e.posted && !opts.includeDraft)) continue;
    for (const l of e.lines) {
      const m = map.get(l.acct);
      if (m) { m.debit += l.d; m.credit += l.c; } else map.set(l.acct, { debit: l.d, credit: l.c });
    }
  }
  return map;
}

/** Lookups over an exercise: opening, movements and closing (signed, debit positive) per account. */
export function balanceFns(movements: Map<string, Movement>, opening: Record<string, number>) {
  const mvtOf = (num: string): Movement => movements.get(num) ?? { debit: 0, credit: 0 };
  const openingOf = (num: string) => opening[num] ?? 0;
  const signedOf = (num: string) => { const m = mvtOf(num); return openingOf(num) + m.debit - m.credit; };
  /** Every account that has an opening balance or a movement */
  const accountNums = () => [...new Set([...Object.keys(opening), ...movements.keys()])].sort();
  return { mvtOf, openingOf, signedOf, accountNums };
}

export interface LedgerLine { entry: JournalEntry; d: number; c: number; running: number }

/** One account's ledger over the exercise, from its opening balance. */
export function accountLedger(entries: JournalEntry[], num: string, year: number, opening: number, opts: { includeDraft?: boolean } = {}): LedgerLine[] {
  const rows: LedgerLine[] = [];
  let running = opening;
  const sorted = entries
    .filter(e => inYear(e.date, year) && !isOpeningEntry(e) && (e.posted || opts.includeDraft))
    .sort((a, b) => a.date.localeCompare(b.date) || a.piece.localeCompare(b.piece));
  for (const e of sorted) {
    for (const l of e.lines) {
      if (l.acct !== num) continue;
      running += l.d - l.c;
      rows.push({ entry: e, d: l.d, c: l.c, running });
    }
  }
  return rows;
}

/** Where an entry comes from, read from its piece and journal until it is stored (PRO-188). */
export function entrySource(e: Pick<JournalEntry, 'piece' | 'journal'>): string {
  const p = e.piece.trim();
  if (isOpeningEntry(e)) return 'À-nouveaux';
  if (/^VE-.+-R\d+$/.test(p)) return 'Correction de facture';
  if (p.startsWith('VE-')) return 'Facture';
  if (p.startsWith('AV-')) return 'Avoir';
  if (p.startsWith('REG-')) return 'Règlement';
  if (e.journal === 'AC') return 'Facture fournisseur';
  return 'Saisie';
}

/** The journal's next piece number for the year: « OD-2026-015 ». */
export function nextPiece(entries: Pick<JournalEntry, 'piece'>[], journal: string, year: number): string {
  const re = new RegExp(`^${journal}-${year}-(\\d+)$`);
  const max = entries.reduce((m, e) => { const r = re.exec(e.piece.trim()); return r ? Math.max(m, Number(r[1])) : m; }, 0);
  return `${journal}-${year}-${String(max + 1).padStart(3, '0')}`;
}

export interface ComposerLine { acct: string; debit: number; credit: number }

/** Why a typed entry can't be saved yet, or null. */
export function entryProblem(opts: { label: string; lines: ComposerLine[]; periodClosed: boolean; piece?: string }): string | null {
  const lines = opts.lines.filter(l => l.acct || l.debit || l.credit);
  if (lines.some(l => !Number.isInteger(l.debit) || !Number.isInteger(l.credit))) return 'Les montants sont des nombres entiers de francs.';
  if (opts.piece && isOpeningEntry({ piece: opts.piece })) return 'Le préfixe « AN- » est réservé aux à-nouveaux : choisissez un autre numéro de pièce.';
  if (!opts.label.trim()) return 'Indiquez le libellé de l’écriture.';
  if (opts.periodClosed) return 'Ce mois est clôturé : choisissez une date dans une période ouverte.';
  if (lines.some(l => !l.acct)) return 'Chaque montant doit avoir un compte.';
  if (lines.some(l => l.debit < 0 || l.credit < 0)) return 'Les montants sont positifs : mettez-les au débit ou au crédit.';
  if (lines.some(l => l.debit > 0 && l.credit > 0)) return 'Une ligne est au débit ou au crédit, pas les deux.';
  const filled = lines.filter(l => l.debit > 0 || l.credit > 0);
  if (filled.length < 2) return 'Une écriture a au moins deux lignes.';
  const d = filled.reduce((s, l) => s + l.debit, 0), c = filled.reduce((s, l) => s + l.credit, 0);
  if (d !== c) return `L’écriture n’est pas équilibrée : écart de ${Math.abs(d - c).toLocaleString('fr-FR')}.`;
  return null;
}

/** The line that balances the entry when put on line `index`: its debit or credit set to the difference of the others. */
export function balanceOnLine(lines: ComposerLine[], index: number): ComposerLine[] {
  const others = lines.filter((_, i) => i !== index);
  const diff = others.reduce((s, l) => s + l.debit - l.credit, 0);
  return lines.map((l, i) => i !== index ? l : diff > 0 ? { ...l, debit: 0, credit: diff } : { ...l, debit: -diff, credit: 0 });
}

/** How many draft entries a month of the exercise has (they block closing it). */
export function draftsInMonth(entries: JournalEntry[], year: number, month: number): number {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return entries.filter(e => !e.posted && e.date.startsWith(prefix)).length;
}

export type MonthState = 'closed' | 'open' | 'upcoming';

/** A month is closed once its period is; else open if it has started, upcoming if not. */
export function monthState(period: { status: 'open' | 'closed' } | undefined, year: number, month: number, today: string): MonthState {
  if (period?.status === 'closed') return 'closed';
  return `${year}-${String(month).padStart(2, '0')}` <= today.slice(0, 7) ? 'open' : 'upcoming';
}

/**
 * Accumulated depreciation of an asset at `asOf` under its straight-line plan
 * (whole years since acquisition, prorated by month), and its net book value.
 * Depreciation isn't posted month by month yet (PRO-188): this is the plan, not
 * what the books hold.
 */
export function plannedDepreciation(asset: Pick<FixedAsset, 'grossValue' | 'usefulLife' | 'acquisitionDate'>, asOf: string): { accumulated: number; net: number } {
  if (!asset.usefulLife || asset.usefulLife <= 0) return { accumulated: 0, net: asset.grossValue };
  // Nothing before the asset is acquired
  if (asOf.slice(0, 10) < asset.acquisitionDate.slice(0, 10)) return { accumulated: 0, net: asset.grossValue };
  const [ay, am] = asset.acquisitionDate.split('-').map(Number);
  const [ty, tm] = asOf.split('-').map(Number);
  const months = Math.max(0, (ty - ay) * 12 + (tm - am) + 1);
  const accumulated = Math.min(asset.grossValue, Math.round(asset.grossValue * months / (asset.usefulLife * 12)));
  return { accumulated, net: asset.grossValue - accumulated };
}

export interface PlannedYear { year: number; annualDepreciation: number; cumulative: number; netValue: number }

/** The plan year by year, from the acquisition year until fully depreciated: the same figures as `plannedDepreciation`. */
export function plannedSchedule(asset: Pick<FixedAsset, 'grossValue' | 'usefulLife' | 'acquisitionDate'>): PlannedYear[] {
  if (!asset.usefulLife || asset.usefulLife <= 0) return [];
  const start = Number(asset.acquisitionDate.slice(0, 4));
  const rows: PlannedYear[] = [];
  let prev = 0;
  for (let y = start; prev < asset.grossValue && y <= start + asset.usefulLife; y++) {
    const { accumulated, net } = plannedDepreciation(asset, `${y}-12-31`);
    rows.push({ year: y, annualDepreciation: accumulated - prev, cumulative: accumulated, netValue: net });
    prev = accumulated;
  }
  return rows;
}

/**
 * The chart's accounts, plus any account used in the books that isn't in it
 * (a typo, or a sub-account): listed so totals and the balance check never
 * leave an amount out.
 */
export function withUnlisted<A extends { num: string; label: string; nature: 'D' | 'C' }>(accounts: A[], usedNums: string[]): Array<A | { num: string; label: string; nature: 'D' | 'C' }> {
  const known = new Set(accounts.map(a => a.num));
  const extra = usedNums.filter(n => !known.has(n)).map(num => ({ num, label: 'Compte non répertorié dans le plan', nature: 'D' as const }));
  return [...accounts, ...extra].sort((a, b) => a.num.localeCompare(b.num));
}

/** The exercise's result: income (class 7) less expenses (class 6), with class 8 (HAO), from signed balances. */
export function exerciseResult(signedOf: (num: string) => number, nums: string[]): number {
  return -nums.filter(n => /^[678]/.test(n)).reduce((s, n) => s + signedOf(n), 0);
}

/**
 * The VAT of the month « YYYY-MM » to declare, from posted entries: collected
 * (443) less deductible (445) less what clients withheld (4449). A sale credits
 * 443 and its credit note debits it back, in the sales journal (VE); a 443
 * debit elsewhere is the VAT settled with the DGI, not lower VAT collected.
 * Likewise for 445 credits outside purchases (AC). The same rule as Fiscalité.
 */
export function monthVat(entries: JournalEntry[], prefix: string): { collected: number; deductible: number; withheld: number; net: number } {
  let collected = 0, deductible = 0, withheld = 0;
  for (const e of entries) {
    if (!e.posted || !e.date.startsWith(prefix)) continue;
    for (const l of e.lines) {
      if (l.acct === '443') collected += l.c - (e.journal === 'VE' ? l.d : 0);
      else if (l.acct === '445') deductible += l.d - (e.journal === 'AC' ? l.c : 0);
      else if (l.acct === '4449') withheld += l.d;
    }
  }
  return { collected, deductible, withheld, net: collected - deductible - withheld };
}
