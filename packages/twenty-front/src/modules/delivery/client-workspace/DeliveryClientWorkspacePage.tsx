import { useLayoutEffect, useMemo, useState } from 'react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { DeliveryCommitmentsPage } from '@/delivery/commitments/DeliveryCommitmentsPage';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import { useClientSetup } from '@/delivery/onboarding/useClientSetup';
import { ClientSetupLink } from '@/delivery/onboarding/ClientSetupLink';
import { CompanyProfile } from '@/delivery/client-workspace/CompanyProfile';
import { ClientContacts } from '@/delivery/client-workspace/ClientContacts';
import { ClientServicePlans } from '@/delivery/client-workspace/ClientServicePlans';
import { useClientHub } from '@/delivery/client-workspace/useClientHub';
import { ClientOverviewGrid } from '@/delivery/client-workspace/ClientOverviewGrid';
import { ClientSelectedOverview } from '@/delivery/client-workspace/ClientSelectedOverview';
import { ClientPortalSection } from '@/delivery/client-workspace/ClientPortalSection';
import { ClientRosterPickerModal } from '@/delivery/client-workspace/ClientRosterPickerModal';
import { type ClientHubItem } from '@/delivery/client-workspace/client-hub.types';
import {
  CLIENT_SECTIONS,
  clientWorkspaceDestination,
  clientWorkspaceSelection,
} from '@/delivery/client-workspace/client-workspace-navigation';
import {
  StyledClientActions,
  StyledClientBoundary,
  StyledClientCommandBar,
  StyledClientCommandMeta,
  StyledClientDirectory,
  StyledClientLayout,
  StyledClientMain,
  StyledClientProject,
  StyledClientSubtleButton,
  StyledClientTabs,
  StyledClientTag,
  StyledDirectoryBadge,
  StyledDirectoryFooter,
  StyledDirectoryOverviewLink,
  StyledUndoBanner,
} from '@/delivery/client-workspace/client-workspace.styles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const DeliveryClientWorkspacePage = () => {
  const permission = useWorkflowAccess();
  if (permission.ready && !permission.manager)
    return <DeliveryCommitmentsPage />;
  return (
    <DeliveryOperationalPage view="clients">
      <ClientWorkspaceDirectory key={permission.scope} />
    </DeliveryOperationalPage>
  );
};

