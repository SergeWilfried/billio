import { useState } from 'react';
import Icon from '../../components/Icon';
import { PageSkeleton } from '../../components/SkeletonLoader';
import KPIStrip from '../../components/accounting/KPIStrip';
import DrawerPanel from '../../components/accounting/DrawerPanel';
import { EmptyState } from '../../components/EmptyState';
import type { FixedAsset } from '../../lib/accounting-data';
import { fmt, fmtCompact, amortSchedule, netValueOf } from '../../lib/accounting-data';
import { useFixedAssets } from '../../lib/accounting-hooks';
import { FixedAssetsEmptyIllustration } from '../../components/accounting/EmptyIllustrations';

function DepreciationProgress({ pct }: { pct: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--color-background-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#7C3AED,#5B45C7)', borderRadius: 3, transition: 'width .4s ease' }} />
      </div>
      <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

function AssetDrawer({ asset, onClose }: { asset: FixedAsset; onClose: () => void }) {
  const grossValue = asset.grossValue;
  const netValue = netValueOf(asset);
  const amortCumul = grossValue - netValue;
  const pct = grossValue > 0 ? (amortCumul / grossValue) * 100 : 0;
  const annualAmort = grossValue / asset.usefulLife;
  const schedule = amortSchedule(asset);
  const currentYear = 2026;

  return (
    <DrawerPanel
      open
      onClose={onClose}
      title={
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', letterSpacing: 0.4 }}>{asset.id}</div>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.4, marginTop: 3 }}>{asset.name}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>Compte {asset.acct} · {asset.method}</div>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
        {[
          { label: 'Date d\'acquisition', value: asset.acquisitionDate },
          { label: 'Durée d\'utilisation', value: `${asset.usefulLife} ans` },
          { label: 'Valeur brute', value: `${fmt(grossValue)} F CFA` },
          { label: 'Amort. annuel', value: `${fmt(annualAmort)} F CFA` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', padding: '11px 13px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{label}</div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 700, marginTop: 5 }}>{value}</div>
          </div>
        ))}
        <div style={{ gridColumn: '1/-1', background: 'var(--brand-tint)', borderRadius: 'var(--border-radius-md)', padding: '13px 14px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--brand-dark)', marginBottom: 8 }}>Valeur nette comptable</div>
          <DepreciationProgress pct={pct} />
          <div className="mono" style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginTop: 8, color: 'var(--brand-dark)' }}>{fmt(netValue)} <span style={{ fontSize: 13, opacity: 0.7 }}>F CFA</span></div>
          <div style={{ fontSize: 11.5, color: 'var(--brand)', marginTop: 3 }}>Amort. cumulé {fmt(amortCumul)} F CFA</div>
        </div>
      </div>

      <div className="dsec-label"><Icon name="calendar" size={13} />Plan d'amortissement</div>
      <div style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr', gap: 8, padding: '8px 14px', background: 'var(--color-background-secondary)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-secondary)' }}>
          <span>Année</span><span style={{ textAlign: 'right' }}>Dotation</span><span style={{ textAlign: 'right' }}>Cumulé</span><span style={{ textAlign: 'right' }}>VNC</span>
        </div>
        {schedule.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr', gap: 8, padding: '10px 14px', borderTop: '0.5px solid var(--color-border-tertiary)', fontSize: 12.5, background: row.year === currentYear ? 'var(--brand-tint)' : 'transparent', fontWeight: row.year === currentYear ? 600 : 400 }}>
            <span style={{ color: row.year === currentYear ? 'var(--brand)' : 'var(--color-text-secondary)', fontWeight: 700 }}>{row.year}</span>
            <span className="mono" style={{ textAlign: 'right' }}>{fmt(row.annualDepreciation)}</span>
            <span className="mono" style={{ textAlign: 'right', color: '#A32D2D' }}>{fmt(row.cumulative)}</span>
            <span className="mono" style={{ textAlign: 'right', fontWeight: row.year === currentYear ? 700 : 500 }}>{fmt(row.netValue)}</span>
          </div>
        ))}
      </div>
    </DrawerPanel>
  );
}

