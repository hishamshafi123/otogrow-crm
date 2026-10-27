import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryFinanceQuery } from '~/generated-metadata/graphql';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceMonthlyResultsProps = {
  summaries: DeliveryFinanceQuery['deliveryFinance']['summaries'];
};
export const FinanceMonthlyResults = ({
  summaries,
}: FinanceMonthlyResultsProps) => {
  const { t } = useLingui();
  return (
    <StyledDeliveryStack>
      {!summaries.length && (
        <p>
          <Trans>
            No monthly entries have been recorded. Prepare cost drafts or add an
            explicit revenue or cost entry.
          </Trans>
        </p>
      )}
      {summaries.map((summary) => (
        <StyledDeliveryCard key={summary.currency}>
          <StyledDeliveryStack>
            <h3>
              {summary.currency} · <Trans>Recorded monthly result</Trans>
            </h3>
            <StyledDeliveryGrid>
              {[
                [t`Recognized revenue`, summary.revenueMicros],
                [t`Recognized costs`, summary.costMicros],
                [t`Recorded result`, summary.resultMicros],
              ].map(([label, amount]) => (
                <div key={label}>
                  <small>{label}</small>
                  <h3>{formatFinanceAmountMicros(amount, summary.currency)}</h3>
                </div>
              ))}
            </StyledDeliveryGrid>
            <p>{t`${summary.postedCount} posted · ${summary.draftCount} draft · ${summary.voidCount} voided`}</p>
            {(summary.unassignedRevenueMicros !== '0' ||
              summary.unassignedCostMicros !== '0') && (
              <p role="status">
                {t`Company / unassigned revenue`}:{' '}
                {formatFinanceAmountMicros(
                  summary.unassignedRevenueMicros,
                  summary.currency,
                )}{' '}
                · {t`Company / unassigned costs`}:{' '}
                {formatFinanceAmountMicros(
                  summary.unassignedCostMicros,
                  summary.currency,
                )}
                .{' '}
                <Trans>
                  Client figures exclude these shared amounts and are not fully
                  allocated profit.
                </Trans>
              </p>
            )}
            <h4>
              <Trans>Recorded results by client project</Trans>
            </h4>
            {summary.projects.map((project) => (
              <div key={project.projectId ?? 'company'}>
                <strong>
                  {project.projectName ?? t`Company / unassigned`}
                </strong>
                <p>
                  {t`Revenue`}:{' '}
                  {formatFinanceAmountMicros(
                    project.revenueMicros,
                    summary.currency,
                  )}{' '}
                  · {t`Costs`}:{' '}
                  {formatFinanceAmountMicros(
                    project.costMicros,
                    summary.currency,
                  )}{' '}
                  · {t`Contribution`}:{' '}
                  {formatFinanceAmountMicros(
                    project.resultMicros,
                    summary.currency,
                  )}
                </p>
              </div>
            ))}
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      ))}
      <p>
        <Trans>
          Results include posted monthly entries only. Cash receipts, salary
          payments, revision estimates and AI usage are not added automatically.
          Review those sources before treating this as complete profitability.
        </Trans>
      </p>
    </StyledDeliveryStack>
  );
};
