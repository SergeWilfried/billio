import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import './OnboardingPage.css';

/* ── types ── */
interface TeamInvite { email: string; role: string }
interface ClientDraft { name: string; email: string; av: string }

const AV = ['av-a', 'av-b', 'av-c', 'av-d', 'av-e', 'av-f'] as const;
const TERMS_OPTIONS = ['Due on receipt', 'Net 7 days', 'Net 14 days', 'Net 30 days'];
const STEPS = [
  { label: 'Business details', skippable: false },
  { label: 'Invoice defaults',  skippable: false },
  { label: 'Invite team',       skippable: true  },
  { label: 'Add clients',       skippable: true  },
  { label: 'Finish',            skippable: false },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'B';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmt(n: number) {
  return Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ');
}

/* ── icons as React SVG elements (no dangerouslySetInnerHTML) ── */
type SvgProps = { s?: number };

const IcoBuilding      = (_: SvgProps) => <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>;
const IcoFileInvoice   = (_: SvgProps) => <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/><path d="M9 9h1"/></>;
const IcoUsers         = (_: SvgProps) => <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>;
const IcoBriefcase     = (_: SvgProps) => <><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>;
const IcoCircleCheck   = (_: SvgProps) => <><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></>;
const IcoArrowRight    = (_: SvgProps) => <><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>;
const IcoArrowLeft     = (_: SvgProps) => <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>;
const IcoCamera        = (_: SvgProps) => <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></>;
const IcoUserPlus      = (_: SvgProps) => <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></>;
const IcoPlus          = (_: SvgProps) => <><path d="M5 12h14"/><path d="M12 5v14"/></>;
const IcoDownload      = (_: SvgProps) => <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></>;
const IcoTrash         = (_: SvgProps) => <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>;
const IcoChevronRight  = (_: SvgProps) => <path d="m9 18 6-6-6-6"/>;
const IcoEye           = (_: SvgProps) => <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>;
const IcoBolt          = (_: SvgProps) => <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>;
const IcoShieldCheck   = (_: SvgProps) => <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></>;
const IcoInfoCircle    = (_: SvgProps) => <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></>;
const IcoSparkles      = (_: SvgProps) => <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>;
const IcoCheck         = (_: SvgProps) => <path d="M20 6 9 17l-5-5"/>;
const IcoClock         = (_: SvgProps) => <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>;
const IcoDeviceMobile  = (_: SvgProps) => <><rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/></>;
const IcoBuildingBank  = (_: SvgProps) => <><path d="m3 10 2-2 7-5 7 5 2 2H3z"/><path d="M12 3v7"/><path d="M3 10v10h18V10"/><path d="M6 14v2"/><path d="M10 14v2"/><path d="M14 14v2"/><path d="M18 14v2"/></>;
const IcoLoader        = (_: SvgProps) => <path d="M21 12a9 9 0 1 1-6.219-8.56"/>;

type IcoName =
  | 'building' | 'file-invoice' | 'users' | 'briefcase' | 'circle-check'
  | 'arrow-right' | 'arrow-left' | 'camera' | 'user-plus' | 'plus'
  | 'download' | 'trash' | 'chevron-right' | 'eye' | 'bolt'
  | 'shield-check' | 'info-circle' | 'sparkles' | 'check' | 'clock'
  | 'device-mobile' | 'building-bank' | 'loader-2';

const ICON_MAP: Record<IcoName, () => React.ReactElement> = {
  'building':       () => <IcoBuilding />,
  'file-invoice':   () => <IcoFileInvoice />,
  'users':          () => <IcoUsers />,
  'briefcase':      () => <IcoBriefcase />,
  'circle-check':   () => <IcoCircleCheck />,
  'arrow-right':    () => <IcoArrowRight />,
  'arrow-left':     () => <IcoArrowLeft />,
  'camera':         () => <IcoCamera />,
  'user-plus':      () => <IcoUserPlus />,
  'plus':           () => <IcoPlus />,
  'download':       () => <IcoDownload />,
  'trash':          () => <IcoTrash />,
  'chevron-right':  () => <IcoChevronRight />,
  'eye':            () => <IcoEye />,
  'bolt':           () => <IcoBolt />,
  'shield-check':   () => <IcoShieldCheck />,
  'info-circle':    () => <IcoInfoCircle />,
  'sparkles':       () => <IcoSparkles />,
  'check':          () => <IcoCheck />,
  'clock':          () => <IcoClock />,
  'device-mobile':  () => <IcoDeviceMobile />,
  'building-bank':  () => <IcoBuildingBank />,
  'loader-2':       () => <IcoLoader />,
};

function Ico({ name, style }: { name: IcoName; style?: React.CSSProperties }) {
  const children = ICON_MAP[name]?.();
  return (
    <i className="ti" style={style}>
      <svg viewBox="0 0 24 24" width="1em" height="1em"
        fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </i>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const { orgId, userId, completeOnboarding } = useApp();

  /* ── navigation ── */
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);

  /* ── step 1: business ── */
  const [bizName,  setBizName]  = useState('Studio Wend SARL');
  const [taxId,    setTaxId]    = useState('');
  const [rccm,     setRccm]     = useState('');
  const [address,  setAddress]  = useState('Av. Kwame Nkrumah, Immeuble Baobab');
  const [city,     setCity]     = useState('Ouagadougou');
  const [country,  setCountry]  = useState('Burkina Faso');
  const [currency, setCurrency] = useState('XOF');
  const [logoType, setLogoType] = useState<'none' | 'mono' | 'img'>('none');
  const [logoUrl,  setLogoUrl]  = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  /* ── step 2: invoice defaults ── */
  const [prefix,    setPrefix]    = useState('INV-');
  const [nextNum,   setNextNum]   = useState('0042');
  const [terms,     setTerms]     = useState('Net 14 days');
  const [taxRate,   setTaxRate]   = useState(18);
  const [payMethod, setPayMethod] = useState('Mobile Money (MTN / Orange / Wave)');
  const [footer,    setFooter]    = useState('Merci pour votre confiance. Paiement à régler sous 14 jours.');

  /* ── step 3: team ── */
  const [teamEmail,   setTeamEmail]   = useState('');
  const [teamRole,    setTeamRole]    = useState('Member');
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([]);
  const [teamEmailErr, setTeamEmailErr] = useState(false);

  /* ── step 4: clients ── */
  const [clientName,    setClientName]    = useState('');
  const [clientEmail,   setClientEmail]   = useState('');
  const [clients,       setClients]       = useState<ClientDraft[]>([]);
  const [clientNameErr, setClientNameErr] = useState(false);

  /* ── validation ── */
  const [bizNameErr,  setBizNameErr]  = useState(false);
  const [nextNumErr,  setNextNumErr]  = useState(false);

  /* ── saving ── */
  const [saving, setSaving] = useState(false);

  /* ── derived ── */
  const logoInitials = initials(bizName || 'B');
  const docNum = `#${prefix}${nextNum}`;
  const sub = 770000;
  const taxVal = sub * taxRate / 100;

  /* ── navigation helpers ── */
  const goTo = useCallback((i: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, i));
    setStep(next);
    setMaxReached(prev => Math.max(prev, next));
  }, []);

  function validateCurrentStep() {
    if (step === 0 && !bizName.trim()) { setBizNameErr(true); return false; }
    if (step === 1 && !nextNum.trim())  { setNextNumErr(true); return false; }
    return true;
  }

  function onNext() {
    if (!validateCurrentStep()) return;
    goTo(step + 1);
  }

  /* ── logo upload ── */
  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => { setLogoType('img'); setLogoUrl(rd.result as string); };
    rd.readAsDataURL(file);
  }

  /* ── team ── */
  function addTeamMember() {
    if (!teamEmail || !/.+@.+\..+/.test(teamEmail)) { setTeamEmailErr(true); return; }
    setTeamInvites(prev => [...prev, { email: teamEmail, role: teamRole }]);
    setTeamEmail('');
    setTeamEmailErr(false);
  }

  function removeTeamMember(i: number) {
    setTeamInvites(prev => prev.filter((_, idx) => idx !== i));
  }

  /* ── clients ── */
  function addClient() {
    if (!clientName.trim()) { setClientNameErr(true); return; }
    setClients(prev => [...prev, { name: clientName.trim(), email: clientEmail.trim(), av: AV[prev.length % AV.length] }]);
    setClientName(''); setClientEmail('');
    setClientNameErr(false);
  }

  function removeClient(i: number) {
    setClients(prev => prev.filter((_, idx) => idx !== i));
  }

  function seedDemoClients() {
    if (clients.some(c => c.name === 'Sahel Banque')) return;
    setClients(prev => [
      ...prev,
      { name: 'Sahel Banque',    email: 'finance@sahel.bf',        av: AV[prev.length     % AV.length] },
      { name: 'Faso Textiles',   email: 'compta@fasotextiles.bf',  av: AV[(prev.length+1) % AV.length] },
      { name: 'Ouaga Catering',  email: '',                         av: AV[(prev.length+2) % AV.length] },
    ]);
  }

  /* ── finish: save to Supabase ── */
  async function handleFinish() {
    if (!orgId) return;
    setSaving(true);
    try {
      await supabase
        .from('organizations')
        .update({ name: bizName.trim() || 'My Business', onboarding_completed_at: new Date().toISOString() })
        .eq('id', orgId);

      if (clients.length > 0) {
        await supabase.from('clients').insert(
          clients.map((c, i) => ({
            org_id:     orgId,
            created_by: userId || undefined,
            code:       `CLI-${String(i + 1).padStart(4, '0')}`,
            name:       c.name,
            email:      c.email || '—',
            av:         c.av,
            contact:    '—',
            phone:      '—',
            city:       '—',
            ifu:        '',
            status:     'active',
          }))
        );
      }

      localStorage.setItem(`billio:inv:${orgId}`, JSON.stringify({ prefix, nextNum, terms, taxRate, payMethod, footer }));

      completeOnboarding(bizName.trim() || 'My Business');
      navigate('/dashboard');
    } catch (err) {
      console.error('Onboarding save error:', err);
      setSaving(false);
    }
  }

  /* ── aside pane key ── */
  const pane = step <= 1 ? 'invoice' : step === 2 ? 'team' : step === 3 ? 'clients' : 'summary';

  /* ── render ── */
  return (
    <div className="ob-root">
      <div className="ob-wiz">

        {/* ───── Head ───── */}
        <header className="ob-head">
          <div className="ob-logo-mark">
            <div className="ob-logo-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M5.5 3.2h10.2c.6 0 1.1.2 1.5.6l3 3c.4.4.6.9.6 1.5v12c0 .7-.6 1.1-1.2.8l-1.6-.8-1.7.9c-.3.2-.7.2-1 0l-1.6-.9-1.7.9c-.3.2-.7.2-1 0l-1.6-.9-1.7.9c-.3.2-.7.2-1 0l-1.6-.9-1.6.8c-.6.3-1.3-.1-1.3-.8V4.7c0-.8.7-1.5 1.5-1.5z" fill="#fff" fillOpacity="0.96"/>
                <path d="M8 8.2h6M8 11.4h7M8 14.6h4" stroke="#185FA5" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="ob-logo-text">Billio</div>
              <div className="ob-logo-tag">Invoicing</div>
            </div>
          </div>

          <div className="ob-progress-wrap">
            <div className="ob-seg-track">
              {STEPS.map((s, i) => (
                <div
                  key={s.label}
                  className={`ob-seg${i === step ? ' active' : ''}${i < step ? ' done' : ''}${i > maxReached ? ' locked' : ''}`}
                  onClick={() => i <= maxReached && goTo(i)}
                  title={s.label}
                >
                  <span className="ob-seg-fill" />
                </div>
              ))}
            </div>
            <div className="ob-progress-label">
              Step <b>{step + 1}</b> of {STEPS.length} · <span className="pl-name">{STEPS[step].label}</span>
            </div>
          </div>

          <div className="ob-head-right">
            <button className="ob-skip-link" onClick={() => navigate('/dashboard')}>
              Skip setup <Ico name="arrow-right" />
            </button>
          </div>
        </header>

        {/* ───── Body ───── */}
        <div className="ob-body">

          {/* Form column */}
          <main className="ob-main">
            <div className="ob-main-inner">

              {/* STEP 1 — Business details */}
              <section className={`ob-step${step === 0 ? ' active' : ''}`}>
                <div className="ob-eyebrow">
                  <span className="pellet"><Ico name="building" /></span> Your business
                </div>
                <h2 className="ob-step-title">Tell us about your business</h2>
                <p className="ob-step-sub">This appears on every invoice and quote you send. You can change any of it later in Settings.</p>

                <div className="ob-step-form">
                  <div className="ob-field">
                    <div className="ob-field-label">Company logo <span className="opt">· optional</span></div>
                    <div className="ob-logo-upload">
                      <div
                        className={`ob-logo-slot${logoType === 'mono' ? ' has-mono' : ''}`}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {logoType === 'img' && logoUrl
                          ? <img src={logoUrl} alt="logo" />
                          : logoType === 'mono'
                            ? <div className="ob-logo-mono">{logoInitials}</div>
                            : <><Ico name="camera" /><span>Upload</span></>
                        }
                        <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={handleLogoChange} />
                      </div>
                      <div className="ob-logo-actions">
                        <button className="ob-btn-sm" type="button" onClick={() => logoInputRef.current?.click()}>
                          <Ico name="camera" /> Upload image
                        </button>
                        <button
                          className="ob-btn-sm ob-btn-ghost"
                          type="button"
                          onClick={() => setLogoType(logoType === 'mono' ? 'none' : 'mono')}
                        >
                          Use initials instead
                        </button>
                        <div className="ob-field-hint">PNG or SVG, at least 200×200px.</div>
                      </div>
                    </div>
                  </div>

                  <div className="ob-field">
                    <label className="ob-field-label">Business name</label>
                    <input
                      className={`ob-input${bizNameErr ? ' err' : ''}`}
                      type="text" value={bizName}
                      placeholder="e.g. Studio Wend SARL"
                      onChange={e => { setBizName(e.target.value); setBizNameErr(false); }}
                    />
                  </div>

                  <div className="ob-row">
                    <div className="ob-field">
                      <label className="ob-field-label">Tax ID (IFU)</label>
                      <input className="ob-input" type="text" value={taxId} placeholder="00012345 B" onChange={e => setTaxId(e.target.value)} />
                    </div>
                    <div className="ob-field">
                      <label className="ob-field-label">RCCM <span className="opt">· optional</span></label>
                      <input className="ob-input" type="text" value={rccm} placeholder="BF-OUA-2021-B-1234" onChange={e => setRccm(e.target.value)} />
                    </div>
                  </div>

                  <div className="ob-field">
                    <label className="ob-field-label">Address</label>
                    <input className="ob-input" type="text" value={address} placeholder="Street, building" onChange={e => setAddress(e.target.value)} />
                  </div>

                  <div className="ob-row-3">
                    <div className="ob-field">
                      <label className="ob-field-label">City</label>
                      <input className="ob-input" type="text" value={city} onChange={e => setCity(e.target.value)} />
                    </div>
                    <div className="ob-field">
                      <label className="ob-field-label">Country</label>
                      <select className="ob-input" value={country} onChange={e => setCountry(e.target.value)}>
                        {['Burkina Faso', 'Mali', "Côte d'Ivoire", 'Senegal', 'Niger', 'Benin', 'Togo'].map(c => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="ob-field">
                      <label className="ob-field-label">Currency</label>
                      <select className="ob-input" value={currency} onChange={e => setCurrency(e.target.value)}>
                        <option value="XOF">XOF — CFA Franc</option>
                        <option value="EUR">EUR — Euro</option>
                        <option value="USD">USD — US Dollar</option>
                        <option value="GHS">GHS — Cedi</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* STEP 2 — Invoice defaults */}
              <section className={`ob-step${step === 1 ? ' active' : ''}`}>
                <div className="ob-eyebrow">
                  <span className="pellet"><Ico name="file-invoice" /></span> Invoice defaults
                </div>
                <h2 className="ob-step-title">Set your invoice defaults</h2>
                <p className="ob-step-sub">We'll pre-fill these on every new invoice — you can still override them one at a time.</p>

                <div className="ob-step-form">
                  <div className="ob-row">
                    <div className="ob-field">
                      <label className="ob-field-label">Invoice number prefix</label>
                      <input className="ob-input" type="text" value={prefix} onChange={e => setPrefix(e.target.value)} />
                    </div>
                    <div className="ob-field">
                      <label className="ob-field-label">Next number</label>
                      <input
                        className={`ob-input tnum${nextNumErr ? ' err' : ''}`}
                        type="text" value={nextNum}
                        onChange={e => { setNextNum(e.target.value); setNextNumErr(false); }}
                      />
                    </div>
                  </div>
                  <div className="ob-field-hint" style={{ marginTop: -6, marginBottom: 16 }}>
                    Your next invoice will be <b>{docNum}</b>.
                  </div>

                  <div className="ob-field">
                    <div className="ob-field-label">Default payment terms</div>
                    <div className="ob-chip-row">
                      {TERMS_OPTIONS.map(t => (
                        <button key={t} type="button" className={`ob-chip${terms === t ? ' active' : ''}`} onClick={() => setTerms(t)}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="ob-row">
                    <div className="ob-field">
                      <label className="ob-field-label">Default tax (TVA)</label>
                      <div className="ob-affix">
                        <input type="number" value={taxRate} min={0} max={100} onChange={e => setTaxRate(Number(e.target.value))} />
                        <span className="suffix">%</span>
                      </div>
                    </div>
                    <div className="ob-field">
                      <label className="ob-field-label">Default payment method</label>
                      <select className="ob-input" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                        <option>Mobile Money (MTN / Orange / Wave)</option>
                        <option>Bank transfer</option>
                        <option>Cash on delivery</option>
                      </select>
                    </div>
                  </div>

                  <div className="ob-field">
                    <label className="ob-field-label">Invoice footer note <span className="opt">· optional</span></label>
                    <textarea className="ob-input" rows={2} value={footer} onChange={e => setFooter(e.target.value)} />
                  </div>
                </div>
              </section>

              {/* STEP 3 — Invite team */}
              <section className={`ob-step${step === 2 ? ' active' : ''}`}>
                <div className="ob-eyebrow">
                  <span className="pellet"><Ico name="users" /></span> Your team
                </div>
                <h2 className="ob-step-title">Invite your team</h2>
                <p className="ob-step-sub">Bring in teammates to create and chase invoices with you. We'll email them an invite. You can skip this and add people anytime.</p>

                <div className="ob-step-form">
                  <div className="ob-add-row team">
                    <div className="ob-field" style={{ margin: 0 }}>
                      <label className="ob-field-label">Work email</label>
                      <input
                        className={`ob-input${teamEmailErr ? ' err' : ''}`}
                        type="email" value={teamEmail} placeholder="name@company.com"
                        onChange={e => { setTeamEmail(e.target.value); setTeamEmailErr(false); }}
                        onKeyDown={e => e.key === 'Enter' && addTeamMember()}
                      />
                    </div>
                    <div className="ob-field" style={{ margin: 0 }}>
                      <label className="ob-field-label">Role</label>
                      <select className="ob-input" value={teamRole} onChange={e => setTeamRole(e.target.value)}>
                        <option>Admin</option>
                        <option>Member</option>
                        <option>Accountant</option>
                        <option>Viewer</option>
                      </select>
                    </div>
                  </div>
                  <button className="ob-btn-sm" type="button" onClick={addTeamMember}>
                    <Ico name="user-plus" /> Add invite
                  </button>

                  <div className="ob-field-label" style={{ marginTop: 22 }}>Pending invites</div>
                  <div className="ob-entry-list">
                    {teamInvites.length === 0
                      ? <div className="ob-empty-note">No invites yet. It's just you — add teammates above or skip.</div>
                      : teamInvites.map((t, i) => (
                        <div key={i} className="ob-entry">
                          <div className={`ob-entry-av ${AV[i % AV.length]}`}>{t.email[0]?.toUpperCase() ?? '?'}</div>
                          <div className="ob-entry-main">
                            <div className="ob-entry-name">{t.email}</div>
                          </div>
                          <div className="ob-entry-role">{t.role}</div>
                          <button className="ob-entry-del" onClick={() => removeTeamMember(i)}>
                            <Ico name="trash" />
                          </button>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </section>

              {/* STEP 4 — Add clients */}
              <section className={`ob-step${step === 3 ? ' active' : ''}`}>
                <div className="ob-eyebrow">
                  <span className="pellet"><Ico name="briefcase" /></span> Your clients
                </div>
                <h2 className="ob-step-title">Add your first clients</h2>
                <p className="ob-step-sub">Add the people you bill most often so they're ready to pick when you create an invoice.</p>

                <div className="ob-step-form">
                  <div className="ob-add-row client">
                    <div className="ob-field" style={{ margin: 0 }}>
                      <label className="ob-field-label">Client / company</label>
                      <input
                        className={`ob-input${clientNameErr ? ' err' : ''}`}
                        type="text" value={clientName} placeholder="e.g. Sahel Banque"
                        onChange={e => { setClientName(e.target.value); setClientNameErr(false); }}
                        onKeyDown={e => e.key === 'Enter' && addClient()}
                      />
                    </div>
                    <div className="ob-field" style={{ margin: 0 }}>
                      <label className="ob-field-label">Billing email <span className="opt">· optional</span></label>
                      <input
                        className="ob-input" type="email" value={clientEmail} placeholder="finance@company.bf"
                        onChange={e => setClientEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addClient()}
                      />
                    </div>
                  </div>
                  <button className="ob-btn-sm" type="button" onClick={addClient}>
                    <Ico name="plus" /> Add client
                  </button>

                  <div className="ob-import-strip" onClick={seedDemoClients}>
                    <div className="is-ico"><Ico name="download" /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="is-title">Import from a spreadsheet</div>
                      <div className="is-sub">Upload a CSV of contacts — we'll map the columns for you.</div>
                    </div>
                    <Ico name="chevron-right" style={{ color: 'var(--color-text-tertiary)' }} />
                  </div>

                  <div className="ob-field-label" style={{ marginTop: 22 }}>Added clients</div>
                  <div className="ob-entry-list">
                    {clients.length === 0
                      ? <div className="ob-empty-note">No clients yet. Add a few above, or add them later when you invoice.</div>
                      : clients.map((c, i) => (
                        <div key={i} className="ob-entry">
                          <div className={`ob-entry-av ${c.av}`}>{initials(c.name)}</div>
                          <div className="ob-entry-main">
                            <div className="ob-entry-name">{c.name}</div>
                            <div className="ob-entry-sub">{c.email || 'No email'}</div>
                          </div>
                          <button className="ob-entry-del" onClick={() => removeClient(i)}>
                            <Ico name="trash" />
                          </button>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </section>

              {/* STEP 5 — Finish */}
              <section className={`ob-step${step === 4 ? ' active' : ''}`}>
                <div className="ob-finish-wrap">
                  <div className="ob-finish-badge">
                    <Ico name="circle-check" />
                  </div>
                  <h2 className="ob-finish-title">You're all set!</h2>
                  <p className="ob-finish-sub">Your workspace is ready. Create your first invoice and start getting paid — Billio handles the reminders.</p>
                  <div className="ob-finish-stats">
                    <div className="ob-fstat"><div className="ob-fstat-v">{docNum}</div><div className="ob-fstat-l">Next invoice</div></div>
                    <div className="ob-fstat"><div className="ob-fstat-v">{1 + teamInvites.length}</div><div className="ob-fstat-l">Team members</div></div>
                    <div className="ob-fstat"><div className="ob-fstat-v">{clients.length}</div><div className="ob-fstat-l">Clients added</div></div>
                  </div>
                </div>
              </section>

            </div>
          </main>

          {/* ───── Aside preview ───── */}
          <aside className="ob-aside">
            <div className="ob-aside-head">
              <div className="ob-aside-eyebrow">
                <Ico name="eye" />
                <span>
                  {pane === 'invoice' ? 'Live invoice preview'
                    : pane === 'team' ? 'Your workspace'
                    : pane === 'clients' ? 'Your client book'
                    : 'Setup summary'}
                </span>
              </div>
            </div>
            <div className="ob-aside-stage">

              {/* Invoice preview */}
              <div className={`ob-preview-pane${pane === 'invoice' ? ' active' : ''}`}>
                <div className="ob-paper">
                  <div className="ob-paper-top">
                    <div className="ob-paper-biz">
                      <div className="ob-paper-logo">
                        {logoType === 'img' && logoUrl
                          ? <img src={logoUrl} alt="" />
                          : logoInitials}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="ob-paper-bizname">{bizName || 'Your business'}</div>
                        <div className="ob-paper-bizmeta">
                          {[address, [city, country].filter(Boolean).join(', ')].filter(Boolean).join('\n').split('\n').map((line, i) => (
                            <span key={i}>{line}<br /></span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="ob-paper-doc">
                      <div className="ob-paper-doctitle">FACTURE</div>
                      <div className="ob-paper-docnum">{docNum}</div>
                    </div>
                  </div>
                  <div className="ob-paper-mid">
                    <div>
                      <div className="ob-mini-label">Billed to</div>
                      <div className="ob-mini-val">Sahel Banque<span className="dim"><br />Ouagadougou</span></div>
                    </div>
                    <div>
                      <div className="ob-mini-label">Terms</div>
                      <div className="ob-mini-val">{terms}<span className="dim"><br />Due 20 Jun 2026</span></div>
                    </div>
                  </div>
                  <div className="ob-paper-items">
                    <div className="ob-irow">
                      <div><div className="ob-idesc">Développement site web</div><div className="ob-iqty">1 × 650 000</div></div>
                      <div className="ob-iamt">{fmt(650000)}</div>
                    </div>
                    <div className="ob-irow">
                      <div><div className="ob-idesc">Hébergement annuel</div><div className="ob-iqty">1 × 120 000</div></div>
                      <div className="ob-iamt">{fmt(120000)}</div>
                    </div>
                  </div>
                  <div className="ob-paper-tot">
                    <div className="ob-trow"><span>Subtotal</span><span>{fmt(sub)}</span></div>
                    <div className="ob-trow"><span>TVA ({taxRate}%)</span><span>{fmt(taxVal)}</span></div>
                    <div className="ob-trow grand"><span>Total due</span><span>{fmt(sub + taxVal)} {currency}</span></div>
                  </div>
                  <div className="ob-paper-note">
                    <span>{footer}</span>
                    <div className="ob-pay-tags">
                      <span className="ob-pay-tag"><Ico name="device-mobile" /> Mobile Money</span>
                      <span className="ob-pay-tag"><Ico name="building-bank" /> Bank</span>
                    </div>
                  </div>
                </div>
                <div className="ob-tip">
                  <span className="ob-tip-icon"><Ico name="bolt" /></span>
                  <div>
                    <div className="ob-tip-title">This is your live invoice</div>
                    <div className="ob-tip-sub">Everything you type on the left shows up here exactly as your clients will see it.</div>
                  </div>
                </div>
              </div>

              {/* Team roster */}
              <div className={`ob-preview-pane${pane === 'team' ? ' active' : ''}`}>
                <div className="ob-scard">
                  <div className="ob-scard-head">
                    <div className="sh-ico"><Ico name="users" /></div>
                    <div className="ob-scard-title">Workspace members</div>
                    <div className="ob-scard-count">{1 + teamInvites.length}</div>
                  </div>
                  <div className="ob-scard-body">
                    {/* owner */}
                    <div className="ob-roster-row">
                      <div className="ob-entry-av av-a">{logoInitials}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ob-roster-name">{bizName || 'You'}</div>
                        <div className="ob-roster-sub">Owner</div>
                      </div>
                      <div className="ob-entry-role owner">Owner</div>
                    </div>
                    {teamInvites.map((t, i) => (
                      <div key={i} className="ob-roster-row">
                        <div className={`ob-entry-av ${AV[(i + 1) % AV.length]}`}>{t.email[0]?.toUpperCase() ?? '?'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="ob-roster-name">{t.email}</div>
                          <div className="ob-roster-sub">{t.role}</div>
                        </div>
                        <div className="ob-entry-role">{t.role}</div>
                      </div>
                    ))}
                  </div>
                  <div className="ob-scard-foot">
                    <Ico name="info-circle" /> Invites are emailed instantly. They expire in 7 days.
                  </div>
                </div>
                <div className="ob-tip">
                  <span className="ob-tip-icon"><Ico name="shield-check" /></span>
                  <div>
                    <div className="ob-tip-title">Roles keep things tidy</div>
                    <div className="ob-tip-sub">Members create and send invoices. Accountants see reports. Viewers can only look.</div>
                  </div>
                </div>
              </div>

              {/* Client roster */}
              <div className={`ob-preview-pane${pane === 'clients' ? ' active' : ''}`}>
                <div className="ob-scard">
                  <div className="ob-scard-head">
                    <div className="sh-ico"><Ico name="briefcase" /></div>
                    <div className="ob-scard-title">Your client book</div>
                    <div className="ob-scard-count">{clients.length}</div>
                  </div>
                  <div className="ob-scard-body">
                    {clients.length === 0
                      ? <div className="ob-empty-note" style={{ margin: '8px 0' }}>Your clients will appear here.<br />Add your first one on the left.</div>
                      : clients.map((c, i) => (
                        <div key={i} className="ob-roster-row">
                          <div className={`ob-entry-av ${c.av}`}>{initials(c.name)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="ob-roster-name">{c.name}</div>
                            <div className="ob-roster-sub">{c.email || 'No billing email'}</div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  <div className="ob-scard-foot">
                    <Ico name="info-circle" /> Pick any client in one tap when you create an invoice.
                  </div>
                </div>
                <div className="ob-tip">
                  <span className="ob-tip-icon"><Ico name="bolt" /></span>
                  <div>
                    <div className="ob-tip-title">No clients yet? No problem.</div>
                    <div className="ob-tip-sub">You can also add a client on the fly the first time you invoice them.</div>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className={`ob-preview-pane${pane === 'summary' ? ' active' : ''}`}>
                <div className="ob-scard">
                  <div className="ob-scard-head">
                    <div className="sh-ico"><Ico name="circle-check" /></div>
                    <div className="ob-scard-title">Setup summary</div>
                  </div>
                  <div className="ob-scard-body">
                    <div className="ob-check-list">
                      {[
                        { label: bizName || 'Your business', sub: 'Business details & logo', goto: 0, done: true },
                        { label: `Prefix ${prefix} · ${taxRate}% TVA`, sub: 'Invoice defaults', goto: 1, done: true },
                        { label: teamInvites.length ? `${teamInvites.length} invite${teamInvites.length > 1 ? 's' : ''} sent` : 'Just you for now', sub: 'Team', goto: 2, done: teamInvites.length > 0 },
                        { label: clients.length ? `${clients.length} client${clients.length > 1 ? 's' : ''} added` : 'No clients yet', sub: 'Clients', goto: 3, done: clients.length > 0 },
                      ].map(item => (
                        <div key={item.goto} className="ob-check-item">
                          <div className={`ob-check-tick${item.done ? '' : ' skip'}`}>
                            <Ico name="check" />
                          </div>
                          <div className="ob-check-main">
                            <div className="ob-check-t">{item.label}</div>
                            <div className="ob-check-s">{item.sub}</div>
                          </div>
                          <button className="ob-check-edit" onClick={() => goTo(item.goto)}>Edit</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="ob-tip">
                  <span className="ob-tip-icon"><Ico name="sparkles" /></span>
                  <div>
                    <div className="ob-tip-title">First invoice in under a minute</div>
                    <div className="ob-tip-sub">Your defaults are loaded — just pick a client and hit send.</div>
                  </div>
                </div>
              </div>

            </div>
          </aside>
        </div>

        {/* ───── Footer ───── */}
        <footer className="ob-foot">
          {step > 0
            ? <button className="ob-btn" onClick={() => goTo(step - 1)}>
                <Ico name="arrow-left" /> Back
              </button>
            : <div />
          }

          <div className="ob-foot-hint">
            {step === STEPS.length - 1
              ? <><Ico name="circle-check" /> Setup complete</>
              : <><Ico name="clock" /> {STEPS.length - 1 - step > 1 ? `${STEPS.length - 1 - step} quick steps left` : "Last step before you're done"}</>
            }
          </div>

          <div className="ob-foot-actions">
            {STEPS[step].skippable && (
              <button className="ob-btn" onClick={() => goTo(step + 1)}>Skip for now</button>
            )}
            {step < STEPS.length - 1
              ? <button className="ob-btn ob-btn-primary" onClick={onNext}>
                  Continue <Ico name="arrow-right" />
                </button>
              : <button className="ob-btn ob-btn-primary" onClick={handleFinish} disabled={saving}>
                  {saving
                    ? <><Ico name="loader-2" /> Saving…</>
                    : <>Go to dashboard <Ico name="arrow-right" /></>
                  }
                </button>
            }
          </div>
        </footer>

      </div>
    </div>
  );
}
