import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import {
  type DeliveryFinanceExportBatchInput,
  type DeliveryFinanceExportPreviewInput,
  type DeliveryFinanceExportPreviewQuery,
} from '~/generated-metadata/graphql';
import { GET_DELIVERY_FINANCE_EXPORT_PREVIEW } from '@/delivery/finance/export/delivery-finance-export.graphql';
import {
  type FinanceExportDestination,
  type FinanceExportPreview,
} from '@/delivery/finance/export/finance-export.types';
import { FinanceExportBatchForm } from '@/delivery/finance/export/FinanceExportBatchForm';
import { FinanceExportProfileDetails } from '@/delivery/finance/export/FinanceExportProfileDetails';
import {
  FinanceExportExclusions,
  FinanceExportRows,
  FinanceExportTotalsView,
} from '@/delivery/finance/export/FinanceExportReviewRows';
import { StyledExportBoundary } from '@/delivery/finance/export/financeExportStyles';
import { useFinanceExportLabels } from '@/delivery/finance/export/useFinanceExportLabels';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceExportReviewProps = {
  selection: DeliveryFinanceExportPreviewInput;
  enabled: boolean;
  destination: FinanceExportDestination;
  onSave: (input: DeliveryFinanceExportBatchInput) => Promise<boolean>;
  onCancel: () => void;
};
export const FinanceExportReview = ({
  selection,
  enabled,
  destination,
  onSave,
  onCancel,
}: FinanceExportReviewProps) => {
  const { t } = useLingui();
  const labels = useFinanceExportLabels();
  const permission = useWorkflowAccess();
  const { requestAction } = useDeliveryDraftGuard();
  const [cursors, setCursors] = useState<{
    afterRowKey: string | null;
    afterExclusionKey: string | null;
  }>({ afterRowKey: null, afterExclusionKey: null });
  const [formVersion, setFormVersion] = useState(0);
  const [error, setError] = useState('');
  const query = useQuery<DeliveryFinanceExportPreviewQuery>(
    GET_DELIVERY_FINANCE_EXPORT_PREVIEW,
    {
      variables: {
        input: { ...selection, ...cursors },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !enabled || !permission.ready || !permission.canReadFinance,
    },
  );
  const candidate = query.data?.deliveryFinanceExportPreview;
  const available =
    enabled &&
    permission.ready &&
    permission.canReadFinance &&
    !query.error &&
    !query.loading &&
    permission.matches(candidate) &&
    candidate?.profile.id === selection.profileId &&
    candidate?.currency === selection.currency;
  const [lastVerified, setLastVerified] = useState<FinanceExportPreview | null>(
    null,
  );
  if (available && isDefined(candidate) && candidate !== lastVerified)
    setLastVerified(candidate);
  const snapshot = available && isDefined(candidate) ? candidate : lastVerified;
  const recoveryAuthority =
    enabled && permission.ready && permission.canReadFinance;
  const reload = async () => {
    setError('');
    try {
      const response = await query.refetch();
      const next = response.data?.deliveryFinanceExportPreview;
      if (!enabled || !permission.canReadFinance || !permission.matches(next))
        throw new Error();
      setFormVersion((version) => version + 1);
    } catch {
      setError(
        t`The current export sources could not be checked. Your review is kept.`,
      );
    }
  };
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <h3>
          <Trans>Review before handoff</Trans>
        </h3>
        <StyledDeliveryButton
          disabled={query.loading}
          onClick={() => requestAction(() => void reload())}
        >
          <Trans>Refresh export preview</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      <p>
        {selection.currency} ·{' '}
        {selection.serviceMonth
          ? `${t`Service month`}: ${selection.serviceMonth} · ${t`Accounting date`}: ${selection.accountingDate}`
          : `${selection.dateFrom} → ${selection.dateTo}`}
      </p>
      {error && <p role="alert">{error}</p>}
      {!available && (
        <p role={query.error ? 'alert' : 'status'}>
          {query.error
            ? query.error.message.includes('exceeds 2,000 rows or exclusions')
              ? t`This selection exceeds 2,000 rows or excluded sources. Choose a narrower source period; no transactions were truncated.`
              : t`Export sources could not be checked. Saved figures are hidden and your review is kept.`
            : t`Checking current export sources…`}
        </p>
      )}
      {available && isDefined(candidate) && (
        <>
          <p>
            {labels.basis(candidate.basis)} · {t`Reporting date`}:{' '}
            {candidate.businessDate} · {candidate.timezone}
            {!candidate.clockConfirmed
              ? ` · ${t`UTC fallback; reporting calendar not confirmed`}`
              : ''}
          </p>
          <FinanceExportProfileDetails profile={candidate.profile} />
          <FinanceExportTotalsView
            totals={candidate.totals}
            currency={candidate.currency}
            basis={candidate.basis}
          />
          {candidate.errors.map((code) => (
            <p key={code} role="alert">
              {labels.issue(code)}
            </p>
          ))}
          {candidate.warnings.map((code) => (
            <p key={code} role="status">
              {labels.issue(code)}
            </p>
          ))}
          <details>
            <summary>
              <Trans>What this export covers</Trans>
            </summary>
            {candidate.limitations.map((code) => (
              <p key={code}>{labels.issue(code)}</p>
            ))}
          </details>
          <FinanceExportRows
            rows={candidate.rows}
            profile={candidate.profile}
            basis={candidate.basis}
            destination={destination}
          />
          <StyledDeliveryRow>
            {candidate.nextRowKey && (
              <StyledDeliveryButton
                onClick={() =>
                  setCursors({
                    ...cursors,
                    afterRowKey: candidate.nextRowKey ?? null,
                  })
                }
              >
                <Trans>More preview rows</Trans>
              </StyledDeliveryButton>
            )}
            {cursors.afterRowKey && (
              <StyledDeliveryButton
                onClick={() => setCursors({ ...cursors, afterRowKey: null })}
              >
                <Trans>First preview rows</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
          <FinanceExportExclusions
            exclusions={candidate.exclusions}
            basis={candidate.basis}
            currency={candidate.currency}
            serviceMonth={selection.serviceMonth}
          />
          <StyledDeliveryRow>
            {candidate.nextExclusionKey && (
              <StyledDeliveryButton
                onClick={() =>
                  setCursors({
                    ...cursors,
                    afterExclusionKey: candidate.nextExclusionKey ?? null,
                  })
                }
              >
                <Trans>More excluded sources</Trans>
              </StyledDeliveryButton>
            )}
            {cursors.afterExclusionKey && (
              <StyledDeliveryButton
                onClick={() =>
                  setCursors({ ...cursors, afterExclusionKey: null })
                }
              >
                <Trans>First excluded sources</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        </>
      )}
      {snapshot && (
        <StyledExportBoundary
          hidden={!recoveryAuthority}
          disabled={!recoveryAuthority}
        >
          <FinanceExportBatchForm
            key={formVersion}
            snapshot={snapshot}
            selection={selection}
            identity={permission.scope}
            readOnly={!recoveryAuthority}
            previewAvailable={available}
            checking={query.loading}
            onSave={async (input) =>
              recoveryAuthority ? onSave(input) : false
            }
            onCancel={onCancel}
            onReload={() => void reload()}
          />
        </StyledExportBoundary>
      )}
      {!snapshot && (
        <StyledDeliveryButton onClick={onCancel}>
          <Trans>Change source selection</Trans>
        </StyledDeliveryButton>
      )}
    </StyledDeliveryStack>
  );
};
