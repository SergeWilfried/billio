// The invoice's public payment link (PRO-187), in its side panel: copy it to send it, or turn it off for this
// invoice. Shown only for an issued invoice of a business paid online.
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { ensurePaymentLink, setPaymentLinkActive, type PaymentLink } from '@/lib/api/payment-links';
import { paymentPageUrl } from '@/lib/online-payments';

export default function PaymentLinkCard({ orgId, invoiceId, writable, onToast }: { orgId: string; invoiceId: string; writable: boolean; onToast: (msg: string, error?: boolean) => void }) {
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensurePaymentLink(orgId, invoiceId)
      .then(l => { if (!cancelled) setLink(l); })
      .catch(err => { console.error('[PaymentLinkCard]', err); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [orgId, invoiceId]);

  if (failed) return null;
  const url = link ? paymentPageUrl(window.location.origin, link.token) : '';

  async function copy() {
    try { await navigator.clipboard.writeText(url); onToast('Lien de paiement copié'); }
    catch { onToast('Copie impossible : sélectionnez le lien à la main.', true); }
  }
  async function toggle() {
    if (!link) return;
    setBusy(true);
    try { await setPaymentLinkActive(orgId, invoiceId, !link.active); setLink({ ...link, active: !link.active }); onToast(link.active ? 'Lien de paiement désactivé' : 'Lien de paiement réactivé'); }
    catch (err) { console.error('[PaymentLinkCard] toggle', err); onToast('Modification impossible. Réessayez.', true); }
    finally { setBusy(false); }
  }

  return (
    <div className="paylink">
      <div className="paylink-head"><Icon name="qrcode" size={15} ariaHidden /> Lien de paiement {link && !link.active && <span className="paylink-off">désactivé</span>}</div>
      <div className="paylink-sub">{link?.active === false ? 'Le QR code du PDF est inactif.' : 'Le client paie le reste dû par PI-SPI.'}</div>
      {link && link.active && <input className="form-input paylink-url" readOnly value={url} aria-label="Lien de paiement" onFocus={e => e.currentTarget.select()} />}
      <div className="paylink-actions">
        {link?.active && <button className="btn btn-sm" onClick={copy}><Icon name="copy" ariaHidden /> Copier</button>}
        {writable && link && <button className="btn btn-sm" onClick={toggle} disabled={busy}>{link.active ? 'Désactiver' : 'Réactiver'}</button>}
      </div>
    </div>
  );
}
