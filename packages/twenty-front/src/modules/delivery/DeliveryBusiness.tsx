import { DeliveryMeta } from '@/delivery/DeliveryMeta';
import { type DeliveryAgentsSnapshot } from '@/delivery/delivery-agent.types';
import { useState, type FormEvent } from 'react';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  type AdvertisingInsight,
  type BusinessKind,
  type BusinessRecord,
  type BusinessSnapshot,
} from '@/delivery/delivery-business.types';
import {
  StyledDeliveryStack,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryGrid,
  StyledDeliveryButton,
  StyledDeliveryBadge,
} from '@/delivery/deliveryStyles';

const GET_BUSINESS = gql`
  query DeliveryBusiness {
    deliveryBusiness
  }
`;
const CHANGE_BUSINESS = gql`
  mutation ChangeDeliveryBusiness($input: JSON!) {
    changeDeliveryBusiness(input: $input)
  }
`;
const VIEW_KINDS: Record<string, BusinessKind[]> = {
  inbox: ['CONVERSATION'],
  ads: ['AD_REPORT', 'BUDGET'],
  finance: ['FINANCE'],
  content: ['CONTENT'],
  competitors: ['COMPETITOR'],
  development: ['RELEASE'],
  health: [],
};
const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
    amount / 100,
  );
