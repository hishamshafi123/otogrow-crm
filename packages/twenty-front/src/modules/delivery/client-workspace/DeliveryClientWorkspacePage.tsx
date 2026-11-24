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
  clientInitials,
  formatFeeCadenceShort,
  formatMoneyMinor,
} from '@/delivery/client-workspace/client-hub-format';
import {
  PRIMARY_CLIENT_SECTIONS,
  clientWorkspaceDestination,
  clientWorkspaceSelection,
  normalizePrimaryClientSection,
} from '@/delivery/client-workspace/client-workspace-navigation';
import {
  StyledClientActions,
  StyledClientAvatar,
  StyledClientBackRow,
  StyledClientBoundary,
  StyledClientCommandBar,
  StyledClientCommandMeta,
  StyledClientHero,
  StyledClientHeroIdentity,
  StyledClientHeroMeta,
  StyledClientMain,
  StyledClientProject,
  StyledClientSubtleButton,
  StyledClientTabs,
  StyledClientTag,
  StyledCountPill,
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastRemoved, setLastRemoved] = useState<
    Pick<ClientHubItem, 'id' | 'name'>[]
  >([]);

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
  const activeTab = normalizePrimaryClientSection(selection.section);

  const tabLabels = {
    overview: t`Overview & billing`,
    projects: t`Projects`,
    services: t`Services & portal`,
    profile: t`Profile & contacts`,
  };

  const hubData = state.denied ? null : hub.data;
  const selectedHubClient = useMemo(
    () =>
      company && hubData
        ? (hubData.clients.find((item) => item.id === company.id) ?? null)
        : null,
    [company, hubData],
  );

  const handleRemoveClients = async (
    clients: Pick<ClientHubItem, 'id' | 'name'>[],
  ): Promise<boolean> => {
    if (!clients.length) return false;
    const ids = clients.map((item) => item.id);
    const ok = await hub.updateRoster({
      action: 'remove',
      companyIds: ids,
    });
    if (ok) {
      setLastRemoved(clients);
      if (selection.companyId && ids.includes(selection.companyId)) {
        setParams(new URLSearchParams({ view: 'clients' }));
      }
    }
    return ok;
  };

  const handleUndoRemove = async () => {
    if (!lastRemoved.length) return;
    const ok = await hub.updateRoster({
      action: 'add',
      companyIds: lastRemoved.map((item) => item.id),
    });
    if (ok) setLastRemoved([]);
  };

  const handleMarkSelectedAsClient = async () => {
    if (!company) return;
    const ok = await hub.updateRoster({
      action: 'add',
      companyIds: [company.id],
    });
    if (ok) setLastRemoved([]);
  };

  const activeClientCount = hubData?.summary.totalClients ?? null;
  const isInnerClientView = Boolean(selection.companyId);

  const selectedFeeBadge = selectedHubClient?.finance?.fee
    ? `${formatMoneyMinor(
        selectedHubClient.finance.fee.amount,
        selectedHubClient.finance.fee.currency,
      )}${formatFeeCadenceShort(selectedHubClient.finance.fee.cadence)}`
    : null;

  return (
    <StyledDeliveryStack>
      {!isInnerClientView && (
        <StyledClientCommandBar>
          <StyledClientCommandMeta>
            <h2>
              <span>
                <Trans>Clients</Trans>
              </span>
              {activeClientCount !== null && (
                <StyledCountPill>
                  {activeClientCount === 1
                    ? t`1 active`
                    : t`${activeClientCount} active`}
                </StyledCountPill>
              )}
            </h2>
            <p>
              <Trans>
                Only businesses you add appear here — Gmail-synced and CRM
                companies stay out automatically.
              </Trans>
            </p>
          </StyledClientCommandMeta>
          <StyledClientActions>
            <Link data-primary="true" to="/delivery?view=onboarding">
              <Trans>+ Add new client</Trans>
            </Link>
            <StyledDeliveryButton
              type="button"
              onClick={() => {
                hub.clearUpdateError();
                setPickerOpen(true);
              }}
            >
              <Trans>Add from CRM</Trans>
            </StyledDeliveryButton>
            <Link to="/delivery?view=clients&clientView=commitments">
              <Trans>Commitments</Trans>
            </Link>
            <Link to="/delivery?view=clients&clientView=agreements">
              <Trans>Portals</Trans>
            </Link>
          </StyledClientActions>
        </StyledClientCommandBar>
      )}

      {lastRemoved.length > 0 && (
        <StyledUndoBanner role="status">
          <p>
            {lastRemoved.length === 1
              ? t`Removed ${lastRemoved[0].name} from your Clients list. Its CRM company record was not deleted.`
              : t`Removed ${lastRemoved.length} non-clients from your Clients list. Their CRM company records were not deleted.`}
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
              onClick={() => setLastRemoved([])}
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

          {/* Full-width Clients portfolio view */}
          {!isInnerClientView && !state.denied && (
            <>
              {hub.loading && !hubData && (
                <StyledDeliveryCard>
                  <p role="status">
                    <Trans>Loading clients…</Trans>
                  </p>
                </StyledDeliveryCard>
              )}
              {hubData && (
                <ClientOverviewGrid
                  hub={hubData}
                  updatingRoster={hub.updating}
                  onOpenPicker={() => {
                    hub.clearUpdateError();
                    setPickerOpen(true);
                  }}
                  onRemoveClients={handleRemoveClients}
                />
              )}
            </>
          )}

          {/* Selected client not found / unavailable */}
          {isInnerClientView && available && data && !company && (
            <StyledDeliveryStack>
              <StyledClientBackRow>
                <Link to="/delivery?view=clients">
                  <Trans>← All clients</Trans>
                </Link>
              </StyledClientBackRow>
              <StyledDeliveryCard>
                <StyledDeliveryStack>
                  <h2>
                    <Trans>Client unavailable</Trans>
                  </h2>
                  <p>
                    <Trans>
                      This company could not be found with your current access.
                      Return to all clients to select another.
                    </Trans>
                  </p>
                </StyledDeliveryStack>
              </StyledDeliveryCard>
            </StyledDeliveryStack>
          )}

          {/* Full-width Inner Client Workspace */}
          {company && (
            <StyledClientBoundary
              hidden={!available}
              disabled={!available}
              inert={!available || undefined}
            >
              <StyledClientBackRow>
                <Link to="/delivery?view=clients">
                  <Trans>← All clients</Trans>
                </Link>
                <StyledDeliveryRow>
                  <Link to="/delivery?view=clients&clientView=commitments">
                    <Trans>Commitments</Trans>
                  </Link>
                  <Link to="/delivery?view=clients&clientView=agreements">
                    <Trans>Portals</Trans>
                  </Link>
                </StyledDeliveryRow>
              </StyledClientBackRow>

              <StyledClientHero>
                <StyledClientHeroIdentity>
                  <StyledClientAvatar
                    data-size="lg"
                    data-tone={
                      selectedHubClient?.tasksSummary.overdueCount
                        ? 'danger'
                        : selectedHubClient?.needsAttention
                          ? 'warning'
                          : undefined
                    }
                  >
                    {clientInitials(company.name)}
                  </StyledClientAvatar>
                  <StyledClientHeroMeta>
                    <StyledDeliveryRow>
                      <h2>{company.name}</h2>
                      {selectedHubClient?.tasksSummary.overdueCount ? (
                        <StyledClientTag data-tone="danger">
                          {t`${selectedHubClient.tasksSummary.overdueCount} overdue`}
                        </StyledClientTag>
                      ) : selectedHubClient ? (
                        <StyledClientTag data-tone="success">
                          <Trans>Active client</Trans>
                        </StyledClientTag>
                      ) : null}
                      {selectedFeeBadge && (
                        <StyledClientTag data-tone="iris">
                          {selectedFeeBadge}
                        </StyledClientTag>
                      )}
                    </StyledDeliveryRow>
                    <p>
                      {selectedHubClient?.domainName
                        ? `${selectedHubClient.domainName} · ${
                            selectedHubClient.projects.length === 1
                              ? t`1 project`
                              : t`${selectedHubClient.projects.length} projects`
                          }`
                        : t`Client workspace`}
                    </p>
                  </StyledClientHeroMeta>
                </StyledClientHeroIdentity>

                <StyledClientActions>
                  {hubData && !selectedHubClient && (
                    <StyledDeliveryButton
                      type="button"
                      data-primary="true"
                      disabled={hub.updating}
                      onClick={() => void handleMarkSelectedAsClient()}
                    >
                      <Trans>Add to clients</Trans>
                    </StyledDeliveryButton>
                  )}
                  <ClientSetupLink companyId={company.id}>
                    <Trans>+ Add project or service</Trans>
                  </ClientSetupLink>
                  {selectedHubClient && (
                    <StyledClientSubtleButton
                      type="button"
                      disabled={hub.updating}
                      onClick={() =>
                        void handleRemoveClients([
                          { id: company.id, name: company.name },
                        ])
                      }
                    >
                      <Trans>Not a client</Trans>
                    </StyledClientSubtleButton>
                  )}
                </StyledClientActions>
              </StyledClientHero>

              <StyledClientTabs aria-label={t`Client sections`}>
                {PRIMARY_CLIENT_SECTIONS.map((section) => (
                  <Link
                    key={section}
                    aria-current={activeTab === section ? 'page' : undefined}
                    to={clientWorkspaceDestination({ ...selection, section })}
                  >
                    {tabLabels[section]}
                  </Link>
                ))}
              </StyledClientTabs>

              {activeTab === 'overview' && (
                <ClientSelectedOverview
                  companyId={company.id}
                  companyName={company.name}
                  hubClient={selectedHubClient}
                  updatingRoster={hub.updating}
                  onUpdateRoster={hub.updateRoster}
                  onRefreshHub={hub.refetch}
                />
              )}

              {activeTab === 'projects' && (
                <StyledDeliveryStack>
                  <p>
                    <Trans>
                      Keep each project’s team, delivery work, and brand
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
                                data.members.find((member) => member.id === id)
                                  ?.name,
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
                    <StyledDeliveryCard>
                      <StyledDeliveryStack>
                        <p>
                          <Trans>
                            No projects yet. Add a project to organize services,
                            team responsibilities, and brand knowledge.
                          </Trans>
                        </p>
                        <ClientSetupLink companyId={company.id}>
                          <Trans>Set up this client’s first project</Trans>
                        </ClientSetupLink>
                      </StyledDeliveryStack>
                    </StyledDeliveryCard>
                  )}
                </StyledDeliveryStack>
              )}

              {activeTab === 'services' && (
                <StyledDeliveryStack>
                  <StyledDeliveryCard>
                    <StyledDeliveryStack>
                      <label>
                        <Trans>Client project</Trans>
                        <select
                          value={serviceProjectId ?? ''}
                          onChange={(event) => {
                            const destination = clientWorkspaceDestination({
                              ...selection,
                              projectId: event.target.value || null,
                              section: 'services',
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
                    </StyledDeliveryStack>
                  </StyledDeliveryCard>

                  <ClientPortalSection
                    companyId={company.id}
                    hubClient={selectedHubClient}
                  />
                </StyledDeliveryStack>
              )}

              {activeTab === 'profile' && (
                <StyledDeliveryStack>
                  <CompanyProfile
                    key={`${state.authority}:${company.id}`}
                    companyId={company.id}
                    onSaved={() => {
                      void state.query.refetch();
                      void hub.refetch();
                    }}
                  />
                  <ClientContacts
                    key={`contacts:${state.authority}:${company.id}`}
                    companyId={company.id}
                  />
                </StyledDeliveryStack>
              )}
            </StyledClientBoundary>
          )}
        </StyledClientMain>
      )}

      <ClientRosterPickerModal
        open={pickerOpen}
        saving={hub.updating}
        saveError={hub.updateError}
        onClose={() => setPickerOpen(false)}
        onSave={async (input) => {
          const ok = await hub.updateRoster(input);
          if (ok) {
            setLastRemoved([]);
            void state.query.refetch();
          }
          return ok;
        }}
      />
    </StyledDeliveryStack>
  );
};
