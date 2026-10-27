import { type ReactNode } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';

import { type DeliveryTask } from '@/delivery/delivery.types';
import {
  DELIVERY_WORK_GROUPS,
  groupDeliveryWork,
  type DeliveryWorkGroup,
} from '@/delivery/groupDeliveryWork';
import {
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryMyWorkQueueProps = {
  tasks: DeliveryTask[];
  renderTask: (task: DeliveryTask) => ReactNode;
  approvedOnly?: boolean;
};

export const DeliveryMyWorkQueue = ({
  tasks,
  renderTask,
  approvedOnly = false,
}: DeliveryMyWorkQueueProps) => {
  const { t } = useLingui();
  const groups = groupDeliveryWork(tasks, new Date());
  const labels: Record<
    DeliveryWorkGroup,
    { title: string; description: string }
  > = {
    revisions: {
      title: t`Changes to make`,
      description: t`Read the review feedback, make changes and submit again.`,
    },
    blocked: {
      title: t`Blocked`,
      description: t`Update what is stopping the work so your manager can help.`,
    },
    overdue: {
      title: t`Overdue`,
      description: t`These deadlines have passed. Finish the work or agree a new deadline with your manager.`,
    },
    today: {
      title: t`Work on next`,
      description: t`In progress, due today or scheduled for today and earlier. High-priority work comes first.`,
    },
    upcoming: {
      title: t`Upcoming`,
      description: t`Check the brief and assets before the scheduled work begins.`,
    },
    unscheduled: {
      title: t`Needs a schedule`,
      description: t`These assignments have no dates yet. Confirm timing with your manager.`,
    },
    review: {
      title: t`Waiting for approval`,
      description: t`Your work is with a reviewer. Watch for feedback before making further changes.`,
    },
    approved: {
      title: t`Approved work`,
      description: t`Internally approved work. Client delivery and fulfilment are tracked separately.`,
    },
  };
  const actionableCount = DELIVERY_WORK_GROUPS.filter(
    (group) => !['review', 'approved'].includes(group),
  ).reduce((count, group) => count + groups[group].length, 0);
  return (
    <StyledDeliveryStack>
      {!actionableCount && tasks.length > 0 && !approvedOnly && (
        <p role="status">
          <Trans>
            No production work needs your action in this view. Your reviews and
            approved work are below.
          </Trans>
        </p>
      )}
      {DELIVERY_WORK_GROUPS.filter((group) => groups[group].length > 0).map(
        (group) => {
          const content = (
            <StyledDeliveryStack>
              <p>{labels[group].description}</p>
              <StyledDeliveryGrid>
                {groups[group].map(renderTask)}
              </StyledDeliveryGrid>
            </StyledDeliveryStack>
          );
          return group === 'approved' ? (
            <StyledDeliveryCard key={group}>
              <details open={approvedOnly || undefined}>
                <summary>
                  {labels[group].title} ({groups[group].length})
                </summary>
                {content}
              </details>
            </StyledDeliveryCard>
          ) : (
            <section key={group} aria-label={labels[group].title}>
              <StyledDeliveryRow>
                <h2>
                  {labels[group].title} ({groups[group].length})
                </h2>
              </StyledDeliveryRow>
              {content}
            </section>
          );
        },
      )}
    </StyledDeliveryStack>
  );
};