const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  return `"${(/^(?:\s*[=+@-]|[\t\r\n])/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`;
};
type DeliveryBusinessProps = {
  workspace: DeliveryWorkspace;
  view: string;
  onChanged: () => Promise<unknown>;
  onOpenTask: (id: string) => void;
};
export const DeliveryBusiness = ({
  workspace,
  view,
  onChanged,
  onOpenTask,
}: DeliveryBusinessProps) => {
  const { t } = useLingui();
  const query = useQuery<{ deliveryBusiness: BusinessSnapshot }>(GET_BUSINESS, {
    fetchPolicy: 'network-only',
    pollInterval: 30000,
  });
  const [mutate, mutation] = useMutation(CHANGE_BUSINESS);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{
    kind: BusinessKind;
    record?: BusinessRecord;
  } | null>(null);
  const [selected, setSelected] = useState('');
  const data = query.data?.deliveryBusiness;
  const connectionLabels: Record<string, string> = {
    EMAIL: t`Email`,
    SLACK: t`Slack`,
    WHATSAPP: t`WhatsApp`,
    META_SHOPIFY: t`Meta and Shopify`,
    META: t`Meta reporting`,
    SHOPIFY: t`Shopify`,
    SOCIAL_PUBLISHING: t`Social publishing`,
  };
  const labels: Record<string, string> = {
    CONVERSATION: t`Conversation`,
    AD_REPORT: t`Advertising report`,
    BUDGET: t`Advertising budget request`,
    FINANCE: t`Financial entry`,
    CONTENT: t`Content item`,
    COMPETITOR: t`Competitor finding`,
    RELEASE: t`Release`,
    DRAFT: t`Draft`,
    POSTED: t`Recorded`,
    OPEN: t`Awaiting payment`,
    REVIEW: t`Awaiting review`,
    APPROVED: t`Approved`,
    CHANGES_REQUESTED: t`Changes requested`,
    APPLIED: t`Applied — awaiting verification`,
    VERIFIED: t`Verified`,
    PUBLISHED: t`Publication recorded`,
    RELEASED: t`Release recorded`,
    PAID: t`Payment confirmed`,
    VOID: t`Voided`,
  };
  const run = async (input: Record<string, unknown>) => {
    setError('');
    try {
      await mutate({ variables: { input } });
      await query.refetch();
      await onChanged();
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Could not save this record.`,
      );
      return false;
    }
  };
  const records = (data?.records ?? []).filter((record) =>
    VIEW_KINDS[view]?.includes(record.kind),
  );
  const item = records.find((record) => record.id === selected);
  const canDraft =
    item?.kind === 'CONVERSATION' &&
    (!item.private || item.ownerId === workspace.actor.memberId) &&
    (workspace.actor.isAdmin ||
      item.ownerId === workspace.actor.memberId ||
      (Array.isArray(item.grants) &&
        item.grants.some(
          (grant: { memberId: string; read: boolean; send: boolean }) =>
            grant.memberId === workspace.actor.memberId &&
            grant.read &&
            grant.send,
        )));
  const exportFinance = () => {
    const headings = [
      'id',
      'category',
      'title',
      'currency',
      'amount',
      'date',
      'dueDate',
      'projectId',
      'externalReference',
      'evidenceUrl',
      'status',
    ];
    const csv = [
      headings.map(csvCell).join(','),
      ...records.map((record) =>
        headings
          .map((key) =>
            csvCell(
              key === 'amount' ? Number(record.amount) / 100 : record[key],
            ),
          )
          .join(','),
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'otogrow-finance.csv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (query.loading && !data)
    return (
      <StyledDeliveryCard>
        <Trans>Loading business workspace…</Trans>
      </StyledDeliveryCard>
    );
  if (query.error && !data) return <p role="alert">{query.error.message}</p>;
  return (
    <StyledDeliveryStack>
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <h2>
              {view === 'inbox'
                ? t`Client conversations`
                : view === 'ads'
                  ? t`Advertising decisions`
                  : view === 'finance'
                    ? t`Cash and client economics`
                    : view === 'content'
                      ? t`Your content engine`
                      : view === 'competitors'
                        ? t`Competitor research`
                        : view === 'development'
                          ? t`Build and release`
                          : t`Founder overview`}
            </h2>
            <StyledDeliveryRow>
              {VIEW_KINDS[view]
                ?.filter(
                  (kind) =>
                    !['FINANCE', 'CONVERSATION'].includes(kind) ||
                    workspace.actor.isAdmin,
                )
                .map((kind) => (
                  <StyledDeliveryButton
                    key={kind}
                    onClick={() => setEditing({ kind })}
                  >
                    {t`New`} {labels[kind]}
                  </StyledDeliveryButton>
                ))}
              {view === 'finance' && workspace.actor.isAdmin && (
                <StyledDeliveryButton onClick={exportFinance}>
                  <Trans>Export CSV</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          </StyledDeliveryRow>
          {['inbox', 'content', 'competitors'].includes(view) && (
            <p>
              <Trans>
                Connections are not configured. Records and drafts stay inside
                the OS. No messages, ad changes or social posts are sent from
                these controls.
              </Trans>
            </p>
          )}
          {view === 'inbox' && (
            <p>
              <Trans>
                Record selected client conversations and prepare replies. Grants
                apply to this conversation only; project membership does not
                grant inbox access. Imported notes are labeled separately from
                provider-synced messages.
              </Trans>
            </p>
          )}
          {view === 'ads' && (
            <p>
              <Trans>
                Record source evidence, review recommendations, then assign
                follow-up. Marketers apply budget changes in the ad platform; a
                separate manager verifies them.
              </Trans>
            </p>
          )}
          {view === 'finance' && (
            <p>
              <Trans>
                Cash basis, separated by currency. Record opening cash,
                receipts, expenses and allocated salary costs. Receivables are
                excluded from cash until payment is confirmed.
                Advertising-platform spend stays separate from agency expenses.
              </Trans>
            </p>
          )}
        </StyledDeliveryStack>
      </StyledDeliveryCard>
      {(error || query.error) && (
        <p role="alert">{error || query.error?.message}</p>
      )}
      {view === 'ads' && (
        <DeliveryMeta
          workspace={workspace}
          onChanged={onChanged}
          onOpenTask={onOpenTask}
        />
      )}
      {view === 'finance' &&
        data?.finance.map((summary) => (
          <StyledDeliveryCard key={summary.currency}>
            <StyledDeliveryStack>
              <h3>{summary.currency}</h3>
              <StyledDeliveryGrid>
                {[
                  [t`Cash`, summary.cash],
                  [t`Receivables`, summary.receivables],
                  [t`Overdue`, summary.overdue],
                  [t`Receipts · last 30 days`, summary.income30],
                  [t`Costs · last 30 days`, summary.expense30],
                  [t`Net cash burn · last 30 days`, summary.netBurn],
                ].map(([label, amount]) => (
                  <div key={String(label)}>
                    <small>{label}</small>
                    <h2>{formatMoney(Number(amount), summary.currency)}</h2>
                  </div>
                ))}
              </StyledDeliveryGrid>
              <p>
                <Trans>Runway</Trans>:{' '}
                {summary.runwayMonths === null
                  ? t`No net cash burn in this period`
                  : t`${summary.runwayMonths.toFixed(1)} months`}
              </p>
              <p>
                <Trans>Receipts growth</Trans>:{' '}
                {summary.revenueGrowth === null
                  ? '—'
                  : `${(summary.revenueGrowth * 100).toFixed(1)}%`}{' '}
                · <Trans>Spending growth</Trans>:{' '}
                {summary.spendingGrowth === null
                  ? '—'
                  : `${(summary.spendingGrowth * 100).toFixed(1)}%`}
              </p>
              {summary.projects.map((project) => (
                <div key={project.projectId ?? 'shared'}>
                  <strong>
                    {workspace.projects.find(
                      (candidate) => candidate.id === project.projectId,
                    )?.name ?? t`Shared / unallocated`}
                  </strong>
                  <p>
                    {t`Cash contribution`}:{' '}
                    {formatMoney(project.cashContribution, summary.currency)} ·{' '}
                    {t`Margin`}:{' '}
                    {project.margin === null
                      ? '—'
                      : `${(project.margin * 100).toFixed(1)}%`}
                  </p>
                </div>
              ))}
            </StyledDeliveryStack>
          </StyledDeliveryCard>
        ))}
      {view === 'health' && (
        <>
          <StyledDeliveryGrid>
            {[
              [
                t`Late work`,
                workspace.tasks.filter(
                  (task) =>
                    task.dueAt &&
                    Date.parse(task.dueAt) < Date.now() &&
                    task.details.state !== 'APPROVED',
                ).length,
              ],
              [
                t`Blocked work`,
                workspace.tasks.filter(
                  (task) => task.details.state === 'BLOCKED',
                ).length,
              ],
              [
                t`Work awaiting review`,
                workspace.tasks.filter(
                  (task) => task.details.state === 'IN_REVIEW',
                ).length,
              ],
              [
                t`Business reviews`,
                data?.records.filter((record) => record.status === 'REVIEW')
                  .length ?? 0,
              ],
            ].map(([label, count]) => (
              <StyledDeliveryCard key={String(label)}>
                <small>{label}</small>
                <h2>{count}</h2>
              </StyledDeliveryCard>
            ))}
          </StyledDeliveryGrid>
          <StyledDeliveryCard>
            <StyledDeliveryStack>
              <h3>
                <Trans>Connection readiness</Trans>
              </h3>
              {data?.connections.map((connection) => (
                <StyledDeliveryRow key={connection.channel}>
                  <strong>
                    {connectionLabels[connection.channel] ?? connection.channel}
                  </strong>
                  <span>
                    {connection.status === 'CONNECTED'
                      ? t`Connected`
                      : connection.status === 'GROUP_SUPPORT_UNVERIFIED'
                        ? t`Existing group support needs verification`
                        : t`Account setup needed`}
                  </span>
                </StyledDeliveryRow>
              ))}
              <p>
                <Trans>
                  Production deployment, backup restoration and live provider
                  acceptance remain required before rollout.
                </Trans>
              </p>
            </StyledDeliveryStack>
          </StyledDeliveryCard>
        </>
      )}
      {editing && (
        <BusinessForm
          key={editing.record?.id ?? editing.kind}
          workspace={workspace}
          kind={editing.kind}
          initial={editing.record}
          busy={mutation.loading}
          onCancel={() => setEditing(null)}
          onSave={async (record) => {
            if (await run({ action: 'save', record })) setEditing(null);
          }}
        />
      )}
      <StyledDeliveryGrid>
        {records.map((record) => (
          <StyledDeliveryCard key={record.id}>
            <StyledDeliveryStack>
              <StyledDeliveryRow>
                <strong>{record.title}</strong>
                <StyledDeliveryBadge>
                  {labels[record.status] ?? record.status}
                </StyledDeliveryBadge>
              </StyledDeliveryRow>
              <small>
                {labels[record.kind]} ·{' '}
                {workspace.projects.find(
                  (project) => project.id === record.projectId,
                )?.name ?? t`Company-wide`}
              </small>
              {record.kind === 'AD_REPORT' && (
                <>
                  <p>
                    {formatMoney(Number(record.spend), String(record.currency))}{' '}
                    · {t`Ad-attributed revenue`}:{' '}
                    {formatMoney(
                      Number(record.attributedRevenue),
                      String(record.currency),
                    )}
                  </p>
                  <p>
                    {t`Shopify observed revenue`}:{' '}
                    {record.shopifyRevenue === null
                      ? t`Not supplied`
                      : formatMoney(
                          Number(record.shopifyRevenue),
                          String(record.currency),
                        )}
                  </p>
                  <AdvertisingMetrics
                    insight={data?.advertising?.find(
                      (insight) => insight.id === record.id,
                    )}
                    currency={String(record.currency)}
                  />
                  <p>{String(record.recommendation)}</p>
                </>
              )}
              {['FINANCE', 'BUDGET'].includes(record.kind) && (
                <h3>
                  {formatMoney(Number(record.amount), String(record.currency))}
                </h3>
              )}
              {record.kind === 'CONTENT' && <p>{String(record.copy)}</p>}
              {record.kind === 'COMPETITOR' && (
                <>
                  <p>{String(record.observation)}</p>
                  <small>
                    <Trans>Interpretation</Trans>:{' '}
                    {String(record.interpretation)}
                  </small>
                </>
              )}
              {record.kind === 'CONVERSATION' && (
                <small>
                  {record.private
                    ? t`Private to owner`
                    : t`Explicit staff access`}{' '}
                  ·{' '}
                  {data?.inbox.filter(
                    (entry) =>
                      entry.conversationId === record.id &&
                      entry.createdAt > (data.seen[record.id] ?? ''),
                  ).length ?? 0}{' '}
                  {t`unread entries`}
                </small>
              )}
              <StyledDeliveryButton onClick={() => setSelected(record.id)}>
                <Trans>Open details</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryStack>
          </StyledDeliveryCard>
        ))}
      </StyledDeliveryGrid>
      {view !== 'health' && !records.length && (
        <p>
          <Trans>
            No records yet. Add the first item to start this workflow.
          </Trans>
        </p>
      )}
      {item && (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <StyledDeliveryRow>
              <h2>{item.title}</h2>
              <StyledDeliveryButton onClick={() => setSelected('')}>
                <Trans>Close details</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
            <p>
              {labels[item.status]} · {t`Version`} {item.revision}
            </p>
            {item.kind === 'CONVERSATION' ? (
              <>
                <StyledDeliveryButton
                  disabled={mutation.loading}
                  onClick={() => void run({ action: 'seen', id: item.id })}
                >
                  <Trans>Mark seen</Trans>
                </StyledDeliveryButton>
                {data?.inbox
                  .filter((entry) => entry.conversationId === item.id)
                  .map((entry) => (
                    <div key={entry.id}>
                      <small>
                        {entry.kind === 'DRAFT'
                          ? t`Unsent draft`
                          : t`Manually recorded inbound note`}{' '}
                        · {new Date(entry.createdAt).toLocaleString()}
                      </small>
                      <p
                        style={{
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {entry.text}
                      </p>
                      {entry.sourceIds.length > 0 && (
                        <small>
                          <Trans>AI source notes</Trans>:{' '}
                          {entry.sourceIds
                            .map(
                              (id) =>
                                data.inbox
                                  .find((source) => source.id === id)
                                  ?.text.slice(0, 80) ?? t`Source unavailable`,
                            )
                            .join(' · ')}
                        </small>
                      )}
                    </div>
                  ))}
                {canDraft ? (
                  <>
                    {' '}
                    <InboxAgentForm
                      record={item}
                      sources={(data?.inbox ?? []).filter(
                        (entry) =>
                          entry.conversationId === item.id &&
                          entry.kind === 'INBOUND_NOTE',
                      )}
                      busy={mutation.loading}
                      run={run}
                    />
                    <InboxForm
                      key={`${item.id}:${item.revision}`}
                      initialText={
                        (data?.inbox ?? [])
                          .filter(
                            (entry) =>
                              entry.conversationId === item.id &&
                              entry.kind === 'DRAFT',
                          )
                          .slice(-1)[0]?.text ?? ''
                      }
                      record={item}
                      admin={workspace.actor.isAdmin}
                      busy={mutation.loading}
                      run={run}
                    />
                  </>
                ) : (
                  <p>
                    <Trans>
                      You have view-only access to this conversation.
                    </Trans>
                  </p>
                )}
              </>
            ) : (
              <RecordActions
                record={item}
                workspace={workspace}
                busy={mutation.loading}
                run={run}
              />
            )}
            {(item.kind === 'CONVERSATION'
              ? workspace.actor.isAdmin
              : item.kind !== 'FINANCE' &&
                ['DRAFT', 'CHANGES_REQUESTED'].includes(item.status)) && (
              <StyledDeliveryButton
                onClick={() => setEditing({ kind: item.kind, record: item })}
              >
                <Trans>Edit</Trans>
              </StyledDeliveryButton>
            )}
            {item.taskId && (
              <StyledDeliveryButton onClick={() => onOpenTask(item.taskId!)}>
                <Trans>Open assigned task</Trans>
              </StyledDeliveryButton>
            )}
            <details>
              <summary>{t`Audit history`}</summary>
              {item.history.map((event, index) => (
                <p key={index}>
                  {new Date(event.at).toLocaleString()} ·{' '}
                  {labels[event.action] ?? event.action} · {event.note}
                </p>
              ))}
            </details>
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}
    </StyledDeliveryStack>
  );
};

type Runner = (input: Record<string, unknown>) => Promise<boolean>;
const GET_REPLY_AGENTS = gql`
  query InboxReplyAgents {
    deliveryAgents
  }
`;
const InboxAgentForm = ({
  record,
  sources,
  busy,
  run,
}: {
  record: BusinessRecord;
  sources: BusinessSnapshot['inbox'];
  busy: boolean;
  run: Runner;
}) => {
  const { t } = useLingui();
  const query = useQuery<{ deliveryAgents: DeliveryAgentsSnapshot }>(
    GET_REPLY_AGENTS,
    { fetchPolicy: 'network-only' },
  );
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void run({
          action: 'aiDraft',
          id: record.id,
          revision: record.revision,
          agentId: form.get('agentId'),
          sourceIds,
        });
      }}
    >
      <StyledDeliveryStack>
        <h3>
          <Trans>Prepare a reply with AI</Trans>
        </h3>
        <p>
          <Trans>
            Only the selected conversation notes are sent to the configured
            model. Review and edit the draft before using it. Nothing is sent to
            the client.
          </Trans>
        </p>
        <label>
          <Trans>Copy agent</Trans>
          <select name="agentId" required>
            <option value="">{t`Choose an enabled agent`}</option>
            {query.data?.deliveryAgents.agents
              .filter(
                (agent) =>
                  agent.configuration.kind === 'COPY' &&
                  agent.configuration.enabled &&
                  agent.configuration.projectIds.includes(
                    record.projectId ?? '',
                  ),
              )
              .map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.configuration.name}
                </option>
              ))}
          </select>
        </label>
        {sources.map((source) => (
          <label key={source.id}>
            <input
              type="checkbox"
              checked={sourceIds.includes(source.id)}
              onChange={(event) =>
                setSourceIds(
                  event.target.checked
                    ? [...sourceIds, source.id]
                    : sourceIds.filter((id) => id !== source.id),
                )
              }
            />
            {source.text.slice(0, 200)}
          </label>
        ))}
        <StyledDeliveryButton
          disabled={busy || !sourceIds.length || sourceIds.length > 20}
        >
          <Trans>Generate unsent reply draft</Trans>
        </StyledDeliveryButton>
        {query.error && <p role="alert">{query.error.message}</p>}
      </StyledDeliveryStack>
    </form>
  );
};
const InboxForm = ({
  record,
  admin,
  busy,
  run,
  initialText,
}: {
  initialText: string;
  record: BusinessRecord;
  admin: boolean;
  busy: boolean;
  run: Runner;
}) => {
  const { t } = useLingui();
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        if (
          await run({
            action: 'inboxEntry',
            id: record.id,
            revision: record.revision,
            entryKind: data.get('kind'),
            text: data.get('text'),
            sourceUrl: data.get('sourceUrl') || null,
          })
        )
          form.reset();
      }}
    >
      <StyledDeliveryStack>
        <label>
          <Trans>Entry type</Trans>
          <select name="kind">
            <option value="DRAFT">{t`Reply draft — not sent`}</option>
            {admin && (
              <option value="INBOUND_NOTE">{t`Record an inbound note manually`}</option>
            )}
          </select>
        </label>
        <label>
          <Trans>Message</Trans>
          <textarea
            required
            name="text"
            maxLength={12000}
            defaultValue={initialText}
          />
        </label>
        <label>
          <Trans>Source link (optional)</Trans>
          <input type="url" name="sourceUrl" />
        </label>
        <StyledDeliveryButton disabled={busy}>
          <Trans>Save inside OS</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
const RecordActions = ({
  record,
  workspace,
  busy,
  run,
}: {
  record: BusinessRecord;
  workspace: DeliveryWorkspace;
  busy: boolean;
  run: Runner;
}) => {
  const { t } = useLingui();
  const states = (
    record.kind === 'FINANCE'
      ? [
          ['PAID', t`Confirm payment`],
          ['VOID', t`Void entry`],
        ]
      : [
          ['REVIEW', t`Submit for review`],
          ['APPROVED', t`Approve`],
          ['CHANGES_REQUESTED', t`Request changes`],
          ...(record.kind === 'BUDGET'
            ? [
                ['APPLIED', t`Record platform change`],
                ['VERIFIED', t`Verify platform change`],
              ]
            : record.kind === 'CONTENT'
              ? [['PUBLISHED', t`Record published link`]]
              : record.kind === 'RELEASE'
                ? [['RELEASED', t`Record release`]]
                : []),
        ]
  ).filter(([status]) => {
    const actor = workspace.actor;
    if (status === 'VOID') return actor.isAdmin && record.status !== 'VOID';
    if (status === 'PAID')
      return (
        actor.isAdmin &&
        record.category === 'RECEIVABLE' &&
        !['PAID', 'VOID'].includes(record.status)
      );
    if (status === 'REVIEW')
      return (
        ['DRAFT', 'CHANGES_REQUESTED'].includes(record.status) &&
        (actor.isManager ||
          record.createdBy === actor.memberId ||
          record.ownerId === actor.memberId ||
          record.marketerId === actor.memberId)
      );
    if (['APPROVED', 'CHANGES_REQUESTED'].includes(status))
      return (
        actor.isManager &&
        record.status === 'REVIEW' &&
        record.createdBy !== actor.memberId &&
        record.ownerId !== actor.memberId &&
        record.marketerId !== actor.memberId
      );
    if (status === 'APPLIED')
      return (
        record.status === 'APPROVED' && record.marketerId === actor.memberId
      );
    if (status === 'VERIFIED')
      return (
        record.status === 'APPLIED' &&
        actor.isManager &&
        record.marketerId !== actor.memberId
      );
    if (status === 'PUBLISHED')
      return (
        record.status === 'APPROVED' &&
        (actor.isManager || record.ownerId === actor.memberId)
      );
    return (
      record.status === 'APPROVED' &&
      actor.isManager &&
      record.ownerId !== actor.memberId
    );
  });
  return (
    <>
      {states.length > 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void run({
              action: 'transition',
              id: record.id,
              revision: record.revision,
              status: data.get('status'),
              note: data.get('note'),
              evidence: data.get('evidence') || null,
            });
          }}
        >
          <StyledDeliveryStack>
            <label>
              <Trans>Next action</Trans>
              <select name="status">
                {states.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Trans>Reason / review notes</Trans>
              <textarea required name="note" maxLength={240} />
            </label>
            <label>
              <Trans>Evidence link</Trans>
              <input type="url" name="evidence" />
            </label>
            <StyledDeliveryButton disabled={busy}>
              <Trans>Record decision</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </form>
      )}
      {workspace.actor.isManager &&
        !record.taskId &&
        record.kind !== 'FINANCE' &&
        (record.kind !== 'AD_REPORT' || record.status === 'APPROVED') && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run({
                action: 'assign',
                id: record.id,
                revision: record.revision,
                assigneeId: data.get('assigneeId'),
                reviewerId: data.get('reviewerId'),
                dueDate: data.get('dueDate'),
              });
            }}
          >
            <StyledDeliveryStack>
              <h3>
                <Trans>Assign follow-up</Trans>
              </h3>
              <label>
                <Trans>Task owner</Trans>
                <select name="assigneeId" required>
                  <option value="">{t`Choose a person`}</option>
                  {workspace.members
                    .filter((member) =>
                      workspace.projects
                        .find((project) => project.id === record.projectId)
                        ?.memberIds.includes(member.id),
                    )
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <Trans>Reviewer</Trans>
                <select required name="reviewerId">
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
                <Trans>Due date</Trans>
                <input type="date" required name="dueDate" />
              </label>
              <StyledDeliveryButton disabled={busy}>
                <Trans>Create follow-up task</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryStack>
          </form>
        )}
    </>
  );
};

type BusinessFormProps = {
  workspace: DeliveryWorkspace;
  kind: BusinessKind;
  initial?: BusinessRecord;
  busy: boolean;
  onCancel: () => void;
  onSave: (record: Record<string, unknown>) => Promise<void>;
};
const BusinessForm = ({
  workspace,
  kind,
  initial,
  busy,
  onCancel,
  onSave,
}: BusinessFormProps) => {
  const { t } = useLingui();
  const [grants, setGrants] = useState(
    (initial?.grants ?? []) as {
      memberId: string;
      read: boolean;
      send: boolean;
    }[],
  );
  const [checks, setChecks] = useState(
    (initial?.checks ??
      [
        t`Acceptance criteria verified`,
        t`Tests passed`,
        t`Rollback instructions documented`,
        t`Client handover prepared`,
      ].map((label) => ({ id: crypto.randomUUID(), label, done: false }))) as {
      id: string;
      label: string;
      done: boolean;
    }[],
  );
  const inputs: {
    key: string;
    label: string;
    type?: string;
    optional?: boolean;
    options?: string[];
  }[] =
    kind === 'CONVERSATION'
      ? [
          {
            key: 'channel',
            label: t`Channel`,
            options: ['EMAIL', 'SLACK', 'WHATSAPP'],
          },
          {
            key: 'sourceUrl',
            label: t`Conversation source link`,
            type: 'url',
            optional: true,
          },
        ]
      : kind === 'AD_REPORT'
        ? [
            { key: 'date', label: t`Report date`, type: 'date' },
            {
              key: 'channel',
              label: t`Channel`,
              options: ['META', 'X', 'TIKTOK', 'CHATGPT'],
            },
            { key: 'spend', label: t`Ad spend`, type: 'money' },
            {
              key: 'attributedRevenue',
              label: t`Ad-attributed revenue`,
              type: 'money',
            },
            {
              key: 'shopifyRevenue',
              label: t`Shopify observed revenue`,
              type: 'money',
              optional: true,
            },
            ...[
              ['purchases', t`Purchases`],
              ['qualifiedLeads', t`Qualified leads`],
              ['bookedCalls', t`Booked calls`],
              ['webinarRegistrations', t`Webinar registrations`],
            ].map(([key, label]) => ({ key, label, type: 'number' })),
            {
              key: 'goal',
              label: t`Primary goal`,
              options: ['PURCHASES', 'LEADS', 'CALLS', 'REGISTRATIONS'],
            },
            {
              key: 'targetCost',
              label: t`Target cost per outcome`,
              type: 'money',
            },
            { key: 'sourceUrl', label: t`Report source`, type: 'url' },
            {
              key: 'recommendation',
              label: t`Recommendations and caveats`,
              type: 'textarea',
            },
          ]
        : kind === 'BUDGET'
          ? [
              {
                key: 'channel',
                label: t`Ad platform`,
                options: ['META', 'X', 'TIKTOK', 'CHATGPT'],
              },
              {
                key: 'amount',
                label: t`Requested advertising budget`,
                type: 'money',
              },
              {
                key: 'period',
                label: t`Budget period`,
                options: ['DAILY', 'MONTHLY', 'LIFETIME'],
              },
              { key: 'reason', label: t`Reason for change` },
            ]
          : kind === 'FINANCE'
            ? [
                {
                  key: 'category',
                  label: t`Entry category`,
                  options: [
                    'OPENING_BALANCE',
                    'INCOME',
                    'EXPENSE',
                    'SALARY',
                    'RECEIVABLE',
                  ],
                },
                { key: 'amount', label: t`Amount`, type: 'money' },
                { key: 'date', label: t`Transaction date`, type: 'date' },
                {
                  key: 'dueDate',
                  label: t`Payment due date`,
                  type: 'date',
                  optional: true,
                },
                {
                  key: 'externalReference',
                  label: t`Unique accounting / payment reference`,
                  optional: true,
                },
                {
                  key: 'evidenceUrl',
                  label: t`Receipt or payment evidence`,
                  type: 'url',
                  optional: true,
                },
                {
                  key: 'notes',
                  label: t`Allocation and accounting notes`,
                  type: 'textarea',
                  optional: true,
                },
              ]
            : kind === 'CONTENT'
              ? [
                  {
                    key: 'channel',
                    label: t`Channel`,
                    options: ['X', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK'],
                  },
                  { key: 'account', label: t`Account / page handle` },
                  {
                    key: 'scheduledDate',
                    label: t`Planned publication date`,
                    type: 'date',
                  },
                  { key: 'copy', label: t`Post copy`, type: 'textarea' },
                  {
                    key: 'assetUrl',
                    label: t`Approved asset link`,
                    type: 'url',
                    optional: true,
                  },
                  {
                    key: 'notes',
                    label: t`Production notes`,
                    type: 'textarea',
                    optional: true,
                  },
                ]
              : kind === 'COMPETITOR'
                ? [
                    {
                      key: 'channel',
                      label: t`Channel`,
                      options: ['X', 'INSTAGRAM', 'META', 'TIKTOK', 'WEBSITE'],
                    },
                    {
                      key: 'sourceUrl',
                      label: t`Competitor post, ad or page`,
                      type: 'url',
                    },
                    {
                      key: 'observedDate',
                      label: t`Observation date`,
                      type: 'date',
                    },
                    {
                      key: 'observation',
                      label: t`What was actually observed`,
                    },
                    {
                      key: 'interpretation',
                      label: t`Interpretation — not verified fact`,
                      type: 'textarea',
                    },
                    {
                      key: 'suggestedIdea',
                      label: t`Suggested adaptation`,
                      type: 'textarea',
                    },
                  ]
                : [
                    {
                      key: 'targetDate',
                      label: t`Target release date`,
                      type: 'date',
                    },
                    {
                      key: 'repositoryUrl',
                      label: t`Repository or release link`,
                      type: 'url',
                    },
                    {
                      key: 'notes',
                      label: t`Release and rollback notes`,
                      type: 'textarea',
                    },
                  ];
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const record: Record<string, unknown> = {
      kind,
      ...(initial ? { id: initial.id } : {}),
      revision: initial?.revision ?? 0,
      projectId: data.get('projectId') || null,
      title: data.get('title'),
    };
    for (const field of inputs) {
      const value = String(data.get(field.key) ?? '');
      record[field.key] =
        field.type === 'money'
          ? value === '' && field.optional
            ? null
            : Math.round(Number(value) * 100)
          : field.type === 'number'
            ? Number(value)
            : !value && ['url', 'date'].includes(field.type ?? '')
              ? null
              : value;
    }
    if (['AD_REPORT', 'BUDGET', 'FINANCE'].includes(kind))
      record.currency = data.get('currency');
    if (['CONTENT', 'RELEASE', 'CONVERSATION'].includes(kind))
      record.ownerId = data.get('ownerId');
    if (['AD_REPORT', 'BUDGET'].includes(kind))
      record.marketerId = data.get('ownerId');
    if (kind === 'CONVERSATION') {
      record.private = data.get('private') === 'on';
      record.grants = grants;
    }
    if (kind === 'RELEASE') record.checks = checks;
    void onSave(record);
  };
  return (
    <StyledDeliveryCard>
      <form onSubmit={submit}>
        <StyledDeliveryStack>
          <h3>{initial ? t`Edit record` : t`New record`}</h3>
          <label>
            <Trans>Title</Trans>
            <input
              required
              name="title"
              maxLength={240}
              defaultValue={initial?.title}
            />
          </label>
          <label>
            <Trans>Project</Trans>
            <select
              name="projectId"
              required={kind !== 'FINANCE'}
              defaultValue={initial?.projectId ?? ''}
            >
              <option value="">
                {kind === 'FINANCE'
                  ? t`Company-wide / unallocated`
                  : t`Choose a project`}
              </option>
              {workspace.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          {[
            'CONTENT',
            'RELEASE',
            'CONVERSATION',
            'AD_REPORT',
            'BUDGET',
          ].includes(kind) && (
            <label>
              <Trans>Responsible person</Trans>
              <select
                required
                name="ownerId"
                defaultValue={String(
                  initial?.ownerId ?? initial?.marketerId ?? '',
                )}
              >
                <option value="">{t`Choose a person`}</option>
                {workspace.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {['AD_REPORT', 'BUDGET', 'FINANCE'].includes(kind) && (
            <label>
              <Trans>Currency</Trans>
              <select
                name="currency"
                defaultValue={String(initial?.currency ?? 'USD')}
              >
                {['USD', 'AED', 'EUR', 'GBP', 'INR', 'SGD', 'AUD', 'CAD'].map(
                  (currency) => (
                    <option key={currency}>{currency}</option>
                  ),
                )}
              </select>
            </label>
          )}
          <StyledDeliveryGrid>
            {inputs.map((field) => (
              <label key={field.key}>
                {field.label}
                {!field.optional && ' *'}
                {field.options ? (
                  <select
                    name={field.key}
                    defaultValue={String(
                      initial?.[field.key] ?? field.options[0],
                    )}
                  >
                    {field.options.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    name={field.key}
                    required={!field.optional}
                    maxLength={12000}
                    defaultValue={String(initial?.[field.key] ?? '')}
                  />
                ) : (
                  <input
                    name={field.key}
                    type={
                      field.type === 'money' ? 'number' : (field.type ?? 'text')
                    }
                    min={
                      ['money', 'number'].includes(field.type ?? '')
                        ? 0
                        : undefined
                    }
                    step={
                      field.type === 'money'
                        ? '0.01'
                        : field.type === 'number'
                          ? '1'
                          : undefined
                    }
                    required={!field.optional}
                    defaultValue={
                      initial?.[field.key] == null
                        ? ''
                        : field.type === 'money'
                          ? Number(initial[field.key]) / 100
                          : String(initial[field.key])
                    }
                  />
                )}
              </label>
            ))}
          </StyledDeliveryGrid>
          {kind === 'CONVERSATION' && (
            <>
              <label>
                <input
                  type="checkbox"
                  name="private"
                  defaultChecked={initial ? Boolean(initial.private) : true}
                />
                <Trans>Private to the selected owner</Trans>
              </label>
              <h3>
                <Trans>Conversation permissions</Trans>
              </h3>
              {workspace.members.map((member) => {
                const grant = grants.find(
                  (item) => item.memberId === member.id,
                );
                return (
                  <StyledDeliveryRow key={member.id}>
                    <span>{member.name}</span>
                    {(['read', 'send'] as const).map((permission) => (
                      <label key={permission}>
                        <input
                          type="checkbox"
                          checked={grant?.[permission] ?? false}
                          onChange={(event) => {
                            const next = {
                              memberId: member.id,
                              read: grant?.read ?? false,
                              send: grant?.send ?? false,
                              [permission]: event.target.checked,
                            };
                            if (permission === 'send' && next.send)
                              next.read = true;
                            if (permission === 'read' && !next.read)
                              next.send = false;
                            setGrants([
                              ...grants.filter(
                                (item) => item.memberId !== member.id,
                              ),
                              next,
                            ]);
                          }}
                        />
                        {permission === 'read'
                          ? t`View`
                          : t`Draft / send when connected`}
                      </label>
                    ))}
                  </StyledDeliveryRow>
                );
              })}
            </>
          )}
          {kind === 'RELEASE' && (
            <>
              <h3>
                <Trans>Release checklist</Trans>
              </h3>
              {checks.map((check) => (
                <StyledDeliveryRow key={check.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={check.done}
                      onChange={(event) =>
                        setChecks(
                          checks.map((item) =>
                            item.id === check.id
                              ? { ...item, done: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    <input
                      aria-label={t`Release check`}
                      value={check.label}
                      required
                      maxLength={240}
                      onChange={(event) =>
                        setChecks(
                          checks.map((item) =>
                            item.id === check.id
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                </StyledDeliveryRow>
              ))}
              <StyledDeliveryButton
                type="button"
                onClick={() =>
                  setChecks([
                    ...checks,
                    { id: crypto.randomUUID(), label: '', done: false },
                  ])
                }
              >
                <Trans>Add check</Trans>
              </StyledDeliveryButton>
            </>
          )}
          <StyledDeliveryRow>
            <StyledDeliveryButton
              disabled={busy}
              type="submit"
              data-primary="true"
            >
              <Trans>Save record</Trans>
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

type AdvertisingMetricsProps = {
  insight?: AdvertisingInsight;
  currency: string;
};
const AdvertisingMetrics = ({ insight, currency }: AdvertisingMetricsProps) => {
  const { t } = useLingui();
  if (!insight) return null;
  const signals: Record<string, string> = {
    FUTURE_DATE: t`Check the report date before using these figures.`,
    NO_SPEND: t`No spend recorded. Return on ad spend cannot be calculated.`,
    NO_TARGET: t`Set a target cost before assessing performance.`,
    NO_OUTCOMES: t`Spend without recorded outcomes: check tracking and conversion delay before changing the campaign.`,
    ABOVE_TARGET: t`Cost exceeds the target. Review tracking, creative and audience before deciding on a change.`,
    WITHIN_TARGET: t`Cost is within the stated target. Check volume and profitability before increasing spend.`,
  };
  const goals: Record<string, string> = {
    PURCHASES: t`Purchases`,
    LEADS: t`Qualified leads`,
    CALLS: t`Booked calls`,
    REGISTRATIONS: t`Webinar registrations`,
  };
  return (
    <StyledDeliveryStack>
      <small>
        {t`Report date`}: {insight.date} · {goals[insight.goal]}:{' '}
        {insight.outcomes}
      </small>
      <p>
        {t`Cost per outcome`}:{' '}
        {insight.costPerOutcome === null
          ? t`Not available`
          : formatMoney(insight.costPerOutcome, currency)}{' '}
        · {t`Ad-attributed ROAS`}:{' '}
        {insight.attributedRoas === null
          ? t`Not available`
          : `${insight.attributedRoas.toFixed(2)}×`}
      </p>
      {insight.excessSpend !== null && (
        <small>
          {t`Spend above target × recorded outcomes`}:{' '}
          {formatMoney(insight.excessSpend, currency)}
        </small>
      )}
      {insight.stale && (
        <strong>
          <Trans>
            This report is more than one day old. Refresh the data before
            acting.
          </Trans>
        </strong>
      )}
      <p>{signals[insight.signal]}</p>
      <small>
        <Trans>
          Calculated from this manually entered report. These checks do not
          prove an ad is a winner or loser and do not change budgets.
        </Trans>
      </small>
    </StyledDeliveryStack>
  );
};
