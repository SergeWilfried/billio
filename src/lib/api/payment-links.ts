// The public payment link of an invoice (PRO-187): one per invoice, a token that cannot be guessed, which can
// be turned off. The QR code on the PDF opens it; the page shows what is left to pay when it is opened.
import { supabase } from '@/lib/supabase';
import { paymentPageUrl, type OnlineMode } from '@/lib/online-payments';

const MOCK = import.meta.env.VITE_MOCK_AUTH === 'true';

export interface PaymentLink { token: string; active: boolean }

/** The invoice's link, created the first time it is needed. */
export async function ensurePaymentLink(orgId: string, invoiceId: string): Promise<PaymentLink> {
  const { data: found, error } = await supabase.from('invoice_payment_links').select('token, active').eq('org_id', orgId).eq('invoice_id', invoiceId).maybeSingle();
  if (error) throw error;
  if (found) return found as PaymentLink;
  // two tabs at once: the second insert hits the unique (org, invoice) and reads the first one's link
  const { data, error: insErr } = await supabase.from('invoice_payment_links').insert({ org_id: orgId, invoice_id: invoiceId }).select('token, active').single();
  if (!insErr) return data as PaymentLink;
  if (insErr.code !== '23505') throw insErr;
  const { data: again, error: e2 } = await supabase.from('invoice_payment_links').select('token, active').eq('org_id', orgId).eq('invoice_id', invoiceId).single();
  if (e2) throw e2;
  return again as PaymentLink;
}

export async function setPaymentLinkActive(orgId: string, invoiceId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('invoice_payment_links').update({ active }).eq('org_id', orgId).eq('invoice_id', invoiceId);
  if (error) throw error;
}

/**
 * The URL the PDF's « Scanner pour payer » QR code opens, or null: only for an issued invoice of a business that
 * is paid online, and only while its link is on. A failure leaves the QR code out rather than blocking the PDF.
 */
export async function paymentUrlForInvoice(orgId: string, invoice: { id: string; status: string }, online: OnlineMode, origin = window.location.origin): Promise<string | null> {
  if (MOCK || online === 'off' || (invoice.status !== 'pending' && invoice.status !== 'overdue')) return null;
  try {
    const link = await ensurePaymentLink(orgId, invoice.id);
    return link.active ? paymentPageUrl(origin, link.token) : null;
  } catch (err) {
    console.error('[paymentUrlForInvoice]', err);
    return null;
  }
}
