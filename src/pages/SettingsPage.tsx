import { useState } from 'react';
import Icon from '../components/Icon';
import { useApp } from '../context/AppContext';

type SettingsTab = 'profile' | 'business' | 'invoicing' | 'reminders' | 'payments' | 'providers' | 'notifications' | 'team' | 'plan';

const TABS: { key: SettingsTab; icon: string; label: string }[] = [
  { key: 'profile',       icon: 'user',           label: 'Profil'               },
  { key: 'business',      icon: 'building',        label: 'Entreprise'           },
  { key: 'invoicing',     icon: 'file-invoice',    label: 'Préférences facture'  },
  { key: 'reminders',     icon: 'bell',            label: 'Relances'             },
  { key: 'payments',      icon: 'credit-card',     label: 'Moyens de paiement'   },
  { key: 'providers',     icon: 'plug-connected',  label: 'Prestataires'         },
  { key: 'notifications', icon: 'bell',            label: 'Notifications'        },
  { key: 'team',          icon: 'users',           label: 'Équipe'               },
  { key: 'plan',          icon: 'sparkles',        label: 'Plan & facturation'   },
];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={'s-toggle' + (on ? ' on' : '')}
      onClick={() => onChange(!on)}
      aria-pressed={on}
    />
  );
}

/* ─── Profile ──────────────────────────────────────────────────── */
function ProfileSection({ onSave }: { onSave: () => void }) {
  return (
    <div className="s-card">
      <div className="s-card-head">
        <div className="s-card-title">Profil</div>
        <div className="s-card-desc">Ces informations apparaissent sur votre compte et dans les journaux d'activité.</div>
      </div>
      <div className="s-card-body">
        <div className="s-field">
          <label className="s-label">Photo de profil</label>
          <div className="s-avatar-row">
            <div className="s-avatar-lg">SW</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm"><Icon name="edit" size={14} /> Modifier</button>
              <button className="btn btn-sm" style={{ background: 'transparent', border: 'none', boxShadow: 'none', color: 'var(--color-text-secondary)' }}>Supprimer</button>
            </div>
          </div>
        </div>
        <div className="s-field-row">
          <div className="s-field"><label className="s-label">Nom complet</label><input className="form-input" defaultValue="Serge W." /></div>
          <div className="s-field"><label className="s-label">Titre</label><input className="form-input" defaultValue="Fondateur" /></div>
        </div>
        <div className="s-field-row">
          <div className="s-field"><label className="s-label">Adresse e-mail</label><input className="form-input" type="email" defaultValue="serge@studiowend.bf" /></div>
          <div className="s-field">
            <label className="s-label">Téléphone</label>
            <div className="input-affix"><span className="prefix">+226</span><input defaultValue="70 12 34 56" type="tel" /></div>
          </div>
        </div>
        <div className="s-field-row">
          <div className="s-field"><label className="s-label">Langue</label>
            <select className="form-input"><option>Français</option><option>English</option></select>
          </div>
          <div className="s-field"><label className="s-label">Fuseau horaire</label>
            <select className="form-input"><option>GMT (Ouagadougou)</option><option>GMT+1 (Lagos)</option></select>
          </div>
        </div>
      </div>
      <div className="s-card-foot">
        <button className="btn">Annuler</button>
        <button className="btn btn-primary" onClick={onSave}>Enregistrer</button>
      </div>
    </div>
  );
}

