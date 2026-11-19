import { useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { IconRefresh } from 'twenty-ui/icon';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';

type DeliveryPageRefreshButtonProps = {
  disabled?: boolean;
  refreshing?: boolean;
  label?: string;
  onClick: () => void;
};

const StyledRefreshLabel = styled.span`
  @media (max-width: 700px) {
    display: none;
  }
`;

export const DeliveryPageRefreshButton = ({
  disabled = false,
  refreshing = false,
  label: customLabel,
  onClick,
}: DeliveryPageRefreshButtonProps) => {
  const { t } = useLingui();
  const label = refreshing ? t`Refreshing…` : (customLabel ?? t`Refresh page`);
  return (
    <StyledDeliveryButton
      type="button"
      data-variant="quiet"
      disabled={disabled || refreshing}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <IconRefresh size={18} aria-hidden />
      <StyledRefreshLabel>{label}</StyledRefreshLabel>
    </StyledDeliveryButton>
  );
};
