import { useState } from 'react';
import Icon from '../components/Icon';

type AuthMode = 'login' | 'signup';

interface AuthPageProps {
  onLogin: () => void;
}

const COUNTRIES = ['Burkina Faso', 'Mali', "Côte d'Ivoire", 'Senegal', 'Niger'];

const BillioMark = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5.5 3.2h10.2c.6 0 1.1.2 1.5.6l3 3c.4.4.6.9.6 1.5v12c0 .7-.6 1.1-1.2.8l-1.6-.8-1.7.9c-.3.2-.7.2-1 0l-1.6-.9-1.7.9c-.3.2-.7.2-1 0l-1.6-.9-1.7.9c-.3.2-.7.2-1 0l-1.6-.9-1.6.8c-.6.3-1.3-.1-1.3-.8V4.7c0-.8.7-1.5 1.5-1.5z"
      fill="#fff"
      fillOpacity="0.96"
    />
    <path d="M8 8.2h6M8 11.4h7M8 14.6h4" stroke="#185FA5" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export default function AuthPage({ onLogin }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [business, setBusiness] = useState('');
  const [country, setCountry] = useState(COUNTRIES[0]);

  const isSignup = mode === 'signup';

  const clearError = (field: string) =>
    setErrors(prev => ({ ...prev, [field]: false }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, boolean> = {};
    if (!email.trim()) newErrors.email = true;
    if (!password.trim()) newErrors.password = true;
    if (isSignup && !firstName.trim()) newErrors.firstName = true;
    if (isSignup && !lastName.trim()) newErrors.lastName = true;
    if (Object.keys(newErrors).some(k => newErrors[k])) {
      setErrors(newErrors);
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLogin();
    }, 650);
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setErrors({});
    setLoading(false);
  };

  return (
    <div className="auth-root">
      <h1 className="sr-only">Billio — sign in or create an account</h1>
      <div className="auth-card">
        {/* Brand panel */}
        <aside className="brand-panel">
          <div className="brand-logo">
            <div className="mark"><BillioMark /></div>
            <div>
              <div className="name">Billio</div>
              <div className="tag">Invoicing</div>
            </div>
          </div>

          <div className="brand-head">
            <h2>Invoicing that gets you paid faster.</h2>
            <p>Create, send and track professional invoices in minutes — with Mobile Money, reminders and reports built in.</p>
            <div className="brand-features">
              <div className="bf">
                <span className="ck"><Icon name="check" /></span>
                Mobile Money &amp; bank transfers
              </div>
              <div className="bf">
                <span className="ck"><Icon name="check" /></span>
                Automatic payment reminders
              </div>
              <div className="bf">
                <span className="ck"><Icon name="check" /></span>
                Real-time revenue reports
              </div>
            </div>
          </div>

          <div className="mini-invoice">
            <div className="dot" aria-hidden="true">
              <Icon name="circle-check-filled" />
            </div>
            <div>
              <div className="mi-top">#INV-0040 paid</div>
              <div className="mi-sub">Sahel Banque · just now</div>
            </div>
            <div className="mi-amt">1.2M XOF</div>
          </div>
        </aside>

        {/* Form panel */}
        <section className="form-panel">
          <div className="fp-inner">
            <div className="fp-eyebrow">{isSignup ? 'Get started' : 'Welcome back'}</div>
            <div className="fp-title">{isSignup ? 'Create your account' : 'Sign in to Billio'}</div>
            <div className="fp-sub">
              {isSignup
                ? 'Start invoicing in minutes — no card required.'
                : 'Enter your details to access your workspace.'}
            </div>

            <form onSubmit={handleSubmit} noValidate style={{ marginTop: 24 }}>
              {isSignup && (
                <>
                  <div className="field-row" style={{ marginBottom: 15 }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="field-label">First name</label>
                      <div className="input-wrap">
                        <Icon name="user" className="lead" ariaHidden />
                        <input
                          className={`input${errors.firstName ? ' err' : ''}`}
                          type="text"
                          placeholder="Serge"
                          autoComplete="given-name"
                          value={firstName}
                          onChange={e => { setFirstName(e.target.value); clearError('firstName'); }}
                        />
                      </div>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="field-label">Last name</label>
                      <div className="input-wrap">
                        <Icon name="user" className="lead" ariaHidden />
                        <input
                          className={`input${errors.lastName ? ' err' : ''}`}
                          type="text"
                          placeholder="Wilfried"
                          autoComplete="family-name"
                          value={lastName}
                          onChange={e => { setLastName(e.target.value); clearError('lastName'); }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-label">Business</label>
                    <div className="input-wrap">
                      <Icon name="building" className="lead" ariaHidden />
                      <input
                        className="input"
                        type="text"
                        placeholder="Studio name"
                        autoComplete="organization"
                        value={business}
                        onChange={e => setBusiness(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="field">
                <label className="field-label">Email address</label>
                <div className="input-wrap">
                  <Icon name="mail" className="lead" ariaHidden />
                  <input
                    className={`input${errors.email ? ' err' : ''}`}
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); clearError('email'); }}
                  />
                </div>
              </div>

              <div className="field">
                <label className="field-label">Password</label>
                <div className="input-wrap">
                  <Icon name="lock" className="lead" ariaHidden />
                  <input
                    className={`input${errors.password ? ' err' : ''}`}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); clearError('password'); }}
                  />
                  <button
                    className="pw-toggle"
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(v => !v)}
                  >
                    <Icon name={showPassword ? 'eye-off' : 'eye'} ariaHidden />
                  </button>
                </div>
              </div>

              {isSignup && (
                <div className="field">
                  <label className="field-label">Country</label>
                  <select
                    className="input"
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                  >
                    {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              )}

              {!isSignup && (
                <div className="opts-row">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                    />
                    Remember me
                  </label>
                  <button type="button" className="link">Forgot password?</button>
                </div>
              )}

              {isSignup && <div style={{ height: 18 }} />}

              <button className="submit-btn" type="submit" disabled={loading}>
                <span>{loading ? (isSignup ? 'Creating…' : 'Signing in…') : (isSignup ? 'Create account' : 'Sign in')}</span>
                <Icon name="arrow-right" ariaHidden />
              </button>
            </form>

            <div className="fp-foot">
              {isSignup ? (
                <>Already have an account? <button className="link" onClick={() => switchMode('login')}>Sign in</button></>
              ) : (
                <>New to Billio? <button className="link" onClick={() => switchMode('signup')}>Create an account</button></>
              )}
            </div>

            {isSignup && (
              <div className="fp-terms">
                By creating an account you agree to Billio's{' '}
                <a href="#">Terms</a> &amp; <a href="#">Privacy Policy</a>.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