export default function FixedAssetsPage() {
  const { data: assets, loading } = useFixedAssets();
  const [selected, setSelected] = useState<FixedAsset | null>(null);

  const fixedAssets = assets ?? [];
  const totalGross  = fixedAssets.reduce((s, a) => s + a.grossValue, 0);
  const totalNet    = fixedAssets.reduce((s, a) => s + netValueOf(a), 0);
  const totalAmort  = totalGross - totalNet;
  const monthlyAmort = fixedAssets.reduce((s, a) => s + a.grossValue / a.usefulLife / 12, 0);

  if (loading) return <PageSkeleton title="Immobilisations" variant="accounting" rows={6} />;

  return (
    <div className="main" style={{ position: 'relative' }}>
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <Icon name="building-warehouse" size={13} /> Accounting
          </div>
          <div className="page-title">Immobilisations</div>
          <div className="page-sub">Registre des actifs et plan d'amortissement</div>
        </div>
        <div className="topbar-actions">
          <span className="period-pill"><span className="dot" />Exercice 2026 · ouvert</span>
          <button className="btn btn-primary"><Icon name="plus" />Nouvelle immobilisation</button>
        </div>
      </div>

      <div className="content">
        <KPIStrip items={[
          { icon: 'building-warehouse', iconBg: '#ECE9FB', iconColor: '#5B45C7', label: 'Valeur brute totale', value: fmtCompact(totalGross), unit: 'F CFA', sub: `${fixedAssets.length} immobilisations` },
          { icon: 'trending-down', iconBg: '#FCEBEB', iconColor: '#A32D2D', label: 'Amort. cumulé', value: fmtCompact(totalAmort), unit: 'F CFA', sub: 'Dépréciation totale' },
          { icon: 'chart-bar', iconBg: 'var(--brand-tint)', iconColor: 'var(--brand)', label: 'Valeur nette (VNC)', value: fmtCompact(totalNet), unit: 'F CFA', sub: 'Valeur résiduelle' },
          { icon: 'calendar', iconBg: '#FAEEDA', iconColor: '#B26A09', label: 'Dotation mensuelle', value: fmtCompact(monthlyAmort), unit: 'F CFA', sub: 'Amortissement du mois' },
        ]} />

        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 120px 120px 180px 36px', gap: 14, padding: '10px 18px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            {['Immobilisation', 'Compte', 'Valeur brute', 'VNC', 'Amortissement', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>

          {fixedAssets.length === 0
            ? <EmptyState
                illustration={<FixedAssetsEmptyIllustration />}
                title="Aucune immobilisation"
                description="Ajoutez votre première immobilisation pour suivre les amortissements."
              />
            : fixedAssets.map((asset, i) => {
            const net = netValueOf(asset);
            const pct = asset.grossValue > 0 ? ((asset.grossValue - net) / asset.grossValue) * 100 : 0;
            return (
              <div
                key={asset.id}
                onClick={() => setSelected(asset)}
                style={{ display: 'grid', gridTemplateColumns: '1fr 80px 120px 120px 180px 36px', gap: 14, padding: '14px 18px', borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none', cursor: 'pointer', alignItems: 'center', transition: 'background .1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: '#ECE9FB', color: '#5B45C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={asset.icon} size={17} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{asset.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 1 }}>{asset.id}</div>
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 12.5, color: 'var(--brand)', fontWeight: 700 }}>{asset.acct}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{fmt(asset.grossValue)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{fmt(net)}</div>
                <div><DepreciationProgress pct={pct} /></div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', color: 'var(--color-text-tertiary)' }}><Icon name="chevron-right" size={16} /></div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && <AssetDrawer asset={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
