import Icon from '@/components/Icon';
import { PageSkeleton } from '@/components/SkeletonLoader';
import { fmt } from '@/lib/accounting-data';
import { useFinancialStatements, useBalanceFns } from '@/lib/accounting-hooks';
import { buildStatements, type StatementSection } from '@/lib/financial-statements';
import { calculateIS } from '@/lib/tax-bf';
import { exerciseYear } from '@/lib/period';
import { useApp } from '@/context/AppContext';
import Page from '@/components/Page';

const card: React.CSSProperties = { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', flex: 1, minWidth: 0 };
const head: React.CSSProperties = { padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 14, fontWeight: 700 };

function Row({ label, amount, bold, indent, muted }: { label: React.ReactNode; amount: number | null; bold?: boolean; indent?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: `8px 16px 8px ${indent ? 30 : 16}px`, borderBottom: '0.5px solid var(--color-border-tertiary)', fontWeight: bold ? 700 : 400, fontSize: 13, color: muted ? 'var(--color-text-secondary)' : undefined, background: bold && !indent ? 'var(--color-background-secondary)' : undefined }}>
      <span>{label}</span>
      {amount !== null && <span className="mono" style={{ color: amount < 0 ? '#A32D2D' : undefined }}>{amount < 0 ? '−' : ''}{fmt(Math.abs(amount))}</span>}
    </div>
  );
}

function Sections({ sections }: { sections: StatementSection[] }) {
  return <>{sections.map(s => (
    <div key={s.title}>
      <Row label={s.title} amount={s.total} bold />
      {s.lines.map(l => <Row key={l.label} label={l.label} amount={l.amount} indent />)}
    </div>
  ))}</>;
}

export default function FinancialStatementsPage() {
  const { data, loading } = useFinancialStatements();
  const { signedOf, accountNums } = useBalanceFns(data);
  const { orgSettings } = useApp();
  const year = data?.year ?? exerciseYear();

  if (loading || !data) return <PageSkeleton section={{ icon: 'report-money', label: 'Comptabilité' }} title="États financiers" variant="accounting" rows={8} />;

  const st = buildStatements(accountNums(), signedOf);
  const { income, balance } = st;
  // IS: an estimate from the result to date (27.5 %, with the minimum), not an entry
  const isEstimate = calculateIS({
    taxableProfit: income.result,
    regime: orgSettings.taxRegime === 'RNI' ? 'RNI' : 'RSI',
    creationDate: orgSettings.businessCreationDate || undefined,
    isAdherentCGA: false,
    annualTurnoverHT: st.turnover,
    taxYear: year,
  });
  const today = new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Ouagadougou' });

  return (
    <Page
      section={{ icon: 'report-money', label: 'Comptabilité' }}
      title="États financiers"
      subtitle={`Résultat et bilan de l’exercice ${year} au ${today}, tirés de la balance (écritures comptabilisées).`}
      actions={<>
        <span className="period-pill"><span className="dot" />Exercice {year} · ouvert</span>
        <button className="btn" onClick={() => window.print()}><Icon name="printer" />Imprimer</button>
      </>}
    >
      <div role="status" className={st.tied ? 'tie-banner' : 'tie-banner err'} style={st.tied ? undefined : { background: '#FCEBEB', color: '#A32D2D' }}>
        <Icon name={st.tied ? 'circle-check' : 'alert-triangle'} size={16} />
        {st.tied
          ? <>Concorde avec la balance · soldes débiteurs = soldes créditeurs = {fmt(st.trial.debit)} F CFA · total actif = total passif = {fmt(balance.totalAssets)} F CFA</>
          : <>Ne concorde pas : soldes débiteurs {fmt(st.trial.debit)} / créditeurs {fmt(st.trial.credit)} · actif {fmt(balance.totalAssets)} / passif {fmt(balance.totalLiabilities)}. Vérifiez la balance.</>}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 14 }}>
        <section style={card} aria-label="Compte de résultat">
          <div style={head}>Compte de résultat</div>
          <Sections sections={[income.products, income.charges]} />
          <Row label="Résultat avant impôt" amount={income.result} bold />
          <Row label={<>IS estimé <span className="tag-estimate" style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#FDF1E3', color: '#8A4A07', marginLeft: 4 }}>estimation</span></>} amount={-isEstimate} indent muted />
          <Row label="Résultat net estimé" amount={income.result - isEstimate} bold />
        </section>
        <section style={card} aria-label="Bilan">
          <div style={head}>Bilan</div>
          <Row label="ACTIF" amount={null} bold />
          <Sections sections={balance.assets} />
          <Row label="Total actif" amount={balance.totalAssets} bold />
          <Row label="PASSIF" amount={null} bold />
          <Sections sections={balance.liabilities} />
          <Row label="Total passif" amount={balance.totalLiabilities} bold />
        </section>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 10, lineHeight: 1.5 }}>
        L’IS est une estimation (27,5 % du résultat, avec le minimum forfaitaire) : il n’entre ni dans les totaux ni dans les écritures tant qu’il n’est pas déclaré.
        Chaque compte est classé selon sa classe SYSCOHADA ; un compte hors des rubriques usuelles apparaît dans « Autres », jamais ignoré.
      </p>
    </Page>
  );
}
