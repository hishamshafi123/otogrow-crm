import { useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type DeliveryTask } from '@/delivery/delivery.types';
import { StyledDeliveryBadge } from '@/delivery/deliveryStyles';

const StyledTask = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  color: inherit;
  display: grid;
  gap: 8px 20px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 16px;
  text-align: left;
  width: 100%;
  &:hover {
    border-color: ${themeCssVariables.color.blue8};
  }
  strong {
    overflow-wrap: anywhere;
  }
  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
const StyledIdentity = styled.span`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;
const StyledTiming = styled.small`
  align-items: end;
  display: flex;
  flex-direction: column;
  gap: 4px;
  @media (max-width: 700px) {
    align-items: start;
  }
`;
const StyledProgress = styled.span`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  progress {
    accent-color: ${themeCssVariables.color.blue9};
    height: 6px;
    max-width: 100%;
    width: 100px;
  }
`;
const StyledNext = styled.small`
  grid-column: 1 / -1;
  overflow-wrap: anywhere;
`;

type DeliveryMyWorkTaskProps = {
  task: DeliveryTask;
  projectName: string;
  statusLabel: string;
  onOpen: () => void;
};

export const DeliveryMyWorkTask = ({
  task,
  projectName,
  statusLabel,
  onOpen,
}: DeliveryMyWorkTaskProps) => {
  const { t } = useLingui();
  const completed = task.details.checklist.filter((item) => item.done).length;
  const total = task.details.checklist.length;
  const nextAction =
    task.details.state === 'CHANGES_REQUESTED'
      ? t`Read feedback and revise`
      : task.details.state === 'BLOCKED'
        ? t`Update the blocker for your manager`
        : task.details.state === 'IN_REVIEW'
          ? t`Waiting for your reviewer`
          : task.details.state === 'APPROVED'
            ? t`View approved work`
            : task.details.state === 'IN_PROGRESS'
              ? t`Continue work and update progress`
              : t`Open the brief and checklist`;
  const scheduledDate = task.details.scheduledDate
    ? new Date(`${task.details.scheduledDate}T12:00:00`).toLocaleDateString()
    : null;
  return (
    <StyledTask onClick={onOpen}>
      <span>
        <StyledIdentity>
          <strong>{task.title}</strong>
          <StyledDeliveryBadge data-state={task.details.state}>
            {statusLabel}
          </StyledDeliveryBadge>
        </StyledIdentity>
        <small>
          {projectName} · {task.details.service}
        </small>
      </span>
      <StyledTiming>
        {scheduledDate && <span>{t`Scheduled ${scheduledDate}`}</span>}
        {task.dueAt ? (
          <span>{t`Due ${new Date(task.dueAt).toLocaleDateString()}`}</span>
        ) : !scheduledDate ? (
          <span>{t`Timing not set`}</span>
        ) : null}
        {task.details.priority === 'HIGH' && <span>{t`High priority`}</span>}
      </StyledTiming>
      <StyledProgress>
        <small>{nextAction}</small>
        {total > 0 && (
          <>
            <progress
              aria-label={t`Custom checklist progress`}
              value={completed}
              max={total}
            />
            <small>{t`${completed}/${total} custom checklist items`}</small>
          </>
        )}
      </StyledProgress>
      {task.details.state === 'BLOCKED' && task.details.blocker && (
        <StyledNext>
          {task.details.blocker.length > 180
            ? `${task.details.blocker.slice(0, 180)}…`
            : task.details.blocker}
        </StyledNext>
      )}
    </StyledTask>
  );
};
