import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useVisibleChatMessages } from '@/delivery/chat/useVisibleChatMessages';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';
import { SEE_TASK_ASSIGNMENT } from '@/delivery/tasks/delivery-tasks.graphql';
import { type SeeDeliveryTaskAssignmentMutation } from '~/generated-metadata/graphql';
type DeliveryTaskAssignmentReadProps = {
  taskId: string;
  assignmentKey: string;
  scope: string;
  enabled: boolean;
  identity: { workspaceId: string; memberId: string; userWorkspaceId: string };
};
export const DeliveryTaskAssignmentRead = ({
  taskId,
  assignmentKey,
  scope,
  enabled,
  identity,
}: DeliveryTaskAssignmentReadProps) => {
  const { t } = useLingui();
  const container = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState(false);
  const [seen, setSeen] = useState(false);
  const [mutate] =
    useMutation<SeeDeliveryTaskAssignmentMutation>(SEE_TASK_ASSIGNMENT);
  // oxlint-disable-next-line twenty/no-state-useref -- A receipt response cannot update a different assignment or identity.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [
    enabled,
    assignmentKey,
    scope,
    identity.workspaceId,
    identity.memberId,
    identity.userWorkspaceId,
  ]);
  const markRead = useCallback(async () => {
    if (!enabled) return false;
    const started = epoch.current;
    try {
      const receipt = (
        await mutate({
          variables: {
            input: { taskId, expectedAssignmentKey: assignmentKey },
          },
        })
      ).data?.seeDeliveryTaskAssignment;
      if (started !== epoch.current) return false;
      if (
        !receipt?.seen ||
        receipt.workspaceId !== identity.workspaceId ||
        receipt.memberId !== identity.memberId ||
        receipt.userWorkspaceId !== identity.userWorkspaceId ||
        receipt.taskId !== taskId
      )
        throw new Error();
      setSeen(true);
      setFailure(false);
      return true;
    } catch {
      if (started === epoch.current) setFailure(true);
      return false;
    }
  }, [
    enabled,
    mutate,
    taskId,
    assignmentKey,
    identity.workspaceId,
    identity.memberId,
    identity.userWorkspaceId,
  ]);
  useVisibleChatMessages(
    container,
    `${scope}:${assignmentKey}`,
    enabled && !failure && !seen,
    markRead,
  );
  if (!enabled) return null;
  return (
    <div ref={container}>
      <section
        data-unread-message={taskId}
        aria-label={t`Your production assignment`}
      >
        <small>
          <Trans>This production task is assigned to you.</Trans>
        </small>
        {failure && (
          <>
            <p role="alert">
              <Trans>
                The assignment read receipt was not confirmed. Your task changes
                are separate.
              </Trans>
            </p>
            <StyledDeliveryButton onClick={() => void markRead()}>
              <Trans>Retry task read receipt</Trans>
            </StyledDeliveryButton>
          </>
        )}
      </section>
    </div>
  );
};
