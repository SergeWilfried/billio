// Full-page invoice editor with a live A4 preview (PRO-167), in the ERP look.
// /invoices/new           a new invoice (?client=CODE to start with a client,
//                         ?quote=ID to start from a quote)
// /invoices/:id/edit      a draft
// Issued invoices are changed from their own page, as before.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import posthog from 'posthog-js';
import Page from '@/components/Page';
import Icon from '@/components/Icon';
import StatusPill from '@/components/sales/StatusPill';
import InvoicePaper from '@/components/InvoicePaper';
import InvoiceClientSelect from '@/components/InvoiceClientSelect';
import { OwnerLine } from '@/components/owner/OwnerControls';
import { PageSkeleton } from '@/components/SkeletonLoader';
import { useApp } from '@/context/AppContext';
import { usePermissions } from '@/lib/use-permissions';
import { usePaymentMethods } from '@/lib/use-payment-methods';
import { useComplianceGuard } from '@/lib/use-compliance-guard';
import { isInvoiceLimitError } from '@/lib/invoice-limit';
import { confirmDiscard } from '@/lib/confirm-discard';
import { filledLines } from '@/lib/line-validation';
import { fetchLineItems } from '@/lib/api/line-items';
import { updateQuote } from '@/lib/api/quotes';
import { recordInvoiceIssuanceEntry } from '@/lib/api/accounting';
import { createActivity } from '@/lib/api/activities';
import { fetchClientDocuments } from '@/lib/api/client-documents';
import { issueSavedDraft, saveInvoiceDraft } from '@/lib/api/invoice-drafts';
import { draftProblem, editorTotals, issueProblem, lineProblems, previewDoc } from '@/lib/invoice-editor';
import { kybItems, kybSummary, kybSummaryLabel, type ClientDocument } from '@/lib/kyb';
import { clientTypeDef, clientTypeOf } from '@/lib/client-type';
import { getFiscalIdLabel } from '@/lib/ohada';
import { invoiceRef } from '@/lib/invoice-number';
import { renderInvoicePdf } from '@/lib/render-pdf';
import { VAT_LABEL, VAT_RATE, chargesVat } from '@/lib/vat';
import { fmt, newLineItem } from '@/data';
import type { Activity, Invoice, LineItem } from '@/lib/schemas';

