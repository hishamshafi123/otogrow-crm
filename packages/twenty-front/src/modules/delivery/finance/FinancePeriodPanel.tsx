import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import {
  type ChangeDeliveryFinancePeriodMutation,
  type DeliveryFinancePeriodChangeInput,
  type DeliveryFinancePeriodQuery,
} from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  CHANGE_DELIVERY_FINANCE_PERIOD,
  GET_DELIVERY_FINANCE_PERIOD,
} from '@/delivery/finance/delivery-finance-period.graphql';
import {
  type FinancePeriodSnapshot,
  type FinancePeriodState,
} from '@/delivery/finance/finance-period.types';
import { FinancePeriodReviewForm } from '@/delivery/finance/FinancePeriodReviewForm';
import { FinancePeriodHistory } from '@/delivery/finance/FinancePeriodHistory';
import { FinancePeriodSummary } from '@/delivery/finance/FinancePeriodSummary';
import { useFinancePeriodLabels } from '@/delivery/finance/useFinancePeriodLabels';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinancePeriodPanelProps = {
  month: string;
  period: FinancePeriodState | undefined;
  available: boolean;
  busy: boolean;
  canManage: boolean;
  onStartReview: (open: () => void) => void;
  onChanged: () => Promise<unknown>;
};
const StyledPeriodBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;

