import { useCallback, useLayoutEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryClientSetupCreateInput } from '~/generated-metadata/graphql';
import {
  type ClientSetupContext,
  type ClientSetupReceipt as ClientSetupReceiptData,
} from '@/delivery/onboarding/client-setup.types';
import { type useClientSetup } from '@/delivery/onboarding/useClientSetup';
import { ServicePlanFields } from '@/delivery/onboarding/ServicePlanFields';
import {
  servicePlanValues,
  servicePlanInput,
  useServicePlanRequirements,
  type ServicePlanQuestion,
} from '@/delivery/onboarding/service-plan-values';
import { SetupCompanyCreation } from '@/delivery/onboarding/SetupCompanyCreation';
import {
  SetupFirstTaskFields,
  emptySetupTask,
  setupTaskInput,
  setupTaskReady,
} from '@/delivery/onboarding/SetupFirstTaskFields';
import { ClientSetupReceipt } from '@/delivery/onboarding/ClientSetupReceipt';
import {
  StyledSetupSteps,
  StyledSetupSummary,
} from '@/delivery/onboarding/onboardingStyles';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ClientSetupWizardProps = {
  state: ReturnType<typeof useClientSetup>;
  context: ClientSetupContext;
  companyId: string | null;
  projectId: string | null;
  planId: string | null;
  initialRequestId: string | null;
  companyRequestId: string | null;
  onReload: () => void;
};
export const ClientSetupWizard = ({
  state,
  context,
  companyId,
  projectId,
  planId,
  initialRequestId,
  companyRequestId,
  onReload,
}: ClientSetupWizardProps) => {
  const { t } = useLingui();
  const [params, setParams] = useSearchParams();
  const { requestAction, recordSetupRecoveryId } = useDeliveryDraftGuard();
  const [step, setStep] = useState(
    companyId ? (projectId ? (planId ? 3 : 2) : 1) : 0,
  );
  const [search, setSearch] = useState(params.get('setupSearch') ?? '');
  const [createCompany, setCreateCompany] = useState(Boolean(companyRequestId));
  const [companyRecoveryChecked, setCompanyRecoveryChecked] = useState(false);
  const companyRecoveryRequired = Boolean(
    companyRequestId && !companyRecoveryChecked,
  );
  const newPlanRequested = params.get('setupPlanMode') === 'new';
  const [projectMode, setProjectMode] = useState<'NEW' | 'REUSE' | ''>(
    projectId ? 'REUSE' : params.get('setupProjectMode') === 'new' ? 'NEW' : '',
  );
  const [projectName, setProjectName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [planMode, setPlanMode] = useState<'NEW' | 'REUSE' | ''>(
    planId ? 'REUSE' : newPlanRequested ? 'NEW' : '',
  );
  const [customServiceState, setCustomServiceState] = useState({
    dirty: false,
    busy: false,
  });
  const [plan, setPlan] = useState(() => ({
    ...servicePlanValues(null),
    billing: '',
  }));
  const [questions, setQuestions] = useState<ServicePlanQuestion[]>(() =>
    [
      t`Website link`,
      t`Logo and brand guideline links`,
      t`Brand goals and notes`,
    ].map((label) => ({ id: crypto.randomUUID(), label, required: true })),
  );
  const [firstTask, setFirstTask] = useState(false);
  const [task, setTask] = useState(emptySetupTask);
  const [openedProject, setOpenedProject] = useState(() =>
    context.projects.find((item) => item.id === projectId),
  );
  const [openedCompanyToken, setOpenedCompanyToken] = useState(
    context.selectedCompany?.sourceToken,
  );
  const [openedPlan, setOpenedPlan] = useState(() =>
    context.servicePlans.find((item) => item.id === planId),
  );
  const [attempt, setAttempt] = useState<DeliveryClientSetupCreateInput | null>(
    null,
  );
  const [recoveryOnly, setRecoveryOnly] = useState(Boolean(initialRequestId));
  const [commandId, setCommandId] = useState(params.get('setupRequest'));
  const [receipt, setReceipt] = useState<ClientSetupReceiptData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState('');
  const current = state.data;
  const company = current?.selectedCompany;
  const project = current?.projects.find((item) => item.id === projectId);
  const existingPlan = current?.servicePlans.find((item) => item.id === planId);
  useLayoutEffect(() => {
    if (
      companyId &&
      company?.id === companyId &&
      openedCompanyToken === undefined
    )
      setOpenedCompanyToken(company.sourceToken);
    if (projectId && project?.id === projectId && openedProject === undefined)
      setOpenedProject(project);
    if (planId && existingPlan?.id === planId && openedPlan === undefined)
      setOpenedPlan(existingPlan);
  }, [
    companyId,
    company,
    openedCompanyToken,
    projectId,
    project,
    openedProject,
    planId,
    existingPlan,
    openedPlan,
  ]);
  const reviewPlan =
    planMode === 'REUSE' ? existingPlan : servicePlanInput(plan, questions);
  const team = projectMode === 'REUSE' ? (project?.memberIds ?? []) : memberIds;
  const projectReady = Boolean(
    company &&
    (projectMode === 'REUSE'
      ? project
      : projectMode === 'NEW' &&
        projectName.trim() &&
        memberIds.every((id) =>
          current?.members.some((member) => member.id === id),
        )),
  );
  const planRequirements = useServicePlanRequirements(
    plan,
    questions,
    context.members,
    team,
  );
  const planReady =
    !customServiceState.dirty &&
    !customServiceState.busy &&
    (planMode === 'REUSE'
      ? Boolean(existingPlan)
      : planMode === 'NEW' && planRequirements.length === 0);
  const workReady = !firstTask || setupTaskReady(task, context.members, team);
  const stale = Boolean(
    (companyId && openedCompanyToken !== company?.sourceToken) ||
    (projectId && openedProject?.revision !== project?.revision) ||
    (planId && openedPlan?.revision !== existingPlan?.revision),
  );
  const editable = Boolean(
    current &&
    !receipt &&
    !attempt &&
    !recoveryOnly &&
    !state.busy &&
    !companyRecoveryRequired,
  );
  const dirty =
    !receipt &&
    (attempt !== null ||
      customServiceState.dirty ||
      customServiceState.busy ||
      projectName !== '' ||
      memberIds.length > 0 ||
      plan.name !== '' ||
      plan.services !== '' ||
      plan.scope !== '' ||
      plan.billing !== '' ||
      plan.allowance !== '' ||
      plan.contact !== '' ||
      plan.advertising ||
      firstTask ||
      task.title !== '' ||
      JSON.stringify(
        questions.map(({ label, required }) => ({ label, required })),
      ) !==
        JSON.stringify(
          [
            t`Website link`,
            t`Logo and brand guideline links`,
            t`Brand goals and notes`,
          ].map((label) => ({ label, required: true })),
        ));
  useDeliveryDraftStatus({ dirty, saving: state.busy });
  const labels = [
    t`Client company`,
    t`Project and team`,
    t`Service plan`,
    t`First task`,
    t`Review and save`,
  ];
  const focusStep = useCallback((element: HTMLElement | null) => {
    element?.focus();
    element?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const source = (values: Record<string, string | null>) => {
    if (companyRecoveryRequired) return;
    if ('setupCompany' in values) {
      setOpenedCompanyToken(undefined);
      setOpenedProject(undefined);
      setOpenedPlan(undefined);
    }
    if ('setupProject' in values) {
      setOpenedProject(undefined);
      setOpenedPlan(undefined);
    }
    if ('setupPlan' in values) setOpenedPlan(undefined);
    requestAction(() =>
      setParams(
        taskPageDestination(params, {
          setupRequest: null,
          ...('setupCompany' in values
            ? { setupProjectMode: null, setupPlanMode: null }
            : {}),
          ...values,
        }).split('?')[1],
      ),
    );
  };
  const save = async (prepared: DeliveryClientSetupCreateInput) => {
    setMessage('');
    setNotFound(false);
    const result = await state.create(prepared);
    if (result) setReceipt(result);
    else
      setMessage(
        t`The setup response was not confirmed. Keep this exact request and check it before retrying; do not create another setup blindly.`,
      );
  };
  const check = async () => {
    const id = attempt?.requestId ?? initialRequestId;
    if (!id) return;
    setMessage('');
    const result = await state.check(id);
    if (result.kind === 'FOUND') {
      setReceipt(result.receipt);
      setNotFound(false);
    } else if (result.kind === 'NOT_FOUND') {
      setNotFound(true);
      setMessage(
        t`No saved setup was found for this exact request in the fresh authorized check.`,
      );
    } else
      setMessage(
        t`The saved request could not be verified. Your earlier request identity is kept; check again when access is available.`,
      );
  };
  if (receipt) return <ClientSetupReceipt receipt={receipt} />;
  if (recoveryOnly || attempt)
    return (
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <h2>
            <Trans>Recover this setup request</Trans>
          </h2>
          <p>
            <Trans>
              No setup is submitted automatically from this link. Check the
              original request before preparing another one.
            </Trans>
          </p>
          <small>{attempt?.requestId ?? initialRequestId}</small>
          {message && <p role="status">{message}</p>}
          <StyledDeliveryRow>
            <StyledDeliveryButton
              disabled={state.busy || !state.permission.manager}
              onClick={() => void check()}
            >
              <Trans>Check setup request</Trans>
            </StyledDeliveryButton>
            {notFound && attempt && (
              <StyledDeliveryButton
                disabled={state.busy || !current || stale}
                onClick={() => void save(attempt)}
              >
                <Trans>Retry this exact reviewed setup</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
          {notFound && attempt && (
            <StyledDeliveryButton
              type="button"
              disabled={state.busy}
              onClick={() => {
                setAttempt(null);
                setNotFound(false);
                setMessage('');
              }}
            >
              <Trans>Return to the retained draft after this check</Trans>
            </StyledDeliveryButton>
          )}
          {notFound && !attempt && (
            <>
              <p>
                <Trans>
                  The link contains only the request ID, not the original
                  private draft. A deliberate new review keeps this same ID, so
                  a late earlier commit cannot create another setup.
                </Trans>
              </p>
              <StyledDeliveryButton
                type="button"
                disabled={state.busy || !current}
                onClick={() => {
                  setRecoveryOnly(false);
                  setNotFound(false);
                  setMessage('');
                }}
              >
                <Trans>Prepare a new review with this same request ID</Trans>
              </StyledDeliveryButton>
            </>
          )}
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    );
  return (
    <StyledDeliveryStack>
      <StyledSetupSteps aria-label={t`Client setup progress`}>
        {labels.map((label, index) => (
          <li key={label} aria-current={step === index ? 'step' : undefined}>
            {label}
          </li>
        ))}
      </StyledSetupSteps>
      <form
        aria-label={t`Prepare client work setup`}
        onSubmit={(event) => event.preventDefault()}
      >
        <StyledDeliveryStack>
          {current &&
            ((companyId && !company) ||
              (projectId && !project) ||
              (planId && !existingPlan)) && (
              <div role="alert">
                <p>
                  <Trans>
                    A linked company, project or service plan is unavailable in
                    the current permitted sources. Review the source selection
                    before continuing.
                  </Trans>
                </p>
                <StyledDeliveryButton
                  type="button"
                  onClick={() =>
                    setStep(!company ? 0 : projectId && !project ? 1 : 2)
                  }
                >
                  <Trans>Review unavailable setup selection</Trans>
                </StyledDeliveryButton>
              </div>
            )}
          {stale && (
            <div role="alert">
              <p>
                <Trans>
                  A selected project or service plan changed. Your prepared
                  values are retained; reload the selected sources before
                  saving.
                </Trans>
              </p>
              <StyledDeliveryButton
                type="button"
                onClick={() => requestAction(onReload)}
              >
                <Trans>Reload selected setup sources</Trans>
              </StyledDeliveryButton>
            </div>
          )}
          <section
            key={step}
            tabIndex={-1}
            ref={focusStep}
            aria-label={labels[step]}
          >
            <StyledDeliveryStack>
              <h2>{labels[step]}</h2>
              {step === 0 && (
                <>
                  <StyledDeliveryRow>
                    <label>
                      <Trans>Find a company</Trans>
                      <input
                        aria-label={t`Find a company`}
                        maxLength={160}
                        disabled={companyRecoveryRequired}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                    <StyledDeliveryButton
                      type="button"
                      disabled={companyRecoveryRequired}
                      onClick={() =>
                        source({ setupSearch: search.trim() || null })
                      }
                    >
                      <Trans>Search companies</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                  <label>
                    <Trans>Client company</Trans>
                    <select
                      aria-label={t`Client company`}
                      value={companyId ?? ''}
                      disabled={companyRecoveryRequired}
                      onChange={(event) =>
                        source({
                          setupCompany: event.target.value || null,
                          setupProject: null,
                          setupPlan: null,
                          setupCompanyRequest: null,
                          setupRequest: null,
                        })
                      }
                    >
                      <option value="">{t`Choose an existing company`}</option>
                      {companyId &&
                        !context.companies.some(
                          (item) => item.id === companyId,
                        ) && (
                          <option value={companyId}>
                            {company?.name ?? t`Selected company unavailable`}
                          </option>
                        )}
                      {context.companies.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {context.companiesHasMore && (
                    <p>
                      <Trans>
                        Showing the first 50 matching companies. Refine the
                        company search to find another client.
                      </Trans>
                    </p>
                  )}
                  {companyId && !company && (
                    <p role="alert">
                      <Trans>
                        The selected company is unavailable under current
                        Company CRM permissions. Choose another company or ask
                        an administrator.
                      </Trans>
                    </p>
                  )}
                  {!createCompany && (
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => setCreateCompany(true)}
                    >
                      <Trans>Create a new client company</Trans>
                    </StyledDeliveryButton>
                  )}
                  {createCompany && (
                    <SetupCompanyCreation
                      state={state}
                      recoveryId={companyRequestId}
                      onRecoveryChecked={() => setCompanyRecoveryChecked(true)}
                      onSelected={(id) =>
                        source({
                          setupCompany: id,
                          setupProject: null,
                          setupPlan: null,
                          setupCompanyRequest: null,
                          setupRequest: null,
                        })
                      }
                    />
                  )}
                </>
              )}
              {step === 1 && (
                <>
                  <p>
                    {t`Saved company`}: {company?.name ?? t`Unavailable`}
                  </p>
                  <label>
                    <Trans>Project choice</Trans>
                    <select
                      aria-label={t`Project choice`}
                      value={projectMode}
                      onChange={(event) => {
                        if (event.target.value === 'REUSE')
                          setProjectMode('REUSE');
                        else if (event.target.value === 'NEW') {
                          if (projectId)
                            source({
                              setupProject: null,
                              setupPlan: null,
                              setupProjectMode: 'new',
                              setupPlanMode: null,
                            });
                          else setProjectMode('NEW');
                        }
                      }}
                    >
                      <option value="">{t`Choose how to set up the project`}</option>
                      <option value="REUSE">{t`Reuse an existing client project`}</option>
                      <option value="NEW">{t`Prepare a new project`}</option>
                    </select>
                  </label>
                  {projectMode === 'REUSE' && (
                    <label>
                      <Trans>Existing client project</Trans>
                      <select
                        aria-label={t`Existing client project`}
                        value={projectId ?? ''}
                        onChange={(event) =>
                          source({
                            setupProject: event.target.value || null,
                            setupPlan: null,
                          })
                        }
                      >
                        <option value="">{t`Choose a saved project`}</option>
                        {projectId && !project && (
                          <option
                            value={projectId}
                          >{t`Selected project unavailable`}</option>
                        )}
                        {context.projects.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {projectMode === 'NEW' && (
                    <>
                      <label>
                        <Trans>New project name</Trans>
                        <input
                          aria-label={t`New project name`}
                          maxLength={200}
                          value={projectName}
                          onChange={(event) =>
                            setProjectName(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <Trans>Project teammates</Trans>
                        <select
                          aria-label={t`Project teammates`}
                          multiple
                          value={memberIds}
                          onChange={(event) =>
                            setMemberIds(
                              Array.from(
                                event.target.selectedOptions,
                                (option) => option.value,
                              ),
                            )
                          }
                        >
                          {memberIds
                            .filter(
                              (id) =>
                                !context.members.some(
                                  (member) => member.id === id,
                                ),
                            )
                            .map((id) => (
                              <option
                                key={id}
                                value={id}
                              >{t`Selected teammate unavailable`}</option>
                            ))}
                          {context.members.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p>
                        <Trans>
                          Choose the people who should have project access. No
                          teammate is added or invited automatically.
                        </Trans>
                      </p>
                    </>
                  )}
                  {projectMode === 'REUSE' && project && (
                    <p>
                      <Trans>
                        This saved project and its membership will be reused
                        unchanged.
                      </Trans>{' '}
                      {project.memberIds
                        .map(
                          (id) =>
                            context.members.find((member) => member.id === id)
                              ?.name ?? t`Member unavailable`,
                        )
                        .join(', ') || t`No project teammates configured`}
                    </p>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  {!newPlanRequested && (
                    <label>
                      <Trans>Service plan choice</Trans>
                      <select
                        aria-label={t`Service plan choice`}
                        disabled={
                          customServiceState.dirty || customServiceState.busy
                        }
                        value={planMode}
                        onChange={(event) => {
                          if (event.target.value === 'REUSE')
                            setPlanMode('REUSE');
                          else if (event.target.value === 'NEW') {
                            if (planId)
                              source({ setupPlan: null, setupPlanMode: 'new' });
                            else setPlanMode('NEW');
                          }
                        }}
                      >
                        <option value="">{t`Choose how to set up the service plan`}</option>
                        {projectId && (
                          <option value="REUSE">{t`Reuse a saved service plan unchanged`}</option>
                        )}
                        <option value="NEW">{t`Prepare a new service plan`}</option>
                      </select>
                    </label>
                  )}
                  {planMode === 'REUSE' && (
                    <>
                      <label>
                        <Trans>Existing service plan</Trans>
                        <select
                          aria-label={t`Existing service plan`}
                          value={planId ?? ''}
                          onChange={(event) =>
                            source({ setupPlan: event.target.value || null })
                          }
                        >
                          <option value="">{t`Choose a saved service plan`}</option>
                          {planId && !existingPlan && (
                            <option
                              value={planId}
                            >{t`Selected service plan unavailable`}</option>
                          )}
                          {context.servicePlans.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {existingPlan && (
                        <p>
                          {existingPlan.name} ·{' '}
                          {existingPlan.services.join(', ')} ·{' '}
                          {existingPlan.scope}
                        </p>
                      )}
                    </>
                  )}
                  {planMode === 'NEW' && (
                    <>
                      <label>
                        <Trans>Service plan name</Trans>
                        <input
                          aria-label={t`Service plan name`}
                          value={plan.name}
                          maxLength={6000}
                          onChange={(event) =>
                            setPlan({ ...plan, name: event.target.value })
                          }
                        />
                      </label>
                      <ServicePlanFields
                        values={plan}
                        setValues={setPlan}
                        fields={questions}
                        setFields={setQuestions}
                        members={context.members}
                        projectMemberIds={team}
                        onCustomServiceStateChange={setCustomServiceState}
                      />
                      {planRequirements.length > 0 && (
                        <ul>
                          {planRequirements.map((requirement) => (
                            <li key={requirement}>{requirement}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </>
              )}
              {step === 3 && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={firstTask}
                      onChange={(event) => setFirstTask(event.target.checked)}
                    />
                    <Trans>Include the first task in this setup</Trans>
                  </label>
                  <p>
                    <Trans>
                      The project and service plan can be saved without a task.
                      A task needs an actual project assignee and a delivery
                      manager to review it. For the first task, both roles may
                      belong to the same manager.
                    </Trans>
                  </p>
                  {firstTask && (
                    <SetupFirstTaskFields
                      values={task}
                      onChange={setTask}
                      members={context.members}
                      memberIds={team}
                    />
                  )}
                  {firstTask && !workReady && (
                    <p role="status">
                      <Trans>
                        Choose an eligible project assignee and delivery
                        reviewer, and enter a title. You can also leave the task
                        out and configure the team first.
                      </Trans>{' '}
                      <Link to={taskPageDestination(params, { view: 'team' })}>
                        <Trans>Open Team & projects</Trans>
                      </Link>
                    </p>
                  )}
                </>
              )}
              {step === 4 && (
                <>
                  <p>
                    <Trans>
                      Review your prepared choices before saving them together.
                      Reused projects and service plans stay unchanged. No
                      invoice, portal message or delivery confirmation will be
                      created.
                    </Trans>
                  </p>
                  <StyledSetupSummary>
                    <dt>
                      <Trans>Saved client company</Trans>
                    </dt>
                    <dd>{company?.name}</dd>
                    <dt>
                      <Trans>Project</Trans>
                    </dt>
                    <dd>
                      {projectMode === 'REUSE'
                        ? t`Reuse unchanged: ${project?.name}`
                        : t`New project: ${projectName}`}
                    </dd>
                    <dt>
                      <Trans>Project team</Trans>
                    </dt>
                    <dd>
                      {team
                        .map(
                          (id) =>
                            context.members.find((member) => member.id === id)
                              ?.name ?? t`Member unavailable`,
                        )
                        .join(', ') || t`No project teammates selected`}
                    </dd>
                    <dt>
                      <Trans>Service plan</Trans>
                    </dt>
                    <dd>
                      {planMode === 'REUSE'
                        ? t`Reuse unchanged: ${existingPlan?.name}`
                        : plan.name}
                    </dd>
                    <dt>
                      <Trans>Services and scope</Trans>
                    </dt>
                    <dd>
                      {planMode === 'REUSE'
                        ? `${existingPlan?.services.join(', ')}\n${existingPlan?.scope}`
                        : `${plan.services}\n${plan.scope}`}
                    </dd>
                    <dt>
                      <Trans>Billing arrangement</Trans>
                    </dt>
                    <dd>
                      {reviewPlan?.billing === 'RETAINER'
                        ? t`Retainer`
                        : reviewPlan?.billing === 'ONE_TIME'
                          ? t`One-time`
                          : t`Unavailable`}
                    </dd>
                    <dt>
                      <Trans>Onboarding questions</Trans>
                    </dt>
                    <dd>
                      {reviewPlan?.fields
                        .map(
                          (field) =>
                            `${field.label}${field.required ? ` (${t`required`})` : ''}`,
                        )
                        .join('\n') || t`No onboarding questions`}
                    </dd>
                    <dt>
                      <Trans>Advertising responsibilities</Trans>
                    </dt>
                    <dd>
                      {reviewPlan?.advertising
                        ? `${context.members.find((member) => member.id === reviewPlan.advertising?.managerId)?.name ?? t`Manager unavailable`} · ${context.members.find((member) => member.id === reviewPlan.advertising?.marketerId)?.name ?? t`Marketer unavailable`} · ${reviewPlan.advertising.currency} · ${reviewPlan.advertising.channel} · ${reviewPlan.advertising.period}`
                        : t`Not configured`}
                    </dd>
                    <dt>
                      <Trans>Deliverable allowance and client contact</Trans>
                    </dt>
                    <dd>
                      {planMode === 'REUSE'
                        ? `${existingPlan?.allowance || t`Not specified`}\n${existingPlan?.contact || t`Not specified`}`
                        : `${plan.allowance || t`Not specified`}\n${plan.contact || t`Not specified`}`}
                    </dd>
                    <dt>
                      <Trans>First task</Trans>
                    </dt>
                    <dd>
                      {firstTask
                        ? `${task.title} · ${context.members.find((member) => member.id === task.assigneeId)?.name ?? t`Assignee unavailable`} · ${t`Review assigned to`} ${context.members.find((member) => member.id === task.reviewerId)?.name ?? t`Reviewer unavailable`}`
                        : t`No task requested`}
                    </dd>
                  </StyledSetupSummary>
                  {firstTask && (
                    <details>
                      <summary>
                        <Trans>
                          Review first task instructions, dates and supporting
                          details
                        </Trans>
                      </summary>
                      <StyledSetupSummary>
                        <dt>
                          <Trans>Instructions</Trans>
                        </dt>
                        <dd>{task.brief || t`Not specified`}</dd>
                        <dt>
                          <Trans>Task service and priority</Trans>
                        </dt>
                        <dd>
                          {task.service || t`Not specified`} · {task.priority}
                        </dd>
                        <dt>
                          <Trans>Scheduled date and due date</Trans>
                        </dt>
                        <dd>
                          {task.scheduledDate || t`Not specified`} ·{' '}
                          {task.dueDate || t`Not specified`}
                        </dd>
                        <dt>
                          <Trans>Checklist</Trans>
                        </dt>
                        <dd>{task.checklist || t`No checklist items`}</dd>
                        <dt>
                          <Trans>References</Trans>
                        </dt>
                        <dd>{task.evidence || t`No reference links`}</dd>
                      </StyledSetupSummary>
                    </details>
                  )}
                  {message && <p role="alert">{message}</p>}
                  <StyledDeliveryButton
                    type="button"
                    data-primary="true"
                    disabled={
                      !editable ||
                      stale ||
                      !projectReady ||
                      !planReady ||
                      !workReady
                    }
                    onClick={() => {
                      if (
                        !company ||
                        !projectReady ||
                        !planReady ||
                        !workReady ||
                        stale
                      )
                        return;
                      const prepared: DeliveryClientSetupCreateInput = {
                        requestId: commandId ?? crypto.randomUUID(),
                        companyId: company.id,
                        companySourceToken: company.sourceToken,
                        projectId: projectMode === 'REUSE' ? projectId : null,
                        projectRevision:
                          projectMode === 'REUSE'
                            ? (project?.revision ?? null)
                            : null,
                        projectName:
                          projectMode === 'NEW' ? projectName.trim() : null,
                        memberIds: projectMode === 'NEW' ? [...memberIds] : [],
                        engagementId: planMode === 'REUSE' ? planId : null,
                        engagementRevision:
                          planMode === 'REUSE'
                            ? (existingPlan?.revision ?? null)
                            : null,
                        plan:
                          planMode === 'NEW'
                            ? servicePlanInput(plan, questions)
                            : null,
                        firstTask: firstTask ? setupTaskInput(task) : null,
                      };
                      if (!recordSetupRecoveryId('setup', prepared.requestId)) {
                        setMessage(
                          t`The recovery link could not be recorded. No setup was submitted; your inputs are kept.`,
                        );
                        return;
                      }
                      setAttempt(prepared);
                      setCommandId(prepared.requestId);
                      void save(prepared);
                    }}
                  >
                    <Trans>Save reviewed client setup</Trans>
                  </StyledDeliveryButton>
                </>
              )}
            </StyledDeliveryStack>
          </section>
          <StyledDeliveryRow>
            {step > 0 && (
              <StyledDeliveryButton
                type="button"
                disabled={
                  !editable ||
                  (step === 2 &&
                    (customServiceState.dirty || customServiceState.busy))
                }
                onClick={() => setStep((value) => value - 1)}
              >
                <Trans>Back</Trans>
              </StyledDeliveryButton>
            )}
            {step < 4 && (
              <StyledDeliveryButton
                type="button"
                data-primary="true"
                disabled={
                  !editable ||
                  stale ||
                  (step === 0
                    ? !company
                    : step === 1
                      ? !projectReady
                      : step === 2
                        ? !planReady
                        : !workReady)
                }
                onClick={() => setStep((value) => value + 1)}
              >
                <Trans>Continue</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      </form>
    </StyledDeliveryStack>
  );
};
