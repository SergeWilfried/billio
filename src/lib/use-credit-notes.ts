// The organisation's credit notes, for invoice balances (they are not kept in
// AppContext). Shared by the Factures table and the client list.

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchCreditNoteDrafts, fetchCreditNotes } from '@/lib/api/credit-notes';
import type { CreditNote } from '@/lib/schemas';

export function useCreditNotes(): CreditNote[] {
  const { orgId } = useApp();
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    fetchCreditNotes(orgId).then(c => { if (live) setCreditNotes(c); }).catch(err => console.error('[fetchCreditNotes]', err));
    return () => { live = false; };
  }, [orgId]);
  return creditNotes;
}

/** Draft credit notes (PRO-168): listed with the invoices, never counted in a balance. */
export function useCreditNoteDrafts(): CreditNote[] {
  const { orgId } = useApp();
  const [drafts, setDrafts] = useState<CreditNote[]>([]);
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    fetchCreditNoteDrafts(orgId).then(c => { if (live) setDrafts(c); }).catch(err => console.error('[fetchCreditNoteDrafts]', err));
    return () => { live = false; };
  }, [orgId]);
  return drafts;
}
