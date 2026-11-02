import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchPaymentSettings } from '@/lib/api/payment-settings';
import { paymentMethodLines, type PaymentMethodLine } from '@/lib/payment-methods';

/** The organisation's enabled payment methods, for invoices, quotes and messages. */
export function usePaymentMethods(): PaymentMethodLine[] {
  const { orgId } = useApp();
  const [lines, setLines] = useState<PaymentMethodLine[]>([]);
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetchPaymentSettings(orgId)
      .then(s => { if (!cancelled) setLines(paymentMethodLines(s)); })
      .catch(err => console.error('[fetchPaymentSettings]', err));
    return () => { cancelled = true; };
  }, [orgId]);
  return lines;
}
