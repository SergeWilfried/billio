import Icon from '../../components/Icon';
import { PageSkeleton } from '../../components/SkeletonLoader';
import KPIStrip from '../../components/accounting/KPIStrip';
import JournalBadge from '../../components/accounting/JournalBadge';
import type { JournalEntry } from '../../lib/accounting-data';
import { fmt, fmtCompact } from '../../lib/accounting-data';
import { useTaxData } from '../../lib/accounting-hooks';
import { useApp } from '../../context/AppContext';
import { calculateTVA, calculateIS, isRegimeCaducite, isFirstFiscalYear } from '../../lib/tax-bf';
import type { Regime } from '../../lib/tax-bf';

// ─── Regime metadata ─────────────────────────────────────────────────────────

interface RegimeMeta {
  label:         string;
  canInvoiceTVA: boolean;
  /** 'monthly' | 'quarterly' | null */
  declarations:  'monthly' | 'quarterly' | null;
  isColor:       string;
  isBg:          string;
}

function orgRegimeToMeta(raw: string): { regime: Regime; meta: RegimeMeta } {
  switch (raw) {
    case 'RNI': return {
      regime: 'RNI',
      meta: { label: 'RNI', canInvoiceTVA: true, declarations: 'monthly', isColor: 'var(--brand)', isBg: 'var(--brand-tint)' },
    };
    case 'RSI': return {
      regime: 'RSI',
      meta: { label: 'RSI', canInvoiceTVA: false, declarations: 'quarterly', isColor: '#B26A09', isBg: '#FAEEDA' },
    };
    case 'CME': return {
      regime: 'CME-declaratif',
      meta: { label: 'CME', canInvoiceTVA: false, declarations: null, isColor: '#5C4033', isBg: '#EFE6DF' },
    };
    case 'CSE': return {
      regime: 'CSE',
      meta: { label: 'CSE', canInvoiceTVA: false, declarations: null, isColor: '#2E7D32', isBg: '#E7F3E2' },
    };
    default: return {
      regime: 'RND',
      meta: { label: raw || 'RND', canInvoiceTVA: false, declarations: null, isColor: 'var(--color-text-secondary)', isBg: 'var(--color-background-secondary)' },
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sumPostedCredit(entries: JournalEntry[], acct: string): number {
  return entries
    .filter(e => e.posted)
    .flatMap(e => e.lines)
    .filter(l => l.acct === acct)
    .reduce((s, l) => s + l.c, 0);
}

function sumPostedDebitPrefix(entries: JournalEntry[], prefix: string): number {
  return entries
    .filter(e => e.posted)
    .flatMap(e => e.lines)
    .filter(l => l.acct.startsWith(prefix))
    .reduce((s, l) => s + l.d, 0);
}

function sumPostedCreditPrefix(entries: JournalEntry[], prefix: string): number {
  return entries
    .filter(e => e.posted)
    .flatMap(e => e.lines)
    .filter(l => l.acct.startsWith(prefix))
    .reduce((s, l) => s + l.c, 0);
}

interface TaxLine {
  entryId: string;
  journal: string;
  label:   string;
  piece:   string;
  date:    string;
  htBase:  number;
  tvaAmount: number;
  tvaRate:   number;
  type: 'collected' | 'deductible';
}

function buildTaxLines(entries: JournalEntry[]): TaxLine[] {
  const lines: TaxLine[] = [];
  for (const e of entries) {
    if (!e.posted) continue;
    for (const l of e.lines) {
      if (l.acct === '443' && l.c > 0) {
        // Determine rate: 10% for hotel/restaurant entries (not common in mock, default 18%)
        const rate = 0.18;
        lines.push({
          entryId: e.id, journal: e.journal, label: e.label, piece: e.piece, date: e.date,
          htBase: Math.round(l.c / rate),
          tvaAmount: l.c,
          tvaRate: rate,
          type: 'collected',
        });
      }
      if (l.acct === '445' && l.d > 0) {
        const rate = 0.18;
        lines.push({
          entryId: e.id, journal: e.journal, label: e.label, piece: e.piece, date: e.date,
          htBase: Math.round(l.d / rate),
          tvaAmount: l.d,
          tvaRate: rate,
          type: 'deductible',
        });
      }
    }
  }
  return lines.sort((a, b) => a.date < b.date ? -1 : 1);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TaxPage() {
  const { data, loading } = useTaxData();
  const { orgSettings }  = useApp();

  if (loading) return <PageSkeleton title="Fiscalité" variant="accounting" rows={6} />;

  const entries  = data?.entries  ?? [];
  const journals = data?.journals ?? {};

  const { regime, meta } = orgRegimeToMeta(orgSettings.taxRegime);
  const creationDate = orgSettings.businessCreationDate || undefined;
  const EXERCISE_YEAR = 2026;
  const firstYear    = isFirstFiscalYear(creationDate, EXERCISE_YEAR);
  const { canInvoiceTVA, declarations } = meta;

  // ── TVA ──────────────────────────────────────────────────────────────────
  const taxLines   = buildTaxLines(entries);
  const collected  = taxLines.filter(l => l.type === 'collected').reduce((s, l) => s + l.tvaAmount, 0);
  const deductible = taxLines.filter(l => l.type === 'deductible').reduce((s, l) => s + l.tvaAmount, 0);
  const netDue     = collected - deductible;
  const collectedLines  = taxLines.filter(l => l.type === 'collected');
  const deductibleLines = taxLines.filter(l => l.type === 'deductible');

  // Sanity check: verify collectée amount matches calculateTVA on its declared HT base
  const tvaCheck = collectedLines.every(l =>
    Math.abs(calculateTVA(l.htBase, l.tvaRate === 0.10) - l.tvaAmount) <= 1
  );

  // ── IUTS / TPA from payroll journal entries ───────────────────────────────
  const iutsAmount = sumPostedCredit(entries, '4421');
  const tpaAmount  = sumPostedCredit(entries, '4423');

  // ── IS estimate from period P&L ───────────────────────────────────────────
  const periodRevenue  = sumPostedCreditPrefix(entries, '7');
  const periodExpenses = sumPostedDebitPrefix(entries, '6');
  const taxableProfit  = periodRevenue - periodExpenses;

  const isEstimate = calculateIS({
    taxableProfit,
    regime:        regime === 'RNI' ? 'RNI' : 'RSI',
    creationDate,
    isAdherentCGA: false,
    taxYear:       EXERCISE_YEAR,
  });

  // ── Caducité watch ────────────────────────────────────────────────────────
  const ytdCA         = periodRevenue; // rough proxy: period revenue credits
  const caduciteAlert = isRegimeCaducite(regime, ytdCA, creationDate, EXERCISE_YEAR);

  // ── Fiscal calendar ───────────────────────────────────────────────────────
  const isMonthly   = declarations === 'monthly';
  const isQuarterly = declarations === 'quarterly';

  const deadlines: { label: string; date: string; amount: number; status: 'overdue' | 'pending' | 'upcoming'; category: string }[] = [
    { label: 'TVM — Taxe sur la Valeur Marginale 2026', date: '2026-03-31', amount: 0, status: 'overdue', category: 'Annuelle' },
    ...(isMonthly || isQuarterly ? [
      { label: 'IRB Déclaration Définitive — juin 2026', date: '2026-07-10', amount: 0, status: 'pending' as const, category: isMonthly ? 'Mensuelle' : 'Trimestrielle' },
    ] : []),
    ...(canInvoiceTVA ? [
      { label: 'TVA nette due — juin 2026', date: '2026-07-15', amount: netDue > 0 ? netDue : 0, status: 'pending' as const, category: 'Mensuelle' },
    ] : []),
    ...(isMonthly || isQuarterly ? [
      { label: 'IUTS retenu à la source — juin 2026', date: '2026-07-15', amount: iutsAmount, status: 'pending' as const, category: isMonthly ? 'Mensuelle' : 'Trimestrielle' },
      { label: 'TPA (3%) — juin 2026', date: '2026-07-15', amount: tpaAmount, status: 'pending' as const, category: isMonthly ? 'Mensuelle' : 'Trimestrielle' },
    ] : []),
    { label: 'Droit de licence des Étrangers 2026', date: '2026-10-20', amount: 0, status: 'upcoming', category: 'Annuelle' },
    { label: 'Taxe sur Actions 2026', date: '2026-10-20', amount: 0, status: 'upcoming', category: 'Annuelle' },
    { label: 'Autres Droits de Licence 2026', date: '2026-10-30', amount: 0, status: 'upcoming', category: 'Annuelle' },
    { label: '2ᵉ acomptes provisionnels — nov. 2026', date: '2026-11-15', amount: Math.round(isEstimate * 0.25), status: 'upcoming', category: 'Acomptes' },
    { label: 'Patente 2026', date: '2026-12-15', amount: 0, status: 'upcoming', category: 'Annuelle' },
    ...(isQuarterly ? [
      { label: 'TVA — Déclaration trimestrielle (RSI) 2026', date: '2026-12-15', amount: 0, status: 'upcoming' as const, category: 'Trimestrielle' },
    ] : []),
    { label: '3ᵉ acomptes provisionnels — déc. 2026', date: '2026-12-15', amount: Math.round(isEstimate * 0.25), status: 'upcoming', category: 'Acomptes' },
    { label: 'IS / IBICA — Déclaration annuelle 2026', date: '2027-02-28', amount: isEstimate, status: 'upcoming', category: 'Annuelle IS' },
  ];

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Icon name="percentage" size={13} /> Accounting
          </div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Fiscalité
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: meta.isBg, color: meta.isColor, letterSpacing: 0.3 }}>
              {meta.label}
            </span>
            {caduciteAlert && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#FCEBEB', color: '#A32D2D' }}>
                ⚠ Seuil dépassé — notifier la DGI sous 30 j
              </span>
            )}
          </div>
          <div className="page-sub">
            Obligations fiscales · Juin 2026
            {declarations && <> · Déclarations <strong>{declarations === 'monthly' ? 'mensuelles' : 'trimestrielles'}</strong></>}
          </div>
        </div>
        <div className="topbar-actions">
          <span className="period-pill"><span className="dot" />Exercice 2026 · ouvert</span>
          <button className="btn"><Icon name="download" />Exporter déclaration</button>
        </div>
      </div>

      <div className="content">

        {/* KPI strip — adapts to regime */}
        <KPIStrip items={[
          ...(canInvoiceTVA ? [
            { icon: 'receipt', iconBg: '#E7F3E2', iconColor: '#2E7D32', label: '443 — TVA collectée', value: fmtCompact(collected), unit: 'F CFA', sub: `${collectedLines.length} écriture${collectedLines.length !== 1 ? 's' : ''}` },
            { icon: 'receipt', iconBg: '#FAEEDA', iconColor: '#B26A09', label: '445 — TVA déductible', value: fmtCompact(deductible), unit: 'F CFA', sub: `${deductibleLines.length} écriture${deductibleLines.length !== 1 ? 's' : ''}` },
            { icon: 'percentage', iconBg: netDue >= 0 ? '#E9F0FA' : '#FCEBEB', iconColor: netDue >= 0 ? 'var(--brand)' : '#A32D2D', label: '4441 — TVA nette due', value: fmtCompact(Math.abs(netDue)), unit: 'F CFA', sub: netDue >= 0 ? 'À verser à l\'État' : 'Crédit de TVA' },
          ] as const : [
            { icon: 'receipt', iconBg: '#FAEEDA', iconColor: '#B26A09', label: 'CA période HT (estimé)', value: fmtCompact(periodRevenue), unit: 'F CFA', sub: 'Crédits comptes 7xx' },
          ] as const),
          { icon: 'building-bank', iconBg: '#E9F0FA', iconColor: 'var(--brand)', label: 'IS estimé (27,5%)', value: fmtCompact(isEstimate), unit: 'F CFA', sub: taxableProfit >= 0 ? `Bénéfice estimé ${fmtCompact(taxableProfit)} F` : `Déficit — minimum forfaitaire` },
          { icon: 'users', iconBg: '#F3E8FF', iconColor: '#6B21A8', label: 'IUTS + TPA dus', value: fmtCompact(iutsAmount + tpaAmount), unit: 'F CFA', sub: `IUTS ${fmtCompact(iutsAmount)} · TPA ${fmtCompact(tpaAmount)}` },
        ]} />

        {/* TVA section — only for RNI */}
        {canInvoiceTVA ? (
          <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '13px 18px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="receipt" size={15} />Détail TVA · Juin 2026
              {!tvaCheck && (
                <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#FAEEDA', color: '#B26A09' }}>
                  Incohérence taux détectée
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 70px 1fr 100px 110px 60px 110px', gap: 12, padding: '9px 18px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              {['Date', 'Journal', 'Libellé', 'Taux', 'Base HT', 'TVA', 'Type'].map((h, i) => (
                <div key={i} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</div>
              ))}
            </div>

            {taxLines.map((l, i) => {
              const j = journals[l.journal];
              const isCollected = l.type === 'collected';
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 70px 1fr 100px 110px 60px 110px', gap: 12, padding: '11px 18px', borderTop: '0.5px solid var(--color-border-tertiary)', alignItems: 'center', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{l.date.slice(5)}</span>
                  {j ? <JournalBadge journal={j} /> : <span>{l.journal}</span>}
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.label}</span>
                  <span className="mono" style={{ textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: 11.5 }}>{(l.tvaRate * 100).toFixed(0)}%</span>
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

            <div style={{ display: 'grid', gridTemplateColumns: '80px 70px 1fr 100px 110px 60px 110px', gap: 12, padding: '11px 18px', borderTop: '1px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', fontWeight: 700, alignItems: 'center', fontSize: 12.5 }}>
              <span /><span />
              <span>TVA nette</span>
              <span /><span />
              <span className="mono" style={{ textAlign: 'right', fontSize: 13, color: netDue >= 0 ? '#2E7D32' : '#A32D2D' }}>{netDue >= 0 ? '+' : ''}{fmt(netDue)}</span>
              <span />
            </div>
          </div>
        ) : (
          <div style={{ background: '#FAEEDA', border: '0.5px solid #F0C070', borderRadius: 'var(--border-radius-lg)', padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
            <Icon name="info-circle" size={18} color="#B26A09" />
            <div>
              <span style={{ fontWeight: 700, color: '#B26A09' }}>Régime {meta.label} — TVA non applicable.</span>
              {' '}Seuls les contribuables RNI (CA ≥ 50 M F CFA) sont habilités à facturer la TVA. Votre régime en est dispensé.
            </div>
          </div>
        )}

        {/* IS estimate */}
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '13px 18px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="building-bank" size={15} />IS / IBICA — Estimation période (27,5%)
          </div>
          {[
            { label: 'Produits (comptes 7xx)', value: periodRevenue,  sign: '+', color: '#2E7D32' },
            { label: 'Charges (comptes 6xx)',  value: periodExpenses, sign: '−', color: '#A32D2D' },
            { label: 'Résultat fiscal estimé', value: taxableProfit,  sign: taxableProfit >= 0 ? '+' : '−', color: taxableProfit >= 0 ? '#2E7D32' : '#A32D2D', bold: true },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderTop: '0.5px solid var(--color-border-tertiary)', fontSize: 12.5, fontWeight: row.bold ? 700 : 400 }}>
              <span style={{ flex: 1 }}>{row.label}</span>
              <span className="mono" style={{ color: row.color, fontWeight: row.bold ? 700 : 600 }}>
                {row.sign}{fmt(Math.abs(row.value))} F
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderTop: '1px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', fontSize: 12.5, fontWeight: 700 }}>
            <span style={{ flex: 1 }}>IS dû (taux 27,5% · minimum forfaitaire {regime === 'RNI' ? '1 000 000' : '300 000'} F)</span>
            <span className="mono" style={{ color: 'var(--brand)', fontSize: 13 }}>{fmt(isEstimate)} F</span>
          </div>
          <div style={{ padding: '9px 18px', background: firstYear ? '#E7F3E2' : 'var(--color-background-secondary)', borderTop: '0.5px solid var(--color-border-tertiary)', fontSize: 11, color: firstYear ? '#2E7D32' : 'var(--color-text-tertiary)', fontWeight: firstYear ? 600 : 400 }}>
            {firstYear
              ? '1ère année d\'exploitation — exonération du minimum forfaitaire IS applicable (Art.88-90 CGI).'
              : 'Estimation sur la base des écritures comptabilisées. Le résultat fiscal définitif inclut les réintégrations et déductions extra-comptables.'}
          </div>
        </div>

        {/* Tax calendar */}
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ padding: '13px 18px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="calendar" size={15} />Calendrier fiscal · {meta.label}
          </div>
          {deadlines.map((d, i) => {
            const iconBg    = d.status === 'overdue' ? '#FCEBEB' : d.status === 'pending' ? '#FAEEDA' : 'var(--brand-tint)';
            const iconColor = d.status === 'overdue' ? '#A32D2D' : d.status === 'pending' ? '#B26A09' : 'var(--brand)';
            const badgeBg   = d.status === 'overdue' ? '#FCEBEB' : d.status === 'pending' ? '#FAEEDA' : 'var(--color-background-secondary)';
            const badgeColor = d.status === 'overdue' ? '#A32D2D' : d.status === 'pending' ? '#B26A09' : 'var(--color-text-tertiary)';
            const badgeLabel = d.status === 'overdue' ? 'En retard' : d.status === 'pending' ? 'À déclarer' : 'À venir';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="calendar" size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                    {d.label}
                    <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 12, background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0 }}>{d.category}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginTop: 2 }}>Échéance : {d.date}</div>
                </div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 13.5, textAlign: 'right', flexShrink: 0 }}>
                  {fmt(d.amount)} <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>F CFA</span>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: badgeBg, color: badgeColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {badgeLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
