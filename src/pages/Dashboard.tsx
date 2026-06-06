import { useState, useEffect, useRef } from 'react';
import Icon from '../components/Icon';

type Status = 'paid' | 'pending' | 'overdue' | 'draft';
type FilterKey = 'all' | Status;

interface Invoice {
  id: string;
  subject: string;
  client: string;
  clientInitials: string;
  clientEmail: string;
  avClass: string;
  issued: string;
  amount: number;
  status: Status;
}

interface ActivityItem {
  type: 'paid' | 'sent' | 'overdue' | 'viewed' | 'created';
  text: React.ReactNode;
  time: string;
}

interface TopClient {
  name: string;
  initials: string;
  avClass: string;
  totalRevenue: number;
  invoiceCount: number;
  barPct: number;
}

interface LineItem {
  id: string;
  description: string;
  qty: string;
  price: string;
}

const INVOICES: Invoice[] = [
  { id: 'FAC-0041', subject: 'Identité visuelle — T2', client: 'Agence Digitale Sahel', clientInitials: 'AD', clientEmail: 'contact@sahel.digital', avClass: 'av-a', issued: '3 juin', amount: 1_200_000, status: 'paid' },
  { id: 'FAC-0040', subject: 'UI application mobile sprint 4', client: 'Construction Ouaga', clientInitials: 'CO', clientEmail: 'admin@couaga.bf', avClass: 'av-b', issued: '1 juin', amount: 850_000, status: 'pending' },
  { id: 'FAC-0039', subject: 'Développement plateforme web', client: 'TechHub Abidjan', clientInitials: 'TH', clientEmail: 'tech@hub-abi.ci', avClass: 'av-c', issued: '28 mai', amount: 2_400_000, status: 'overdue' },
  { id: 'FAC-0038', subject: 'Retainer annuel de conseil', client: 'Sahel Banque', clientInitials: 'SB', clientEmail: 'ops@sahelbanque.com', avClass: 'av-d', issued: '25 mai', amount: 1_800_000, status: 'paid' },
  { id: 'FAC-0037', subject: 'Refonte du logo', client: 'Bureau Dakar', clientInitials: 'BD', clientEmail: 'info@bureau-dk.sn', avClass: 'av-e', issued: '20 mai', amount: 380_000, status: 'overdue' },
  { id: 'FAC-0036', subject: 'Audit e-commerce', client: 'Import-Export Mali', clientInitials: 'IE', clientEmail: 'trade@iemali.ml', avClass: 'av-f', issued: '15 mai', amount: 650_000, status: 'draft' },
];

const ACTIVITY: ActivityItem[] = [
  { type: 'paid', text: <><b>FAC-0041</b> payée par Agence Digitale Sahel</>, time: 'il y a 2 heures' },
  { type: 'sent', text: <><b>FAC-0040</b> envoyée à Construction Ouaga</>, time: 'il y a 5 heures' },
  { type: 'overdue', text: <><b>FAC-0039</b> en retard — échéance 28 mai</>, time: 'il y a 1 jour' },
  { type: 'viewed', text: <><b>FAC-0038</b> consultée par Sahel Banque</>, time: 'il y a 2 jours' },
  { type: 'paid', text: <><b>FAC-0038</b> payée par Sahel Banque</>, time: 'il y a 3 jours' },
];

const TOP_CLIENTS: TopClient[] = [
  { name: 'Sahel Banque', initials: 'SB', avClass: 'av-d', totalRevenue: 4_200_000, invoiceCount: 3, barPct: 100 },
  { name: 'Agence Digitale Sahel', initials: 'AD', avClass: 'av-a', totalRevenue: 3_100_000, invoiceCount: 5, barPct: 74 },
  { name: 'TechHub Abidjan', initials: 'TH', avClass: 'av-c', totalRevenue: 2_400_000, invoiceCount: 2, barPct: 57 },
  { name: 'Construction Ouaga', initials: 'CO', avClass: 'av-b', totalRevenue: 1_500_000, invoiceCount: 3, barPct: 36 },
  { name: 'Bureau Dakar', initials: 'BD', avClass: 'av-e', totalRevenue: 980_000, invoiceCount: 4, barPct: 23 },
];

