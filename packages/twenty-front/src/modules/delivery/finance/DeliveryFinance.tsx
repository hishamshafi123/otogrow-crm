import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { DeliveryFinanceV2Workspace } from '@/delivery/finance/v2/DeliveryFinanceV2Workspace';

type DeliveryFinanceProps = {
  workspace: DeliveryWorkspace;
  onChanged: () => Promise<unknown>;
  onOpenTask: (id: string) => void;
};

export const DeliveryFinance = ({ onChanged }: DeliveryFinanceProps) => (
  <DeliveryFinanceV2Workspace onChanged={onChanged} />
);
