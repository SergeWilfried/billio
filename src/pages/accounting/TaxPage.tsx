import Icon from '../../components/Icon';
import KPIStrip from '../../components/accounting/KPIStrip';
import JournalBadge from '../../components/accounting/JournalBadge';
import type { JournalEntry } from '../../lib/accounting-data';
import { fmt, fmtCompact } from '../../lib/accounting-data';
import { useTaxData } from '../../lib/accounting-hooks';

const TVA_RATE = 0.18;

interface TaxLine {
  entryId: string;
  journal: string;
  label: string;
  piece: string;
  date: string;
  htBase: number;
  tvaAmount: number;
  type: 'collected' | 'deductible';
}

function buildTaxLines(entries: JournalEntry[]): TaxLine[] {
  const lines: TaxLine[] = [];
  for (const e of entries) {
    if (!e.posted) continue;
    for (const l of e.lines) {
      if (l.acct === '443' && l.c > 0) {
        lines.push({
          entryId: e.id, journal: e.journal, label: e.label, piece: e.piece, date: e.date,
          htBase: Math.round(l.c / TVA_RATE),
          tvaAmount: l.c,
          type: 'collected',
        });
      }
      if (l.acct === '445' && l.d > 0) {
        lines.push({
          entryId: e.id, journal: e.journal, label: e.label, piece: e.piece, date: e.date,
          htBase: Math.round(l.d / TVA_RATE),
          tvaAmount: l.d,
          type: 'deductible',
        });
      }
    }
  }
  return lines.sort((a, b) => a.date < b.date ? -1 : 1);
}

export default function TaxPage() {
  const { data, loading } = useTaxData();

  if (loading) return (
    <div className="main">
      <div className="topbar"><div><div className="page-title">Fiscalité</div></div></div>
      <div className="content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>Chargement…</div>
    </div>
  );

  const entries  = data?.entries  ?? [];
  const journals = data?.journals ?? {};

  const taxLines   = buildTaxLines(entries);
  const collected  = taxLines.filter(l => l.type === 'collected').reduce((s, l) => s + l.tvaAmount, 0);
  const deductible = taxLines.filter(l => l.type === 'deductible').reduce((s, l) => s + l.tvaAmount, 0);
  const netDue     = collected - deductible;

  const collectedLines  = taxLines.filter(l => l.type === 'collected');
  const deductibleLines = taxLines.filter(l => l.type === 'deductible');

  const deadlines = [
    { label: 'Déclaration TVA juin 2026', date: '2026-07-15', amount: netDue > 0 ? netDue : 0, status: 'pending' },
    { label: 'IUTS — juin 2026', date: '2026-07-15', amount: 124000, status: 'pending' },
    { label: 'Cotisations CNSS — juin 2026', date: '2026-07-15', amount: 130000, status: 'pending' },
    { label: 'Impôt sur les sociétés (acompte)', date: '2026-09-30', amount: 180000, status: 'upcoming' },
  ];

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Icon name="percentage" size={13} /> Accounting
          </div>
          <div className="page-title">Fiscalité</div>
          <div className="page-sub">TVA et obligations fiscales · Juin 2026</div>
        </div>
        <div className="topbar-actions">
          <span className="period-pill"><span className="dot" />Exercice 2026 · ouvert</span>
          <button className="btn"><Icon name="download" />Exporter déclaration</button>
        </div>
      </div>

      <div className="content">
        <KPIStrip items={[
          { icon: 'receipt', iconBg: '#E7F3E2', iconColor: '#2E7D32', label: '443 — TVA collectée', value: fmtCompact(collected), unit: 'XOF', sub: `${collectedLines.length} écriture${collectedLines.length > 1 ? 's' : ''}` },
          { icon: 'receipt', iconBg: '#FAEEDA', iconColor: '#B26A09', label: '445 — TVA déductible', value: fmtCompact(deductible), unit: 'XOF', sub: `${deductibleLines.length} écriture${deductibleLines.length > 1 ? 's' : ''}` },
          { icon: 'percentage', iconBg: netDue >= 0 ? '#E9F0FA' : '#FCEBEB', iconColor: netDue >= 0 ? 'var(--brand)' : '#A32D2D', label: '4441 — TVA nette due', value: fmtCompact(Math.abs(netDue)), unit: 'XOF', sub: netDue >= 0 ? 'À verser à l\'État' : 'Crédit de TVA' },
          { icon: 'calendar', iconBg: '#FAEEDA', iconColor: '#B26A09', label: 'Prochaine échéance', value: '15 juil.', sub: 'Déclaration TVA juin 2026' },
        ]} />

        {/* Lines table */}
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '13px 18px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="receipt" size={15} />Détail TVA · Juin 2026
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 70px 1fr 120px 110px 110px', gap: 12, padding: '9px 18px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            {['Date', 'Journal', 'Libellé', 'Base HT', 'TVA', 'Type'].map((h, i) => (
              <div key={i} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>

          {taxLines.map((l, i) => {
            const j = journals[l.journal];
            const isCollected = l.type === 'collected';
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 70px 1fr 120px 110px 110px', gap: 12, padding: '11px 18px', borderTop: '0.5px solid var(--color-border-tertiary)', alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>{l.date.slice(5)}</span>
                {j ? <JournalBadge journal={j} /> : <span>{l.journal}</span>}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.label}</span>
                <span className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(l.htBase)}</span>
                <span className="mono" style={{ textAlign: 'right', fontWeight: 700, color: isCollected ? '#2E7D32' : '#B26A09' }}>
                  {isCollected ? '+' : '−'}{fmt(l.tvaAmount)}
                </span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: isCollected ? '#E7F3E2' : '#FAEEDA', color: isCollected ? '#2E7D32' : '#B26A09' }}>
                    {isCollected ? 'Collectée' : 'Déductible'}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Totals row */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 70px 1fr 120px 110px 110px', gap: 12, padding: '11px 18px', borderTop: '1px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', fontWeight: 700, alignItems: 'center', fontSize: 12.5 }}>
            <span /><span />
            <span>Total TVA nette</span>
            <span />
            <span className="mono" style={{ textAlign: 'right', fontSize: 13, color: netDue >= 0 ? '#2E7D32' : '#A32D2D' }}>{netDue >= 0 ? '+' : ''}{fmt(netDue)}</span>
            <span />
          </div>
        </div>

        {/* Tax calendar */}
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ padding: '13px 18px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="calendar" size={15} />Calendrier fiscal
          </div>
          {deadlines.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--brand-tint)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="calendar" size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginTop: 2 }}>{d.date}</div>
              </div>
              <div className="mono" style={{ fontWeight: 700, fontSize: 13.5, textAlign: 'right' }}>
                {fmt(d.amount)} <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>XOF</span>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: d.status === 'pending' ? '#FAEEDA' : 'var(--color-background-secondary)', color: d.status === 'pending' ? '#B26A09' : 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                {d.status === 'pending' ? 'À déclarer' : 'À venir'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
