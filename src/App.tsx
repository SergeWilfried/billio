import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { AppProvider } from './context/AppContext';
import AppShell from './components/AppShell';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoicePage from './pages/InvoicePage';
import ProductsPage from './pages/ProductsPage';
import ClientsPage from './pages/ClientsPage';
import PaymentsPage from './pages/PaymentsPage';
import QuotesPage from './pages/QuotesPage';

const MOCK = import.meta.env.VITE_MOCK_AUTH === 'true';

export default function App() {
  const [mockAuthed, setMockAuthed] = useState(false);
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (MOCK) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (!MOCK && session === undefined) return null; // resolving auth state

  const authed   = MOCK ? mockAuthed : !!session;
  const onLogout = MOCK
    ? () => setMockAuthed(false)
    : () => { supabase.auth.signOut(); };

  return (
    <AppProvider>
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={authed
            ? <Navigate to="/dashboard" replace />
            : <AuthPage onLogin={MOCK ? () => setMockAuthed(true) : undefined} />
          }
        />

        {/* Protected — AppShell is the layout, Outlet renders child routes */}
        <Route
          element={authed ? <AppShell onLogout={onLogout} /> : <Navigate to="/login" replace />}
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/:id" element={<InvoicePage />} />
          {/* Stub routes — will get real pages later */}
          <Route path="/clients"  element={<ClientsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/reports"  element={<PlaceholderPage title="Rapports" />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/quotes"   element={<QuotesPage />} />
          <Route path="/settings" element={<PlaceholderPage title="Paramètres" />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="main">
      <div className="topbar">
        <div>
          <div className="page-title">{title}</div>
          <div className="page-sub">Bientôt disponible</div>
        </div>
      </div>
      <div className="content" style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 8, color: 'var(--color-text-tertiary)',
      }}>
        <div style={{ fontSize: 36 }}>🚧</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Page en construction</div>
      </div>
    </div>
  );
}
