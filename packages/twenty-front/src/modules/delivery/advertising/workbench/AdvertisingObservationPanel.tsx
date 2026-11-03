import { useEffect, useLayoutEffect, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingReview } from '@/delivery/advertising/workbench/advertising-draft';
import { useAdvertisingCommands } from '@/delivery/advertising/workbench/useAdvertisingCommands';
import { useAdvertisingLabels } from '@/delivery/advertising/workbench/useAdvertisingLabels';
import {
  AdvertisingObservationHistory,
  type AdvertisingObservation,
} from '@/delivery/advertising/workbench/AdvertisingObservationHistory';
import { AdvertisingObservationSource } from '@/delivery/advertising/workbench/AdvertisingObservationSource';
import {
  advertisingObservationCanCompare,
  advertisingObservationInput,
  advertisingObservationIssues,
  advertisingObservationScope,
  type AdvertisingObservationDraft,
} from '@/delivery/advertising/workbench/advertising-observation';
import {
  StyledAdvertisingBoundary,
  StyledAdvertisingFacts,
  StyledAdvertisingText,
} from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { type ObserveDeliveryAdvertisingActionInput } from '~/generated-metadata/graphql';

type AdvertisingObservationPanelProps = {
  state: ReturnType<typeof useAdvertisingContext>;
  review: AdvertisingReview;
  actionId: string;
  requestId: string | null;
  fresh: boolean;
  consumeIntent: () => void;
  enabled: boolean;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onAuthorityLost: () => void;
};
type OwnedObservation = {
  scope: string;
  actorId: string;
  draft: AdvertisingObservationDraft;
  frozen: ObserveDeliveryAdvertisingActionInput | null;
};

