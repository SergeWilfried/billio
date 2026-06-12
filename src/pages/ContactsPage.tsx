import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { EmptyState, EmptyInline } from '../components/EmptyState';
import { ClientsEmptyIllustration } from '../components/PageEmptyIllustrations';
import { SuppliersEmptyIllustration } from '../components/accounting/EmptyIllustrations';
import { PageSkeleton } from '../components/SkeletonLoader';
import KPIStrip from '../components/accounting/KPIStrip';
import DrawerPanel from '../components/accounting/DrawerPanel';
import StatusPill from '../components/accounting/StatusPill';
import { useApp } from '../context/AppContext';
import { createClient, updateClient, removeClient } from '../lib/api/clients';
import { fmt, fmtCompact } from '../data';
import type { ClientStatus, ClientRecord, InvoiceStatus, NewClientForm } from '../lib/schemas';
import type { SupplierBill } from '../lib/accounting-data';
import { useSupplierBills } from '../lib/accounting-hooks';

// ─── Shared helpers ───────────────────────────────────────────────────────────

type Tab = 'clients' | 'suppliers';

const AV_COLORS = [
  { bg: '#B5D4F4', color: '#0C447C' },
  { bg: '#9FE1CB', color: '#085041' },
  { bg: '#F5C4B3', color: '#712B13' },
  { bg: '#C0DD97', color: '#27500A' },
  { bg: '#F4C0D1', color: '#72243E' },
];

function supplierAvColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AV_COLORS.length;
  return AV_COLORS[hash];
}
function supplierInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
function daysDue(dueDate: string) {
  return Math.round((new Date(dueDate).getTime() - new Date('2026-06-10').getTime()) / 86400000);
}

// ─── Clients sub-components ───────────────────────────────────────────────────

type ClientFilterKey = 'all' | 'active' | 'lead' | 'balance';
type MiniInv = { id: string; sub: string; amt: number; status: InvoiceStatus };

const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = { active: 'Actif', lead: 'Prospect', inactive: 'Inactif' };
const INV_STATUS_LABEL: Record<MiniInv['status'], string> = { paid: 'Payée', pending: 'En attente', overdue: 'En retard', draft: 'Brouillon' };
const EMPTY_FORM: NewClientForm = { name: '', contact: '', email: '', phone: '', city: '', status: 'active', ifu: '', rccm: '', taxRegime: '' };
const CLIENT_FILTERS: { key: ClientFilterKey; label: string }[] = [
  { key: 'all', label: 'Tous' }, { key: 'active', label: 'Actifs' }, { key: 'lead', label: 'Prospects' }, { key: 'balance', label: 'Avec solde' },
];

// ─── Supplier sub-components ──────────────────────────────────────────────────

interface SupplierContact {
  name: string;
  city: string;
  bills: SupplierBill[];
  totalTTC: number;
  totalPayable: number;
  overdueCount: number;
}

interface BillForm { supplier: string; city: string; piece: string; date: string; dueDate: string; htAmount: string }
const EMPTY_BILL_FORM: BillForm = { supplier: '', city: '', piece: '', date: new Date().toISOString().slice(0, 10), dueDate: '', htAmount: '' };
const TVA_RATE = 0.18;

