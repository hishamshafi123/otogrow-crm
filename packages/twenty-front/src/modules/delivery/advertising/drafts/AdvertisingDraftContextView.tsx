import { Trans, useLingui } from '@lingui/react/macro';
import { type AdvertisingDraftPreview } from '@/delivery/advertising/drafts/advertising-draft-types';
import { useAdvertisingLabels } from '@/delivery/advertising/workbench/useAdvertisingLabels';
import {
  StyledAdvertisingFacts,
  StyledAdvertisingItem,
  StyledAdvertisingText,
} from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

export const AdvertisingDraftContextView = ({
  context,
}: {
  context: AdvertisingDraftPreview['context'];
}) => {
  const { t } = useLingui();
  const labels = useAdvertisingLabels();
  return (
    <StyledDeliveryStack>
      <StyledAdvertisingFacts>
        <dt>
          <Trans>Report</Trans>
        </dt>
        <dd>{context.source.title}</dd>
        <dt>
          <Trans>Ad account</Trans>
        </dt>
        <dd>{context.source.accountId ?? t`Not recorded`}</dd>
        <dt>
          <Trans>Reporting period</Trans>
        </dt>
        <dd>
          {context.source.fromDate} – {context.source.throughDate} ·{' '}
          {context.source.timezone ?? t`Timezone not recorded`}
        </dd>
        <dt>
          <Trans>Reporting currency</Trans>
        </dt>
        <dd>{context.source.currency}</dd>
        <dt>
          <Trans>Reported spend</Trans>
        </dt>
        <dd>
          {labels.money(context.source.spendMicros, context.source.currency)}
        </dd>
        <dt>
          <Trans>Business outcome</Trans>
        </dt>
        <dd>
          {labels.goal(context.goal.kind)} · {labels.count(context.goal.value)}
          {context.goal.metricUnit === 'MONEY'
            ? ` ${context.source.currency}`
            : ''}{' '}
          · {labels.provenance(context.goal.metricProvenance)}
        </dd>
        <dt>
          <Trans>Selected metric</Trans>
        </dt>
        <dd>
          {context.goal.metricLabel ?? t`Not mapped`}
          {context.goal.metricReason &&
            ` · ${labels.reason(context.goal.metricReason)}`}
        </dd>
        <dt>
          <Trans>Target cost per outcome</Trans>
        </dt>
        <dd>
          {context.goal.targetCostMicros == null
            ? t`Not provided`
            : labels.money(
                context.goal.targetCostMicros,
                context.source.currency,
              )}
        </dd>
      </StyledAdvertisingFacts>
      {context.goal.evidence && (
        <>
          <strong>
            <Trans>Human-provided outcome evidence</Trans>
          </strong>
          <StyledAdvertisingText>{context.goal.evidence}</StyledAdvertisingText>
        </>
      )}
      <details>
        <summary>
          <Trans>Report and brand evidence sent</Trans>
        </summary>
        <StyledDeliveryStack>
          {context.metrics.map((metric) => (
            <StyledAdvertisingItem key={metric.key}>
              <strong>{metric.label}</strong>
              <p>
                {labels.count(metric.value)}
                {metric.unit === 'MONEY'
                  ? ` ${context.source.currency}`
                  : ''} ·{' '}
                {labels.provenance(metric.provenance)}
              </p>
              {metric.reason && <p>{labels.reason(metric.reason)}</p>}
            </StyledAdvertisingItem>
          ))}
          <p>{t`${context.knowledge.sources.length} of ${context.knowledge.totalSources} published knowledge sources included; ${context.knowledge.omittedSources} omitted.`}</p>
          {context.knowledge.sources.map((source) => (
            <StyledAdvertisingItem key={`${source.sourceId}:${source.version}`}>
              <h6>
                {source.title} · {t`version ${source.version}`}
              </h6>
              <StyledAdvertisingText>{source.knowledge}</StyledAdvertisingText>
              {source.truncated && (
                <p>
                  <Trans>This source was shortened for the request.</Trans>
                </p>
              )}
            </StyledAdvertisingItem>
          ))}
          {context.instructions && (
            <>
              <h6>
                <Trans>Your additional requirements</Trans>
              </h6>
              <StyledAdvertisingText>
                {context.instructions}
              </StyledAdvertisingText>
            </>
          )}
          {context.assistantInstructions === null ? (
            <p>
              <Trans>
                Assistant settings are private; the configuration version is
                recorded.
              </Trans>
            </p>
          ) : context.assistantInstructions === undefined ? (
            <p>
              <Trans>Assistant settings could not be verified.</Trans>
            </p>
          ) : (
            <details>
              <summary>
                <Trans>Administrator assistant settings</Trans>
              </summary>
              <StyledAdvertisingText>
                {context.assistantInstructions}
              </StyledAdvertisingText>
            </details>
          )}
        </StyledDeliveryStack>
      </details>
    </StyledDeliveryStack>
  );
};
