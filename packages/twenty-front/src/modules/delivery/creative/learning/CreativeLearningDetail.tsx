import { useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import {
  isCreativeLearningSourceLost,
  type useCreativeLearningAccess,
} from '@/delivery/creative/learning/useCreativeLearningAccess';
import {
  GET_LEARNING_LINK,
  GET_LEARNING_STATE,
} from '@/delivery/creative/learning/delivery-creative-learning.graphql';
import { CreativeLearningEvidence } from '@/delivery/creative/learning/CreativeLearningEvidence';
import { CreativeLearningEditor } from '@/delivery/creative/learning/CreativeLearningEditor';
import { CreativeLessonEvidencePicker } from '@/delivery/creative/learning/CreativeLessonEvidencePicker';
import {
  areCreativeLessonMeasuresComparable,
  type CreativeLessonSelection,
} from '@/delivery/creative/learning/creative-lesson-evidence';
import { CreativeLearningAttempt } from '@/delivery/creative/learning/CreativeLearningAttempt';
import { useCreativeLearningLabels } from '@/delivery/creative/learning/useCreativeLearningLabels';
import {
  creativeLearningDestination,
  LEARNING_CLOSE,
} from '@/delivery/creative/learning/creative-learning-navigation';
import {
  type CreativeLearningIntent,
  type CreativeLearningLink,
  type CreativeLearningReceipt,
} from '@/delivery/creative/learning/creative-learning.types';
import { StyledLearningBoundary } from '@/delivery/creative/learning/creativeLearningStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryCreativeAdLinkQuery,
  type DeliveryCreativeAdLinkStateQuery,
} from '~/generated-metadata/graphql';
type CreativeLearningDetailProps = {
  state: ReturnType<typeof useCreativeLearningAccess>;
  id: string;
  projectId: string;
  enabled: boolean;
  intent: CreativeLearningIntent | null;
  consumeIntent: (id: string) => void;
  openIntent: (
    mode: CreativeLearningIntent['mode'],
    id: string,
    action?: string,
    source?: { sourceId: string; adId: string },
  ) => void;
  onDenied: () => void;
};
export const CreativeLearningDetail = ({
  state,
  id,
  projectId,
  enabled,
  intent,
  consumeIntent,
  openIntent,
  onDenied,
}: CreativeLearningDetailProps) => {
  const { t } = useLingui();
  const labels = useCreativeLearningLabels();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction } = useDeliveryDraftGuard();
  const focus = useAssistantPanelFocus();
  const version = params.has('learningVersion')
    ? Number(params.get('learningVersion'))
    : null;
  const source = `${state.source}:${id}`;
  const lightQuery = useQuery<DeliveryCreativeAdLinkStateQuery>(
    GET_LEARNING_STATE,
    {
      variables: { input: { id }, identity: source },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      notifyOnNetworkStatusChange: true,
      skip: !enabled,
    },
  );
  const light = useAssistantRead({
    value: lightQuery.data?.deliveryCreativeAdLinkState,
    source,
    enabled,
    loading: lightQuery.loading,
    error: lightQuery.error,
    networkStatus: lightQuery.networkStatus,
    matches: (value) => state.matches(value) && value.link.id === id,
  });
  const detailSource = `${source}:${version ?? 'current'}:${params.get('learningEvent') ?? ''}`;
  const query = useQuery<DeliveryCreativeAdLinkQuery>(GET_LEARNING_LINK, {
    variables: {
      input: { id, version, afterEventId: params.get('learningEvent') },
      identity: detailSource,
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !enabled,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryCreativeAdLink,
    source: detailSource,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.matches(value) &&
      value.link.id === id &&
      value.body.projectId === projectId &&
      (version === null || value.selectedVersion === version),
  });
  const [retained, setRetained] = useState<{
    source: string;
    value: CreativeLearningLink;
  } | null>(null);
  if (reading.data && retained?.value !== reading.data)
    setRetained({ source: detailSource, value: reading.data });
  const value =
    reading.data ?? (retained?.source === detailSource ? retained.value : null);
  const denied =
    isCreativeLearningSourceLost(query.error) ||
    isCreativeLearningSourceLost(lightQuery.error);
  useLayoutEffect(() => {
    if (denied) onDenied();
  }, [denied, onDenied]);
  const selectedCurrent =
    value !== null &&
    light.data !== null &&
    value.selectedVersion === light.data.link.currentVersion;
  const available =
    enabled &&
    !denied &&
    reading.data !== null &&
    light.data !== null &&
    reading.data.link.revision === light.data.link.revision;
  const refresh = async () => {
    await Promise.allSettled([query.refetch(), lightQuery.refetch()]);
  };
  const saved = (_value: CreativeLearningReceipt) => {
    void refresh();
  };
  const mode = params.get('learningMode'),
    requestId = params.get('learningRequest');
  return (
    <section
      ref={focus}
      tabIndex={-1}
      aria-label={t`Creative association evidence`}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h2>
            <Trans>Exact association and review</Trans>
          </h2>
          <Link to={creativeLearningDestination(params, LEARNING_CLOSE)}>
            <Trans>Close association</Trans>
          </Link>
        </StyledDeliveryRow>
        {!available && (
          <p role={query.error || lightQuery.error ? 'alert' : 'status'}>
            <Trans>
              Current association evidence could not be verified. Your owned
              preparation is retained while you refresh; changed evidence must
              be reviewed again.
            </Trans>
          </p>
        )}
        <StyledDeliveryButton type="button" onClick={() => void refresh()}>
          <Trans>Refresh association evidence</Trans>
        </StyledDeliveryButton>
        <StyledLearningBoundary
          hidden={!available}
          disabled={!available}
          inert={!available || undefined}
        >
          {value && (
            <StyledDeliveryStack>
              <p>
                {t`Viewing version ${value.selectedVersion}`} ·{' '}
                {t`Current status`}:{' '}
                {labels.state(light.data?.link.state ?? value.link.state)}
              </p>
              <p>
                {value.link.reviewedVersion === value.selectedVersion
                  ? t`This is the independently reviewed version.`
                  : t`This version has not been independently confirmed.`}
              </p>
              <CreativeLearningEvidence body={value.body} />
              {light.data?.warnings
                .filter((warning) => !value.body.warnings.includes(warning))
                .map((warning) => (
                  <p role="status" key={warning}>
                    {labels.warning(warning)}
                  </p>
                ))}
              <StyledDeliveryRow>
                {selectedCurrent && light.data?.canEdit && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => openIntent('edit', id)}
                  >
                    <Trans>Edit proposal</Trans>
                  </StyledDeliveryButton>
                )}
                {selectedCurrent && light.data?.canSubmit && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => openIntent('decision', id, 'SUBMIT')}
                  >
                    <Trans>Submit for independent review</Trans>
                  </StyledDeliveryButton>
                )}
                {selectedCurrent && light.data?.canReview && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => openIntent('decision', id, 'REVIEW')}
                  >
                    <Trans>Review human association</Trans>
                  </StyledDeliveryButton>
                )}
                {selectedCurrent && light.data?.canRequestChanges && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() =>
                      openIntent('decision', id, 'REQUEST_CHANGES')
                    }
                  >
                    <Trans>Return for changes</Trans>
                  </StyledDeliveryButton>
                )}
                {selectedCurrent && light.data?.canRetract && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => openIntent('decision', id, 'RETRACT')}
                  >
                    <Trans>Retract association</Trans>
                  </StyledDeliveryButton>
                )}
                {light.data?.link.state === 'REVIEWED' &&
                  !light.data.link.correctedById &&
                  state.permission.manager && (
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => openIntent('lesson', crypto.randomUUID())}
                    >
                      <Trans>Record a lesson from this evidence</Trans>
                    </StyledDeliveryButton>
                  )}
                {(value.link.state === 'REVIEWED' ||
                  value.link.state === 'RETRACTED') &&
                  !value.link.correctedById && (
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        openIntent('new', crypto.randomUUID(), 'CORRECT', {
                          sourceId: value.body.sourceId,
                          adId: value.body.adId,
                        })
                      }
                    >
                      <Trans>Propose a correction</Trans>
                    </StyledDeliveryButton>
                  )}
              </StyledDeliveryRow>
              <details>
                <summary>
                  <Trans>Versions and decision history</Trans>
                </summary>
                <StyledDeliveryStack>
                  <form
                    key={value.selectedVersion}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const number = Number(
                        new FormData(event.currentTarget).get('version'),
                      );
                      if (
                        !Number.isSafeInteger(number) ||
                        number < 1 ||
                        number > value.link.currentVersion
                      )
                        return;
                      requestAction(() =>
                        navigate(
                          creativeLearningDestination(params, {
                            learningVersion: String(number),
                            learningMode: null,
                            learningRequest: null,
                            learningEvent: null,
                          }),
                        ),
                      );
                    }}
                  >
                    <StyledDeliveryRow>
                      <label>
                        <Trans>Saved version</Trans>
                        <input
                          name="version"
                          type="number"
                          required
                          min={1}
                          max={value.link.currentVersion}
                          defaultValue={value.selectedVersion}
                        />
                      </label>
                      <StyledDeliveryButton type="submit">
                        <Trans>Open saved version</Trans>
                      </StyledDeliveryButton>
                    </StyledDeliveryRow>
                  </form>
                  {value.events.map((event) => (
                    <div key={event.requestId}>
                      <strong>
                        {labels.state(event.action)} · {event.actorName}
                      </strong>
                      <p>
                        {event.createdAt} · {t`Version ${event.version}`}
                      </p>
                      <p>{event.note}</p>
                    </div>
                  ))}
                  {value.nextEventCursor && (
                    <Link
                      to={creativeLearningDestination(params, {
                        learningEvent: value.nextEventCursor,
                      })}
                    >
                      <Trans>Earlier decision history</Trans>
                    </Link>
                  )}
                </StyledDeliveryStack>
              </details>
            </StyledDeliveryStack>
          )}
        </StyledLearningBoundary>
        {value && mode === 'edit' && requestId && (
          <CreativeLearningEditor
            key={requestId}
            state={state}
            projectId={value.body.projectId}
            sourceId={value.body.sourceId}
            adId={value.body.adId}
            id={id}
            requestId={requestId}
            intent={intent}
            consumeIntent={consumeIntent}
            existing={value}
            currentRevision={light.data?.link.revision ?? null}
            canEdit={selectedCurrent && light.data?.canEdit === true}
            enabled={available}
            onDenied={onDenied}
            onSaved={saved}
          />
        )}
        {value && mode === 'decision' && requestId && (
          <CreativeLearningDecision
            key={requestId}
            state={state}
            value={value}
            currentRevision={light.data?.link.revision ?? null}
            enabled={available}
            allowed={Boolean(
              selectedCurrent &&
              light.data &&
              (params.get('learningAction') === 'SUBMIT'
                ? light.data.canSubmit
                : params.get('learningAction') === 'REVIEW'
                  ? light.data.canReview
                  : params.get('learningAction') === 'REQUEST_CHANGES'
                    ? light.data.canRequestChanges
                    : params.get('learningAction') === 'RETRACT'
                      ? light.data.canRetract
                      : false),
            )}
            intent={intent}
            consumeIntent={consumeIntent}
            requestId={requestId}
            action={params.get('learningAction') ?? ''}
            onDenied={onDenied}
            onSaved={saved}
          />
        )}
        {value && mode === 'lesson' && requestId && (
          <CreativeLearningLesson
            key={requestId}
            state={state}
            value={value}
            enabled={
              available &&
              state.permission.manager &&
              light.data?.link.state === 'REVIEWED'
            }
            intent={intent}
            consumeIntent={consumeIntent}
            requestId={requestId}
            lessonId={params.get('learningLesson') ?? ''}
            onDenied={onDenied}
            onSaved={saved}
          />
        )}
      </StyledDeliveryStack>
    </section>
  );
};
const CreativeLearningDecision = ({
  state,
  value,
  currentRevision,
  enabled,
  allowed,
  intent,
  consumeIntent,
  requestId,
  action,
  onDenied,
  onSaved,
}: {
  state: ReturnType<typeof useCreativeLearningAccess>;
  value: CreativeLearningLink;
  currentRevision: number | null;
  enabled: boolean;
  allowed: boolean;
  intent: CreativeLearningIntent | null;
  consumeIntent: (id: string) => void;
  requestId: string;
  action: string;
  onDenied: () => void;
  onSaved: (value: CreativeLearningReceipt) => void;
}) => {
  const { t } = useLingui();
  const labels = useCreativeLearningLabels();
  const [owned] = useState(
    () =>
      intent?.mode === 'decision' &&
      intent.requestId === requestId &&
      intent.id === value.link.id &&
      intent.action === action,
  );
  useLayoutEffect(() => consumeIntent(requestId), [consumeIntent, requestId]);
  const [opened] = useState(() => ({
    revision: value.link.revision,
    fingerprint: value.body.previewFingerprint,
  }));
  const [note, setNote] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const stale = currentRevision !== opened.revision;
  const required = action === 'REQUEST_CHANGES' || action === 'RETRACT';
  return (
    <section aria-label={t`Confirm association decision`}>
      <h3>{labels.action(action)}</h3>
      <CreativeLearningAttempt
        state={state}
        requestId={requestId}
        linkId={value.link.id}
        action={action}
        owned={owned}
        enabled={enabled}
        onDenied={onDenied}
        onSaved={onSaved}
      >
        {({ execute }) => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!allowed || stale || !confirmed) return;
              void execute({
                kind: 'DECIDE',
                input: {
                  id: value.link.id,
                  requestId,
                  revision: opened.revision,
                  action,
                  previewFingerprint: opened.fingerprint,
                  note: note.trim(),
                },
              });
            }}
          >
            <StyledDeliveryStack>
              <p>
                <Trans>
                  Independent confirmation records a human association. It does
                  not verify Meta creative identity or approve the creative
                  again.
                </Trans>
              </p>
              {(!allowed || stale) && (
                <p role="alert">
                  <Trans>
                    The current source or review responsibility changed. Your
                    notes are kept. Refresh and reopen the current decision
                    before committing.
                  </Trans>
                </p>
              )}
              <label>
                <Trans>Decision explanation</Trans>
                <textarea
                  required={required}
                  maxLength={4000}
                  value={note}
                  onChange={(event) => setNote(event.currentTarget.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(event) =>
                    setConfirmed(event.currentTarget.checked)
                  }
                />
                <Trans>
                  I reviewed the exact ad, reporting window and approved
                  creative evidence.
                </Trans>
              </label>
              <StyledDeliveryButton
                type="submit"
                disabled={!allowed || stale || !confirmed}
              >
                {labels.action(action)}
              </StyledDeliveryButton>
            </StyledDeliveryStack>
          </form>
        )}
      </CreativeLearningAttempt>
    </section>
  );
};
const CreativeLearningLesson = ({
  state,
  value,
  enabled,
  intent,
  consumeIntent,
  requestId,
  lessonId,
  onDenied,
  onSaved,
}: {
  state: ReturnType<typeof useCreativeLearningAccess>;
  value: CreativeLearningLink;
  enabled: boolean;
  intent: CreativeLearningIntent | null;
  consumeIntent: (id: string) => void;
  requestId: string;
  lessonId: string;
  onDenied: () => void;
  onSaved: (value: CreativeLearningReceipt) => void;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const [owned] = useState(
    () =>
      intent?.mode === 'lesson' &&
      intent.id === lessonId &&
      intent.requestId === requestId,
  );
  useLayoutEffect(() => consumeIntent(requestId), [consumeIntent, requestId]);
  const [anchor] = useState(() => ({
    id: value.link.id,
    fingerprint: value.link.fingerprint,
    projectId: value.body.projectId,
  }));
  const [selections, setSelections] = useState<CreativeLessonSelection[]>(
    () => [
      {
        id: value.link.id,
        version: value.selectedVersion,
        fingerprint: value.link.fingerprint,
        body: value.body,
        title: `${value.link.adName} · ${value.link.taskTitle}`,
      },
    ],
  );
  const [evidenceReady, setEvidenceReady] = useState(false);
  const comparable = areCreativeLessonMeasuresComparable(selections);
  const [title, setTitle] = useState(''),
    [assessment, setAssessment] = useState('INCONCLUSIVE'),
    [lesson, setLesson] = useState(''),
    [limitations, setLimitations] = useState(''),
    [nextTest, setNextTest] = useState('');
  return (
    <section aria-label={t`Record a creative lesson`}>
      <h3>
        <Trans>Record a reviewed-evidence lesson</Trans>
      </h3>
      <CreativeLearningAttempt
        state={state}
        requestId={requestId}
        linkId={anchor.id}
        lessonId={lessonId}
        action="LESSON"
        owned={owned}
        enabled={enabled}
        onDenied={onDenied}
        onSaved={onSaved}
      >
        {({ execute }) => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !enabled ||
                !evidenceReady ||
                (!comparable && assessment !== 'INCONCLUSIVE')
              )
                return;
              void execute({
                kind: 'LESSON',
                input: {
                  id: lessonId,
                  requestId,
                  projectId: anchor.projectId,
                  linkIds: selections.map((item) => item.id),
                  linkFingerprints: selections.map((item) => item.fingerprint),
                  title: title.trim(),
                  assessment,
                  lesson: lesson.trim(),
                  limitations: limitations.trim(),
                  nextTest: nextTest.trim(),
                  correctsId: params.get('learningLessonCorrects'),
                },
              });
            }}
          >
            <StyledDeliveryStack>
              <p>
                <Trans>
                  This interpretation preserves each selected observation and
                  window separately. It does not add overlapping reporting
                  windows or prove what caused an outcome.
                </Trans>
              </p>
              <CreativeLessonEvidencePicker
                state={state}
                projectId={anchor.projectId}
                items={selections}
                onChange={setSelections}
                onReady={setEvidenceReady}
                enabled={enabled}
                onDenied={onDenied}
              />
              {!comparable && (
                <p role="status">
                  <Trans>
                    These observations include unknown, human-reported or unlike
                    measurements. Record an inconclusive lesson with its limits;
                    stronger interpretations require matching known provider
                    measurements, account, currency and timezone.
                  </Trans>
                </p>
              )}
              <label>
                <Trans>Lesson title</Trans>
                <input
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                />
              </label>
              <label>
                <Trans>Interpretation</Trans>
                <select
                  value={assessment}
                  onChange={(event) => setAssessment(event.currentTarget.value)}
                >
                  <option value="INCONCLUSIVE">{t`Inconclusive`}</option>
                  <option
                    value="NEEDS_ANOTHER_TEST"
                    disabled={!comparable}
                  >{t`Needs another test`}</option>
                  <option
                    value="PROMISING"
                    disabled={!comparable}
                  >{t`Promising observation, not proof`}</option>
                </select>
              </label>
              <label>
                <Trans>What the evidence suggests</Trans>
                <textarea
                  required
                  maxLength={6000}
                  value={lesson}
                  onChange={(event) => setLesson(event.currentTarget.value)}
                />
              </label>
              <label>
                <Trans>Evidence limitations and uncertainty</Trans>
                <textarea
                  required
                  maxLength={4000}
                  value={limitations}
                  onChange={(event) =>
                    setLimitations(event.currentTarget.value)
                  }
                />
              </label>
              <label>
                <Trans>Next test (optional)</Trans>
                <textarea
                  maxLength={4000}
                  value={nextTest}
                  onChange={(event) => setNextTest(event.currentTarget.value)}
                />
              </label>
              <StyledDeliveryButton
                type="submit"
                disabled={
                  !enabled ||
                  !evidenceReady ||
                  (!comparable && assessment !== 'INCONCLUSIVE')
                }
              >
                <Trans>Record immutable lesson</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryStack>
          </form>
        )}
      </CreativeLearningAttempt>
    </section>
  );
};
