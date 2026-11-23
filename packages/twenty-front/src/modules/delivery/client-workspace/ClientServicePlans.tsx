import { useState, type FormEvent } from 'react';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Link } from 'react-router-dom';
import { type ClientsSnapshot } from '@/delivery/delivery-clients.types';
import { type useClientSetup } from '@/delivery/onboarding/useClientSetup';
import { type ClientSetupContext } from '@/delivery/onboarding/client-setup.types';
import { ServicePlanFields } from '@/delivery/onboarding/ServicePlanFields';
import { ClientSetupLink } from '@/delivery/onboarding/ClientSetupLink';
import {
  servicePlanValues,
  servicePlanInput,
  useServicePlanRequirements,
} from '@/delivery/onboarding/service-plan-values';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const CHANGE_CLIENT_SERVICE = gql`
  mutation ChangeClientServicePlan($input: JSON!) {
    changeDeliveryClients(input: $input)
  }
`;
const StyledClientServicePlan = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 16px;
  box-shadow:
    0 1px 2px ${themeCssVariables.color.transparent.gray2},
    0 8px 24px -18px ${themeCssVariables.color.transparent.gray5},
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 22px;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
  &:hover {
    border-color: ${themeCssVariables.color.iris6};
    box-shadow:
      0 8px 24px -14px ${themeCssVariables.color.transparent.iris5},
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
    transform: translateY(-1px);
  }
  p {
    max-width: 72ch;
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover {
      transform: none;
    }
  }
`;
const StyledClientServiceScope = styled.p`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 10px;
  line-height: 1.55;
  overflow-wrap: anywhere;
  padding: 12px 14px;
  white-space: pre-wrap;
