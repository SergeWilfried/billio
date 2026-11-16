import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/Icon';
import { PageSkeleton } from '@/components/SkeletonLoader';
import { fmt } from '@/lib/accounting-data';
import { usePeriodClosing, useBalanceFns } from '@/lib/accounting-hooks';
import { draftsInMonth, exerciseResult, isOpeningEntry, monthState, type MonthState } from '@/lib/ledger';
import { usePermissions } from '@/lib/use-permissions';
import { todayISO } from '@/lib/invoice-status';
import { exerciseYear } from '@/lib/period';
import Page from '@/components/Page';

const MONTHS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const STATE: Record<MonthState, { label: string; bg: string; fg: string }> = {
  closed:   { label: 'Clôturé',  bg: '#E7F4EC', fg: '#1E6B40' },
  open:     { label: 'Ouvert',   bg: '#FDF1E3', fg: '#8A4A07' },
  upcoming: { label: 'À venir',  bg: 'var(--color-background-secondary)', fg: 'var(--color-text-tertiary)' },
};

const CARD: React.CSSProperties = { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-sm)' };

export default function PeriodClosingPage() {
  const { data, loading, closePeriod } = usePeriodClosing();
  const { postable } = usePermissions();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signedOf, openingOf, accountNums } = useBalanceFns(data);

  if (loading || !data) return <PageSkeleton section={{ icon: 'lock', label: 'Comptabilité' }} title="Clôture" variant="accounting" rows={5} />;

  const { entries, periods } = data;
  const year = data.year ?? exerciseYear();
  const today = todayISO();
  const states = MONTHS.map((_, i) => monthState(periods.find(p => p.month === i + 1), year, i + 1, today));
  // Months close in order: the first one not closed that has started
  const targetIdx = states.findIndex(s => s === 'open');
  const target = targetIdx >= 0 ? targetIdx + 1 : null;
  const targetPeriod = target ? periods.find(p => p.month === target) : undefined;
  const prefix = target ? `${year}-${String(target).padStart(2, '0')}` : '';

  const monthEntries = target ? entries.filter(e => e.date.startsWith(prefix) && !isOpeningEntry(e)) : [];
  const drafts = target ? draftsInMonth(entries, year, target) : 0;
  const unbalanced = monthEntries.filter(e => Math.round(e.lines.reduce((s, l) => s + l.d - l.c, 0)) !== 0).length;
  const vatNet = monthEntries.filter(e => e.posted).reduce((s, e) => s + e.lines.reduce((x, l) =>
    x + (l.acct.startsWith('443') ? l.c - l.d : l.acct.startsWith('445') ? -(l.d - l.c) : 0), 0), 0);
  const blocked = drafts > 0 || unbalanced > 0;

  const nums = accountNums();
  const result = exerciseResult(signedOf, nums);
  const carriedForward = -nums.filter(n => n.startsWith('11')).reduce((s, n) => s + openingOf(n), 0);

  async function close() {
    if (!targetPeriod || blocked || closing) return;
    if (!window.confirm(`Clôturer ${MONTHS_LONG[target! - 1]} ${year} ? Le mois n’acceptera plus d’écriture.`)) return;
    setClosing(true); setError(null);
    try { await closePeriod(targetPeriod.id); }
    catch (err) { console.error('[closePeriod]', err); setError('La clôture n’a pas pu être enregistrée. Réessayez.'); }
    finally { setClosing(false); }
  }

  const check = (ok: boolean | 'warn', text: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', fontSize: 13.5 }}>
      <span style={{ fontWeight: 700, width: 14, color: ok === true ? '#276C2B' : ok === 'warn' ? '#8A4A07' : '#B42318' }}>{ok === true ? '✓' : ok === 'warn' ? '!' : '✕'}</span>
      <span>{text}</span>
    </div>
  );

  return (
    <Page
      section={{ icon: 'lock', label: 'Comptabilité' }}
      title="Clôture"
      subtitle={`Exercice ${year} · les mois se clôturent dans l’ordre ; un mois clôturé n’accepte plus d’écriture.`}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 8, marginBottom: 16 }}>
        {MONTHS.map((m, i) => {
          const st = STATE[states[i]];
          return (
            <div key={m} style={{ borderRadius: 8, padding: '10px 8px', background: st.bg, color: st.fg, outline: target === i + 1 ? '2px solid var(--brand)' : undefined, outlineOffset: 2 }}>
              <div style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: 13 }}>{m}</div>
              <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                {states[i] === 'closed' && <Icon name="lock" size={11} ariaHidden />}{st.label}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }}>
        <section style={{ ...CARD, padding: '16px 20px' }} aria-labelledby="close-title">
          {target ? <>
            <h2 id="close-title" style={{ margin: '0 0 6px', fontSize: 15 }}>Clôturer {MONTHS_LONG[target - 1]} {year}</h2>
            {check(drafts === 0, drafts === 0 ? 'Aucune écriture en brouillon ce mois-ci'
              : <><b>{drafts} écriture{drafts > 1 ? 's' : ''} en brouillon</b> ce mois-ci : comptabilisez-les ou supprimez-les. <Link to="/accounting/journals">Voir dans Journaux</Link></>)}
            {check(unbalanced === 0, unbalanced === 0 ? 'Toutes les écritures du mois sont équilibrées' : <><b>{unbalanced} écriture{unbalanced > 1 ? 's' : ''} déséquilibrée{unbalanced > 1 ? 's' : ''}</b> ce mois-ci : corrigez-les dans Journaux.</>)}
            {check(vatNet === 0 ? true : 'warn', vatNet === 0
              ? 'Pas de TVA à reverser sur ce mois'
              : <>TVA du mois : {vatNet > 0 ? `${fmt(vatNet)} F CFA à reverser` : `crédit de ${fmt(-vatNet)} F CFA`}. Vérifiez qu’elle est déclarée (<Link to="/accounting/tax">Fiscalité</Link>). Ne bloque pas.</>)}
            {check('warn', <span style={{ color: 'var(--color-text-secondary)' }}>Rapprochement bancaire : pas encore suivi dans Billio, à faire sur le relevé.</span>)}
            {error && <div role="alert" style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: '#FCEBEB', color: '#A32D2D', fontSize: 12.5 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, borderTop: '0.5px solid var(--color-border-tertiary)', marginTop: 8, paddingTop: 12 }}>
              {blocked && <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>Bloqué tant qu’il reste des brouillons ou des écritures déséquilibrées dans le mois.</span>}
              {!postable && <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>Réservé aux admins et comptables.</span>}
              <button className="btn btn-primary" disabled={blocked || closing || !targetPeriod || !postable} onClick={() => void close()}>
                <Icon name="lock" />{closing ? 'Clôture…' : `Clôturer ${MONTHS_LONG[target - 1]}`}
              </button>
            </div>
            {!targetPeriod && <p style={{ fontSize: 12.5, color: '#A32D2D', margin: '8px 0 0' }}>La période de ce mois n’existe pas dans la base : elle ne peut pas être clôturée.</p>}
          </> : <>
            <h2 id="close-title" style={{ margin: '0 0 6px', fontSize: 15 }}>Rien à clôturer</h2>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--color-text-secondary)' }}>Tous les mois commencés de l’exercice {year} sont clôturés.</p>
          </>}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={{ ...CARD, padding: '16px 20px', fontSize: 13.5 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 15 }}>Résultat à ce jour</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span>Résultat de l’exercice (comptabilisé)</span><b className="mono" style={{ color: result >= 0 ? '#276C2B' : '#A32D2D' }}>{result >= 0 ? '' : '−'}{fmt(Math.abs(result))}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: 'var(--color-text-secondary)' }}><span>Report à nouveau d’ouverture (11)</span><span className="mono">{carriedForward < 0 ? '−' : ''}{fmt(Math.abs(carriedForward))}</span></div>
          </section>
          <section style={{ ...CARD, padding: '16px 20px', fontSize: 13.5 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 15 }}>Fin d’exercice</h2>
            <p style={{ margin: 0, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>La clôture de l’année et le report des soldes en à-nouveaux {year + 1} arrivent bientôt. D’ici là, saisissez les à-nouveaux de l’exercice suivant dans <Link to="/accounting/opening-balances">À-nouveaux</Link>.</p>
          </section>
        </div>
      </div>
    </Page>
  );
}
