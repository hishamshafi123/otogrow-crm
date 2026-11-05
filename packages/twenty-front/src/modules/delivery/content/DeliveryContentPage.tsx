import { useCallback, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useContentAccess } from '@/delivery/content/useContentAccess';
import { useContentRead } from '@/delivery/content/useContentRead';
import {
  GET_CONTENT_CHOICES,
  GET_CONTENT_PLANS,
  GET_CONTENT_PROJECTS,
} from '@/delivery/content/delivery-content.graphql';
import {
  type ContentChoices,
  type ContentIntent,
  type ContentPlan,
} from '@/delivery/content/content.types';
import {
  contentDestination,
  contentSelectionValid,
  CONTENT_CLOSE_COMMAND,
  CONTENT_CLOSE_POST,
} from '@/delivery/content/content-navigation';
import { ContentCommandPanel } from '@/delivery/content/ContentCommandPanel';
import { ContentPostDetail } from '@/delivery/content/ContentPostDetail';
import { ContentLibrary } from '@/delivery/content/ContentLibrary';
import { ContentChoicePaging } from '@/delivery/content/ContentChoicePaging';
import { mergeContentChoices } from '@/delivery/content/content-choices';
import {
  StyledContentBoundary,
  StyledContentItem,
} from '@/delivery/content/contentStyles';
import { useContentLabels } from '@/delivery/content/useContentLabels';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryContentProjectChoicesQuery,
  type DeliveryContentPlansQuery,
  type DeliveryContentProjectsQuery,
} from '~/generated-metadata/graphql';

