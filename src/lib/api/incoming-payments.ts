// Payments received online (PRO-189): every payment Paygate confirmed, matched to its invoice or waiting for a
// person (« À vérifier »). Written by the server only (Paygate's webhook); the app reads.
import { supabase } from '@/lib/supabase';

const MOCK = import.meta.env.VITE_MOCK_AUTH === 'true';

export interface IncomingPayment {
  id: string; source: 'paygate' | 'statement'; externalRef: string; invoiceId: string | null;
  amount: number; commission: number; net: number; status: 'matched' | 'to_check'; detail: string | null;
  paymentId: string | null; payoutStatus: 'pending' | 'paid' | 'none'; receivedAt: string;
}

export async function fetchIncomingPayments(orgId: string): Promise<IncomingPayment[]> {
  if (MOCK) return [];
  const { data, error } = await supabase.from('incoming_payments')
    .select('id, source, external_ref, invoice_id, amount, commission, net, status, detail, payment_id, payout_status, received_at')
    .eq('org_id', orgId).order('received_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id), source: r.source as IncomingPayment['source'], externalRef: String(r.external_ref), invoiceId: (r.invoice_id as string | null) ?? null,
    amount: Number(r.amount), commission: Number(r.commission), net: Number(r.net), status: r.status as IncomingPayment['status'],
    detail: (r.detail as string | null) ?? null, paymentId: (r.payment_id as string | null) ?? null,
    payoutStatus: r.payout_status as IncomingPayment['payoutStatus'], receivedAt: String(r.received_at),
  }));
}