const CLIENTS_FOR_SELECT = [...new Set(INVOICES.map(i => i.client))];

function fmtXOF(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString('fr-FR');
}

function fmtXOFFull(n: number) {
  return n.toLocaleString('fr-FR');
}

const STATUS_LABEL: Record<Status, string> = {
  paid: 'Payée',
  pending: 'En attente',
  overdue: 'En retard',
  draft: 'Brouillon',
};

const BillioMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5.5 3.2h10.2c.6 0 1.1.2 1.5.6l3 3c.4.4.6.9.6 1.5v12c0 .7-.6 1.1-1.2.8l-1.6-.8-1.7.9c-.3.2-.7.2-1 0l-1.6-.9-1.7.9c-.3.2-.7.2-1 0l-1.6-.9-1.7.9c-.3.2-.7.2-1 0l-1.6-.9-1.6.8c-.6.3-1.3-.1-1.3-.8V4.7c0-.8.7-1.5 1.5-1.5z"
      fill="#fff" fillOpacity="0.96"
    />
    <path d="M8 8.2h6M8 11.4h7M8 14.6h4" stroke="#185FA5" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

function newLineItem(): LineItem {
  return { id: crypto.randomUUID(), description: '', qty: '1', price: '' };
}

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [activeNav, setActiveNav] = useState('Tableau de bord');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [panelOpen, setPanelOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [fClient, setFClient] = useState('');
  const [fDate, setFDate] = useState('2026-06-06');
  const [fDue, setFDue] = useState('2026-06-20');
  const [fSubject, setFSubject] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem()]);
  const [fPay, setFPay] = useState('Mobile Money (MTN / Orange / Wave)');
  const [fNotes, setFNotes] = useState('');

  const pendingCount = INVOICES.filter(i => i.status === 'pending').length;
  const overdueCount = INVOICES.filter(i => i.status === 'overdue').length;

  const filteredInvoices = filter === 'all'
    ? INVOICES
    : INVOICES.filter(i => i.status === filter);

  const totalRevenue = INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const outstanding = INVOICES.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0);
  const overdueAmt = INVOICES.filter(i => i.status === 'overdue').reduce((s, i) => s + i.amount, 0);

  const subtotal = lineItems.reduce((s, li) => {
    const qty = parseFloat(li.qty) || 0;
    const price = parseFloat(li.price) || 0;
    return s + qty * price;
  }, 0);
  const tax = subtotal * 0.18;
  const total = subtotal + tax;

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 3000);
  };

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const openPanel = () => setPanelOpen(true);
  const closePanel = () => setPanelOpen(false);

  const addLine = () => setLineItems(prev => [...prev, newLineItem()]);
  const removeLine = (id: string) => setLineItems(prev => prev.filter(li => li.id !== id));
  const updateLine = (id: string, field: keyof LineItem, value: string) =>
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, [field]: value } : li));

  const submitInvoice = (type: 'draft' | 'pending') => {
    closePanel();
    showToast(type === 'draft' ? 'Facture enregistrée comme brouillon' : 'Facture envoyée avec succès !');
    setLineItems([newLineItem()]);
    setFClient(''); setFSubject(''); setFNotes('');
  };

  const NAV_WORKSPACE = [
    { icon: 'layout-dashboard', label: 'Tableau de bord' },
    { icon: 'receipt', label: 'Factures', badge: pendingCount || undefined },
    { icon: 'users', label: 'Clients' },
    { icon: 'package', label: 'Produits' },
  ];

  const NAV_FINANCE = [
    { icon: 'chart-bar', label: 'Rapports' },
    { icon: 'credit-card', label: 'Paiements' },
    { icon: 'file-text', label: 'Devis' },
  ];

  const FILTERS: { key: FilterKey; label: string; count?: number }[] = [
    { key: 'all', label: 'Toutes', count: INVOICES.length },
    { key: 'pending', label: 'En attente', count: pendingCount },
    { key: 'overdue', label: 'En retard', count: overdueCount },
    { key: 'paid', label: 'Payées', count: INVOICES.filter(i => i.status === 'paid').length },
    { key: 'draft', label: 'Brouillons', count: INVOICES.filter(i => i.status === 'draft').length },
  ];

  return (
    <div className="dash-root">
      <h1 className="sr-only">Billio — tableau de bord de facturation</h1>
      <div className="app">
        {/* Barre latérale */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">
              <div className="logo-icon"><BillioMark /></div>
              <div>
                <div className="logo-text">Billio</div>
                <div className="logo-tag">Facturation</div>
              </div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-section">Espace de travail</div>
            {NAV_WORKSPACE.map(({ icon, label, badge }) => (
              <div
                key={label}
                className={`nav-item${activeNav === label ? ' active' : ''}`}
                onClick={() => setActiveNav(label)}
              >
                <Icon name={icon} ariaHidden />
                {label}
                {badge !== undefined && <span className="nav-badge">{badge}</span>}
              </div>
            ))}

            <div className="nav-section">Finance</div>
            {NAV_FINANCE.map(({ icon, label }) => (
              <div
                key={label}
                className={`nav-item${activeNav === label ? ' active' : ''}`}
                onClick={() => setActiveNav(label)}
              >
                <Icon name={icon} ariaHidden />
                {label}
              </div>
            ))}

            <div className="nav-section">Compte</div>
            <div
              className={`nav-item${activeNav === 'Paramètres' ? ' active' : ''}`}
              onClick={() => setActiveNav('Paramètres')}
            >
              <Icon name="settings" ariaHidden />
              Paramètres
            </div>
          </nav>

          <div className="sidebar-bottom">
            <div className="user-pill" onClick={onLogout} title="Se déconnecter">
              <div className="avatar">SW</div>
              <div>
                <div className="user-name">Serge W.</div>
                <div className="user-plan">Offre Pro</div>
              </div>
              <Icon name="logout" ariaHidden />
            </div>
          </div>
        </aside>

        {/* Contenu principal */}
        <div className="main-rel">
          <div className="main">
            <div className="topbar">
              <div>
                <div className="page-title">Tableau de bord</div>
                <div className="page-sub">Aperçu de juin 2026</div>
              </div>
              <div className="topbar-actions">
                <button className="btn"><Icon name="search" ariaHidden /> Rechercher</button>
                <button className="btn btn-icon" aria-label="Notifications"><Icon name="bell" ariaHidden /></button>
                <button className="btn btn-primary" onClick={openPanel}>
                  <Icon name="plus" ariaHidden /> Nouvelle facture
                </button>
              </div>
            </div>

            <div className="content">
              {/* Indicateurs */}
              <div className="metrics">
                <div className="metric-card">
                  <div className="metric-top">
                    <div className="metric-ico blue"><Icon name="trending-up" size={15} ariaHidden /></div>
                    <div className="metric-label">Chiffre d'affaires</div>
                  </div>
                  <div className="metric-value tnum">{fmtXOF(totalRevenue)}<span className="metric-unit">XOF</span></div>
                  <div className="metric-change"><span className="up"><Icon name="trending-up" size={14} ariaHidden />+12 %</span> <span className="neutral">vs mois dernier</span></div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <div className="metric-ico amber"><Icon name="clock-pause" size={15} ariaHidden /></div>
                    <div className="metric-label">En attente</div>
                  </div>
                  <div className="metric-value tnum">{fmtXOF(outstanding)}<span className="metric-unit">XOF</span></div>
                  <div className="metric-change"><span className="neutral">{pendingCount} facture{pendingCount !== 1 ? 's' : ''} en attente</span></div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <div className="metric-ico green"><Icon name="circle-check-filled" size={15} ariaHidden /></div>
                    <div className="metric-label">Encaissé ce mois</div>
                  </div>
                  <div className="metric-value tnum">{fmtXOF(totalRevenue)}<span className="metric-unit">XOF</span></div>
                  <div className="metric-change"><span className="up"><Icon name="trending-up" size={14} ariaHidden />+8 %</span> <span className="neutral">vs mois dernier</span></div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <div className="metric-ico violet"><Icon name="alert-triangle" size={15} ariaHidden /></div>
                    <div className="metric-label">En retard</div>
                  </div>
                  <div className="metric-value tnum">{fmtXOF(overdueAmt)}<span className="metric-unit">XOF</span></div>
                  <div className="metric-change"><span className="dn"><Icon name="trending-down" size={14} ariaHidden />{overdueCount} facture{overdueCount !== 1 ? 's' : ''}</span></div>
                </div>
              </div>

              {/* Tableau des factures */}
              <div className="section-header">
                <div className="section-title">Factures</div>
                <div className="filters">
                  {FILTERS.map(f => (
                    <button
                      key={f.key}
                      className={`filter-chip${filter === f.key ? ' active' : ''}`}
                      onClick={() => setFilter(f.key)}
                    >
                      {f.label}
                      {f.count !== undefined && <span className="cnt">{f.count}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="invoice-table">
                <div className="table-head grid-cols">
                  <div className="th">Facture</div>
                  <div className="th">Client</div>
                  <div className="th">Émise le</div>
                  <div className="th right">Montant</div>
                  <div className="th">Statut</div>
                  <div className="th"></div>
                </div>

                {filteredInvoices.length === 0 ? (
                  <div className="table-empty">Aucune facture trouvée</div>
                ) : (
                  filteredInvoices.map(inv => (
                    <div key={inv.id} className="inv-row grid-cols">
                      <div>
                        <div className="inv-id">{inv.id}</div>
                        <div className="inv-subject">{inv.subject}</div>
                      </div>
                      <div className="client-cell">
                        <div className={`client-av ${inv.avClass}`}>{inv.clientInitials}</div>
                        <div>
                          <div className="cell-text">{inv.client}</div>
                          <div className="cell-sub">{inv.clientEmail}</div>
                        </div>
                      </div>
                      <div className="cell-text">{inv.issued}</div>
                      <div className="amount tnum">
                        {fmtXOFFull(inv.amount)}<span className="cur">XOF</span>
                      </div>
                      <div>
                        <span className={`status-pill s-${inv.status}`}>{STATUS_LABEL[inv.status]}</span>
                      </div>
                      <div className="row-actions">
                        <button className="icon-btn" aria-label="Modifier la facture"><Icon name="edit" size={15} ariaHidden /></button>
                        <button className="icon-btn" aria-label="Télécharger la facture"><Icon name="download" size={15} ariaHidden /></button>
                        <button className="icon-btn" aria-label="Plus d'options"><Icon name="dots" size={15} ariaHidden /></button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Panneaux bas */}
              <div className="bottom-grid">
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">Activité récente</div>
                    <button className="panel-link">Tout voir</button>
                  </div>
                  {ACTIVITY.map((item, i) => (
                    <div key={i} className="activity-item">
                      <div className={`act-dot ${item.type}`} />
                      <div>
                        <div className="act-text">{item.text}</div>
                        <div className="act-time">{item.time}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">Meilleurs clients par revenu</div>
                    <button className="panel-link">Gérer</button>
                  </div>
                  {TOP_CLIENTS.map(client => (
                    <div key={client.name} className="client-item">
                      <div className={`client-av lg ${client.avClass}`}>{client.initials}</div>
                      <div className="client-info">
                        <div className="client-name">{client.name}</div>
                        <div className="client-inv-count">{client.invoiceCount} facture{client.invoiceCount !== 1 ? 's' : ''}</div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${client.barPct}%` }} />
                        </div>
                      </div>
                      <div className="client-total tnum">{fmtXOF(client.totalRevenue)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Panneau glissant : Nouvelle facture */}
          <div className={`scrim${panelOpen ? ' open' : ''}`} onClick={closePanel} />
          <div className={`new-inv-panel${panelOpen ? ' open' : ''}`} role="dialog" aria-label="Nouvelle facture" aria-modal="true">
            <div className="panel-slide-head">
              <div>
                <div className="panel-slide-title">Nouvelle facture</div>
                <div className="panel-slide-sub">#FAC-0042</div>
              </div>
              <button className="icon-btn" onClick={closePanel} aria-label="Fermer le panneau">
                <Icon name="x" size={15} ariaHidden />
              </button>
            </div>

            <div className="panel-body">
              <div className="form-group">
                <label className="form-label">Client</label>
                <select className="form-input" value={fClient} onChange={e => setFClient(e.target.value)}>
                  <option value="">Sélectionner un client…</option>
                  {CLIENTS_FOR_SELECT.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date de facturation</label>
                  <input type="date" className="form-input" value={fDate} onChange={e => setFDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date d'échéance</label>
                  <input type="date" className="form-input" value={fDue} onChange={e => setFDue(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Référence / Objet</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ex. Développement web — sprint 5"
                  value={fSubject}
                  onChange={e => setFSubject(e.target.value)}
                />
              </div>

              <div className="subhead"><span>Lignes de facturation</span></div>
              <div className="line-items-head">
                <div className="li-col">Description</div>
                <div className="li-col right">Qté</div>
                <div className="li-col right">Prix</div>
                <div />
              </div>

              {lineItems.map(li => (
                <div key={li.id} className="line-item">
                  <div className="line-item-row">
                    <input
                      className="li-input"
                      placeholder="Description du service"
                      value={li.description}
                      onChange={e => updateLine(li.id, 'description', e.target.value)}
                    />
                    <input
                      className="li-input num"
                      type="number"
                      min="1"
                      value={li.qty}
                      onChange={e => updateLine(li.id, 'qty', e.target.value)}
                    />
                    <input
                      className="li-input num"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={li.price}
                      onChange={e => updateLine(li.id, 'price', e.target.value)}
                    />
                    <button
                      className="li-del"
                      onClick={() => removeLine(li.id)}
                      aria-label="Supprimer la ligne"
                      disabled={lineItems.length === 1}
                    >
                      <Icon name="trash" size={15} ariaHidden />
                    </button>
                  </div>
                </div>
              ))}

              <button className="add-line" onClick={addLine}>
                <Icon name="plus" size={14} ariaHidden /> Ajouter une ligne
              </button>

              <div className="total-block">
                <div className="total-row">
                  <span>Sous-total</span>
                  <span>{fmtXOFFull(Math.round(subtotal))} XOF</span>
                </div>
                <div className="total-row">
                  <span>TVA (18 %)</span>
                  <span>{fmtXOFFull(Math.round(tax))} XOF</span>
                </div>
                <div className="total-row final">
                  <span>Total à payer</span>
                  <span>{fmtXOFFull(Math.round(total))} XOF</span>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Mode de paiement</label>
                <select className="form-input" value={fPay} onChange={e => setFPay(e.target.value)}>
                  <option>Mobile Money (MTN / Orange / Wave)</option>
                  <option>Virement bancaire</option>
                  <option>Paiement à la livraison</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Merci pour votre confiance…"
                  style={{ resize: 'none', lineHeight: 1.5 }}
                  value={fNotes}
                  onChange={e => setFNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="panel-footer">
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => submitInvoice('draft')}>
                Enregistrer brouillon
              </button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => submitInvoice('pending')}>
                <Icon name="send" ariaHidden /> Envoyer la facture
              </button>
            </div>
          </div>

          {/* Toast */}
          <div className={`toast${toastVisible ? ' show' : ''}`} role="status" aria-live="polite">
            <Icon name="circle-check-filled" ariaHidden />
            <span>{toastMsg}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