export const DeliveryContentPage = () => (
  <DeliveryOperationalPage view="content">
    <ContentWorkspace />
  </DeliveryOperationalPage>
);
const ContentWorkspace = () => {
  const access = useContentAccess();
  const [params] = useSearchParams();
  if (!contentSelectionValid(params))
    return (
      <StyledDeliveryStack>
        <p role="alert">
          <Trans>
            This content link is incomplete or invalid. Choose a project to
            continue.
          </Trans>
        </p>
        <Link to="/delivery?view=content">
          <Trans>Choose a content project</Trans>
        </Link>
      </StyledDeliveryStack>
    );
  const projectId = params.get('contentProject');
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        {projectId && (
          <Link to="/delivery?view=content">
            <Trans>Choose another project</Trans>
          </Link>
        )}
        <Link to="/delivery?view=content&contentView=legacy">
          <Trans>Earlier content records</Trans>
        </Link>
      </StyledDeliveryRow>
      {projectId ? (
        <ContentProjectWorkspace
          key={`${access.source}:${projectId}`}
          access={access}
          projectId={projectId}
        />
      ) : (
        <ContentProjects key={access.source} access={access} />
      )}
    </StyledDeliveryStack>
  );
};
const ContentProjects = ({
  access,
}: {
  access: ReturnType<typeof useContentAccess>;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [denied, setDenied] = useState(false);
  const onDenied = useCallback(() => setDenied(true), []);
  const query = useQuery<DeliveryContentProjectsQuery>(GET_CONTENT_PROJECTS, {
    variables: {
      input: {
        afterId: params.get('contentProjectAfter'),
        search: params.get('contentSearch'),
      },
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !access.permission.ready,
  });
  const read = useContentRead({
    value: query.data?.deliveryContentProjects,
    access,
    query,
    scope: `projects:${params.get('contentProjectAfter')}:${params.get('contentSearch')}`,
    onDenied,
  });
  const data = !denied ? read.data : null;
  return (
    <StyledDeliveryStack>
      <h2>
        <Trans>Choose a content project</Trans>
      </h2>
      <p>
        <Trans>
          Use an existing project for Otogrow's own channels or an authorized
          client. Accounts and posts remain scoped to that project.
        </Trans>
      </p>
      <form
        key={params.get('contentSearch') ?? ''}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          navigate(
            contentDestination(params, {
              contentSearch: String(form.get('search') ?? '').trim(),
              contentProjectAfter: null,
            }),
          );
        }}
      >
        <StyledDeliveryRow>
          <label>
            <Trans>Find a project</Trans>
            <input
              name="search"
              maxLength={200}
              defaultValue={params.get('contentSearch') ?? ''}
            />
          </label>
          <StyledDeliveryButton>
            <Trans>Search projects</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </form>
      {!data ? (
        <p role={query.error || denied ? 'alert' : 'status'}>
          {query.loading && !query.error && !denied ? (
            <Trans>Loading content projects…</Trans>
          ) : (
            <>
              <Trans>Current content projects could not be checked.</Trans>{' '}
              <StyledDeliveryButton
                type="button"
                disabled={!access.permission.ready}
                onClick={() =>
                  void query
                    .refetch()
                    .then((result) => {
                      if (
                        result.data?.deliveryContentProjects &&
                        access.matches(result.data.deliveryContentProjects)
                      )
                        setDenied(false);
                    })
                    .catch(() => undefined)
                }
              >
                <Trans>Check project access</Trans>
              </StyledDeliveryButton>
            </>
          )}
        </p>
      ) : (
        <>
          <p>{t`${data.totalCount} available projects`}</p>
          {data.items.map((project) => (
            <StyledContentItem key={project.id}>
              <Link
                to={contentDestination(params, {
                  contentProject: project.id,
                  contentSearch: null,
                  contentProjectAfter: null,
                })}
              >
                {project.name}
              </Link>
            </StyledContentItem>
          ))}
          {!data.items.length && (
            <p>
              <Trans>No matching projects are available.</Trans>{' '}
              {data.isManager ? (
                <Link to="/delivery?view=team">
                  <Trans>Set up a project</Trans>
                </Link>
              ) : (
                <Trans>
                  Ask a manager to add a project and assign you to its team.
                </Trans>
              )}
            </p>
          )}
          {data.nextId && (
            <Link
              to={contentDestination(params, {
                contentProjectAfter: data.nextId,
              })}
            >
              <Trans>More projects</Trans>
            </Link>
          )}
          {params.has('contentProjectAfter') && (
            <Link
              to={contentDestination(params, { contentProjectAfter: null })}
            >
              <Trans>First projects</Trans>
            </Link>
          )}
        </>
      )}
    </StyledDeliveryStack>
  );
};
const ContentProjectWorkspace = ({
  access,
  projectId,
}: {
  access: ReturnType<typeof useContentAccess>;
  projectId: string;
}) => {
  const [params] = useSearchParams();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const [denied, setDenied] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [retained, setRetained] = useState<ContentChoices | null>(null);
  const onDenied = useCallback(() => {
    cancelPendingNavigation();
    setDenied(true);
    setRetained(null);
    setEpoch((value) => value + 1);
  }, [cancelPendingNavigation]);
  const choiceInput = {
    projectId,
    search: params.get('contentChoiceSearch'),
    afterAccountId: params.get('contentAccountAfter'),
    afterMemberId: params.get('contentMemberAfter'),
    afterEngagementId: params.get('contentEngagementAfter'),
    selectedAccountIds: [
      ...new Set(
        [params.get('contentAccount'), params.get('contentAccountId')].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ],
    selectedMemberIds: params.get('contentOwner')
      ? [params.get('contentOwner')]
      : [],
  };
  const query = useQuery<DeliveryContentProjectChoicesQuery>(
    GET_CONTENT_CHOICES,
    {
      variables: { input: choiceInput },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
      skip: !access.permission.ready,
    },
  );
  const read = useContentRead({
    value: query.data?.deliveryContentProjectChoices,
    access,
    query,
    scope: `project:${JSON.stringify(choiceInput)}`,
    matches: (value) => value.project.id === projectId,
    onDenied,
  });
  if (!denied && read.data && retained !== read.data) setRetained(read.data);
  const available = !denied && read.data !== null;
  const rawChoices = read.data ?? retained;
  const choices = rawChoices ? mergeContentChoices(rawChoices) : null;
  const plansQuery = useQuery<DeliveryContentPlansQuery>(GET_CONTENT_PLANS, {
    variables: {
      input: {
        projectId,
        planId: params.get('contentPlanId'),
        afterId: params.get('contentPlanAfter'),
      },
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !available,
  });
  const plansRead = useContentRead({
    value: plansQuery.data?.deliveryContentPlans,
    access,
    query: plansQuery,
    scope: `plans:${projectId}:${params.get('contentPlanId')}:${params.get('contentPlanAfter')}`,
    matches: (value) => value.scope === choices?.scope,
    onDenied,
  });
  const refresh = async () => {
    await Promise.all([query.refetch(), plansQuery.refetch()]);
  };
  return (
    <StyledDeliveryStack>
      {!available && (
        <p role={query.error || denied ? 'alert' : 'status'}>
          {query.loading && !query.error && !denied ? (
            <Trans>Loading project content…</Trans>
          ) : (
            <>
              <Trans>
                Current content access could not be checked. Unsaved preparation
                is hidden during an outage and cleared when access is revoked.
              </Trans>{' '}
              <StyledDeliveryButton
                type="button"
                disabled={!access.permission.ready}
                onClick={() =>
                  void query
                    .refetch()
                    .then((result) => {
                      if (
                        result.data?.deliveryContentProjectChoices &&
                        access.matches(
                          result.data.deliveryContentProjectChoices,
                        ) &&
                        result.data.deliveryContentProjectChoices.project.id ===
                          projectId
                      ) {
                        setDenied(false);
                        setRetained(result.data.deliveryContentProjectChoices);
                      }
                    })
                    .catch(() => undefined)
                }
              >
                <Trans>Check content access</Trans>
              </StyledDeliveryButton>
            </>
          )}
        </p>
      )}
      {choices && (
        <StyledContentBoundary
          hidden={!available}
          disabled={!available}
          inert={!available || undefined}
        >
          <ContentProjectBody
            key={`${choices.scope}:${epoch}`}
            access={access}
            choices={choices}
            plans={plansRead.data?.items ?? []}
            plansAvailable={plansRead.data !== null}
            plansLoading={plansQuery.loading && !plansQuery.error}
            plansTotal={plansRead.data?.totalCount ?? 0}
            nextPlanId={plansRead.data?.nextId ?? null}
            enabled={available}
            onDenied={onDenied}
            refresh={refresh}
            retryPlans={() => void plansQuery.refetch()}
          />
        </StyledContentBoundary>
      )}
    </StyledDeliveryStack>
  );
};
const ContentProjectBody = ({
  access,
  choices,
  plans,
  plansAvailable,
  plansLoading,
  plansTotal,
  nextPlanId,
  enabled,
  onDenied,
  refresh,
  retryPlans,
}: {
  access: ReturnType<typeof useContentAccess>;
  choices: ContentChoices;
  plans: ContentPlan[];
  plansAvailable: boolean;
  plansLoading: boolean;
  plansTotal: number;
  nextPlanId: string | null;
  enabled: boolean;
  onDenied: () => void;
  refresh: () => Promise<unknown>;
  retryPlans: () => void;
}) => {
  const { t } = useLingui();
  const labels = useContentLabels();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction, requestNavigation } = useDeliveryDraftGuard();
  const [intent, setIntent] = useState<ContentIntent | null>(null);
  const view =
    params.get('contentView') ??
    (params.has('contentAccountId') ? 'accounts' : 'table');
  const postId = params.get('contentPostId');
  const mode = params.get('contentMode');
  const selectedPlan = plans.find(
    (plan) => plan.id === params.get('contentPlanId'),
  );
  const open = (
    next: Omit<ContentIntent, 'requestId' | 'sourceScope' | 'project'>,
  ) =>
    requestAction(() => {
      const action = {
        ...next,
        requestId: crypto.randomUUID(),
        sourceScope: choices.scope,
        project: choices.project,
      };
      setIntent(action);
      navigate(
        contentDestination(params, {
          ...CONTENT_CLOSE_COMMAND,
          contentMode: action.mode,
          contentRequest: action.requestId,
          contentAccountId: action.mode.includes('account')
            ? action.targetId
            : null,
          contentPlanId: action.plan?.id ?? selectedPlan?.id ?? null,
          contentPostId:
            action.mode.includes('account') || action.mode.includes('plan')
              ? null
              : action.targetId,
          ...(action.mode.includes('plan')
            ? { contentPlanId: action.targetId }
            : {}),
          contentVersion: null,
          contentHistoryAfter: null,
        }),
      );
    });
  return (
    <StyledDeliveryStack>
      <h2>{choices.project.name}</h2>
      <p>
        <Trans>
          Prepare channel-specific posts, review their exact packages and record
          manual publication. No account is connected for automatic publishing.
        </Trans>
      </p>
      <nav aria-label={t`Content views`}>
        <StyledDeliveryRow>
          {[
            ['table', t`Posts`],
            ['calendar', t`Calendar`],
            ['plans', t`Plans`],
            ['accounts', t`Social accounts`],
          ].map(([value, label]) => (
            <Link
              key={value}
              aria-current={view === value ? 'page' : undefined}
              to={contentDestination(params, {
                ...CONTENT_CLOSE_POST,
                contentView: value,
                contentAfter: null,
                contentAccountId: null,
                ...(value === 'plans' ? { contentPlanId: null } : {}),
              })}
            >
              {label}
            </Link>
          ))}
        </StyledDeliveryRow>
      </nav>
      {!mode && !postId && (
        <ContentChoicePaging
          key={params.get('contentChoiceSearch') ?? ''}
          choices={choices}
          enabled={enabled}
          page={{
            search: params.get('contentChoiceSearch') ?? '',
            afterAccountId: params.get('contentAccountAfter'),
            afterMemberId: params.get('contentMemberAfter'),
            afterEngagementId: params.get('contentEngagementAfter'),
          }}
          update={(page) =>
            navigate(
              contentDestination(params, {
                contentChoiceSearch: page.search,
                contentAccountAfter: page.afterAccountId,
                contentMemberAfter: page.afterMemberId,
                contentEngagementAfter: page.afterEngagementId,
              }),
            )
          }
          members={view !== 'accounts'}
          engagements={false}
        />
      )}
      {mode ? (
        <ContentCommandPanel
          key={`${choices.scope}:${params.get('contentRequest')}`}
          access={access}
          choices={choices}
          intent={intent}
          enabled={enabled}
          onDenied={onDenied}
          onSaved={refresh}
          onReplaceIntent={(next) => {
            const destination = contentDestination(params, {
              contentRequest: next.requestId,
              ...(next.mode.includes('account')
                ? { contentAccountId: next.targetId }
                : next.mode.includes('plan')
                  ? { contentPlanId: next.targetId }
                  : { contentPostId: next.targetId }),
            });
            requestNavigation(
              {
                pathname: '/delivery',
                search: destination.slice('/delivery'.length),
              },
              () => {
                setIntent(next);
                navigate(destination);
              },
            );
          }}
        />
      ) : postId ? (
        <ContentPostDetail
          access={access}
          projectId={choices.project.id}
          postId={postId}
          enabled={enabled}
          onDenied={onDenied}
          open={open}
        />
      ) : view === 'accounts' ? (
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <h3>
              <Trans>Manual posting accounts</Trans>
            </h3>
            {choices.isManager && (
              <StyledDeliveryButton
                type="button"
                onClick={() =>
                  open({ targetId: crypto.randomUUID(), mode: 'account' })
                }
              >
                <Trans>Add social account</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
          {!choices.accounts.length && (
            <p>
              <Trans>
                No accounts configured. A manager can add the public social
                pages your team will use.
              </Trans>
            </p>
          )}
          {choices.accounts.map((account) => (
            <StyledContentItem key={account.id}>
              <StyledDeliveryStack>
                <strong>
                  {account.name} · {labels.platform(account.platform)}
                </strong>
                <span>
                  {account.handle} ·{' '}
                  {account.archived
                    ? t`Archived`
                    : t`Available for manual planning`}
                </span>
                <a href={account.profileUrl} target="_blank" rel="noreferrer">
                  <Trans>Open public profile</Trans>
                </a>
                {choices.isManager && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() =>
                      open({
                        targetId: account.id,
                        mode: 'edit-account',
                        account,
                      })
                    }
                  >
                    <Trans>Edit account metadata</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledDeliveryStack>
            </StyledContentItem>
          ))}
        </StyledDeliveryStack>
      ) : view === 'plans' ? (
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <h3>
              <Trans>Content plans</Trans>
            </h3>
            <StyledDeliveryButton
              type="button"
              onClick={() =>
                open({ targetId: crypto.randomUUID(), mode: 'plan' })
              }
            >
              <Trans>Create content plan</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
          {!plansAvailable ? (
            <p role="status">
              {plansLoading ? (
                <Trans>Loading content plans…</Trans>
              ) : (
                <>
                  <Trans>Current plans could not be checked.</Trans>{' '}
                  <StyledDeliveryButton type="button" onClick={retryPlans}>
                    <Trans>Check plans</Trans>
                  </StyledDeliveryButton>
                </>
              )}
            </p>
          ) : (
            <>
              <p>{t`${plansTotal} content plans`}</p>
              {plans.map((plan) => (
                <StyledContentItem key={plan.id}>
                  <StyledDeliveryStack>
                    <strong>{plan.title}</strong>
                    <p>{plan.purpose}</p>
                    <Link
                      to={contentDestination(params, {
                        contentView: 'table',
                        contentPlanId: plan.id,
                        contentPlanAfter: null,
                        contentAfter: null,
                      })}
                    >
                      <Trans>Open plan and post variants</Trans>
                    </Link>
                  </StyledDeliveryStack>
                </StyledContentItem>
              ))}
              {!plans.length && (
                <p>
                  <Trans>
                    No content plans yet. Add an idea and objective before
                    preparing channel variants.
                  </Trans>
                </p>
              )}
              {nextPlanId && (
                <Link
                  to={contentDestination(params, {
                    contentPlanAfter: nextPlanId,
                  })}
                >
                  <Trans>More plans</Trans>
                </Link>
              )}
              {params.has('contentPlanAfter') && (
                <Link
                  to={contentDestination(params, { contentPlanAfter: null })}
                >
                  <Trans>First plans</Trans>
                </Link>
              )}
            </>
          )}
        </StyledDeliveryStack>
      ) : (
        <>
          {params.has('contentPlanId') &&
            (!plansAvailable ? (
              <p role="status">
                <Trans>Checking this content plan…</Trans>{' '}
                <StyledDeliveryButton type="button" onClick={retryPlans}>
                  <Trans>Check plan</Trans>
                </StyledDeliveryButton>
              </p>
            ) : selectedPlan ? (
              <StyledContentItem>
                <StyledDeliveryStack>
                  <h3>{selectedPlan.title}</h3>
                  <p>{selectedPlan.purpose}</p>
                  <StyledDeliveryRow>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        open({
                          targetId: crypto.randomUUID(),
                          mode: 'variant',
                          plan: selectedPlan,
                        })
                      }
                    >
                      <Trans>Prepare a post variant</Trans>
                    </StyledDeliveryButton>
                    {selectedPlan.canEdit && (
                      <StyledDeliveryButton
                        type="button"
                        onClick={() =>
                          open({
                            targetId: selectedPlan.id,
                            mode: 'edit-plan',
                            plan: selectedPlan,
                          })
                        }
                      >
                        <Trans>Edit plan context</Trans>
                      </StyledDeliveryButton>
                    )}
                    <Link
                      to={contentDestination(params, {
                        contentPlanId: null,
                        contentAfter: null,
                      })}
                    >
                      <Trans>All project posts</Trans>
                    </Link>
                  </StyledDeliveryRow>
                </StyledDeliveryStack>
              </StyledContentItem>
            ) : (
              <p role="alert">
                <Trans>
                  This plan is unavailable. Choose another current plan.
                </Trans>
              </p>
            ))}
          {!params.has('contentPlanId') && (
            <Link to={contentDestination(params, { contentView: 'plans' })}>
              <Trans>Choose a plan to prepare a post</Trans>
            </Link>
          )}
          <ContentLibrary
            access={access}
            choices={choices}
            enabled={enabled}
            onDenied={onDenied}
          />
        </>
      )}
    </StyledDeliveryStack>
  );
};
