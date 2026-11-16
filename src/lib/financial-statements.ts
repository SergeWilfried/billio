// Income statement and balance sheet from the trial balance (PRO-180).
// Every account lands in exactly one heading, by its SYSCOHADA class, so
// nothing is left out; the two statements are checked against the trial
// balance (debit = credit, assets = liabilities with the result).
// Signed balances: debit positive, credit negative.

export interface StatementLine { label: string; amount: number }
export interface StatementSection { title: string; lines: StatementLine[]; total: number }

export interface Statements {
  income: { products: StatementSection; charges: StatementSection; result: number };
  balance: { assets: StatementSection[]; liabilities: StatementSection[]; totalAssets: number; totalLiabilities: number };
  /** Totals of debit and credit closing balances, as in the trial balance */
  trial: { debit: number; credit: number };
  /** The statements agree with the trial balance and with each other */
  tied: boolean;
  /** Turnover (class 70), for the IS minimum */
  turnover: number;
}

const PRODUCTS: [RegExp, string][] = [
  [/^70/, 'Ventes et prestations (70)'],
  [/^7[1-6]/, 'Autres produits d’exploitation (71–76)'],
  [/^77/, 'Revenus financiers (77)'],
  [/^7[89]/, 'Transferts et reprises (78–79)'],
  [/^8[2468]/, 'Produits hors activités ordinaires (82, 84, 86, 88)'],
];
const CHARGES: [RegExp, string][] = [
  [/^60/, 'Achats (60)'],
  [/^61/, 'Transports (61)'],
  [/^6[23]/, 'Services extérieurs (62–63)'],
  [/^64/, 'Impôts et taxes (64)'],
  [/^65/, 'Autres charges (65)'],
  [/^66/, 'Charges de personnel (66)'],
  [/^67/, 'Frais financiers (67)'],
  [/^6[89]/, 'Dotations (68–69)'],
  [/^8[1357]/, 'Charges hors activités ordinaires (81, 83, 85, 87)'],
  [/^89/, 'Impôts sur le résultat (89)'],
];

function group(rows: { num: string; amount: number }[], rules: [RegExp, string][], other: string): StatementLine[] {
  const lines = new Map<string, number>();
  for (const r of rows) {
    if (!r.amount) continue;
    const label = rules.find(([re]) => re.test(r.num))?.[1] ?? other;
    lines.set(label, (lines.get(label) ?? 0) + r.amount);
  }
  const order = [...rules.map(([, l]) => l), other];
  return order.filter(l => lines.has(l)).map(label => ({ label, amount: lines.get(label)! }));
}

const section = (title: string, lines: StatementLine[]): StatementSection =>
  ({ title, lines, total: lines.reduce((s, l) => s + l.amount, 0) });

export function buildStatements(nums: string[], signedOf: (num: string) => number): Statements {
  const rows = nums.map(num => ({ num, signed: Math.round(signedOf(num)) })).filter(r => r.signed !== 0);

  // Income statement: classes 6, 7, 8 (products are credit balances)
  const pl = rows.filter(r => /^[678]/.test(r.num));
  const isProduct = (n: string) => /^7/.test(n) || /^8[2468]/.test(n);
  const products = section('Produits', group(pl.filter(r => isProduct(r.num)).map(r => ({ num: r.num, amount: -r.signed })), PRODUCTS, 'Autres produits'));
  const charges = section('Charges', group(pl.filter(r => !isProduct(r.num)).map(r => ({ num: r.num, amount: r.signed })), CHARGES, 'Autres charges'));
  const result = products.total - charges.total;

  // Balance sheet: classes 1 to 5 (and anything else), each on its side
  const bs = rows.filter(r => !/^[678]/.test(r.num));
  const debit = (re: RegExp) => bs.filter(r => re.test(r.num) && r.signed > 0);
  const credit = (re: RegExp) => bs.filter(r => re.test(r.num) && r.signed < 0);
  const sum = (rs: { signed: number }[]) => rs.reduce((s, r) => s + r.signed, 0);
  const line = (label: string, amount: number): StatementLine[] => amount ? [{ label, amount }] : [];

  const fixedGross = sum(bs.filter(r => /^2/.test(r.num) && !/^2[89]/.test(r.num)));
  const fixedDep = sum(bs.filter(r => /^2[89]/.test(r.num)));
  const assets: StatementSection[] = [
    section('Actif immobilisé', [...line('Immobilisations brutes (20–27)', fixedGross), ...line('Amortissements et dépréciations (28–29)', fixedDep)]),
    section('Actif circulant', [
      ...line('Stocks (3)', sum(bs.filter(r => /^3/.test(r.num)))),
      ...line('Clients (41)', sum(debit(/^41/))),
      ...line('Autres créances (40, 42–49)', sum(debit(/^4(?!1)/))),
    ]),
    section('Trésorerie — actif', line('Banques et caisse (5)', sum(debit(/^5/)))),
    section('Autres comptes débiteurs', line('Comptes hors classes 1 à 8', sum(debit(/^[09]/)))),
  ].filter(s => s.lines.length);

  const equity = -sum(bs.filter(r => /^1[0-5]/.test(r.num)));
  const liabilities: StatementSection[] = [
    section('Capitaux propres', [...line('Capital, réserves, report (10–15)', equity), ...line('Résultat de l’exercice (provisoire)', result)]),
    section('Dettes financières', line('Emprunts et dettes (16–19)', -sum(bs.filter(r => /^1[6-9]/.test(r.num))))),
    section('Passif circulant', [
      ...line('Fournisseurs (40)', -sum(credit(/^40/))),
      ...line('Dettes fiscales et sociales (42–44)', -sum(credit(/^4[2-4]/))),
      ...line('Autres dettes et dépréciations (41, 45–49)', -sum(credit(/^4[15-9]/))),
    ]),
    section('Trésorerie — passif', line('Concours bancaires (5)', -sum(credit(/^5/)))),
    section('Autres comptes créditeurs', line('Comptes hors classes 1 à 8', -sum(credit(/^[09]/)))),
  ].filter(s => s.lines.length);

  const totalAssets = assets.reduce((s, x) => s + x.total, 0);
  const totalLiabilities = liabilities.reduce((s, x) => s + x.total, 0);
  const trial = {
    debit: rows.filter(r => r.signed > 0).reduce((s, r) => s + r.signed, 0),
    credit: -rows.filter(r => r.signed < 0).reduce((s, r) => s + r.signed, 0),
  };
  const turnover = -sum(rows.filter(r => /^70/.test(r.num)));
  return {
    income: { products, charges, result },
    balance: { assets, liabilities, totalAssets, totalLiabilities },
    trial,
    tied: Math.abs(trial.debit - trial.credit) < 1 && Math.abs(totalAssets - totalLiabilities) < 1,
    turnover,
  };
}
