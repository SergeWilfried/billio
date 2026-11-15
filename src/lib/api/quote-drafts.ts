// Saving a quote from the invoice editor (PRO-185). As for invoice drafts
// (invoice-drafts.ts): the quote and its lines are saved together, and a new
// quote whose lines fail to save is removed again.

import { createQuote, nextQuoteId, removeQuote, updateQuote } from '@/lib/api/quotes';
import { deleteLineItems, saveLineItems } from '@/lib/api/line-items';
import { filledLines } from '@/lib/line-validation';
import type { LineItem, Quote } from '@/lib/schemas';
import type { RichDoc } from '@/lib/rich-text';

export interface QuoteFields {
  client: string;
  subject: string;
  issued: string;
  /** Valid until */
  valid: string;
  discountPct: number;
  /** TTC of the lines, after discount and VAT */
  amount: number;
  /** Notes and conditions, already cleaned; null for none */
  notes: RichDoc | null;
}

/** Creates the quote (no `id`, as a draft) or updates it, and replaces its lines. `status`: the quote's, kept as is. */
export async function saveQuoteDraft(orgId: string, opts: { id?: string; status?: Quote['status']; fields: QuoteFields; lines: LineItem[] }): Promise<Quote> {
  const { fields } = opts;
  const subject = fields.subject.trim() || 'Devis sans titre';
  const lines = filledLines(opts.lines);
  const daysLeft = (new Date(fields.valid).getTime() - Date.now()) / 86_400_000;
  const base = { subject, client: fields.client, issued: fields.issued, valid: fields.valid, amount: fields.amount, discountPct: fields.discountPct, notes: fields.notes ?? undefined };
  if (!opts.id) {
    const id = await nextQuoteId(orgId);
    const stored = await createQuote(orgId, { id, ...base, status: 'draft' });
    try {
      await saveLineItems(orgId, lines, { quoteId: id });
    } catch (err) {
      await removeQuote(orgId, id).catch(e => console.error('[rollback] removeQuote failed:', e));
      throw err;
    }
    return { ...stored, ...base };
  }
  // Only while it can still be edited: invoiced, declined or expired meanwhile, its lines stay as they are
  await updateQuote(orgId, opts.id, { ...base, notes: fields.notes }, { onlyEditable: true });
  await deleteLineItems(orgId, { quoteId: opts.id });
  await saveLineItems(orgId, lines, { quoteId: opts.id });
  return { id: opts.id, ...base, expSoon: daysLeft > 0 && daysLeft <= 14, status: opts.status ?? 'draft' };
}
