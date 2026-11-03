import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { type SeoReport } from '@/delivery/seo-results/seo-results.types';
import { useSeoLabels } from '@/delivery/seo-results/useSeoLabels';
import { seoDestination } from '@/delivery/seo-results/seo-navigation';
import {
  StyledSeoFacts,
  StyledSeoItem,
  StyledSeoText,
} from '@/delivery/seo-results/seoStyles';
import {
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const SeoReportEvidence = ({ value }: { value: SeoReport }) => {
  const { t } = useLingui();
  const labels = useSeoLabels();
  const [params] = useSearchParams();
  return (
    <StyledDeliveryStack>
      <StyledSeoFacts>
        <div>
          <dt>
            <Trans>Report owner</Trans>
          </dt>
          <dd>{value.report.ownerName}</dd>
        </div>
        <div>
          <dt>
            <Trans>Prepared by</Trans>
          </dt>
          <dd>{value.report.createdByName}</dd>
        </div>
        <div>
          <dt>
            <Trans>Reporting window</Trans>
          </dt>
          <dd>
            {value.body.periodStart} – {value.body.periodEnd} ·{' '}
            {value.body.timezone}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Version and review</Trans>
          </dt>
          <dd>
            {t`Viewing version ${value.version}`} ·{' '}
            {t`Current report: ${labels.status(value.report.status)}`}
            {value.report.approvedVersion !== null && (
              <p>{t`Approved version: ${value.report.approvedVersion}`}</p>
            )}
          </dd>
        </div>
      </StyledSeoFacts>
      <section>
        <h3>
          <Trans>Results summary</Trans>
        </h3>
        <StyledSeoText>
          {value.body.summary || t`No results summary recorded.`}
        </StyledSeoText>
      </section>
      <section>
        <h3>
          <Trans>Completed work</Trans>
        </h3>
        <StyledSeoText>
          {value.body.workNotes || t`No additional work notes.`}
        </StyledSeoText>
        {value.taskSnapshots.map((task) => (
          <StyledSeoItem key={task.taskId}>
            <Link to={`/delivery?view=planner&task=${task.taskId}`}>
              {task.title}
            </Link>
            <p>{t`Approved work snapshot, revision ${task.revision}`}</p>
            {task.verificationSummary && (
              <StyledSeoText>{task.verificationSummary}</StyledSeoText>
            )}
          </StyledSeoItem>
        ))}
        <p>
          <Trans>
            Approved work and public backlink checks do not prove indexing,
            ranking, traffic, conversions or client fulfilment.
          </Trans>
        </p>
        {value.body.evidence.map((evidence) => (
          <StyledSeoItem key={`${evidence.label}:${evidence.url}`}>
            <a href={evidence.url} target="_blank" rel="noreferrer">
              {evidence.label}
            </a>
            <StyledSeoText>{evidence.note}</StyledSeoText>
          </StyledSeoItem>
        ))}
      </section>
      <section>
        <h3>
          <Trans>Measured results</Trans>
        </h3>
        <p>
          <Trans>
            These values were entered from documented sources; they are not
            independently imported or verified by a connected analytics service.
          </Trans>
        </p>
        {value.body.metrics.length === 0 && (
          <p>
            <Trans>No measurements recorded.</Trans>
          </p>
        )}
        {value.body.metrics.map((metric) => (
          <StyledSeoItem key={metric.id}>
            <StyledDeliveryStack>
              <h4>{metric.label}</h4>
              <p>
                {metric.value === null
                  ? t`Unknown — ${metric.unknownReason}`
                  : `${metric.value} · ${labels.unit(metric.unit)}`}
              </p>
              <details>
                <summary>
                  <Trans>Inspect measurement evidence</Trans>
                </summary>
                <StyledSeoFacts>
                  <div>
                    <dt>
                      <Trans>Source</Trans>
                    </dt>
                    <dd>
                      <a
                        href={metric.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {labels.source(metric.source)}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <Trans>Captured at</Trans>
                    </dt>
                    <dd>{metric.observedAt}</dd>
                  </div>
                  <div>
                    <dt>
                      <Trans>Property</Trans>
                    </dt>
                    <dd>{metric.property}</dd>
                  </div>
                  <div>
                    <dt>
                      <Trans>Segment and filters</Trans>
                    </dt>
                    <dd>{metric.segment}</dd>
                  </div>
                  <div>
                    <dt>
                      <Trans>Definition and attribution</Trans>
                    </dt>
                    <dd>{metric.definition}</dd>
                  </div>
                </StyledSeoFacts>
              </details>
            </StyledDeliveryStack>
          </StyledSeoItem>
        ))}
      </section>
      {value.comparisonTitle && (
        <section>
          <h3>
            <Trans>Comparison with an approved period</Trans>
          </h3>
          <p>
            {value.comparisonTitle} · {value.comparisonPeriodStart} –{' '}
            {value.comparisonPeriodEnd} · {value.comparisonTimezone}
          </p>
          {value.body.comparisonId && value.body.comparisonVersion && (
            <Link
              to={seoDestination(params, {
                seoReport: value.body.comparisonId,
                seoVersion: String(value.body.comparisonVersion),
                seoMode: null,
                seoRequest: null,
                seoHistoryAfter: null,
              })}
            >
              <Trans>Inspect the approved comparison evidence</Trans>
            </Link>
          )}
          <p>
            <Trans>
              Differences describe recorded values. They do not establish why
              results changed.
            </Trans>
          </p>
          {value.comparison.map((metric) => (
            <StyledSeoItem key={metric.metricId}>
              <h4>{metric.label}</h4>
              <p>
                {t`Previous: ${metric.previousValue ?? t`Unknown`}`} ·{' '}
                {t`This period: ${metric.currentValue ?? t`Unknown`}`}
              </p>
              <p>
                {metric.delta === null
                  ? t`Not comparable: ${metric.reason ?? t`Evidence is unavailable`}`
                  : t`Difference: ${metric.delta}`}
              </p>
            </StyledSeoItem>
          ))}
        </section>
      )}
      <section>
        <h3>
          <Trans>Version and review history</Trans>
        </h3>
        {value.history.map((event) => (
          <StyledSeoItem key={event.requestId}>
            <p>
              {labels.action(event.action)} · {event.actorName} ·{' '}
              {event.createdAt}
            </p>
            <Link
              to={seoDestination(params, {
                seoVersion: String(event.version),
                seoHistoryAfter: null,
                seoMode: null,
                seoRequest: null,
              })}
            >{t`Open version ${event.version}`}</Link>
            {event.note && <StyledSeoText>{event.note}</StyledSeoText>}
          </StyledSeoItem>
        ))}
        <StyledDeliveryRow>
          {params.get('seoHistoryAfter') && (
            <Link to={seoDestination(params, { seoHistoryAfter: null })}>
              <Trans>First history page</Trans>
            </Link>
          )}
          {value.nextEventId && (
            <Link
              to={seoDestination(params, {
                seoHistoryAfter: value.nextEventId,
              })}
            >
              <Trans>More review history</Trans>
            </Link>
          )}
        </StyledDeliveryRow>
      </section>
    </StyledDeliveryStack>
  );
};
