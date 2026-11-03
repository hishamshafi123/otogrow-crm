import { useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { GET_ADVERTISING_SOURCE } from '@/delivery/advertising/workbench/advertising-sources.graphql';
import { useAdvertisingLabels } from '@/delivery/advertising/workbench/useAdvertisingLabels';
import { useCreativeLearningCommands } from '@/delivery/creative/learning/useCreativeLearningCommands';
import {
  isCreativeLearningSourceLost,
  type useCreativeLearningAccess,
} from '@/delivery/creative/learning/useCreativeLearningAccess';
import { learningBodyInput } from '@/delivery/creative/learning/creative-learning-command';
import { CreativeLearningAttempt } from '@/delivery/creative/learning/CreativeLearningAttempt';
import {
  CreativeLearningComponents,
  areDeclaredLearningComponentsCurrent,
} from '@/delivery/creative/learning/CreativeLearningComponents';
import { CreativeLearningEvidence } from '@/delivery/creative/learning/CreativeLearningEvidence';
import { GET_LEARNING_CHOICES } from '@/delivery/creative/learning/delivery-creative-learning.graphql';
import { closeLearningPreparation } from '@/delivery/creative/learning/creative-learning-navigation';
import {
  type CreativeLearningIntent,
  type CreativeLearningLink,
  type CreativeLearningBody,
  type CreativeLearningReceipt,
} from '@/delivery/creative/learning/creative-learning.types';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryCreativeAdLinkPreviewInput,
  type DeliveryCreativeAdLinkChoicesQuery,
  type DeliveryAdvertisingSourceQuery,
} from '~/generated-metadata/graphql';
type CreativeLearningEditorProps = {
  state: ReturnType<typeof useCreativeLearningAccess>;
  projectId: string;
  sourceId: string;
  adId: string;
  id: string;
  requestId: string;
  intent: CreativeLearningIntent | null;
  consumeIntent: (id: string) => void;
  existing: CreativeLearningLink | null;
  currentRevision: number | null;
  canEdit: boolean;
  enabled: boolean;
  onDenied: () => void;
  onSaved: (value: CreativeLearningReceipt) => void;
};
export const CreativeLearningEditor = ({
  state,
  projectId,
  sourceId,
  adId,
  id,
  requestId,
  intent,
  consumeIntent,
  existing,
  currentRevision,
  canEdit,
  enabled,
  onDenied,
  onSaved,
}: CreativeLearningEditorProps) => {
  const { t } = useLingui();
  const labels = useAdvertisingLabels();
  const [params] = useSearchParams();
  const focus = useAssistantPanelFocus();
  const [owned] = useState(
    () =>
      intent?.id === id &&
      intent.requestId === requestId &&
      ['new', 'edit'].includes(intent.mode),
  );
  useLayoutEffect(() => consumeIntent(requestId), [requestId, consumeIntent]);
  const [opened] = useState(() => ({
    revision: existing?.link.revision ?? 0,
    version: existing?.selectedVersion ?? 0,
  }));
  const [body, setBody] = useState<DeliveryCreativeAdLinkPreviewInput>(() =>
    existing
      ? learningBodyInput(existing.body)
      : {
          projectId,
          sourceId,
          adId,
          taskId: '',
          submissionVersion: 1,
          assetId: '',
          goal: {
            kind: '',
            metricKey: null,
            metricAdId: adId,
            provenance: 'REPORT',
            value: null,
            evidence: '',
            targetCostMicros: null,
          },
          declaredComponents: [],
          declaredCopy: null,
          associationEvidence: '',
          evidenceUrl: '',
          note: '',
          correctsId: params.get('learningCorrects'),
        },
  );
  const [confirmedSave, setConfirmedSave] = useState(false);
  const [prepared, setPrepared] = useState<CreativeLearningBody | null>(null),
    [after, setAfter] = useState<string | null>(null);
  const sourceKey = `${state.source}:${sourceId}:${adId}`;
  const sourceQuery = useQuery<DeliveryAdvertisingSourceQuery>(
    GET_ADVERTISING_SOURCE,
    {
      variables: {
        input: { kind: 'META', id: sourceId, metricAdId: adId },
        identity: sourceKey,
      },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: !enabled || !owned,
    },
  );
  const source = useAssistantRead({
    value: sourceQuery.data?.deliveryAdvertisingSource,
    source: sourceKey,
    enabled: enabled && owned,
    loading: sourceQuery.loading,
    error: sourceQuery.error,
    networkStatus: sourceQuery.networkStatus,
    matches: (value) =>
      state.matches(value) &&
      value.source.id === sourceId &&
      value.source.kind === 'META' &&
      value.metricAdId === adId,
  });
  const choiceInput = {
    projectId,
    sourceId,
    adId,
    after,
    ...(body.taskId && body.assetId
      ? {
          selectedTaskId: body.taskId,
          selectedSubmissionVersion: body.submissionVersion,
          selectedAssetId: body.assetId,
        }
      : {}),
  };
  const choiceKey = `${sourceKey}:${JSON.stringify(choiceInput)}`;
  const choiceQuery = useQuery<DeliveryCreativeAdLinkChoicesQuery>(
    GET_LEARNING_CHOICES,
    {
      variables: { input: choiceInput, identity: choiceKey },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: !enabled || !owned,
    },
  );
  const choices = useAssistantRead({
    value: choiceQuery.data?.deliveryCreativeAdLinkChoices,
    source: choiceKey,
    enabled: enabled && owned,
    loading: choiceQuery.loading,
    error: choiceQuery.error,
    networkStatus: choiceQuery.networkStatus,
    matches: state.matches,
  });
  const denied =
    isCreativeLearningSourceLost(sourceQuery.error) ||
    isCreativeLearningSourceLost(choiceQuery.error);
  useLayoutEffect(() => {
    if (denied) onDenied();
  }, [denied, onDenied]);
  const commands = useCreativeLearningCommands({
    state,
    scope: `preview:${id}:${requestId}`,
    enabled: enabled && !denied,
    onDenied,
  });
  const update = (changes: Partial<DeliveryCreativeAdLinkPreviewInput>) => {
    setBody((value) => ({ ...value, ...changes }));
    setPrepared(null);
  };
  const stale =
    existing !== null &&
    (currentRevision !== opened.revision ||
      existing.selectedVersion !== opened.version ||
      !canEdit);
  const metric = source.data?.metrics.find(
    (value) => value.key === body.goal.metricKey,
  );
  const goals =
    body.goal.provenance === 'HUMAN'
      ? [
          'PURCHASES',
          'LEADS',
          'QUALIFIED_LEADS',
          'BOOKED_CALLS',
          'REGISTRATIONS',
          'SALES',
        ]
      : (metric?.goalKinds ?? []);
  const selectedComponents = choices.data?.selected;
  const selectedCurrent =
    selectedComponents != null &&
    selectedComponents.taskId === body.taskId &&
    selectedComponents.submissionVersion === body.submissionVersion &&
    selectedComponents.assetId === body.assetId;
  const valid = Boolean(
    selectedCurrent &&
    areDeclaredLearningComponentsCurrent(
      selectedComponents,
      body.declaredComponents,
    ) &&
    body.taskId &&
    body.assetId &&
    body.goal.kind &&
    body.associationEvidence.trim() &&
    (body.goal.provenance !== 'HUMAN' || body.goal.evidence.trim()),
  );
  return (
    <section
      ref={focus}
      tabIndex={-1}
      aria-label={t`Creative association preparation`}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h2>
            <Trans>Associate an ad with an approved creative</Trans>
          </h2>
          <Link
            to={closeLearningPreparation(
              params,
              confirmedSave ? id : (existing?.link.id ?? null),
            )}
          >
            <Trans>Close preparation</Trans>
          </Link>
        </StyledDeliveryRow>
        <p>
          <Trans>
            Choose the exact approved submission. Describe how you know this ad
            used it. Saving a draft does not confirm the association or approve
            the advertising report.
          </Trans>
        </p>
        {stale && !confirmedSave && (
          <p role="alert">
            <Trans>
              This association changed or is no longer editable. Your notes are
              kept; check any submitted request before closing and reopening the
              latest version.
            </Trans>
          </p>
        )}
        <CreativeLearningAttempt
          state={state}
          requestId={requestId}
          linkId={id}
          action="SAVE"
          owned={owned}
          enabled={enabled && !denied}
          onDenied={onDenied}
          onSaved={(value) => {
            setConfirmedSave(true);
            onSaved(value);
          }}
        >
          {({ execute, busy, locked }) => (
            <StyledDeliveryStack>
              {!source.data || !choices.data ? (
                <div
                  role={
                    sourceQuery.error || choiceQuery.error ? 'alert' : 'status'
                  }
                >
                  <Trans>
                    Current advertising evidence and approved submissions must
                    be checked before editing.
                  </Trans>
                  <StyledDeliveryButton
                    type="button"
                    onClick={() =>
                      void Promise.allSettled([
                        sourceQuery.refetch(),
                        choiceQuery.refetch(),
                      ])
                    }
                  >
                    <Trans>Check source and submissions</Trans>
                  </StyledDeliveryButton>
                </div>
              ) : (
                <>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!valid || stale || commands.busy || busy || locked)
                        return;
                      void commands.preview(body).then((value) => {
                        if (value) setPrepared(value.body);
                      });
                    }}
                  >
                    <StyledDeliveryStack>
                      <p>
                        {source.data.source.title} · {t`Ad ${adId}`} ·{' '}
                        {source.data.source.fromDate} –{' '}
                        {source.data.source.throughDate}
                      </p>
                      <fieldset disabled={stale || commands.busy}>
                        <legend>
                          <Trans>Approved submission</Trans>
                        </legend>
                        {body.assetId && (
                          <p>
                            {t`Selected submission ${body.submissionVersion}`} ·{' '}
                            {existing?.body.creativeTarget.asset?.name ??
                              t`Chosen approved creative`}
                          </p>
                        )}
                        {choices.data.items.map((choice) => (
                          <label
                            key={`${choice.taskId}:${choice.submissionVersion}:${choice.assetId}`}
                          >
                            <input
                              type="radio"
                              name="creativeTarget"
                              checked={
                                body.taskId === choice.taskId &&
                                body.submissionVersion ===
                                  choice.submissionVersion &&
                                body.assetId === choice.assetId
                              }
                              onChange={() =>
                                update({
                                  taskId: choice.taskId,
                                  submissionVersion: choice.submissionVersion,
                                  assetId: choice.assetId,
                                })
                              }
                            />
                            {choice.title} ·{' '}
                            {t`Submission ${choice.submissionVersion}`} ·{' '}
                            {choice.assetName}
                          </label>
                        ))}
                        {!choices.data.items.length && (
                          <p>
                            <Trans>
                              No independently approved compatible submissions
                              are available for this project. Finish creative
                              approval or choose the matching client project
                              first.
                            </Trans>
                          </p>
                        )}
                        <StyledDeliveryRow>
                          {after && (
                            <StyledDeliveryButton
                              type="button"
                              onClick={() => setAfter(null)}
                            >
                              <Trans>First submissions</Trans>
                            </StyledDeliveryButton>
                          )}
                          {choices.data.nextCursor && (
                            <StyledDeliveryButton
                              type="button"
                              onClick={() =>
                                setAfter(choices.data?.nextCursor ?? null)
                              }
                            >
                              <Trans>More approved submissions</Trans>
                            </StyledDeliveryButton>
                          )}
                        </StyledDeliveryRow>
                      </fieldset>
                      {selectedCurrent && (
                        <CreativeLearningComponents
                          selected={selectedComponents}
                          declared={body.declaredComponents}
                          previousNames={existing?.body.components ?? []}
                          onChange={(declaredComponents) =>
                            update({ declaredComponents })
                          }
                        />
                      )}
                      {choices.data.selectionWarnings.length > 0 && (
                        <p role="alert">
                          <Trans>
                            The previously selected creative is no longer
                            eligible. Your notes are kept. Choose another
                            approved submission; no replacement has been made
                            automatically.
                          </Trans>
                        </p>
                      )}
                      {body.assetId &&
                        !selectedCurrent &&
                        choices.data.selectionWarnings.length === 0 && (
                          <p role="status">
                            <Trans>
                              The selected approved submission must be checked
                              before its optional components can be declared or
                              this proposal previewed.
                            </Trans>
                          </p>
                        )}
                      <label>
                        <Trans>Outcome evidence</Trans>
                        <select
                          aria-label={t`Outcome evidence`}
                          required
                          value={
                            body.goal.provenance === 'HUMAN'
                              ? 'HUMAN'
                              : (body.goal.metricKey ?? '')
                          }
                          onChange={(event) => {
                            const selected = source.data?.metrics.find(
                              (value) =>
                                value.key === event.currentTarget.value,
                            );
                            update({
                              goal: {
                                ...body.goal,
                                kind: '',
                                provenance:
                                  selected || event.currentTarget.value === ''
                                    ? 'REPORT'
                                    : 'HUMAN',
                                metricKey: selected?.key ?? null,
                                metricAdId: selected ? adId : null,
                                value: selected?.value ?? null,
                              },
                            });
                          }}
                        >
                          <option value="">{t`Choose a reported metric`}</option>
                          {source.data.metrics
                            .filter((value) => value.goalKinds.length > 0)
                            .map((value) => (
                              <option value={value.key} key={value.key}>
                                {value.label} · {value.value ?? t`Unknown`}
                              </option>
                            ))}
                          <option value="HUMAN">{t`Human-recorded outcome evidence`}</option>
                        </select>
                      </label>
                      <label>
                        <Trans>Business outcome</Trans>
                        <select
                          required
                          aria-label={t`Business outcome`}
                          value={body.goal.kind}
                          onChange={(event) =>
                            update({
                              goal: {
                                ...body.goal,
                                kind: event.currentTarget.value,
                              },
                            })
                          }
                        >
                          <option value="">{t`Confirm the outcome`}</option>
                          {goals.map((kind) => (
                            <option value={kind} key={kind}>
                              {labels.goal(kind)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {body.goal.provenance === 'HUMAN' && (
                        <label>
                          <Trans>
                            Human-reported value (blank means unknown)
                          </Trans>
                          <input
                            inputMode="decimal"
                            pattern="[0-9]+(\\.[0-9]{1,6})?"
                            value={body.goal.value ?? ''}
                            onChange={(event) =>
                              update({
                                goal: {
                                  ...body.goal,
                                  value: event.currentTarget.value || null,
                                },
                              })
                            }
                          />
                        </label>
                      )}
                      <label>
                        <Trans>Outcome evidence and limitations</Trans>
                        <textarea
                          maxLength={4000}
                          required={body.goal.provenance === 'HUMAN'}
                          value={body.goal.evidence}
                          onChange={(event) =>
                            update({
                              goal: {
                                ...body.goal,
                                evidence: event.currentTarget.value,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        <Trans>How you know this ad used this creative</Trans>
                        <textarea
                          required
                          maxLength={4000}
                          value={body.associationEvidence}
                          onChange={(event) =>
                            update({
                              associationEvidence: event.currentTarget.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        <Trans>
                          Supporting evidence URL (optional HTTPS link)
                        </Trans>
                        <input
                          type="url"
                          pattern="https://.*"
                          maxLength={2000}
                          value={body.evidenceUrl}
                          onChange={(event) =>
                            update({ evidenceUrl: event.currentTarget.value })
                          }
                        />
                      </label>
                      <label>
                        <Trans>
                          Human-declared rendered copy (optional, not
                          independently verified)
                        </Trans>
                        <textarea
                          maxLength={20000}
                          disabled={
                            selectedCurrent &&
                            selectedComponents?.hasSubmittedCopy === true
                          }
                          value={body.declaredCopy ?? ''}
                          onChange={(event) =>
                            update({
                              declaredCopy: event.currentTarget.value || null,
                            })
                          }
                        />
                      </label>
                      {selectedCurrent &&
                        selectedComponents?.hasSubmittedCopy && (
                          <p>
                            <Trans>
                              This submission already has frozen copy evidence.
                              The preview uses that submitted copy; an
                              additional human declaration does not replace it.
                            </Trans>
                          </p>
                        )}
                      <label>
                        <Trans>Proposal notes</Trans>
                        <textarea
                          maxLength={4000}
                          value={body.note}
                          onChange={(event) =>
                            update({ note: event.currentTarget.value })
                          }
                        />
                      </label>
                      <StyledDeliveryButton
                        type="submit"
                        disabled={
                          !valid || stale || commands.busy || busy || locked
                        }
                      >
                        <Trans>Preview exact association evidence</Trans>
                      </StyledDeliveryButton>
                    </StyledDeliveryStack>
                  </form>
                  {commands.error && <p role="alert">{commands.error}</p>}
                  {prepared && (
                    <>
                      <CreativeLearningEvidence body={prepared} />
                      <StyledDeliveryButton
                        type="button"
                        disabled={stale || commands.busy || busy || locked}
                        onClick={() =>
                          void execute({
                            kind: 'SAVE',
                            input: {
                              ...body,
                              associationEvidence:
                                body.associationEvidence.trim(),
                              note: body.note.trim(),
                              id,
                              requestId,
                              revision: opened.revision,
                              previewFingerprint: prepared.previewFingerprint,
                            },
                          })
                        }
                      >
                        <Trans>Save association draft</Trans>
                      </StyledDeliveryButton>
                    </>
                  )}
                </>
              )}
            </StyledDeliveryStack>
          )}
        </CreativeLearningAttempt>
      </StyledDeliveryStack>
    </section>
  );
};
