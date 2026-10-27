import { Trans } from '@lingui/react/macro';
import { useSearchParams } from 'react-router-dom';
import { DeliveryAgents } from '@/delivery/DeliveryAgents';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { StyledAiBudgetActions } from '@/otogrow-ai-budget/aiBudgetStyles';
import { OtogrowAiBudget } from '@/otogrow-ai-budget/OtogrowAiBudget';

type DeliveryAiWorkspaceProps = {
  workspace: DeliveryWorkspace;
  onTaskChanged: () => Promise<unknown>;
};
export const DeliveryAiWorkspace = ({
  workspace,
  onTaskChanged,
}: DeliveryAiWorkspaceProps) => {
  const [params, setParams] = useSearchParams();
  const { requestAction } = useDeliveryDraftGuard();
  const spending = params.get('agentView') === 'spending';
  const select = (value: string) =>
    requestAction(() => {
      const next = new URLSearchParams(params);
      next.set('agentView', value);
      setParams(next);
    });
  return (
    <StyledDeliveryStack>
      {workspace.actor.isAdmin && (
        <StyledAiBudgetActions>
          <StyledDeliveryButton
            aria-current={!spending ? 'page' : undefined}
            onClick={() => select('assistants')}
          >
            <Trans>Assistants</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            aria-current={spending ? 'page' : undefined}
            onClick={() => select('spending')}
          >
            <Trans>AI spending</Trans>
          </StyledDeliveryButton>
        </StyledAiBudgetActions>
      )}
      {spending ? (
        <OtogrowAiBudget workspace={workspace} />
      ) : (
        <DeliveryAgents workspace={workspace} onTaskChanged={onTaskChanged} />
      )}
    </StyledDeliveryStack>
  );
};
