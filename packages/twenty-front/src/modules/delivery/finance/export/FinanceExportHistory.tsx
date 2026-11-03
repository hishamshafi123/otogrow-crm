import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isValidUrl } from 'twenty-shared/utils';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { GET_DELIVERY_FINANCE_EXPORT_HISTORY } from '@/delivery/finance/export/delivery-finance-export.graphql';
import { FinanceExportProfileDetails } from '@/delivery/finance/export/FinanceExportProfileDetails';
import { type FinanceExportHistory as FinanceExportHistorySnapshot } from '@/delivery/finance/export/finance-export.types';
import { useFinanceExportLabels } from '@/delivery/finance/export/useFinanceExportLabels';
import { StyledExportRow } from '@/delivery/finance/export/financeExportStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceExportHistoryProps = {
  sourceType: 'PROFILE' | 'BATCH';
  sourceId: string;
  enabled: boolean;
};

export const FinanceExportHistory = ({
  sourceType,
  sourceId,
  enabled,
}: FinanceExportHistoryProps) => {
  const { t } = useLingui();
  const labels = useFinanceExportLabels();
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  const beforeId = params.get('financeExportHistoryBefore');
  const authorized = enabled && permission.ready && permission.canReadFinance;
  const query = useQuery<{
    deliveryFinanceExportHistory: FinanceExportHistorySnapshot;
  }>(GET_DELIVERY_FINANCE_EXPORT_HISTORY, {
    variables: {
      input: { sourceType, sourceId, beforeId },
      identity: permission.scope,
    },
    fetchPolicy: 'no-cache',
    skip: !authorized,
  });
  const candidate = query.data?.deliveryFinanceExportHistory;
  const available =
    authorized &&
    !query.loading &&
    !query.error &&
    permission.matches(candidate) &&
    candidate?.events.every(
      (event) =>
        event.sourceType === sourceType &&
        event.sourceId === sourceId &&
        (!event.profile ||
          (sourceType === 'PROFILE' &&
            event.profile.id === sourceId &&
            event.profile.revision === event.revision)),
    );
  const destination = (cursor: string | null) => {
    const next = new URLSearchParams(params);
    if (cursor) next.set('financeExportHistoryBefore', cursor);
    else next.delete('financeExportHistoryBefore');
    return `/delivery?${next}`;
  };
  if (!authorized) return null;
  if (!available || !candidate)
    return (
      <StyledDeliveryStack>
        <p role={query.error ? 'alert' : 'status'}>
          {query.error
            ? t`Accounting export history could not be checked. Saved details are hidden.`
            : t`Checking accounting export history…`}
        </p>
        <StyledDeliveryButton
          type="button"
          disabled={query.loading}
          onClick={() => void query.refetch().catch(() => undefined)}
        >
          <Trans>Refresh export history</Trans>
        </StyledDeliveryButton>
        {beforeId && (
          <Link to={destination(null)}>
            <Trans>Latest export changes</Trans>
          </Link>
        )}
      </StyledDeliveryStack>
    );
  return (
    <section aria-label={t`Accounting export history`}>
      <StyledDeliveryStack>
        {!candidate.events.length && (
          <p>
            <Trans>No recorded changes for this export source.</Trans>
          </p>
        )}
        {candidate.events.map((event) => (
          <StyledExportRow
            key={event.id}
            aria-label={labels.action(event.action)}
          >
            <strong>
              {labels.action(event.action)} · {t`Version ${event.revision}`}
            </strong>
            <p>
              {event.actorName || t`Former finance operator`} ·{' '}
              <time dateTime={event.createdAt}>
                {new Date(event.createdAt).toLocaleString()}
              </time>
            </p>
            <p>
              {t`Reason`}: {event.reason}
            </p>
            {event.importStatus && (
              <p>
                {t`Import status at this change`}:{' '}
                {labels.status(event.importStatus)}
              </p>
            )}
            {event.reference && (
              <p>
                {t`External import reference`}: {event.reference}
              </p>
            )}
            {event.evidenceUrl &&
              /^https?:\/\//i.test(event.evidenceUrl) &&
              isValidUrl(event.evidenceUrl) && (
                <a href={event.evidenceUrl} target="_blank" rel="noreferrer">
                  <Trans>Recorded import evidence</Trans>
                </a>
              )}
            {event.checksum && (
              <details>
                <summary>
                  <Trans>Recorded file identity</Trans>
                </summary>
                <p>SHA-256: {event.checksum}</p>
              </details>
            )}
            {event.profile ? (
              <FinanceExportProfileDetails profile={event.profile} />
            ) : sourceType === 'PROFILE' ? (
              <p>
                <Trans>
                  The original profile configuration is unavailable for this
                  event.
                </Trans>
              </p>
            ) : null}
          </StyledExportRow>
        ))}
        {candidate.nextBeforeId && (
          <Link to={destination(candidate.nextBeforeId)}>
            <Trans>Earlier export changes</Trans>
          </Link>
        )}
        {beforeId && (
          <Link to={destination(null)}>
            <Trans>Latest export changes</Trans>
          </Link>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
