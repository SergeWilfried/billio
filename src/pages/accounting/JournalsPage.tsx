import { useState, useMemo } from 'react';
import { usePermissions } from '@/lib/use-permissions';
import Icon from '@/components/Icon';
import { PageSkeleton } from '@/components/SkeletonLoader';
import KPIStrip from '@/components/accounting/KPIStrip';
import DrawerPanel from '@/components/accounting/DrawerPanel';
import JournalBadge from '@/components/accounting/JournalBadge';
import { EmptyState } from '@/components/EmptyState';
import StatusPill from '@/components/accounting/StatusPill';
import type { JournalEntry, Journal, Account } from '@/lib/accounting-data';
import { fmt, fmtCompact, acctOf } from '@/lib/accounting-data';
import { entrySource } from '@/lib/ledger';
import EntryComposer from '@/components/accounting/EntryComposer';
import { useBalanceFns } from '@/lib/accounting-hooks';
import { csvBlob } from '@/lib/csv';
import { downloadBlob } from '@/lib/download';
import { todayISO } from '@/lib/invoice-status';
import { useJournalsData } from '@/lib/accounting-hooks';
import { JournalsEmptyIllustration } from '@/components/accounting/EmptyIllustrations';
import { exerciseYear } from '@/lib/period';
import Page from '@/components/Page';

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


function EntryDrawer({
  entry, journals, accounts, onClose, onPost, onDelete,
}: { entry: JournalEntry; journals: Record<string, Journal>; accounts: Account[]; onClose: () => void; onPost: (id: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const j = journals[entry.journal];
  const total = entryTotal(entry);
  const balanced = isBalanced(entry);
  const { postable } = usePermissions();
  return (
    <DrawerPanel open onClose={onClose} title={entry.label} subtitle={`${entry.piece} · ${entry.date} · origine : ${entrySource(entry)}`}>
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
          const a = accounts.find(x => x.num === l.acct) ?? acctOf(l.acct);
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
        {balanced ? `Écriture équilibrée · ${fmt(total)} F CFA` : 'Écriture déséquilibrée'}
      </div>

      {entry.posted
        ? <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 14, display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="lock" size={14} />Écriture comptabilisée : elle ne se modifie plus. Pour la corriger, saisissez une autre écriture.</p>
        : postable && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => { if (window.confirm(`Supprimer le brouillon ${entry.piece || entry.label} ?`)) void onDelete(entry.id).then(onClose); }}>
              <Icon name="trash" />Supprimer le brouillon
            </button>
            <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} disabled={!balanced}
              onClick={() => onPost(entry.id).then(onClose)}>
              <Icon name="check" />Comptabiliser
            </button>
          </div>
        )}
    </DrawerPanel>
  );
}

const PAGE = 50;

