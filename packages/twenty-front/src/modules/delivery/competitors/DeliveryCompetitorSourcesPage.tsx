import { useCallback, useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { useCompetitorAccess } from '@/delivery/competitors/useCompetitorAccess';
import { useCompetitorRead } from '@/delivery/competitors/useCompetitorRead';
import { GET_COMPETITOR_PROJECTS } from '@/delivery/competitors/delivery-competitors.graphql';
import { type CompetitorProjects } from '@/delivery/competitors/competitor.types';
import {
  competitorDestination,
  competitorSelectionValid,
  COMPETITOR_CLOSE_SOURCE,
} from '@/delivery/competitors/competitor-navigation';
import { CompetitorSourcesLibrary } from '@/delivery/competitors/CompetitorSourcesLibrary';
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

export const DeliveryCompetitorSourcesPage = () => (
  <DeliveryOperationalPage view="competitors">
    <CompetitorWorkspace />
  </DeliveryOperationalPage>
);
const CompetitorWorkspace = () => {
  const access = useCompetitorAccess();
  const [params] = useSearchParams();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const [owner, setOwner] = useState(access.source);
  const [denied, setDenied] = useState(false);
  const [generation, setGeneration] = useState(0);
  const changed = access.permission.ready && owner !== access.source;
  const loseAccess = useCallback(() => {
    cancelPendingNavigation();
    setDenied(true);
  }, [cancelPendingNavigation]);
  useLayoutEffect(() => {
    if (changed || access.permission.denied) {
      cancelPendingNavigation();
      setOwner(access.source);
      setGeneration((value) => value + 1);
      setDenied(Boolean(access.permission.denied));
    }
  }, [
    changed,
    access.permission.denied,
    access.source,
    cancelPendingNavigation,
  ]);
  const valid = competitorSelectionValid(params);
  return (
    <StyledDeliveryStack>
      {!valid && (
        <p role="alert">
          <Trans>
            This source link is incomplete or invalid. Choose a project to
            continue.
          </Trans>
        </p>
      )}
      <StyledDeliveryRow>
        <Link
          to={competitorDestination(params, {
            ...COMPETITOR_CLOSE_SOURCE,
            competitorProject: null,
            competitorAfter: null,
            competitorProjectAfter: null,
            competitorStatus: null,
          })}
        >
          <Trans>Choose another project</Trans>
        </Link>
        <Link to="/delivery?view=competitors&competitorView=legacy">
          <Trans>Earlier manual findings</Trans>
        </Link>
      </StyledDeliveryRow>
      {valid && !changed && (
        <CompetitorProjectWorkspace
          key={`${owner}:${generation}`}
          access={access}
          denied={denied}
          onDenied={loseAccess}
          onRecovered={() => setDenied(false)}
        />
      )}
    </StyledDeliveryStack>
  );
};
type CompetitorProjectWorkspaceProps = {
  access: ReturnType<typeof useCompetitorAccess>;
  denied: boolean;
  onDenied: () => void;
  onRecovered: () => void;
};
const CompetitorProjectWorkspace = ({
  access,
  denied,
  onDenied,
  onRecovered,
}: CompetitorProjectWorkspaceProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction } = useDeliveryDraftGuard();
  const projectId = params.get('competitorProject');
  const search = params.get('competitorSearch') ?? '';
  const [searchDraft, setSearchDraft] = useState(search);
  const [checking, setChecking] = useState(false);
  const query = useQuery<{ deliveryCompetitorProjects: CompetitorProjects }>(
    GET_COMPETITOR_PROJECTS,
    {
      variables: {
        input: { search, after: params.get('competitorProjectAfter') },
      },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
      skip: !access.permission.ready || denied,
    },
  );
  const read = useCompetitorRead({
    value: query.data?.deliveryCompetitorProjects,
    access,
    scope: `projects:${search}:${params.get('competitorProjectAfter')}`,
    query,
    onDenied,
  });
  const begin = useFinanceExportRequestGuard(
    access.source,
    access.permission.ready,
  );
  const [mounted, setMounted] = useState(!denied);
  useLayoutEffect(() => {
    if (denied) setMounted(false);
  }, [denied]);
  const retry = async () => {
    if (checking) return;
    setChecking(true);
    const current = begin();
    try {
      const response = await query.refetch();
      if (
        current() &&
        response.data?.deliveryCompetitorProjects &&
        access.matches(response.data.deliveryCompetitorProjects)
      ) {
        onRecovered();
        setMounted(true);
      }
    } catch {
      // A failed read cannot restore access to retained private preparation.
    } finally {
      setChecking(false);
    }
  };
  const available = access.permission.ready && !denied && read.data !== null;
  return (
    <StyledDeliveryStack>
      {!available && (
        <div role={denied || query.error ? 'alert' : 'status'}>
          <p>
            {denied
              ? t`Source access changed. Private preparation was cleared. Check access before continuing.`
              : query.error
                ? t`Current source access could not be verified. Unsaved work is hidden and kept while you retry.`
                : t`Checking current source access…`}
          </p>
          <StyledDeliveryButton
            type="button"
            disabled={checking || !access.permission.ready}
            onClick={() => void retry()}
          >
            <Trans>Check source access</Trans>
          </StyledDeliveryButton>
          {params.get('competitorProjectAfter') && (
            <Link
              to={competitorDestination(params, {
                competitorProjectAfter: null,
              })}
            >
              <Trans>First project page</Trans>
            </Link>
          )}
        </div>
      )}
      <StyledCompetitorBoundary
        hidden={!available}
        disabled={!available}
        inert={!available || undefined}
      >
        {mounted &&
          (projectId ? (
            <CompetitorSourcesLibrary
              key={projectId}
              access={access}
              projectId={projectId}
              enabled={available}
              onDenied={onDenied}
            />
          ) : (
            <StyledDeliveryStack>
              <h2>
                <Trans>Choose a project</Trans>
              </h2>
              <p>
                <Trans>
                  Choose an internal or client project to register research
                  sources with a named owner and reviewer.
                </Trans>
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  requestAction(() =>
                    navigate(
                      competitorDestination(params, {
                        competitorSearch: searchDraft.trim(),
                        competitorProjectAfter: null,
                      }),
                    ),
                  );
                }}
              >
                <label>
                  <Trans>Find a project</Trans>
                  <input
                    aria-label={t`Find a project`}
                    maxLength={160}
                    value={searchDraft}
                    onChange={(event) =>
                      setSearchDraft(event.currentTarget.value)
                    }
                  />
                </label>
                <StyledDeliveryButton type="submit">
                  <Trans>Search projects</Trans>
                </StyledDeliveryButton>
              </form>
              {read.data && (
                <>
                  <p>{t`${read.data.totalCount} accessible projects`}</p>
                  {read.data.items.length === 0 && (
                    <>
                      <p>
                        <Trans>No matching projects.</Trans>
                      </p>
                      {read.data.isManager ? (
                        <Link to="/delivery?view=team">
                          <Trans>Manage projects</Trans>
                        </Link>
                      ) : (
                        <p>
                          <Trans>
                            Ask your manager for access to a research project.
                          </Trans>
                        </p>
                      )}
                    </>
                  )}
                  <StyledCompetitorList>
                    {read.data.items.map((project) => (
                      <StyledCompetitorItem key={project.id}>
                        <Link
                          to={competitorDestination(params, {
                            competitorProject: project.id,
                            competitorAfter: null,
                          })}
                        >
                          {project.name}
                        </Link>
                      </StyledCompetitorItem>
                    ))}
                  </StyledCompetitorList>
                  <StyledDeliveryRow>
                    {params.get('competitorProjectAfter') && (
                      <Link
                        to={competitorDestination(params, {
                          competitorProjectAfter: null,
                        })}
                      >
                        <Trans>First project page</Trans>
                      </Link>
                    )}
                    {read.data.nextCursor && (
                      <Link
                        to={competitorDestination(params, {
                          competitorProjectAfter: read.data.nextCursor,
                        })}
                      >
                        <Trans>More projects</Trans>
                      </Link>
                    )}
                  </StyledDeliveryRow>
                </>
              )}
            </StyledDeliveryStack>
          ))}
      </StyledCompetitorBoundary>
    </StyledDeliveryStack>
  );
};
