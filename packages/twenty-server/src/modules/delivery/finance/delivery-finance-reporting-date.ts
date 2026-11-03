import { type EntityManager } from 'typeorm';
import { DeliveryFinanceForecastAnchorEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-anchor.entity';
import { financeForecastBusinessDate } from 'src/modules/delivery/finance/delivery-finance-forecast.policy';
import { deliveryCurrencySchema } from 'src/modules/delivery/business/delivery-business.types';

type FinanceReportingClock = {
  timezone: string;
  businessDate: string;
  confirmed: boolean;
};
export type FinanceReportingClocks = {
  byCurrency: Map<string, FinanceReportingClock>;
  fallback: FinanceReportingClock;
};
export const readFinanceReportingClocks = async (
  manager: EntityManager,
  workspaceId: string,
  now = new Date(),
): Promise<FinanceReportingClocks> => {
  const anchors = await manager
    .getRepository(DeliveryFinanceForecastAnchorEntity)
    .findBy({ workspaceId });
  return {
    byCurrency: new Map(
      anchors.map((anchor) => [
        anchor.currency,
        {
          timezone: anchor.timezone,
          businessDate: financeForecastBusinessDate(anchor.timezone, now),
          confirmed: true,
        },
      ]),
    ),
    fallback: {
      timezone: 'UTC',
      businessDate: financeForecastBusinessDate('UTC', now),
      confirmed: false,
    },
  };
};
export const financeReportingClock = (
  clocks: FinanceReportingClocks,
  currency: string,
) => clocks.byCurrency.get(currency) ?? clocks.fallback;

export const projectFinanceReportingClocks = (clocks: FinanceReportingClocks) =>
  deliveryCurrencySchema.options.map((currency) => ({
    currency,
    ...financeReportingClock(clocks, currency),
  }));
