import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { isValidUuid } from 'twenty-shared/utils';
import { AtlasMediaSettings } from '@/delivery/creative/atlas/AtlasMediaSettings';
import { DeliveryAiWorkspaceNavigation } from '@/delivery/creative/atlas/DeliveryAiWorkspaceNavigation';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { deliveryTaskDestination } from '@/delivery/delivery-task-navigation';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { NavigationDrawerCollapseButton } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerCollapseButton';
import { useNavigationDrawerExpanded } from '@/navigation/hooks/useNavigationDrawerExpanded';
import {
  StyledDeliveryCanvas,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
export const AtlasMediaPage = () => {
  const { t } = useLingui();
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  const expanded = useNavigationDrawerExpanded();
  const administrator =
    permission.ready &&
    permission.access?.capabilities.includes('workspace.admin') === true;
  const taskId = params.get('task');
  return (
    <PageContainer>
      <PageBody>
        <StyledDeliveryCanvas>
          <StyledDeliveryStack>
            <StyledDeliveryRow>
              <StyledDeliveryRow>
                {!expanded && (
                  <NavigationDrawerCollapseButton direction="right" />
                )}
                <div>
                  <h1>
                    <Trans>Media models</Trans>
                  </h1>
                  <p>
                    <Trans>
                      Choose permitted Atlas models and defaults for new
                      production requests.
                    </Trans>
                  </p>
                </div>
              </StyledDeliveryRow>
              {taskId && isValidUuid(taskId) && (
                <Link
                  to={deliveryTaskDestination(params, taskId, 'creative', {
                    view: 'creative',
                    agentView: null,
                  })}
                >{t`Back to creative production`}</Link>
              )}
              {!administrator && !(taskId && isValidUuid(taskId)) && (
                <Link
                  to={taskPageDestination(params, {
                    view: 'home',
                    agentView: null,
                  })}
                >
                  <Trans>Go to Today</Trans>
                </Link>
              )}
            </StyledDeliveryRow>
            <DeliveryAiWorkspaceNavigation administrator={administrator} />
            <AtlasMediaSettings key={permission.scope} />
          </StyledDeliveryStack>
        </StyledDeliveryCanvas>
      </PageBody>
    </PageContainer>
  );
};
