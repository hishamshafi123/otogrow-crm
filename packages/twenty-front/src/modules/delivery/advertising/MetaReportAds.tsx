import { useState } from 'react';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type MetaReport } from '@/delivery/DeliveryMeta';
const GET_REPORT = gql`
  query DeliveryMetaReport($input: JSON!) {
    deliveryMetaReport(input: $input)
  }
`;
type MetaReportAdsProps = { id: string };
export const MetaReportAds = ({ id }: MetaReportAdsProps) => {
  const { t } = useLingui();
  const access = useWorkflowAccess();
  const [offset, setOffset] = useState(0);
  const query = useQuery<{
    deliveryMetaReport: MetaReport & {
      workspaceId: string;
      memberId: string;
      userWorkspaceId: string;
      nextOffset: number | null;
      adOffset: number;
    };
  }>(GET_REPORT, {
    variables: { input: { id, offset }, identity: access.scope },
    skip: !access.ready,
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
  });
  const report = query.data?.deliveryMetaReport;
  if (query.error || access.error)
    return (
      <div role="alert">
        <p>
          <Trans>
            Ad details could not be loaded. Your report decision has not
            changed.
          </Trans>
        </p>
        <StyledDeliveryButton onClick={() => void query.refetch()}>
          <Trans>Retry ad details</Trans>
        </StyledDeliveryButton>
      </div>
    );
  if (
    query.loading ||
    !report ||
    !access.matches(report) ||
    report.id !== id ||
    report.adOffset !== offset
  )
    return (
      <p role="status">
        <Trans>Loading ad details…</Trans>
      </p>
    );
  const money = (amount: string) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: report.currency,
    }).format(Number(amount));
  return (
    <StyledDeliveryStack>
      <strong>
        <Trans>Account events</Trans>
      </strong>
      {report.account?.actions.length ? (
        report.account.actions.map((action) => (
          <small key={action.action_type}>
            {action.action_type}: {action.value}
          </small>
        ))
      ) : (
        <p>
          <Trans>No account events returned.</Trans>
        </p>
      )}
      <strong>
        <Trans>Ad performance</Trans>
      </strong>
      {!report.adCount && (
        <p>
          <Trans>No ad activity returned for this date.</Trans>
        </p>
      )}
      {report.ads.map((ad, index) => (
        <article key={`${ad.ad_id}:${index}`}>
          <strong>{ad.ad_name ?? ad.ad_id}</strong>
          <p>
            {ad.campaign_name} · {money(ad.spend)} · {ad.impressions}{' '}
            {t`impressions`} · {ad.clicks} {t`clicks`}
          </p>
          {ad.actions.map((action) => (
            <small key={action.action_type}>
              {action.action_type}: {action.value} ·{' '}
            </small>
          ))}
        </article>
      ))}
      {Boolean(report.adCount) && (
        <small>{t`Showing ${offset + 1}–${Math.min(offset + 50, report.adCount)} of ${report.adCount} ads`}</small>
      )}
      <StyledDeliveryRow>
        {offset > 0 && (
          <StyledDeliveryButton
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            <Trans>Previous ads</Trans>
          </StyledDeliveryButton>
        )}
        {report.nextOffset !== null && (
          <StyledDeliveryButton onClick={() => setOffset(report.nextOffset!)}>
            <Trans>Next ads</Trans>
          </StyledDeliveryButton>
        )}
      </StyledDeliveryRow>
    </StyledDeliveryStack>
  );
};
