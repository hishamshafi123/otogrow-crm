import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { GET_ADVERTISING_SOURCES } from '@/delivery/advertising/workbench/advertising-sources.graphql';
import {
  advertisingDestination,
  advertisingCloseReport,
} from '@/delivery/advertising/workbench/advertising-navigation';
import { useAdvertisingLabels } from '@/delivery/advertising/workbench/useAdvertisingLabels';
import { StyledAdvertisingItem } from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryAdvertisingSourcesQuery } from '~/generated-metadata/graphql';
import { DateTimeDisplay } from '@/ui/field/display/components/DateTimeDisplay';

export const AdvertisingReports = ({
  state,
}: {
  state: ReturnType<typeof useAdvertisingContext>;
}) => {
  const { t } = useLingui();
  const labels = useAdvertisingLabels();
  const [params, setParams] = useSearchParams();
  const input = {
    sourceKind: params.get('adSourceFilter'),
    projectId: params.get('adProject'),
    status: params.get('adStatus'),
    channel: params.get('adChannel'),
    search: params.get('adSearch'),
    fromDate: params.get('adFrom'),
    throughDate: params.get('adThrough'),
    after: params.get('adAfter'),
  };
  const source = `${state.source}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryAdvertisingSourcesQuery>(
    GET_ADVERTISING_SOURCES,
    {
      variables: { input, identity: source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
      skip: state.data === null,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.deliveryAdvertisingSources,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (result) =>
      state.permission.matches(result) &&
      fastDeepEqual(result.actor, state.data?.actor),
  });
  return (
    <section aria-label={t`Advertising reports`}>
      <StyledDeliveryStack>
        <form
          key={`${input.search}:${input.sourceKind}:${input.status}:${input.fromDate}:${input.throughDate}`}
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const changes = Object.fromEntries(
              [
                ['search', 'adSearch'],
                ['source', 'adSourceFilter'],
                ['status', 'adStatus'],
                ['from', 'adFrom'],
                ['through', 'adThrough'],
              ].map(([name, parameter]) => [
                parameter,
                String(values.get(name) ?? '').trim() || null,
              ]),
            );
            setParams(
              advertisingDestination(params, {
                ...changes,
                adAfter: null,
              }).split('?')[1],
            );
          }}
        >
          <details
            open={Boolean(
              input.search ||
              input.sourceKind ||
              input.status ||
              input.fromDate ||
              input.throughDate,
            )}
          >
            <summary>
              <Trans>Filter reports</Trans>
            </summary>
            <StyledDeliveryGrid>
              <label>
                <Trans>Find a report</Trans>
                <input
                  name="search"
                  maxLength={160}
                  defaultValue={input.search ?? ''}
                />
              </label>
              <label>
                <Trans>Report source</Trans>
                <select name="source" defaultValue={input.sourceKind ?? ''}>
                  <option value="">{t`Imported and manual`}</option>
                  <option value="META">{t`Imported Meta`}</option>
                  <option value="MANUAL">{t`Manually recorded`}</option>
                </select>
              </label>
              <label>
                <Trans>Source review</Trans>
                <select name="status" defaultValue={input.status ?? ''}>
                  <option value="">{t`All review states`}</option>
                  <option value="REVIEW">{t`Needs source review`}</option>
                  <option value="APPROVED">{t`Source reviewed`}</option>
                  <option value="CHANGES_REQUESTED">{t`Source changes requested`}</option>
                  <option value="DRAFT">{t`Manual draft`}</option>
                </select>
              </label>
              <label>
                <Trans>First report day</Trans>
                <input
                  name="from"
                  type="date"
                  defaultValue={input.fromDate ?? ''}
                />
              </label>
              <label>
                <Trans>Last report day</Trans>
                <input
                  name="through"
                  type="date"
                  defaultValue={input.throughDate ?? ''}
                />
              </label>
            </StyledDeliveryGrid>
            <StyledDeliveryButton type="submit">
              <Trans>Apply report filters</Trans>
            </StyledDeliveryButton>
          </details>
        </form>
        {reading.data ? (
          <>
            <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} matching reports.`}</p>
            {reading.data.items.map((report) => (
              <StyledAdvertisingItem key={`${report.kind}:${report.id}`}>
                <h2>
                  <Link
                    data-advertising-report={report.id}
                    to={advertisingDestination(params, {
                      ...advertisingCloseReport,
                      adSource: report.kind,
                      adReport: report.id,
                    })}
                  >
                    {report.title}
                  </Link>
                </h2>
                <p>
                  {labels.source(report.kind)} · {report.channel} ·{' '}
                  {report.fromDate === report.throughDate
                    ? report.fromDate
                    : `${report.fromDate} – ${report.throughDate}`}{' '}
                  · {report.currency}
                </p>
                <p>
                  {report.projectName ?? t`Project not mapped`} ·{' '}
                  {labels.state(report.sourceStatus)}
                </p>
                {report.accountId && (
                  <p>
                    {t`Meta ad account`}: {report.accountId}
                  </p>
                )}
                {(report.hasNewerVersion || report.archived) && (
                  <p>
                    {report.hasNewerVersion ? t`Previous snapshot` : ''}
                    {report.hasNewerVersion && report.archived ? ' · ' : ''}
                    {report.archived ? t`Archived` : ''}
                  </p>
                )}
                <StyledDeliveryRow>
                  {report.recordedAt ? (
                    <>
                      <span>
                        <Trans>Recorded</Trans>
                      </span>
                      <DateTimeDisplay value={report.recordedAt} />
                    </>
                  ) : (
                    t`Recorded time unknown`
                  )}
                </StyledDeliveryRow>
                <StyledDeliveryRow>
                  {report.currentDraftId && (
                    <Link
                      to={advertisingDestination(params, {
                        ...advertisingCloseReport,
                        adSource: report.kind,
                        adReport: report.id,
                        adReview: report.currentDraftId,
                      })}
                    >
                      <Trans>Open recommendations in preparation</Trans>
                    </Link>
                  )}
                  {report.latestAssignedId && (
                    <Link
                      to={advertisingDestination(params, {
                        ...advertisingCloseReport,
                        adSource: report.kind,
                        adReport: report.id,
                        adReview: report.latestAssignedId,
                      })}
                    >
                      <Trans>View reviewed work</Trans>
                    </Link>
                  )}
                  {report.legacyTaskId && (
                    <small>
                      <Trans>
                        An existing follow-up is linked to this report.
                      </Trans>
                    </small>
                  )}
                </StyledDeliveryRow>
              </StyledAdvertisingItem>
            ))}
            {reading.data.totalCount === 0 && (
              <p>
                <Trans>
                  No permitted reports match this view. Adjust the filters or
                  record a manual report.
                </Trans>
              </p>
            )}
            {reading.data.nextCursor && (
              <Link
                to={advertisingDestination(params, {
                  adAfter: reading.data.nextCursor,
                })}
              >
                <Trans>More reports</Trans>
              </Link>
            )}
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`Reports could not be verified. Retry or return to the first page.`
              : t`Loading advertising reports…`}
          </p>
        )}
        <StyledDeliveryRow>
          {(input.after || query.error) && (
            <Link to={advertisingDestination(params, { adAfter: null })}>
              <Trans>First report page</Trans>
            </Link>
          )}
          <StyledDeliveryButton
            type="button"
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh reports</Trans>
          </StyledDeliveryButton>
          <Link to={advertisingDestination(params, { adView: 'legacy' })}>
            <Trans>Connections and manual reporting</Trans>
          </Link>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};
