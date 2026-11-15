import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  updateQuote: vi.fn(), createQuote: vi.fn(), nextQuoteId: vi.fn(), removeQuote: vi.fn(),
  deleteLineItems: vi.fn(), saveLineItems: vi.fn(),
}));
vi.mock('@/lib/api/quotes', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api/quotes')>()),
  updateQuote: api.updateQuote, createQuote: api.createQuote, nextQuoteId: api.nextQuoteId, removeQuote: api.removeQuote,
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/api/line-items', () => ({ deleteLineItems: api.deleteLineItems, saveLineItems: api.saveLineItems }));

import { saveQuoteDraft } from '@/lib/api/quote-drafts';
import { QuoteLockedError } from '@/lib/api/quotes';

const fields = { client: 'TK', subject: 'Audit', issued: '2026-11-15', valid: '2026-11-29', discountPct: 0, amount: 1000, notes: null };
const lines = [{ id: 'l', desc: 'Audit', unit: 'jour', qty: 1, price: 1000 }];

beforeEach(() => { Object.values(api).forEach(f => f.mockReset()); });

describe('saveQuoteDraft', () => {
  it('asks to update only an editable quote', async () => {
    api.updateQuote.mockResolvedValue(undefined);
    await saveQuoteDraft('org', { id: 'QUO-1', status: 'sent', fields, lines });
    expect(api.updateQuote.mock.calls[0][3]).toEqual({ onlyEditable: true });
    expect(api.deleteLineItems).toHaveBeenCalled();
  });
  it('leaves the lines alone when the quote was invoiced meanwhile', async () => {
    api.updateQuote.mockRejectedValue(new QuoteLockedError('QUO-1'));
    await expect(saveQuoteDraft('org', { id: 'QUO-1', fields, lines })).rejects.toBeInstanceOf(QuoteLockedError);
    expect(api.deleteLineItems).not.toHaveBeenCalled();
    expect(api.saveLineItems).not.toHaveBeenCalled();
  });
});
