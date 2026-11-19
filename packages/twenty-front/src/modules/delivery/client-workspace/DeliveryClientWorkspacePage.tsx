import { useLayoutEffect, useState } from 'react';
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
import {
  CLIENT_SECTIONS,
  clientWorkspaceDestination,
  clientWorkspaceSelection,
} from '@/delivery/client-workspace/client-workspace-navigation';
import {
  StyledClientLayout,
  StyledClientDirectory,
  StyledClientMain,
  StyledClientTabs,
  StyledClientProject,
  StyledClientBoundary,
  StyledClientActions,
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
  const project = data?.projects.find(
    (item) => item.id === selection.projectId,
  );
  const sectionLabels = {
    profile: t`Profile`,
    contacts: t`Contacts`,
    services: t`Services`,
    projects: t`Projects & brand knowledge`,
  };
  return (
    <StyledDeliveryStack>
      <StyledClientActions>
        <Link to="/delivery?view=onboarding">
          <Trans>Add a client</Trans>
        </Link>
        <Link to="/delivery?view=clients&clientView=commitments">
          <Trans>Delivery commitments</Trans>
        </Link>
      </StyledClientActions>
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
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const next = new URLSearchParams(params);
                  next.set('clientSearch', search.trim());
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
                  placeholder={t`Search company names`}
                />
                <StyledDeliveryButton type="submit">
                  <Trans>Search</Trans>
                </StyledDeliveryButton>
              </form>
              {state.query.loading && (
                <p role="status">
                  <Trans>Loading clients…</Trans>
                </p>
              )}
              {available && data && (
                <>
                  <ul aria-label={t`Clients`}>
                    {data.companies.map((item) => (
                      <li key={item.id}>
                        <Link
                          onClick={() => setDirectoryExpanded(false)}
                          aria-current={
                            item.id === selection.companyId ? 'page' : undefined
                          }
                          to={clientWorkspaceDestination({
                            companyId: item.id,
                            search: selection.search,
                          })}
                        >
                          {item.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {!data.companies.length && (
                    <p>
                      <Trans>
                        No matching companies. Try another name or add a client.
                      </Trans>
                    </p>
                  )}
                  {data.companiesHasMore && (
                    <p role="status">
                      <Trans>
                        Showing the first 50 matches. Search by name to narrow
                        the list.
                      </Trans>
                    </p>
                  )}
                </>
              )}
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
                      .catch(() => undefined);
                  }}
                  disabled={state.busy || state.query.loading}
                >
                  <Trans>Retry</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryCard>
            )}
            {available && data && !company && (
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
                    <h2>{company.name}</h2>
                    <p>
                      <Trans>Client workspace</Trans>
                    </p>
                  </div>
                  <ClientSetupLink companyId={company.id}>
                    <Trans>Add project or service</Trans>
                  </ClientSetupLink>
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
                {selection.section === 'profile' && (
                  <CompanyProfile
                    key={`${state.authority}:${company.id}`}
                    companyId={company.id}
                    onSaved={() => state.query.refetch()}
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
                        value={selection.projectId ?? ''}
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
                    {data.projects.map((item) => (
                      <StyledClientProject key={item.id}>
                        <h3>{item.name}</h3>
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
                            <Trans>Brand knowledge & meetings</Trans>
                          </Link>
                        </StyledDeliveryRow>
                      </StyledClientProject>
                    ))}
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
              </StyledClientBoundary>
            )}
          </StyledClientMain>
        </StyledClientLayout>
      )}
    </StyledDeliveryStack>
  );
};
