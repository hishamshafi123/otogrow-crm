import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ClientSetupReceipt as ClientSetupReceiptData } from '@/delivery/onboarding/client-setup.types';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import { deliveryTaskSelection } from '@/delivery/delivery-task-navigation';
import {
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const ClientSetupReceipt = ({
  receipt,
}: {
  receipt: ClientSetupReceiptData;
}) => {
  const [params] = useSearchParams();
  const { t } = useLingui();
  return (
    <StyledDeliveryCard aria-label={t`Saved client setup`}>
      <StyledDeliveryStack>
        <h2>
          <Trans>Client work setup saved</Trans>
        </h2>
        <p role="status">
          {receipt.replayed ? (
            <Trans>
              The earlier request was found. These are its original saved
              project, service plan and task identities.
            </Trans>
          ) : (
            <Trans>
              The reviewed project, service plan and optional first task were
              saved together.
            </Trans>
          )}
        </p>
        <p>
          {receipt.reusedProject ? (
            <Trans>Existing project reused unchanged.</Trans>
          ) : (
            <Trans>New project saved.</Trans>
          )}{' '}
          {receipt.reusedEngagement ? (
            <Trans>Existing service plan reused unchanged.</Trans>
          ) : (
            <Trans>New service plan saved.</Trans>
          )}
        </p>
        <p>
          <Trans>
            Client onboarding, commitment quantities, payment records and
            delivery remain separate next steps. No portal link, invitation or
            message was sent.
          </Trans>
        </p>
        <StyledDeliveryRow>
          <Link
            to={taskPageDestination(params, {
              ...deliveryTaskSelection(null),
              view: 'clients',
              clientView: 'agreements',
              clientEngagement: receipt.engagementId,
            })}
          >
            <Trans>Open saved service plan and onboarding</Trans>
          </Link>
          <Link
            to={taskPageDestination(params, {
              ...deliveryTaskSelection(null),
              view: 'team',
            })}
          >
            <Trans>Review project team</Trans>
          </Link>
          {receipt.taskId && (
            <Link
              to={taskPageDestination(params, {
                ...deliveryTaskSelection(receipt.taskId),
                view: 'planner',
              })}
            >
              <Trans>Open the saved first task</Trans>
            </Link>
          )}
        </StyledDeliveryRow>
        {!receipt.taskId && (
          <p>
            <Trans>
              No first task was requested. You can create work after the project
              has an eligible assignee and a different delivery reviewer.
            </Trans>
          </p>
        )}
        <details>
          <summary>
            <Trans>Saved setup receipt</Trans>
          </summary>
          <p>{receipt.requestId}</p>
          <small>{receipt.createdAt} UTC</small>
        </details>
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
