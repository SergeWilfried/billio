import { NavLink } from 'react-router-dom';
import { useMemo } from 'react';
import Icon from './Icon';
import { useApp } from '../context/AppContext';

const BillioMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5.5 3.2h10.2c.6 0 1.1.2 1.5.6l3 3c.4.4.6.9.6 1.5v12c0 .7-.6 1.1-1.2.8l-1.6-.8-1.7.9c-.3.2-.7.2-1 0l-1.6-.9-1.7.9c-.3.2-.7.2-1 0l-1.6-.9-1.7.9c-.3.2-.7.2-1 0l-1.6-.9-1.6.8c-.6.3-1.3-.1-1.3-.8V4.7c0-.8.7-1.5 1.5-1.5z" fill="#fff" fillOpacity="0.96" />
    <path d="M8 8.2h6M8 11.4h7M8 14.6h4" stroke="#185FA5" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const NAV_WORKSPACE: { icon: string; label: string; to: string }[] = [
  { icon: 'layout-dashboard', label: 'Tableau de bord', to: '/dashboard' },
  { icon: 'receipt',          label: 'Factures',        to: '/invoices' },
  { icon: 'users',            label: 'Clients',         to: '/clients' },
  { icon: 'package',          label: 'Produits',        to: '/products' },
];

const NAV_FINANCE: { icon: string; label: string; to: string }[] = [
  { icon: 'chart-bar',   label: 'Rapports',  to: '/reports' },
  { icon: 'credit-card', label: 'Paiements', to: '/payments' },
  { icon: 'file-text',   label: 'Devis',     to: '/quotes' },
];

export default function Sidebar({ onLogout }: { onLogout: () => void }) {
  const { invoices, userLabel, userInitials } = useApp();
  const overdueCount = useMemo(
    () => invoices.filter(i => i.status === 'overdue').length,
    [invoices],
  );

  return (
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
        {NAV_WORKSPACE.map(({ icon, label, to }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon name={icon} ariaHidden />
            {label}
            {label === 'Factures' && overdueCount > 0 && (
              <span className="nav-badge">{overdueCount}</span>
            )}
          </NavLink>
        ))}

        {NAV_FINANCE.map(({ icon, label, to }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon name={icon} ariaHidden />
            {label}
          </NavLink>
        ))}

        <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Icon name="settings" ariaHidden />Paramètres
        </NavLink>
      </nav>

      <div className="sidebar-bottom">
        <div className="user-pill" onClick={onLogout} title="Se déconnecter" role="button">
          <div className="avatar">{userInitials}</div>
          <div>
            <div className="user-name">{userLabel || '…'}</div>
            <div className="user-plan">Offre Pro</div>
          </div>
          <Icon name="logout" ariaHidden />
        </div>
      </div>
    </aside>
  );
}
