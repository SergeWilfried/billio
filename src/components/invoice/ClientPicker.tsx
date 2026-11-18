// « Facturé à » in the invoice editor (PRO-167): a search over the
// organisation's clients. The block on the invoice is built from the chosen
// client's record; it isn't typed on the invoice. « + Nouveau client » creates
// one in place (PRO-184).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useDismiss } from '@/lib/use-dismiss';
import { CASH_CHOICE, CASH_CLIENT_NAME, useClientChoice } from '@/lib/use-client-choice';
import { clientTypeOf, clientTypeDef } from '@/lib/client-type';
import { contactValue } from '@/lib/share-links';
import ClientQuickCreate from '@/components/invoice/ClientQuickCreate';

export default function ClientPicker({ value, onChange, disabled, kybLabel }: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  /** KYB summary per client code, when known */
  kybLabel: (code: string) => { text: string; tone: 'ok' | 'warn' } | null;
}) {
  const { clients, clientsMap } = useApp();
  const { pick, creating, cash } = useClientChoice(value, onChange);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); setQuery(''); setAdding(false); }, []);
  useDismiss(ref, open, close);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter(c => !q || `${c.name} ${c.ifu ?? ''} ${c.city}`.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, query]);
  // Locked (saving, issuing): no change of client, and the search closes
  const choose = (code: string) => { if (disabled || creating) return; close(); void pick(code); };
  useEffect(() => { if (disabled) close(); }, [disabled, close]);
  const current = value ? clientsMap[value] : undefined;

  return (
    <div className="ie-client" ref={ref}>
      <button type="button" className={`ie-client-btn${current ? '' : ' empty'}`} aria-haspopup="listbox" aria-expanded={open}
        disabled={disabled || creating} onClick={() => { setOpen(o => !o); setHi(0); }}>
        {creating ? 'Création du client comptant…' : current?.name ?? 'Choisir un client'} <span aria-hidden="true">▾</span>
      </button>
      {open && adding && (
        <div className="ie-pop ie-client-pop" role="dialog" aria-label="Nouveau client">
          <ClientQuickCreate initialName={query.trim()} onCancel={() => setAdding(false)}
            onCreated={c => { if (disabled) return; close(); void pick(c.code); }} />
        </div>
      )}
      {open && !adding && (
        <div className="ie-pop ie-client-pop" role="dialog" aria-label="Choisir un client">
          <input
            autoFocus type="search" className="form-input" placeholder="Nom, IFU ou ville…" aria-label="Rechercher un client"
            value={query} onChange={e => { setQuery(e.target.value); setHi(0); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, shown.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
              if (e.key === 'Enter' && shown[hi]) { e.preventDefault(); choose(shown[hi].code); }
            }}
          />
          <div role="listbox" aria-label="Clients" className="ie-client-list">
            {shown.length === 0 && <div className="ie-pop-empty">Aucun client ne correspond.</div>}
            {shown.map((c, i) => {
              const k = kybLabel(c.code);
              const missingIfu = clientTypeDef(clientTypeOf(c)).ifuRequired && !c.ifu;
              return (
                <button type="button" role="option" aria-selected={c.code === value} key={c.code}
                  className={`ie-client-opt${i === hi ? ' hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => choose(c.code)}>
                  <span>
                    <b>{c.name}</b>
                    <small>{[`[${clientTypeOf(c)}]`, c.ifu ? `IFU ${c.ifu}` : null, contactValue(c.city)].filter(Boolean).join(' · ')}</small>
                  </span>
                  {missingIfu
                    ? <span className="ie-tag late">IFU requis</span>
                    : k && <span className={`ie-tag ${k.tone}`}>{k.text}</span>}
                </button>
              );
            })}
          </div>
          <button type="button" className="ie-pop-foot" onClick={() => setAdding(true)}>
            + Nouveau client{query.trim() && <small> « {query.trim()} »</small>}
          </button>
          {!cash && (
            <button type="button" className="ie-pop-foot" onClick={() => choose(CASH_CHOICE)}>
              {CASH_CLIENT_NAME} <small>(vente sans client identifié)</small>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
