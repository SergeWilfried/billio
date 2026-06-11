import { useState, useMemo } from 'react';
import Icon from '../../components/Icon';
import KPIStrip from '../../components/accounting/KPIStrip';
import DrawerPanel from '../../components/accounting/DrawerPanel';
import type { Account, AccountClass, Journal } from '../../lib/accounting-data';
import { fmt, fmtCompact, clsOf, movementsOf, closingSigned, openingOf, ledgerOf } from '../../lib/accounting-data';
import { useChartOfAccounts } from '../../lib/accounting-hooks';
import { EmptyState } from '../../components/EmptyState';

function SideTag({ signed }: { signed: number }) {
  if (Math.abs(signed) < 0.5) return null;
  const isDebit = signed > 0;
  return (
    <span className="side" style={{
      fontSize: 10, fontWeight: 800, marginLeft: 4, padding: '1px 5px',
      borderRadius: 5, background: isDebit ? '#E9F0FA' : '#F1ECFB',
      color: isDebit ? 'var(--brand)' : '#5B45C7',
    }}>{isDebit ? 'D' : 'C'}</span>
  );
}

function AccountDrawer({ account, classes, journals, onClose }: {
  account: Account;
  classes: Record<number, AccountClass>;
  journals: Record<string, Journal>;
  onClose: () => void;
}) {
  const mvt = movementsOf(account.num);
  const opening = openingOf(account.num);
  const closing = closingSigned(account.num);
  const ledger = ledgerOf(account.num);
  const cls = clsOf(account.num);
  const clsInfo = classes[cls];

  return (
    <DrawerPanel
      open
      onClose={onClose}
      title={
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', letterSpacing: 0.4 }}>{account.num}</div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.4, marginTop: 4, lineHeight: 1.2 }}>{account.label}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 7, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span className="cls-tag" style={{ background: clsInfo?.color, width: 18, height: 18, fontSize: 10 }}>{cls}</span>
            {clsInfo?.name} · {account.nature === 'D' ? 'Débit' : 'Crédit'}
          </div>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
        <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Solde ouverture</div>
          <div className="mono" style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4, marginTop: 5 }}>{fmt(opening)}</div>
        </div>
        <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Mouvements</div>
          <div className="mono" style={{ fontSize: 14, fontWeight: 700, marginTop: 5 }}>
            <span style={{ color: 'var(--color-text-primary)' }}>D {fmt(mvt.debit)}</span>
            <span style={{ color: 'var(--color-text-tertiary)', margin: '0 5px' }}>/</span>
            <span>C {fmt(mvt.credit)}</span>
          </div>
        </div>
        <div style={{ gridColumn: '1/-1', background: 'var(--brand-tint)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--brand-dark)' }}>Solde clôture</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, marginTop: 5, color: 'var(--brand-dark)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {fmt(Math.abs(closing))}
            <SideTag signed={closing} />
          </div>
        </div>
      </div>

      <div className="dsec-label">
        <Icon name="list" size={13} />
        Mouvements ({ledger.length})
      </div>

      {ledger.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={<Icon name="list" size={24} />}
          title="Aucun mouvement"
          description="Ce compte n'a pas encore de mouvements comptabilisés."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[...ledger].reverse().map((row, i) => {
            const jInfo = journals[row.entry.journal];
            const amount = row.d > 0 ? row.d : -row.c;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '11px 0', borderBottom: i < ledger.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.entry.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 7 }}>
                    {jInfo && <span className="jchip" style={{ background: jInfo.color }}>{jInfo.code}</span>}
                    {row.entry.piece} · {row.entry.date}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  <div className="mono" style={{ color: amount >= 0 ? 'var(--color-text-primary)' : '#A32D2D' }}>
                    {amount >= 0 ? '+' : ''}{fmt(amount)}
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    Solde {fmt(row.running)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DrawerPanel>
  );
}

export default function ChartOfAccountsPage() {
  const { data, loading } = useChartOfAccounts();
  const [activeClass, setActiveClass] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Account | null>(null);

  const accounts = data?.accounts ?? [];
  const classes  = data?.classes  ?? {};
  const journals = data?.journals ?? {};

  const cash = closingSigned('521') + closingSigned('571');
  const recv = closingSigned('411');
  const pay  = -closingSigned('401');

  const usedClassCount = useMemo(() => {
    const s = new Set<number>();
    accounts.forEach(a => {
      const m = movementsOf(a.num);
      if (m.debit || m.credit || openingOf(a.num)) s.add(clsOf(a.num));
    });
    return s.size;
  }, [accounts]);

  const filtered = useMemo(() => {
    return accounts.filter(a => {
      if (activeClass !== 'all' && String(clsOf(a.num)) !== activeClass) return false;
      if (query) {
        const q = query.toLowerCase();
        return a.num.startsWith(q) || a.label.toLowerCase().includes(q);
      }
      return true;
    });
  }, [activeClass, query]);

  const byClass = useMemo(() => {
    const map: Record<string, Account[]> = {};
    filtered.forEach(a => {
      const k = String(clsOf(a.num));
      if (!map[k]) map[k] = [];
      map[k].push(a);
    });
    return map;
  }, [filtered]);

  const classCounts = useMemo(() => {
    const counts: Record<string, number> = { all: accounts.length };
    accounts.forEach(a => {
      const k = String(clsOf(a.num));
      counts[k] = (counts[k] || 0) + 1;
    });
    return counts;
  }, []);

  const toggleCollapse = (k: string) =>
    setCollapsed(prev => ({ ...prev, [k]: !prev[k] }));

  if (loading) return (
    <div className="main">
      <div className="topbar"><div><div className="page-title">Plan comptable</div></div></div>
      <div className="content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>Chargement…</div>
    </div>
  );

  return (
    <div className="main" style={{ position: 'relative' }}>
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Icon name="book" size={13} /> Accounting
          </div>
          <div className="page-title">Plan comptable</div>
          <div className="page-sub">SYSCOHADA · Système Normal</div>
        </div>
        <div className="topbar-actions">
          <span className="period-pill"><span className="dot" />Exercice 2026 · ouvert</span>
          <button className="btn"><Icon name="download" />Importer</button>
          <button className="btn btn-primary"><Icon name="plus" />Nouveau compte</button>
        </div>
      </div>

      <div className="content">
        <KPIStrip items={[
          { icon: 'book', iconBg: 'var(--brand-tint)', iconColor: 'var(--brand)', label: 'Comptes', value: accounts.length, sub: `${usedClassCount} classes utilisées` },
          { icon: 'building-bank', iconBg: '#E7F3E2', iconColor: '#2E7D32', label: 'Trésorerie (5x)', value: fmtCompact(cash), unit: 'XOF', sub: 'Banque + caisse' },
          { icon: 'receipt', iconBg: '#E9F0FA', iconColor: 'var(--brand)', label: 'Créances (411)', value: fmtCompact(recv), unit: 'XOF', sub: 'Clients à encaisser' },
          { icon: 'truck-delivery', iconBg: '#FCEFE0', iconColor: '#B26A09', label: 'Dettes (401)', value: fmtCompact(pay), unit: 'XOF', sub: 'Fournisseurs à payer' },
        ]} />

        <div className="acc-toolbar">
          <div className="acc-search">
            <Icon name="search" size={16} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            <input
              type="text" placeholder="Rechercher par numéro ou libellé…"
              value={query} onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="chips">
            <button
              className={`chip-f${activeClass === 'all' ? ' active' : ''}`}
              onClick={() => setActiveClass('all')}
            >
              Tous <span className="cnt">{classCounts.all}</span>
            </button>
            {Object.entries(classes).map(([k, c]) =>
              classCounts[k] ? (
                <button
                  key={k}
                  className={`chip-f${activeClass === k ? ' active' : ''}`}
                  onClick={() => setActiveClass(k)}
                >
                  <span className="cls-tag" style={{ background: c.color, width: 18, height: 18, fontSize: 10 }}>{k}</span>
                  {c.short} <span className="cnt">{classCounts[k]}</span>
                </button>
              ) : null
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Comptes</div>
          </div>
          {Object.keys(byClass).length === 0 ? (
            <EmptyState
              variant="compact"
              icon={<Icon name="book" size={24} />}
              title="Aucun compte trouvé"
              description="Aucun compte ne correspond à votre recherche ou au filtre sélectionné."
            />
          ) : (
            <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
              {Object.keys(byClass).sort().map((k, gi) => {
                const cls = classes[Number(k)];
                const clsAccounts = byClass[k];
                const clsSigned = clsAccounts.reduce((s, a) => s + closingSigned(a.num), 0);
                const isCollapsed = collapsed[k];
                return (
                  <div key={k} style={gi > 0 ? { borderTop: '0.5px solid var(--color-border-tertiary)' } : {}}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 18px', background: 'var(--color-background-secondary)', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => toggleCollapse(k)}
                    >
                      <span className="cls-tag" style={{ background: cls?.color }}>{k}</span>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: -0.2 }}>{cls?.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', fontWeight: 500 }}>{clsAccounts.length} compte{clsAccounts.length > 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
                          {fmt(Math.abs(clsSigned))}
                          <SideTag signed={clsSigned} />
                        </div>
                        <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                      </div>
                    </div>

                    {!isCollapsed && clsAccounts.map((a) => {
                      const m = movementsOf(a.num);
                      const signed = closingSigned(a.num);
                      return (
                        <div
                          key={a.num}
                          onClick={() => setSelected(a)}
                          style={{
                            display: 'grid', gridTemplateColumns: '92px 1fr 120px 150px 36px',
                            alignItems: 'center', gap: 14, padding: '11px 18px',
                            borderTop: '0.5px solid var(--color-border-tertiary)',
                            cursor: 'pointer', transition: 'background .1s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--brand-tint)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}
                        >
                          <div className="mono" style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>{a.num}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.label}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', marginTop: 2, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                              {a.nature === 'D' ? 'Débit' : 'Crédit'}
                            </div>
                          </div>
                          <div className="mono" style={{ fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'right' }}>
                            {(m.debit || m.credit)
                              ? <><span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{fmt(m.debit)}</span><span style={{ color: 'var(--color-text-tertiary)', margin: '0 5px' }}>/</span>{fmt(m.credit)}</>
                              : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                          </div>
                          <div className="mono" style={{ textAlign: 'right', fontSize: 13.5, fontWeight: Math.abs(signed) < 0.5 ? 500 : 700, color: Math.abs(signed) < 0.5 ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)' }}>
                            {Math.abs(signed) < 0.5 ? '0' : fmt(Math.abs(signed))}
                            {Math.abs(signed) >= 0.5 && <SideTag signed={signed} />}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', color: 'var(--color-text-tertiary)' }}>
                            <Icon name="chevron-right" size={17} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selected && <AccountDrawer account={selected} classes={classes} journals={journals} onClose={() => setSelected(null)} />}
    </div>
  );
}
