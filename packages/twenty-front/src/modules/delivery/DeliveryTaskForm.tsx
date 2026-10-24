import { useState } from 'react';
import { useLingui, Trans } from '@lingui/react/macro';
import {
  type DeliveryCommandRunner,
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryTaskFormProps = {
  workspace: DeliveryWorkspace;
  task?: DeliveryTask;
  run: DeliveryCommandRunner;
  onSaved: () => void;
  busy: boolean;
};
export const DeliveryTaskForm = ({
  workspace,
  task,
  run,
  onSaved,
  busy,
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
  const project = workspace.projects.find(
    (candidate) => candidate.id === projectId,
  );
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
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
                task?.details.checklist.find((item) => item.text === text) ?? {
                  id: crypto.randomUUID(),
                  text,
                  done: false,
                },
            ),
        };
        const saved = await run(
          task
            ? {
                action: 'edit',
                taskId: task.id,
                revision: task.revision,
                fields,
              }
            : { action: 'create', projectId, fields },
        );
        if (saved) onSaved();
      }}
    >
      <StyledDeliveryStack>
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
        <StyledDeliveryGrid>
          <label>
            <Trans>Assignee</Trans>
            <select
              required
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
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
              required
              value={reviewerId}
              onChange={(event) => setReviewerId(event.target.value)}
            >
              {workspace.members
                .filter(
                  (member) =>
                    member.id !== assigneeId &&
                    (member.id === workspace.actor.memberId ||
                      member.access !== 'MEMBER'),
                )
                .map((member) => (
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
        <StyledDeliveryButton
          data-primary="true"
          type="submit"
          disabled={busy || !workspace.projects.length}
        >
          {task ? t`Save changes` : t`Create task`}
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
