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
  text: JSX.Element;
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
  { id: 'INV-0041', subject: 'Brand identity — Q2', client: 'Agence Digitale Sahel', clientInitials: 'AD', clientEmail: 'contact@sahel.digital', avClass: 'av-a', issued: 'Jun 3', amount: 1_200_000, status: 'paid' },
  { id: 'INV-0040', subject: 'Mobile app UI sprint 4', client: 'Construction Ouaga', clientInitials: 'CO', clientEmail: 'admin@couaga.bf', avClass: 'av-b', issued: 'Jun 1', amount: 850_000, status: 'pending' },
  { id: 'INV-0039', subject: 'Web platform development', client: 'TechHub Abidjan', clientInitials: 'TH', clientEmail: 'tech@hub-abi.ci', avClass: 'av-c', issued: 'May 28', amount: 2_400_000, status: 'overdue' },
  { id: 'INV-0038', subject: 'Annual consulting retainer', client: 'Sahel Banque', clientInitials: 'SB', clientEmail: 'ops@sahelbanque.com', avClass: 'av-d', issued: 'May 25', amount: 1_800_000, status: 'paid' },
  { id: 'INV-0037', subject: 'Logo redesign', client: 'Bureau Dakar', clientInitials: 'BD', clientEmail: 'info@bureau-dk.sn', avClass: 'av-e', issued: 'May 20', amount: 380_000, status: 'overdue' },
  { id: 'INV-0036', subject: 'E-commerce audit', client: 'Import-Export Mali', clientInitials: 'IE', clientEmail: 'trade@iemali.ml', avClass: 'av-f', issued: 'May 15', amount: 650_000, status: 'draft' },
];

const ACTIVITY: ActivityItem[] = [
  { type: 'paid', text: <><b>INV-0041</b> paid by Agence Digitale Sahel</>, time: '2 hours ago' },
  { type: 'sent', text: <><b>INV-0040</b> sent to Construction Ouaga</>, time: '5 hours ago' },
  { type: 'overdue', text: <><b>INV-0039</b> is overdue — due May 28</>, time: '1 day ago' },
  { type: 'viewed', text: <><b>INV-0038</b> viewed by Sahel Banque</>, time: '2 days ago' },
  { type: 'paid', text: <><b>INV-0038</b> paid by Sahel Banque</>, time: '3 days ago' },
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
  return n.toLocaleString();
}

function fmtXOFFull(n: number) {
  return n.toLocaleString('fr-FR');
}

