import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import { type AdvertisingSourceEvidence } from '@/delivery/advertising/workbench/AdvertisingEvidence';
import { AdvertisingActionEditor } from '@/delivery/advertising/workbench/AdvertisingActionEditor';
import { AdvertisingDraftPanel } from '@/delivery/advertising/drafts/AdvertisingDraftPanel';
import { advertisingReviewRetainsNavigation } from '@/delivery/advertising/drafts/advertising-draft-retention';
import {
  appendAdvertisingSuggestions,
  appendAdvertisingNoChangeReason,
} from '@/delivery/advertising/drafts/advertising-draft-insertion';
import {
  advertisingDraftInput,
  advertisingDraftRequirements,
  newAdvertisingAction,
  type AdvertisingReviewDraft,
} from '@/delivery/advertising/workbench/advertising-draft';
import { useAdvertisingLabels } from '@/delivery/advertising/workbench/useAdvertisingLabels';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type SaveDeliveryAdvertisingReviewInput } from '~/generated-metadata/graphql';

type AdvertisingReviewFormProps = {
  initial: AdvertisingReviewDraft;
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  source: AdvertisingSourceEvidence;
  scope: string;
  enabled: boolean;
  busy: boolean;
  readOnly: boolean;
  stale: boolean;
  onSave: (input: SaveDeliveryAdvertisingReviewInput) => Promise<boolean>;
};
export const AdvertisingReviewForm = ({
  initial,
  state,
  selection,
  source,
  scope,
  enabled,
  busy,
  readOnly,
  stale,
  onSave,
}: AdvertisingReviewFormProps) => {
  const { t } = useLingui();
  const labels = useAdvertisingLabels();
  const [params] = useSearchParams();
  const [aiInsertions, setAiInsertions] = useState<string[]>([]);
  const onApplyingChange = useCallback(
    (id: string, active: boolean) =>
      setAiInsertions((current) =>
        active
          ? current.includes(id)
            ? current
            : [...current, id]
          : current.filter((item) => item !== id),
      ),
    [],
  );
  const aiCommitBlocked =
    params.has('adDraftRequest') ||
    params.has('adDraftCancelRequest') ||
    aiInsertions.length > 0;
  const retainsNavigation = useMemo(
    () =>
      advertisingReviewRetainsNavigation({
        sourceKind: initial.sourceKind,
        sourceId: initial.sourceId,
        reviewId: initial.id,
        requestId: initial.requestId,
      }),
    [initial.sourceKind, initial.sourceId, initial.id, initial.requestId],
  );
  const draft = useDeliveryDraft({
    initialValues: initial,
    revision: initial.revision,
    busy,
    retainsNavigation,
  });
  const values = draft.values;
  const update = (next: AdvertisingReviewDraft) => draft.update(next);
  const issues = advertisingDraftRequirements(values);
  const sourceChanged = values.sourceFingerprint !== source.fingerprint;
  const evidenceChanged =
    values.evidenceFingerprint !== source.evidenceFingerprint;
  // oxlint-disable-next-line twenty/no-state-useref -- A fresh async AI verification must append to the latest manual draft, never replace edits captured before the request.
  const currentDraft = useRef({
    values,
    source,
    enabled,
    busy,
    readOnly,
    stale,
  });
  useLayoutEffect(() => {
    currentDraft.current = { values, source, enabled, busy, readOnly, stale };
  }, [values, source, enabled, busy, readOnly, stale]);
  const issueLabels: Record<string, string> = {
    GOAL: t`Choose the business outcome to review.`,
    NOTE: t`Explain the recommendation review.`,
    ACTIONS_OR_NO_CHANGE: t`Add a recommendation or explicitly choose no changes.`,
    HUMAN_EVIDENCE: t`Add evidence for a human-provided outcome.`,
    NO_CHANGE_REASON: t`Keep an explicit explanation for why no changes are needed.`,
    VALUE: t`Use a nonnegative outcome value, or leave it unknown.`,
    TARGET_COST: t`Use a valid target for count outcomes; revenue has no target cost per outcome.`,
    LEGACY_HANDLING: t`Decide how the existing follow-up will be handled and explain additional work.`,
    ACTION_FIELDS: t`Complete each action's title, reason, expected result, evidence, owner, reviewer and due date.`,
    INDEPENDENT_REVIEW: t`Each action needs a reviewer different from its owner.`,
    MAX_ACTIONS: t`Keep this review to at most 20 recommendations.`,
  };
  const metricOptions = source.metrics.filter((metric) =>
    metric.goalKinds.includes(values.goal.kind),
  );
  const selectedMetric = source.metrics.find(
    (metric) =>
      metric.key === values.goal.metricKey &&
      (source.metricAdId ?? null) === (values.goal.metricAdId ?? null),
  );
  const legacy = source.legacyTask;
  const adoptable = Boolean(
    legacy &&
    legacy.ownerId &&
    legacy.ownerName &&
    legacy.reviewerName &&
    legacy.ownerId !== legacy.reviewerId &&
    legacy.dueAt &&
    Number.isFinite(Date.parse(legacy.dueAt)) &&
    !source.legacyAdoptedReviewId,
  );
  const chooseLegacyHandling = (mode: string) => {
    const otherActions = values.actions.filter((action) => !action.adoptTaskId);
    if (mode === 'ADOPT' && adoptable && legacy?.ownerId && legacy.dueAt) {
      const linked = {
        ...newAdvertisingAction(source),
        title: legacy.title,
        ownerId: legacy.ownerId,
        ownerName: legacy.ownerName ?? '',
        reviewerId: legacy.reviewerId,
        reviewerName: legacy.reviewerName ?? '',
        dueDate: legacy.dueAt.slice(0, 10),
        adoptTaskId: legacy.id,
      };
      update({
        ...values,
        noChanges: false,
        actions: [linked, ...otherActions],
        legacyHandling: {
          mode,
          taskId: legacy.id,
          taskRevision: legacy.revision,
          taskState: legacy.state,
          reason: '',
        },
      });
    } else
      update({
        ...values,
        actions: otherActions,
        legacyHandling: {
          mode,
          taskId: mode === 'NONE' ? null : (legacy?.id ?? null),
          taskRevision: mode === 'NONE' ? null : (legacy?.revision ?? null),
          taskState: mode === 'NONE' ? null : (legacy?.state ?? null),
          reason: '',
        },
      });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !enabled ||
      busy ||
      readOnly ||
      stale ||
      sourceChanged ||
      aiCommitBlocked ||
      issues.length > 0
    )
      return;
    draft.setSaving(true);
    try {
      if (await onSave(advertisingDraftInput(values))) draft.markSaved();
    } finally {
      draft.setSaving(false);
    }
  };
  return (
    <form
      aria-label={t`Advertising recommendation draft`}
      data-advertising-review-id={values.id}
      data-advertising-request-id={values.requestId}
      data-source-fingerprint={values.sourceFingerprint}
      data-review-revision={values.revision}
      onSubmit={submit}
    >
      {sourceChanged && (
        <StyledDeliveryStack>
          <p role="alert">
            {evidenceChanged
              ? t`The report evidence changed. Inspect the current evidence, then review the outcome again before saving.`
              : t`Reporting responsibilities changed. Recheck the people and due dates before saving.`}
          </p>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || busy || readOnly || stale}
            onClick={() =>
              update({
                ...values,
                sourceFingerprint: source.fingerprint,
                evidenceFingerprint: source.evidenceFingerprint,
                targetCost: evidenceChanged ? '' : values.targetCost,
                goal: evidenceChanged
                  ? {
                      ...values.goal,
                      metricKey: null,
                      metricAdId: null,
                      value: null,
                      evidence: '',
                      metricLabel: null,
                    }
                  : values.goal,
              })
            }
          >
            {evidenceChanged
              ? t`Use current evidence and review again`
              : t`Reconfirm current responsibilities`}
          </StyledDeliveryButton>
        </StyledDeliveryStack>
      )}
      <fieldset disabled={!enabled || busy || readOnly || stale}>
        <StyledDeliveryStack>
          <h3>
            <Trans>Prepare recommendations</Trans>
          </h3>
          <StyledDeliveryGrid>
            <label>
              <Trans>Business outcome</Trans>
              <select
                name="goalKind"
                value={values.goal.kind}
                onChange={(event) => {
                  const kind = event.target.value;
                  update({
                    ...values,
                    targetCost: kind === 'SALES' ? '' : values.targetCost,
                    goal: {
                      ...values.goal,
                      kind,
                      metricKey: null,
                      metricAdId: null,
                      value: null,
                      metricLabel: null,
                      metricUnit: kind === 'SALES' ? 'MONEY' : 'COUNT',
                    },
                  });
                }}
              >
                <option value="">{t`Choose an outcome`}</option>
                {[
                  'PURCHASES',
                  'LEADS',
                  'QUALIFIED_LEADS',
                  'BOOKED_CALLS',
                  'REGISTRATIONS',
                  'SALES',
                ].map((kind) => (
                  <option key={kind} value={kind}>
                    {labels.goal(kind)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Trans>Outcome evidence</Trans>
              <select
                name="goalProvenance"
                value={values.goal.provenance}
                onChange={(event) =>
                  update({
                    ...values,
                    goal: {
                      ...values.goal,
                      provenance: event.target.value,
                      metricKey: null,
                      metricAdId: null,
                      value: null,
                      metricLabel: null,
                    },
                  })
                }
              >
                <option value="REPORT">{t`Choose a metric from this report`}</option>
                <option value="HUMAN">{t`Human-provided outcome with evidence`}</option>
              </select>
            </label>
          </StyledDeliveryGrid>
          {values.goal.provenance === 'REPORT' ? (
            <>
              <label>
                <Trans>Exact reported metric</Trans>
                <select
                  name="goalMetric"
                  data-metric-ad-id={values.goal.metricAdId ?? ''}
                  value={values.goal.metricKey ?? ''}
                  onChange={(event) => {
                    const metric = metricOptions.find(
                      (item) => item.key === event.target.value,
                    );
                    update({
                      ...values,
                      goal: {
                        ...values.goal,
                        metricKey: metric?.key ?? null,
                        metricAdId: metric ? (source.metricAdId ?? null) : null,
                        value: metric?.value ?? null,
                        metricLabel: metric?.label ?? null,
                        metricUnit:
                          metric?.unit ??
                          (values.goal.kind === 'SALES' ? 'MONEY' : 'COUNT'),
                      },
                    });
                  }}
                >
                  <option value="">{t`Not mapped — outcome unknown`}</option>
                  {values.goal.metricKey && !selectedMetric && (
                    <option value={values.goal.metricKey}>
                      {values.goal.metricLabel ?? t`Previously reviewed metric`}
                    </option>
                  )}
                  {metricOptions.map((metric) => (
                    <option key={metric.key} value={metric.key}>
                      {metric.label} · {labels.count(metric.value)}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {t`Reported value`}: {labels.count(values.goal.value)}
                {values.goal.metricUnit === 'MONEY'
                  ? ` ${source.source.currency}`
                  : ''}
              </p>
              <small>
                <Trans>
                  Metrics are kept separate. Raw lead events are not verified
                  qualified leads. Inspect report evidence above to choose an
                  exact ad's metric.
                </Trans>
              </small>
            </>
          ) : (
            <>
              <label>
                <Trans>
                  Human-provided outcome value (leave blank if unknown)
                </Trans>
                <input
                  name="goalValue"
                  inputMode="decimal"
                  maxLength={31}
                  value={values.goal.value ?? ''}
                  onChange={(event) =>
                    update({
                      ...values,
                      goal: {
                        ...values.goal,
                        value: event.target.value || null,
                      },
                    })
                  }
                />
              </label>
              <label>
                <Trans>Evidence for this outcome</Trans>
                <textarea
                  name="goalEvidence"
                  required
                  rows={3}
                  maxLength={4000}
                  value={values.goal.evidence}
                  onChange={(event) =>
                    update({
                      ...values,
                      goal: { ...values.goal, evidence: event.target.value },
                    })
                  }
                />
              </label>
            </>
          )}
          {values.goal.metricUnit !== 'MONEY' && (
            <label>
              <Trans>Target cost per outcome (optional)</Trans>
              <input
                name="targetCost"
                inputMode="decimal"
                maxLength={25}
                value={values.targetCost}
                onChange={(event) =>
                  update({ ...values, targetCost: event.target.value })
                }
              />
              <small>{source.source.currency}</small>
            </label>
          )}
          <AdvertisingDraftPanel
            state={state}
            selection={selection}
            sourceFingerprint={source.fingerprint}
            projectId={source.source.projectId ?? null}
            scope={scope}
            enabled={enabled && !busy && !readOnly && !stale && !sourceChanged}
            review={{
              id: values.id,
              requestId: values.requestId,
              goal: advertisingDraftInput(values).goal,
              goalReady:
                !issues.some((issue) =>
                  ['GOAL', 'HUMAN_EVIDENCE', 'VALUE', 'TARGET_COST'].includes(
                    issue,
                  ),
                ) && values.goal.metricAdId == null,
              actionCount: values.actions.length,
              onApplyingChange,
              origins: values.actions.flatMap((action) =>
                action.origin
                  ? [
                      {
                        runId: action.origin.runId,
                        suggestionId: action.origin.suggestionId,
                      },
                    ]
                  : [],
              ),
              onInsert: (detail, ids) => {
                const current = currentDraft.current;
                if (
                  !current.enabled ||
                  current.busy ||
                  current.readOnly ||
                  current.stale
                )
                  return false;
                const next = appendAdvertisingSuggestions(
                  current.values,
                  current.source,
                  detail,
                  ids,
                );
                if (!next) return false;
                draft.update(next);
                return true;
              },
              onNoChange: (detail) => {
                const current = currentDraft.current;
                if (
                  !current.enabled ||
                  current.busy ||
                  current.readOnly ||
                  current.stale
                )
                  return false;
                const next = appendAdvertisingNoChangeReason(
                  current.values,
                  current.source,
                  detail,
                );
                if (!next) return false;
                draft.update(next);
                return true;
              },
            }}
          />
          {source.legacyTaskId && (
            <StyledDeliveryStack>
              <h4>
                <Trans>Existing follow-up</Trans>
              </h4>
              <p>
                {legacy?.title ??
                  t`The existing task is currently unavailable.`}
              </p>
              {source.legacyAdoptedReviewId && (
                <p>
                  <Trans>
                    This task is already linked to an earlier reviewed plan.
                    Keep it separate and explain how this review relates to it.
                  </Trans>
                </p>
              )}
              <label>
                <Trans>How should the existing follow-up be handled?</Trans>
                <select
                  name="legacyMode"
                  value={values.legacyHandling.mode}
                  onChange={(event) => chooseLegacyHandling(event.target.value)}
                >
                  <option value="">{t`Choose deliberately`}</option>
                  <option
                    value="ADOPT"
                    disabled={!adoptable}
                  >{t`Link the existing task without changing it`}</option>
                  <option value="ADDITIONAL_WORK">{t`Keep it separate and explain this review`}</option>
                </select>
              </label>
              {!adoptable && (
                <p>
                  <Trans>
                    Linking requires an active owner, an independent reviewer
                    and an existing deadline. You can keep the task separate and
                    explain additional work.
                  </Trans>
                </p>
              )}
              {values.legacyHandling.mode === 'ADDITIONAL_WORK' && (
                <label>
                  <Trans>
                    How does this review relate to the existing follow-up?
                  </Trans>
                  <textarea
                    name="legacyReason"
                    required
                    rows={3}
                    maxLength={2000}
                    value={values.legacyHandling.reason}
                    onChange={(event) =>
                      update({
                        ...values,
                        legacyHandling: {
                          ...values.legacyHandling,
                          reason: event.target.value,
                        },
                      })
                    }
                  />
                </label>
              )}
            </StyledDeliveryStack>
          )}
          <label>
            <input
              name="noChanges"
              type="checkbox"
              disabled={values.actions.length > 0}
              checked={values.noChanges}
              onChange={(event) =>
                update({ ...values, noChanges: event.target.checked })
              }
            />
            <Trans>No changes are recommended for this report</Trans>
          </label>
          <label>
            {values.noChanges && !values.separateNoChangeReason
              ? t`Why no changes are needed`
              : t`Recommendation review summary`}
            <textarea
              name="reviewNote"
              required
              rows={3}
              maxLength={4000}
              value={values.note}
              onChange={(event) =>
                update({ ...values, note: event.target.value })
              }
            />
          </label>
          {values.noChanges && values.separateNoChangeReason && (
            <label>
              <Trans>Why no changes are needed</Trans>
              <textarea
                name="noChangeReason"
                required
                rows={3}
                maxLength={4000}
                value={values.noChangeReason}
                onChange={(event) =>
                  update({ ...values, noChangeReason: event.target.value })
                }
              />
            </label>
          )}
          {values.actions.map((action, index) => (
            <AdvertisingActionEditor
              key={action.id}
              state={state}
              selection={selection}
              scope={scope}
              action={action}
              position={index + 1}
              disabled={!enabled || busy || readOnly || stale}
              onChange={(next) =>
                update({
                  ...values,
                  actions: values.actions.map((item) =>
                    item.id === action.id ? next : item,
                  ),
                })
              }
              onRemove={() =>
                update({
                  ...values,
                  actions: values.actions.filter(
                    (item) => item.id !== action.id,
                  ),
                  legacyHandling: action.adoptTaskId
                    ? {
                        ...values.legacyHandling,
                        mode: '',
                        taskId: null,
                        taskRevision: null,
                        taskState: null,
                      }
                    : values.legacyHandling,
                })
              }
            />
          ))}
          <StyledDeliveryButton
            type="button"
            disabled={values.actions.length >= 20}
            onClick={() =>
              update({
                ...values,
                noChanges: false,
                actions: [...values.actions, newAdvertisingAction(source)],
              })
            }
          >
            <Trans>Add recommendation</Trans>
          </StyledDeliveryButton>
          {issues.length > 0 && (
            <div aria-label={t`Recommendation requirements`}>
              <ul>
                {issues.map((issue) => (
                  <li key={issue}>{issueLabels[issue]}</li>
                ))}
              </ul>
            </div>
          )}
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={
              issues.length > 0 ||
              stale ||
              sourceChanged ||
              !enabled ||
              busy ||
              readOnly ||
              aiCommitBlocked
            }
          >
            {draft.saving ? t`Saving…` : t`Save recommendations for review`}
          </StyledDeliveryButton>
          {aiCommitBlocked && (
            <p role="status">
              <Trans>
                Finish or close the AI preparation or cancellation before saving
                recommendations. Existing manual text is kept.
              </Trans>
            </p>
          )}
          <small>
            <Trans>
              Saving keeps a draft. You will review the recipients and evidence
              before assigning work.
            </Trans>
          </small>
        </StyledDeliveryStack>
      </fieldset>
    </form>
  );
};
