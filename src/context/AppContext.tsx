import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { INITIAL_INVOICES, INITIAL_ACTIVITY } from '../data';
import type { Invoice, Activity } from '../data';

const MOCK = import.meta.env.VITE_MOCK_AUTH === 'true';

interface AppContextValue {
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  activity: Activity[];
  setActivity: React.Dispatch<React.SetStateAction<Activity[]>>;
  userLabel: string;
  userInitials: string;
  toastMsg: string;
  toastVisible: boolean;
  toastError: boolean;
  showToast: (msg: string, isError?: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [activity, setActivity] = useState<Activity[]>(INITIAL_ACTIVITY);
  const [userLabel, setUserLabel]       = useState('');
  const [userInitials, setUserInitials] = useState('??');
  const [toastMsg, setToastMsg]         = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastError, setToastError]     = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (MOCK) { setUserLabel('Serge W.'); setUserInitials('SW'); return; }
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const email = u.email ?? '';
      const meta  = u.user_metadata as Record<string, string> | undefined;
      const first = meta?.first_name ?? meta?.firstName ?? '';
      const last  = meta?.last_name  ?? meta?.lastName  ?? '';
      if (first || last) {
        setUserLabel(`${first} ${last}`.trim());
        setUserInitials(`${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || email[0].toUpperCase());
      } else {
        const name = email.split('@')[0];
        setUserLabel(name);
        setUserInitials(name.slice(0, 2).toUpperCase());
      }
    });
  }, []);

  const showToast = useCallback((msg: string, isError = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    setToastError(isError);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2600);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  return (
    <AppContext.Provider value={{
      invoices, setInvoices,
      activity, setActivity,
      userLabel, userInitials,
      toastMsg, toastVisible, toastError,
      showToast,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
