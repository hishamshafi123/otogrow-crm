import { Trans } from '@lingui/react/macro';
import { useLocation, useSearchParams } from 'react-router-dom';
import { DeliveryFounderExceptions } from '@/delivery/founder/DeliveryFounderExceptions';
import { DeliveryReadiness } from '@/delivery/readiness/DeliveryReadiness';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

export const DeliveryCompanyOverviewPage = () => {
  const [params] = useSearchParams();
  const location = useLocation();
  return (
    <DeliveryOperationalPage view="health">
      <StyledDeliveryStack>
        <DeliveryFounderExceptions />
        <details
          id="company-readiness"
          open={
            params.has('readinessStatus') ||
            location.hash === '#company-readiness'
          }
        >
          <summary>
            <Trans>Connection readiness</Trans>
          </summary>
          <DeliveryReadiness />
        </details>
      </StyledDeliveryStack>
    </DeliveryOperationalPage>
  );
};
