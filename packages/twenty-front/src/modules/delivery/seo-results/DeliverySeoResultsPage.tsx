import { useCallback, useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { useSeoAccess } from '@/delivery/seo-results/useSeoAccess';
import { useSeoRead } from '@/delivery/seo-results/useSeoRead';
import { GET_SEO_PROJECTS } from '@/delivery/seo-results/delivery-seo-results.graphql';
import {
  seoDestination,
  seoSelectionValid,
  SEO_CLOSE_REPORT,
} from '@/delivery/seo-results/seo-navigation';
import { SeoReports } from '@/delivery/seo-results/SeoReports';
import {
  StyledSeoBoundary,
  StyledSeoItem,
} from '@/delivery/seo-results/seoStyles';
import { type DeliverySeoProjectsQuery } from '~/generated-metadata/graphql';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const DeliverySeoResultsPage = () => (
  <DeliveryOperationalPage view="seo">
    <SeoWorkspace />
  </DeliveryOperationalPage>
);
const SeoWorkspace = () => {
  const access = useSeoAccess();
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
  const valid = seoSelectionValid(params);
  return (
    <StyledDeliveryStack>
      {!valid && (
        <p role="alert">
          <Trans>
            This SEO results link is incomplete or invalid. Return to the report
            library to continue.
          </Trans>
        </p>
      )}
      <Link
        to={seoDestination(params, {
          ...SEO_CLOSE_REPORT,
          seoProject: null,
          seoAfter: null,
          seoProjectAfter: null,
          seoStatus: null,
        })}
      >
        <Trans>Choose another project</Trans>
      </Link>
      {valid && !changed && (
        <SeoProjectWorkspace
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
const SeoProjectWorkspace = ({
  access,
  denied,
  onDenied,
  onRecovered,
}: {
  access: ReturnType<typeof useSeoAccess>;
  denied: boolean;
  onDenied: () => void;
  onRecovered: () => void;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction } = useDeliveryDraftGuard();
  const projectId = params.get('seoProject');
  const search = params.get('seoSearch') ?? '';
  const [searchDraft, setSearchDraft] = useState(search);
  const [checking, setChecking] = useState(false);
  const query = useQuery<DeliverySeoProjectsQuery>(GET_SEO_PROJECTS, {
    variables: { input: { search, afterId: params.get('seoProjectAfter') } },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !access.permission.ready || denied,
  });
  const read = useSeoRead({
    value: query.data?.deliverySeoProjects,
    access,
    scope: `projects:${search}:${params.get('seoProjectAfter')}`,
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
        response.data?.deliverySeoProjects &&
        access.matches(response.data.deliverySeoProjects)
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
              ? t`SEO access changed. Private report preparation was cleared. Check access before continuing.`
              : t`Current SEO access could not be verified. Unsaved work is hidden and kept while you retry.`}
          </p>
          <StyledDeliveryButton
            type="button"
            disabled={checking || !access.permission.ready}
            onClick={() => void retry()}
          >
            <Trans>Check SEO access</Trans>
          </StyledDeliveryButton>
        </div>
      )}
      <StyledSeoBoundary
        hidden={!available}
        disabled={!available}
        inert={!available || undefined}
      >
        {mounted &&
          (projectId ? (
            <SeoReports
              key={projectId}
              access={access}
              projectId={projectId}
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
                      seoDestination(params, {
                        seoSearch: searchDraft.trim(),
                        seoProjectAfter: null,
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
                    <StyledSeoItem key={project.id}>
                      <Link
                        to={seoDestination(params, {
                          seoProject: project.id,
                          seoAfter: null,
                        })}
                      >
                        {project.name}
                      </Link>
                    </StyledSeoItem>
                  ))}
                  <StyledDeliveryRow>
                    {params.get('seoProjectAfter') && (
                      <Link
                        to={seoDestination(params, { seoProjectAfter: null })}
                      >
                        <Trans>First project page</Trans>
                      </Link>
                    )}
                    {read.data.nextId && (
                      <Link
                        to={seoDestination(params, {
                          seoProjectAfter: read.data.nextId,
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
      </StyledSeoBoundary>
    </StyledDeliveryStack>
  );
};
