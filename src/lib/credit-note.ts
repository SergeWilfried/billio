// Credit notes (« factures d'avoir », PRO-168 and PRO-143): their natures, and
// what the invoice editor computes in credit note mode. Kept free of React so
// it can be tested.

import { filledLines } from '@/lib/line-validation';
import { documentHasVat, splitTtc } from '@/lib/vat';
import { editorTotals, type EditorTotals } from '@/lib/invoice-editor';
import type { CreditNote, Invoice, LineItem } from '@/lib/schemas';

export type CreditNature = NonNullable<CreditNote['nature']>;
export type CreditLine = CreditNote['lines'][number];

export const CREDIT_NATURES: readonly { code: CreditNature; label: string; hint: string }[] = [
  { code: 'COR', label: 'Correction', hint: 'Une erreur de prix, de quantité ou de mention' },
  { code: 'RAN', label: 'Annulation', hint: 'La facture est annulée avant tout paiement ou livraison' },
  { code: 'RAM', label: 'Après paiement ou livraison', hint: 'Retour, prestation non rendue, après paiement ou livraison' },
  { code: 'RRR', label: 'Rabais, remise, ristourne', hint: 'Un geste commercial accordé après coup' },
];

export const natureLabel = (code: CreditNature): string => {
  const n = CREDIT_NATURES.find(x => x.code === code);
  return n ? `${n.code} · ${n.label}` : code;
};

/**
 * How much of each invoice line is left to credit, by line id: what was
 * invoiced less what issued credit notes already credited on that line.
 * Credit notes from before PRO-168 have no lines: they only count in the
 * amount check (creditableAmount), not here.
 */
export function creditableQty(invoiceLines: LineItem[], issued: Pick<CreditNote, 'lines'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of filledLines(invoiceLines)) out[l.id] = l.qty;
  for (const cn of issued) {
    for (const l of cn.lines) if (l.sourceId && l.sourceId in out) out[l.sourceId] = Math.max(0, out[l.sourceId] - l.qty);
  }
  return out;
}

/** The lines a credit note carries: the invoice lines with a quantity to credit, linked to their source. */
export function creditLines(invoiceLines: LineItem[], qty: Record<string, number>): CreditLine[] {
  return filledLines(invoiceLines)
    .filter(l => (qty[l.id] ?? 0) > 0)
    .map(l => ({ id: crypto.randomUUID(), desc: l.desc, unit: l.unit ?? 'unité', qty: qty[l.id], price: l.price, productId: l.productId, sourceId: l.id }));
}

/** Whether the invoice charged VAT, read from its stored total (a later change of regime doesn't matter). */
export function invoiceChargedVat(invoice: Pick<Invoice, 'amount' | 'discountPct'>, invoiceLines: LineItem[], regimeChargesVat: boolean): boolean {
  const sub = filledLines(invoiceLines).reduce((s, l) => s + l.qty * l.price, 0);
  const net = sub - Math.round(sub * ((invoice.discountPct ?? 0) / 100));
  return documentHasVat(invoice.amount, net, regimeChargesVat);
}

/** Totals of the credit note: the invoice's discount and VAT applied to the credited lines. */
export function creditTotals(lines: CreditLine[], invoice: { discountPct?: number }, chargedVat: boolean): EditorTotals {
  return editorTotals(lines, invoice.discountPct ?? 0, chargedVat);
}

/**
 * The credit that empties every line takes exactly what is left of the
 * invoice. Discount and VAT are rounded per credit note, so successive partial
 * credits can end a franc or two away from the invoice total. Only that small
 * gap (`tolerance`) is absorbed, in the VAT (or the discount, without VAT); a
 * larger gap (older amount-only credit notes) is left for the checks to refuse.
 */
export function reconcileFinalCredit(t: EditorTotals, opts: { emptiesInvoice: boolean; left: number; chargedVat: boolean; tolerance: number }): EditorTotals {
  const diff = opts.left - t.total;
  if (!opts.emptiesInvoice || diff === 0 || Math.abs(diff) > opts.tolerance) return t;
  return opts.chargedVat
    ? { ...t, tax: t.tax + diff, total: opts.left, toPay: opts.left }
    : { ...t, discount: t.discount - diff, net: t.net + diff, total: opts.left, toPay: opts.left };
}

/** A credit note on an invoice without stored lines: an amount TTC, split into HT and VAT. */
export function amountTotals(amount: number, chargedVat: boolean): EditorTotals {
  const { ht, tva } = splitTtc(amount, chargedVat);
  return { subtotal: ht, discount: 0, net: ht, tax: tva, total: amount, withholding: null, toPay: amount };
}

/**
 * The most a new credit note may amount to: the invoice total less the issued
 * credit notes. A full credit of every line that is left gives exactly this.
 */
export function creditableAmount(invoice: Pick<Invoice, 'amount'>, issued: Pick<CreditNote, 'amount'>[]): number {
  return Math.max(0, invoice.amount - issued.reduce((s, c) => s + c.amount, 0));
}

/** Why the credit note can't be issued yet, or null. `paid`: completed payments on the invoice. */
export function creditIssueProblem(opts: { nature?: CreditNature | ''; reason: string; total: number; max: number; paid: number }): string | null {
  if (!opts.nature) return 'Choisissez la nature de l’avoir.';
  if (opts.nature === 'RAN' && opts.paid > 0) return 'RAN (annulation) n’est possible que si la facture n’a reçu aucun paiement : choisissez RAM.';
  if (!opts.reason.trim()) return 'Indiquez le motif de l’avoir.';
  if (opts.total <= 0) return 'Indiquez au moins une quantité à créditer.';
  if (opts.total > opts.max) return 'Cet avoir dépasse ce qui reste à créditer sur la facture.';
  return null;
}