export const AdvertisingObservationPanel = ({
  state,
  review,
  actionId,
  requestId,
  fresh,
  consumeIntent,
  enabled,
  onClose,
  onSaved,
  onAuthorityLost,
}: AdvertisingObservationPanelProps) => {
  const { t } = useLingui();
  const labels = useAdvertisingLabels();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const action = review.actions.find((item) => item.id === actionId);
  const actor = state.data?.actor;
  const scope = advertisingObservationScope(
    state.source,
    actor,
    review,
    actionId,
    requestId,
  );
  const currentPermission =
    enabled &&
    !state.denied &&
    state.data !== null &&
    review.state === 'ASSIGNED' &&
    action?.task != null &&
    (actor?.isManager === true ||
      action.task.ownerId === state.data.memberId ||
      action.task.reviewerId === state.data.memberId);
  const [owned, setOwned] = useState<OwnedObservation | null>(() =>
    fresh && requestId && state.data
      ? {
          scope,
          actorId: state.data.memberId,
          frozen: null,
          draft: {
            requestId,
            id: crypto.randomUUID(),
            reviewId: review.id,
            actionId,
            correctsId: null,
            assessment: 'INCONCLUSIVE',
            sourceKind: null,
            sourceId: null,
            sourceFingerprint: null,
            metricKey: null,
            metricAdId: null,
            value: null,
            fromDate: '',
            throughDate: '',
            evidence: '',
            note: '',
            mode: 'HUMAN',
            reportTitle: null,
            metricLabel: null,
            metricProvenance: null,
            metricUnit: null,
            sourceAccountId: null,
            sourceTimezone: null,
          },
        }
      : null,
  );
  const [status, setStatus] = useState<
    'EDITING' | 'UNCERTAIN' | 'RETRY' | 'SAVED' | 'CHECK'
  >(owned ? 'EDITING' : 'CHECK');
  const [baseline] = useState(() =>
    owned ? JSON.stringify(owned.draft) : null,
  );
  const [message, setMessage] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);
  useEffect(() => {
    if (requestId) consumeIntent();
  }, [requestId, consumeIntent]);
  const knownLoss =
    owned !== null &&
    ((state.data !== null && owned.scope !== scope) || state.denied);
  useLayoutEffect(() => {
    if (knownLoss) {
      cancelPendingNavigation();
      setOwned(null);
      setStatus('CHECK');
    }
  }, [knownLoss, cancelPendingNavigation]);
  const body = !knownLoss && owned?.scope === scope ? owned : null;
  const available = currentPermission && requestId !== null;
  const loseAuthority = () => {
    cancelPendingNavigation();
    setOwned(null);
    setStatus('CHECK');
    onAuthorityLost();
  };
  const commands = useAdvertisingCommands({
    state,
    scope,
    available,
    onAuthorityLost: loseAuthority,
  });
  useDeliveryDraftStatus({
    dirty:
      owned !== null &&
      status !== 'SAVED' &&
      (owned.frozen !== null || JSON.stringify(owned.draft) !== baseline),
    saving: commands.busy,
  });
  const startRequest = useFinanceExportRequestGuard(scope, available);
  const editing =
    available &&
    body !== null &&
    body.frozen === null &&
    status === 'EDITING' &&
    !commands.busy;
  const update = (change: Partial<AdvertisingObservationDraft>) => {
    if (!editing) return;
    setOwned({ ...body, draft: { ...body.draft, ...change } });
    setMessage('');
  };
  const saved = async () => {
    setStatus('SAVED');
    setMessage(
      t`The saved observation was confirmed. Its evidence is preserved in history.`,
    );
    setHistoryVersion((version) => version + 1);
    try {
      await onSaved();
    } catch {
      setMessage(
        t`The observation was saved, but the latest view could not be refreshed. Close this form and refresh outcomes.`,
      );
    }
  };
  const submit = async () => {
    if (
      !available ||
      !body ||
      commands.busy ||
      !['EDITING', 'RETRY'].includes(status)
    )
      return;
    const input = body.frozen ?? advertisingObservationInput(body.draft);
    if (
      !body.frozen &&
      advertisingObservationIssues(review, body.draft).length
    ) {
      setMessage(
        t`Complete a valid later period, an outcome or explicit unknown, evidence and an interpretation before recording.`,
      );
      return;
    }
    setOwned({ ...body, frozen: input });
    setStatus('UNCERTAIN');
    setMessage(
      t`Saving this exact observation. If the result is interrupted, check the saved request before retrying.`,
    );
    const current = startRequest();
    const receipt = await commands.execute({ kind: 'observe', input });
    if (!current()) return;
    if (receipt) await saved();
    else
      setMessage(
        t`The result could not be confirmed. Your submitted evidence is frozen; check whether this request was saved.`,
      );
  };
  const check = async () => {
    if (!requestId || !available || commands.busy) return;
    const current = startRequest();
    const result = await commands.check(requestId, review.id, 'observe');
    if (!current()) return;
    if (result.kind === 'FOUND') {
      if (
        body?.frozen &&
        (result.receipt.observationId !== body.frozen.id ||
          result.receipt.actorId !== body.actorId)
      ) {
        setMessage(
          t`This receipt does not match the original observation attempt. Close this form and inspect current history.`,
        );
        return;
      }
      await saved();
    } else if (result.kind === 'NOT_FOUND') {
      if (body?.frozen) {
        setStatus('RETRY');
        setMessage(
          t`No saved receipt was found. You may retry the exact frozen observation, or close and start a new deliberate entry.`,
        );
      } else
        setMessage(
          t`No saved receipt was found. The original submitted body is not available in this view, so this request cannot be retried. Close and start a new observation.`,
        );
    } else
      setMessage(
        t`The saved result could not be verified. Keep this request unchanged and check again when current access is available.`,
      );
  };
  const correct = (item: AdvertisingObservation) => {
    if (
      !editing ||
      item.correctedById ||
      item.reviewId !== review.id ||
      item.actionId !== actionId
    )
      return;
    update({
      correctsId: item.id,
      assessment: 'INCONCLUSIVE',
      mode: item.source ? 'REPORT' : 'HUMAN',
      sourceKind: null,
      sourceId: null,
      sourceFingerprint: null,
      metricKey: null,
      metricAdId: null,
      reportTitle: null,
      metricLabel: null,
      metricProvenance: null,
      metricUnit: null,
      sourceAccountId: null,
      sourceTimezone: null,
      value: item.source ? null : (item.value ?? null),
      fromDate: item.source ? '' : item.fromDate,
      throughDate: item.source ? '' : item.throughDate,
      evidence: item.evidence,
      note: '',
    });
    setMessage(
      t`This new entry will correct the selected observation and preserve its original evidence. Explain the correction and reselect any report evidence.`,
    );
  };
  const draft = body?.draft;
  const issues = draft ? advertisingObservationIssues(review, draft) : [];
  const canCompare = draft
    ? advertisingObservationCanCompare(review, draft)
    : false;
  if (!enabled || state.data === null || state.denied)
    return (
      <p role="status">
        <Trans>Verifying current action and outcome access…</Trans>
      </p>
    );
  if (!action)
    return (
      <p role="alert">
        <Trans>This reviewed action is unavailable.</Trans>
      </p>
    );
  return (
    <section
      aria-label={t`Action outcomes`}
      data-advertising-observation-id={body?.draft.id}
      data-advertising-request-id={body?.draft.requestId}
    >
      <StyledDeliveryStack>
        <h2>{action.title}</h2>
        <p>
          <Trans>
            Record what was observed after this work. Task approval and a later
            campaign outcome are separate evidence.
          </Trans>
        </p>
        <StyledAdvertisingFacts>
          <dt>
            <Trans>Original primary goal</Trans>
          </dt>
          <dd>
            {labels.goal(review.goal.kind)} ·{' '}
            {review.goal.metricLabel ?? t`No report metric selected`}
          </dd>
          <dt>
            <Trans>Original result</Trans>
          </dt>
          <dd>
            {labels.count(review.goal.value)}
            {review.goal.metricUnit === 'MONEY'
              ? ` ${review.goal.currency}`
              : ''}{' '}
            · {review.goal.fromDate} – {review.goal.throughDate}
          </dd>
          <dt>
            <Trans>Current task</Trans>
          </dt>
          <dd>
            {action.task
              ? `${labels.taskState(action.task.state)} · ${t`revision ${action.task.revision}`}`
              : t`Task no longer available`}
          </dd>
          <dt>
            <Trans>Original reporting scope</Trans>
          </dt>
          <dd>
            {review.source.accountId ?? t`Account not recorded`} ·{' '}
            {review.source.timezone ?? t`Timezone not recorded`}
          </dd>
          <dt>
            <Trans>Independent submission review</Trans>
          </dt>
          <dd>
            {action.task?.submissionState
              ? labels.taskState(action.task.submissionState)
              : t`No submitted version recorded`}
          </dd>
        </StyledAdvertisingFacts>
        {requestId && (
          <>
            <h3>
              <Trans>Record an outcome observation</Trans>
            </h3>
            {!currentPermission && (
              <p role="alert">
                <Trans>
                  The current task owner, reviewer or project manager must
                  record this outcome. Current assignment access is required.
                </Trans>
              </p>
            )}
            {!body && (
              <p role="status">
                <Trans>
                  This request has no original draft in this view. You can check
                  its saved result or close it; editing and resubmission are
                  unavailable.
                </Trans>
              </p>
            )}
            {draft && (
              <StyledAdvertisingBoundary
                disabled={!editing}
                hidden={!currentPermission}
              >
                <StyledDeliveryStack>
                  {draft.correctsId && (
                    <p>
                      <Trans>
                        This is a correction. The original observation will
                        remain in history.
                      </Trans>
                    </p>
                  )}
                  <label>
                    <Trans>Outcome evidence</Trans>
                    <select
                      value={draft.mode}
                      onChange={(event) =>
                        update({
                          mode:
                            event.target.value === 'REPORT'
                              ? 'REPORT'
                              : 'HUMAN',
                          sourceKind: null,
                          sourceId: null,
                          sourceFingerprint: null,
                          metricKey: null,
                          metricAdId: null,
                          reportTitle: null,
                          metricLabel: null,
                          metricProvenance: null,
                          metricUnit: null,
                          sourceAccountId: null,
                          sourceTimezone: null,
                          value: null,
                          fromDate: '',
                          throughDate: '',
                          assessment: 'INCONCLUSIVE',
                        })
                      }
                    >
                      <option value="HUMAN">{t`Record a human observation`}</option>
                      <option value="REPORT">{t`Use exact evidence from a later report`}</option>
                    </select>
                  </label>
                  {draft.mode === 'REPORT' ? (
                    draft.sourceId ? (
                      <>
                        <p>
                          {draft.reportTitle} · {draft.metricLabel} ·{' '}
                          {labels.count(draft.value)}
                        </p>
                        <p>
                          {draft.fromDate} – {draft.throughDate} ·{' '}
                          {labels.provenance(draft.metricProvenance ?? '')}
                        </p>
                        <p>
                          {draft.sourceAccountId ?? t`Account not recorded`} ·{' '}
                          {draft.sourceTimezone ?? t`Timezone not recorded`}
                        </p>
                        <StyledDeliveryButton
                          type="button"
                          onClick={() =>
                            update({
                              sourceKind: null,
                              sourceId: null,
                              sourceFingerprint: null,
                              metricKey: null,
                              metricAdId: null,
                              value: null,
                              reportTitle: null,
                              metricLabel: null,
                              metricProvenance: null,
                              metricUnit: null,
                              sourceAccountId: null,
                              sourceTimezone: null,
                              fromDate: '',
                              throughDate: '',
                              assessment: 'INCONCLUSIVE',
                            })
                          }
                        >
                          <Trans>Change or recheck report evidence</Trans>
                        </StyledDeliveryButton>
                      </>
                    ) : (
                      editing && (
                        <AdvertisingObservationSource
                          state={state}
                          review={review}
                          enabled={editing}
                          onAuthorityLost={loseAuthority}
                          onSelect={(source, metric) =>
                            update({
                              sourceKind: source.source.kind,
                              sourceId: source.source.id,
                              sourceFingerprint: source.fingerprint,
                              metricKey: metric.key,
                              metricAdId: source.metricAdId ?? null,
                              value: metric.value ?? null,
                              fromDate: source.source.fromDate,
                              throughDate: source.source.throughDate,
                              reportTitle: source.source.title,
                              metricLabel: metric.label,
                              metricProvenance: metric.provenance,
                              metricUnit: metric.unit,
                              sourceAccountId: source.source.accountId ?? null,
                              sourceTimezone: source.source.timezone ?? null,
                              assessment: 'INCONCLUSIVE',
                            })
                          }
                        />
                      )
                    )
                  ) : (
                    <>
                      <p>
                        <Trans>
                          Human evidence is recorded separately from platform
                          attribution. Do not describe a raw lead as qualified
                          without qualification evidence.
                        </Trans>
                      </p>
                      <StyledDeliveryGrid>
                        <label>
                          <Trans>First observed day</Trans>
                          <input
                            type="date"
                            value={draft.fromDate}
                            onChange={(event) =>
                              update({ fromDate: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <Trans>Last observed day</Trans>
                          <input
                            type="date"
                            max={new Date().toISOString().slice(0, 10)}
                            value={draft.throughDate}
                            onChange={(event) =>
                              update({ throughDate: event.target.value })
                            }
                          />
                        </label>
                      </StyledDeliveryGrid>
                      <label>
                        {review.goal.metricUnit === 'MONEY'
                          ? t`Observed amount (${review.goal.currency})`
                          : t`Observed outcome count`}
                        <input
                          inputMode="decimal"
                          value={draft.value ?? ''}
                          maxLength={31}
                          onChange={(event) =>
                            update({
                              value: event.target.value || null,
                              assessment: 'INCONCLUSIVE',
                            })
                          }
                        />
                      </label>
                      <small>
                        <Trans>
                          Leave blank when unknown. Enter 0 only when the
                          evidence explicitly establishes zero.
                        </Trans>
                      </small>
                    </>
                  )}
                  <label>
                    <Trans>Assessment</Trans>
                    <select
                      value={draft.assessment}
                      onChange={(event) =>
                        update({ assessment: event.target.value })
                      }
                    >
                      <option value="INCONCLUSIVE">{t`Inconclusive`}</option>
                      <option
                        value="IMPROVED"
                        disabled={!canCompare}
                      >{t`Improved`}</option>
                      <option
                        value="WORSE"
                        disabled={!canCompare}
                      >{t`Worse`}</option>
                      <option
                        value="UNCHANGED"
                        disabled={!canCompare}
                      >{t`Unchanged`}</option>
                    </select>
                  </label>
                  {!canCompare && (
                    <small>
                      <Trans>
                        Keep the assessment inconclusive when values are unknown
                        or the outcome source, metric, ad, account or reporting
                        timezone differs from the original goal.
                      </Trans>
                    </small>
                  )}
                  <label>
                    <Trans>Evidence and how it was verified</Trans>
                    <textarea
                      maxLength={4000}
                      rows={4}
                      value={draft.evidence}
                      onChange={(event) =>
                        update({ evidence: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <Trans>
                      Interpretation, limitations and correction reason
                    </Trans>
                    <textarea
                      maxLength={4000}
                      rows={4}
                      value={draft.note}
                      onChange={(event) => update({ note: event.target.value })}
                    />
                  </label>
                  <p>
                    <Trans>
                      Recording an observation does not change ads, budgets or
                      the task's approval.
                    </Trans>
                  </p>
                </StyledDeliveryStack>
              </StyledAdvertisingBoundary>
            )}
            {body?.frozen && status !== 'SAVED' && (
              <p>
                <Trans>
                  The submitted observation is frozen. Check its receipt before
                  retrying; a retry sends these same values and the same request
                  identity.
                </Trans>
              </p>
            )}
            {message && (
              <StyledAdvertisingText role="status">
                {message}
              </StyledAdvertisingText>
            )}
            {editing && issues.length > 0 && (
              <p>
                <Trans>
                  Complete the later reporting period, outcome evidence and
                  interpretation. Report observations also require one exact
                  selected metric.
                </Trans>
              </p>
            )}
            <StyledDeliveryRow>
              {editing && (
                <StyledDeliveryButton
                  type="button"
                  disabled={issues.length > 0}
                  onClick={() => void submit()}
                >
                  <Trans>Record observation</Trans>
                </StyledDeliveryButton>
              )}
              {body?.frozen && status === 'RETRY' && (
                <StyledDeliveryButton
                  type="button"
                  disabled={!available || commands.busy}
                  onClick={() => void submit()}
                >
                  <Trans>Retry this exact observation</Trans>
                </StyledDeliveryButton>
              )}
              {(!body || (status !== 'EDITING' && status !== 'SAVED')) && (
                <StyledDeliveryButton
                  type="button"
                  disabled={!available || commands.busy}
                  onClick={() => void check()}
                >
                  <Trans>Check saved observation</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          </>
        )}
        <AdvertisingObservationHistory
          key={`${review.id}:${actionId}:${historyVersion}`}
          state={state}
          review={review}
          actionId={actionId}
          enabled={enabled}
          onAuthorityLost={loseAuthority}
          onCorrect={editing ? correct : undefined}
        />
        <StyledDeliveryButton type="button" onClick={onClose}>
          <Trans>Close outcomes</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </section>
  );
};