export const FinancePeriodPanel = ({
  month,
  period,
  available,
  busy,
  canManage,
  onStartReview,
  onChanged,
}: FinancePeriodPanelProps) => {
  const { t } = useLingui();
  const labels = useFinancePeriodLabels();
  const permission = useWorkflowAccess();
  const { requestAction } = useDeliveryDraftGuard();
  const [params] = useSearchParams();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSeed, setReviewSeed] = useState<FinancePeriodSnapshot | null>(
    null,
  );
  // oxlint-disable-next-line twenty/no-state-useref -- Late previews must be rejected synchronously after closing; this token does not render UI.
  const reviewSession = useRef(0);
  const [intent, setIntent] = useState<'LOCK' | 'REOPEN' | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(() =>
    params.has('financePeriodHistoryBefore'),
  );
  const [historyVersion, setHistoryVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastResult, setLastResult] = useState<FinancePeriodState | null>(null);
  const query = useQuery<DeliveryFinancePeriodQuery>(
    GET_DELIVERY_FINANCE_PERIOD,
    {
      variables: {
        input: {
          month,
          afterBlockerId: params.get('financePeriodBlockersAfter'),
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip:
        !reviewOpen ||
        !available ||
        !permission.ready ||
        !permission.canReadFinance,
    },
  );
  const [change] = useMutation<ChangeDeliveryFinancePeriodMutation>(
    CHANGE_DELIVERY_FINANCE_PERIOD,
  );
  const candidate = query.data?.deliveryFinancePeriod;
  const verified =
    available &&
    permission.ready &&
    permission.canReadFinance &&
    !query.error &&
    permission.matches(candidate) &&
    candidate?.period.month === month;
  const [lastVerified, setLastVerified] =
    useState<FinancePeriodSnapshot | null>(null);
  if (verified && isDefined(candidate) && candidate !== lastVerified)
    setLastVerified(candidate);
  const data = reviewSeed
    ? verified && isDefined(candidate)
      ? candidate
      : (lastVerified ?? reviewSeed)
    : null;
  const current = [
    period,
    lastResult,
    verified ? candidate?.period : null,
  ].reduce<FinancePeriodState | undefined>(
    (latest, value) =>
      !value || value.month !== month
        ? latest
        : !latest || value.revision >= latest.revision
          ? value
          : latest,
    undefined,
  );
  const statusAvailable =
    available &&
    permission.ready &&
    permission.canReadFinance &&
    current?.month === month;
  const editable =
    canManage && permission.canManageFinance && data?.canManage === true;
  const changing = busy || saving;
  const closeReview = () => {
    reviewSession.current += 1;
    setReviewOpen(false);
    setReviewSeed(null);
    setIntent(null);
  };
  const refreshReview = async (session: number) => {
    try {
      const response = await query.refetch();
      const preview = response.data?.deliveryFinancePeriod;
      if (!permission.matches(preview) || preview?.period.month !== month)
        throw new Error();
      if (reviewSession.current !== session) return;
      setLastVerified(preview);
      setReviewSeed(preview);
      setError('');
      setIntent(
        canManage
          ? preview.period.status === 'LOCKED'
            ? 'REOPEN'
            : 'LOCK'
          : null,
      );
    } catch {
      if (reviewSession.current === session)
        setError(
          t`The latest month review could not be checked. Refresh before reviewing its status.`,
        );
    }
  };
  const openReview = () =>
    onStartReview(() => {
      reviewSession.current += 1;
      setReviewOpen(true);
      setReviewSeed(null);
      setIntent(null);
      setFormVersion((value) => value + 1);
      setError('');
      setNotice('');
      void refreshReview(reviewSession.current);
    });
  const destination = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    return `/delivery?${next}`;
  };
  const save = async (input: DeliveryFinancePeriodChangeInput) => {
    if (!verified || !editable || changing) return false;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await change({ variables: { input } });
      const result = response.data?.changeDeliveryFinancePeriod;
      if (!result)
        throw new Error(t`The month’s saved status was not confirmed.`);
      setLastResult(result.period);
      const refreshed = await Promise.allSettled([
        query.refetch(),
        onChanged(),
      ]);
      closeReview();
      setHistoryVersion((value) => value + 1);
      setNotice(
        result.replayed
          ? t`This earlier request was already processed. Current month status: ${labels.status(result.period.status)}.`
          : result.period.status === 'LOCKED'
            ? t`Monthly results locked. Actual payments and evidence remain available.`
            : t`Monthly results reopened. Review and lock the month again after the intended corrections.`,
      );
      if (refreshed.some((item) => item.status === 'rejected'))
        setError(
          t`Saved, but the latest month could not refresh. Refresh before another change.`,
        );
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`The month’s status could not be changed. Your reason is kept.`,
      );
      return false;
    } finally {
      setSaving(false);
    }
  };
  const reload = async () => {
    try {
      const response = await query.refetch();
      if (
        !permission.matches(response.data?.deliveryFinancePeriod) ||
        response.data?.deliveryFinancePeriod.period.month !== month
      )
        throw new Error();
      setFormVersion((value) => value + 1);
    } catch {
      setError(
        t`The latest preview could not be checked. Your reason and review are kept.`,
      );
    }
  };
  return (
    <StyledDeliveryCard>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <StyledPeriodBoundary
        hidden={!statusAvailable}
        disabled={!statusAvailable || changing}
      >
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <strong>
              <Trans>Monthly result status</Trans>: {month}
            </strong>
            <StyledDeliveryBadge>
              {labels.status(current?.status ?? '')}
            </StyledDeliveryBadge>
            <StyledDeliveryButton type="button" onClick={openReview}>
              {!canManage
                ? t`Review month`
                : current?.status === 'LOCKED'
                  ? t`Review reopening`
                  : t`Review and lock month`}
            </StyledDeliveryButton>
          </StyledDeliveryRow>
          {current?.changedAt && (
            <small>
              {t`Last changed by`}{' '}
              {current.changedByName || t`Former finance operator`} ·{' '}
              {new Date(current.changedAt).toLocaleString()}
            </small>
          )}
          {current?.reason && <p>{current.reason}</p>}
          <small>
            <Trans>
              This protects recorded results only. Payments and matching remain
              available.
            </Trans>
          </small>
        </StyledDeliveryStack>
      </StyledPeriodBoundary>
      {reviewOpen && (!reviewSeed || !verified) && (
        <p role={query.error ? 'alert' : 'status'}>
          {query.error || data
            ? t`The month’s review could not be checked. Saved figures are hidden and your reason is kept.`
            : t`Loading month review…`}{' '}
          <StyledDeliveryButton
            type="button"
            disabled={changing || query.loading}
            onClick={() =>
              void (reviewSeed
                ? query.refetch().catch(() => undefined)
                : refreshReview(reviewSession.current))
            }
          >
            <Trans>Refresh month review</Trans>
          </StyledDeliveryButton>
        </p>
      )}
      {reviewOpen && (!reviewSeed || !verified) && (
        <StyledDeliveryButton
          type="button"
          disabled={changing}
          onClick={() => requestAction(closeReview)}
        >
          <Trans>Discard month review</Trans>
        </StyledDeliveryButton>
      )}
      <StyledPeriodBoundary
        hidden={!reviewOpen || !reviewSeed || !verified}
        disabled={!reviewOpen || !reviewSeed || !verified || changing}
      >
        {data && (
          <StyledDeliveryStack>
            <StyledDeliveryRow>
              <h3>
                <Trans>Review recorded monthly results</Trans>
              </h3>
              <StyledDeliveryButton
                type="button"
                disabled={changing || query.loading}
                onClick={() => void query.refetch().catch(() => undefined)}
              >
                <Trans>Refresh month review</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
            <p>
              <Trans>
                Every currency in this month is included, regardless of the
                current results filter. Review each currency separately.
              </Trans>
            </p>
            <FinancePeriodSummary summaries={data.summaries} showProjects />
            <section aria-label={t`Blocking drafts and corrections`}>
              <h4>{t`Unresolved drafts and corrections (${data.blockerCount})`}</h4>
              {!data.blockerCount && (
                <p>
                  <Trans>
                    No recorded drafts or cross-month corrections block this
                    review.
                  </Trans>
                </p>
              )}
              {data.blockers.map((blocker) => (
                <p key={blocker.entryId}>
                  <strong>{blocker.title}</strong> · {blocker.month} ·{' '}
                  {labels.blocker(blocker.reason)}{' '}
                  <Link
                    to={`/delivery?view=finance&financeView=monthly&financeMonth=${blocker.month}&financeEntry=${encodeURIComponent(blocker.entryId)}`}
                  >
                    <Trans>Review blocking entry</Trans>
                  </Link>
                </p>
              ))}
              {data.nextBlockerId && (
                <Link
                  to={destination(
                    'financePeriodBlockersAfter',
                    data.nextBlockerId,
                  )}
                >
                  <Trans>More blocking entries</Trans>
                </Link>
              )}
              {params.has('financePeriodBlockersAfter') && (
                <Link to={destination('financePeriodBlockersAfter', null)}>
                  <Trans>First blocking entries</Trans>
                </Link>
              )}
            </section>
            <details>
              <summary>
                <Trans>Review limitations</Trans>
              </summary>
              <ul>
                {data.limitations.map((limitation) => (
                  <li key={limitation}>{labels.limitation(limitation)}</li>
                ))}
              </ul>
            </details>
            {intent ? (
              <FinancePeriodReviewForm
                key={`${intent}:${formVersion}`}
                snapshot={data}
                intent={intent}
                busy={changing}
                checking={query.loading}
                readOnly={!verified || !editable}
                onSave={save}
                onCancel={closeReview}
                onReload={() => void reload()}
              />
            ) : (
              <StyledDeliveryButton type="button" onClick={closeReview}>
                <Trans>Close month review</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryStack>
        )}
      </StyledPeriodBoundary>
      <StyledPeriodBoundary
        hidden={!statusAvailable}
        disabled={!statusAvailable || changing}
      >
        <details
          open={historyOpen}
          onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
        >
          <summary>
            <Trans>Lock and reopen history</Trans>
          </summary>
          {historyOpen && (
            <FinancePeriodHistory
              key={historyVersion}
              month={month}
              enabled={statusAvailable}
            />
          )}
        </details>
      </StyledPeriodBoundary>
    </StyledDeliveryCard>
  );
};
