import { DeliveryCommitments } from '@/delivery/commitments/DeliveryCommitments';
import { DeliveryHandoffs } from '@/delivery/handoffs/DeliveryHandoffs';
import { DeliveryCommitmentDirectory } from '@/delivery/commitments/DeliveryCommitmentDirectory';
import { DeliveryClientShareForm } from '@/delivery/DeliveryClientShareForm';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { useStore } from 'jotai';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useState, type FormEvent } from 'react';
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
const isPerformanceMarketingService = (service: string) =>
  service.trim().toLowerCase().replace(/[_-]+/g, ' ') ===
  'performance marketing';

const StyledClientServiceChoices = styled.div`
  display: grid;
  gap: 4px 12px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  margin-bottom: 12px;
  > label {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 8px;
    min-height: 44px;
  }
  input[type='checkbox'] {
    flex: 0 0 auto;
    margin: 0;
  }
`;
const StyledAgreedScope = styled.p`
  white-space: pre-wrap;
`;
type DeliveryClientsProps = {
  workspace: DeliveryWorkspace;
  onChanged: () => Promise<unknown>;
};
export const DeliveryClients = ({
  workspace,
  onChanged,
}: DeliveryClientsProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const store = useStore();
  const query = useQuery<{ deliveryClients: ClientsSnapshot }>(GET_CLIENTS, {
    fetchPolicy: 'network-only',
    skip: !workspace.actor.isManager,
    pollInterval: 30000,
  });
  const [mutate, mutation] = useMutation<{
    changeDeliveryClients: ClientsSnapshot;
  }>(CHANGE_CLIENTS);
  const [error, setError] = useState('');
  const [access, setAccess] = useState<{ token: string; code: string } | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState<ClientEngagement | 'new' | null>(null);
  const data = query.data?.deliveryClients;
  const selected = data?.engagements.find((item) => item.id === selectedId);
  const run = async (input: Record<string, unknown>) => {
    setError('');
    try {
      const result = (await mutate({ variables: { input } })).data
        ?.changeDeliveryClients;
      if (result?.token && result.accessCode)
        setAccess({ token: result.token, code: result.accessCode });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Could not save client details.`,
      );
      return false;
    }
    try {
      await query.refetch();
      await onChanged();
    } catch {
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
      if (!response.ok)
        throw new Error(
          t`File unavailable. Refresh your access and try again.`,
        );
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : t`Download failed.`,
      );
    }
  };
  if (!workspace.actor.isManager) return <DeliveryCommitmentDirectory />;
  return (
    <StyledDeliveryStack>
      <StyledDeliveryCard>
        <StyledDeliveryRow>
          <div>
            <h2>
              <Trans>Client workspace</Trans>
            </h2>
            <p>
              <Trans>Collect brand information and share approved work.</Trans>
            </p>
          </div>
          <StyledDeliveryButton
            onClick={() => requestAction(() => setEditing('new'))}
            disabled={
              editing !== null ||
              !workspace.projects.some((project) => project.companyId)
            }
          >
            <Trans>New engagement</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {!workspace.projects.some((project) => project.companyId) && (
          <p>
            <Trans>
              Link a project to its client company in Team access first.
            </Trans>
          </p>
        )}
        <label>
          <Trans>Engagement</Trans>
          <select
            value={selectedId}
            onChange={(event) => {
              const id = event.target.value;
              requestAction(() => {
                setSelectedId(id);
                setAccess(null);
                setEditing(null);
              });
            }}
          >
            <option value="">{t`Choose a client engagement`}</option>
            {data?.engagements.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </StyledDeliveryCard>
      <DeliveryHandoffs
        workspace={workspace}
        onCreated={async (engagementId) => {
          await onChanged();
          await query.refetch();
          setSelectedId(engagementId);
          setEditing(null);
          setAccess(null);
        }}
      />
      {(error || query.error) && (
        <p role="alert">{error || query.error?.message}</p>
      )}
      {editing !== null && (
        <EngagementForm
          key={
            typeof editing === 'string'
              ? 'new'
              : `${editing.id}:${editing.revision}`
          }
          workspace={workspace}
          initial={editing === 'new' ? null : editing}
          busy={mutation.loading}
          latestRevision={
            editing === 'new'
              ? 0
              : (data?.engagements.find((item) => item.id === editing.id)
                  ?.revision ?? -1)
          }
          onReload={() =>
            requestAction(() => {
              if (editing === 'new') return;
              const latest = data?.engagements.find(
                (item) => item.id === editing.id,
              );
              if (latest) setEditing(latest);
              else
                setError(
                  t`This engagement is no longer available. Your draft is still here.`,
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
                  onClick={() => requestAction(() => setEditing(selected))}
                >
                  <Trans>Edit engagement</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
              <p>
                {selected.services.join(' · ')} ·{' '}
                {selected.billing === 'RETAINER' ? t`Retainer` : t`One-time`}
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
                  access code separately with the intended client. Creating a
                  link does not record delivery.
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
                    <Trans>Waiting for the client’s brand information.</Trans>
                  </p>
                )}
                {selected.submissions.map((submission) => (
                  <StyledDeliveryStack key={submission.id}>
                    <small>{new Date(submission.at).toLocaleString()}</small>
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
                      {share.kind === 'BRIEF' ? t`Brief` : t`Submission`} v
                      {share.version}
                    </h3>
                    <StyledDeliveryButton
                      disabled={Boolean(share.withdrawnAt) || mutation.loading}
                      onClick={() =>
                        void run({ action: 'withdraw', id: share.id })
                      }
                    >
                      {share.withdrawnAt
                        ? t`Withdrawn`
                        : t`Withdraw from portal`}
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{share.content}</p>
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
                      <small>{new Date(review.at).toLocaleString()}</small>
                    </div>
                  ))}
                </StyledDeliveryStack>
              </StyledDeliveryCard>
            ))}
        </>
      )}
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
  const [values, setValues] = useState({
    projectId: initial?.projectId ?? '',
    name: initial?.name ?? '',
    services: initial?.services.join(', ') ?? '',
    scope: initial?.scope ?? '',
    advertising: Boolean(initial?.advertising),
    managerId: initial?.advertising?.managerId ?? '',
    marketerId: initial?.advertising?.marketerId ?? '',
  });
  const project = workspace.projects.find(
    (item) => item.id === values.projectId && Boolean(item.companyId),
  );
  const managers = workspace.members.filter(
    (member) => member.access !== 'MEMBER',
  );
  const marketers = workspace.members.filter((member) =>
    project?.memberIds.includes(member.id),
  );
  const services = values.services
    .split(',')
    .map((service) => service.trim())
    .filter(Boolean);
  const performanceMarketing = services.some(isPerformanceMarketingService);
  const changeServices = (nextServices: string) =>
    setValues({
      ...values,
      services: nextServices,
      advertising:
        values.advertising &&
        nextServices.split(',').some(isPerformanceMarketingService),
    });
  const requirements = [
    ...(!project
      ? [t`Choose a client project. Projects can be set up in Team.`]
      : []),
    ...(!values.name.trim() ? [t`Enter an engagement name.`] : []),
    ...(!services.length ||
    services.length > 20 ||
    services.some((service) => service.length > 100)
      ? [
          t`Enter one to twenty services, with at most 100 characters per service.`,
        ]
      : []),
    ...(!values.scope.trim()
      ? [t`Describe the scope the client will see.`]
      : []),
    ...(fields.some((field) => !field.label.trim())
      ? [t`Name each onboarding question or remove it.`]
      : []),
    ...(values.advertising && !performanceMarketing
      ? [
          t`Select Performance marketing in Client services or turn off advertising responsibilities.`,
        ]
      : []),
    ...(values.advertising &&
    !managers.some((member) => member.id === values.managerId)
      ? [t`Choose an advertising project manager.`]
      : []),
    ...(values.advertising &&
    !marketers.some((member) => member.id === values.marketerId)
      ? [t`Choose a marketer who belongs to this project.`]
      : []),
    ...(values.advertising &&
    values.managerId &&
    values.managerId === values.marketerId
      ? [t`The project manager and marketer must be different people.`]
      : []),
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
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await onSave({
        ...(initial ? { id: initial.id } : {}),
        revision: initial?.revision ?? 0,
        projectId: values.projectId,
        name: values.name,
        services,
        advertising: values.advertising
          ? {
              managerId: values.managerId,
              marketerId: values.marketerId,
              currency: form.get('advertisingCurrency'),
              channel: form.get('advertisingChannel'),
              period: form.get('advertisingPeriod'),
            }
          : null,
        billing: form.get('billing'),
        scope: values.scope,
        allowance: form.get('allowance'),
        contact: form.get('contact'),
        fields,
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
            <h3>{initial ? t`Edit engagement` : t`New client engagement`}</h3>
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
                <Trans>Engagement name</Trans>
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
            <StyledDeliveryGrid>
              <fieldset>
                <legend>
                  <Trans>Client services</Trans>
                </legend>
                <StyledClientServiceChoices>
                  {[
                    ['AI video', t`AI video`],
                    ['Static ads', t`Static ads`],
                    ['Performance marketing', t`Performance marketing`],
                    ['SEO', t`SEO`],
                    ['Website', t`Website`],
                    ['SaaS', t`SaaS`],
                    ['Mobile app', t`Mobile app`],
                  ].map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="checkbox"
                        checked={services.some(
                          (service) =>
                            service.toLowerCase().replace(/[_-]+/g, ' ') ===
                            value.toLowerCase(),
                        )}
                        onChange={(event) =>
                          changeServices(
                            (event.target.checked
                              ? [...services, value]
                              : services.filter(
                                  (service) =>
                                    service
                                      .toLowerCase()
                                      .replace(/[_-]+/g, ' ') !==
                                    value.toLowerCase(),
                                )
                            ).join(', '),
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </StyledClientServiceChoices>
                <label>
                  <Trans>Services, separated by commas</Trans>
                  <input
                    name="services"
                    required
                    value={values.services}
                    onChange={(event) => changeServices(event.target.value)}
                  />
                </label>
              </fieldset>
              <label>
                <Trans>Billing arrangement</Trans>
                <select
                  name="billing"
                  defaultValue={initial?.billing ?? 'RETAINER'}
                >
                  <option value="RETAINER">{t`Retainer`}</option>
                  <option value="ONE_TIME">{t`One-time`}</option>
                </select>
              </label>
            </StyledDeliveryGrid>
            <label>
              <Trans>Client-visible scope</Trans>
              <textarea
                name="scope"
                required
                maxLength={6000}
                value={values.scope}
                onChange={(event) =>
                  setValues({ ...values, scope: event.target.value })
                }
              />
            </label>
            <StyledDeliveryGrid>
              <label>
                <Trans>Deliverable allowance</Trans>
                <input
                  name="allowance"
                  maxLength={2000}
                  defaultValue={initial?.allowance}
                />
              </label>
              <label>
                <Trans>Client contact and account owner</Trans>
                <input
                  name="contact"
                  maxLength={500}
                  defaultValue={initial?.contact}
                />
              </label>
            </StyledDeliveryGrid>
            <fieldset>
              <legend>
                <Trans>Performance marketing responsibilities</Trans>
              </legend>
              <label>
                <input
                  type="checkbox"
                  name="advertising"
                  disabled={!performanceMarketing && !values.advertising}
                  checked={values.advertising}
                  onChange={(event) =>
                    setValues({ ...values, advertising: event.target.checked })
                  }
                />
                <Trans>
                  Configure the PM, marketer and client budget requests
                </Trans>
              </label>
              {!performanceMarketing && (
                <p>{t`Select Performance marketing above to configure advertising responsibilities. Removing that service turns off this setup and the client’s budget controls when saved.`}</p>
              )}
              <p>
                <Trans>
                  These assignments are reused by linked performance reports.
                  Select Performance marketing in Client services to make this
                  engagement available for reporting. Client budget requests
                  change advertising spend, not the agency retainer.
                </Trans>
              </p>
              <fieldset
                hidden={!values.advertising}
                disabled={!values.advertising}
              >
                <StyledDeliveryGrid>
                  <label>
                    <Trans>Advertising project manager</Trans>
                    <select
                      name="advertisingManager"
                      required
                      value={values.managerId}
                      onChange={(event) =>
                        setValues({ ...values, managerId: event.target.value })
                      }
                    >
                      <option value="">{t`Choose a manager`}</option>
                      {managers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <Trans>Assigned marketer</Trans>
                    <select
                      name="advertisingMarketer"
                      required
                      value={values.marketerId}
                      onChange={(event) =>
                        setValues({ ...values, marketerId: event.target.value })
                      }
                    >
                      <option value="">{t`Choose a project member`}</option>
                      {marketers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </StyledDeliveryGrid>
                <StyledDeliveryGrid>
                  <label>
                    <Trans>Advertising currency</Trans>
                    <select
                      name="advertisingCurrency"
                      defaultValue={initial?.advertising?.currency ?? 'USD'}
                    >
                      {[
                        'USD',
                        'AED',
                        'EUR',
                        'GBP',
                        'INR',
                        'SGD',
                        'AUD',
                        'CAD',
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <Trans>Advertising platform</Trans>
                    <select
                      name="advertisingChannel"
                      defaultValue={initial?.advertising?.channel ?? 'META'}
                    >
                      {['META', 'X', 'TIKTOK', 'CHATGPT'].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <Trans>Budget period</Trans>
                    <select
                      name="advertisingPeriod"
                      defaultValue={initial?.advertising?.period ?? 'DAILY'}
                    >
                      <option value="DAILY">{t`Daily`}</option>
                      <option value="MONTHLY">{t`Monthly`}</option>
                      <option value="LIFETIME">{t`Lifetime`}</option>
                    </select>
                  </label>
                </StyledDeliveryGrid>
              </fieldset>
            </fieldset>
            <details>
              <summary>
                <Trans>Onboarding questions</Trans>: {fields.length} ·{' '}
                <Trans>Required</Trans>:{' '}
                {fields.filter((field) => field.required).length}
                {fields.some((field) => !field.label.trim()) && (
                  <>
                    {' '}
                    · <Trans>Incomplete question</Trans>
                  </>
                )}
              </summary>
              <StyledDeliveryStack>
                {fields.map((field, index) => (
                  <StyledDeliveryRow key={field.id}>
                    <label>
                      <Trans>Question</Trans>
                      <input
                        required
                        maxLength={200}
                        value={field.label}
                        onChange={(event) =>
                          setFields(
                            fields.map((item) =>
                              item.id === field.id
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          setFields(
                            fields.map((item) =>
                              item.id === field.id
                                ? { ...item, required: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />
                      <Trans>Required</Trans>
                    </label>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        setFields(
                          fields.filter((_, position) => position !== index),
                        )
                      }
                    >
                      <Trans>Remove question</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                ))}
                <StyledDeliveryButton
                  type="button"
                  disabled={fields.length >= 30}
                  onClick={() =>
                    setFields([
                      ...fields,
                      { id: crypto.randomUUID(), label: '', required: false },
                    ])
                  }
                >
                  <Trans>Add question</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryStack>
            </details>
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
                <Trans>Save engagement</Trans>
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
