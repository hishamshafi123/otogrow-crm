import { Link } from 'react-router-dom';
import { creativeLearningAdDestination } from '@/delivery/creative/learning/creative-learning-navigation';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { useAdvertisingLabels } from '@/delivery/advertising/workbench/useAdvertisingLabels';
import {
  StyledAdvertisingFacts,
  StyledAdvertisingItem,
} from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { parseFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { type DeliveryAdvertisingSourceQuery } from '~/generated-metadata/graphql';
import { DateTimeDisplay } from '@/ui/field/display/components/DateTimeDisplay';

export type AdvertisingSourceEvidence =
  DeliveryAdvertisingSourceQuery['deliveryAdvertisingSource'];
type AdvertisingEvidenceProps = {
  data: AdvertisingSourceEvidence;
  onAdPage: (offset: number) => void;
  onMetricAd: (id: string | null) => void;
  metricsOpen?: boolean;
  adsOpen?: boolean;
  onMetricsToggle?: (open: boolean) => void;
  onAdsToggle?: (open: boolean) => void;
};
export const AdvertisingEvidence = ({
  data,
  onAdPage,
  onMetricAd,
  metricsOpen,
  adsOpen,
  onMetricsToggle,
  onAdsToggle,
}: AdvertisingEvidenceProps) => {
  const { t } = useLingui();
  const labels = useAdvertisingLabels();
  const nextOffset = data.nextAdOffset;
  return (
    <StyledDeliveryStack>
      <StyledAdvertisingFacts>
        <dt>
          <Trans>Evidence source</Trans>
        </dt>
        <dd>
          {labels.source(data.source.kind)} · {data.source.channel}
        </dd>
        {data.source.accountId && (
          <>
            <dt>
              <Trans>Meta ad account</Trans>
            </dt>
            <dd>{data.source.accountId}</dd>
          </>
        )}
        <dt>
          <Trans>Reporting period</Trans>
        </dt>
        <dd>
          {data.source.fromDate} – {data.source.throughDate}
        </dd>
        <dt>
          <Trans>Reporting timezone</Trans>
        </dt>
        <dd>{data.source.timezone ?? t`Not recorded`}</dd>
        <dt>
          <Trans>Evidence recorded</Trans>
        </dt>
        <dd>
          {data.recordedAt ? (
            <DateTimeDisplay value={data.recordedAt} />
          ) : (
            t`Unknown`
          )}
        </dd>
        <dt>
          <Trans>Provider last checked</Trans>
        </dt>
        <dd>
          {data.lastCheckedAt ? (
            <DateTimeDisplay value={data.lastCheckedAt} />
          ) : (
            t`Not recorded`
          )}
        </dd>
        <dt>
          <Trans>Reported spend</Trans>
        </dt>
        <dd>{labels.money(data.source.spendMicros, data.source.currency)}</dd>
        <dt>
          <Trans>Original client project</Trans>
        </dt>
        <dd>{data.originalRouting.projectName ?? t`Project not mapped`}</dd>
        <dt>
          <Trans>Current project manager</Trans>
        </dt>
        <dd>{data.currentRouting?.managerName ?? t`Not currently assigned`}</dd>
        <dt>
          <Trans>Current performance marketer</Trans>
        </dt>
        <dd>
          {data.currentRouting?.marketerName ?? t`Not currently assigned`}
        </dd>
        {data.reportedGoalKind && (
          <>
            <dt>
              <Trans>Outcome in the original manual report</Trans>
            </dt>
            <dd>{labels.reportedGoal(data.reportedGoalKind)}</dd>
          </>
        )}
        {data.reportedTargetCostMicros != null && (
          <>
            <dt>
              <Trans>Target in the original manual report</Trans>
            </dt>
            <dd>
              {labels.money(
                data.reportedTargetCostMicros,
                data.source.currency,
              )}
            </dd>
          </>
        )}
      </StyledAdvertisingFacts>
      {data.hasNewerVersion && (
        <p>
          <Trans>
            A newer report version exists. Review its evidence before using this
            historical report for new work.
          </Trans>
        </p>
      )}
      {data.sourceUrl && (
        <a href={data.sourceUrl} target="_blank" rel="noreferrer">
          <Trans>Open original evidence</Trans>
        </a>
      )}
      <details
        open={metricsOpen}
        onToggle={
          onMetricsToggle
            ? (event) => onMetricsToggle(event.currentTarget.open)
            : undefined
        }
      >
        <summary>
          <Trans>Reported metrics and their sources</Trans>
        </summary>
        <StyledDeliveryStack>
          <p>
            <Trans>
              Provider events can overlap. Each metric is shown separately; a
              lead event does not establish a qualified lead or prove a campaign
              caused a sale.
            </Trans>
          </p>
          {isDefined(data.metricAdId) && (
            <StyledDeliveryButton
              type="button"
              onClick={() => onMetricAd(null)}
            >
              <Trans>Show account metrics</Trans>
            </StyledDeliveryButton>
          )}
          {data.metrics.map((metric) => (
            <StyledAdvertisingItem key={metric.key}>
              <h3>{metric.label}</h3>
              <p>
                {metric.unit === 'MONEY' && isDefined(metric.value)
                  ? parseFinanceAmountMicros(metric.value) === null
                    ? `${metric.value} ${data.source.currency}`
                    : labels.money(
                        parseFinanceAmountMicros(metric.value),
                        data.source.currency,
                      )
                  : labels.count(metric.value)}
              </p>
              <p>{labels.provenance(metric.provenance)}</p>
              {metric.reason && <p>{labels.reason(metric.reason)}</p>}
            </StyledAdvertisingItem>
          ))}
          {data.metrics.length === 0 && (
            <p>
              <Trans>No metric evidence is available for this selection.</Trans>
            </p>
          )}
        </StyledDeliveryStack>
      </details>
      {data.source.kind === 'META' && (
        <details
          open={adsOpen}
          onToggle={
            onAdsToggle
              ? (event) => onAdsToggle(event.currentTarget.open)
              : undefined
          }
        >
          <summary>
            <Trans>Inspect ads in this report</Trans>
          </summary>
          <StyledDeliveryStack>
            <p>{t`Showing ${data.ads.length} of ${data.adTotalCount} reported ads.`}</p>
            {data.ads.map((ad) => (
              <StyledAdvertisingItem key={ad.id}>
                <h3>{ad.name}</h3>
                <p>
                  {ad.campaignName ?? t`Campaign name unavailable`} ·{' '}
                  {ad.adsetName ?? t`Ad set name unavailable`}
                </p>
                <p>
                  {labels.money(ad.spendMicros, data.source.currency)} ·{' '}
                  {labels.count(ad.impressions)} {t`impressions`} ·{' '}
                  {labels.count(ad.clicks)} {t`clicks`}
                </p>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => onMetricAd(ad.id)}
                >
                  <Trans>Inspect this ad's metrics</Trans>
                </StyledDeliveryButton>
                {data.source.projectId && (
                  <Link
                    to={creativeLearningAdDestination(
                      data.source.projectId,
                      data.source.id,
                      ad.id,
                    )}
                  >
                    <Trans>Associate this ad with an approved creative</Trans>
                  </Link>
                )}
              </StyledAdvertisingItem>
            ))}
            {data.adTotalCount === 0 && (
              <p>
                <Trans>No ad rows were recorded for this report.</Trans>
              </p>
            )}
            <StyledDeliveryRow>
              {data.adOffset > 0 && (
                <StyledDeliveryButton type="button" onClick={() => onAdPage(0)}>
                  <Trans>First ad page</Trans>
                </StyledDeliveryButton>
              )}
              {isDefined(nextOffset) && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => onAdPage(nextOffset)}
                >
                  <Trans>More ads</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          </StyledDeliveryStack>
        </details>
      )}
    </StyledDeliveryStack>
  );
};
