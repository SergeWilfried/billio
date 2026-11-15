// The invoice editor (PRO-167): totals and the problems shown on each line. One discount and one VAT
// rate per invoice (the organisation's regime); per-line rates are PRO-182.

import { vatOn } from '@/lib/vat';
import { filledLines } from '@/lib/line-validation';
import type { LineItem } from '@/lib/schemas';

export interface EditorTotals { subtotal: number; discount: number; net: number; tax: number; total: number }

export function editorTotals(lines: LineItem[], discountPct: number, chargesVat: boolean): EditorTotals {
  const subtotal = filledLines(lines).reduce((s, l) => s + l.qty * l.price, 0);
  const discount = Math.round(subtotal * (discountPct / 100));
  const net = subtotal - discount;
  const tax = vatOn(net, chargesVat);
  return { subtotal, discount, net, tax, total: net + tax };
}

/**
 * What is wrong with each line, by line id. Empty lines are ignored (they are
 * not saved). A line worth 0 can be saved in a draft but blocks issuing (PRO-145).
 */
export function lineProblems(lines: LineItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of filledLines(lines)) {
    if (l.desc.trim() === '') out[l.id] = 'Ajoutez une description.';
    else if (!(l.qty > 0)) out[l.id] = 'La quantité doit être supérieure à zéro.';
    else if (l.price < 0) out[l.id] = 'Le prix ne peut pas être négatif.';
    else if (l.qty * l.price <= 0) out[l.id] = 'Montant nul : indiquez un prix.';
  }
  return out;
}

/** Why the draft can't be saved yet, or null. */
export function draftProblem(client: string, issued: string, due: string, lines: LineItem[]): string | null {
  if (!client) return 'Choisissez un client.';
  if (filledLines(lines).length === 0) return 'Ajoutez au moins une ligne.';
  if (filledLines(lines).some(l => l.desc.trim() === '')) return 'Chaque ligne doit avoir une description.';
  if (filledLines(lines).some(l => !(l.qty > 0) || l.price < 0)) return 'Corrigez les lignes signalées.';
  if (due < issued) return 'L’échéance doit suivre la date de facturation.';
  return null;
}

/** Why the invoice can't be issued yet (on top of the draft's checks), or null. */
export function issueProblem(client: string, issued: string, due: string, lines: LineItem[]): string | null {
  const draft = draftProblem(client, issued, due, lines);
  if (draft) return draft;
  if (Object.keys(lineProblems(lines)).length > 0) return 'Une ligne a un montant nul : corrigez-la avant d’émettre.';
  return null;
}
