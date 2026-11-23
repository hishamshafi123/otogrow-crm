import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { StyledPerformanceViewNavigation } from '@/delivery/founder/performance/performanceStyles';

export const FounderViewNavigation = ({
  active,
}: {
  active: 'performance' | 'attention' | 'alerts';
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const destination = (panel: 'performance' | 'attention' | 'alerts') => {
    const next = new URLSearchParams(params);
    next.set('view', 'health');
    next.set('founderPanel', panel);
    if (panel === 'performance') {
      for (const key of [
        'founderDomain',
        'founderProject',
        'founderOwner',
        'founderAfter',
      ])
        next.delete(key);
    }
    if (panel === 'attention') {
      for (const key of ['founderClientsAfter', 'founderMembersAfter'])
        next.delete(key);
    }
    return `/delivery?${next}`;
  };
  return (
    <StyledPerformanceViewNavigation aria-label={t`Company overview views`}>
      <Link
        to={destination('performance')}
        aria-current={active === 'performance' ? 'page' : undefined}
      >
        <Trans>Performance</Trans>
      </Link>
      <Link
        to={destination('attention')}
        aria-current={active === 'attention' ? 'page' : undefined}
      >
        <Trans>Needs attention</Trans>
      </Link>
      <Link
        to={destination('alerts')}
        aria-current={active === 'alerts' ? 'page' : undefined}
      >
        <Trans>Alert rules</Trans>
      </Link>
    </StyledPerformanceViewNavigation>
  );
};
