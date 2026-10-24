import { useStore } from 'jotai';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useState, type FormEvent } from 'react';
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
type DeliveryClientsProps = {
  workspace: DeliveryWorkspace;
  onChanged: () => Promise<unknown>;
};
export const DeliveryClients = ({
  workspace,
  onChanged,
}: DeliveryClientsProps) => {
  const { t } = useLingui();
  const store = useStore();
  const query = useQuery<{ deliveryClients: ClientsSnapshot }>(GET_CLIENTS, {
    fetchPolicy: 'network-only',
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
  const [taskId, setTaskId] = useState('');
  const data = query.data?.deliveryClients;
  const selected = data?.engagements.find((item) => item.id === selectedId);
  const run = async (input: Record<string, unknown>) => {
    setError('');
    try {
      const result = (await mutate({ variables: { input } })).data
        ?.changeDeliveryClients;
      if (result?.token && result.accessCode)
        setAccess({ token: result.token, code: result.accessCode });
      await query.refetch();
      await onChanged();
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Could not save client details.`,
      );
      return false;
    }
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
  if (!workspace.actor.isManager) return null;
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
            onClick={() => setEditing('new')}
            disabled={!workspace.projects.some((project) => project.companyId)}
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
              setSelectedId(event.target.value);
              setTaskId('');
              setAccess(null);
              setEditing(null);
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
      {(error || query.error) && (
        <p role="alert">{error || query.error?.message}</p>
      )}
      {editing && (
        <EngagementForm
          key={typeof editing === 'string' ? 'new' : editing.id}
          workspace={workspace}
          initial={editing === 'new' ? null : editing}
          busy={mutation.loading}
          onCancel={() => setEditing(null)}
          onSave={async (engagement) => {
            if (await run({ action: 'engagement', engagement }))
              setEditing(null);
          }}
        />
      )}
      {selected && (
        <>
          <StyledDeliveryCard>
            <StyledDeliveryStack>
              <StyledDeliveryRow>
                <h2>{selected.name}</h2>
                <StyledDeliveryButton onClick={() => setEditing(selected)}>
                  <Trans>Edit engagement</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
              <p>
                {selected.services.join(' · ')} ·{' '}
                {selected.billing === 'RETAINER' ? t`Retainer` : t`One-time`}
              </p>
              <p>{selected.scope}</p>
              <p>{selected.allowance}</p>
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
              <StyledDeliveryStack>
                <h3>
                  <Trans>Share an approved version</Trans>
                </h3>
                <label>
                  <Trans>Task</Trans>
                  <select
                    value={taskId}
                    onChange={(event) => setTaskId(event.target.value)}
                  >
                    <option value="">{t`Choose a task`}</option>
                    {workspace.tasks
                      .filter((item) => item.projectId === selected.projectId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                  </select>
                </label>
                {(['BRIEF', 'SUBMISSION'] as const).map((kind) => {
                  const task = workspace.tasks.find(
                    (item) => item.id === taskId,
                  );
                  const eligible =
                    task &&
                    (kind === 'BRIEF'
                      ? task.details.creative?.approvedBriefVersion ===
                          task.details.creative?.briefVersion &&
                        Boolean(task.details.creative)
                      : task.details.state === 'APPROVED');
                  return (
                    <StyledDeliveryButton
                      key={kind}
                      disabled={!eligible || mutation.loading}
                      onClick={() =>
                        void run({
                          action: 'share',
                          engagementId: selected.id,
                          taskId,
                          revision: task?.revision,
                          kind,
                        })
                      }
                    >
                      {kind === 'BRIEF'
                        ? t`Share approved brief`
                        : t`Share approved submission`}
                    </StyledDeliveryButton>
                  );
                })}
                <small>
                  <Trans>
                    Only the selected approved version is visible to the client.
                    Internal notes and generated candidates stay private.
                  </Trans>
                </small>
              </StyledDeliveryStack>
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
  onSave: (engagement: Record<string, unknown>) => Promise<void>;
};
const EngagementForm = ({
  workspace,
  initial,
  busy,
  onCancel,
  onSave,
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
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onSave({
      ...(initial ? { id: initial.id } : {}),
      revision: initial?.revision ?? 0,
      projectId: initial?.projectId ?? form.get('projectId'),
      name: form.get('name'),
      services: String(form.get('services'))
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      advertising:
        form.get('advertising') === 'on'
          ? {
              managerId: form.get('advertisingManager'),
              marketerId: form.get('advertisingMarketer'),
              currency: form.get('advertisingCurrency'),
              channel: form.get('advertisingChannel'),
              period: form.get('advertisingPeriod'),
            }
          : null,
      billing: form.get('billing'),
      scope: form.get('scope'),
      allowance: form.get('allowance'),
      contact: form.get('contact'),
      fields,
    });
  };
  return (
    <StyledDeliveryCard>
      <form onSubmit={submit}>
        <StyledDeliveryStack>
          <h3>{initial ? t`Edit engagement` : t`New client engagement`}</h3>
          <label>
            <Trans>Project</Trans>
            <select
              name="projectId"
              required
              disabled={Boolean(initial)}
              defaultValue={initial?.projectId ?? ''}
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
              defaultValue={initial?.name}
              maxLength={6000}
            />
          </label>
          <label>
            <Trans>Services, separated by commas</Trans>
            <input
              name="services"
              required
              defaultValue={initial?.services.join(', ')}
            />
          </label>
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
          <fieldset>
            <legend>
              <Trans>Performance marketing portal</Trans>
            </legend>
            <label>
              <input
                type="checkbox"
                name="advertising"
                defaultChecked={Boolean(initial?.advertising)}
              />
              <Trans>Enable client advertising budget requests</Trans>
            </label>
            <p>
              <Trans>
                Enable only for performance marketing engagements. This does not
                change the agency retainer.
              </Trans>
            </p>
            <label>
              <Trans>Advertising project manager</Trans>
              <select
                name="advertisingManager"
                defaultValue={initial?.advertising?.managerId ?? ''}
              >
                <option value="">{t`Choose a manager`}</option>
                {workspace.members
                  .filter((member) => member.access !== 'MEMBER')
                  .map((member) => (
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
                defaultValue={initial?.advertising?.marketerId ?? ''}
              >
                <option value="">{t`Choose a project member`}</option>
                {workspace.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Trans>Advertising currency</Trans>
              <select
                name="advertisingCurrency"
                defaultValue={initial?.advertising?.currency ?? 'USD'}
              >
                {['USD', 'AED', 'EUR', 'GBP', 'INR', 'SGD', 'AUD', 'CAD'].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
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
          </fieldset>
          <label>
            <Trans>Client-visible scope</Trans>
            <textarea
              name="scope"
              required
              maxLength={6000}
              defaultValue={initial?.scope}
            />
          </label>
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
          <h3>
            <Trans>Onboarding questions</Trans>
          </h3>
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
                  setFields(fields.filter((_, position) => position !== index))
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
          <StyledDeliveryRow>
            <StyledDeliveryButton
              disabled={busy}
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
      </form>
    </StyledDeliveryCard>
  );
};
