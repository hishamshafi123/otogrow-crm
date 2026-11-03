import { useState } from 'react';
import { ClientSetupLink } from '@/delivery/onboarding/ClientSetupLink';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { useLingui, Trans } from '@lingui/react/macro';
import {
  type DeliveryCommandRunner,
  type DeliveryTask,
  type DeliveryTaskContext,
} from '@/delivery/delivery.types';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryTaskFormProps = {
  workspace: DeliveryTaskContext;
  task?: DeliveryTask;
  run: DeliveryCommandRunner;
  onSaved: () => void;
  busy: boolean;
  submitDisabled?: boolean;
  saveFailureMessage?: string;
};
export const DeliveryTaskForm = ({
  workspace,
  task,
  run,
  onSaved,
  busy,
  submitDisabled = false,
  saveFailureMessage,
}: DeliveryTaskFormProps) => {
  const { t } = useLingui();
  const [projectId, setProjectId] = useState(
    task?.projectId ?? workspace.projects[0]?.id ?? '',
  );
  const [title, setTitle] = useState(task?.title ?? '');
  const [brief, setBrief] = useState(task?.details.brief ?? '');
  const [service, setService] = useState(task?.details.service ?? '');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? '');
  const [reviewerId, setReviewerId] = useState(
    task?.details.reviewerId ?? workspace.actor.memberId,
  );
  const [priority, setPriority] = useState(task?.details.priority ?? 'NORMAL');
  const [scheduledDate, setScheduledDate] = useState(
    task?.details.scheduledDate ?? '',
  );
  const [dueDate, setDueDate] = useState(task?.dueAt?.slice(0, 10) ?? '');
  const [evidence, setEvidence] = useState(
    task?.details.evidence.join('\n') ?? '',
  );
  const [checklist, setChecklist] = useState(
    task?.details.checklist.map((item) => item.text).join('\n') ?? '',
  );
  const [openedTask, setOpenedTask] = useState(task);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const draft = JSON.stringify({
    projectId,
    title,
    brief,
    service,
    assigneeId,
    reviewerId,
    priority,
    scheduledDate,
    dueDate,
    evidence,
    checklist,
  });
  const [savedDraft, setSavedDraft] = useState(draft);
  const stale = task && task.revision !== openedTask?.revision;
  const { requestAction } = useDeliveryDraftGuard();
  useDeliveryDraftStatus({
    dirty: draft !== savedDraft,
    saving: busy || saving,
  });
  const reloadLatest = () => {
    if (!task) return;
    setProjectId(task.projectId);
    setTitle(task.title);
    setBrief(task.details.brief);
    setService(task.details.service);
    setAssigneeId(task.assigneeId ?? '');
    setReviewerId(task.details.reviewerId);
    setPriority(task.details.priority);
    setScheduledDate(task.details.scheduledDate ?? '');
    setDueDate(task.dueAt?.slice(0, 10) ?? '');
    setEvidence(task.details.evidence.join('\n'));
    setChecklist(task.details.checklist.map((item) => item.text).join('\n'));
    setOpenedTask(task);
    setSaveError('');
    setSavedDraft(
      JSON.stringify({
        projectId: task.projectId,
        title: task.title,
        brief: task.details.brief,
        service: task.details.service,
        assigneeId: task.assigneeId ?? '',
        reviewerId: task.details.reviewerId,
        priority: task.details.priority,
        scheduledDate: task.details.scheduledDate ?? '',
        dueDate: task.dueAt?.slice(0, 10) ?? '',
        evidence: task.details.evidence.join('\n'),
        checklist: task.details.checklist.map((item) => item.text).join('\n'),
      }),
    );
  };
  const project = workspace.projects.find(
    (candidate) => candidate.id === projectId,
  );
  const reviewers = workspace.members.filter(
    (member) => member.id !== assigneeId && member.access !== 'MEMBER',
  );
  const ready =
    title.trim().length > 0 &&
    project?.memberIds.includes(assigneeId) &&
    workspace.members.some((member) => member.id === assigneeId) &&
    reviewers.some((member) => member.id === reviewerId);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || saving || stale || !ready || submitDisabled) return;
        setSaving(true);
        setSaveError('');
        const fields = {
          title,
          brief,
          service,
          assigneeId,
          reviewerId,
          priority,
          scheduledDate: scheduledDate || null,
          dueAt: dueDate ? `${dueDate}T23:59:59.000Z` : null,
          evidence: evidence
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          checklist: checklist
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map(
              (text) =>
                openedTask?.details.checklist.find(
                  (item) => item.text === text,
                ) ?? {
                  id: crypto.randomUUID(),
                  text,
                  done: false,
                },
            ),
        };
        try {
          const saved = await run(
            task
              ? {
                  action: 'edit',
                  taskId: task.id,
                  revision: openedTask?.revision,
                  fields,
                }
              : { action: 'create', projectId, fields },
          );
          if (saved) {
            setSavedDraft(draft);
            onSaved();
          } else
            setSaveError(
              t`Changes were not saved. Your edits are still here. Try again or reload the latest version.`,
            );
        } catch {
          setSaveError(
            t`Changes were not saved. Your edits are still here. Try again.`,
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <StyledDeliveryStack>
        {stale && (
          <div role="alert">
            <p>
              <Trans>
                This task changed while you were editing. Your draft is
                preserved. Reload the latest version before saving.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              onClick={() => requestAction(reloadLatest)}
              disabled={busy || saving}
            >
              <Trans>Reload latest version</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        <fieldset disabled={busy || saving}>
          <StyledDeliveryStack>
            <StyledDeliveryGrid>
              <label>
                <Trans>Title</Trans>
                <input
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              {!task && (
                <label>
                  <Trans>Project</Trans>
                  <select
                    aria-label={t`Project`}
                    required
                    value={projectId}
                    onChange={(event) => {
                      setProjectId(event.target.value);
                      setAssigneeId('');
                    }}
                  >
                    <option value="">{t`Select a project`}</option>
                    {workspace.projects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </StyledDeliveryGrid>
            <StyledDeliveryGrid>
              <label>
                <Trans>Assignee</Trans>
                <select
                  aria-label={t`Assignee`}
                  required
                  value={assigneeId}
                  onChange={(event) => {
                    setAssigneeId(event.target.value);
                    if (event.target.value === reviewerId) setReviewerId('');
                  }}
                >
                  <option value="">{t`Select a teammate`}</option>
                  {workspace.members
                    .filter((member) => project?.memberIds.includes(member.id))
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <Trans>Reviewer</Trans>
                <select
                  aria-label={t`Reviewer`}
                  required
                  value={
                    reviewers.some((member) => member.id === reviewerId)
                      ? reviewerId
                      : ''
                  }
                  onChange={(event) => setReviewerId(event.target.value)}
                >
                  <option value="">{t`Choose an independent reviewer`}</option>
                  {reviewers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Service</Trans>
                <input
                  maxLength={100}
                  placeholder={t`Video, design, SEO…`}
                  value={service}
                  onChange={(event) => setService(event.target.value)}
                />
              </label>
              <label>
                <Trans>Priority</Trans>
                <select
                  aria-label={t`Priority`}
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as 'LOW' | 'NORMAL' | 'HIGH')
                  }
                >
                  <option value="LOW">{t`Low`}</option>
                  <option value="NORMAL">{t`Normal`}</option>
                  <option value="HIGH">{t`High`}</option>
                </select>
              </label>
              <label>
                <Trans>Scheduled day</Trans>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(event) => setScheduledDate(event.target.value)}
                />
              </label>
              <label>
                <Trans>Due date (UTC)</Trans>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>
            </StyledDeliveryGrid>
            <label>
              <Trans>Brief and production notes</Trans>
              <textarea
                maxLength={20000}
                placeholder={t`Expected result, references, music, brand requirements…`}
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
              />
            </label>
            <details
              open={Boolean(
                task?.details.checklist.length || task?.details.evidence.length,
              )}
            >
              <summary>
                <Trans>Checklist and references</Trans> · <Trans>Items</Trans>:{' '}
                {checklist.split('\n').filter((line) => line.trim()).length} ·{' '}
                <Trans>Links</Trans>:{' '}
                {evidence.split('\n').filter((line) => line.trim()).length}
              </summary>
              <StyledDeliveryGrid>
                <label>
                  <Trans>Checklist — one item per line</Trans>
                  <textarea
                    value={checklist}
                    onChange={(event) => setChecklist(event.target.value)}
                  />
                </label>
                <label>
                  <Trans>References and file links — one URL per line</Trans>
                  <textarea
                    placeholder="https://"
                    value={evidence}
                    onChange={(event) => setEvidence(event.target.value)}
                  />
                </label>
              </StyledDeliveryGrid>
            </details>
            {saveError && <p role="alert">{saveFailureMessage ?? saveError}</p>}
            {!ready && (
              <p>
                <Trans>
                  Add a title, choose a project member and select a different
                  person with delivery management access to review the work.
                </Trans>
              </p>
            )}
            {!task &&
              workspace.actor.isManager &&
              !workspace.projects.length && (
                <ClientSetupLink>
                  <Trans>Set up a client project and service plan first</Trans>
                </ClientSetupLink>
              )}
            <StyledDeliveryButton
              data-primary="true"
              type="submit"
              disabled={busy || saving || !!stale || !ready || submitDisabled}
            >
              {task ? t`Save task` : t`Create task`}
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
      </StyledDeliveryStack>
    </form>
  );
};
