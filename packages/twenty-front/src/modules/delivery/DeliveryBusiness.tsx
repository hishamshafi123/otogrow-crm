import { DeliveryReceivableBalance } from '@/delivery/finance/DeliveryReceivableBalance';
import { financePaymentDestination } from '@/delivery/finance/finance-payment-destination';
import { useReconciliationLabels } from '@/delivery/finance/useReconciliationLabels';
import { DeliveryReadiness } from '@/delivery/readiness/DeliveryReadiness';
import { DeliveryRevisionCosts } from '@/delivery/revisions/DeliveryRevisionCosts';
import {
  ConversationPermissions,
  type ConversationPermissionsValue,
} from '@/delivery/inbox/ConversationPermissions';
import { GET_OTOGROW_ROLE_DIRECTORY } from '@/otogrow-access/otogrow-access.graphql';
import { type OtogrowRoleDirectory } from '@/otogrow-access/otogrow-access.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { DeliveryGuardedForm } from '@/delivery/drafts/DeliveryGuardedForm';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { DeliveryInboxForm } from '@/delivery/DeliveryInboxForm';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryMeta } from '@/delivery/DeliveryMeta';
import { type DeliveryAgentsSnapshot } from '@/delivery/delivery-agent.types';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { styled } from '@linaria/react';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  type AdvertisingInsight,
  type BusinessKind,
  type BusinessRecord,
  type BusinessSnapshot,
  type FinanceReceivableBalance,
} from '@/delivery/delivery-business.types';
import {
  StyledDeliveryStack,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryGrid,
  StyledDeliveryButton,
  StyledDeliveryBadge,
} from '@/delivery/deliveryStyles';

const StyledBusinessBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
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
export const DeliveryBusiness = (props: DeliveryBusinessProps) => {
  const permission = useWorkflowAccess();
  return (
    <BusinessWorkspace
      key={permission.scope}
      workspace={props.workspace}
      view={props.view}
      onChanged={props.onChanged}
      onOpenTask={props.onOpenTask}
      permission={permission}
    />
  );
};
const BusinessWorkspace = ({
  workspace,
  view,
  onChanged,
  onOpenTask,
  permission,
}: DeliveryBusinessProps & {
  permission: ReturnType<typeof useWorkflowAccess>;
}) => {
  const { t } = useLingui();
  const query = useQuery<{ deliveryBusiness: BusinessSnapshot }>(GET_BUSINESS, {
    fetchPolicy: 'no-cache',
    skip: !permission.ready,
    pollInterval: 30000,
  });
  const { requestAction } = useDeliveryDraftGuard();
  const [mutate, mutation] = useMutation(CHANGE_BUSINESS);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{
    kind: BusinessKind;
    record?: BusinessRecord;
  } | null>(null);
  const [selected, setSelected] = useState('');
  const candidate = query.data?.deliveryBusiness;
  const available = !query.error && permission.matches(candidate);
  const [lastVerifiedData, setLastVerifiedData] = useState<BusinessSnapshot>();
  if (available && candidate !== lastVerifiedData)
    setLastVerifiedData(candidate);
  const data = available ? candidate : lastVerifiedData;
  const canReadFinance =
    permission.canReadFinance && data?.financeAccess.read === true;
  const canManageFinance =
    permission.canManageFinance && data?.financeAccess.manage === true;
  const financeProjects = data?.financeProjects ?? [];
  const receivableBalances = new Map(
    (data?.financeReceivableBalances ?? []).map((balance) => [
      balance.id,
      balance,
    ]),
  );
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
    OPEN: t`Open`,
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
  const statusLabel = (record: BusinessRecord) => {
    if (
      record.kind === 'FINANCE' &&
      record.category === 'RECEIVABLE' &&
      record.status !== 'VOID'
    ) {
      const balance = receivableBalances.get(record.id);
      if (!balance || balance.sourceWarnings.length)
        return t`Payment status needs review`;
      if (balance.outstandingMicros === '0') return t`Fully paid`;
      if (balance.settledMicros !== '0') return t`Partially paid`;
      if (record.status === 'OPEN') return t`Awaiting payment`;
    }
    return labels[record.status] ?? record.status;
  };
  const run = async (input: Record<string, unknown>) => {
    if (!available) return false;
    setError('');
    try {
      await mutate({ variables: { input } });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Could not save this record.`,
      );
      return false;
    }
    try {
      await query.refetch();
      await onChanged();
    } catch {
      setError(
        t`Saved, but this page could not refresh. Refresh the page before making another change.`,
      );
    }
    return true;
  };
  const records = (data?.records ?? []).filter((record) =>
    VIEW_KINDS[view]?.includes(record.kind),
  );
  const item = records.find((record) => record.id === selected);
  const canDraft =
    item?.kind === 'CONVERSATION' &&
    data?.conversationAccess?.[item.id]?.draft === true;
  const exportFinance = () => {
    if (!available || !canReadFinance) return;
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
  if (available && view === 'finance' && !canReadFinance)
    return (
      <StyledDeliveryCard>
        <p>{t`Your roles do not grant finance access. Ask an administrator if you need it.`}</p>
      </StyledDeliveryCard>
    );
  return (
    <>
      {!available && (
        <StyledDeliveryCard>
          <p role={query.error || permission.error ? 'alert' : 'status'}>
            {query.error || permission.error
              ? t`Could not verify your current access and records. Your unsaved edits are kept while you retry.`
              : t`Loading your permitted records…`}
          </p>
          {(query.error || permission.error) && (
            <StyledDeliveryButton
              onClick={() => {
                void permission.refetch();
                void query.refetch();
              }}
            >{t`Try again`}</StyledDeliveryButton>
          )}
        </StyledDeliveryCard>
      )}
      <StyledBusinessBoundary hidden={!available} disabled={!available}>
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
                        ? t`Cash records and collections`
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
                    ?.filter((kind) =>
                      kind === 'FINANCE'
                        ? canManageFinance
                        : kind !== 'CONVERSATION' || workspace.actor.isAdmin,
                    )
                    .map((kind) => (
                      <StyledDeliveryButton
                        key={kind}
                        disabled={editing !== null}
                        onClick={() =>
                          requestAction(() => setEditing({ kind }))
                        }
                      >
                        {t`New`} {labels[kind]}
                      </StyledDeliveryButton>
                    ))}
                  {view === 'finance' && canReadFinance && (
                    <StyledDeliveryButton onClick={exportFinance}>
                      <Trans>Export CSV</Trans>
                    </StyledDeliveryButton>
                  )}
                </StyledDeliveryRow>
              </StyledDeliveryRow>
              {['inbox', 'content', 'competitors'].includes(view) && (
                <p>
                  <Trans>
                    This is a manual workflow. Records and drafts stay inside
                    the OS. Live synchronization, automatic research and sending
                    or publishing are not implemented here.
                  </Trans>
                </p>
              )}
              {view === 'inbox' && (
                <p>
                  <Trans>
                    Record selected client conversations and prepare replies.
                    Grants apply to this conversation only; project membership
                    does not grant inbox access. Imported notes are labeled
                    separately from provider-synced messages.
                  </Trans>
                </p>
              )}
              {view === 'ads' && (
                <p>
                  <Trans>
                    Record source evidence, review recommendations, then assign
                    follow-up. Marketers apply budget changes in the ad
                    platform; a separate manager verifies them.
                  </Trans>
                </p>
              )}
              {view === 'finance' && !canManageFinance && (
                <p>{t`You have view-only finance access. You can inspect reports and export entries.`}</p>
              )}
              {view === 'finance' && (
                <p>
                  <Trans>
                    Cash basis, separated by currency. Record opening cash,
                    receipts, expenses and allocated salary costs. Receivables
                    are excluded from cash until payment is confirmed.
                    Advertising-platform spend stays separate from agency
                    expenses.
                  </Trans>
                </p>
              )}
            </StyledDeliveryStack>
          </StyledDeliveryCard>
          {view === 'finance' && canReadFinance && (
            <DeliveryRevisionCosts workspace={workspace} />
          )}
          {(error || query.error) && (
            <p role="alert">{error || query.error?.message}</p>
          )}
          {view === 'development' && (
            <p>
              <Trans>
                Task boards, release checklists and evidence links are
                available. Repository, issue, CI, Jira and deployment
                synchronization are not implemented. Record external release
                evidence here for review.
              </Trans>
            </p>
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
                        {(view === 'finance'
                          ? financeProjects
                          : workspace.projects
                        ).find(
                          (candidate) => candidate.id === project.projectId,
                        )?.name ?? t`Shared / unallocated`}
                      </strong>
                      <p>
                        {t`Cash contribution`}:{' '}
                        {formatMoney(
                          project.cashContribution,
                          summary.currency,
                        )}{' '}
                        · {t`Cash contribution margin`}:{' '}
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
                        task.dueAt !== null &&
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
              <DeliveryReadiness />
            </>
          )}
          {editing &&
            (editing.kind !== 'FINANCE' || !available || canManageFinance) && (
              <BusinessForm
                key={
                  editing.record
                    ? `${editing.record.id}:${editing.record.revision}`
                    : editing.kind
                }
                workspace={workspace}
                financeProjects={financeProjects}
                kind={editing.kind}
                initial={editing.record}
                busy={mutation.loading}
                onCancel={() => requestAction(() => setEditing(null))}
                latestRevision={
                  editing.record
                    ? (data?.records.find(
                        (item) => item.id === editing.record?.id,
                      )?.revision ?? -1)
                    : 0
                }
                onReload={() =>
                  requestAction(() => {
                    const latest = data?.records.find(
                      (item) => item.id === editing.record?.id,
                    );
                    if (latest)
                      setEditing({ kind: latest.kind, record: latest });
                    else
                      setError(
                        t`This record is no longer available. Your draft is still here.`,
                      );
                  })
                }
                onSave={async (record) => {
                  const saved = await run({ action: 'save', record });
                  if (saved) setEditing(null);
                  return saved;
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
                      {statusLabel(record)}
                    </StyledDeliveryBadge>
                  </StyledDeliveryRow>
                  <small>
                    {labels[record.kind]} ·{' '}
                    {(view === 'finance'
                      ? financeProjects
                      : workspace.projects
                    ).find((project) => project.id === record.projectId)
                      ?.name ?? t`Company-wide`}
                  </small>
                  {record.kind === 'AD_REPORT' && (
                    <>
                      <p>
                        {formatMoney(
                          Number(record.spend),
                          String(record.currency),
                        )}{' '}
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
                      {formatMoney(
                        Number(record.amount),
                        String(record.currency),
                      )}
                    </h3>
                  )}
                  {record.kind === 'FINANCE' &&
                    record.category === 'RECEIVABLE' &&
                    record.status !== 'VOID' && (
                      <DeliveryReceivableBalance
                        balance={receivableBalances.get(record.id)}
                        currency={String(record.currency)}
                      />
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
                  <StyledDeliveryButton
                    onClick={() => requestAction(() => setSelected(record.id))}
                  >
                    <Trans>Open details</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryStack>
              </StyledDeliveryCard>
            ))}
          </StyledDeliveryGrid>
          {view !== 'health' && !records.length && (
            <p>
              {view === 'ads' ? (
                <Trans>No manual reports or budget requests yet.</Trans>
              ) : view === 'finance' ? (
                <Trans>
                  No financial entries yet. Add an opening balance, receipt,
                  expense or receivable.
                </Trans>
              ) : (
                <Trans>
                  No records yet. Add the first item to start this workflow.
                </Trans>
              )}
            </p>
          )}
          {item && (
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <StyledDeliveryRow>
                  <h2>{item.title}</h2>
                  <StyledDeliveryButton
                    onClick={() => requestAction(() => setSelected(''))}
                  >
                    <Trans>Close details</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
                <p>
                  {statusLabel(item)} · {t`Version`} {item.revision}
                </p>
                {item.kind === 'FINANCE' &&
                  item.category === 'RECEIVABLE' &&
                  item.status !== 'VOID' && (
                    <DeliveryReceivableBalance
                      balance={receivableBalances.get(item.id)}
                      currency={String(item.currency)}
                    />
                  )}
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
                                      ?.text.slice(0, 80) ??
                                    t`Source unavailable`,
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
                          key={`agent-${item.id}`}
                          record={item}
                          sources={(data?.inbox ?? []).filter(
                            (entry) =>
                              entry.conversationId === item.id &&
                              entry.kind === 'INBOUND_NOTE',
                          )}
                          busy={mutation.loading}
                          run={run}
                        />
                        <DeliveryInboxForm
                          key={item.id}
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
                    key={item.id}
                    record={item}
                    receivableBalance={receivableBalances.get(item.id)}
                    canManageFinance={canManageFinance}
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
                    disabled={editing !== null}
                    onClick={() =>
                      requestAction(() =>
                        setEditing({ kind: item.kind, record: item }),
                      )
                    }
                  >
                    <Trans>Edit</Trans>
                  </StyledDeliveryButton>
                )}
                {item.taskId && (
                  <StyledDeliveryButton
                    onClick={() => onOpenTask(item.taskId!)}
                  >
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
      </StyledBusinessBoundary>
    </>
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
  const access = useWorkflowAccess();
  const query = useQuery<{ deliveryAgents: DeliveryAgentsSnapshot }>(
    GET_REPLY_AGENTS,
    {
      fetchPolicy: 'no-cache',
      skip: !access.ready,
      pollInterval: 30000,
    },
  );
  const agentData = query.data?.deliveryAgents;
  const agentsReady = !query.error && access.matches(agentData?.actor);
  const availableAgents = agentsReady
    ? (agentData?.agents.filter((agent) =>
        agentData.runnableAgentIds.includes(agent.id),
      ) ?? [])
    : [];
  const draft = useDeliveryDraft({
    initialValues: { sourceIds: [] as string[], agentId: '' },
    revision: record.revision,
    busy,
  });
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          !agentsReady ||
          !availableAgents.some((agent) => agent.id === draft.values.agentId) ||
          draft.saving ||
          draft.stale ||
          !draft.values.agentId ||
          !draft.values.sourceIds.length ||
          draft.values.sourceIds.length > 20
        )
          return;
        draft.setSaving(true);
        try {
          if (
            await run({
              action: 'aiDraft',
              id: record.id,
              revision: draft.revision,
              ...draft.values,
            })
          )
            draft.markSaved();
        } finally {
          draft.setSaving(false);
        }
      }}
    >
      {draft.stale && (
        <DeliveryDraftConflict onReload={draft.reload} busy={draft.saving} />
      )}
      {!agentsReady && (
        <p role="status">
          <Trans>
            Assistant access could not be verified. Refresh before preparing a
            reply.
          </Trans>
        </p>
      )}
      <fieldset disabled={draft.saving || draft.stale || !agentsReady}>
        <StyledDeliveryStack>
          <h3>
            <Trans>Prepare a reply with AI</Trans>
          </h3>
          <p>
            <Trans>
              Only the selected conversation notes are sent to the configured
              model. Review and edit the draft before using it. Nothing is sent
              to the client.
            </Trans>
          </p>
          <label>
            <Trans>Copy agent</Trans>
            <select
              name="agentId"
              required
              value={draft.values.agentId}
              onChange={(event) =>
                draft.update({ ...draft.values, agentId: event.target.value })
              }
            >
              <option value="">{t`Choose an enabled agent`}</option>
              {availableAgents
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
                checked={draft.values.sourceIds.includes(source.id)}
                onChange={(event) =>
                  draft.update({
                    ...draft.values,
                    sourceIds: event.target.checked
                      ? [...draft.values.sourceIds, source.id]
                      : draft.values.sourceIds.filter((id) => id !== source.id),
                  })
                }
              />
              {source.text.slice(0, 200)}
            </label>
          ))}
          <StyledDeliveryButton
            type="submit"
            disabled={
              !draft.values.agentId ||
              !draft.values.sourceIds.length ||
              draft.values.sourceIds.length > 20
            }
          >
            <Trans>Generate unsent reply draft</Trans>
          </StyledDeliveryButton>
          {query.error && <p role="alert">{query.error.message}</p>}
        </StyledDeliveryStack>
      </fieldset>
    </form>
  );
};
const RecordActions = ({
  record,
  receivableBalance,
  canManageFinance,
  workspace,
  busy,
  run,
}: {
  record: BusinessRecord;
  receivableBalance: FinanceReceivableBalance | undefined;
  canManageFinance: boolean;
  workspace: DeliveryWorkspace;
  busy: boolean;
  run: Runner;
}) => {
  const { t } = useLingui();
  const isReceivable =
    record.kind === 'FINANCE' && record.category === 'RECEIVABLE';
  const receivableCanVoid =
    !isReceivable ||
    (receivableBalance?.settledMicros === '0' &&
      receivableBalance.sourceWarnings.length === 0 &&
      record.status !== 'PAID');
  const states = (
    record.kind === 'FINANCE'
      ? [['VOID', t`Void entry`]]
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
    if (status === 'VOID')
      return (
        (record.kind === 'FINANCE' ? canManageFinance : actor.isAdmin) &&
        record.status !== 'VOID' &&
        receivableCanVoid
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
      {isReceivable && (
        <Link
          to={financePaymentDestination({
            receivableId: record.id,
            currency: String(record.currency),
          })}
        >
          <Trans>Review invoice payments</Trans>
        </Link>
      )}
      {record.kind === 'FINANCE' &&
        ['INCOME', 'EXPENSE', 'SALARY'].includes(String(record.category)) && (
          <Link
            to={financePaymentDestination({
              cashId: record.id,
              currency: String(record.currency),
            })}
          >
            <Trans>Review payment and matching</Trans>
          </Link>
        )}
      {isReceivable &&
        canManageFinance &&
        record.status !== 'VOID' &&
        !receivableCanVoid && (
          <p role="status">
            {receivableBalance && receivableBalance.settledMicros !== '0' ? (
              <Trans>
                Review its applied payments before voiding this receivable.
                Reverse the invoice link or void its linked payment receipt
                first.
              </Trans>
            ) : (
              <Trans>
                Review this receivable’s payment status before voiding it.
                Refresh and resolve any payment source warnings first.
              </Trans>
            )}
          </p>
        )}
      <DeliveryGuardedForm
        revision={record.revision}
        busy={busy}
        visible={states.length > 0}
        onSave={(data, revision) =>
          run({
            action: 'transition',
            id: record.id,
            revision,
            status: data.get('status'),
            note: data.get('note'),
            evidence: String(data.get('evidence') ?? '') || null,
          })
        }
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
      </DeliveryGuardedForm>
      <DeliveryGuardedForm
        revision={record.revision}
        busy={busy}
        visible={
          workspace.actor.isManager &&
          !record.taskId &&
          record.kind !== 'FINANCE' &&
          (record.kind !== 'AD_REPORT' || record.status === 'APPROVED')
        }
        onSave={(data, revision) =>
          run({
            action: 'assign',
            id: record.id,
            revision,
            assigneeId: data.get('assigneeId'),
            reviewerId: data.get('reviewerId'),
            dueDate: data.get('dueDate'),
          })
        }
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
      </DeliveryGuardedForm>
    </>
  );
};

type BusinessFormProps = {
  workspace: DeliveryWorkspace;
  financeProjects: BusinessSnapshot['financeProjects'];
  kind: BusinessKind;
  initial?: BusinessRecord;
  busy: boolean;
  onCancel: () => void;
  onSave: (record: Record<string, unknown>) => Promise<boolean>;
  latestRevision: number;
  onReload: () => void;
};
const BusinessForm = ({
  workspace,
  financeProjects,
  kind,
  initial,
  busy,
  onCancel,
  onSave,
  latestRevision,
  onReload,
}: BusinessFormProps) => {
  const { t } = useLingui();
  const reconciliationLabels = useReconciliationLabels();
  const financeCategoryLabels: Record<string, string> = {
    ...reconciliationLabels.categories,
    OPENING_BALANCE: t`Opening cash balance`,
    RECEIVABLE: t`Receivable / expected payment`,
  };
  const access = useWorkflowAccess();
  const directoryQuery = useQuery<{
    otogrowRoleDirectory: OtogrowRoleDirectory;
  }>(GET_OTOGROW_ROLE_DIRECTORY, {
    skip: kind !== 'CONVERSATION' || !access.ready,
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    variables: { identity: access.scope },
  });
  const directory = directoryQuery.data?.otogrowRoleDirectory;
  const conversationReady =
    kind !== 'CONVERSATION' ||
    (!directoryQuery.error && access.matches(directory?.actor));
  const [conversationPermissions, setConversationPermissions] =
    useState<ConversationPermissionsValue>({
      ownerId: String(initial?.ownerId ?? ''),
      private: initial ? Boolean(initial.private) : true,
      grants: (initial?.grants ?? []) as ConversationPermissionsValue['grants'],
      roleGrants: (initial?.roleGrants ??
        []) as ConversationPermissionsValue['roleGrants'],
    });
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
  const [saving, setSaving] = useState(false);
  const draft = useDeliveryNativeDraft({
    extraValues: { conversationPermissions, checks },
    busy: busy || saving,
  });
  const stale = Boolean(initial && initial.revision !== latestRevision);
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
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || saving || stale || !draft.dirty || !conversationReady) return;
    const data = new FormData(event.currentTarget);
    const record: Record<string, unknown> = {
      kind,
      ...(initial ? { id: initial.id } : {}),
      revision: initial?.revision ?? 0,
      projectId: String(data.get('projectId') ?? '') || null,
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
    if (['CONTENT', 'RELEASE'].includes(kind))
      record.ownerId = data.get('ownerId');
    if (['AD_REPORT', 'BUDGET'].includes(kind))
      record.marketerId = data.get('ownerId');
    if (kind === 'CONVERSATION') {
      Object.assign(record, conversationPermissions);
    }
    if (kind === 'RELEASE') record.checks = checks;
    setSaving(true);
    try {
      await onSave(record);
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
                {(kind === 'FINANCE'
                  ? financeProjects
                  : workspace.projects
                ).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            {['CONTENT', 'RELEASE', 'AD_REPORT', 'BUDGET'].includes(kind) && (
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
                        <option key={value} value={value}>
                          {kind === 'FINANCE' && field.key === 'category'
                            ? financeCategoryLabels[value]
                            : value}
                        </option>
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
                        field.type === 'money'
                          ? 'number'
                          : (field.type ?? 'text')
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
            {kind === 'CONVERSATION' &&
              (conversationReady && directory ? (
                <ConversationPermissions
                  value={conversationPermissions}
                  directory={directory}
                  onChange={setConversationPermissions}
                />
              ) : (
                <div>
                  <p role={directoryQuery.error ? 'alert' : 'status'}>
                    {directoryQuery.error
                      ? t`Could not verify current roles. Your draft is kept; retry before saving access.`
                      : t`Checking current roles and people…`}
                  </p>
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => void directoryQuery.refetch()}
                  >
                    <Trans>Retry role access</Trans>
                  </StyledDeliveryButton>
                </div>
              ))}
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
                disabled={
                  busy || saving || stale || !draft.dirty || !conversationReady
                }
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
        </fieldset>
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
