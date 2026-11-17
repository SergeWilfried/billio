// « Reçus en ligne » (PRO-189): payments confirmed by Paygate (shown to users as Billio: Paygate is internal), each once, with its invoice, Paygate's commission,
// what is paid out, and whether it settled the invoice or waits for a person (« À vérifier »).
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { useApp } from '@/context/AppContext';
import { fetchIncomingPayments, type IncomingPayment } from '@/lib/api/incoming-payments';
import { invoiceRef } from '@/lib/invoice-number';
import { fmt, fmtDate } from '@/data';

const PAYOUT: Record<IncomingPayment['payoutStatus'], string> = { pending: 'Reversement en attente', paid: 'Reversé', none: '—' };

export default function IncomingPayments() {
  const { orgId, invoices } = useApp();
  const [rows, setRows] = useState<IncomingPayment[] | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetchIncomingPayments(orgId).then(r => { if (!cancelled) setRows(r); }).catch(err => { console.error('[fetchIncomingPayments]', err); if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [orgId]);

  if (!rows?.length) return null;
  const toCheck = rows.filter(r => r.status === 'to_check').length;
  const ref = (id: string | null) => { if (!id) return '—'; const inv = invoices.find(i => i.id === id); return inv ? invoiceRef(inv) : id; };

  return (
    <section className="incoming" aria-labelledby="incoming-title">
      <div className="incoming-head">
        <h2 id="incoming-title"><Icon name="qrcode" size={16} ariaHidden /> Reçus en ligne</h2>
        <span className="incoming-sub">Enregistrés sur la facture automatiquement.{toCheck > 0 && <b> {toCheck} à vérifier.</b>}</span>
      </div>
      <div className="table-wrap">
        <table className="incoming-table">
          <thead><tr><th>Reçu le</th><th>Facture</th><th className="num">Montant</th><th className="num">Commission</th><th className="num">Net</th><th>État</th><th>Reversement</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{fmtDate(r.receivedAt.slice(0, 10))}<div className="incoming-ref" title="Identifiant de la transaction">{r.externalRef}</div></td>
                <td>{ref(r.invoiceId)}</td>
                <td className="num">{fmt(r.amount)}</td>
                <td className="num">{r.commission ? fmt(r.commission) : '—'}</td>
                <td className="num">{fmt(r.net)}</td>
                <td>{r.status === 'matched'
                  ? <span className="op-badge op-ok">Rapproché{r.paymentId ? ` · ${r.paymentId}` : ''}</span>
                  : <span className="op-badge op-wait" title={r.detail ?? undefined}>À vérifier</span>}
                  {r.status === 'to_check' && r.detail && <div className="incoming-detail">{r.detail}</div>}</td>
                <td>{PAYOUT[r.payoutStatus]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
