import { DeliveryTaskWorkflow } from '@/delivery/workflows/DeliveryTaskWorkflow';
import { DeliveryTaskPlan } from '@/delivery/capacity/DeliveryTaskPlan';
import { DeliveryRevisions } from '@/delivery/revisions/DeliveryRevisions';
import { useTaskWorkflow } from '@/delivery/workflows/useTaskWorkflow';
import {
  useTaskReview,
  type TaskReviewController,
} from '@/delivery/reviews/useTaskReview';
import { DeliveryTaskReview } from '@/delivery/reviews/DeliveryTaskReview';
import { ReviewBatchProgress } from '@/delivery/reviews/ReviewBatchProgress';
import { useReviewLabels } from '@/delivery/reviews/useReviewLabels';
import { WorkflowDefinitionView } from '@/delivery/workflows/WorkflowDefinitionView';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DeliveryCreativeReview } from '@/delivery/creative/review/DeliveryCreativeReview';
import { creativeReviewDestination } from '@/delivery/creative/review/creative-review-navigation';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryTaskForm } from '@/delivery/DeliveryTaskForm';
import {
  type DeliveryCommandRunner,
  type DeliveryTask,
  type DeliveryTaskContext,
} from '@/delivery/delivery.types';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryCelebration,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryTaskDetailProps = {
  task: DeliveryTask;
  workspace: DeliveryTaskContext;
  run: DeliveryCommandRunner;
  busy: boolean;
  celebrateApproval: boolean;
  stateLabel: (state: string) => string;
  onChanged?: () => Promise<unknown>;
  onUnavailable?: () => void;
  reviewController?: TaskReviewController;
  onCelebrationShown?: () => void;
};
export const DeliveryTaskDetail = (props: DeliveryTaskDetailProps) => {
  const [params] = useSearchParams();
  return (
    <TaskDetailWorkspace
      key={`${props.task.id}:${params}`}
      task={props.task}
      workspace={props.workspace}
      run={props.run}
      busy={props.busy}
      stateLabel={props.stateLabel}
      celebrateApproval={props.celebrateApproval}
      onChanged={props.onChanged}
      onUnavailable={props.onUnavailable}
      reviewController={props.reviewController}
      onCelebrationShown={props.onCelebrationShown}
    />
  );
};
type TaskDetailWorkspaceProps = DeliveryTaskDetailProps;
const TaskDetailWorkspace = ({
  task,
  workspace,
  run,
  busy,
  stateLabel,
  celebrateApproval,
  onChanged,
  onUnavailable,
  reviewController,
  onCelebrationShown,
}: TaskDetailWorkspaceProps) => {
  const { t } = useLingui();
  const reviewLabels = useReviewLabels();
  const [params] = useSearchParams();
  const [creativeCanReviewFinal, setCreativeCanReviewFinal] = useState(false);
  const workflow = useTaskWorkflow({
    taskId: task.id,
    taskRevision: task.revision,
    onChanged,
    onUnavailable,
  });
  const latestSubmission = task.details.submissions.at(-1);
  const standaloneReview = useTaskReview({
    taskId: task.id,
    taskRevision: task.revision,
    enabled: !reviewController,
    onChanged,
    onUnavailable,
  });
  const taskReview = reviewController ?? standaloneReview;
  const creativeReview = Boolean(
    task.details.creative ||
    task.details.submissions.some(
      (submission) =>
        submission.creativeVersion !== undefined ||
        submission.finalAssetId !== undefined,
    ),
  );
  const selectedLatest =
    !params.has('creativeSubmission') ||
    params.get('creativeSubmission') === String(latestSubmission?.version);
  const selectedSubmission = params.has('creativeSubmission')
    ? task.details.submissions.find(
        (submission) =>
          String(submission.version) === params.get('creativeSubmission'),
      )
    : latestSubmission;
  const exactCreativeIdentity = Boolean(
    latestSubmission?.creativeVersion &&
    latestSubmission.finalAssetId &&
    task.details.creative?.version === latestSubmission.creativeVersion &&
    task.details.creative.finalAssetId === latestSubmission.finalAssetId &&
    task.details.creative.assets.some(
      (asset) =>
        asset.id === latestSubmission.finalAssetId &&
        asset.storageState === 'READY',
    ),
  );
  const reviewIdentity = {
    selectedSubmissionVersion: latestSubmission?.version,
    reviewAssignmentRevision: taskReview.data?.assignment?.revision ?? 0,
    ...(latestSubmission?.creativeVersion
      ? { creativeVersion: latestSubmission.creativeVersion }
      : {}),
    ...(latestSubmission?.finalAssetId
      ? { finalAssetId: latestSubmission.finalAssetId }
      : {}),
  };
  const [workflowReview, setWorkflowReview] = useState({
    version: latestSubmission?.version ?? 0,
    checkedIds: [] as string[],
  });
  if (
    workflowReview.checkedIds.length === 0 &&
    workflowReview.version !== (latestSubmission?.version ?? 0)
  )
    setWorkflowReview({
      version: latestSubmission?.version ?? 0,
      checkedIds: [],
    });
  const reviewChecks =
    latestSubmission?.workflow?.definition.reviewChecks ?? [];
  const reviewComplete =
    workflowReview.version === (latestSubmission?.version ?? 0) &&
    reviewChecks.every(
      (item) => !item.required || workflowReview.checkedIds.includes(item.id),
    );
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(task.details.draftCopy ?? '');
  const [evidence, setEvidence] = useState(task.details.evidence.join('\n'));
  const [feedback, setFeedback] = useState('');
  const [comment, setComment] = useState('');
  const [blocker, setBlocker] = useState(task.details.blocker);
  const [savedInputs, setSavedInputs] = useState({
    description,
    evidence,
    blocker,
  });
  const [saving, setSaving] = useState(false);
  const { requestAction } = useDeliveryDraftGuard();
  useDeliveryDraftStatus({
    dirty:
      !editing &&
      (description !== savedInputs.description ||
        evidence !== savedInputs.evidence ||
        blocker !== savedInputs.blocker ||
        workflowReview.checkedIds.length > 0 ||
        feedback !== '' ||
        comment !== ''),
    saving: busy || saving,
  });
  const resetDraftInputs = () => {
    const next = {
      description: task.details.draftCopy ?? '',
      evidence: task.details.evidence.join('\n'),
      blocker: task.details.blocker,
    };
    setDescription(next.description);
    setEvidence(next.evidence);
    setBlocker(next.blocker);
    setSavedInputs(next);
    setFeedback('');
    setComment('');
    workflow.reset();
    setWorkflowReview({
      version: latestSubmission?.version ?? 0,
      checkedIds: [],
    });
  };
  const [celebrated, setCelebrated] = useState(celebrateApproval);
  useEffect(() => {
    if (!celebrateApproval || !onCelebrationShown) return;
    setCelebrated(true);
    onCelebrationShown();
  }, [celebrateApproval, onCelebrationShown]);
  const { details } = task;
  const canProduce =
    workspace.actor.memberId === task.assigneeId &&
    !['IN_REVIEW', 'APPROVED'].includes(details.state);
  const canReview =
    selectedLatest &&
    Boolean(latestSubmission) &&
    taskReview.data?.canReviewSubmission === true &&
    taskReview.data.pending?.submissionVersion === latestSubmission?.version &&
    workspace.actor.memberId !== task.assigneeId &&
    details.state === 'IN_REVIEW';
  const memberName = (id: string | null) =>
    id === null
      ? t`Unassigned`
      : (workspace.members.find((member) => member.id === id)?.name ??
        t`Former teammate`);
  const change = async (input: Record<string, unknown>) => {
    if (busy || saving) return false;
    setSaving(true);
    try {
      return await run({ ...input, taskId: task.id, revision: task.revision });
    } finally {
      setSaving(false);
    }
  };
  const reviewControls = canReview && (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <h3>
          <Trans>Review this submission</Trans>
        </h3>
        {latestSubmission?.workflow && (
          <details>
            <summary>
              <Trans>Submitted service requirements</Trans> ·{' '}
              {latestSubmission.workflow.definition.name} ·{' '}
              <Trans>Version</Trans> {latestSubmission.workflow.version}
            </summary>
            <WorkflowDefinitionView
              definition={latestSubmission.workflow.definition}
              workflow={latestSubmission.workflow}
            />
          </details>
        )}
        {reviewChecks.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              disabled={busy || saving}
              checked={workflowReview.checkedIds.includes(item.id)}
              onChange={(event) =>
                setWorkflowReview({
                  ...workflowReview,
                  checkedIds: event.target.checked
                    ? [...workflowReview.checkedIds, item.id]
                    : workflowReview.checkedIds.filter((id) => id !== item.id),
                })
              }
            />
            {item.label}
            {item.required && (
              <>
                {' '}
                · <Trans>Required for approval</Trans>
              </>
            )}
          </label>
        ))}
        {!reviewComplete && (
          <p role="status">
            <Trans>
              Confirm all required review checks for this submitted version
              before approving.
            </Trans>
          </p>
        )}
        {workflowReview.version !== (latestSubmission?.version ?? 0) && (
          <StyledDeliveryButton
            onClick={() =>
              requestAction(() =>
                setWorkflowReview({
                  version: latestSubmission?.version ?? 0,
                  checkedIds: [],
                }),
              )
            }
          >
            <Trans>Reload submission checks</Trans>
          </StyledDeliveryButton>
        )}
        <label>
          <Trans>Feedback</Trans>
          <textarea
            disabled={busy || saving}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
        </label>
        {creativeReview && !exactCreativeIdentity && (
          <p role="status">
            <Trans>
              Approval requires the latest frozen asset to be ready and match
              current production. Request changes to replace missing legacy
              media; no current asset is substituted.
            </Trans>
          </p>
        )}
        <StyledDeliveryRow>
          <StyledDeliveryButton
            disabled={busy || saving || !feedback.trim()}
            onClick={async () => {
              if (
                await change({
                  action: 'review',
                  ...reviewIdentity,
                  decision: 'CHANGES_REQUESTED',
                  feedback,
                })
              ) {
                setFeedback('');
                setWorkflowReview({
                  version: latestSubmission?.version ?? 0,
                  checkedIds: [],
                });
              }
            }}
          >
            <Trans>Request changes</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            data-primary="true"
            disabled={
              busy ||
              saving ||
              !reviewComplete ||
              !workflow.data ||
              taskReview.data?.canApprove !== true ||
              (creativeReview &&
                (!exactCreativeIdentity || !creativeCanReviewFinal))
            }
            onClick={async () => {
              if (
                await change({
                  action: 'review',
                  ...reviewIdentity,
                  decision: 'APPROVED',
                  feedback,
                  workflowReview: { checkedIds: workflowReview.checkedIds },
                })
              ) {
                setFeedback('');
                setWorkflowReview({
                  version: latestSubmission?.version ?? 0,
                  checkedIds: [],
                });
                setCelebrated(true);
              }
            }}
          >
            <Trans>Approve submission</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
  if (editing)
    return (
      <StyledDeliveryStack>
        <StyledDeliveryButton
          onClick={() => requestAction(() => setEditing(false))}
        >
          <Trans>Cancel editing</Trans>
        </StyledDeliveryButton>
        <DeliveryTaskForm
          workspace={workspace}
          task={task}
          run={run}
          busy={busy || saving}
          onSaved={() => setEditing(false)}
        />
      </StyledDeliveryStack>
    );
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <StyledDeliveryBadge data-state={details.state}>
          {stateLabel(details.state)}
        </StyledDeliveryBadge>
        {workspace.actor.isManager &&
          !['IN_REVIEW', 'APPROVED'].includes(details.state) && (
            <StyledDeliveryButton
              onClick={() =>
                requestAction(() => {
                  resetDraftInputs();
                  setEditing(true);
                })
              }
            >
              <Trans>Edit assignment</Trans>
            </StyledDeliveryButton>
          )}
      </StyledDeliveryRow>
      <h2>{task.title}</h2>
      {!creativeReview && latestSubmission && taskReview.data && (
        <section aria-label={t`Exact submitted work`}>
          {selectedSubmission ? (
            <>
              <h3>{t`Submission ${selectedSubmission.version}`}</h3>
              <small>
                {memberName(selectedSubmission.submittedBy)} ·{' '}
                {reviewLabels.submittedAt(
                  selectedSubmission.submittedAt,
                  taskReview.data?.observedAt,
                )}
              </small>
              <p>{selectedSubmission.description}</p>
              {selectedSubmission.evidence.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  {url}
                </a>
              ))}
            </>
          ) : (
            <p role="alert">
              <Trans>
                This exact submitted version is unavailable. Review the latest
                submission explicitly.
              </Trans>
            </p>
          )}
        </section>
      )}
      <ReviewBatchProgress
        controller={taskReview}
        taskId={task.id}
        latestSubmissionVersion={latestSubmission?.version}
      />
      {latestSubmission && (
        <DeliveryTaskReview
          controller={taskReview}
          submissionVersion={
            selectedLatest
              ? latestSubmission.version
              : Number(params.get('creativeSubmission')) || undefined
          }
        />
      )}
      {creativeReview && (
        <DeliveryCreativeReview
          taskId={task.id}
          taskRevision={task.revision}
          targetKind="SUBMISSION"
          enabled={taskReview.available}
          onFinalReviewReady={setCreativeCanReviewFinal}
        />
      )}
      {!selectedLatest && (
        <p role="status">
          <Trans>
            Earlier submissions remain reviewable. Final decisions require the
            latest exact submission.
          </Trans>{' '}
          <Link
            to={creativeReviewDestination(params, {
              creativeSubmission: null,
              creativeCompare: null,
              creativeFeedback: null,
              creativeFeedbackAfter: null,
              creativeFeedbackBefore: null,
              reviewAssignmentBefore: null,
            })}
          >
            <Trans>Review latest submission</Trans>
          </Link>
        </p>
      )}
      {reviewControls}
      {details.draftCopy && (
        <StyledDeliveryCard>
          <h3>
            <Trans>Accepted draft copy</Trans>
          </h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{details.draftCopy}</p>
          <StyledDeliveryButton
            onClick={() => setDescription(details.draftCopy ?? '')}
          >
            <Trans>Use draft in submission</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryCard>
      )}
      <p>
        <Trans>Assigned to</Trans> {memberName(task.assigneeId)} ·{' '}
        <Trans>Primary manager for client delivery</Trans>{' '}
        {memberName(details.reviewerId)}
      </p>
      {celebrated && (
        <StyledDeliveryCelebration role="status">
          <strong>
            <Trans>Great work — approved!</Trans>
          </strong>
          <p>
            <Trans>This deliverable has passed internal review.</Trans>
          </p>
          <StyledDeliveryButton onClick={() => setCelebrated(false)}>
            <Trans>Dismiss</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryCelebration>
      )}
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <h3>
            <Trans>Brief and notes</Trans>
          </h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>
            {details.brief || t`No production notes yet.`}
          </p>
          {(!latestSubmission || taskReview.data) &&
            details.evidence.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            ))}
        </StyledDeliveryStack>
      </StyledDeliveryCard>
      {details.blocker && (
        <p role="status">
          <strong>
            <Trans>Blocker:</Trans>
          </strong>{' '}
          {details.blocker}
        </p>
      )}
      <DeliveryTaskWorkflow controller={workflow} />
      <DeliveryTaskPlan
        task={task}
        canManage={workspace.actor.isManager}
        run={run}
        busy={busy || saving}
      />
      <StyledDeliveryStack>
        <h3>
          <Trans>Custom checklist</Trans>
        </h3>
        {!details.checklist.length && (
          <small>
            <Trans>No checklist items yet.</Trans>
          </small>
        )}
        {details.checklist.map((item) => (
          <label key={item.id} style={{ flexDirection: 'row' }}>
            <input
              type="checkbox"
              checked={item.done}
              disabled={!canProduce || busy || saving}
              onChange={() =>
                void change({
                  action: 'progress',
                  state:
                    details.state === 'BLOCKED' ? 'BLOCKED' : 'IN_PROGRESS',
                  blocker: details.blocker,
                  evidence: details.evidence,
                  checklist: details.checklist.map((candidate) =>
                    candidate.id === item.id
                      ? { ...candidate, done: !candidate.done }
                      : candidate,
                  ),
                })
              }
            />
            {item.text}
          </label>
        ))}
      </StyledDeliveryStack>
      {canProduce && (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <h3>
              <Trans>Production progress</Trans>
            </h3>
            <StyledDeliveryButton
              disabled={busy || saving}
              onClick={async () => {
                if (
                  await change({
                    action: 'progress',
                    state: 'IN_PROGRESS',
                    blocker: '',
                    checklist: details.checklist,
                    evidence: details.evidence,
                  })
                ) {
                  setBlocker('');
                  setSavedInputs((previous) => ({ ...previous, blocker: '' }));
                }
              }}
            >
              <Trans>Start or resume work</Trans>
            </StyledDeliveryButton>
            <label>
              <Trans>What is blocking you?</Trans>
              <input
                disabled={busy || saving}
                value={blocker}
                onChange={(event) => setBlocker(event.target.value)}
              />
            </label>
            <StyledDeliveryButton
              disabled={busy || saving || !blocker.trim()}
              onClick={async () => {
                if (
                  await change({
                    action: 'progress',
                    state: 'BLOCKED',
                    blocker,
                    checklist: details.checklist,
                    evidence: details.evidence,
                  })
                )
                  setSavedInputs((previous) => ({ ...previous, blocker }));
              }}
            >
              <Trans>Mark blocked</Trans>
            </StyledDeliveryButton>
            <h3>
              <Trans>Submit for review</Trans>
            </h3>
            <label>
              <Trans>What did you complete?</Trans>
              <input
                maxLength={200}
                disabled={busy || saving}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label>
              <Trans>Deliverable links — one URL per line</Trans>
              <textarea
                disabled={busy || saving}
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
              />
            </label>
            {!workflow.readyToSubmit && (
              <p role="status">
                <Trans>
                  Save and complete the service requirements before submitting.
                  If they are unavailable, refresh the task requirements first.
                </Trans>
              </p>
            )}
            <StyledDeliveryButton
              data-primary="true"
              disabled={
                busy ||
                saving ||
                !workflow.readyToSubmit ||
                !description.trim() ||
                (!evidence.trim() && !details.creative?.finalAssetId)
              }
              onClick={async () => {
                if (
                  await change({
                    action: 'submit',
                    description,
                    evidence: evidence
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                ) {
                  setDescription('');
                  setSavedInputs((previous) => ({
                    ...previous,
                    description: '',
                    evidence,
                  }));
                }
              }}
            >
              <Trans>Submit to reviewer</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}
      <DeliveryRevisions task={task} onUnavailable={onUnavailable} />
      {(!latestSubmission || taskReview.data) && (
        <section aria-label={t`Submission history`}>
          <h3>
            <Trans>Submission history</Trans>
          </h3>
          {!details.submissions.length && (
            <small>
              <Trans>
                No submissions yet. Completed work will appear here.
              </Trans>
            </small>
          )}
          {[...details.submissions].reverse().map((submission) => (
            <StyledDeliveryCard key={submission.version}>
              <StyledDeliveryStack>
                <strong>
                  <Trans>Version</Trans> {submission.version} ·{' '}
                  {submission.decision
                    ? stateLabel(submission.decision)
                    : t`Awaiting review`}
                </strong>
                <small>
                  {memberName(submission.submittedBy)} ·{' '}
                  {reviewLabels.submittedAt(
                    submission.submittedAt,
                    taskReview.data?.observedAt,
                  )}
                </small>
                {submission.decision && (
                  <small>
                    <Trans>Reviewed by</Trans>{' '}
                    {workspace.members.find(
                      (member) => member.id === submission.reviewedBy,
                    )?.name ?? t`Recorded reviewer unavailable`}
                  </small>
                )}
                <p>{submission.description}</p>
                {
                  <Link
                    to={creativeReviewDestination(params, {
                      panel: 'task',
                      creativeSubmission: submission.version,
                      creativeAsset: null,
                      creativeCompare: null,
                      creativeFeedback: null,
                      creativeFeedbackAfter: null,
                      creativeFeedbackBefore: null,
                      reviewAssignmentBefore: null,
                    })}
                  >
                    <Trans>Review this exact submission</Trans>
                  </Link>
                }
                {submission.evidence.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    {url}
                  </a>
                ))}
                {submission.workflow && (
                  <details>
                    <summary>
                      <Trans>Service requirements used</Trans> ·{' '}
                      {submission.workflow.definition.name} ·{' '}
                      <Trans>Version</Trans> {submission.workflow.version}
                    </summary>
                    <WorkflowDefinitionView
                      definition={submission.workflow.definition}
                      workflow={submission.workflow}
                      reviewedIds={submission.workflowReview?.checkedIds}
                    />
                  </details>
                )}
                {submission.feedback && (
                  <p>
                    <strong>
                      <Trans>Reviewer feedback:</Trans>
                    </strong>{' '}
                    {submission.feedback}
                  </p>
                )}
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          ))}
        </section>
      )}
      <h3>
        <Trans>Activity and discussion</Trans>
      </h3>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (await change({ action: 'comment', text: comment }))
            setComment('');
        }}
      >
        <StyledDeliveryStack>
          <label>
            <Trans>Add a note</Trans>
            <input
              required
              maxLength={200}
              disabled={busy || saving}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <StyledDeliveryButton
            disabled={busy || saving || !comment.trim()}
            type="submit"
          >
            <Trans>Post note</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryStack>
      </form>
      {[...details.events].reverse().map((event) => (
        <div key={event.id}>
          <small>
            {memberName(event.actorId)} · {new Date(event.at).toLocaleString()}
          </small>
          <p>{event.text || stateLabel(event.action)}</p>
        </div>
      ))}
    </StyledDeliveryStack>
  );
};
