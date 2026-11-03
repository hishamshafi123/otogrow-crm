import { useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingReview } from '@/delivery/advertising/workbench/advertising-draft';
import {
  AdvertisingEvidence,
  type AdvertisingSourceEvidence,
} from '@/delivery/advertising/workbench/AdvertisingEvidence';
import { advertisingObservationSourceMatches } from '@/delivery/advertising/workbench/advertising-observation';
import { GET_ADVERTISING_SOURCES } from '@/delivery/advertising/workbench/advertising-sources.graphql';
import {
  useAdvertisingSource,
  type AdvertisingSourceSelection,
} from '@/delivery/advertising/workbench/useAdvertisingSource';
import { StyledAdvertisingItem } from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryAdvertisingSourcesQuery } from '~/generated-metadata/graphql';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';

type AdvertisingObservationSourceProps = {
  state: ReturnType<typeof useAdvertisingContext>;
  review: AdvertisingReview;
  enabled: boolean;
  onAuthorityLost?: () => void;
  onSelect: (
    source: AdvertisingSourceEvidence,
    metric: AdvertisingSourceEvidence['metrics'][number],
  ) => void;
};
const AdvertisingObservationMetric = ({
  state,
  review,
  selection,
  onSelect,
  onAuthorityLost,
}: Omit<AdvertisingObservationSourceProps, 'enabled'> & {
  selection: AdvertisingSourceSelection;
}) => {
  const { t } = useLingui();
  const [adOffset, setAdOffset] = useState(0);
  const [metricAdId, setMetricAdId] = useState<string | null>(null);
  const source = useAdvertisingSource({
    state,
    selection,
    adOffset,
    metricAdId,
  });
  const data = source.evidence;
  useLayoutEffect(() => {
    if (source.denied) onAuthorityLost?.();
  }, [source.denied, onAuthorityLost]);
  if (!data)
    return (
      <p
        role={source.denied || source.evidenceQuery.error ? 'alert' : 'status'}
      >
        {source.denied || source.evidenceQuery.error
          ? t`This later report could not be verified. Choose another report or refresh current access.`
          : t`Loading exact later evidence…`}
      </p>
    );
  const compatible = advertisingObservationSourceMatches(review, data);
  const metrics = data.metrics.filter(
    (metric) =>
      metric.unit === review.goal.metricUnit &&
      metric.goalKinds.includes(review.goal.kind),
  );
  return (
    <StyledDeliveryStack>
      <h4>{data.source.title}</h4>
      <AdvertisingEvidence
        data={data}
        onAdPage={setAdOffset}
        onMetricAd={(id) => {
          setMetricAdId(id);
          setAdOffset(0);
        }}
      />
      {!compatible ? (
        <p role="alert">
          <Trans>
            Use a later report from the same original client, project, channel
            and currency. The observed period must end no later than today.
          </Trans>
        </p>
      ) : (
        <>
          <p>
            <Trans>
              Choose one exact outcome metric. Its value and reporting period
              will be copied without combining overlapping events.
            </Trans>
          </p>
          {metrics.map((metric) => (
            <StyledAdvertisingItem key={metric.key}>
              <p>
                {metric.label}: {metric.value ?? t`Unknown`}
                {metric.unit === 'MONEY' ? ` ${data.source.currency}` : ''}
              </p>
              <StyledDeliveryButton
                type="button"
                onClick={() => onSelect(data, metric)}
              >{t`Use ${metric.label}`}</StyledDeliveryButton>
            </StyledAdvertisingItem>
          ))}
          {metrics.length === 0 && (
            <p>
              <Trans>
                No metric in this selection has the same outcome type and unit
                as the original goal. Inspect another ad or choose another
                report.
              </Trans>
            </p>
          )}
        </>
      )}
    </StyledDeliveryStack>
  );
};