const ClientWorkspaceDirectory = () => {
  const { t } = useLingui();
  const [params, setParams] = useSearchParams();
  const selection = clientWorkspaceSelection(params);
  const [directoryExpanded, setDirectoryExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastRemoved, setLastRemoved] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [search, setSearch] = useState(selection.search);
  const [previousSearch, setPreviousSearch] = useState(selection.search);
  if (previousSearch !== selection.search) {
    setPreviousSearch(selection.search);
    setSearch(selection.search);
  }
  const state = useClientSetup(
    {
      companyId: selection.companyId,
      projectId: selection.projectId,
      companySearch: selection.search,
    },
    selection.valid,
  );
  const hub = useClientHub(selection.valid);
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const [retained, setRetained] = useState({
    source: state.source,
    data: state.data,
  });
  if (
    state.data &&
    (retained.source !== state.source ||
      !fastDeepEqual(retained.data, state.data))
  ) {
    setRetained({ source: state.source, data: state.data });
  }
  useLayoutEffect(() => {
    if (state.denied) {
      setRetained({ source: state.source, data: null });
      cancelPendingNavigation();
    }
  }, [state.denied, state.source, cancelPendingNavigation]);
  const data = state.denied
    ? null
    : (state.data ?? (retained.source === state.source ? retained.data : null));
  const available = Boolean(state.data) && !state.denied;
  const company = data?.selectedCompany;
  const serviceProjectId =
    selection.projectId ??
    (data?.projects.length === 1 ? data.projects[0].id : null);
  const project = data?.projects.find((item) => item.id === serviceProjectId);
  const sectionLabels = {
    overview: t`Overview & due work`,
    profile: t`Profile`,
    contacts: t`Contacts`,
    services: t`Services`,
    projects: t`Projects & brand knowledge`,
    portal: t`Portal & commitments`,
  };

  const hubData = state.denied ? null : hub.data;
  const selectedHubClient = useMemo(
    () =>
      company && hubData
        ? (hubData.clients.find((item) => item.id === company.id) ?? null)
        : null,
    [company, hubData],
  );

  const directoryItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (hubData) {
      return hubData.clients
        .filter((item) =>
          normalizedSearch
            ? item.name.toLocaleLowerCase().includes(normalizedSearch) ||
              (item.domainName ?? '')
                .toLocaleLowerCase()
                .includes(normalizedSearch)
            : true,
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          overdueCount: item.tasksSummary.overdueCount,
          openCount: item.tasksSummary.openCount,
          useOverviewSection: true,
        }));
    }
    return (data?.companies ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      overdueCount: 0,
      openCount: 0,
      useOverviewSection: false,
    }));
  }, [data?.companies, hubData, search]);

  const handleRemoveClient = async (
    client: Pick<ClientHubItem, 'id' | 'name'>,
  ) => {
    const ok = await hub.updateRoster({
      action: 'remove',
      companyIds: [client.id],
    });
    if (ok) {
      setLastRemoved({ id: client.id, name: client.name });
      if (selection.companyId === client.id) {
        setParams(new URLSearchParams({ view: 'clients' }));
      }
    }
  };

  const handleUndoRemove = async () => {
    if (!lastRemoved) return;
    const ok = await hub.updateRoster({
      action: 'add',
      companyIds: [lastRemoved.id],
    });
    if (ok) setLastRemoved(null);
  };

  const handleMarkSelectedAsClient = async () => {
    if (!company) return;
    const ok = await hub.updateRoster({
      action: 'add',
      companyIds: [company.id],
    });
    if (ok) setLastRemoved(null);
  };

  const activeClientCount = hubData?.summary.totalClients ?? null;

  return (
    <StyledDeliveryStack>
      <StyledClientCommandBar>
        <StyledClientCommandMeta>
          <h2>
            {activeClientCount !== null
              ? t`Client workspace · ${activeClientCount} active`
              : t`Client workspace`}
          </h2>
          <p>
            <Trans>
              Only companies you mark as clients appear here—Gmail-synced CRM
              companies stay out of your client list and dropdowns until you
              select them.
            </Trans>
          </p>
        </StyledClientCommandMeta>
        <StyledClientActions>
          <Link data-primary="true" to="/delivery?view=onboarding">
            <Trans>Add a client</Trans>
          </Link>
          <StyledDeliveryButton
            type="button"
            onClick={() => {
              hub.clearUpdateError();
              setPickerOpen(true);
            }}
          >
            <Trans>Select clients from CRM</Trans>
          </StyledDeliveryButton>
          <Link to="/delivery?view=clients&clientView=commitments">
            <Trans>Delivery commitments</Trans>
          </Link>
          <Link to="/delivery?view=clients&clientView=agreements">
            <Trans>Portals &amp; agreements</Trans>
          </Link>
        </StyledClientActions>
      </StyledClientCommandBar>

      {lastRemoved && (
        <StyledUndoBanner role="status">
          <p>
            {t`Removed ${lastRemoved.name} from your Clients list. Its CRM company record was not deleted.`}
          </p>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              disabled={hub.updating}
              onClick={() => void handleUndoRemove()}
            >
              <Trans>Undo</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton
              type="button"
              onClick={() => setLastRemoved(null)}
            >
              <Trans>Dismiss</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </StyledUndoBanner>
      )}

      {hub.updateError && !pickerOpen && <p role="alert">{hub.updateError}</p>}

      {!selection.valid ? (
        <p role="alert">
          <Trans>This client link is invalid.</Trans>{' '}
          <Link to="/delivery?view=clients">
            <Trans>Open clients</Trans>
          </Link>
        </p>
      ) : (
        <StyledClientLayout>
          <StyledClientDirectory
            aria-label={t`Client directory`}
            data-collapsed={Boolean(company) && !directoryExpanded}
          >
            {company && (
              <StyledDeliveryButton
                className="client-directory-toggle"
                aria-expanded={directoryExpanded}
                aria-controls="client-directory-content"
                onClick={() => setDirectoryExpanded(!directoryExpanded)}
              >
                <Trans>Change client</Trans>
              </StyledDeliveryButton>
            )}
            <div
              id="client-directory-content"
              className="client-directory-content"
            >
              <StyledDirectoryOverviewLink>
                <Link
                  onClick={() => setDirectoryExpanded(false)}
                  aria-current={!selection.companyId ? 'page' : undefined}
                  to="/delivery?view=clients"
                >
                  <span>
                    <Trans>All clients overview</Trans>
                  </span>
                  {activeClientCount !== null && (
                    <StyledDirectoryBadge data-tone="accent">
                      {activeClientCount}
                    </StyledDirectoryBadge>
                  )}
                </Link>
              </StyledDirectoryOverviewLink>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const next = new URLSearchParams(params);
                  if (search.trim()) next.set('clientSearch', search.trim());
                  else next.delete('clientSearch');
                  setParams(next);
                }}
              >
                <label htmlFor="client-search">
                  <Trans>Find a client</Trans>
                </label>
                <input
                  id="client-search"
                  value={search}
                  maxLength={160}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t`Filter your clients`}
                />
                {!hubData && (
                  <StyledDeliveryButton type="submit">
                    <Trans>Search</Trans>
                  </StyledDeliveryButton>
                )}
              </form>

              {(state.query.loading || (hub.loading && !hubData)) && (
                <p role="status">
                  <Trans>Loading clients…</Trans>
                </p>
              )}

              {(available || Boolean(hubData)) && (
                <>
                  <ul aria-label={t`Clients`}>
                    {directoryItems.map((item) => (
                      <li key={item.id}>
                        <Link
                          onClick={() => setDirectoryExpanded(false)}
                          aria-current={
                            item.id === selection.companyId ? 'page' : undefined
                          }
                          to={clientWorkspaceDestination({
                            companyId: item.id,
                            section: item.useOverviewSection
                              ? 'overview'
                              : 'profile',
                            search: selection.search,
                          })}
                        >
                          <span>{item.name}</span>
                          {item.overdueCount > 0 ? (
                            <StyledDirectoryBadge data-tone="danger">
                              {item.overdueCount}
                            </StyledDirectoryBadge>
                          ) : item.openCount > 0 ? (
                            <StyledDirectoryBadge>
                              {item.openCount}
                            </StyledDirectoryBadge>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {!directoryItems.length && (
                    <p>
                      {hubData && !hubData.clients.length ? (
                        <Trans>
                          No clients marked yet. Select your real clients from
                          CRM or add a new client.
                        </Trans>
                      ) : (
                        <Trans>
                          No matching clients. Try another name or select more
                          clients from CRM.
                        </Trans>
                      )}
                    </p>
                  )}
                  {!hubData && data?.companiesHasMore && (
                    <p role="status">
                      <Trans>
                        Showing the first 50 matches. Search by name to narrow
                        the list.
                      </Trans>
                    </p>
                  )}
                </>
              )}

              <StyledDirectoryFooter>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => {
                    hub.clearUpdateError();
                    setPickerOpen(true);
                  }}
                >
                  <Trans>Manage client list</Trans>
                </StyledDeliveryButton>
              </StyledDirectoryFooter>
            </div>
          </StyledClientDirectory>

          <StyledClientMain aria-label={t`Client workspace`}>
            {(state.query.error || state.denied || state.permission.error) && (
              <StyledDeliveryCard>
                <p role="alert">
                  <Trans>
                    Client information is unavailable. Check your connection and
                    access, then retry.
                  </Trans>
                </p>
                <StyledDeliveryButton
                  onClick={() => {
                    void state.permission
                      .refetch()
                      .then(() => state.recheckAccess())
                      .then(() => hub.refetch())
                      .catch(() => undefined);
                  }}
                  disabled={state.busy || state.query.loading}
                >
                  <Trans>Retry</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryCard>
            )}

            {!company && !selection.companyId && hubData && !state.denied && (
              <ClientOverviewGrid
                hub={hubData}
                updatingRoster={hub.updating}
                onOpenPicker={() => {
                  hub.clearUpdateError();
                  setPickerOpen(true);
                }}
                onRemoveClient={(client) => void handleRemoveClient(client)}
              />
            )}

            {available &&
              data &&
              !company &&
              (Boolean(selection.companyId) || !hubData) && (
                <StyledDeliveryCard>
                  <StyledDeliveryStack>
                    <h2>
                      {selection.companyId
                        ? t`Client unavailable`
                        : t`Your client, in one place`}
                    </h2>
                    <p>
                      {selection.companyId
                        ? t`This company could not be found with your current access. Select another client.`
                        : t`Choose a client to update their profile, manage contacts and services, and open their project work and brand knowledge.`}
                    </p>
                  </StyledDeliveryStack>
                </StyledDeliveryCard>
              )}

            {company && (
              <StyledClientBoundary
                hidden={!available}
                disabled={!available}
                inert={!available || undefined}
              >
                <header>
                  <div>
                    <StyledDeliveryRow>
                      <h2>{company.name}</h2>
                      {selectedHubClient?.tasksSummary.overdueCount ? (
                        <StyledClientTag data-tone="danger">
                          {t`${selectedHubClient.tasksSummary.overdueCount} overdue`}
                        </StyledClientTag>
                      ) : selectedHubClient ? (
                        <StyledClientTag data-tone="iris">
                          <Trans>Active client</Trans>
                        </StyledClientTag>
                      ) : null}
                    </StyledDeliveryRow>
                    <p>
                      {selectedHubClient?.domainName
                        ? `${selectedHubClient.domainName} · ${t`Client workspace`}`
                        : t`Client workspace`}
                    </p>
                  </div>
                  <StyledDeliveryRow>
                    {hubData && !selectedHubClient && (
                      <StyledDeliveryButton
                        type="button"
                        disabled={hub.updating}
                        onClick={() => void handleMarkSelectedAsClient()}
                      >
                        <Trans>Mark as client</Trans>
                      </StyledDeliveryButton>
                    )}
                    {selectedHubClient && (
                      <StyledClientSubtleButton
                        type="button"
                        disabled={hub.updating}
                        onClick={() =>
                          void handleRemoveClient({
                            id: company.id,
                            name: company.name,
                          })
                        }
                      >
                        <Trans>Remove from clients</Trans>
                      </StyledClientSubtleButton>
                    )}
                    <ClientSetupLink companyId={company.id}>
                      <Trans>Add project or service</Trans>
                    </ClientSetupLink>
                  </StyledDeliveryRow>
                </header>

                <StyledClientTabs aria-label={t`Client sections`}>
                  {CLIENT_SECTIONS.map((section) => (
                    <Link
                      key={section}
                      aria-current={
                        selection.section === section ? 'page' : undefined
                      }
                      to={clientWorkspaceDestination({ ...selection, section })}
                    >
                      {sectionLabels[section]}
                    </Link>
                  ))}
                </StyledClientTabs>

                {selection.section === 'overview' && (
                  <ClientSelectedOverview
                    companyId={company.id}
                    hubClient={selectedHubClient}
                  />
                )}

                {selection.section === 'profile' && (
                  <CompanyProfile
                    key={`${state.authority}:${company.id}`}
                    companyId={company.id}
                    onSaved={() => {
                      void state.query.refetch();
                      void hub.refetch();
                    }}
                  />
                )}

                {selection.section === 'contacts' && (
                  <ClientContacts
                    key={`${state.authority}:${company.id}`}
                    companyId={company.id}
                  />
                )}

                {selection.section === 'services' && (
                  <>
                    <label>
                      <Trans>Client project</Trans>
                      <select
                        value={serviceProjectId ?? ''}
                        onChange={(event) => {
                          const destination = clientWorkspaceDestination({
                            ...selection,
                            projectId: event.target.value || null,
                          });
                          setParams(
                            new URLSearchParams(destination.split('?')[1]),
                          );
                        }}
                      >
                        <option value="">{t`Choose a project`}</option>
                        {data.projects.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {project ? (
                      <ClientServicePlans
                        key={`${state.authority}:${company.id}:${project.id}`}
                        state={state}
                        retainedData={data}
                        projectId={project.id}
                      />
                    ) : (
                      <p>
                        <Trans>
                          Select a project to view and edit its service plans.
                        </Trans>
                      </p>
                    )}
                    {!data.projects.length && (
                      <ClientSetupLink companyId={company.id}>
                        <Trans>Set up this client’s first project</Trans>
                      </ClientSetupLink>
                    )}
                    {selectedHubClient?.finance && (
                      <StyledDeliveryCard>
                        <StyledDeliveryRow>
                          <span>
                            <Trans>
                              Need to record a retainer invoice or payment
                              collected from this client?
                            </Trans>
                          </span>
                          <Link to="/delivery?view=finance">
                            <Trans>Open Finance →</Trans>
                          </Link>
                        </StyledDeliveryRow>
                      </StyledDeliveryCard>
                    )}
                  </>
                )}

                {selection.section === 'projects' && (
                  <StyledDeliveryStack>
                    <p>
                      <Trans>
                        Keep each project’s team, delivery work and brand
                        knowledge together.
                      </Trans>
                    </p>
                    {data.projects.map((item) => {
                      const hubProject = selectedHubClient?.projects.find(
                        (candidate) => candidate.id === item.id,
                      );
                      return (
                        <StyledClientProject key={item.id}>
                          <StyledDeliveryRow>
                            <h3>{item.name}</h3>
                            {hubProject && (
                              <StyledDeliveryRow>
                                {hubProject.overdueTasksCount > 0 && (
                                  <StyledClientTag data-tone="danger">
                                    {t`${hubProject.overdueTasksCount} overdue`}
                                  </StyledClientTag>
                                )}
                                <StyledClientTag>
                                  {hubProject.openTasksCount === 1
                                    ? t`1 open task`
                                    : t`${hubProject.openTasksCount} open tasks`}
                                </StyledClientTag>
                              </StyledDeliveryRow>
                            )}
                          </StyledDeliveryRow>
                          <p>
                            {item.memberIds
                              .map(
                                (id) =>
                                  data.members.find(
                                    (member) => member.id === id,
                                  )?.name,
                              )
                              .filter(Boolean)
                              .join(', ') || t`No team members assigned`}
                          </p>
                          <StyledDeliveryRow>
                            <Link
                              to={clientWorkspaceDestination({
                                ...selection,
                                projectId: item.id,
                                section: 'services',
                              })}
                            >
                              <Trans>Services</Trans>
                            </Link>
                            <Link
                              to={`/delivery?view=planner&plannerView=tasks&project=${item.id}&clientCompany=${company.id}&clientProject=${item.id}`}
                            >
                              <Trans>Project tasks</Trans>
                            </Link>
                            <Link
                              to={`/delivery?view=knowledge&project=${item.id}&clientCompany=${company.id}&clientProject=${item.id}`}
                            >
                              <Trans>Brand knowledge &amp; meetings</Trans>
                            </Link>
                          </StyledDeliveryRow>
                        </StyledClientProject>
                      );
                    })}
                    {!data.projects.length && (
                      <p>
                        <Trans>
                          No projects yet. Add a project to organize services,
                          team responsibilities and brand knowledge.
                        </Trans>
                      </p>
                    )}
                  </StyledDeliveryStack>
                )}

                {selection.section === 'portal' && (
                  <ClientPortalSection
                    companyId={company.id}
                    hubClient={selectedHubClient}
                  />
                )}
              </StyledClientBoundary>
            )}
          </StyledClientMain>
        </StyledClientLayout>
      )}

      <ClientRosterPickerModal
        open={pickerOpen}
        saving={hub.updating}
        saveError={hub.updateError}
        onClose={() => setPickerOpen(false)}
        onSave={async (input) => {
          const ok = await hub.updateRoster(input);
          if (ok) {
            setLastRemoved(null);
            void state.query.refetch();
          }
          return ok;
        }}
      />
    </StyledDeliveryStack>
  );
};
