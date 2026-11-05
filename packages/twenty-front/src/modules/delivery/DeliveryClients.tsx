import { ServicePlanFields } from '@/delivery/onboarding/ServicePlanFields';
import { ClientSetupLink } from '@/delivery/onboarding/ClientSetupLink';
import {
  servicePlanValues,
  servicePlanInput,
  useServicePlanRequirements,
} from '@/delivery/onboarding/service-plan-values';
import { DeliveryCommitments } from '@/delivery/commitments/DeliveryCommitments';
import { DeliveryHandoffs } from '@/delivery/handoffs/DeliveryHandoffs';
import { DeliveryCommitmentDirectory } from '@/delivery/commitments/DeliveryCommitmentDirectory';
import { DeliveryClientShareForm } from '@/delivery/DeliveryClientShareForm';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { type useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { clientEngagementParams } from '@/delivery/commitments/clientCommitmentParams';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { useStore } from 'jotai';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { styled } from '@linaria/react';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  type ClientsSnapshot,
  type ClientEngagement,
} from '@/delivery/delivery-clients.types';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const GET_CLIENTS = gql`
  query DeliveryClients {
    deliveryClients
  }
`;
const CHANGE_CLIENTS = gql`
  mutation ChangeDeliveryClients($input: JSON!) {
    changeDeliveryClients(input: $input)
  }
`;
const StyledAgreedScope = styled.p`
  white-space: pre-wrap;
`;
const StyledClientBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
type DeliveryClientsProps = {
  workspace: DeliveryWorkspace;
  onChanged: () => Promise<unknown>;
};
export const DeliveryClients = (props: DeliveryClientsProps) => {
  const { permission, source } = useAssistantAccess();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  // oxlint-disable-next-line twenty/no-state-useref -- A confirmed authority change must cancel queued navigation before old private forms unregister.
  const previousSource = useRef(source);
  useLayoutEffect(() => {
    if (previousSource.current !== source) cancelPendingNavigation();
    previousSource.current = source;
  }, [source, cancelPendingNavigation]);
  const [params] = useSearchParams();
  return (
    <ClientWorkspace
      key={`${source}:${params.toString()}`}
      workspace={props.workspace}
      onChanged={props.onChanged}
      permission={permission}
      authority={source}
    />
  );
};
const ClientWorkspace = ({
  workspace,
  onChanged,
  permission,
  authority,
}: DeliveryClientsProps & {
  permission: ReturnType<typeof useWorkflowAccess>;
  authority: string;
}) => {
  const { t } = useLingui();
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('clientEngagement') ?? '';
  const [locallyDenied, setLocallyDenied] = useState(false);
  const [privateMounted, setPrivateMounted] = useState(true);
  const [retained, setRetained] = useState<ClientsSnapshot | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- A denial must invalidate concurrent private responses before React can commit the hidden boundary.
  const requestGeneration = useRef(0);
  const denyAccess = useCallback(() => {
    requestGeneration.current += 1;
    cancelPendingNavigation();
    setLocallyDenied(true);
    setPrivateMounted(false);
    setRetained(null);
    setEditing(null);
    setAccess(null);
  }, [cancelPendingNavigation]);
  const query = useQuery<{ deliveryClients: ClientsSnapshot }>(GET_CLIENTS, {
    variables: { identity: authority },
    fetchPolicy: 'no-cache',
    skip: !permission.ready || !permission.manager || locallyDenied,
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
  });
  const [mutate, mutation] = useMutation<{
    changeDeliveryClients: ClientsSnapshot;
  }>(CHANGE_CLIENTS);
  const [error, setError] = useState('');
  const [access, setAccess] = useState<{ token: string; code: string } | null>(
    null,
  );
  const [editing, setEditing] = useState<ClientEngagement | null>(null);
  const candidate = query.data?.deliveryClients;
  const available =
    permission.manager &&
    !locallyDenied &&
    !query.error &&
    permission.matches(candidate);
  const denied =
    permission.denied ||
    isOtogrowAccessDenied(query.error) ||
    (permission.ready && !permission.manager);
  useLayoutEffect(() => {
    if (denied) {
      denyAccess();
      setEditing(null);
      setAccess(null);
    }
  }, [denied, denyAccess]);
  if (available && candidate && !fastDeepEqual(retained, candidate))
    setRetained(candidate);
  const data = available ? candidate : retained;
  const beginRequest = useFinanceExportRequestGuard(
    authority,
    Boolean(available),
  );
  const startRequest = () => {
    const current = beginRequest();
    const generation = requestGeneration.current;
    return () => current() && generation === requestGeneration.current;
  };
  const selected = data?.engagements.find((item) => item.id === selectedId);
  const sourceLost = Boolean(
    available &&
    data &&
    ((selectedId && !selected) ||
      (editing && !data.engagements.some((item) => item.id === editing.id))),
  );
  useLayoutEffect(() => {
    if (sourceLost) {
      cancelPendingNavigation();
      setEditing(null);
      setAccess(null);
    }
  }, [sourceLost, cancelPendingNavigation]);
  const beginAccessCheck = useFinanceExportRequestGuard(
    authority,
    permission.ready && permission.manager,
  );
  const retryAccess = async () => {
    const current = beginAccessCheck();
    const generation = requestGeneration.current;
    try {
      await permission.refetch();
      const result = await query.refetch();
      if (
        current() &&
        generation === requestGeneration.current &&
        permission.matches(result.data?.deliveryClients)
      ) {
        setLocallyDenied(false);
        setPrivateMounted(true);
      }
    } catch (failure) {
      if (
        current() &&
        generation === requestGeneration.current &&
        isOtogrowAccessDenied(failure)
      )
        denyAccess();
    }
  };
  const run = async (input: Record<string, unknown>) => {
    if (!available) return false;
    const current = startRequest();
    setError('');
    try {
      const result = (await mutate({ variables: { input } })).data
        ?.changeDeliveryClients;
      if (!current()) return false;
      if (!permission.matches(result))
        throw new Error(
          t`The client result could not be verified. Refresh before retrying.`,
        );
      if (result?.token && result.accessCode)
        setAccess({ token: result.token, code: result.accessCode });
    } catch (failure) {
      if (!current()) return false;
      if (isOtogrowAccessDenied(failure)) {
        denyAccess();
        setEditing(null);
        setAccess(null);
      }
      setError(
        failure instanceof Error
          ? failure.message
          : t`Could not save client details.`,
      );
      return false;
    }
    try {
      await query.refetch();
      if (!current()) return true;
      await onChanged();
    } catch {
      if (!current()) return true;
      setError(
        t`Client details were saved, but this page could not refresh. Refresh before making another change.`,
      );
    }
    return true;
  };
  const download = async (
    engagementId: string,
    assetId: string,
    name: string,
  ) => {
    if (!available) return;
    const current = startRequest();
    try {
      const token = store.get(tokenPairState.atom)
        ?.accessOrWorkspaceAgnosticToken?.token;
      const headers: Record<string, string> =
        !store.get(isCookieAuthActiveState.atom) && token
          ? { Authorization: `Bearer ${token}` }
          : {};
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/portal/delivery-client-files/${engagementId}/${assetId}`,
        { headers, credentials: 'include', cache: 'no-store' },
      );
      if (!response.ok) {
        if ([401, 403].includes(response.status)) {
          denyAccess();
          setEditing(null);
          setAccess(null);
        }
        throw new Error(
          t`File unavailable. Refresh your access and try again.`,
        );
      }
      const blob = await response.blob();
      if (!current()) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      if (!current()) return;
      setError(
        failure instanceof Error ? failure.message : t`Download failed.`,
      );
    }
  };
  if (permission.ready && !permission.manager)
    return <DeliveryCommitmentDirectory />;
  return (
    <StyledDeliveryStack>
      {!available && (
        <StyledDeliveryCard>
          <p role={query.error || permission.error ? 'alert' : 'status'}>
            {locallyDenied ? (
              <Trans>
                Client access changed. Unsaved preparation and private portal
                credentials were cleared. Check current access before
                continuing.
              </Trans>
            ) : (
              <Trans>
                Client details are hidden until your current access and
                workspace can be verified.
              </Trans>
            )}
          </p>
          <StyledDeliveryButton
            type="button"
            disabled={query.loading || permission.loading}
            onClick={() => {
              void retryAccess();
            }}
          >
            <Trans>Check client access again</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryCard>
      )}
      <StyledClientBoundary
        hidden={!available}
        disabled={!available}
        inert={!available || undefined}
      >
        {privateMounted && (
          <StyledDeliveryStack>
            <StyledDeliveryCard>
              <StyledDeliveryRow>
                <div>
                  <h2>
                    <Trans>Client workspace</Trans>
                  </h2>
                  <p>
                    <Trans>
                      Collect brand information and share approved work.
                    </Trans>
                  </p>
                </div>
                <StyledDeliveryRow>
                  {selected && (
                    <ClientSetupLink>
                      <Trans>Set up another client</Trans>
                    </ClientSetupLink>
                  )}
                  <ClientSetupLink
                    companyId={selected?.companyId}
                    projectId={selected?.projectId}
                  >
                    <Trans>New client service plan</Trans>
                  </ClientSetupLink>
                </StyledDeliveryRow>
              </StyledDeliveryRow>
              {!workspace.projects.some((project) => project.companyId) && (
                <p>
                  <Trans>
                    Use New client service plan to choose a client, prepare its
                    project team and review a service plan together.
                  </Trans>
                </p>
              )}
              <label>
                <Trans>Client service plan</Trans>
                <select
                  value={selectedId}
                  onChange={(event) => {
                    const id = event.target.value;
                    requestAction(() => {
                      setParams(clientEngagementParams(params, id));
                    });
                  }}
                >
                  <option value="">{t`Choose a client service plan`}</option>
                  {selectedId && !selected && (
                    <option
                      value={selectedId}
                      disabled
                    >{t`Selected client service plan unavailable`}</option>
                  )}
                  {data?.engagements.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {available && selectedId && !selected && (
                <p role="alert">
                  <Trans>
                    This linked client service plan is unavailable. Choose a
                    client service plan you can currently access.
                  </Trans>{' '}
                  <StyledDeliveryButton
                    type="button"
                    onClick={() =>
                      requestAction(() =>
                        setParams(clientEngagementParams(params, null)),
                      )
                    }
                  >
                    <Trans>Clear service plan selection</Trans>
                  </StyledDeliveryButton>
                </p>
              )}
            </StyledDeliveryCard>
            <DeliveryHandoffs
              workspace={workspace}
              onCreated={async (engagementId) => {
                if (!available) return;
                const current = startRequest();
                await onChanged();
                await query.refetch();
                if (current())
                  requestAction(() => {
                    if (current())
                      setParams(clientEngagementParams(params, engagementId));
                  });
              }}
            />
            {(error || query.error) && (
              <p role="alert">{error || query.error?.message}</p>
            )}
            {editing !== null && (
              <EngagementForm
                key={`${editing.id}:${editing.revision}`}
                workspace={workspace}
                initial={editing}
                busy={mutation.loading}
                latestRevision={
                  data?.engagements.find((item) => item.id === editing.id)
                    ?.revision ?? -1
                }
                onReload={() =>
                  requestAction(() => {
                    const latest = data?.engagements.find(
                      (item) => item.id === editing.id,
                    );
                    if (latest) setEditing(latest);
                    else
                      setError(
                        t`This client service plan is no longer available. Your draft is still here.`,
                      );
                  })
                }
                onCancel={() => requestAction(() => setEditing(null))}
                onSave={async (engagement) => {
                  const saved = await run({ action: 'engagement', engagement });
                  if (saved) setEditing(null);
                  return saved;
                }}
              />
            )}
            {selected && editing === null && (
              <>
                <StyledDeliveryCard>
                  <StyledDeliveryStack>
                    <StyledDeliveryRow>
                      <h2>{selected.name}</h2>
                      <StyledDeliveryButton
                        disabled={editing !== null}
                        onClick={() =>
                          requestAction(() => setEditing(selected))
                        }
                      >
                        <Trans>Edit client service plan</Trans>
                      </StyledDeliveryButton>
                    </StyledDeliveryRow>
                    <p>
                      {selected.services.join(' · ')} ·{' '}
                      {selected.billing === 'RETAINER'
                        ? t`Retainer`
                        : t`One-time`}
                    </p>
                    <StyledAgreedScope>{selected.scope}</StyledAgreedScope>
                    <p>{selected.contact}</p>
                    <StyledDeliveryButton
                      disabled={mutation.loading}
                      onClick={() => {
                        setAccess(null);
                        void run({ action: 'link', engagementId: selected.id });
                      }}
                    >
                      <Trans>Create 24-hour client link</Trans>
                    </StyledDeliveryButton>
                    <small>
                      <Trans>
                        Creating a new link revokes the previous link. Share the
                        access code separately with the intended client.
                        Creating a link does not record delivery.
                      </Trans>
                    </small>
                    {access && (
                      <>
                        <label>
                          <Trans>Client link</Trans>
                          <input
                            readOnly
                            value={`${window.location.origin}/delivery-client#${access.token}`}
                          />
                        </label>
                        <label>
                          <Trans>Separate access code</Trans>
                          <input readOnly value={access.code} />
                        </label>
                      </>
                    )}
                    {data?.links
                      .filter(
                        (item) =>
                          item.engagementId === selected.id && !item.revokedAt,
                      )
                      .map((link) => (
                        <StyledDeliveryRow key={link.id}>
                          <small>
                            <Trans>Expires</Trans>{' '}
                            {new Date(link.expiresAt).toLocaleString()}
                          </small>
                          <StyledDeliveryButton
                            disabled={mutation.loading}
                            onClick={() => {
                              setAccess(null);
                              void run({ action: 'revoke', id: link.id });
                            }}
                          >
                            <Trans>Revoke link</Trans>
                          </StyledDeliveryButton>
                        </StyledDeliveryRow>
                      ))}
                  </StyledDeliveryStack>
                </StyledDeliveryCard>
                <DeliveryCommitments
                  engagementId={selected.id}
                  billing={selected.billing}
                />
                <StyledDeliveryGrid>
                  <StyledDeliveryCard>
                    <StyledDeliveryStack>
                      <h3>
                        <Trans>Onboarding submissions</Trans>
                      </h3>
                      {(selected.assets ?? []).map((asset) => (
                        <StyledDeliveryButton
                          key={asset.id}
                          onClick={() =>
                            void download(selected.id, asset.id, asset.name)
                          }
                        >
                          {asset.name}
                        </StyledDeliveryButton>
                      ))}
                      {!selected.submissions.length && (
                        <p>
                          <Trans>
                            Waiting for the client’s brand information.
                          </Trans>
                        </p>
                      )}
                      {selected.submissions.map((submission) => (
                        <StyledDeliveryStack key={submission.id}>
                          <small>
                            {new Date(submission.at).toLocaleString()}
                          </small>
                          {submission.answers.map((answer, index) => (
                            <div key={index}>
                              <strong>{answer.label}</strong>
                              <p
                                style={{
                                  whiteSpace: 'pre-wrap',
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                {answer.value || '—'}
                              </p>
                            </div>
                          ))}
                          <StyledDeliveryButton
                            disabled={
                              mutation.loading || Boolean(submission.acceptedBy)
                            }
                            onClick={() =>
                              void run({
                                action: 'accept',
                                engagementId: selected.id,
                                submissionId: submission.id,
                              })
                            }
                          >
                            {submission.acceptedBy
                              ? t`Accepted`
                              : t`Accept onboarding`}
                          </StyledDeliveryButton>
                        </StyledDeliveryStack>
                      ))}
                    </StyledDeliveryStack>
                  </StyledDeliveryCard>
                  <StyledDeliveryCard>
                    <DeliveryClientShareForm
                      key={selected.id}
                      engagement={selected}
                      tasks={workspace.tasks}
                      busy={mutation.loading}
                      run={run}
                    />
                  </StyledDeliveryCard>
                </StyledDeliveryGrid>
                {data?.shares
                  .filter((item) => item.engagementId === selected.id)
                  .map((share) => (
                    <StyledDeliveryCard key={share.id}>
                      <StyledDeliveryStack>
                        <StyledDeliveryRow>
                          <h3>
                            {share.title} ·{' '}
                            {share.kind === 'BRIEF' ? t`Brief` : t`Submission`}{' '}
                            v{share.version}
                          </h3>
                          <StyledDeliveryButton
                            disabled={
                              Boolean(share.withdrawnAt) || mutation.loading
                            }
                            onClick={() =>
                              void run({ action: 'withdraw', id: share.id })
                            }
                          >
                            {share.withdrawnAt
                              ? t`Withdrawn`
                              : t`Withdraw from portal`}
                          </StyledDeliveryButton>
                        </StyledDeliveryRow>
                        <p style={{ whiteSpace: 'pre-wrap' }}>
                          {share.content}
                        </p>
                        {share.reviews.map((review) => (
                          <div key={review.id}>
                            <strong>
                              {review.decision === 'APPROVED'
                                ? t`Client approved`
                                : review.decision === 'CHANGES_REQUESTED'
                                  ? t`Client requested changes`
                                  : t`Client comment`}
                            </strong>
                            <p>{review.comment}</p>
                            <small>
                              {new Date(review.at).toLocaleString()}
                            </small>
                          </div>
                        ))}
                      </StyledDeliveryStack>
                    </StyledDeliveryCard>
                  ))}
              </>
            )}
          </StyledDeliveryStack>
        )}
      </StyledClientBoundary>
    </StyledDeliveryStack>
  );
};
type EngagementFormProps = {
  workspace: DeliveryWorkspace;
  initial: ClientEngagement | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (engagement: Record<string, unknown>) => Promise<boolean>;
  latestRevision: number;
  onReload: () => void;
};
const EngagementForm = ({
  workspace,
  initial,
  busy,
  onCancel,
  onSave,
  latestRevision,
  onReload,
}: EngagementFormProps) => {
  const { t } = useLingui();
  const [fields, setFields] = useState(
    initial?.fields ??
      [
        t`Website link`,
        t`Logo and brand guideline links`,
        t`Brand goals and notes`,
      ].map((label) => ({ id: crypto.randomUUID(), label, required: true })),
  );
  const [values, setValues] = useState(() => servicePlanValues(initial));
  const project = workspace.projects.find(
    (item) => item.id === values.projectId && Boolean(item.companyId),
  );
  const requirements = [
    ...(initial && project && initial.companyId !== project.companyId
      ? [
          t`This project is now linked to a different client. Set up a separate service plan instead of changing this client’s scope.`,
        ]
      : []),
    ...(!project
      ? [t`Choose a client project. Projects can be set up in Team.`]
      : []),
    ...useServicePlanRequirements(
      values,
      fields,
      workspace.members,
      project?.memberIds ?? [],
    ),
  ];
  const [saving, setSaving] = useState(false);
  const draft = useDeliveryNativeDraft({
    extraValues: { fields, values },
    busy: busy || saving,
  });
  const stale = Boolean(initial && initial.revision !== latestRevision);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || saving || stale || !draft.dirty || requirements.length) return;
    setSaving(true);
    try {
      await onSave({
        ...(initial ? { id: initial.id } : {}),
        revision: initial?.revision ?? 0,
        projectId: values.projectId,
        ...servicePlanInput(values, fields),
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <StyledDeliveryCard>
      <form ref={draft.formRef} onChange={draft.onChange} onSubmit={submit}>
        {stale && (
          <DeliveryDraftConflict onReload={onReload} busy={busy || saving} />
        )}
        <fieldset disabled={busy || saving}>
          <StyledDeliveryStack>
            <h3>
              {initial
                ? t`Edit client service plan`
                : t`New client service plan`}
            </h3>
            <StyledDeliveryGrid>
              <label>
                <Trans>Project</Trans>
                <select
                  name="projectId"
                  required
                  disabled={Boolean(initial)}
                  value={values.projectId}
                  onChange={(event) =>
                    setValues({ ...values, projectId: event.target.value })
                  }
                >
                  <option value="">{t`Choose a client project`}</option>
                  {workspace.projects
                    .filter((item) => item.companyId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <Trans>Service plan name</Trans>
                <input
                  name="name"
                  required
                  value={values.name}
                  onChange={(event) =>
                    setValues({ ...values, name: event.target.value })
                  }
                  maxLength={6000}
                />
              </label>
            </StyledDeliveryGrid>
            <ServicePlanFields
              values={values}
              setValues={setValues}
              fields={fields}
              setFields={setFields}
              members={workspace.members}
              projectMemberIds={project?.memberIds ?? []}
            />
            {requirements.length > 0 && (
              <div role="status">
                <p>
                  <Trans>Before saving:</Trans>
                </p>
                <ul>
                  {requirements.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              </div>
            )}
            <StyledDeliveryRow>
              <StyledDeliveryButton
                disabled={
                  busy ||
                  saving ||
                  stale ||
                  !draft.dirty ||
                  requirements.length > 0
                }
                type="submit"
                data-primary="true"
              >
                <Trans>Save client service plan</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton type="button" onClick={onCancel}>
                <Trans>Cancel</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          </StyledDeliveryStack>
        </fieldset>
      </form>
    </StyledDeliveryCard>
  );
};
