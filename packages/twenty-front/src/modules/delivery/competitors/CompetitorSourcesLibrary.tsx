import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { type useCompetitorAccess } from '@/delivery/competitors/useCompetitorAccess';
import { useCompetitorRead } from '@/delivery/competitors/useCompetitorRead';
import { GET_COMPETITOR_SOURCES } from '@/delivery/competitors/delivery-competitors.graphql';
import {
  competitorDestination,
  COMPETITOR_CLOSE_SOURCE,
} from '@/delivery/competitors/competitor-navigation';
import { newCompetitorBody } from '@/delivery/competitors/competitor-body';
import {
  type CompetitorIntent,
  type CompetitorSources,
} from '@/delivery/competitors/competitor.types';
import { CompetitorSourceDetail } from '@/delivery/competitors/CompetitorSourceDetail';
import { CompetitorCommandPanel } from '@/delivery/competitors/CompetitorCommandPanel';
import { useCompetitorLabels } from '@/delivery/competitors/useCompetitorLabels';
import {
  StyledCompetitorBoundary,
  StyledCompetitorItem,
  StyledCompetitorList,
} from '@/delivery/competitors/competitorStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type CompetitorSourcesLibraryProps = {
  access: ReturnType<typeof useCompetitorAccess>;
  projectId: string;
  onDenied: () => void;
  enabled: boolean;
};
export const CompetitorSourcesLibrary = ({
  access,
  projectId,
  onDenied,
  enabled,
}: CompetitorSourcesLibraryProps) => {
  const { t } = useLingui();
  const labels = useCompetitorLabels();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction, requestNavigation } = useDeliveryDraftGuard();
  // oxlint-disable-next-line twenty/no-state-useref -- This native heading restores logical focus after a selected source or preparation closes.
  const heading = useRef<HTMLHeadingElement | null>(null);
  const restoreLogicalFocus = useCallback(() => {
    heading.current?.focus();
    return Boolean(heading.current?.isConnected);
  }, []);
  const [intent, setIntent] = useState<CompetitorIntent | null>(null);
  const query = useQuery<{ deliveryCompetitorSources: CompetitorSources }>(
    GET_COMPETITOR_SOURCES,
    {
      variables: {
        input: {
          projectId,
          status: params.get('competitorStatus'),
          after: params.get('competitorAfter'),
        },
      },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
      skip: !enabled,
    },
  );
  const read = useCompetitorRead({
    value: query.data?.deliveryCompetitorSources,
    access,
    scope: `sources:${projectId}:${params.get('competitorStatus')}:${params.get('competitorAfter')}`,
    query,
    matches: (value) => value.project.id === projectId,
    onDenied,
  });
  const [retained, setRetained] = useState(read.data);
  if (read.data && !fastDeepEqual(retained, read.data)) setRetained(read.data);
  const context = read.data ?? retained;
  const available = enabled && read.data !== null;
  const consumeIntent = useCallback(
    (requestId: string) =>
      setIntent((previous) =>
        previous?.requestId === requestId ? null : previous,
      ),
    [],
  );
  const destinationFor = (next: CompetitorIntent) =>
    competitorDestination(params, {
      competitorSource: next.id,
      competitorRequest: next.requestId,
      competitorMode: next.mode,
      competitorVersion: null,
      competitorHistoryAfter: null,
    });
  const openIntent = (next: CompetitorIntent) =>
    requestAction(() => {
      setIntent(next);
      navigate(destinationFor(next));
    });
  const replaceIntent = (next: CompetitorIntent) => {
    const destination = destinationFor(next);
    requestNavigation(
      { pathname: '/delivery', search: destination.slice('/delivery'.length) },
      () => {
        setIntent(next);
        navigate(destination);
      },
    );
  };
  const sourceId = params.get('competitorSource');
  const mode = params.get('competitorMode');
  return (
    <StyledDeliveryStack>
      {!available && (
        <div role={query.error ? 'alert' : 'status'}>
          <p>
            {query.error
              ? t`Current project sources could not be checked. Your preparation is hidden while you reconnect.`
              : t`Loading current sources…`}
          </p>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={() => void query.refetch()}
          >
            <Trans>Check sources again</Trans>
          </StyledDeliveryButton>
          {params.get('competitorAfter') && (
            <Link to={competitorDestination(params, { competitorAfter: null })}>
              <Trans>First source page</Trans>
            </Link>
          )}
        </div>
      )}
      <StyledCompetitorBoundary
        hidden={!available}
        disabled={!available}
        inert={!available || undefined}
      >
        {context && (
          <StyledDeliveryStack>
            <h2 ref={heading} tabIndex={-1}>
              {context.project.name}
            </h2>
            {sourceId ? (
              mode ? (
                <CompetitorCommandPanel
                  key={`${access.source}:${sourceId}:${params.get('competitorRequest')}`}
                  access={access}
                  project={context.project}
                  sourceId={sourceId}
                  requestId={params.get('competitorRequest') ?? ''}
                  mode={mode}
                  intent={intent}
                  consumeIntent={consumeIntent}
                  enabled={available}
                  contextScope={context.scope}
                  restoreLogicalFocus={restoreLogicalFocus}
                  onDenied={onDenied}
                  onReplaceIntent={replaceIntent}
                  onSaved={async () => {
                    await query.refetch();
                  }}
                />
              ) : (
                <CompetitorSourceDetail
                  key={`${sourceId}:${params.get('competitorVersion') ?? 'current'}`}
                  access={access}
                  sourceId={sourceId}
                  projectId={projectId}
                  contextScope={context.scope}
                  enabled={available}
                  restoreLogicalFocus={restoreLogicalFocus}
                  onDenied={onDenied}
                  openIntent={openIntent}
                />
              )
            ) : (
              <>
                <p>
                  <Trans>
                    Register the accounts your team researches. Collection is
                    OFF. Existing evidence and ideas remain in Earlier manual
                    findings.
                  </Trans>
                </p>
                <StyledDeliveryRow>
                  {access.permission.manager && (
                    <StyledDeliveryButton
                      type="button"
                      data-primary="true"
                      onClick={() =>
                        openIntent({
                          id: crypto.randomUUID(),
                          requestId: crypto.randomUUID(),
                          projectId,
                          projectRevision: context.project.revision,
                          expectedCompanyId: context.project.companyId,
                          revision: 0,
                          mode: 'new',
                          scope: context.scope,
                          body: newCompetitorBody(
                            projectId,
                            access.permission.access?.memberId ?? '',
                          ),
                          note: '',
                        })
                      }
                    >
                      <Trans>Add a source</Trans>
                    </StyledDeliveryButton>
                  )}
                  <label>
                    <Trans>Source status</Trans>
                    <select
                      aria-label={t`Source status`}
                      value={params.get('competitorStatus') ?? ''}
                      onChange={(event) => {
                        const status = event.currentTarget.value;
                        requestAction(() =>
                          navigate(
                            competitorDestination(params, {
                              competitorStatus: status,
                              competitorAfter: null,
                            }),
                          ),
                        );
                      }}
                    >
                      <option value="">{t`All statuses`}</option>
                      {['ACTIVE', 'PAUSED', 'ARCHIVED'].map((status) => (
                        <option key={status} value={status}>
                          {labels.status(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                </StyledDeliveryRow>
                <p>{t`${context.totalCount} accessible sources`}</p>
                {!context.items.length && (
                  <p>
                    <Trans>
                      No sources match. A project manager can add the first
                      research source.
                    </Trans>
                  </p>
                )}
                <StyledCompetitorList>
                  {context.items.map((source) => (
                    <StyledCompetitorItem key={source.id}>
                      <Link
                        to={competitorDestination(params, {
                          competitorSource: source.id,
                          competitorVersion: null,
                          competitorHistoryAfter: null,
                        })}
                      >
                        {source.label}
                      </Link>
                      <span>
                        {labels.platform(source.platform)} ·{' '}
                        {source.canonicalReference}
                      </span>
                      <span>
                        {labels.status(source.status)} ·{' '}
                        {t`Owner: ${source.ownerName}`}
                      </span>
                    </StyledCompetitorItem>
                  ))}
                </StyledCompetitorList>
                <StyledDeliveryRow>
                  {params.get('competitorAfter') && (
                    <Link
                      to={competitorDestination(params, {
                        competitorAfter: null,
                      })}
                    >
                      <Trans>First source page</Trans>
                    </Link>
                  )}
                  {context.nextCursor && (
                    <Link
                      to={competitorDestination(params, {
                        competitorAfter: context.nextCursor,
                      })}
                    >
                      <Trans>More sources</Trans>
                    </Link>
                  )}
                </StyledDeliveryRow>
              </>
            )}
            {sourceId && (
              <Link to={competitorDestination(params, COMPETITOR_CLOSE_SOURCE)}>
                <Trans>Back to sources</Trans>
              </Link>
            )}
          </StyledDeliveryStack>
        )}
      </StyledCompetitorBoundary>
    </StyledDeliveryStack>
  );
};