/* ─── Business ─────────────────────────────────────────────────── */
function BusinessSection({ onSave }: { onSave: () => void }) {
  return (
    <div className="s-card">
      <div className="s-card-head">
        <div className="s-card-title">Informations entreprise</div>
        <div className="s-card-desc">Affichées sur chaque facture et devis que vous envoyez.</div>
      </div>
      <div className="s-card-body">
        <div className="s-field"><label className="s-label">Raison sociale</label><input className="form-input" defaultValue="Studio Wend SARL" /></div>
        <div className="s-field-row">
          <div className="s-field"><label className="s-label">IFU</label><input className="form-input" defaultValue="00012345 B" /></div>
          <div className="s-field"><label className="s-label">RCCM</label><input className="form-input" defaultValue="BF-OUA-2021-B-1234" /></div>
        </div>
        <div className="s-field"><label className="s-label">Adresse</label><input className="form-input" defaultValue="Av. Kwame Nkrumah, Immeuble Baobab" /></div>
        <div className="s-field-row-3">
          <div className="s-field"><label className="s-label">Ville</label><input className="form-input" defaultValue="Ouagadougou" /></div>
          <div className="s-field"><label className="s-label">Pays</label>
            <select className="form-input"><option>Burkina Faso</option><option>Mali</option><option>Côte d'Ivoire</option><option>Sénégal</option></select>
          </div>
          <div className="s-field"><label className="s-label">Devise</label>
            <select className="form-input"><option>XOF — Franc CFA</option><option>EUR — Euro</option><option>USD — Dollar</option></select>
          </div>
        </div>
      </div>
      <div className="s-card-foot">
        <button className="btn btn-primary" onClick={onSave}>Enregistrer</button>
      </div>
    </div>
  );
}

/* ─── Invoicing ─────────────────────────────────────────────────── */
function InvoicingSection({ onSave }: { onSave: () => void }) {
  const [autoReminders, setAutoReminders] = useState(true);
  const [attachPdf, setAttachPdf]         = useState(true);
  const [lateFees, setLateFees]           = useState(false);

  return (
    <>
      <div className="s-card">
        <div className="s-card-head">
          <div className="s-card-title">Paramètres par défaut</div>
          <div className="s-card-desc">Pré-remplis sur chaque nouvelle facture. Vous pouvez les modifier par facture.</div>
        </div>
        <div className="s-card-body">
          <div className="s-field-row">
            <div className="s-field">
              <label className="s-label">Préfixe numéro</label>
              <input className="form-input" defaultValue="INV-" />
              <div className="s-hint">Prochain numéro : <b>#INV-0042</b></div>
            </div>
            <div className="s-field"><label className="s-label">Prochain numéro</label><input className="form-input tnum" defaultValue="0042" /></div>
          </div>
          <div className="s-field-row">
            <div className="s-field"><label className="s-label">Conditions de paiement</label>
              <select className="form-input"><option>Net 14 jours</option><option>Net 7 jours</option><option>Net 30 jours</option><option>À réception</option></select>
            </div>
            <div className="s-field"><label className="s-label">TVA par défaut</label>
              <div className="input-affix"><input defaultValue="18" type="number" /><span className="suffix">%</span></div>
            </div>
          </div>
          <div className="s-field"><label className="s-label">Pied de page facture</label>
            <textarea className="form-input" rows={2} defaultValue="Merci pour votre confiance. Paiement à régler sous 14 jours." />
          </div>
        </div>
      </div>
      <div className="s-card">
        <div className="s-card-head"><div className="s-card-title">Automatisation</div></div>
        <div className="s-card-body">
          <div className="s-row">
            <div className="s-row-ico"><Icon name="bell" size={17} /></div>
            <div className="s-row-main">
              <div className="s-row-title">Relances automatiques</div>
              <div className="s-row-sub">Suivis automatiques selon un calendrier configuré.</div>
            </div>
            <div className="s-row-aside">
              <button className="btn btn-sm" onClick={() => {}}>Configurer</button>
              <Toggle on={autoReminders} onChange={setAutoReminders} />
            </div>
          </div>
          <div className="s-row">
            <div className="s-row-ico"><Icon name="file-text" size={17} /></div>
            <div className="s-row-main">
              <div className="s-row-title">Joindre un PDF</div>
              <div className="s-row-sub">Inclure la facture en pièce jointe dans l'e-mail client.</div>
            </div>
            <div className="s-row-aside"><Toggle on={attachPdf} onChange={setAttachPdf} /></div>
          </div>
          <div className="s-row">
            <div className="s-row-ico"><Icon name="shield-check" size={17} /></div>
            <div className="s-row-main">
              <div className="s-row-title">Pénalités de retard</div>
              <div className="s-row-sub">Appliquer 2 % de pénalité mensuelle aux factures impayées.</div>
            </div>
            <div className="s-row-aside"><Toggle on={lateFees} onChange={setLateFees} /></div>
          </div>
        </div>
        <div className="s-card-foot"><button className="btn btn-primary" onClick={onSave}>Enregistrer</button></div>
      </div>
    </>
  );
}