`;
const StyledClientServiceBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
`;
type ClientServicePlan = ClientSetupContext['servicePlans'][number];
type ClientServicePlansProps = {
  state: ReturnType<typeof useClientSetup>;
  projectId: string;
  retainedData?: ClientSetupContext | null;
};
export const ClientServicePlans = ({
  state,
  projectId,
  retainedData,
}: ClientServicePlansProps) => {
  const data = state.data ?? retainedData;
  if (!data || state.denied || !state.permission.manager) return null;
  return (
    <ClientServicePlanList
      key={`${state.authority}:${data.selectedCompany?.id}:${projectId}`}
      state={state}
      projectId={projectId}
      retainedData={data}
    />
  );
};
type ClientServicePlanListProps = ClientServicePlansProps;
const ClientServicePlanList = ({
  state,
  projectId,
  retainedData,
}: ClientServicePlanListProps) => {
  const [editing, setEditing] = useState<ClientServicePlan | null>(null);
  const { requestAction } = useDeliveryDraftGuard();
  const data = state.data ?? retainedData;
  if (!data) return null;
  const plans = data.servicePlans.filter(
    (plan) => !projectId || plan.projectId === projectId,
  );
  if (editing && !plans.some((plan) => plan.id === editing.id))
    setEditing(null);
  return (
    <StyledClientServiceBoundary hidden={!state.data} disabled={!state.data}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <div>
            <h2>
              <Trans>Service plans</Trans>
            </h2>
            <p>
              <Trans>
                Each plan defines the services, billing, scope and onboarding
                agreed for this project.
              </Trans>
            </p>
          </div>
          <ClientSetupLink
            companyId={data.selectedCompany?.id}
            projectId={projectId}
            newServicePlan
          >
            <Trans>Add service plan</Trans>
          </ClientSetupLink>
        </StyledDeliveryRow>
        {plans.length === 0 && (
          <p>
            <Trans>
              No service plans yet. Add one to define the work included, its
              billing arrangement and the scope the client will see.
            </Trans>
          </p>
        )}
        {plans.map((plan) => {
          const project = data.projects.find(
            (item) => item.id === plan.projectId,
          );
          const destination = new URLSearchParams({
            view: 'clients',
            clientEngagement: plan.id,
            clientCompany: data.selectedCompany?.id ?? '',
            clientProject: plan.projectId,
          });
          return (
            <StyledClientServicePlan key={plan.id}>
              {editing?.id === plan.id ? (
                <ClientServiceEditor
                  key={`${editing.id}:${editing.revision}`}
                  state={state}
                  context={data}
                  initial={editing}
                  latest={plan}
                  onClose={() => setEditing(null)}
                  onReload={() => requestAction(() => setEditing(plan))}
                />
              ) : (
                <>
                  <StyledDeliveryRow>
                    <h3>{plan.name}</h3>
                    <StyledDeliveryButton
                      type="button"
                      disabled={state.refreshing || state.busy || !project}
                      onClick={() => requestAction(() => setEditing(plan))}
                    >
                      <Trans>Edit service plan</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                  <p>
                    {project?.name} ·{' '}
                    {plan.billing === 'ONE_TIME' ? (
                      <Trans>One-time</Trans>
                    ) : (
                      <Trans>Retainer</Trans>
                    )}
                  </p>
                  <p>{plan.services.join(' · ')}</p>
                  <StyledClientServiceScope>
                    {plan.scope}
                  </StyledClientServiceScope>
                  {plan.allowance && (
                    <p>
                      <Trans>Allowance</Trans>: {plan.allowance}
                    </p>
                  )}
                  {plan.contact && (
                    <p>
                      <Trans>Client contact and account owner</Trans>:{' '}
                      {plan.contact}
                    </p>
                  )}
                  <StyledDeliveryRow>
                    <Link
                      to={`/delivery?${destination}&clientView=commitments`}
                    >
                      <Trans>View commitments</Trans>
                    </Link>
                    <Link to={`/delivery?${destination}&clientView=agreements`}>
                      <Trans>Portal and onboarding</Trans>
                    </Link>
                  </StyledDeliveryRow>
                </>
              )}
            </StyledClientServicePlan>
          );
        })}
      </StyledDeliveryStack>
    </StyledClientServiceBoundary>
  );
};
type ClientServiceEditorProps = {
  state: ReturnType<typeof useClientSetup>;
  context: ClientSetupContext;
  initial: ClientServicePlan;
  latest: ClientServicePlan;
  onClose: () => void;
  onReload: () => void;
};
const ClientServiceEditor = ({
  state,
  context,
  initial,
  latest,
  onClose,
  onReload,
}: ClientServiceEditorProps) => {
  const { t } = useLingui();
  const [values, setValues] = useState(() => servicePlanValues(initial));
  const [fields, setFields] = useState(initial.fields);
  const [saving, setSaving] = useState(false);
  const [customServiceState, setCustomServiceState] = useState({
    dirty: false,
    busy: false,
  });
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [mutate] = useMutation<{ changeDeliveryClients: ClientsSnapshot }>(
    CHANGE_CLIENT_SERVICE,
  );
  const { requestAction } = useDeliveryDraftGuard();
  const project = context.projects.find(
    (item) => item.id === initial.projectId,
  );
  const requirements = useServicePlanRequirements(
    values,
    fields,
    context.members,
    project?.memberIds ?? [],
  );
  const stale = initial.revision !== latest.revision;
  const available = Boolean(
    state.data && !state.denied && state.permission.manager,
  );
  const identity = `${state.authority}:${context.selectedCompany?.id}:${initial.id}`;
  const startRequest = useFinanceExportRequestGuard(identity, available);
  const startMountedRequest = useFinanceExportRequestGuard(identity, true);
  const draft = useDeliveryNativeDraft({
    extraValues: { values, fields, customServiceState },
    busy: saving || customServiceState.busy,
  });
  const disabled = !available || saving || state.busy || state.refreshing;
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !available ||
      disabled ||
      customServiceState.dirty ||
      customServiceState.busy ||
      stale ||
      uncertain ||
      !project ||
      !draft.dirty ||
      requirements.length
    )
      return;
    const current = startRequest();
    const mounted = startMountedRequest();
    setUncertain(true);
    setSaving(true);
    setError('');
    try {
      const result = (
        await mutate({
          variables: {
            input: {
              action: 'engagement',
              engagement: {
                id: initial.id,
                revision: initial.revision,
                projectId: initial.projectId,
                ...servicePlanInput(values, fields),
              },
            },
          },
        })
      ).data?.changeDeliveryClients;
      if (!current()) return;
      if (!state.permission.matches(result))
        throw new Error(
          t`The saved result could not be verified. Refresh before retrying.`,
        );
      const refreshed = (await state.query.refetch()).data?.deliveryClientSetup;
      if (!current()) return;
      if (
        !state.permission.matches(refreshed) ||
        refreshed?.selectedCompany?.id !== state.data?.selectedCompany?.id ||
        !refreshed?.servicePlans.some(
          (plan) => plan.id === initial.id && plan.revision > initial.revision,
        )
      )
        throw new Error(
          t`Refresh the service plan to check whether your changes were saved.`,
        );
      draft.markSaved();
      onClose();
    } catch (failure) {
      if (!current()) return;
      if (isOtogrowAccessDenied(failure)) {
        state.denyAccess();
        return;
      }
      setUncertain(true);
      setError(
        t`Saving could not be confirmed. Your draft is preserved. Refresh and review the latest service plan before trying again.`,
      );
    } finally {
      if (mounted()) setSaving(false);
    }
  };
  return (
    <form ref={draft.formRef} onChange={draft.onChange} onSubmit={save}>
      <StyledDeliveryStack>
        <h3>
          <Trans>Edit service plan</Trans>
        </h3>
        {error && <p role="alert">{error}</p>}
        {uncertain && (
          <StyledDeliveryButton
            type="button"
            disabled={disabled}
            onClick={async () => {
              if (disabled) return;
              const current = startRequest();
              const mounted = startMountedRequest();
              setSaving(true);
              try {
                const refreshed = (await state.query.refetch()).data
                  ?.deliveryClientSetup;
                if (
                  current() &&
                  state.permission.matches(refreshed) &&
                  refreshed?.selectedCompany?.id ===
                    context.selectedCompany?.id &&
                  refreshed?.servicePlans.some((plan) => plan.id === initial.id)
                ) {
                  setUncertain(false);
                  setError('');
                }
              } catch (failure) {
                if (current() && isOtogrowAccessDenied(failure))
                  state.denyAccess();
              } finally {
                if (mounted()) setSaving(false);
              }
            }}
          >
            <Trans>Refresh service plan</Trans>
          </StyledDeliveryButton>
        )}
        {stale && <DeliveryDraftConflict busy={disabled} onReload={onReload} />}
        <fieldset disabled={disabled || uncertain}>
          <StyledDeliveryStack>
            <label>
              <Trans>Service plan name</Trans>
              <input
                name="name"
                required
                maxLength={6000}
                value={values.name}
                onChange={(event) =>
                  setValues({ ...values, name: event.target.value })
                }
              />
            </label>
            <ServicePlanFields
              values={values}
              setValues={setValues}
              fields={fields}
              setFields={setFields}
              members={context.members}
              projectMemberIds={project?.memberIds ?? []}
              onCustomServiceStateChange={setCustomServiceState}
            />
            {requirements.length > 0 && (
              <ul role="status">
                {requirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            )}
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={
              disabled ||
              customServiceState.dirty ||
              customServiceState.busy ||
              uncertain ||
              stale ||
              !project ||
              !draft.dirty ||
              requirements.length > 0
            }
          >
            <Trans>Save service plan</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            type="button"
            disabled={saving}
            onClick={() => requestAction(onClose)}
          >
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </form>
  );
};
