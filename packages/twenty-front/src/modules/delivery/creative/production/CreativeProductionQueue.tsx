import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { CreativeDueDate } from '@/delivery/creative/production/CreativeDueDate';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import type { useCreativeProductionContext } from '@/delivery/creative/production/useCreativeProductionContext';
import {
  GET_CREATIVE_PROJECTS,
  GET_CREATIVE_TASKS,
} from '@/delivery/creative/production/creative-production.graphql';
import {
  StyledCreativeAppliedFilters,
  StyledCreativeFacts,
  StyledCreativeFilterFields,
  StyledCreativeFilters,
  StyledCreativeQueue,
  StyledCreativeQueueItem,
  StyledCreativeSearch,
  StyledCreativeToolbar,
} from '@/delivery/creative/production/creative-production-styles';
import { creativeProductionDestination } from '@/delivery/creative/production/creative-production-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryCreativeProjectsQuery,
  type DeliveryCreativeTasksQuery,
} from '~/generated-metadata/graphql';

type CreativeProductionQueueProps = {
  state: ReturnType<typeof useCreativeProductionContext>;
};
export const CreativeProductionQueue = ({
  state,
}: CreativeProductionQueueProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction } = useDeliveryDraftGuard();
  const input = {
    projectId: params.get('creativeProject'),
    search: params.get('creativeSearch'),
    state: params.get('creativeState'),
    mine: params.get('creativeMine') === '1',
    production: params.get('creativeProduction') ?? 'ALL',
    after: params.get('creativeAfter'),
    limit: 25,
  };
  const source = `${state.source}:${state.data?.scope ?? ''}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryCreativeTasksQuery>(GET_CREATIVE_TASKS, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: state.data === null,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryCreativeTasks,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.matches(value) &&
      value.scope === state.data?.scope &&
      value.selectedProject?.id === (input.projectId ?? undefined),
  });
  const data = reading.data;
  const go = (changes: Record<string, string | null>) =>
    requestAction(() =>
      navigate(creativeProductionDestination(params, changes)),
    );
  const clear = () =>
    go({
      creativeProject: null,
      creativeSearch: null,
      creativeState: null,
      creativeMine: null,
      creativeProduction: null,
      creativeAfter: null,
    });
  const statuses: Record<string, string> = {
    PLANNED: t`Planned`,
    IN_PROGRESS: t`In progress`,
    BLOCKED: t`Blocked`,
    IN_REVIEW: t`Waiting for review`,
    CHANGES_REQUESTED: t`Changes requested`,
    APPROVED: t`Approved work`,
  };
  const appliedFilters = [
    input.projectId
      ? (data?.selectedProject?.name ?? t`Selected project`)
      : null,
    input.state ? (statuses[input.state] ?? t`Selected status`) : null,
    input.production === 'STARTED'
      ? t`Production started`
      : input.production === 'NOT_STARTED'
        ? t`Not started`
        : null,
    input.mine ? t`Assigned to me` : null,
  ].filter(isDefined);
  const hasFilters = Boolean(input.search) || appliedFilters.length > 0;
  return (
    <StyledDeliveryStack>
      <div>
        <form
          key={`search:${input.search ?? ''}`}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            go({
              creativeSearch: String(form.get('search') ?? '').trim(),
              creativeAfter: null,
            });
          }}
        >
          <StyledCreativeSearch>
            <label>
              <Trans>Search tasks</Trans>
              <input
                name="search"
                maxLength={160}
                defaultValue={input.search ?? ''}
                placeholder={t`Find a creative task`}
              />
            </label>
            <StyledDeliveryButton type="submit">
              <Trans>Search</Trans>
            </StyledDeliveryButton>
          </StyledCreativeSearch>
        </form>
        <StyledCreativeFilters>
          <summary>
            {appliedFilters.length > 0 ? (
              <Trans>Filters ({appliedFilters.length} active)</Trans>
            ) : (
              <Trans>Filters</Trans>
            )}
          </summary>
          <div>
            <form
              key={`filters:${JSON.stringify(input)}`}
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                go({
                  creativeState: String(form.get('state') ?? ''),
                  creativeProduction: String(form.get('production') ?? ''),
                  creativeMine: form.has('mine') ? '1' : null,
                  creativeAfter: null,
                });
              }}
            >
              <StyledDeliveryStack>
                <StyledCreativeFilterFields>
                  <label>
                    <Trans>Work status</Trans>
                    <select name="state" defaultValue={input.state ?? ''}>
                      <option value="">{t`All statuses`}</option>
                      {Object.entries(statuses).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <Trans>Production</Trans>
                    <select name="production" defaultValue={input.production}>
                      <option value="ALL">{t`All tasks`}</option>
                      <option value="STARTED">{t`Production started`}</option>
                      <option value="NOT_STARTED">{t`Not started`}</option>
                    </select>
                  </label>
                  <label>
                    <input
                      name="mine"
                      type="checkbox"
                      defaultChecked={input.mine}
                    />
                    <Trans>Assigned to me</Trans>
                  </label>
                </StyledCreativeFilterFields>
                <StyledCreativeToolbar>
                  <StyledDeliveryButton type="submit">
                    <Trans>Apply filters</Trans>
                  </StyledDeliveryButton>
                  {hasFilters && data?.items.length !== 0 && (
                    <StyledDeliveryButton type="button" onClick={clear}>
                      <Trans>Clear filters</Trans>
                    </StyledDeliveryButton>
                  )}
                </StyledCreativeToolbar>
              </StyledDeliveryStack>
            </form>
            <CreativeProjectPicker
              state={state}
              selectedName={data?.selectedProject?.name ?? null}
              selectedId={input.projectId}
              onSelect={(id) =>
                go({ creativeProject: id, creativeAfter: null })
              }
            />
          </div>
        </StyledCreativeFilters>
      </div>
      {appliedFilters.length > 0 && (
        <StyledCreativeAppliedFilters>
          <Trans>Showing:</Trans> {appliedFilters.join(', ')}
        </StyledCreativeAppliedFilters>
      )}
      {query.error && (
        <div role="alert">
          <Trans>
            The production queue could not be checked. Your task and filters
            have not changed.
          </Trans>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              onClick={() => void query.refetch()}
            >
              <Trans>Retry queue</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton
              type="button"
              onClick={() => go({ creativeAfter: null })}
            >
              <Trans>Open first page</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </div>
      )}
      {!data && !query.error && (
        <p role="status">
          <Trans>Loading current tasks…</Trans>
        </p>
      )}
      {data && (
        <>
          {(data.items.length > 0 || hasFilters || input.after) && (
            <StyledCreativeToolbar>
              <h2>
                <Trans>Production queue</Trans>
              </h2>
              <small>
                <Trans>
                  {data.items.length} shown of {data.totalCount} matching tasks
                </Trans>
              </small>
            </StyledCreativeToolbar>
          )}
          {data.items.length === 0 && (
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <div>
                  <h2>
                    {input.after
                      ? t`No tasks on this page`
                      : hasFilters
                        ? t`No matching tasks`
                        : t`Your creative queue is ready`}
                  </h2>
                  <p>
                    {input.after
                      ? t`Return to the first page to see current production work.`
                      : hasFilters
                        ? t`Try a different search or clear the filters to see more work.`
                        : state.data?.actor.isManager
                          ? t`Create and assign a task from Today, then open it here to prepare the brief and produce the creative.`
                          : t`Creative tasks in your projects will appear here. Your project manager can create and assign new work.`}
                  </p>
                </div>
                <StyledCreativeToolbar>
                  {hasFilters && (
                    <StyledDeliveryButton type="button" onClick={clear}>
                      <Trans>Clear filters</Trans>
                    </StyledDeliveryButton>
                  )}
                  {!hasFilters && !input.after && (
                    <Link to="/delivery?view=home">
                      <Trans>Open Today</Trans>
                    </Link>
                  )}
                </StyledCreativeToolbar>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          )}
          {data.items.length > 0 && (
            <StyledCreativeQueue aria-label={t`Production tasks`}>
              {data.items.map((task) => (
                <StyledCreativeQueueItem key={task.id}>
                  <div>
                    <StyledCreativeToolbar>
                      <h3 id={`creative-task-${task.id}`}>{task.title}</h3>
                      <StyledDeliveryButton
                        type="button"
                        aria-describedby={`creative-task-${task.id}`}
                        onClick={() => go({ task: task.id })}
                      >
                        <Trans>Open production</Trans>
                      </StyledDeliveryButton>
                    </StyledCreativeToolbar>
                    <p>{task.projectName}</p>
                    <small>
                      {task.hasProduction
                        ? t`Production started`
                        : t`Not started`}
                    </small>
                  </div>
                  <StyledCreativeFacts>
                    <div>
                      <dt>
                        <Trans>Assigned to</Trans>
                      </dt>
                      <dd>{task.assigneeName ?? t`Unassigned`}</dd>
                    </div>
                    <div>
                      <dt>
                        <Trans>Status</Trans>
                      </dt>
                      <dd>{statuses[task.state] ?? t`Status unavailable`}</dd>
                    </div>
                    <div>
                      <dt>
                        <Trans>Due</Trans>
                      </dt>
                      <dd>
                        <CreativeDueDate value={task.dueAt ?? null} />
                      </dd>
                    </div>
                  </StyledCreativeFacts>
                </StyledCreativeQueueItem>
              ))}
            </StyledCreativeQueue>
          )}
          <StyledDeliveryRow>
            {input.after && (
              <StyledDeliveryButton
                type="button"
                onClick={() => go({ creativeAfter: null })}
              >
                <Trans>First page</Trans>
              </StyledDeliveryButton>
            )}
            {data.nextCursor && (
              <StyledDeliveryButton
                type="button"
                onClick={() => go({ creativeAfter: data.nextCursor ?? null })}
              >
                <Trans>Next tasks</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        </>
      )}
    </StyledDeliveryStack>
  );
};

const CreativeProjectPicker = ({
  state,
  selectedId,
  selectedName,
  onSelect,
}: CreativeProductionQueueProps & {
  selectedId: string | null;
  selectedName: string | null;
  onSelect: (id: string | null) => void;
}) => {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [after, setAfter] = useState<string | null>(null);
  const input = { search, after, limit: 25 };
  const source = `${state.source}:${state.data?.scope ?? ''}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryCreativeProjectsQuery>(GET_CREATIVE_PROJECTS, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !open || state.data === null,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryCreativeProjects,
    source,
    enabled: open && state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.matches(value) && value.scope === state.data?.scope,
  });
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {selectedId
          ? (selectedName ?? t`Selected project`)
          : t`All accessible projects`}
      </summary>
      {open && (
        <StyledDeliveryStack>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(
                String(
                  new FormData(event.currentTarget).get('projectSearch') ?? '',
                ).trim(),
              );
              setAfter(null);
            }}
          >
            <label>
              <Trans>Find a project</Trans>
              <input
                name="projectSearch"
                maxLength={160}
                defaultValue={search}
              />
            </label>
            <StyledDeliveryButton type="submit">
              <Trans>Find projects</Trans>
            </StyledDeliveryButton>
          </form>
          <StyledDeliveryButton
            type="button"
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
          >
            <Trans>All accessible projects</Trans>
          </StyledDeliveryButton>
          {query.error && (
            <p role="alert">
              <Trans>Projects could not be checked.</Trans>
              <StyledDeliveryButton
                type="button"
                onClick={() => {
                  setAfter(null);
                  void query.refetch({ input: { ...input, after: null } });
                }}
              >
                <Trans>Reload projects</Trans>
              </StyledDeliveryButton>
            </p>
          )}
          {reading.data && (
            <>
              <p>
                <Trans>
                  {reading.data.items.length} shown of {reading.data.totalCount}{' '}
                  projects
                </Trans>
              </p>
              {reading.data.items.map((project) => (
                <StyledDeliveryButton
                  type="button"
                  key={project.id}
                  onClick={() => {
                    onSelect(project.id);
                    setOpen(false);
                  }}
                >
                  {project.name}
                </StyledDeliveryButton>
              ))}
              <StyledDeliveryRow>
                {after && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => setAfter(null)}
                  >
                    <Trans>First projects</Trans>
                  </StyledDeliveryButton>
                )}
                {reading.data.nextCursor && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => setAfter(reading.data?.nextCursor ?? null)}
                  >
                    <Trans>More projects</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledDeliveryRow>
            </>
          )}
        </StyledDeliveryStack>
      )}
    </details>
  );
};
