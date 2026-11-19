import { Link, useSearchParams } from 'react-router-dom';
import { Trans } from '@lingui/react/macro';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import { DeliveryCommitmentDirectory } from '@/delivery/commitments/DeliveryCommitmentDirectory';
import {
  clientAgreementsParams,
  clientCommitmentsParams,
} from '@/delivery/commitments/clientCommitmentParams';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import {
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const DeliveryCommitmentsPage = () => {
  const [params] = useSearchParams();
  const permission = useWorkflowAccess();
  const selectedView = params.get('clientView');
  return (
    <DeliveryOperationalPage view="clients">
      <StyledDeliveryStack>
        {selectedView && selectedView !== 'commitments' && (
          <div role="status">
            <p>
              <Trans>
                This client view is unavailable. Delivery commitments are shown
                below.
              </Trans>
            </p>
            <Link to={`/delivery?${clientCommitmentsParams(params)}`}>
              <Trans>Use the commitments view</Trans>
            </Link>
          </div>
        )}
        {permission.manager && (
          <StyledDeliveryRow>
            <Link to={`/delivery?${clientAgreementsParams(params)}`}>
              <Trans>Service agreements &amp; client portals</Trans>
            </Link>
            <Link to="/delivery?view=onboarding">
              <Trans>Set up client work</Trans>
            </Link>
          </StyledDeliveryRow>
        )}
        <DeliveryCommitmentDirectory compact />
      </StyledDeliveryStack>
    </DeliveryOperationalPage>
  );
};
