import { useApp } from '@/context/AppContext';
import { CASH_CHOICE, CASH_CLIENT_NAME, useClientChoice } from '@/lib/use-client-choice';

/**
 * Client picker for an invoice. Besides the organisation's clients it offers
 * "Client comptant" (DGI client type CC) for a counter sale to an unnamed
 * buyer: the first time it's picked, a CC client is created and reused after.
 */
export default function InvoiceClientSelect({ value, onChange, open = true, disabled = false }: {
  value: string;
  onChange: (code: string) => void;
  /** Whether the form is open (its panel stays mounted when closed) */
  open?: boolean;
  /** Locks the choice, e.g. while the invoice is being checked or saved */
  disabled?: boolean;
}) {
  const { clients } = useApp();
  const { pick, creating, cash } = useClientChoice(value, onChange, open);

  return (
    <select className="form-input" value={value} disabled={creating || disabled} onChange={e => void pick(e.target.value)}>
      <option value="">Sélectionner un client…</option>
      {clients.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
      {!cash && <option value={CASH_CHOICE}>{CASH_CLIENT_NAME} (vente sans client identifié)</option>}
    </select>
  );
}
