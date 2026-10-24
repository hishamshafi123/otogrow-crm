import { useState, type FormEvent } from 'react';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  StyledDeliveryCard,
  StyledDeliveryStack,
  StyledDeliveryRow,
  StyledDeliveryButton,
} from '@/delivery/deliveryStyles';
const GET_META = gql`
  query DeliveryMeta {
    deliveryMeta
  }
`;
const CHANGE_META = gql`
  mutation ChangeDeliveryMeta($input: JSON!) {
    changeDeliveryMeta(input: $input)
  }
`;
type InsightRow = {
  spend: string;
  impressions: string;
  clicks: string;
  ad_id?: string;
  ad_name?: string;
  campaign_name?: string;
  actions: { action_type: string; value: string }[];
};
type MetaConnection = {
  accountId: string;
  revision: number;
  name: string;
  currency: string;
  timezone: string;
  projectId: string | null;
  managerId: string | null;
  marketerId: string | null;
  time: string;
  enabled: boolean;
  running: boolean;
  lastSuccessAt: string | null;
  error: string | null;
};
type MetaReport = {
  id: string;
  accountId: string;
  date: string;
  currency: string;
  timezone: string;
  fetchedAt: string;
  account: InsightRow | null;
  ads: InsightRow[];
  status: string;
  managerId: string | null;
  marketerId: string | null;
  projectId: string | null;
  note: string;
  taskId: string | null;
};
type MetaSnapshot = {
  connections: MetaConnection[];
  reports: MetaReport[];
  workerSeenAt: string | null;
};
type DeliveryMetaProps = {
  workspace: DeliveryWorkspace;
  onChanged: () => Promise<unknown>;
  onOpenTask: (id: string) => void;
};
export const DeliveryMeta = ({
  workspace,
  onChanged,
  onOpenTask,
}: DeliveryMetaProps) => {
  const { t } = useLingui();
  const query = useQuery<{ deliveryMeta: MetaSnapshot }>(GET_META, {
    fetchPolicy: 'network-only',
    pollInterval: 30000,
  });
  const [mutate, mutation] = useMutation(CHANGE_META);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<MetaConnection | null | undefined>(
    undefined,
  );
  const [expanded, setExpanded] = useState('');
  const run = async (input: Record<string, unknown>) => {
    setError('');
    try {
      await mutate({ variables: { input } });
      await query.refetch();
      await onChanged();
      return true;
    } catch {
      setError(
        t`Could not complete the reporting action. Refresh and check connection status, staff assignments and access.`,
      );
      await query.refetch();
      return false;
    }
  };
  const data = query.data?.deliveryMeta;
  const money = (amount: string, currency: string) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
      Number(amount),
    );
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>
            <Trans>Live Meta reporting</Trans>
          </h3>
          {workspace.actor.isAdmin && (
            <StyledDeliveryButton onClick={() => setEditing(null)}>
              <Trans>Connect Meta account</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryRow>
        <p>
          <Trans>
            Read-only imports of yesterday’s account and ad performance, using
            the Meta account timezone and attribution settings. The manager
            reviews each report before it reaches the marketer.
          </Trans>
        </p>
        {query.loading && !data && (
          <p>
            <Trans>Loading connections…</Trans>
          </p>
        )}
        {(error || query.error) && (
          <p role="alert">
            {error || t`Reporting connection could not be loaded.`}
          </p>
        )}
        {workspace.actor.isAdmin && (
          <small>
            {data?.workerSeenAt
              ? t`Scheduler last checked: ${new Date(data.workerSeenAt).toLocaleString()}`
              : t`Scheduler heartbeat has not been recorded yet. An always-running server is required.`}
          </small>
        )}
        {data?.connections.map((connection) => (
          <StyledDeliveryCard key={connection.accountId}>
            <StyledDeliveryStack>
              <strong>
                {connection.name} · {connection.accountId}
              </strong>
              <span>
                {connection.currency} · {connection.timezone} ·{' '}
                {connection.time} ·{' '}
                {connection.enabled
                  ? t`Daily reports enabled`
                  : t`Automatic reports off`}
              </span>
              <small>
                {connection.lastSuccessAt
                  ? t`Last successful import: ${new Date(connection.lastSuccessAt).toLocaleString()}`
                  : t`No performance import yet`}
              </small>
              {connection.error && <p role="alert">{connection.error}</p>}
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  disabled={mutation.loading || connection.running}
                  onClick={() =>
                    void run({
                      action: 'sync',
                      accountId: connection.accountId,
                    })
                  }
                >
                  {connection.running
                    ? t`Import running…`
                    : t`Import yesterday`}
                </StyledDeliveryButton>
                <StyledDeliveryButton onClick={() => setEditing(connection)}>
                  <Trans>Edit connection</Trans>
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  disabled={mutation.loading}
                  onClick={() =>
                    void run({
                      action: 'disconnect',
                      accountId: connection.accountId,
                      revision: connection.revision,
                    })
                  }
                >
                  <Trans>Disconnect and remove saved token</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            </StyledDeliveryStack>
          </StyledDeliveryCard>
        ))}
        {editing !== undefined && (
          <MetaConnectionForm
            key={editing?.accountId ?? 'new'}
            initial={editing}
            workspace={workspace}
            busy={mutation.loading}
            onCancel={() => setEditing(undefined)}
            onSave={async (configuration) => {
              if (await run({ action: 'connect', configuration }))
                setEditing(undefined);
            }}
          />
        )}
        <h4>
          <Trans>Imported reports</Trans>
        </h4>
        {!data?.reports.length && (
          <p>
            <Trans>
              No imported reports yet. Manual reports are listed separately
              below.
            </Trans>
          </p>
        )}
        {data?.reports
          .slice()
          .reverse()
          .map((report) => (
            <StyledDeliveryCard key={report.id}>
              <StyledDeliveryStack>
                <StyledDeliveryRow>
                  <strong>
                    {report.date} · {report.accountId}
                  </strong>
                  <span>
                    {report.status === 'REVIEW'
                      ? t`Awaiting manager review`
                      : report.status === 'APPROVED'
                        ? t`Approved`
                        : t`Changes requested`}
                  </span>
                </StyledDeliveryRow>
                <small>
                  {t`Fetched`}: {new Date(report.fetchedAt).toLocaleString()} ·{' '}
                  {report.timezone}
                </small>
                {report.account ? (
                  <p>
                    {t`Spend`}: {money(report.account.spend, report.currency)} ·{' '}
                    {t`Impressions`}: {report.account.impressions} · {t`Clicks`}
                    : {report.account.clicks}
                  </p>
                ) : (
                  <p>
                    <Trans>
                      Meta returned no account activity for this date. This is
                      an empty report, not an authentication failure.
                    </Trans>
                  </p>
                )}
                <small>
                  <Trans>
                    Meta lead events are not qualified leads. Different action
                    types may overlap and must not be added together.
                  </Trans>
                </small>
                <StyledDeliveryButton
                  onClick={() =>
                    setExpanded(expanded === report.id ? '' : report.id)
                  }
                >
                  {expanded === report.id
                    ? t`Hide ad details`
                    : t`Show ad details and events`}
                </StyledDeliveryButton>
                {expanded === report.id && (
                  <StyledDeliveryStack>
                    {report.account?.actions.map((action) => (
                      <small key={action.action_type}>
                        {action.action_type}: {action.value}
                      </small>
                    ))}
                    {report.ads.map((ad) => (
                      <div key={ad.ad_id}>
                        <strong>{ad.ad_name}</strong>
                        <p>
                          {ad.campaign_name} ·{' '}
                          {money(ad.spend, report.currency)} · {ad.impressions}{' '}
                          {t`impressions`} · {ad.clicks} {t`clicks`}
                        </p>
                        {ad.actions.map((action) => (
                          <small key={action.action_type}>
                            {action.action_type}: {action.value} ·{' '}
                          </small>
                        ))}
                      </div>
                    ))}
                  </StyledDeliveryStack>
                )}
                {report.status === 'REVIEW' &&
                  report.marketerId !== workspace.actor.memberId &&
                  (workspace.actor.isAdmin ||
                    (workspace.actor.isManager &&
                      report.managerId === workspace.actor.memberId)) && (
                    <form
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const fields = new FormData(event.currentTarget);
                        await run({
                          action: 'review',
                          id: report.id,
                          status: fields.get('status'),
                          note: fields.get('note'),
                        });
                      }}
                    >
                      <StyledDeliveryStack>
                        <label>
                          <Trans>Recommendations for the marketer</Trans>
                          <textarea name="note" required maxLength={2000} />
                        </label>
                        <label>
                          <Trans>Report decision</Trans>
                          <select name="status">
                            <option value="APPROVED">{t`Approve and assign follow-up`}</option>
                            <option value="CHANGES_REQUESTED">{t`Request changes`}</option>
                          </select>
                        </label>
                        {!report.projectId && (
                          <p>
                            <Trans>
                              Configure the project and staff, then reimport
                              this report before approval.
                            </Trans>
                          </p>
                        )}
                        <StyledDeliveryButton
                          disabled={mutation.loading}
                          type="submit"
                        >
                          <Trans>Save report decision</Trans>
                        </StyledDeliveryButton>
                      </StyledDeliveryStack>
                    </form>
                  )}
                {report.note && <p>{report.note}</p>}
                {report.taskId && (
                  <StyledDeliveryButton
                    onClick={() => onOpenTask(report.taskId!)}
                  >
                    <Trans>Open assigned follow-up</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          ))}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
type MetaConnectionFormProps = {
  initial: MetaConnection | null;
  workspace: DeliveryWorkspace;
  busy: boolean;
  onCancel: () => void;
  onSave: (configuration: Record<string, unknown>) => Promise<void>;
};
const MetaConnectionForm = ({
  initial,
  workspace,
  busy,
  onCancel,
  onSave,
}: MetaConnectionFormProps) => {
  const { t } = useLingui();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const token = String(fields.get('token') ?? '').trim();
    void onSave({
      accountId: initial?.accountId ?? fields.get('accountId'),
      revision: initial?.revision ?? 0,
      ...(token ? { token } : {}),
      projectId: fields.get('projectId') || null,
      managerId: fields.get('managerId') || null,
      marketerId: fields.get('marketerId') || null,
      time: fields.get('time'),
      enabled: fields.get('enabled') === 'on',
    });
  };
  return (
    <form onSubmit={submit}>
      <StyledDeliveryStack>
        <label>
          <Trans>Meta ad-account ID</Trans>
          <input
            name="accountId"
            required
            pattern="[0-9]{5,30}"
            defaultValue={initial?.accountId ?? ''}
            readOnly={Boolean(initial)}
          />
        </label>
        <label>
          <Trans>Reporting access token</Trans>
          <input
            name="token"
            type="password"
            autoComplete="new-password"
            required={!initial}
            maxLength={4096}
          />
        </label>
        <small>
          <Trans>
            Stored encrypted on the server. Leave blank when editing to retain
            the existing token.
          </Trans>
        </small>
        <label>
          <Trans>Reporting project</Trans>
          <select name="projectId" defaultValue={initial?.projectId ?? ''}>
            <option value="">{t`Not assigned`}</option>
            {workspace.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Trans>Report project manager</Trans>
          <select name="managerId" defaultValue={initial?.managerId ?? ''}>
            <option value="">{t`Not assigned`}</option>
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
          <Trans>Report marketer</Trans>
          <select name="marketerId" defaultValue={initial?.marketerId ?? ''}>
            <option value="">{t`Not assigned`}</option>
            {workspace.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Trans>Daily reporting time in the ad-account timezone</Trans>
          <input
            name="time"
            type="time"
            required
            defaultValue={initial?.time ?? '06:00'}
          />
        </label>
        <label>
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={initial?.enabled ?? false}
          />
          <Trans>Enable daily reporting</Trans>
        </label>
        <StyledDeliveryRow>
          <StyledDeliveryButton disabled={busy} type="submit">
            <Trans>Test and save connection</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton type="button" onClick={onCancel}>
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </form>
  );
};
