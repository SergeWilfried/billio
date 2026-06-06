import { useState } from 'react';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';

type View = 'auth' | 'dashboard';

export default function App() {
  const [view, setView] = useState<View>('auth');

  if (view === 'dashboard') {
    return <Dashboard onLogout={() => setView('auth')} />;
  }
  return <AuthPage onLogin={() => setView('dashboard')} />;
}
