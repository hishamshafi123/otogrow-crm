import { useCallback, useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { useReleaseAccess } from '@/delivery/development/useReleaseAccess';
import { useReleaseRead } from '@/delivery/development/useReleaseRead';
import { GET_RELEASE_PROJECTS } from '@/delivery/development/delivery-release.graphql';
import {
  releaseDestination,
  releaseSelectionValid,
  RELEASE_CLOSE_RECORD,
} from '@/delivery/development/release-navigation';
import { ReleaseLibrary } from '@/delivery/development/ReleaseLibrary';
import {
  StyledReleaseBoundary,
  StyledReleaseItem,
} from '@/delivery/development/releaseStyles';
import { type DeliveryReleaseProjectsQuery } from '~/generated-metadata/graphql';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const DeliveryDevelopmentPage = () => (
  <DeliveryOperationalPage view="development">
    <ReleaseWorkspace />
  </DeliveryOperationalPage>
);
const ReleaseWorkspace = () => {
  const access = useReleaseAccess();
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
  const valid = releaseSelectionValid(params);
  return (
    <StyledDeliveryStack>
      {!valid && (
        <p role="alert">
          <Trans>
            This release link is incomplete or invalid. Choose a project to
            continue.
          </Trans>
        </p>
      )}
      <Link
        to={releaseDestination(params, {
          ...RELEASE_CLOSE_RECORD,
          releaseProject: null,
          releaseAfter: null,
          releaseProjectAfter: null,
          releaseStatus: null,
        })}
      >
        <Trans>Choose another project</Trans>
      </Link>
      {valid && !changed && (
        <ReleaseProjectWorkspace
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
const ReleaseProjectWorkspace = ({
  access,
  denied,
  onDenied,
  onRecovered,
}: {
  access: ReturnType<typeof useReleaseAccess>;
  denied: boolean;
  onDenied: () => void;
  onRecovered: () => void;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction } = useDeliveryDraftGuard();
  const projectId = params.get('releaseProject');
  const search = params.get('releaseSearch') ?? '';
  const [searchDraft, setSearchDraft] = useState(search);
  const [checking, setChecking] = useState(false);
  const query = useQuery<DeliveryReleaseProjectsQuery>(GET_RELEASE_PROJECTS, {
    variables: {
      input: { search, afterId: params.get('releaseProjectAfter') },
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !access.permission.ready || denied,
  });
  const read = useReleaseRead({
    value: query.data?.deliveryReleaseProjects,
    access,
    scope: `projects:${search}:${params.get('releaseProjectAfter')}`,
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
        response.data?.deliveryReleaseProjects &&
        access.matches(response.data.deliveryReleaseProjects)
      ) {
        onRecovered();
        setMounted(true);
      }
    } catch {
      // A failed source read cannot restore access to retained private preparation.
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
              ? t`Release access changed. Private release preparation was cleared. Check access before continuing.`
              : query.error
                ? t`Current release access could not be verified. Unsaved work is hidden and kept while you retry.`
                : t`Checking current release access…`}
          </p>
          <StyledDeliveryButton
            type="button"
            disabled={checking || !access.permission.ready}
            onClick={() => void retry()}
          >
            <Trans>Check release access</Trans>
          </StyledDeliveryButton>
        </div>
      )}
      <StyledReleaseBoundary
        hidden={!available}
        disabled={!available}
        inert={!available || undefined}
      >
        {mounted &&
          (projectId ? (
            <ReleaseLibrary
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
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  requestAction(() =>
                    navigate(
                      releaseDestination(params, {
                        releaseSearch: searchDraft.trim(),
                        releaseProjectAfter: null,
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
                    <p>
                      <Trans>No matching projects.</Trans>
                    </p>
                  )}
                  {read.data.items.map((project) => (
                    <StyledReleaseItem key={project.id}>
                      <Link
                        to={releaseDestination(params, {
                          releaseProject: project.id,
                          releaseAfter: null,
                        })}
                      >
                        {project.name}
                      </Link>
                    </StyledReleaseItem>
                  ))}
                  <StyledDeliveryRow>
                    {params.get('releaseProjectAfter') && (
                      <Link
                        to={releaseDestination(params, {
                          releaseProjectAfter: null,
                        })}
                      >
                        <Trans>First project page</Trans>
                      </Link>
                    )}
                    {read.data.nextId && (
                      <Link
                        to={releaseDestination(params, {
                          releaseProjectAfter: read.data.nextId,
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
      </StyledReleaseBoundary>
    </StyledDeliveryStack>
  );
};