function BillDrawer({ bill, onMarkPaid, onClose }: { bill: SupplierBill; onMarkPaid: (id: string) => void; onClose: () => void }) {
  const av = supplierAvColor(bill.supplier);
  const days = daysDue(bill.dueDate);
  return (
    <DrawerPanel open onClose={onClose} title={
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
          {supplierInitials(bill.supplier)}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{bill.supplier}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{bill.city} · {bill.piece}</div>
        </div>
      </div>
    }>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Date facture', value: bill.date },
          { label: 'Échéance', value: bill.dueDate },
          { label: 'Statut', value: <StatusPill status={bill.status} /> },
          { label: days > 0 ? 'Jours restants' : 'Jours retard', value: `${Math.abs(days)} j.` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '11px 13px', border: '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-tertiary)' }}>{label}</div>
            <div style={{ marginTop: 5, fontSize: 13.5, fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>
      <div className="dsec-label"><Icon name="receipt" size={13} />Détail montant</div>
      <div style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', marginBottom: 20 }}>
        {[
          { label: 'Montant HT', value: bill.htAmount },
          { label: 'TVA (18%)', value: bill.tvaAmount },
          { label: 'Total TTC', value: bill.htAmount + bill.tvaAmount, bold: true, highlight: true },
        ].map(({ label, value, bold, highlight }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: highlight ? 'var(--brand-tint)' : 'transparent', fontWeight: bold ? 700 : 400, fontSize: 13 }}>
            <span style={{ color: highlight ? 'var(--brand-dark)' : 'var(--color-text-secondary)' }}>{label}</span>
            <span className="mono">{fmt(value)} F CFA</span>
          </div>
        ))}
      </div>
      <div className="dsec-label"><Icon name="book-2" size={13} />Simulation comptable</div>
      <div style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 100px 100px', gap: 8, padding: '8px 14px', background: 'var(--color-background-secondary)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-secondary)' }}>
          <span>Compte</span><span>Libellé</span><span style={{ textAlign: 'right' }}>Débit</span><span style={{ textAlign: 'right' }}>Crédit</span>
        </div>
        {bill.acctLines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 100px 100px', gap: 8, padding: '10px 14px', borderTop: '0.5px solid var(--color-border-tertiary)', fontSize: 12.5, alignItems: 'center' }}>
            <span className="mono" style={{ fontWeight: 700, color: 'var(--brand)' }}>{l.acct}</span>
            <span style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.label}</span>
            <span className="mono" style={{ textAlign: 'right', fontWeight: l.side === 'D' ? 600 : 400, color: l.side === 'D' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{l.side === 'D' ? fmt(l.amount) : '—'}</span>
            <span className="mono" style={{ textAlign: 'right', fontWeight: l.side === 'C' ? 600 : 400, color: l.side === 'C' ? '#A32D2D' : 'var(--color-text-tertiary)' }}>{l.side === 'C' ? fmt(l.amount) : '—'}</span>
          </div>
        ))}
      </div>
      {bill.status !== 'paid' && (
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { onMarkPaid(bill.id); onClose(); }}>
          <Icon name="check" />Marquer comme payé
        </button>
      )}
    </DrawerPanel>
  );
}

function NewBillDrawer({ onSave, onClose, initialSupplier = '' }: { onSave: (f: BillForm) => Promise<void>; onClose: () => void; initialSupplier?: string }) {
  const [form, setForm] = useState<BillForm>({ ...EMPTY_BILL_FORM, supplier: initialSupplier });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof BillForm, v: string) => setForm(p => ({ ...p, [k]: v }));
  const ht = parseFloat(form.htAmount) || 0;
  const tva = Math.round(ht * TVA_RATE);
  const valid = form.supplier.trim() && form.piece.trim() && form.dueDate && ht > 0;
  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  };
  return (
    <DrawerPanel open onClose={onClose} title="Nouvelle facture fournisseur" subtitle="Enregistrement d'une dette">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Fournisseur *</label>
          <input className="form-input" value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Nom du fournisseur" />
        </div>
        <div>
          <label className="form-label">Ville</label>
          <input className="form-input" value={form.city} onChange={e => set('city', e.target.value)} placeholder="Abidjan" />
        </div>
        <div>
          <label className="form-label">Référence pièce *</label>
          <input className="form-input" value={form.piece} onChange={e => set('piece', e.target.value)} placeholder="FACT-2026-001" />
        </div>
        <div>
          <label className="form-label">Date facture</label>
          <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Date d'échéance *</label>
          <input className="form-input" type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Montant HT (F CFA) *</label>
          <input className="form-input" type="number" min="0" value={form.htAmount} onChange={e => set('htAmount', e.target.value)} placeholder="0" />
        </div>
      </div>
      {ht > 0 && (
        <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '11px 14px', marginBottom: 16 }}>
          {[{ label: 'Montant HT', value: ht }, { label: 'TVA (18%)', value: tva }, { label: 'Total TTC', value: ht + tva }].map(({ label, value }, i) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none', fontWeight: i === 2 ? 700 : 400, fontSize: 12.5 }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
              <span className="mono">{fmt(value)} F CFA</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 9 }}>
        <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!valid || saving} onClick={handleSave}>
          <Icon name="check" size={15} />{saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </DrawerPanel>
  );
}

const BILL_STATUS_FILTERS = [
  { key: 'all', label: 'Toutes' },
  { key: 'open', label: 'En cours' },
  { key: 'overdue', label: 'En retard' },
  { key: 'paid', label: 'Payées' },
];

