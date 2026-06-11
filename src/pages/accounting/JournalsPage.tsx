import { useState, useMemo } from 'react';
import Icon from '../../components/Icon';
import KPIStrip from '../../components/accounting/KPIStrip';
import DrawerPanel from '../../components/accounting/DrawerPanel';
import JournalBadge from '../../components/accounting/JournalBadge';
import { EmptyState } from '../../components/EmptyState';
import StatusPill from '../../components/accounting/StatusPill';
import type { JournalEntry, Journal } from '../../lib/accounting-data';
import { fmt, fmtCompact, acctOf } from '../../lib/accounting-data';
import { useJournalsData } from '../../lib/accounting-hooks';
import { JournalsEmptyIllustration } from '../../components/accounting/EmptyIllustrations';

function entryTotal(e: JournalEntry) {
  return e.lines.reduce((s, l) => s + l.d, 0);
}

function isBalanced(e: JournalEntry) {
  const d = e.lines.reduce((s, l) => s + l.d, 0);
  const c = e.lines.reduce((s, l) => s + l.c, 0);
  return Math.abs(d - c) < 0.01;
}

function entryStatus(e: JournalEntry): string {
  if (!isBalanced(e)) return 'unbalanced';
  return e.posted ? 'posted' : 'draft';
}

interface ComposerLine { acct: string; debit: string; credit: string }
const EMPTY_LINE: ComposerLine = { acct: '', debit: '', credit: '' };