export default function JournalsPage() {
  const { writable, postable } = usePermissions();
  const { data, loading, postEntry, removeEntry, createEntry } = useJournalsData(true);
  const [activeJournal, setActiveJournal] = useState('all');
  const [draftsOnly, setDraftsOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [showComposer, setShowComposer] = useState(false);

  // Latest first
  const entries  = useMemo(() => [...(data?.entries ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.piece.localeCompare(a.piece)), [data]);
  const journals = data?.journals ?? {};
  const accounts = data?.accounts ?? [];
  const { signedOf } = useBalanceFns(data ? { entries, opening: data.opening, year: data.year } : null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(e =>
      (activeJournal === 'all' || e.journal === activeJournal) &&
      (!draftsOnly || !e.posted) &&
      (!q || e.piece.toLowerCase().includes(q) || e.label.toLowerCase().includes(q) || e.lines.some(l => l.acct.startsWith(q))));
  }, [entries, activeJournal, draftsOnly, query]);

  const postedCount = entries.filter(e => e.posted).length;
  const draftCount  = entries.filter(e => !e.posted).length;
  const totalMvt    = entries.filter(e => e.posted).reduce((s, e) => s + entryTotal(e), 0);
  const allBalanced = entries.length > 0 && entries.every(isBalanced);
  const shownD = filtered.reduce((s, e) => s + e.lines.reduce((x, l) => x + l.d, 0), 0);
  const shownC = filtered.reduce((s, e) => s + e.lines.reduce((x, l) => x + l.c, 0), 0);

  const jCounts: Record<string, number> = useMemo(() => {
    const m: Record<string, number> = {};
    entries.forEach(e => { m[e.journal] = (m[e.journal] || 0) + 1; });
    return m;
  }, [entries]);

  const labelOf = (num: string) => accounts.find(a => a.num === num)?.label ?? acctOf(num)?.label ?? '—';

  function exportCsv() {
    const rows = filtered.flatMap(e => e.lines.map(l => [e.date, e.journal, e.piece, e.label, entrySource(e), l.acct, labelOf(l.acct), l.d || '', l.c || '', e.posted ? 'Comptabilisée' : 'Brouillon']));
    downloadBlob(csvBlob(['Date', 'Journal', 'Pièce', 'Libellé', 'Origine', 'Compte', 'Intitulé', 'Débit', 'Crédit', 'Statut'], rows), `journaux-${todayISO()}.csv`);
  }

  if (loading) return <PageSkeleton section={{ icon: 'notebook', label: 'Comptabilité' }} title="Journaux" variant="accounting" rows={6} />;

  const chip = (on: boolean) => `chip-f${on ? ' active' : ''}`;
  const cols = '96px 64px 1fr 130px 130px 130px 110px';

  return (
    <Page
      section={{ icon: 'notebook', label: 'Comptabilité' }}
      title="Journaux"
      subtitle="Chaque écriture avec ses lignes. Une écriture comptabilisée ne se modifie plus."
      actions={<>
        <span className="period-pill"><span className="dot" />Exercice {exerciseYear()} · ouvert</span>
        <button className="btn" onClick={exportCsv} disabled={filtered.length === 0}><Icon name="download" />Exporter (CSV)</button>
        {writable && <button className="btn btn-primary" onClick={() => setShowComposer(true)}><Icon name="plus" />Nouvelle écriture</button>}
      </>}
      mainStyle={{ position: 'relative' }}
      after={<>
        {selected && <EntryDrawer entry={selected} journals={journals} accounts={accounts} onClose={() => setSelected(null)} onPost={postEntry} onDelete={removeEntry} />}
        {showComposer && data && (
          <EntryComposer journals={journals} accounts={accounts} entries={entries} periods={data.periods} signedOf={signedOf}
            postable={postable} onClose={() => setShowComposer(false)} onCreate={createEntry} onPost={postEntry} />
        )}
      </>}
    >
        <KPIStrip items={[
          { icon: 'notebook', iconBg: 'var(--brand-tint)', iconColor: 'var(--brand)', label: 'Écritures', value: entries.length, sub: `${postedCount} comptabilisées` },
          { icon: 'trending-up', iconBg: '#E7F3E2', iconColor: '#276C2B', label: 'Mouvement total', value: fmtCompact(totalMvt), unit: 'F CFA', sub: 'Débit total comptabilisé' },
          { icon: 'edit', iconBg: '#FAEEDA', iconColor: '#8A5207', label: 'Brouillons', value: draftCount, sub: 'En attente de comptabilisation' },
          { icon: allBalanced ? 'circle-check' : 'alert-triangle', iconBg: allBalanced ? '#E7F3E2' : '#FCEBEB', iconColor: allBalanced ? '#276C2B' : '#A32D2D', label: 'Contrôle', value: allBalanced ? 'OK' : 'Erreur', sub: 'Équilibre des écritures' },
        ]} />

        <div className="acc-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="acc-search">
            <Icon name="search" size={16} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            <input type="search" placeholder="Pièce, libellé, compte…" value={query} onChange={e => { setQuery(e.target.value); setShown(PAGE); }} aria-label="Rechercher une écriture" />
          </div>
          <div className="chips" role="group" aria-label="Journal">
            <button className={chip(activeJournal === 'all')} aria-pressed={activeJournal === 'all'} onClick={() => { setActiveJournal('all'); setShown(PAGE); }}>
              Tous <span className="cnt">{entries.length}</span>
            </button>
            {Object.values(journals).map(j => jCounts[j.code] ? (
              <button key={j.code} className={chip(activeJournal === j.code)} aria-pressed={activeJournal === j.code} onClick={() => { setActiveJournal(j.code); setShown(PAGE); }}>
                <JournalBadge journal={j} /> {j.name} <span className="cnt">{jCounts[j.code]}</span>
              </button>
            ) : null)}
          </div>
          <button className={chip(draftsOnly)} aria-pressed={draftsOnly} onClick={() => { setDraftsOnly(d => !d); setShown(PAGE); }}>
            Brouillons seulement <span className="cnt">{draftCount}</span>
          </button>
        </div>

        <div className="jr-table">
          <div className="jr-row jr-th" style={{ gridTemplateColumns: cols }}>
            <span>Date</span><span>Journal</span><span>Écriture et lignes</span><span className="r">Débit</span><span className="r">Crédit</span><span>Statut</span><span />
          </div>

          {filtered.length === 0
            ? <EmptyState
                illustration={<JournalsEmptyIllustration />}
                title="Aucune écriture trouvée"
                description="Aucune écriture ne correspond au journal, à la recherche ou au filtre choisis."
              />
            : filtered.slice(0, shown).map(e => {
              const j = journals[e.journal];
              const d = e.lines.reduce((x, l) => x + l.d, 0);
              const c = e.lines.reduce((x, l) => x + l.c, 0);
              return (
                <div key={e.id} className="jr-entry">
                  <button type="button" className="jr-row jr-head" style={{ gridTemplateColumns: cols }} onClick={() => setSelected(e)} aria-label={`Ouvrir l’écriture ${e.piece || e.label}`}>
                    <span className="jr-date">{e.date.split('-').reverse().join('/')}</span>
                    <span>{j ? <JournalBadge journal={j} /> : e.journal}</span>
                    <span className="jr-label"><b>{e.label}</b><small>{e.piece}{e.piece ? ' · ' : ''}origine : {entrySource(e)}</small></span>
                    <span className="mono r"><b>{fmt(d)}</b></span>
                    <span className="mono r"><b>{fmt(c)}</b></span>
                    <span><StatusPill status={entryStatus(e)} /></span>
                    <span className="r jr-act">{e.posted ? <Icon name="lock" size={14} ariaHidden /> : postable ? 'Comptabiliser…' : ''}</span>
                  </button>
                  {e.lines.map((l, k) => (
                    <div key={k} className="jr-row jr-line" style={{ gridTemplateColumns: cols }}>
                      <span /><span />
                      <span className="jr-acct"><span className="mono">{l.acct}</span> · {labelOf(l.acct)}</span>
                      <span className="mono r">{l.d ? fmt(l.d) : ''}</span>
                      <span className="mono r">{l.c ? fmt(l.c) : ''}</span>
                      <span /><span />
                    </div>
                  ))}
                </div>
              );
            })}

          {filtered.length > 0 && (
            <div className="jr-foot">
              <span>Total affiché : débit {fmt(shownD)} · crédit {fmt(shownC)} · {Math.round(shownD) === Math.round(shownC) ? <b style={{ color: '#276C2B' }}>équilibré</b> : <b style={{ color: '#A32D2D' }}>déséquilibré</b>}</span>
              <span>{Math.min(shown, filtered.length)} sur {filtered.length}
                {shown < filtered.length && <button type="button" className="btn btn-sm" style={{ marginLeft: 10 }} onClick={() => setShown(n => n + PAGE)}>Afficher plus</button>}</span>
            </div>
          )}
        </div>
    </Page>
  );
}
