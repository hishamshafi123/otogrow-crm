import { useQuery } from '@apollo/client/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { formatActivityTime } from '@/otogrow-activity/ActivityEvent';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { type useCompetitorAccess } from '@/delivery/competitors/useCompetitorAccess';
import { useCompetitorRead } from '@/delivery/competitors/useCompetitorRead';
import { GET_COMPETITOR_SOURCE } from '@/delivery/competitors/delivery-competitors.graphql';
import { competitorDestination } from '@/delivery/competitors/competitor-navigation';
import { canonicalCompetitorBody } from '@/delivery/competitors/competitor-body';
import {
  type CompetitorDetail,
  type CompetitorIntent,
} from '@/delivery/competitors/competitor.types';
import { useCompetitorLabels } from '@/delivery/competitors/useCompetitorLabels';
import { CompetitorSourceSummary } from '@/delivery/competitors/CompetitorSourceSummary';
import { CompetitorSourceCoverage } from '@/delivery/competitors/CompetitorSourceCoverage';
import {
  StyledCompetitorItem,
  StyledCompetitorList,
  StyledCompetitorText,
} from '@/delivery/competitors/competitorStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type CompetitorSourceDetailProps = {
  access: ReturnType<typeof useCompetitorAccess>;
  sourceId: string;
  projectId: string;
  contextScope: string;
  enabled: boolean;
  onDenied: () => void;
  openIntent: (intent: CompetitorIntent) => void;
  restoreLogicalFocus: () => boolean;
};
export const CompetitorSourceDetail = ({
  access,
  sourceId,
  projectId,
  contextScope,
  enabled,
  onDenied,
  openIntent,
  restoreLogicalFocus,
}: CompetitorSourceDetailProps) => {
  const { t } = useLingui();
  const labels = useCompetitorLabels();
  const [params] = useSearchParams();
  const focus = useAssistantPanelFocus(restoreLogicalFocus);
  const version = params.get('competitorVersion')
    ? Number(params.get('competitorVersion'))
    : null;
  const query = useQuery<{ deliveryCompetitorSource: CompetitorDetail }>(
    GET_COMPETITOR_SOURCE,
    {
      variables: {
        input: {
          id: sourceId,
          version,
          after: params.get('competitorHistoryAfter'),
        },
      },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
      skip: !enabled,
    },
  );
  const read = useCompetitorRead({
    value: query.data?.deliveryCompetitorSource,
    access,
    scope: `detail:${sourceId}:${version}:${params.get('competitorHistoryAfter')}`,
    query,
    matches: (value) =>
      value.source.id === sourceId &&
      value.project.id === projectId &&
      value.scope === contextScope &&
      value.collectionEnabled === false &&
      (version === null || value.selectedVersion === version),
    onDenied,
  });
  const detail = enabled ? read.data : null;
  const prepare = (mode: CompetitorIntent['mode']) => {
    if (!detail) return;
    openIntent({
      id: sourceId,
      requestId: crypto.randomUUID(),
      projectId,
      projectRevision: detail.project.revision,
      expectedCompanyId: detail.project.companyId,
      revision: detail.source.revision,
      mode,
      scope: detail.scope,
      body: canonicalCompetitorBody(detail.body),
      note: '',
    });
  };
  return (
    <section ref={focus} tabIndex={-1} aria-label={t`Source detail`}>
      {!detail ? (
        <div role={query.error ? 'alert' : 'status'}>
          <p>
            {query.error
              ? t`The source could not be checked under your current permissions. Private evidence is hidden while you reconnect.`
              : t`Checking the current source…`}
          </p>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={() => void query.refetch()}
          >
            <Trans>Check source again</Trans>
          </StyledDeliveryButton>
          {params.get('competitorHistoryAfter') && (
            <Link
              to={competitorDestination(params, {
                competitorHistoryAfter: null,
              })}
            >
              <Trans>Latest changes</Trans>
            </Link>
          )}
        </div>
      ) : (
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <h3>{detail.source.label}</h3>
            <span>{labels.status(detail.source.status)}</span>
          </StyledDeliveryRow>
          <p>{t`Configuration version ${detail.selectedVersion} of ${detail.source.currentVersion}`}</p>
          {detail.selectedVersion !== detail.source.currentVersion ? (
            <p>
              <Trans>You are viewing an earlier immutable configuration.</Trans>{' '}
              <Link
                to={competitorDestination(params, {
                  competitorVersion: null,
                  competitorHistoryAfter: null,
                })}
              >
                <Trans>Open current version</Trans>
              </Link>
            </p>
          ) : (
            <StyledDeliveryRow>
              {detail.canEdit && (
                <StyledDeliveryButton
                  type="button"
                  data-primary="true"
                  onClick={() => prepare('edit')}
                >
                  <Trans>Edit source</Trans>
                </StyledDeliveryButton>
              )}
              {detail.canPause && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => prepare('PAUSE')}
                >
                  {labels.action('PAUSE')}
                </StyledDeliveryButton>
              )}
              {detail.canRestore && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => prepare('RESTORE')}
                >
                  {labels.action('RESTORE')}
                </StyledDeliveryButton>
              )}
              {detail.canArchive && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => prepare('ARCHIVE')}
                >
                  {labels.action('ARCHIVE')}
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          )}
          <CompetitorSourceSummary body={detail.body} />
          <CompetitorSourceCoverage platform={detail.body.platform} />
          <h4>
            <Trans>Configuration history</Trans>
          </h4>
          <StyledCompetitorList>
            {detail.history.map((event) => (
              <StyledCompetitorItem key={event.requestId}>
                <strong>{labels.recorded(event.action)}</strong>
                <span>
                  {event.actorName} ·{' '}
                  <time dateTime={event.createdAt}>
                    {formatActivityTime(event.createdAt)}
                  </time>{' '}
                  · {t`Version ${event.version}`}
                </span>
                {event.note && (
                  <StyledCompetitorText>{event.note}</StyledCompetitorText>
                )}
                <Link
                  to={competitorDestination(params, {
                    competitorVersion: String(event.version),
                    competitorHistoryAfter: null,
                  })}
                >
                  <Trans>Inspect this configuration version</Trans>
                </Link>
              </StyledCompetitorItem>
            ))}
          </StyledCompetitorList>
          <StyledDeliveryRow>
            {params.get('competitorHistoryAfter') && (
              <Link
                to={competitorDestination(params, {
                  competitorHistoryAfter: null,
                })}
              >
                <Trans>Latest changes</Trans>
              </Link>
            )}
            {detail.nextCursor && (
              <Link
                to={competitorDestination(params, {
                  competitorHistoryAfter: detail.nextCursor,
                })}
              >
                <Trans>Earlier changes</Trans>
              </Link>
            )}
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      )}
    </section>
  );
};
