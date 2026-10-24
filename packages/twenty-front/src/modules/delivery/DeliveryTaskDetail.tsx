import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { DeliveryTaskForm } from '@/delivery/DeliveryTaskForm';
import {
  type DeliveryCommandRunner,
  type DeliveryTask,
  type DeliveryWorkspace,
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
  workspace: DeliveryWorkspace;
  run: DeliveryCommandRunner;
  busy: boolean;
  celebrateApproval: boolean;
  stateLabel: (state: string) => string;
};
export const DeliveryTaskDetail = ({
  task,
  workspace,
  run,
  busy,
  stateLabel,
  celebrateApproval,
}: DeliveryTaskDetailProps) => {
  const { t } = useLingui();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(task.details.draftCopy ?? '');
  const [evidence, setEvidence] = useState(task.details.evidence.join('\n'));
  const [feedback, setFeedback] = useState('');
  const [comment, setComment] = useState('');
  const [blocker, setBlocker] = useState(task.details.blocker);
  const [celebrated, setCelebrated] = useState(celebrateApproval);
  const { details } = task;
  const canProduce =
    workspace.actor.memberId === task.assigneeId &&
    !['IN_REVIEW', 'APPROVED'].includes(details.state);
  const canReview =
    workspace.actor.isManager &&
    workspace.actor.memberId === details.reviewerId &&
    workspace.actor.memberId !== task.assigneeId &&
    details.state === 'IN_REVIEW';
  const memberName = (id: string) =>
    workspace.members.find((member) => member.id === id)?.name ??
    t`Former teammate`;
  const change = (input: Record<string, unknown>) =>
    run({ ...input, taskId: task.id, revision: task.revision });
  if (editing)
    return (
      <StyledDeliveryStack>
        <StyledDeliveryButton onClick={() => setEditing(false)}>
          <Trans>Cancel editing</Trans>
        </StyledDeliveryButton>
        <DeliveryTaskForm
          workspace={workspace}
          task={task}
          run={run}
          busy={busy}
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
            <StyledDeliveryButton onClick={() => setEditing(true)}>
              <Trans>Edit assignment</Trans>
            </StyledDeliveryButton>
          )}
      </StyledDeliveryRow>
      <h2>{task.title}</h2>
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
        <Trans>Reviewed by</Trans> {memberName(details.reviewerId)}
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
          {details.evidence.map((url) => (
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
      <StyledDeliveryStack>
        <h3>
          <Trans>Checklist</Trans>
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
              disabled={!canProduce || busy}
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
              disabled={busy}
              onClick={() =>
                void change({
                  action: 'progress',
                  state: 'IN_PROGRESS',
                  blocker: '',
                  checklist: details.checklist,
                  evidence: details.evidence,
                })
              }
            >
              <Trans>Start or resume work</Trans>
            </StyledDeliveryButton>
            <label>
              <Trans>What is blocking you?</Trans>
              <input
                value={blocker}
                onChange={(event) => setBlocker(event.target.value)}
              />
            </label>
            <StyledDeliveryButton
              disabled={busy || !blocker.trim()}
              onClick={() =>
                void change({
                  action: 'progress',
                  state: 'BLOCKED',
                  blocker,
                  checklist: details.checklist,
                  evidence: details.evidence,
                })
              }
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
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label>
              <Trans>Deliverable links — one URL per line</Trans>
              <textarea
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
              />
            </label>
            <StyledDeliveryButton
              data-primary="true"
              disabled={
                busy ||
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
                )
                  setDescription('');
              }}
            >
              <Trans>Submit to reviewer</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}
      {canReview && (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <h3>
              <Trans>Review this submission</Trans>
            </h3>
            <label>
              <Trans>Feedback</Trans>
              <textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
              />
            </label>
            <StyledDeliveryRow>
              <StyledDeliveryButton
                disabled={busy || !feedback.trim()}
                onClick={() =>
                  void change({
                    action: 'review',
                    decision: 'CHANGES_REQUESTED',
                    feedback,
                  })
                }
              >
                <Trans>Request changes</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton
                data-primary="true"
                disabled={busy}
                onClick={async () => {
                  if (
                    await change({
                      action: 'review',
                      decision: 'APPROVED',
                      feedback,
                    })
                  )
                    setCelebrated(true);
                }}
              >
                <Trans>Approve submission</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}
      <h3>
        <Trans>Submission history</Trans>
      </h3>
      {!details.submissions.length && (
        <small>
          <Trans>No submissions yet. Completed work will appear here.</Trans>
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
              {new Date(submission.submittedAt).toLocaleString()}
            </small>
            <p>{submission.description}</p>
            {submission.evidence.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            ))}
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
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <StyledDeliveryButton
            disabled={busy || !comment.trim()}
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