const UNITS = ['unité', 'heure', 'jour', 'mois', 'an', 'projet', 'article', 'licence'];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** What a line is, without its id: to tell unsaved changes */
const lineKey = (ls: LineItem[]) => filledLines(ls).map(l => [l.desc, l.unit, l.qty, l.price, l.productId ?? '']);
const timeOf = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default function InvoiceEditorPage() {
  const { id: routeId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const {
    orgId, loading, invoices, setInvoices, quotes, setQuotes, clientsMap, products, orgSettings, invoiceTemplate,
    setActivity, showToast, userLabel,
  } = useApp();
  const { writable } = usePermissions();
  const { lines: paymentMethods, status: paymentMethodsStatus } = usePaymentMethods();
  const compliance = useComplianceGuard();
  const vatOn = chargesVat(orgSettings.taxRegime);

  const quoteId = routeId ? undefined : params.get('quote') ?? undefined;
  const quote = quoteId ? quotes.find(q => q.id === quoteId) : undefined;

  // The draft once saved (its id and Responsable), or null while new
  const [saved, setSaved] = useState<Invoice | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [ready, setReady] = useState(false);
  const [client, setClient] = useState('');
  const [issued, setIssued] = useState(() => isoDay(new Date()));
  const [due, setDue] = useState(() => isoDay(new Date(Date.now() + 14 * 864e5)));
  const [subject, setSubject] = useState('');
  const [lines, setLines] = useState<LineItem[]>([newLineItem()]);
  const [discountPct, setDiscountPct] = useState(0);
  const [busy, setBusy] = useState<'save' | 'issue' | 'pdf' | null>(null);
  const busyRef = useRef(false);
  // What was last saved (or loaded), to tell unsaved changes
  const [baseline, setBaseline] = useState('');
  const snapshot = JSON.stringify({ client, issued, due, subject, discountPct, lines: lineKey(lines) });
  const dirty = ready && snapshot !== baseline;

  // ── Load: a draft, a quote, or a blank invoice ─────────────────────────────
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !orgId) return;
    const key = routeId ?? `new:${quoteId ?? ''}:${params.get('client') ?? ''}`;
    if (loadedFor.current === key) return;
    let live = true;
    const done = (s: string) => { if (!live) return; loadedFor.current = key; setBaseline(s); setReady(true); };

    if (routeId) {
      const inv = invoices.find(i => i.id === routeId);
      if (!inv) { showToast('Facture introuvable.', true); navigate('/invoices', { replace: true }); return; }
      // Issued invoices keep their own page (and its corrections)
      if (inv.status !== 'draft') { navigate(`/invoices/${inv.id}`, { replace: true }); return; }
      fetchLineItems(orgId, { invoiceId: inv.id }).then(ls => {
        if (!live) return;
        const loaded = ls.length ? ls : [newLineItem()];
        setSaved(inv); setClient(inv.client); setIssued(inv.issued); setDue(inv.due); setSubject(inv.subject);
        setDiscountPct(inv.discountPct ?? 0); setLines(loaded);
        done(JSON.stringify({ client: inv.client, issued: inv.issued, due: inv.due, subject: inv.subject, discountPct: inv.discountPct ?? 0, lines: lineKey(loaded) }));
      }).catch(err => {
        console.error('[fetchLineItems]', err);
        showToast('Les lignes de la facture n’ont pas pu être chargées. Réessayez.', true);
        navigate(`/invoices/${inv.id}`, { replace: true });
      });
    } else if (quoteId) {
      if (!quote) { showToast('Devis introuvable.', true); navigate('/quotes', { replace: true }); return; }
      // Already converted: open that invoice rather than making a second one
      const linked = quote.invoiceId ? invoices.find(i => i.id === quote.invoiceId) : undefined;
      if (linked) { navigate(linked.status === 'draft' ? `/invoices/${linked.id}/edit` : `/invoices/${linked.id}`, { replace: true }); return; }
      fetchLineItems(orgId, { quoteId: quote.id }).then(ls => {
        if (!live) return;
        // Fresh ids: these lines become the invoice's own
        setLines(ls.length ? ls.map(l => ({ ...l, id: crypto.randomUUID() })) : [newLineItem()]);
        setClient(quote.client); setSubject(quote.subject);
        done('');
      }).catch(err => {
        console.error('[fetchLineItems]', err);
        showToast('Les lignes du devis n’ont pas pu être chargées. Réessayez.', true);
        navigate(`/quotes/${quote.id}`, { replace: true });
      });
    } else {
      const c = params.get('client');
      if (c && clientsMap[c]) setClient(c);
      done(JSON.stringify({ client: '', issued, due, subject: '', discountPct: 0, lines: [] }));
    }
    return () => { live = false; };
    // Loads once per draft / quote / start; later edits are the user's
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, orgId, routeId, quoteId, quote, invoices]);

  // ── Client details: type, IFU and KYB file ─────────────────────────────────
  const clientRec = client ? clientsMap[client] : undefined;
  const [documents, setDocuments] = useState<ClientDocument[] | null>(null);
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    // Unreadable: say nothing about the file rather than « all missing »
    fetchClientDocuments(orgId).then(d => { if (live) setDocuments(d); }).catch(err => console.error('[fetchClientDocuments]', err));
    return () => { live = false; };
  }, [orgId]);
  const kyb = useMemo(() => {
    if (!clientRec || !documents) return null;
    const items = kybItems(clientTypeOf(clientRec), documents.filter(d => d.clientCode === client), isoDay(new Date()));
    return kybSummary(items);
  }, [clientRec, documents, client]);

  // ── Lines ──────────────────────────────────────────────────────────────────
  const updateLine = (lid: string, field: 'desc' | 'unit' | 'qty' | 'price', val: string) =>
    setLines(prev => prev.map(l => l.id !== lid ? l : { ...l, [field]: field === 'desc' || field === 'unit' ? val : (parseFloat(val) || 0) }));
  const removeLine = (lid: string) => setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== lid) : [newLineItem()]);
  const addLine = () => setLines(prev => [...prev, newLineItem()]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const away = (e: MouseEvent) => { if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [pickerOpen]);
  const pickable = products.filter(p => !pickerQuery || `${p.name} ${p.sku}`.toLowerCase().includes(pickerQuery.toLowerCase()));
  const addProduct = (pid: string) => {
    const p = products.find(x => x.id === pid);
    if (!p) return;
    // Replace the empty starting line rather than leaving it above
    setLines(prev => [...prev.filter(l => filledLines([l]).length > 0), newLineItem(p.name, 1, p.price, p.unit, p.id)]);
    setPickerOpen(false); setPickerQuery('');
  };
  const codeOf = (l: LineItem) => (l.productId ? products.find(p => p.id === l.productId)?.sku : undefined) || '—';

  const totals = editorTotals(lines, discountPct, vatOn);
  const problems = lineProblems(lines);
  const doc = previewDoc({ client: clientRec, subject, issued, due, lines, discountPct, totals });

  // ── Save, issue, preview ───────────────────────────────────────────────────
  const fields = { client, subject, issued, due, discountPct, amount: totals.total };
  const clientName = clientRec?.name ?? client;

  /** Saves the draft; returns it, or null when it wasn't saved (the reason is shown). */
  async function save(): Promise<Invoice | null> {
    const problem = draftProblem(client, issued, due, lines);
    if (problem) { showToast(problem, true); return null; }
    const isNew = !saved;
    const draft = await saveInvoiceDraft(orgId, { id: saved?.id, fields, lines, ownerId: isNew ? quote?.ownerId : undefined });
    const merged: Invoice = { ...saved, ...draft, ownerId: draft.ownerId ?? saved?.ownerId, ownerName: draft.ownerName ?? saved?.ownerName };
    setInvoices(prev => prev.some(i => i.id === merged.id) ? prev.map(i => i.id === merged.id ? { ...i, ...merged } : i) : [merged, ...prev]);
    if (isNew && quote) {
      // The quote links to its invoice from now on (it is marked invoiced at issue)
      await updateQuote(orgId, quote.id, { invoiceId: merged.id })
        .then(() => setQuotes(prev => prev.map(q => q.id === quote.id ? { ...q, invoiceId: merged.id } : q)))
        .catch(err => console.error('[updateQuote] link failed:', err));
    }
    if (isNew) {
      posthog.capture('invoice_created', { invoice_type: 'draft', item_count: filledLines(lines).length, total_amount: totals.total, currency: 'XOF', from: quote ? 'quote' : 'editor' });
      // The address now names the draft, so a reload comes back to it. Not a
      // route change: that would remount the page and reload what the form holds
      window.history.replaceState(window.history.state, '', `/invoices/${merged.id}/edit`);
    }
    setSaved(merged);
    setSavedAt(new Date());
    setBaseline(snapshot);
    return merged;
  }

  async function onSave() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy('save');
    try {
      if (await save()) showToast('Brouillon enregistré');
    } catch (err) {
      console.error('[saveInvoiceDraft]', err);
      showToast('Le brouillon n’a pas pu être enregistré. Réessayez.', true);
    } finally {
      busyRef.current = false; setBusy(null);
    }
  }

  async function issue() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy('issue');
    let draft: Invoice | null = null;
    try {
      draft = await save();
      if (!draft) return;
      const res = await issueSavedDraft(orgId, draft.id, totals.total);
      const issuedInv: Invoice = { ...draft, status: 'pending', number: res.number, firstIssuedAt: res.firstIssuedAt ?? new Date().toISOString(), issuedByName: res.issuedByName ?? userLabel };
      setInvoices(prev => prev.map(i => i.id === issuedInv.id ? issuedInv : i));
      const ref = invoiceRef(issuedInv);
      if (quote) {
        updateQuote(orgId, quote.id, { status: 'invoiced', invoiceId: issuedInv.id })
          .then(() => setQuotes(prev => prev.map(q => q.id === quote.id ? { ...q, status: 'invoiced', invoiceId: issuedInv.id } : q)))
          .catch(err => console.error('[updateQuote] invoiced failed:', err));
        posthog.capture('quote_converted_to_invoice', { quote_id: quote.id, invoice_id: issuedInv.id });
      }
      recordInvoiceIssuanceEntry(orgId, { invoiceId: issuedInv.id, htAmount: totals.net, tvaAmount: totals.tax, date: issued, clientName })
        .catch(err => {
          console.error('[recordInvoiceIssuanceEntry] failed:', err);
          showToast(`Facture #${ref} émise, mais l'écriture comptable de vente n'a pas pu être enregistrée. Signalez-le à votre comptable.`, true);
        });
      const act = { kind: 'sent' as const, parts: [{ text: 'Facture ' }, { text: `#${ref}`, bold: true as const }, { text: ' émise pour ' }, { text: clientName, bold: true as const }] };
      setActivity((prev: Activity[]) => [{ ...act, time: "À l'instant" }, ...prev]);
      createActivity(orgId, act).catch(err => console.error('[createActivity] failed:', err));
      posthog.capture('invoice_sent', { invoice_id: issuedInv.id });
      showToast(`Facture #${ref} émise`);
      navigate(`/invoices/${issuedInv.id}`, { replace: true, state: { openSend: true } });
    } catch (err) {
      if (isInvoiceLimitError(err)) { compliance.showLimit(); showToast('Facture enregistrée comme brouillon.'); return; }
      console.error('[issueInvoice]', err);
      showToast(draft
        ? 'La facture est enregistrée comme brouillon, mais n’a pas pu être émise. Réessayez.'
        : 'Une erreur est survenue. La facture n’a pas été enregistrée — réessayez.', true);
    } finally {
      busyRef.current = false; setBusy(null);
    }
  }

  // « Émettre »: the editor's checks, then the plan limit and the DGI mentions (PRO-133)
  function onIssue() {
    const problem = issueProblem(client, issued, due, lines);
    if (problem) { showToast(problem, true); return; }
    void compliance.guard(client, () => void issue(), {
      returnTo: saved ? `/invoices/${saved.id}/edit` : '/invoices/new',
      beforeLeave: async () => {
        try { const d = await save(); return d ? `/invoices/${d.id}/edit` : null; } catch { return null; }
      },
    });
  }

  async function onPreviewPdf() {
    if (busyRef.current) return;
    if (paymentMethodsStatus !== 'ready') { showToast('Les moyens de paiement ne sont pas encore chargés. Réessayez dans un instant.', true); return; }
    if (!clientRec) { showToast('Choisissez un client pour voir le PDF.', true); return; }
    // Opened now, while the click still counts, then filled once the PDF is ready
    const tab = window.open('', '_blank');
    busyRef.current = true; setBusy('pdf');
    try {
      const inv: Invoice = { id: saved?.id ?? 'brouillon', subject: subject.trim() || 'Facture sans titre', client, issued, due, amount: totals.total, status: 'draft', discountPct };
      const blob = await renderInvoicePdf({
        template: invoiceTemplate, invoice: inv, lines: filledLines(lines), client: clientRec, biz: orgSettings,
        paymentTerms: orgSettings.paymentTerms || 'Net 14 jours', deliveryTerms: orgSettings.deliveryTerms || 'À convenir', paymentMethods,
      });
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      console.error('[previewPdf]', err);
      showToast('Le PDF n’a pas pu être généré. Réessayez.', true);
    } finally {
      busyRef.current = false; setBusy(null);
    }
  }

  function onCancel() {
    if (busy || compliance.checking) return;
    if (!confirmDiscard(dirty)) return;
    navigate(saved ? `/invoices/${saved.id}` : quote ? `/quotes/${quote.id}` : '/invoices');
  }

  if (loading || !ready) return <PageSkeleton title="Facture" variant="document" rows={4} />;
  if (!writable) {
    return <Page title="Facture" back={{ label: 'Retour aux factures', onClick: () => navigate('/invoices') }}><p className="dt-muted">Votre rôle ne permet pas de créer ou modifier des factures.</p></Page>;
  }

  const locked = busy !== null || compliance.checking;
  const kybTone = !kyb ? '' : kyb.complete ? 'ok' : kyb.needsAttention ? 'warn' : '';

  return (
    <>
      <Page
        back={{ label: 'Annuler', onClick: onCancel }}
        title={<span className="iv-title"><span>{saved ? 'Brouillon de facture' : 'Nouvelle facture'}</span><StatusPill tone="draft" label="Brouillon" /></span>}
        subtitle={
          <span className="iv-sub">
            <span>N° attribué à l’émission</span>
            {quote && <span>Depuis le devis {quote.id}</span>}
            <span>{savedAt ? `Enregistré à ${timeOf(savedAt)}` : saved ? 'Enregistré' : 'Pas encore enregistré'}{dirty && savedAt ? ' · modifications non enregistrées' : ''}</span>
          </span>
        }
        documentTitle={saved ? 'Brouillon de facture' : 'Nouvelle facture'}
        actions={<>
          <button className="btn" onClick={onCancel} disabled={locked}>Annuler</button>
          <button className="btn" onClick={() => void onPreviewPdf()} disabled={locked}>
            <Icon name="printer" ariaHidden /> {busy === 'pdf' ? 'Préparation…' : 'Aperçu PDF'}
          </button>
          <button className="btn" onClick={() => void onSave()} disabled={locked}>
            {busy === 'save' ? 'Enregistrement…' : 'Enregistrer le brouillon'}
          </button>
          <button className="btn btn-primary" onClick={onIssue} disabled={locked}>
            <Icon name="send" ariaHidden /> {busy === 'issue' ? 'Émission…' : compliance.checking ? 'Vérification…' : 'Émettre la facture'}
          </button>
        </>}
      >
        <div className="ed-grid">
          <div className="ed-main">
            <section className="rail-card ed-card" aria-label="Client et dates">
              <div className="ed-fields">
                <div className="form-group ed-span2">
                  <label className="form-label" htmlFor="ed-client">Client</label>
                  <div id="ed-client"><InvoiceClientSelect value={client} onChange={setClient} disabled={locked} /></div>
                  {clientRec && (
                    <div className="ed-client-meta">
                      <span>{clientTypeDef(clientTypeOf(clientRec)).mention}</span>
                      <span>{clientRec.ifu ? `${getFiscalIdLabel(clientRec.country ?? 'Burkina Faso')} ${clientRec.ifu}` : 'IFU non renseigné'}</span>
                      {kyb && <span className={`ed-kyb ${kybTone}`}>Dossier KYB : {kybSummaryLabel(kyb)}</span>}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="ed-issued">Date de facturation</label>
                  <input id="ed-issued" type="date" className="form-input" value={issued} disabled={locked} onChange={e => setIssued(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="ed-due">Échéance</label>
                  <input id="ed-due" type="date" className="form-input" value={due} disabled={locked} onChange={e => setDue(e.target.value)} />
                  {due < issued && <div className="ed-err">L’échéance doit suivre la date de facturation.</div>}
                </div>
                <div className="form-group ed-span2">
                  <label className="form-label" htmlFor="ed-subject">Objet</label>
                  <input id="ed-subject" type="text" className="form-input" maxLength={255} placeholder="ex. Développement web — sprint 5"
                    value={subject} disabled={locked} onChange={e => setSubject(e.target.value)} />
                </div>
              </div>
            </section>

            <section className="rail-card ed-card" aria-label="Lignes">
              <div className="iv-card-head"><h2>Lignes</h2><span className="dt-muted">{vatOn ? `${VAT_LABEL} sur chaque ligne (régime de l’entreprise)` : 'Hors TVA (régime de l’entreprise)'}</span></div>
              <table className="ed-lines">
                <thead>
                  <tr>
                    <th scope="col" className="ed-code">Code</th>
                    <th scope="col">Description</th>
                    <th scope="col" className="num">Qté</th>
                    <th scope="col">Unité</th>
                    <th scope="col" className="num">P.U. HT</th>
                    <th scope="col" className="num">TVA</th>
                    <th scope="col" className="num">Montant HT</th>
                    <th scope="col"><span className="sr-only">Supprimer</span></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const problem = problems[l.id];
                    return (
                      <tr key={l.id} className={problem ? 'has-err' : undefined}>
                        <td className="ed-code dt-muted">{codeOf(l)}</td>
                        <td>
                          <input className="li-input" placeholder="Description du produit ou service" value={l.desc} disabled={locked}
                            aria-label={`Description, ligne ${i + 1}`} aria-invalid={problem ? true : undefined}
                            onChange={e => updateLine(l.id, 'desc', e.target.value)} />
                          {problem && <div className="ed-err" role="alert">{problem}</div>}
                        </td>
                        <td className="num"><input className="li-input num" type="number" min="0" step="any" value={l.qty} disabled={locked}
                          aria-label={`Quantité, ligne ${i + 1}`} onChange={e => updateLine(l.id, 'qty', e.target.value)} /></td>
                        <td>
                          <select className="li-input" value={l.unit ?? 'unité'} disabled={locked} aria-label={`Unité, ligne ${i + 1}`} onChange={e => updateLine(l.id, 'unit', e.target.value)}>
                            {[...new Set([...UNITS, l.unit ?? 'unité'])].map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="num"><input className="li-input num" type="number" min="0" step="any" value={l.price || ''} placeholder="0" disabled={locked}
                          aria-label={`Prix unitaire HT, ligne ${i + 1}`} onChange={e => updateLine(l.id, 'price', e.target.value)} /></td>
                        <td className="num dt-muted">{vatOn ? `${Math.round(VAT_RATE * 100)} %` : '—'}</td>
                        <td className="num ed-amt">{fmt(l.qty * l.price)}</td>
                        <td>
                          <button type="button" className="li-del" onClick={() => removeLine(l.id)} disabled={locked} aria-label={`Supprimer la ligne ${i + 1}`}>
                            <Icon name="trash" size={15} ariaHidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="line-actions">
                <button type="button" className="add-line" onClick={addLine} disabled={locked}>
                  <Icon name="plus" size={14} ariaHidden /> Ajouter une ligne
                </button>
                {products.length > 0 && (
                  <div className="product-picker-wrap" ref={pickerRef}>
                    <button type="button" className="catalog-btn" onClick={() => setPickerOpen(v => !v)} disabled={locked} aria-expanded={pickerOpen}>
                      <Icon name="package" size={14} ariaHidden /> Depuis le catalogue
                    </button>
                    {pickerOpen && (
                      <div className="product-picker-dropdown">
                        <input autoFocus placeholder="Nom ou code…" value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} aria-label="Rechercher dans le catalogue" />
                        {pickable.length === 0 ? <div className="picker-empty">Aucun produit trouvé</div> : pickable.map(p => (
                          <button type="button" key={p.id} className="picker-item" onClick={() => addProduct(p.id)}>
                            <div>
                              <div className="picker-item-name">{p.name}</div>
                              <div className="picker-item-meta">{[p.sku, p.unit].filter(Boolean).join(' · ')}</div>
                            </div>
                            <div className="picker-item-price">{fmt(p.price)} F</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="rail-card ed-card" aria-label="Paiement et responsable">
              <div className="ed-fields">
                <div>
                  <div className="iv-card-head"><h2>Moyens de paiement acceptés</h2>
                    <button type="button" className="dt-linkcell" onClick={() => navigate('/settings?tab=payments')}>Modifier</button>
                  </div>
                  {paymentMethods.length > 0
                    ? <ul className="ed-pay">{paymentMethods.map(m => <li key={m.label}><b>{m.label}</b> {m.value}</li>)}</ul>
                    : <p className="dt-muted iv-note">Aucun moyen de paiement dans Paramètres → Paiements.</p>}
                </div>
                <div>
                  <div className="iv-card-head"><h2>Responsable</h2></div>
                  {saved
                    ? <OwnerLine table="invoices" id={saved.id} ownerId={saved.ownerId} ownerName={saved.ownerName} />
                    : <p className="iv-note">{quote?.ownerName ? `${quote.ownerName} (responsable du devis)` : 'Vous'} <span className="dt-muted">· modifiable une fois le brouillon enregistré</span></p>}
                </div>
              </div>
            </section>
          </div>

          <aside className="ed-side" aria-label="Totaux et aperçu">
            <section className="rail-card ed-card">
              <dl className="iv-rows">
                <div><dt>Sous-total HT</dt><dd>{fmt(totals.subtotal)} F CFA</dd></div>
                <div className="ed-discount">
                  <dt><label htmlFor="ed-disc">Remise (%)</label></dt>
                  <dd><input id="ed-disc" type="number" min="0" max="100" step="0.5" className="form-input" value={discountPct || ''} placeholder="0" disabled={locked}
                    onChange={e => setDiscountPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} /></dd>
                </div>
                {totals.discount > 0 && <div><dt>Montant de la remise</dt><dd>− {fmt(totals.discount)} F CFA</dd></div>}
                {vatOn && <div><dt>{VAT_LABEL}</dt><dd>{fmt(totals.tax)} F CFA</dd></div>}
                <div className="iv-due"><dt>Total TTC</dt><dd>{fmt(totals.total)} F CFA</dd></div>
              </dl>
              {doc.words && <p className="ed-words">{doc.words}</p>}
            </section>
            <div className="ed-preview" aria-label="Aperçu de la facture">
              <InvoicePaper config={invoiceTemplate} biz={orgSettings} paymentMethods={paymentMethods} paymentTerms={orgSettings.paymentTerms} doc={doc} />
            </div>
          </aside>
        </div>
      </Page>
      {compliance.dialog}
    </>
  );
}