const STATUS_LABEL: Record<Status, string> = {
  paid: 'Paid', pending: 'Pending', overdue: 'Overdue', draft: 'Draft',
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
  const [activeNav, setActiveNav] = useState('Dashboard');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [panelOpen, setPanelOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // New invoice form state
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
    showToast(type === 'draft' ? 'Invoice saved as draft' : 'Invoice sent successfully!');
    setLineItems([newLineItem()]);
    setFClient(''); setFSubject(''); setFNotes('');
  };

  const FILTERS: { key: FilterKey; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: INVOICES.length },
    { key: 'pending', label: 'Pending', count: pendingCount },
    { key: 'overdue', label: 'Overdue', count: overdueCount },
    { key: 'paid', label: 'Paid', count: INVOICES.filter(i => i.status === 'paid').length },
    { key: 'draft', label: 'Draft', count: INVOICES.filter(i => i.status === 'draft').length },
  ];

  return (
    <div className="dash-root">
      <h1 className="sr-only">Billio — invoicing dashboard</h1>
      <div className="app">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">
              <div className="logo-icon"><BillioMark /></div>
              <div>
                <div className="logo-text">Billio</div>
                <div className="logo-tag">Invoicing</div>
              </div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-section">Workspace</div>
            {[
              { icon: 'layout-dashboard', label: 'Dashboard' },
              { icon: 'receipt', label: 'Invoices', badge: pendingCount || undefined },
              { icon: 'users', label: 'Clients' },
              { icon: 'package', label: 'Products' },
            ].map(({ icon, label, badge }) => (
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
            {[
              { icon: 'chart-bar', label: 'Reports' },
              { icon: 'credit-card', label: 'Payments' },
              { icon: 'file-text', label: 'Quotes' },
            ].map(({ icon, label }) => (
              <div
                key={label}
                className={`nav-item${activeNav === label ? ' active' : ''}`}
                onClick={() => setActiveNav(label)}
              >
                <Icon name={icon} ariaHidden />
                {label}
              </div>
            ))}

            <div className="nav-section">Account</div>
            <div
              className={`nav-item${activeNav === 'Settings' ? ' active' : ''}`}
              onClick={() => setActiveNav('Settings')}
            >
              <Icon name="settings" ariaHidden />
              Settings
            </div>
          </nav>

          <div className="sidebar-bottom">
            <div className="user-pill" onClick={onLogout} title="Sign out">
              <div className="avatar">SW</div>
              <div>
                <div className="user-name">Serge W.</div>
                <div className="user-plan">Pro plan</div>
              </div>
              <Icon name="logout" ariaHidden />
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="main-rel">
          <div className="main">
            <div className="topbar">
              <div>
                <div className="page-title">Dashboard</div>
                <div className="page-sub">June 2026 overview</div>
              </div>
              <div className="topbar-actions">
                <button className="btn"><Icon name="search" ariaHidden /> Search</button>
                <button className="btn btn-icon" aria-label="Notifications"><Icon name="bell" ariaHidden /></button>
                <button className="btn btn-primary" onClick={openPanel}>
                  <Icon name="plus" ariaHidden /> New invoice
                </button>
              </div>
            </div>

            <div className="content">
              {/* Metrics */}
              <div className="metrics">
                <div className="metric-card">
                  <div className="metric-top">
                    <div className="metric-ico blue"><Icon name="trending-up" size={15} ariaHidden /></div>
                    <div className="metric-label">Revenue (month)</div>
                  </div>
                  <div className="metric-value tnum">{fmtXOF(totalRevenue)}<span className="metric-unit">XOF</span></div>
                  <div className="metric-change"><span className="up"><Icon name="trending-up" size={14} ariaHidden />+12%</span> <span className="neutral">vs last month</span></div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <div className="metric-ico amber"><Icon name="clock-pause" size={15} ariaHidden /></div>
                    <div className="metric-label">Outstanding</div>
                  </div>
                  <div className="metric-value tnum">{fmtXOF(outstanding)}<span className="metric-unit">XOF</span></div>
                  <div className="metric-change"><span className="neutral">{pendingCount} pending invoice{pendingCount !== 1 ? 's' : ''}</span></div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <div className="metric-ico green"><Icon name="circle-check-filled" size={15} ariaHidden /></div>
                    <div className="metric-label">Paid this month</div>
                  </div>
                  <div className="metric-value tnum">{fmtXOF(INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0))}<span className="metric-unit">XOF</span></div>
                  <div className="metric-change"><span className="up"><Icon name="trending-up" size={14} ariaHidden />+8%</span> <span className="neutral">vs last month</span></div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <div className="metric-ico violet"><Icon name="alert-triangle" size={15} ariaHidden /></div>
                    <div className="metric-label">Overdue</div>
                  </div>
                  <div className="metric-value tnum">{fmtXOF(overdueAmt)}<span className="metric-unit">XOF</span></div>
                  <div className="metric-change"><span className="dn"><Icon name="trending-down" size={14} ariaHidden />{overdueCount} invoice{overdueCount !== 1 ? 's' : ''}</span></div>
                </div>
              </div>

              {/* Invoice table */}
              <div className="section-header">
                <div className="section-title">Invoices</div>
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
                  <div className="th">Invoice</div>
                  <div className="th">Client</div>
                  <div className="th">Issued</div>
                  <div className="th right">Amount</div>
                  <div className="th">Status</div>
                  <div className="th"></div>
                </div>

                {filteredInvoices.length === 0 ? (
                  <div className="table-empty">No invoices found</div>
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
                        <button className="icon-btn" aria-label="Edit invoice"><Icon name="edit" size={15} ariaHidden /></button>
                        <button className="icon-btn" aria-label="Download invoice"><Icon name="download" size={15} ariaHidden /></button>
                        <button className="icon-btn" aria-label="More options"><Icon name="dots" size={15} ariaHidden /></button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom panels */}
              <div className="bottom-grid">
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">Recent activity</div>
                    <button className="panel-link">View all</button>
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
                    <div className="panel-title">Top clients by revenue</div>
                    <button className="panel-link">Manage</button>
                  </div>
                  {TOP_CLIENTS.map(client => (
                    <div key={client.name} className="client-item">
                      <div className={`client-av lg ${client.avClass}`}>{client.initials}</div>
                      <div className="client-info">
                        <div className="client-name">{client.name}</div>
                        <div className="client-inv-count">{client.invoiceCount} invoice{client.invoiceCount !== 1 ? 's' : ''}</div>
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

          {/* Slide-over: New invoice */}
          <div className={`scrim${panelOpen ? ' open' : ''}`} onClick={closePanel} />
          <div className={`new-inv-panel${panelOpen ? ' open' : ''}`} role="dialog" aria-label="New invoice" aria-modal="true">
            <div className="panel-slide-head">
              <div>
                <div className="panel-slide-title">New invoice</div>
                <div className="panel-slide-sub">#INV-0042</div>
              </div>
              <button className="icon-btn" onClick={closePanel} aria-label="Close panel">
                <Icon name="x" size={15} ariaHidden />
              </button>
            </div>

            <div className="panel-body">
              <div className="form-group">
                <label className="form-label">Client</label>
                <select className="form-input" value={fClient} onChange={e => setFClient(e.target.value)}>
                  <option value="">Select a client…</option>
                  {CLIENTS_FOR_SELECT.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Invoice date</label>
                  <input type="date" className="form-input" value={fDate} onChange={e => setFDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Due date</label>
                  <input type="date" className="form-input" value={fDue} onChange={e => setFDue(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Reference / Subject</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Web development — sprint 5"
                  value={fSubject}
                  onChange={e => setFSubject(e.target.value)}
                />
              </div>

              <div className="subhead"><span>Line items</span></div>
              <div className="line-items-head">
                <div className="li-col">Description</div>
                <div className="li-col right">Qty</div>
                <div className="li-col right">Price</div>
                <div />
              </div>

              {lineItems.map(li => (
                <div key={li.id} className="line-item">
                  <div className="line-item-row">
                    <input
                      className="li-input"
                      placeholder="Service description"
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
                      aria-label="Remove line item"
                      disabled={lineItems.length === 1}
                    >
                      <Icon name="trash" size={15} ariaHidden />
                    </button>
                  </div>
                </div>
              ))}

              <button className="add-line" onClick={addLine}>
                <Icon name="plus" size={14} ariaHidden /> Add line item
              </button>

              <div className="total-block">
                <div className="total-row">
                  <span>Subtotal</span>
                  <span>{fmtXOFFull(Math.round(subtotal))} XOF</span>
                </div>
                <div className="total-row">
                  <span>Tax (18% TVA)</span>
                  <span>{fmtXOFFull(Math.round(tax))} XOF</span>
                </div>
                <div className="total-row final">
                  <span>Total due</span>
                  <span>{fmtXOFFull(Math.round(total))} XOF</span>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Payment method</label>
                <select className="form-input" value={fPay} onChange={e => setFPay(e.target.value)}>
                  <option>Mobile Money (MTN / Orange / Wave)</option>
                  <option>Bank transfer</option>
                  <option>Cash on delivery</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Thank you for your business…"
                  style={{ resize: 'none', lineHeight: 1.5 }}
                  value={fNotes}
                  onChange={e => setFNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="panel-footer">
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => submitInvoice('draft')}>
                Save draft
              </button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => submitInvoice('pending')}>
                <Icon name="send" ariaHidden /> Send invoice
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