function EntryDrawer({
  entry, journals, onClose,
}: { entry: JournalEntry; journals: Record<string, Journal>; onClose: () => void }) {
  const j = journals[entry.journal];
  const total = entryTotal(entry);
  const balanced = isBalanced(entry);
  return (
    <DrawerPanel open onClose={onClose} title={entry.label} subtitle={`${entry.id} · ${entry.date}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        {j && <JournalBadge journal={j} />}
        <StatusPill status={entryStatus(entry)} />
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{entry.piece}</span>
      </div>

      <div style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 110px', gap: 8, padding: '8px 14px', background: 'var(--color-background-secondary)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--color-text-secondary)' }}>
          <span>Compte</span><span>Libellé</span><span style={{ textAlign: 'right' }}>Débit</span><span style={{ textAlign: 'right' }}>Crédit</span>
        </div>
        {entry.lines.map((l, i) => {
          const a = acctOf(l.acct);
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 110px', gap: 8, padding: '10px 14px', borderTop: '0.5px solid var(--color-border-tertiary)', fontSize: 12.5, alignItems: 'center' }}>
              <span className="mono" style={{ fontWeight: 700, color: 'var(--brand)' }}>{l.acct}</span>
              <span style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a?.label ?? '—'}</span>
              <span className="mono" style={{ textAlign: 'right', fontWeight: l.d > 0 ? 600 : 400, color: l.d > 0 ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{l.d > 0 ? fmt(l.d) : '—'}</span>
              <span className="mono" style={{ textAlign: 'right', fontWeight: l.c > 0 ? 600 : 400, color: l.c > 0 ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{l.c > 0 ? fmt(l.c) : '—'}</span>
            </div>
          );
        })}
      </div>

      <div className={`balance-banner ${balanced ? 'ok' : 'err'}`}>
        <Icon name={balanced ? 'circle-check' : 'alert-triangle'} size={16} />
        {balanced ? `Écriture équilibrée · ${fmt(total)} XOF` : 'Écriture déséquilibrée'}
      </div>

      {!entry.posted && (
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
          <Icon name="check" />Comptabiliser
        </button>
      )}
    </DrawerPanel>
  );
}

interface ComposerState { journal: string; label: string; piece: string; lines: ComposerLine[] }

function Composer({
  journals, onClose,
}: { journals: Record<string, Journal>; onClose: () => void }) {
  const [state, setState] = useState<ComposerState>({
    journal: Object.keys(journals)[0] ?? 'VE', label: '', piece: '', lines: [EMPTY_LINE, EMPTY_LINE],
  });

  const debitTotal  = state.lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const creditTotal = state.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(debitTotal - creditTotal) < 0.01 && debitTotal > 0;

  const setLine = (i: number, field: keyof ComposerLine, value: string) =>
    setState(p => ({ ...p, lines: p.lines.map((l, j) => j === i ? { ...l, [field]: value } : l) }));
  const addLine    = () => setState(p => ({ ...p, lines: [...p.lines, EMPTY_LINE] }));
  const removeLine = (i: number) => setState(p => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }));

  return (
    <>
      <div className="acc-scrim open" onClick={onClose} />
      <div style={{ position: 'absolute', top: 0, right: 0, width: 520, maxWidth: '95%', height: '100%', background: 'var(--color-background-primary)', boxShadow: 'var(--shadow-drawer)', zIndex: 31, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 22px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Nouvelle écriture</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>Saisie manuelle double-entrée</div>
          </div>
          <button className="acc-drawer-close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label className="form-label">Journal</label>
              <select className="form-input" value={state.journal} onChange={e => setState(p => ({ ...p, journal: e.target.value }))}>
                {Object.values(journals).map(j => <option key={j.code} value={j.code}>{j.code} — {j.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Référence pièce</label>
              <input className="form-input" value={state.piece} onChange={e => setState(p => ({ ...p, piece: e.target.value }))} placeholder="ex. FACT-001" />
            </div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label className="form-label">Libellé</label>
            <input className="form-input" value={state.label} onChange={e => setState(p => ({ ...p, label: e.target.value }))} placeholder="Description de l'écriture…" />
          </div>

          <div className="dsec-label"><Icon name="list" size={13} />Lignes d'écriture</div>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 90px 28px', gap: 6, padding: '0 2px 7px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
            <span>Compte</span><span>Libellé</span><span style={{ textAlign: 'right' }}>Débit</span><span style={{ textAlign: 'right' }}>Crédit</span><span />
          </div>
          {state.lines.map((line, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 90px 28px', gap: 6, marginBottom: 7, alignItems: 'center' }}>
              <input className="form-input" style={{ fontSize: 12 }} value={line.acct} onChange={e => setLine(i, 'acct', e.target.value)} placeholder="401" />
              <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {acctOf(line.acct)?.label ?? (line.acct ? '—' : '')}
              </div>
              <input className="form-input" style={{ fontSize: 12, textAlign: 'right' }} value={line.debit}  onChange={e => setLine(i, 'debit',  e.target.value)} placeholder="0" />
              <input className="form-input" style={{ fontSize: 12, textAlign: 'right' }} value={line.credit} onChange={e => setLine(i, 'credit', e.target.value)} placeholder="0" />
              <button onClick={() => removeLine(i)} style={{ width: 28, height: 30, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FCEBEB'; e.currentTarget.style.color = '#A32D2D'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          <button onClick={addLine} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--brand)', cursor: 'pointer', padding: '7px 2px 3px', background: 'none', border: 'none', fontFamily: 'inherit' }}>
            <Icon name="plus" size={14} />Ajouter une ligne
          </button>

          <div className={`balance-banner ${balanced ? 'ok' : debitTotal > 0 ? 'err' : ''}`} style={{ marginTop: 16, background: debitTotal === 0 ? 'var(--color-background-secondary)' : undefined, color: debitTotal === 0 ? 'var(--color-text-secondary)' : undefined }}>
            <Icon name={balanced ? 'circle-check' : debitTotal > 0 ? 'alert-triangle' : 'calculator'} size={16} />
            <span>D {fmt(debitTotal)}</span>
            <span style={{ opacity: 0.5 }}>/</span>
            <span>C {fmt(creditTotal)}</span>
            {balanced && <span style={{ marginLeft: 'auto', fontSize: 11 }}>✓ équilibré</span>}
          </div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 9 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!balanced}>
            <Icon name="check" />Enregistrer
          </button>
        </div>
      </div>
    </>
  );
}

export default function JournalsPage() {
  const { data, loading } = useJournalsData(true);
  const [activeJournal, setActiveJournal] = useState('all');
  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [showComposer, setShowComposer] = useState(false);

  const entries  = data?.entries  ?? [];
  const journals = data?.journals ?? {};

  const filtered = useMemo(() =>
    entries.filter(e => activeJournal === 'all' || e.journal === activeJournal),
    [entries, activeJournal]);

  const postedCount = entries.filter(e => e.posted).length;
  const draftCount  = entries.filter(e => !e.posted).length;
  const totalMvt    = entries.filter(e => e.posted).reduce((s, e) => s + entryTotal(e), 0);
  const allBalanced = entries.length > 0 && entries.every(isBalanced);

  const jCounts: Record<string, number> = useMemo(() => {
    const m: Record<string, number> = {};
    entries.forEach(e => { m[e.journal] = (m[e.journal] || 0) + 1; });
    return m;
  }, [entries]);

  if (loading) return (
    <div className="main">
      <div className="topbar"><div><div className="page-title">Journaux comptables</div></div></div>
      <div className="content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>Chargement…</div>
    </div>
  );

  return (
    <div className="main" style={{ position: 'relative' }}>
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Icon name="notebook" size={13} /> Accounting
          </div>
          <div className="page-title">Journaux comptables</div>
          <div className="page-sub">Saisie et consultation des écritures</div>
        </div>
        <div className="topbar-actions">
          <span className="period-pill"><span className="dot" />Exercice 2026 · ouvert</span>
          <button className="btn"><Icon name="download" />Exporter</button>
          <button className="btn btn-primary" onClick={() => setShowComposer(true)}><Icon name="plus" />Nouvelle écriture</button>
        </div>
      </div>

      <div className="content">
        <KPIStrip items={[
          { icon: 'notebook', iconBg: 'var(--brand-tint)', iconColor: 'var(--brand)', label: 'Écritures', value: entries.length, sub: `${postedCount} comptabilisées` },
          { icon: 'trending-up', iconBg: '#E7F3E2', iconColor: '#2E7D32', label: 'Mouvement total', value: fmtCompact(totalMvt), unit: 'XOF', sub: 'Débit total comptabilisé' },
          { icon: 'edit', iconBg: '#FAEEDA', iconColor: '#B26A09', label: 'Brouillons', value: draftCount, sub: 'En attente de comptabilisation' },
          { icon: allBalanced ? 'circle-check' : 'alert-triangle', iconBg: allBalanced ? '#E7F3E2' : '#FCEBEB', iconColor: allBalanced ? '#2E7D32' : '#A32D2D', label: 'Contrôle', value: allBalanced ? 'OK' : 'Erreur', sub: 'Équilibre des écritures' },
        ]} />

        <div className="acc-toolbar">
          <div className="chips">
            <button className={`chip-f${activeJournal === 'all' ? ' active' : ''}`} onClick={() => setActiveJournal('all')}>
              Tous <span className="cnt">{entries.length}</span>
            </button>
            {Object.values(journals).map(j => jCounts[j.code] ? (
              <button key={j.code} className={`chip-f${activeJournal === j.code ? ' active' : ''}`} onClick={() => setActiveJournal(j.code)}>
                <JournalBadge journal={j} /> {j.name} <span className="cnt">{jCounts[j.code]}</span>
              </button>
            ) : null)}
          </div>
        </div>

        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 70px 1fr 130px 110px 36px', gap: 14, padding: '10px 18px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            {['Date', 'Journal', 'Libellé', 'Montant', 'Statut', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>

          {filtered.length === 0
            ? <EmptyState
                illustration={<JournalsEmptyIllustration />}
                title="Aucune écriture trouvée"
                description="Aucune écriture ne correspond au journal ou filtre sélectionné."
              />
            : filtered.map((e, i) => {
              const j = journals[e.journal];
              const total = entryTotal(e);
              const status = entryStatus(e);
              return (
                <div
                  key={e.id}
                  onClick={() => setSelected(e)}
                  style={{ display: 'grid', gridTemplateColumns: '90px 70px 1fr 130px 110px 36px', gap: 14, padding: '12px 18px', borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none', cursor: 'pointer', alignItems: 'center', transition: 'background .1s' }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--color-background-secondary)')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = '')}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{e.date.slice(5)}<div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>{e.date.slice(0, 4)}</div></div>
                  {j ? <JournalBadge journal={j} /> : <span>{e.journal}</span>}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{e.piece}</div>
                  </div>
                  <div className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{fmt(total)}</div>
                  <div style={{ textAlign: 'right' }}><StatusPill status={status} /></div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', color: 'var(--color-text-tertiary)' }}><Icon name="chevron-right" size={16} /></div>
                </div>
              );
            })}
        </div>
      </div>

      {selected  && <EntryDrawer entry={selected} journals={journals} onClose={() => setSelected(null)} />}
      {showComposer && <Composer journals={journals} onClose={() => setShowComposer(false)} />}
    </div>
  );
}
