// « Nouvelle écriture » (PRO-180): a wide panel over Journaux. Lines are typed
// in a table; accounts are found by number or name, with their balance.
// Saved as a draft, or posted at once by admins and accountants.

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import type { Account, Journal, JournalEntry } from '@/lib/accounting-data';
import { fmt } from '@/lib/accounting-data';
import { balanceOnLine, entryProblem, nextPiece, type ComposerLine } from '@/lib/ledger';
import type { FiscalPeriod } from '@/lib/api/accounting';
import { todayISO } from '@/lib/invoice-status';

interface Row { acct: string; query: string; debit: string; credit: string }
const EMPTY: Row = { acct: '', query: '', debit: '', credit: '' };
const num = (s: string) => { const n = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

export interface ComposerPayload {
  journalCode: string; date: string; piece: string; label: string;
  lines: Array<{ accountNum: string; debit: number; credit: number }>;
}

export default function EntryComposer({
  journals, accounts, entries, periods, signedOf, postable, onClose, onSave,
}: {
  journals: Record<string, Journal>;
  accounts: Account[];
  entries: JournalEntry[];
  periods: FiscalPeriod[];
  /** Closing balance of an account over the exercise (debit positive) */
  signedOf: (num: string) => number;
  postable: boolean;
  onClose: () => void;
  onSave: (p: ComposerPayload, post: boolean) => Promise<unknown>;
}) {
  const codes = Object.keys(journals);
  const [journal, setJournal] = useState(codes.includes('OD') ? 'OD' : codes[0] ?? 'OD');
  const [date, setDate] = useState(todayISO());
  const [label, setLabel] = useState('');
  const [piece, setPiece] = useState('');
  const [pieceTouched, setPieceTouched] = useState(false);
  const [rows, setRows] = useState<Row[]>([EMPTY, EMPTY]);
  const [active, setActive] = useState<number | null>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [saving, setSaving] = useState<null | 'draft' | 'post'>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  // Set again on mount: StrictMode runs effects twice in development
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && active === null) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClose]);

  const year = Number(date.slice(0, 4));
  // The journal's next piece, until the user types their own
  const suggested = useMemo(() => nextPiece(entries, journal, year || new Date().getFullYear()), [entries, journal, year]);
  const shownPiece = pieceTouched ? piece : suggested;

  const month = Number(date.slice(5, 7));
  const period = periods.find(p => p.year === year && p.month === month);
  const periodClosed = period?.status === 'closed';

  const lines: ComposerLine[] = rows.map(r => ({ acct: r.acct, debit: num(r.debit), credit: num(r.credit) }));
  const totalD = lines.reduce((s, l) => s + l.debit, 0);
  const totalC = lines.reduce((s, l) => s + l.credit, 0);
  const problem = entryProblem({ label, lines, periodClosed });

  const suggestions = useMemo(() => {
    if (active === null) return [];
    const q = rows[active]?.query.trim().toLowerCase() ?? '';
    if (!q) return [];
    return accounts.filter(a => a.num.startsWith(q) || a.label.toLowerCase().includes(q)).slice(0, 8);
  }, [active, rows, accounts]);

  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  const pick = (i: number, a: Account) => { setRow(i, { acct: a.num, query: `${a.num} · ${a.label}` }); setActive(null); };
  const addRow = () => { setRows(rs => [...rs, EMPTY]); setFocusRow(rows.length); };
  useEffect(() => {
    if (focusRow === null) return;
    document.getElementById(`ec-acct-${focusRow}`)?.focus();
    setFocusRow(null);
  }, [focusRow]);

  const balanceActive = () => {
    const i = active ?? lastFilledIndex(rows);
    if (i < 0) return;
    const balanced = balanceOnLine(lines, i);
    setRows(rs => rs.map((r, j) => j === i ? { ...r, debit: balanced[j].debit ? String(balanced[j].debit) : '', credit: balanced[j].credit ? String(balanced[j].credit) : '' } : r));
  };

  async function save(post: boolean) {
    if (problem || saving) return;
    setSaving(post ? 'post' : 'draft'); setError(null);
    try {
      await onSave({
        journalCode: journal, date, piece: shownPiece.trim(), label: label.trim(),
        lines: lines.filter(l => l.acct && (l.debit > 0 || l.credit > 0)).map(l => ({ accountNum: l.acct, debit: l.debit, credit: l.credit })),
      }, post);
      if (mounted.current) onClose();
    } catch (err) {
      console.error('[saveEntry]', err);
      if (!mounted.current) return;
      const msg = err instanceof Error ? err.message : '';
      setError(/is closed/.test(msg)
        ? 'Cette période est clôturée : choisissez une date dans une période ouverte.'
        : 'L’écriture n’a pas pu être enregistrée. Vérifiez votre connexion et réessayez.');
    } finally {
      if (mounted.current) setSaving(null);
    }
  }

  return (
    <>
      <div className="acc-scrim open" onClick={onClose} aria-hidden="true" />
      <div className="ec-panel" role="dialog" aria-modal="true" aria-labelledby="ec-title"
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(false); } }}>
        <div className="ec-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ec-kicker">Nouvelle écriture · saisie manuelle</div>
            <div id="ec-title" className="ec-title">{label.trim() || 'Sans libellé'}</div>
          </div>
          <span className="ec-draft">Brouillon</span>
          <button className="acc-drawer-close" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>

        <fieldset disabled={!!saving} className="ec-body">
          <div className="ec-fields">
            <label><span>Journal</span>
              <select className="form-input" value={journal} onChange={e => setJournal(e.target.value)}>
                {Object.values(journals).map(j => <option key={j.code} value={j.code}>{j.code} — {j.name}</option>)}
              </select>
            </label>
            <label><span>Date</span>
              <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} aria-describedby="ec-period" />
              <small id="ec-period" className={periodClosed ? 'err' : 'ok'}>
                {period ? `${new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} · ${periodClosed ? 'clôturé' : 'ouvert'}` : ' '}
              </small>
            </label>
            <label><span>Libellé</span>
              <input className="form-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="ex. Régularisation loyer novembre" maxLength={200} />
            </label>
            <label><span>Pièce</span>
              <input className="form-input mono" value={shownPiece} onChange={e => { setPiece(e.target.value); setPieceTouched(true); }} maxLength={60} />
              <small>{pieceTouched ? ' ' : 'Proposée : suivante du journal'}</small>
            </label>
          </div>

          <table className="ec-lines">
            <thead><tr><th style={{ width: 28 }}>#</th><th>Compte</th><th className="r" style={{ width: 150 }}>Débit</th><th className="r" style={{ width: 150 }}>Crédit</th><th style={{ width: 32 }} /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="ec-n">{i + 1}</td>
                  <td style={{ position: 'relative' }}>
                    <input id={`ec-acct-${i}`} className="ec-cell" value={r.query} placeholder="N° ou intitulé du compte…"
                      role="combobox" aria-expanded={active === i && suggestions.length > 0} aria-controls={`ec-sugg-${i}`} aria-label={`Compte, ligne ${i + 1}`}
                      onFocus={() => { setActive(i); setHighlight(0); }}
                      onBlur={() => setTimeout(() => setActive(a => a === i ? null : a), 120)}
                      onChange={e => { setRow(i, { query: e.target.value, acct: '' }); setActive(i); setHighlight(0); }}
                      onKeyDown={e => {
                        if (active !== i || suggestions.length === 0) return;
                        if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
                        else if (e.key === 'Enter') { e.preventDefault(); pick(i, suggestions[highlight]); }
                        else if (e.key === 'Escape') { e.preventDefault(); setActive(null); }
                      }} />
                    {r.query && !r.acct && active !== i && <div className="ec-warn">Choisissez un compte dans la liste</div>}
                    {active === i && suggestions.length > 0 && (
                      <ul id={`ec-sugg-${i}`} role="listbox" className="ec-sugg">
                        {suggestions.map((a, k) => {
                          const v = signedOf(a.num);
                          return (
                            <li key={a.num} role="option" aria-selected={k === highlight} className={k === highlight ? 'on' : undefined}
                              onMouseDown={e => { e.preventDefault(); pick(i, a); }}>
                              <span><b className="mono">{a.num}</b> · {a.label}</span>
                              {Math.abs(v) >= 1 && <small className="mono">solde {fmt(Math.abs(v))} {v > 0 ? 'D' : 'C'}</small>}
                            </li>
                          );
                        })}
                        <li className="ec-sugg-help" aria-hidden="true">↑↓ choisir · Entrée valider</li>
                      </ul>
                    )}
                  </td>
                  <td><input className="ec-cell mono r" inputMode="decimal" value={r.debit} aria-label={`Débit, ligne ${i + 1}`} onFocus={() => setActive(null)}
                    onChange={e => setRow(i, { debit: e.target.value, ...(e.target.value ? { credit: '' } : {}) })} /></td>
                  <td><input className="ec-cell mono r" inputMode="decimal" value={r.credit} aria-label={`Crédit, ligne ${i + 1}`} onFocus={() => setActive(null)}
                    onChange={e => setRow(i, { credit: e.target.value, ...(e.target.value ? { debit: '' } : {}) })}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && i === rows.length - 1) { e.preventDefault(); addRow(); } }} /></td>
                  <td>{rows.length > 2 && <button type="button" className="ec-del" aria-label={`Supprimer la ligne ${i + 1}`} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td /><td><button type="button" className="ec-add" onClick={addRow}><Icon name="plus" size={14} />Ajouter une ligne</button></td>
              <td className="mono r"><b>{fmt(totalD)}</b></td><td className="mono r"><b>{fmt(totalC)}</b></td><td /></tr></tfoot>
          </table>

          <div className="ec-status">
            <span className={`ec-check ${totalD > 0 && Math.round(totalD) === Math.round(totalC) ? 'ok' : totalD || totalC ? 'err' : ''}`}>
              {totalD > 0 && Math.round(totalD) === Math.round(totalC) ? '✓ Équilibrée : débit = crédit' : totalD || totalC ? `Écart : ${fmt(Math.abs(totalD - totalC))}` : 'Saisissez les lignes'}
            </span>
            {Math.round(totalD) !== Math.round(totalC) && <button type="button" className="ec-link" onClick={balanceActive}>Équilibrer sur la ligne {(active ?? lastFilledIndex(rows)) + 1}</button>}
            <span style={{ flex: 1 }} />
            <span className="ec-hint">Entrée sur le dernier crédit : nouvelle ligne · Ctrl+Entrée : enregistrer</span>
          </div>
          {(error || (problem && (label || totalD || totalC))) && <div role="alert" className="ec-problem">{error ?? problem}</div>}
          {periodClosed && !error && <div className="ec-problem" role="alert">Ce mois est clôturé : choisissez une date dans une période ouverte.</div>}
          <p className="ec-note">Pas de libellé par ligne pour l’instant : seul le libellé de l’écriture est enregistré.</p>
        </fieldset>

        <div className="ec-foot">
          <span className="ec-foot-text">Un brouillon peut encore être supprimé. Une fois comptabilisée, l’écriture ne change plus : on la corrige par une autre écriture.</span>
          <button className="btn" onClick={onClose} disabled={!!saving}>Annuler</button>
          <button className="btn" onClick={() => void save(false)} disabled={!!problem || !!saving}>{saving === 'draft' ? 'Enregistrement…' : 'Enregistrer en brouillon'}</button>
          {postable && <button className="btn btn-primary" onClick={() => void save(true)} disabled={!!problem || !!saving}>{saving === 'post' ? 'Comptabilisation…' : 'Comptabiliser'}</button>}
        </div>
      </div>
    </>
  );
}

function lastFilledIndex(rows: Row[]): number {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].acct) return i;
  return rows.length - 1;
}
