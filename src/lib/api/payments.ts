import { supabase } from '@/lib/supabase';
import { INITIAL_PAYMENTS } from '@/data';
import type { Payment } from '@/lib/schemas';

const MOCK = import.meta.env.VITE_MOCK_AUTH === 'true';

export function dbToPayment(row: Record<string, unknown>): Payment {
  return {
    id:     String(row.id),
    date:   String(row.date),
    client: String(row.client_code),
    inv:    String(row.inv_id),
    method: row.method as Payment['method'],
    ref:    String(row.ref ?? ''),
    amount: Number(row.amount),
    status: (row.status ?? 'completed') as Payment['status'],
    source: (row.source ?? 'manual') as Payment['source'],
  };
}

export async function nextPaymentId(orgId: string): Promise<string> {
  if (MOCK) return 'PAI-' + String(Math.floor(Math.random() * 9000) + 1000);
  // Atomic per-org sequence — see next_payment_number()
  const { data, error } = await supabase.rpc('next_payment_number', { p_org_id: orgId });
  if (error) throw error;
  return 'PAI-' + String(data as number).padStart(4, '0');
}

export async function fetchPayments(orgId: string): Promise<Payment[]> {
  if (MOCK) return [...INITIAL_PAYMENTS];
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('org_id', orgId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(dbToPayment);
}

export async function createPayment(
  orgId: string,
  payload: Omit<Payment, 'source'> & { source?: Payment['source'] },
): Promise<Payment> {
  const source = payload.source ?? 'manual';
  if (MOCK) return { ...payload, source };
  const { data, error } = await supabase
    .from('payments')
    .insert({
      id:          payload.id,
      org_id:      orgId,
      date:        payload.date,
      client_code: payload.client,
      inv_id:      payload.inv,
      method:      payload.method,
      ref:         payload.ref,
      amount:      payload.amount,
      status:      payload.status,
      source,
    })
    .select()
    .single();
  if (error) throw error;
  return dbToPayment(data as Record<string, unknown>);
}

export async function removePayment(orgId: string, id: string): Promise<void> {
  if (MOCK) return;
  const { error } = await supabase.from('payments').delete().eq('org_id', orgId).eq('id', id);
  if (error) throw error;
}
