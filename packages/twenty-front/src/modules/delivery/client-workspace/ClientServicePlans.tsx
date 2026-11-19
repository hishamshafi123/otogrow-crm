import { useState, type FormEvent } from 'react';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { Link } from 'react-router-dom';
import { type ClientsSnapshot } from '@/delivery/delivery-clients.types';
import { type useClientSetup } from '@/delivery/onboarding/useClientSetup';
import { type ClientSetupContext } from '@/delivery/onboarding/client-setup.types';
import { ServicePlanFields } from '@/delivery/onboarding/ServicePlanFields';
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
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const CHANGE_CLIENT_SERVICE = gql`
  mutation ChangeClientServicePlan($input: JSON!) {
    changeDeliveryClients(input: $input)
  }
`;
const StyledClientServiceScope = styled.p`
  overflow-wrap: anywhere;
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
        <h2>
          <Trans>Service plans</Trans>
        </h2>
        {plans.length === 0 && (
          <p>
            <Trans>
              No service plans in this project yet. Use client setup to agree
              the scope and first work.
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
            <StyledDeliveryCard key={plan.id}>
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
                <StyledDeliveryStack>
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
                </StyledDeliveryStack>
              )}
            </StyledDeliveryCard>
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
    extraValues: { values, fields },
    busy: saving,
  });
  const disabled = !available || saving || state.busy || state.refreshing;
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !available ||
      disabled ||
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