export const AdvertisingObservationSource = ({
  state,
  review,
  enabled,
  onSelect,
  onAuthorityLost,
}: AdvertisingObservationSourceProps) => {
  const { t } = useLingui();
  const [search, setSearch] = useState('');
  const [after, setAfter] = useState<string | null>(null);
  const [selection, setSelection] = useState<AdvertisingSourceSelection | null>(
    null,
  );
  const input = {
    projectId: review.source.projectId,
    channel: review.source.channel,
    fromDate: review.source.throughDate,
    search,
    after,
  };
  const identity = `${state.source}:${review.id}:observation:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryAdvertisingSourcesQuery>(
    GET_ADVERTISING_SOURCES,
    {
      variables: { input, identity },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: !enabled || state.data === null,
    },
  );
  const denied = isOtogrowAccessDenied(query.error);
  useLayoutEffect(() => {
    if (denied) onAuthorityLost?.();
  }, [denied, onAuthorityLost]);
  const reading = useAssistantRead({
    value: query.data?.deliveryAdvertisingSources,
    source: identity,
    enabled: enabled && state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.permission.matches(value) &&
      fastDeepEqual(value.actor, state.data?.actor),
  });
  if (!enabled || state.data === null) return null;
  return (
    <section aria-label={t`Choose later report evidence`}>
      <StyledDeliveryStack>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(
              String(
                new FormData(event.currentTarget).get('reportSearch') ?? '',
              ).trim(),
            );
            setAfter(null);
            setSelection(null);
          }}
        >
          <label>
            <Trans>Find a later report</Trans>
            <input name="reportSearch" defaultValue={search} maxLength={160} />
          </label>
          <StyledDeliveryButton type="submit">
            <Trans>Search later reports</Trans>
          </StyledDeliveryButton>
        </form>
        {reading.data ? (
          <>
            <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} permitted reports in this project and channel.`}</p>
            {reading.data.items.map((report) => {
              const allowed =
                report.fromDate > review.source.throughDate &&
                report.throughDate <= new Date().toISOString().slice(0, 10) &&
                report.currency === review.source.currency;
              return (
                <StyledAdvertisingItem key={`${report.kind}:${report.id}`}>
                  <p>
                    {report.title} · {report.fromDate} – {report.throughDate} ·{' '}
                    {report.currency}
                  </p>
                  <StyledDeliveryButton
                    type="button"
                    disabled={!allowed}
                    onClick={() => {
                      if (report.kind === 'META' || report.kind === 'MANUAL')
                        setSelection({ kind: report.kind, id: report.id });
                    }}
                  >
                    <Trans>Inspect later report</Trans>
                  </StyledDeliveryButton>
                  {!allowed && (
                    <small>
                      <Trans>
                        A later completed period and the same currency are
                        required.
                      </Trans>
                    </small>
                  )}
                </StyledAdvertisingItem>
              );
            })}
            {reading.data.totalCount === 0 && (
              <p>
                <Trans>
                  No permitted later reports match. A human observation can
                  record other evidence explicitly.
                </Trans>
              </p>
            )}
            <StyledDeliveryRow>
              {after && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => {
                    setAfter(null);
                    setSelection(null);
                  }}
                >
                  <Trans>First later-report page</Trans>
                </StyledDeliveryButton>
              )}
              {reading.data.nextCursor && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => {
                    setAfter(reading.data?.nextCursor ?? null);
                    setSelection(null);
                  }}
                >
                  <Trans>More later reports</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`Later reports could not be verified. Retry from the first page.`
              : t`Loading later reports…`}
          </p>
        )}
        {query.error && (
          <StyledDeliveryButton
            type="button"
            onClick={() => {
              setAfter(null);
              setSelection(null);
              void query.refetch().catch(() => undefined);
            }}
          >
            <Trans>Retry later reports</Trans>
          </StyledDeliveryButton>
        )}
        {selection && reading.data && (
          <AdvertisingObservationMetric
            key={`${selection.kind}:${selection.id}`}
            state={state}
            review={review}
            selection={selection}
            onSelect={onSelect}
            onAuthorityLost={onAuthorityLost}
          />
        )}
      </StyledDeliveryStack>
    </section>
  );
};