/* ─── Payment Methods ───────────────────────────────────────────── */
function PaymentMethodsSection({ onSave }: { onSave: () => void }) {
  const [mtn, setMtn]     = useState(true);
  const [orange, setOrange] = useState(true);
  const [wave, setWave]   = useState(false);
  const [bank, setBank]   = useState(true);
  const [cash, setCash]   = useState(false);

  return (
    <div className="s-card">
      <div className="s-card-head">
        <div className="s-card-title">Moyens de paiement</div>
        <div className="s-card-desc">Les méthodes activées s'affichent sur la facture envoyée au client.</div>
      </div>
      <div className="s-card-body">
        <div className="s-row">
          <div className="s-row-ico"><Icon name="device-mobile" size={17} /></div>
          <div className="s-row-main"><div className="s-row-title">Mobile Money — MTN</div><div className="s-row-sub">Recevez les paiements sur votre compte MTN MoMo.</div></div>
          <div className="s-row-aside">
            <input className="form-input" style={{ width: 160 }} defaultValue="70 12 34 56" type="tel" />
            <Toggle on={mtn} onChange={setMtn} />
          </div>
        </div>
        <div className="s-row">
          <div className="s-row-ico"><Icon name="device-mobile" size={17} /></div>
          <div className="s-row-main"><div className="s-row-title">Mobile Money — Orange</div><div className="s-row-sub">Recevez les paiements sur votre compte Orange Money.</div></div>
          <div className="s-row-aside">
            <input className="form-input" style={{ width: 160 }} defaultValue="76 98 76 54" type="tel" />
            <Toggle on={orange} onChange={setOrange} />
          </div>
        </div>
        <div className="s-row">
          <div className="s-row-ico"><Icon name="wave" size={17} /></div>
          <div className="s-row-main"><div className="s-row-title">Wave</div><div className="s-row-sub">Acceptez les paiements par QR Wave et lien.</div></div>
          <div className="s-row-aside">
            <input className="form-input" style={{ width: 160 }} placeholder="Numéro Wave" type="tel" />
            <Toggle on={wave} onChange={setWave} />
          </div>
        </div>
        <div className="s-row">
          <div className="s-row-ico"><Icon name="building-bank" size={17} /></div>
          <div className="s-row-main"><div className="s-row-title">Virement bancaire</div><div className="s-row-sub">Ecobank · IBAN BF76 0001 2345 6789</div></div>
          <div className="s-row-aside">
            <button className="btn btn-sm" onClick={() => {}}>Modifier</button>
            <Toggle on={bank} onChange={setBank} />
          </div>
        </div>
        <div className="s-row">
          <div className="s-row-ico"><Icon name="cash" size={17} /></div>
          <div className="s-row-main"><div className="s-row-title">Espèces</div><div className="s-row-sub">Marquer les factures comme payées en espèces manuellement.</div></div>
          <div className="s-row-aside"><Toggle on={cash} onChange={setCash} /></div>
        </div>
      </div>
      <div className="s-card-foot"><button className="btn btn-primary" onClick={onSave}>Enregistrer</button></div>
    </div>
  );
}

