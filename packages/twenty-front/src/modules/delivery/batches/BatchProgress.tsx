import { Trans, useLingui } from '@lingui/react/macro';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  StyledWorkflowActions,
  StyledWorkflowList,
} from '@/delivery/workflows/workflowStyles';
import {
  type BatchSnapshot,
  type BatchTask,
} from '@/delivery/batches/batch.types';
import { useBatchLabels } from '@/delivery/batches/useBatchLabels';

const COUNT_ORDER = [
  'ALL',
  'UNIQUE_VIDEO',
  'VARIATION',
  'OTHER',
  'UNCLASSIFIED',
  'UNAVAILABLE',
];

type BatchProgressProps = {
  data: BatchSnapshot;
  onOpenTask: (id: string) => void;
  onEdit: (task: BatchTask, remove?: boolean) => void;
};
export const BatchProgress = ({
  data,
  onOpenTask,
  onEdit,
}: BatchProgressProps) => {
  const { t } = useLingui();
  const label = useBatchLabels();
  return (
    <StyledDeliveryStack>
      <StyledDeliveryGrid aria-label={t`Whole batch progress`}>
        {[...data.counts]
          .sort(
            (left, right) =>
              COUNT_ORDER.indexOf(left.key) - COUNT_ORDER.indexOf(right.key),
          )
          .map((count) => (
            <section key={count.key} aria-label={label(count.key)}>
              <strong>{label(count.key)}</strong>
              <p>{t`${count.total} planned · ${count.approved} approved · ${count.fulfilled} fulfilled`}</p>
            </section>
          ))}
      </StyledDeliveryGrid>
      <small>
        <Trans>
          Approval is an internal check. Fulfilment requires confirmation for
          the current delivered version. Unclassified tasks have no matching
          commitment allocation. A task can appear in several batches; do not
          add batch totals together.
        </Trans>
      </small>
      <StyledWorkflowList aria-label={t`Tasks in this batch`}>
        {data.tasks.map((task) => (
          <li key={task.taskId}>
            <StyledDeliveryStack>
              <StyledWorkflowActions>
                {task.available ? (
                  <StyledDeliveryButton onClick={() => onOpenTask(task.taskId)}>
                    {task.title}
                  </StyledDeliveryButton>
                ) : (
                  <strong>{task.title}</strong>
                )}
                <span>
                  {task.available
                    ? label(task.state ?? '')
                    : t`No longer available in this project`}
                </span>
              </StyledWorkflowActions>
              {task.concept && <p>{task.concept}</p>}
              {task.available && (
                <>
                  <small>{t`Owner: ${task.assigneeName || t`Unassigned`} · Reviewer: ${task.reviewerName || t`Unassigned`}`}</small>
                  <small>
                    {label(task.unit)} · {t`Task revision ${task.taskRevision}`}{' '}
                    ·{' '}
                    {task.submissionVersion
                      ? t`Submission ${task.submissionVersion}`
                      : t`Not submitted`}{' '}
                    · {task.fulfilled ? t`Fulfilled` : t`Not yet fulfilled`}
                  </small>
                  {task.state === 'IN_REVIEW' &&
                    task.submissionVersion !== null && (
                      <StyledWorkflowActions>
                        <StyledDeliveryButton
                          data-primary="true"
                          onClick={() => onOpenTask(task.taskId)}
                        >
                          <Trans>Inspect submission and review</Trans>
                        </StyledDeliveryButton>
                      </StyledWorkflowActions>
                    )}
                  {task.state === 'IN_REVIEW' &&
                    task.submissionVersion === null && (
                      <small>
                        <Trans>
                          No submission is attached. Open the task to resolve
                          it.
                        </Trans>
                      </small>
                    )}
                </>
              )}
              {data.canManage && !data.selected?.closed && (
                <StyledWorkflowActions>
                  {task.available && (
                    <StyledDeliveryButton onClick={() => onEdit(task)}>
                      <Trans>Edit concept</Trans>
                    </StyledDeliveryButton>
                  )}
                  <StyledDeliveryButton onClick={() => onEdit(task, true)}>
                    <Trans>Remove from batch</Trans>
                  </StyledDeliveryButton>
                </StyledWorkflowActions>
              )}
            </StyledDeliveryStack>
          </li>
        ))}
      </StyledWorkflowList>
      {!data.tasks.length && (
        <p>
          <Trans>
            No tasks on this page. Add existing project tasks to start the plan.
          </Trans>
        </p>
      )}
    </StyledDeliveryStack>
  );
};
