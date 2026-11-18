import Icon from '@/components/Icon';
import Page from '@/components/Page';

/** The books couldn't be read: say so, with a retry, rather than a skeleton forever */
export default function LoadError({ title, icon = 'report-money', onRetry }: { title: string; icon?: string; onRetry: () => void }) {
  return (
    <Page section={{ icon, label: 'Comptabilité' }} title={title}>
      <div role="alert" className="tie-banner err" style={{ background: '#FCEBEB', color: '#A32D2D', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="alert-triangle" size={16} />Les écritures n’ont pas pu être chargées. Vérifiez votre connexion.</span>
        <button className="btn" onClick={onRetry}>Réessayer</button>
      </div>
    </Page>
  );
}