/* ─── Providers ─────────────────────────────────────────────────── */
function ProvidersSection({ onSave }: { onSave: () => void }) {
  const [mode, setMode] = useState<'test' | 'live'>('live');
  const [reconAuto, setReconAuto] = useState(true);
  const [momoOn, setMomoOn] = useState(true);
  const [waveOn, setWaveOn] = useState(true);
  const [cardOn, setCardOn] = useState(true);
  const [bankOn, setBankOn] = useState(false);

  return (
    <>
      <div className="s-card">
        <div className="s-card-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div>
            <div className="s-card-title">Prestataires de paiement</div>
            <div className="s-card-desc">Connectez un prestataire pour collecter les paiements en ligne via liens et QR codes.</div>
          </div>
          <div className="pv-mode">
            <button className={'pv-mode-opt' + (mode === 'test' ? ' active' : '')} onClick={() => setMode('test')}>Test</button>
            <button className={'pv-mode-opt' + (mode === 'live' ? ' active' : '')} onClick={() => setMode('live')}>Live</button>
          </div>
        </div>
        <div className="s-card-body">
          <div className="pv-intro">
            <div className="pv-intro-ico"><Icon name="bolt" size={18} /></div>
            <div>
              <div className="pv-intro-title">Un lien, toutes les méthodes locales</div>
              <div className="pv-intro-sub">Votre prestataire connecté alimente le checkout <b>billio.app/pay</b> — Mobile Money, Wave, carte et banque — et confirme les paiements automatiquement.</div>
            </div>
          </div>

          <div className="pv-connected-head">
            <div className="pv-logo pv-paystack">P</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pv-conn-name">
                Paystack
                <span className="pv-conn-badge">
                  <Icon name="circle-check" size={12} /> {mode === 'live' ? 'Connecté' : 'Mode test'}
                </span>
              </div>
              <div className="pv-conn-meta">studiowend · connecté le 4 juin 2026 · règlement Ecobank •••6789</div>
            </div>
            <button className="icon-btn"><Icon name="dots" size={16} /></button>
          </div>

          <div className="pv-stats">
            <div className="pv-stat">
              <div className="pv-stat-label"><Icon name="credit-card" size={13} /> Collecté (juin)</div>
              <div className="pv-stat-val tnum">2,41M <small>XOF</small></div>
              <div className="pv-stat-sub">38 paiements</div>
            </div>
            <div className="pv-stat">
              <div className="pv-stat-label"><Icon name="clock-pause" size={13} /> Prochain virement</div>
              <div className="pv-stat-val tnum">486K <small>XOF</small></div>
              <div className="pv-stat-sub">Demain, J+1</div>
            </div>
            <div className="pv-stat">
              <div className="pv-stat-label"><Icon name="refresh" size={13} /> Auto-rapprochés</div>
              <div className="pv-stat-val">100<small>%</small></div>
              <div className="pv-stat-sub">38 sur 38 réconciliés</div>
            </div>
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-head">
          <div className="s-card-title">Méthodes &amp; frais</div>
          <div className="s-card-desc">Les méthodes activées apparaissent sur votre checkout. Les frais sont déduits par Paystack.</div>
        </div>
        <div className="s-card-body">
          <div className="pv-method-row">
            <div className="pv-m-ico pv-mi-momo"><Icon name="device-mobile" size={18} /></div>
            <div className="pv-m-main"><div className="pv-m-title">Mobile Money</div><div className="pv-m-sub">MTN MoMo · Orange Money</div></div>
            <div className="pv-m-fee">1,5 %</div>
            <Toggle on={momoOn} onChange={setMomoOn} />
          </div>
          <div className="pv-method-row">
            <div className="pv-m-ico pv-mi-wave"><Icon name="wave" size={18} /></div>
            <div className="pv-m-main"><div className="pv-m-title">Wave</div><div className="pv-m-sub">QR &amp; lien deep-link</div></div>
            <div className="pv-m-fee">1,0 %</div>
            <Toggle on={waveOn} onChange={setWaveOn} />
          </div>
          <div className="pv-method-row">
            <div className="pv-m-ico pv-mi-card"><Icon name="credit-card" size={18} /></div>
            <div className="pv-m-main"><div className="pv-m-title">Carte</div><div className="pv-m-sub">Visa · Mastercard · 3-D Secure</div></div>
            <div className="pv-m-fee">2,9 % + 100</div>
            <Toggle on={cardOn} onChange={setCardOn} />
          </div>
          <div className="pv-method-row">
            <div className="pv-m-ico pv-mi-bank"><Icon name="building-bank" size={18} /></div>
            <div className="pv-m-main"><div className="pv-m-title">Virement bancaire</div><div className="pv-m-sub">Pay-with-transfer · auto-vérifié</div></div>
            <div className="pv-m-fee">0,5 %</div>
            <Toggle on={bankOn} onChange={setBankOn} />
          </div>
        </div>
        <div className="s-card-foot"><button className="btn btn-primary" onClick={onSave}>Enregistrer</button></div>
      </div>

      <div className="s-card">
        <div className="s-card-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div>
            <div className="s-card-title">Rapprochement automatique</div>
            <div className="s-card-desc">À chaque paiement réussi, Billio associe le montant à la facture et la marque payée.</div>
          </div>
          <Toggle on={reconAuto} onChange={setReconAuto} />
        </div>
        <div className="s-card-body">
          <div className="pv-flow">
            <div className="pv-flow-step"><span className="pv-fs-ico"><Icon name="device-mobile" size={14} /></span> Client paie</div>
            <Icon name="arrow-right" size={14} style={{ color: 'var(--color-text-tertiary)' }} />
            <div className="pv-flow-step"><span className="pv-fs-ico"><Icon name="bolt" size={14} /></span> Webhook</div>
            <Icon name="arrow-right" size={14} style={{ color: 'var(--color-text-tertiary)' }} />
            <div className="pv-flow-step"><span className="pv-fs-ico"><Icon name="link" size={14} /></span> Correspondance</div>
            <Icon name="arrow-right" size={14} style={{ color: 'var(--color-text-tertiary)' }} />
            <div className="pv-flow-step pv-flow-paid"><span className="pv-fs-ico"><Icon name="check" size={14} /></span> Payée</div>
          </div>

          <div className="pv-recon-head">
            <span className="pv-recon-label">Derniers rapprochements</span>
          </div>
          <div className="pv-recon-list">
            {[
              { inv: 'FAC-0010', client: 'Société Bâtir', amt: '1 200 000', time: "Aujourd'hui 09h14" },
              { inv: 'FAC-0012', client: 'Ouaga Tech',    amt: '960 000',   time: "Aujourd'hui 08h30" },
              { inv: 'FAC-0014', client: 'NoCode BF',     amt: '280 000',   time: '4 juin 11h02'      },
            ].map(r => (
              <div key={r.inv} className="pv-recon-item">
                <div className="pv-recon-dot"><Icon name="circle-check" size={15} /></div>
                <div className="pv-recon-main">
                  <div className="pv-recon-text"><b>{r.inv}</b> — {r.client}</div>
                  <div className="pv-recon-time">{r.time}</div>
                </div>
                <div className="pv-recon-amt">+{r.amt} XOF</div>
                <span className="pv-recon-badge">Réconcilié</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-head">
          <div className="s-card-title">Autres prestataires</div>
          <div className="s-card-desc">Changer ou ajouter un prestataire. Un seul peut alimenter votre checkout à la fois.</div>
        </div>
        <div className="s-card-body">
          <div className="pv-avail-grid">
            {[
              { name: 'Flutterwave', cls: 'pv-flutter', letter: 'F', sub: 'MoMo · carte · banque' },
              { name: 'Wave Business', cls: 'pv-wave-biz', letter: 'W', sub: 'Règlement Wave direct' },
              { name: 'Stripe', cls: 'pv-stripe', letter: 'S', sub: 'Cartes internationales' },
              { name: 'API personnalisée', cls: 'pv-custom', letter: 'A', sub: 'Custom / self-hosted' },
            ].map(p => (
              <div key={p.name} className="pv-avail-card">
                <div className={`pv-logo ${p.cls}`}>{p.letter}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pv-avail-name">{p.name}</div>
                  <div className="pv-avail-sub">{p.sub}</div>
                </div>
                <button className="btn btn-sm">Connecter</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Team ──────────────────────────────────────────────────────── */
function TeamSection() {
  return (
    <div className="s-card">
      <div className="s-card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="s-card-title">Membres de l'équipe</div>
          <div className="s-card-desc">Personnes ayant accès à ce workspace Billio.</div>
        </div>
        <button className="btn btn-sm btn-primary"><Icon name="plus" size={14} /> Inviter</button>
      </div>
      <div className="s-card-body">
        {[
          { initials: 'SW', cls: 'av-a', name: 'Serge W.', note: '(vous)', email: 'serge@studiowend.bf', role: 'Propriétaire', owner: true },
          { initials: 'AK', cls: 'av-b', name: 'Awa K.',   note: '',      email: 'awa@studiowend.bf',   role: 'Comptable',    owner: false },
          { initials: 'IT', cls: 'av-c', name: 'Ibrahim T.', note: '',    email: 'ibrahim@studiowend.bf', role: 'Membre',     owner: false },
        ].map(m => (
          <div key={m.email} className="s-team-row">
            <div className={`s-team-av ${m.cls}`}>{m.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="s-team-name">{m.name} {m.note && <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>{m.note}</span>}</div>
              <div className="s-team-email">{m.email}</div>
            </div>
            <span className={'s-role-badge' + (m.owner ? ' owner' : '')}>{m.role}</span>
            <button className="icon-btn" disabled={m.owner}><Icon name="dots" size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Plan ──────────────────────────────────────────────────────── */
function PlanSection() {
  return (
    <>
      <div className="s-card">
        <div className="s-card-head">
          <div className="s-card-title">Plan &amp; facturation</div>
          <div className="s-card-desc">Gérez votre abonnement et vos informations de paiement.</div>
        </div>
        <div className="s-card-body">
          <div className="s-plan-card">
            <div className="s-plan-badge"><Icon name="sparkles" size={22} /></div>
            <div style={{ flex: 1 }}>
              <div className="s-plan-name">Plan Pro</div>
              <div className="s-plan-price"><b>9 000 XOF</b> / mois · renouvellement le 6 juillet 2026</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm">Changer</button>
              <button className="btn btn-sm" style={{ color: '#A32D2D' }}>Annuler</button>
            </div>
          </div>
          <div className="s-usage">
            <div className="s-usage-top"><span>Factures ce mois</span><span className="tnum">41 <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}>/ illimité</span></span></div>
            <div className="s-bar-track"><div className="s-bar-fill" style={{ width: '41%' }} /></div>
          </div>
        </div>
        <div className="s-card-foot">
          <button className="btn"><Icon name="file-text" size={14} /> Historique de facturation</button>
        </div>
      </div>
      <div className="s-card s-danger-card">
        <div className="s-card-head">
          <div className="s-card-title" style={{ color: '#A32D2D' }}>Supprimer le workspace</div>
          <div className="s-card-desc">Supprime définitivement ce workspace et toutes les factures.</div>
        </div>
        <div className="s-card-foot" style={{ justifyContent: 'flex-start', background: 'var(--color-background-primary)', borderTop: 'none', paddingTop: 0 }}>
          <button className="btn" style={{ color: '#A32D2D', borderColor: 'var(--color-border-secondary)' }}>
            <Icon name="trash" size={14} /> Supprimer le workspace
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Main component ────────────────────────────────────────────── */
export default function SettingsPage() {
  const { showToast } = useApp();
  const [tab, setTab] = useState<SettingsTab>('profile');
  const onSave = () => showToast('Paramètres enregistrés');

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <div className="page-title">Paramètres</div>
          <div className="page-sub">Gérez vos préférences de workspace et de facturation</div>
        </div>
        <button className="btn btn-primary" onClick={onSave}>
          <Icon name="check" size={15} /> Enregistrer
        </button>
      </div>

      <div className="content">
        <div className="s-grid">
          {/* Sub-nav */}
          <nav className="s-nav">
            {TABS.map(t => (
              <button
                key={t.key}
                className={'s-nav-item' + (tab === t.key ? ' active' : '')}
                onClick={() => setTab(t.key)}
              >
                <Icon name={t.icon} size={18} />
                {t.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="s-col">
            {tab === 'profile'       && <ProfileSection       onSave={onSave} />}
            {tab === 'business'      && <BusinessSection      onSave={onSave} />}
            {tab === 'invoicing'     && <InvoicingSection     onSave={onSave} />}
            {tab === 'payments'      && <PaymentMethodsSection onSave={onSave} />}
            {tab === 'providers'     && <ProvidersSection     onSave={onSave} />}
            {tab === 'team'          && <TeamSection />}
            {tab === 'plan'          && <PlanSection />}
            {(tab === 'reminders' || tab === 'notifications') && (
              <div className="s-card">
                <div className="s-card-body" style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '48px 20px' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
                  <div style={{ fontWeight: 600 }}>Bientôt disponible</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
