import { Trans, useLingui } from '@lingui/react/macro';
import { type FinancePeriodSnapshot } from '@/delivery/finance/finance-period.types';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

type FinancePeriodSummaryProps = {
  summaries: FinancePeriodSnapshot['summaries'];
  showProjects?: boolean;
};

export const FinancePeriodSummary = ({
  summaries,
  showProjects = false,
}: FinancePeriodSummaryProps) => {
  const { t } = useLingui();
  return (
    <StyledDeliveryStack>
      {!summaries.length && (
        <p>
          <Trans>No recorded currency results in this month.</Trans>
        </p>
      )}
      {summaries.map((summary) => (
        <section
          key={summary.currency}
          aria-label={t`${summary.currency} recorded result`}
        >
          <strong>{summary.currency}</strong>
          <p>
            {t`Revenue`}:{' '}
            {formatFinanceAmountMicros(summary.revenueMicros, summary.currency)}{' '}
            · {t`Costs`}:{' '}
            {formatFinanceAmountMicros(summary.costMicros, summary.currency)} ·{' '}
            {t`Result`}:{' '}
            {formatFinanceAmountMicros(summary.resultMicros, summary.currency)}
          </p>
          <small>{t`${summary.postedCount} posted · ${summary.draftCount} draft · ${summary.voidCount} voided`}</small>
          {showProjects && summary.projects.length > 0 && (
            <details>
              <summary>
                <Trans>Client and company allocation</Trans>
              </summary>
              {summary.projects.map((project) => (
                <p key={project.projectId ?? 'company'}>
                  {project.projectId === null || project.projectId === undefined
                    ? t`Company / unassigned`
                    : (project.projectName ??
                      t`Unavailable client project`)}{' '}
                  · {t`Revenue`}:{' '}
                  {formatFinanceAmountMicros(
                    project.revenueMicros,
                    summary.currency,
                  )}{' '}
                  · {t`Costs`}:{' '}
                  {formatFinanceAmountMicros(
                    project.costMicros,
                    summary.currency,
                  )}{' '}
                  · {t`Result`}:{' '}
                  {formatFinanceAmountMicros(
                    project.resultMicros,
                    summary.currency,
                  )}
                </p>
              ))}
            </details>
          )}
        </section>
      ))}
    </StyledDeliveryStack>
  );
};