function SupplierDetailDrawer({ supplier, onClose, onMarkPaid, onNewBill }: {
  supplier: SupplierContact;
  onClose: () => void;
  onMarkPaid: (id: string) => void;
  onNewBill: (name: string) => void;
}) {
  const [localBill, setLocalBill] = useState<SupplierBill | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const av = supplierAvColor(supplier.name);

  if (localBill) {
    return <BillDrawer bill={localBill} onMarkPaid={onMarkPaid} onClose={() => setLocalBill(null)} />;
  }

  const visibleBills = statusFilter === 'all' ? supplier.bills : supplier.bills.filter(b => b.status === statusFilter);
  const statusCounts: Record<string, number> = { all: supplier.bills.length };
  supplier.bills.forEach(b => { statusCounts[b.status] = (statusCounts[b.status] || 0) + 1; });

  return (
    <DrawerPanel open onClose={onClose} title={
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
          {supplierInitials(supplier.name)}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{supplier.name}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="map-pin" size={12} />{supplier.city}
          </div>
        </div>
      </div>
    }>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total TTC', value: fmt(supplier.totalTTC) + ' F CFA' },
          { label: 'Reste à payer', value: fmt(supplier.totalPayable) + ' F CFA' },
          { label: 'Factures', value: `${supplier.bills.length} facture${supplier.bills.length !== 1 ? 's' : ''}` },
          { label: 'En retard', value: supplier.overdueCount > 0 ? `${supplier.overdueCount} en retard` : 'Aucun retard' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '11px 13px', border: '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-tertiary)' }}>{label}</div>
            <div style={{ marginTop: 5, fontSize: 13, fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Bill status filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {BILL_STATUS_FILTERS.map(({ key, label }) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 20, border: '0.5px solid var(--color-border-secondary)', cursor: 'pointer', transition: 'all .1s',
              background: statusFilter === key ? 'var(--brand)' : 'var(--color-background-secondary)',
              color: statusFilter === key ? '#fff' : 'var(--color-text-secondary)' }}>
            {label} {statusCounts[key] ?? 0}
          </button>
        ))}
      </div>

      {/* Bills list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {visibleBills.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-tertiary)', fontSize: 13 }}>Aucune facture dans ce filtre</div>
        ) : visibleBills.map(bill => {
          const days = daysDue(bill.dueDate);
          const ttc = bill.htAmount + bill.tvaAmount;
          return (
            <div key={bill.id} onClick={() => setLocalBill(bill)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', borderRadius: 'var(--border-radius-md)', cursor: 'pointer', transition: 'background .1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bill.piece}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>Échéance {bill.dueDate}{bill.status === 'overdue' ? <span style={{ color: '#A32D2D', fontWeight: 700 }}> · {Math.abs(days)} j. retard</span> : null}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 12.5, fontWeight: 700 }}>{fmt(ttc)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>F CFA</div>
                </div>
                <StatusPill status={bill.status} />
                <Icon name="chevron-right" size={14} style={{ color: 'var(--color-text-tertiary)' }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 20 }}>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { onClose(); onNewBill(supplier.name); }}>
          <Icon name="plus" size={15} />Nouvelle facture
        </button>
      </div>
    </DrawerPanel>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get('tab') === 'suppliers' ? 'suppliers' : 'clients'
  );

  useEffect(() => {
    setSearchParams(tab === 'suppliers' ? { tab: 'suppliers' } : {}, { replace: true });
  }, [tab]);

  // Clients data
  const { clients, setClients, invoices, orgId, showToast, loading: clientsLoading } = useApp();
  const [clientFilter, setClientFilter] = useState<ClientFilterKey>('all');
  const [clientSearch, setClientSearch] = useState('');
  const [clientPanel, setClientPanel] = useState<null | { kind: 'detail'; code: string } | { kind: 'new' }>(null);
  const [form, setForm] = useState<NewClientForm>(EMPTY_FORM);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<NewClientForm>(EMPTY_FORM);

  // Suppliers data
  const { data: bills, loading: suppLoading, markPaid, createBill } = useSupplierBills();
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierContact | null>(null);
  const [showBillForm, setShowBillForm] = useState(false);
  const [billInitialSupplier, setBillInitialSupplier] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');

  // ── useMemo calls must be unconditional (before any early return) ─────────
  const filteredClients = useMemo(() => {
    let list = clients;
    if (clientFilter === 'active')  list = list.filter(c => c.status === 'active');
    if (clientFilter === 'lead')    list = list.filter(c => c.status === 'lead');
    if (clientFilter === 'balance') list = list.filter(c => c.balance > 0);
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q) || c.city.toLowerCase().includes(q));
    }
    return list;
  }, [clients, clientFilter, clientSearch]);

  const supplierBillsAll = bills ?? [];
  const supplierContacts = useMemo((): SupplierContact[] => {
    const map = new Map<string, SupplierContact>();
    supplierBillsAll.forEach(b => {
      const ttc = b.htAmount + b.tvaAmount;
      const ex = map.get(b.supplier);
      if (ex) {
        ex.bills.push(b);
        ex.totalTTC += ttc;
        if (b.status !== 'paid') ex.totalPayable += ttc;
        if (b.status === 'overdue') ex.overdueCount++;
      } else {
        map.set(b.supplier, { name: b.supplier, city: b.city, bills: [b], totalTTC: ttc, totalPayable: b.status !== 'paid' ? ttc : 0, overdueCount: b.status === 'overdue' ? 1 : 0 });
      }
    });
    return Array.from(map.values());
  }, [supplierBillsAll]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return supplierContacts;
    const q = supplierSearch.toLowerCase();
    return supplierContacts.filter(s => s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q));
  }, [supplierContacts, supplierSearch]);

  const loading = tab === 'clients' ? clientsLoading : suppLoading;
  if (loading) return <PageSkeleton title="Contacts" variant="accounting" rows={6} />;

  // ── Clients computed ──────────────────────────────────────────────────────
  const totalBilled  = clients.reduce((s, c) => s + c.billed, 0);
  const outstanding  = clients.reduce((s, c) => s + c.balance, 0);
  const activeCount  = clients.filter(c => c.status === 'active').length;
  const withBalance  = clients.filter(c => c.balance > 0).length;
  const leadCount    = clients.filter(c => c.status === 'lead').length;
  const clientCounts = { all: clients.length, active: activeCount, lead: leadCount, balance: withBalance };

  const detailClient = clientPanel?.kind === 'detail' ? clients.find(c => c.code === clientPanel.code) ?? null : null;

  function closeClientPanel() { setClientPanel(null); setEditMode(false); }
  function openDetailEdit(cl: ClientRecord | null) {
    if (!cl) return;
    setEditForm({ name: cl.name, contact: cl.contact === '—' ? '' : cl.contact, email: cl.email === '—' ? '' : cl.email, phone: cl.phone === '—' ? '' : cl.phone, city: cl.city === '—' ? '' : cl.city, status: cl.status, ifu: cl.ifu ?? '', rccm: cl.rccm ?? '', taxRegime: cl.taxRegime ?? '' });
    setEditMode(true);
  }
  async function handleSaveEdit(cl: ClientRecord | null) {
    if (!cl) return;
    const patch = { name: editForm.name, contact: editForm.contact || '—', email: editForm.email || '—', phone: editForm.phone || '—', city: editForm.city || '—', status: editForm.status, ifu: editForm.ifu, rccm: editForm.rccm, taxRegime: editForm.taxRegime };
    setClients(prev => prev.map(c => c.code === cl.code ? { ...c, ...patch } : c));
    await updateClient(cl.code, patch);
    setEditMode(false);
    showToast('Client mis à jour');
  }
  async function handleDeleteClient(cl: ClientRecord | null) {
    if (!cl) return;
    if (!window.confirm(`Supprimer "${cl.name}" ? Cette action est irréversible.`)) return;
    setClients(prev => prev.filter(c => c.code !== cl.code));
    await removeClient(cl.code);
    closeClientPanel();
    showToast(`"${cl.name}" supprimé`);
  }
  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const avs = ['av-a','av-b','av-c','av-d','av-e','av-f','av-g','av-h'];
    const words = form.name.trim().split(/\s+/);
    const code = ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || 'NC';
    const payload = { code, av: avs[clients.length % avs.length], name: form.name, contact: form.contact || '—', email: form.email || '—', phone: form.phone || '—', city: form.city || '—', ifu: form.ifu, rccm: form.rccm, taxRegime: form.taxRegime, status: form.status };
    setClients(prev => [{ ...payload, invoices: 0, billed: 0, balance: 0 }, ...prev]);
    await createClient(orgId, payload);
    setForm(EMPTY_FORM);
    closeClientPanel();
  }

  // ── Suppliers computed ────────────────────────────────────────────────────
  const supplierBills = supplierBillsAll;
  const totalPayable  = supplierBills.filter(b => b.status !== 'paid').reduce((s, b) => s + b.htAmount + b.tvaAmount, 0);
  const dueSoon       = supplierBills.filter(b => b.status === 'open' && daysDue(b.dueDate) <= 7).reduce((s, b) => s + b.htAmount + b.tvaAmount, 0);
  const overdue       = supplierBills.filter(b => b.status === 'overdue').reduce((s, b) => s + b.htAmount + b.tvaAmount, 0);
  const suppCount     = new Set(supplierBills.map(b => b.supplier)).size;

  async function handleCreateBill(billForm: BillForm) {
    const ht = parseFloat(billForm.htAmount);
    await createBill({ supplier: billForm.supplier, city: billForm.city, piece: billForm.piece, date: billForm.date, dueDate: billForm.dueDate, htAmount: ht, tvaAmount: Math.round(ht * TVA_RATE), status: 'open' });
  }

  // ── KPI strip — always 4 cards: 2 clients · 2 suppliers ─────────────────
  const kpis = [
    { icon: 'users',          iconBg: '#E9F0FA',            iconColor: 'var(--brand)',  label: 'Clients',        value: clients.length,          sub: `${activeCount} actifs · ${leadCount} prospects` },
    { icon: 'clock-pause',    iconBg: '#FAEEDA',            iconColor: '#B26A09',       label: 'Solde impayé',   value: fmtCompact(outstanding),  unit: 'F CFA', sub: `${withBalance} client${withBalance !== 1 ? 's' : ''} avec solde` },
    { icon: 'truck-delivery', iconBg: '#FCEFE0',            iconColor: '#B26A09',       label: 'Total à payer',  value: fmtCompact(totalPayable), unit: 'F CFA', sub: `${supplierBills.filter(b => b.status !== 'paid').length} factures ouvertes` },
    { icon: 'alert-triangle', iconBg: '#FCEBEB',            iconColor: '#A32D2D',       label: 'En retard',      value: fmtCompact(overdue),      unit: 'F CFA', sub: `${suppCount} fournisseur${suppCount !== 1 ? 's' : ''} actifs` },
  ];

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px',
    borderRadius: 'var(--border-radius-md)', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: active ? 600 : 500,
    background: active ? 'var(--color-background-primary)' : 'transparent',
    color: active ? 'var(--brand)' : 'var(--color-text-secondary)',
    boxShadow: active ? 'var(--shadow-sm)' : 'none',
    transition: 'all .12s',
  });

  return (
    <>
      <div className="main" style={{ position: 'relative' }}>
        <div className="topbar">
          <div>
            <div className="page-title">Contacts</div>
            <div className="page-sub">Clients &amp; fournisseurs</div>
          </div>
          <div className="topbar-actions">
            {tab === 'clients'
              ? <button className="btn btn-primary" onClick={() => setClientPanel({ kind: 'new' })}><Icon name="user-plus" size={15} />Nouveau client</button>
              : <button className="btn btn-primary" onClick={() => setShowBillForm(true)}><Icon name="plus" size={15} />Nouvelle facture</button>
            }
          </div>
        </div>

        <div className="content">
          <KPIStrip items={kpis} />

          {/* ── Tab switcher ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 3, background: 'var(--color-background-secondary)', padding: 3, borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)', width: 'fit-content', marginBottom: 16 }}>
            <button style={tabStyle(tab === 'clients')} onClick={() => setTab('clients')}>
              <Icon name="users" size={14} />Clients
              <span style={{ fontSize: 11, fontWeight: 600, background: tab === 'clients' ? 'var(--brand-tint)' : 'var(--color-background-tertiary)', color: tab === 'clients' ? 'var(--brand)' : 'var(--color-text-tertiary)', borderRadius: 10, padding: '1px 6px' }}>{clients.length}</span>
            </button>
            <button style={tabStyle(tab === 'suppliers')} onClick={() => setTab('suppliers')}>
              <Icon name="truck-delivery" size={14} />Fournisseurs
              <span style={{ fontSize: 11, fontWeight: 600, background: tab === 'suppliers' ? 'var(--brand-tint)' : 'var(--color-background-tertiary)', color: tab === 'suppliers' ? 'var(--brand)' : 'var(--color-text-tertiary)', borderRadius: 10, padding: '1px 6px' }}>{suppCount}</span>
            </button>
          </div>

          {/* ── Clients tab ──────────────────────────────────────────────── */}
          {tab === 'clients' && (
            <>
              <div className="section-header">
                <div className="section-title">Répertoire clients
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="search-box">
                    <Icon name="search" size={15} />
                    <input type="text" placeholder="Rechercher un client…" value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
                  </div>
                  <div className="filters">
                    {CLIENT_FILTERS.map(f => (
                      <button key={f.key} className={'filter-chip' + (clientFilter === f.key ? ' active' : '')} onClick={() => setClientFilter(f.key)}>
                        {f.label}<span className="cnt">{clientCounts[f.key]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="client-table">
                <div className="table-head client-grid-cols">
                  <div className="th">Client</div>
                  <div className="th">Localisation</div>
                  <div className="th">Factures</div>
                  <div className="th right">Total facturé</div>
                  <div className="th">Statut</div>
                  <div className="th" />
                </div>
                {filteredClients.length === 0 ? (
                  <EmptyState illustration={<ClientsEmptyIllustration />} title="Aucun client trouvé" description="Aucun client ne correspond à votre recherche. Essayez d'autres termes." />
                ) : filteredClients.map(cl => (
                  <div key={cl.code} className="client-row client-grid-cols" onClick={() => setClientPanel({ kind: 'detail', code: cl.code })}>
                    <div className="name-cell">
                      <div className={`cl-av ${cl.av}`}>{cl.code}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="cl-name">{cl.name}</div>
                        <div className="cl-contact">{cl.contact}</div>
                      </div>
                    </div>
                    <div className="loc-cell"><Icon name="map-pin" size={14} />{cl.city}</div>
                    <div className="inv-count tnum">{cl.invoices} <span>facture{cl.invoices !== 1 ? 's' : ''}</span></div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="billed tnum">{fmt(cl.billed)}<span className="cur">F CFA</span></div>
                      {cl.balance > 0
                        ? <div className="billed-sub bal">{fmt(cl.balance)} F CFA dû</div>
                        : cl.billed > 0
                          ? <div className="billed-sub clear">Tout réglé</div>
                          : <div className="billed-sub" style={{ color: 'var(--color-text-tertiary)' }}>Aucune facture</div>
                      }
                    </div>
                    <div><span className={`status-pill s-${cl.status}`}>{CLIENT_STATUS_LABEL[cl.status]}</span></div>
                    <div className="row-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-btn" aria-label="Plus"><Icon name="dots" size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Suppliers tab ─────────────────────────────────────────────── */}
          {tab === 'suppliers' && (
            <>
              <div className="acc-toolbar">
                <input
                  className="search-input"
                  placeholder="Rechercher un fournisseur…"
                  value={supplierSearch}
                  onChange={e => setSupplierSearch(e.target.value)}
                  style={{ maxWidth: 280 }}
                />
                <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setBillInitialSupplier(''); setShowBillForm(true); }}>
                  <Icon name="plus" size={15} /> Nouvelle facture
                </button>
              </div>

              <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 130px 110px 36px', gap: 14, padding: '10px 18px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                  {['Fournisseur', 'Factures', 'Total TTC', 'En retard', ''].map((h, i) => (
                    <div key={i} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: i >= 1 && i <= 3 ? 'right' : 'left' }}>{h}</div>
                  ))}
                </div>
                {filteredSuppliers.length === 0
                  ? <EmptyState illustration={<SuppliersEmptyIllustration />} title="Aucun fournisseur" description="Aucun fournisseur trouvé." />
                  : filteredSuppliers.map((s, i) => {
                    const av = supplierAvColor(s.name);
                    return (
                      <div key={s.name} onClick={() => setSelectedSupplier(s)}
                        style={{ display: 'grid', gridTemplateColumns: '1fr 110px 130px 110px 36px', gap: 14, padding: '13px 18px', borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none', cursor: 'pointer', alignItems: 'center', transition: 'background .1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                            {supplierInitials(s.name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{s.city}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 12.5, textAlign: 'right', fontWeight: 500 }}>{s.bills.length} facture{s.bills.length !== 1 ? 's' : ''}</div>
                        <div className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{fmt(s.totalTTC)} <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>F CFA</span></div>
                        <div style={{ textAlign: 'right' }}>
                          {s.overdueCount > 0
                            ? <span style={{ fontSize: 11.5, fontWeight: 700, color: '#A32D2D' }}>{s.overdueCount} retard</span>
                            : <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11.5 }}>—</span>}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', color: 'var(--color-text-tertiary)' }}><Icon name="chevron-right" size={16} /></div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Client panels ────────────────────────────────────────────────── */}
      <div className={'scrim' + (clientPanel ? ' open' : '')} onClick={closeClientPanel} />

      <div className={'new-inv-panel' + (clientPanel?.kind === 'detail' ? ' open' : '')}>
        {detailClient && (
          <>
            <div className="panel-slide-head">
              <div>
                <div className="panel-slide-title">Client</div>
                <div className="panel-slide-sub">Aperçu &amp; historique</div>
              </div>
              <button className="icon-btn" onClick={closeClientPanel} aria-label="Fermer"><Icon name="x" size={18} /></button>
            </div>
            <div className="panel-body">
              <div className="detail-hero">
                <div className={`detail-av ${detailClient.av}`}>{detailClient.code}</div>
                <div>
                  <div className="detail-name">{detailClient.name}</div>
                  <div className="detail-meta">{detailClient.contact} · {detailClient.city}</div>
                </div>
              </div>
              <div className="stat-row">
                <div className="stat-box">
                  <div className="stat-label">Total facturé</div>
                  <div className="stat-val tnum">{fmtCompact(detailClient.billed)}<span className="cur">F CFA</span></div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Solde impayé</div>
                  <div className={'stat-val tnum' + (detailClient.balance > 0 ? ' bal' : '')}>{fmtCompact(detailClient.balance)}<span className="cur">F CFA</span></div>
                </div>
              </div>
              <div className="detail-block">
                <div className="detail-block-title">Contact</div>
                {editMode ? (
                  <>
                    {[
                      { label: 'Raison sociale', key: 'name' as const, type: 'text' },
                      { label: 'Contact principal', key: 'contact' as const, type: 'text' },
                      { label: 'Email', key: 'email' as const, type: 'email' },
                      { label: 'Téléphone', key: 'phone' as const, type: 'text' },
                      { label: 'Ville', key: 'city' as const, type: 'text' },
                    ].map(({ label, key, type }) => (
                      <div key={key} className="form-group" style={{ marginBottom: 8 }}>
                        <label className="form-label">{label}</label>
                        <input className="form-input" type={type} value={editForm[key] as string} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} />
                      </div>
                    ))}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Statut</label>
                      <select className="form-input" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as ClientStatus }))}>
                        <option value="active">Actif</option>
                        <option value="lead">Prospect</option>
                        <option value="inactive">Inactif</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="contact-line"><Icon name="mail" size={16} /><span>{detailClient.email}</span></div>
                    <div className="contact-line"><Icon name="phone" size={16} /><span>{detailClient.phone}</span></div>
                    <div className="contact-line"><Icon name="map-pin" size={16} /><span>{detailClient.city}</span></div>
                  </>
                )}
              </div>
              {(detailClient.ifu || detailClient.rccm || detailClient.taxRegime) && (
                <div className="detail-block">
                  <div className="detail-block-title">Identifiants fiscaux</div>
                  {detailClient.ifu && <div className="contact-line"><Icon name="file-text" size={16} /><span>IFU&nbsp;<strong>{detailClient.ifu}</strong></span></div>}
                  {detailClient.rccm && <div className="contact-line"><Icon name="building" size={16} /><span>RCCM&nbsp;<strong>{detailClient.rccm}</strong></span></div>}
                  {detailClient.taxRegime && <div className="contact-line"><Icon name="tag" size={16} /><span>Régime&nbsp;<strong>{detailClient.taxRegime}</strong></span></div>}
                </div>
              )}
              <div className="detail-block">
                <div className="detail-block-title">Factures récentes</div>
                {(() => {
                  const recentInvs: MiniInv[] = invoices.filter(i => i.client === detailClient.code).slice(0, 5).map(i => ({ id: i.id, sub: i.subject, amt: i.amount, status: i.status }));
                  return recentInvs.length === 0 ? (
                    <EmptyInline message="Aucune facture pour ce client." />
                  ) : recentInvs.map(inv => (
                    <div key={inv.id} className="mini-inv">
                      <div><div className="mini-id">#{inv.id}</div><div className="mini-sub">{inv.sub}</div></div>
                      <div className="mini-amt">{fmt(inv.amt)} F CFA</div>
                      <span className={`mini-status st-${inv.status}`}>{INV_STATUS_LABEL[inv.status]}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
            <div className="panel-footer" style={{ flexDirection: 'column', gap: 8 }}>
              {editMode ? (
                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                  <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setEditMode(false)}>Annuler</button>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleSaveEdit(detailClient)}><Icon name="check" size={15} /> Enregistrer</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                  <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => openDetailEdit(detailClient)}><Icon name="edit" size={15} /> Modifier</button>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}><Icon name="plus" size={15} /> Nouvelle facture</button>
                </div>
              )}
              <button className="btn btn-ghost btn-danger" style={{ width: '100%', justifyContent: 'center' }} onClick={() => handleDeleteClient(detailClient)}><Icon name="trash" size={15} /> Supprimer ce client</button>
            </div>
          </>
        )}
      </div>

      <div className={'new-inv-panel' + (clientPanel?.kind === 'new' ? ' open' : '')}>
        <div className="panel-slide-head">
          <div>
            <div className="panel-slide-title">Nouveau client</div>
            <div className="panel-slide-sub">Ajouter une entreprise que vous facturez</div>
          </div>
          <button className="icon-btn" onClick={closeClientPanel} aria-label="Fermer"><Icon name="x" size={18} /></button>
        </div>
        <form id="new-client-form" className="panel-body" onSubmit={handleAddClient}>
          <div className="form-group">
            <label className="form-label">Raison sociale</label>
            <input className="form-input" placeholder="ex. Faso Energy" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Contact principal</label>
            <input className="form-input" placeholder="ex. Awa Bamba" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="contact@entreprise.bf" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Téléphone</label>
              <input className="form-input" type="tel" placeholder="70 00 00 00" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ville</label>
              <input className="form-input" placeholder="Ouagadougou" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Statut</label>
              <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ClientStatus }))}>
                <option value="active">Actif</option>
                <option value="lead">Prospect</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">IFU <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}>— optionnel</span></label>
              <input className="form-input" placeholder="00012345 B" value={form.ifu} onChange={e => setForm(f => ({ ...f, ifu: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">RCCM <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}>— optionnel</span></label>
              <input className="form-input" placeholder="BF-OUA-2021-B-1234" value={form.rccm} onChange={e => setForm(f => ({ ...f, rccm: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Régime fiscal <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}>— optionnel</span></label>
            <select className="form-input" value={form.taxRegime} onChange={e => setForm(f => ({ ...f, taxRegime: e.target.value }))}>
              <option value="">— Sélectionner —</option>
              <option value="RNI">RNI — Régime normal d'imposition (CA ≥ 50M F CFA)</option>
              <option value="RSI">RSI — Régime simplifié d'imposition (CA 15–50M F CFA)</option>
              <option value="CME">CME — Contribution des micro-entreprises (CA &lt; 15M F CFA)</option>
            </select>
          </div>
        </form>
        <div className="panel-footer">
          <button type="button" className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={closeClientPanel}>Annuler</button>
          <button type="submit" form="new-client-form" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}><Icon name="check" size={15} />Ajouter</button>
        </div>
      </div>

      {/* ── Supplier drawers ─────────────────────────────────────────────── */}
      {selectedSupplier && (
        <SupplierDetailDrawer
          supplier={selectedSupplier}
          onMarkPaid={markPaid}
          onNewBill={name => { setBillInitialSupplier(name); setSelectedSupplier(null); setShowBillForm(true); }}
          onClose={() => setSelectedSupplier(null)}
        />
      )}
      {showBillForm && <NewBillDrawer initialSupplier={billInitialSupplier} onSave={handleCreateBill} onClose={() => setShowBillForm(false)} />}
    </>
  );
}
