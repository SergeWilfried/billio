import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { fetchPaymentSettings } from '@/lib/api/payment-settings';
import { paymentMethodLines, type PaymentMethodLine } from '@/lib/payment-methods';
import { effectiveMode, type OnlineMode } from '@/lib/online-payments';

export type PaymentMethodsStatus = 'loading' | 'ready' | 'error';

export interface PaymentMethodsState {
  lines:  PaymentMethodLine[];
  status: PaymentMethodsStatus;
  /** How clients pay online now (PRO-189): 'off' means invoices carry no payment link */
  online: OnlineMode;
}

/**
 * The organisation's enabled payment methods, for invoices, quotes and
 * messages. `lines` is only meaningful once `status` is 'ready': an empty list
 * then means nothing is configured, not that the settings are still loading.
 */
export function usePaymentMethods(): PaymentMethodsState {
  const { orgId } = useApp();
  const [state, setState] = useState<PaymentMethodsState & { orgId?: string }>({ lines: [], status: 'loading', online: 'off' });
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetchPaymentSettings(orgId)
      .then(s => { if (!cancelled) setState({ orgId, lines: paymentMethodLines(s), status: 'ready', online: effectiveMode(s) }); })
      .catch(err => {
        console.error('[fetchPaymentSettings]', err);
        if (!cancelled) setState({ orgId, lines: [], status: 'error', online: 'off' });
      });
    return () => { cancelled = true; };
  }, [orgId]);
  // A result for a previous organisation counts as still loading
  if (!orgId || state.orgId !== orgId) return { lines: [], status: 'loading', online: 'off' };
  return { lines: state.lines, status: state.status, online: state.online };
}

/** Toast text when a document needs payment methods that aren't available yet. */
export function paymentMethodsNotReadyMessage(status: PaymentMethodsStatus): string {
  return status === 'error'
    ? 'Les modes de paiement n\'ont pas pu être chargés — rechargez la page.'
    : 'Chargement des modes de paiement… réessayez dans un instant.';
}
