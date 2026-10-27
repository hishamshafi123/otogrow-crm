import { Link } from 'react-router-dom';
import {
  StyledReportBoundary,
  StyledReportStack,
} from '@/delivery/advertising/metaReportStyles';
import {
  MetaReportFilters,
  type MetaReportFiltersValue,
} from '@/delivery/advertising/MetaReportFilters';
import { MetaReportAds } from '@/delivery/advertising/MetaReportAds';
import { useMetaReportNavigation } from '@/delivery/advertising/useMetaReportNavigation';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { DeliveryGuardedForm } from '@/delivery/drafts/DeliveryGuardedForm';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  MetaImportCoverage,
  type MetaImportCoverageData,
} from '@/delivery/advertising/MetaImportCoverage';
import {
  StyledDeliveryCard,
  StyledDeliveryStack,
  StyledDeliveryRow,
  StyledDeliveryButton,
  StyledDeliveryGrid,
} from '@/delivery/deliveryStyles';
const GET_META = gql`
  query DeliveryMeta($input: JSON) {
    deliveryMeta(input: $input)
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
type MetaClientService = {
  id: string;
  name: string;
  projectId: string;
  managerId: string | null;
  marketerId: string | null;
  ready: boolean;
};
type MetaRouting = {
  projectId: string | null;
  managerId: string | null;
  marketerId: string | null;
};
type MetaConnection = {
  engagementId?: string | null;
  scheduleTimezone?: 'Asia/Qatar' | null;
  routing?: MetaRouting | null;
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
  catchUpDays?: number;
  refreshDays?: number;
  dailyImportLimit?: number;
  coverage?: MetaImportCoverageData;
  retryAt?: string | null;
};
export type MetaReport = {
  engagementId?: string | null;
  routing?: MetaRouting | null;
  adCount: number;
  archivedAt: string | null;
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
  lastCheckedAt?: string | null;
  hasNewerVersion?: boolean;
};
const reportRouting = (report: MetaReport) =>
  report.engagementId ? report.routing : report;
const needsReportAssignment = (report: MetaReport) => {
  const routing = reportRouting(report);
  return (
    !routing?.projectId ||
    !routing.managerId ||
    !routing.marketerId ||
    routing.managerId === routing.marketerId
  );
};
type MetaSnapshot = {
  filter: MetaReportFiltersValue & { after?: string; selectedId?: string };
  selected: MetaReport | null;
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  total: number;
  nextCursor: string | null;
  clientServices?: MetaClientService[];
  connections: MetaConnection[];
  reports: MetaReport[];
  workerSeenAt: string | null;
};
type DeliveryMetaProps = {
  workspace: DeliveryWorkspace;
  onChanged: () => Promise<unknown>;
  onOpenTask: (id: string) => void;
};
export const DeliveryMeta = (props: DeliveryMetaProps) => {
  const access = useWorkflowAccess();
  const navigation = useMetaReportNavigation(access.scope);
  const { requestAction } = useDeliveryDraftGuard();
  if (!navigation.valid)
    return (
      <StyledDeliveryCard>
        <p role="alert">
          <Trans>
            This reporting link contains invalid filters. Reset them to open the
            latest active reports.
          </Trans>
        </p>
        <StyledDeliveryButton onClick={() => requestAction(navigation.reset)}>
          <Trans>Reset reporting link</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryCard>
    );
  return (
    <MetaWorkspace
      key={`${access.scope}:${JSON.stringify(navigation.value)}`}
      navigation={navigation}
      workspace={props.workspace}
      onChanged={props.onChanged}
      onOpenTask={props.onOpenTask}
    />
  );
};
type MetaWorkspaceProps = DeliveryMetaProps & {
  navigation: ReturnType<typeof useMetaReportNavigation>;
};
const MetaWorkspace = ({
  workspace,
  onChanged,
  onOpenTask,
  navigation,
}: MetaWorkspaceProps) => {
  const { t } = useLingui();
  const access = useWorkflowAccess();
  const { after, selectedId, ...filters } = navigation.value;
  const [selectedReportId, setSelectedReportId] = useState(selectedId ?? '');
  const requestedFilter = { ...filters, after };
  const query = useQuery<{ deliveryMeta: MetaSnapshot }>(GET_META, {
    variables: {
      input: { ...requestedFilter, selectedId: selectedReportId || undefined },
      identity: access.scope,
    },
    skip: !access.ready,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: false,
    pollInterval: 30000,
  });
  const candidate = query.data?.deliveryMeta;
  const available =
    access.ready &&
    !query.loading &&
    !query.error &&
    access.matches(candidate) &&
    (
      [
        'archive',
        'accountId',
        'fromDate',
        'throughDate',
        'status',
        'after',
      ] as const
    ).every((key) => candidate?.filter[key] === requestedFilter[key]) &&
    candidate?.filter.selectedId === (selectedReportId || undefined);
  const [retained, setRetained] = useState<MetaSnapshot | undefined>();
  if (available && candidate && candidate !== retained) setRetained(candidate);
  if (available && !selectedReportId && candidate?.reports[0])
    setSelectedReportId(candidate.reports[0].id);

  const [mutate, mutation] = useMutation<{ changeDeliveryMeta: MetaSnapshot }>(
    CHANGE_META,
  );
  const [error, setError] = useState('');
  const [changing, setChanging] = useState(false);
  const busy = changing || mutation.loading;
  const { requestAction } = useDeliveryDraftGuard();
  useDeliveryDraftStatus({ dirty: false, saving: busy });
  const [editing, setEditing] = useState<MetaConnection | null | undefined>(
    undefined,
  );
  const [expanded, setExpanded] = useState('');
  const connectionFormRef = useRef<HTMLFormElement>(null);
  const openConnection = (
    connection: MetaConnection | null,
    focusProject = false,
  ) => {
    const open = () => {
      setEditing(connection);
      if (focusProject)
        requestAnimationFrame(() =>
          connectionFormRef.current
            ?.querySelector<HTMLSelectElement>('[name="projectId"]')
            ?.focus(),
        );
    };
    if (editing !== undefined) requestAction(open);
    else open();
  };
  const run = async (input: Record<string, unknown>) => {
    if (!available || busy) return false;
    setError('');
    setChanging(true);
    try {
      const result = await mutate({ variables: { input } });
      if (!access.matches(result.data?.changeDeliveryMeta))
        throw new Error('Identity changed.');
    } catch {
      setError(
        t`Could not complete the reporting action. Your inputs are preserved. Check connection status, staff assignments and access before retrying.`,
      );
      setChanging(false);
      return false;
    }
    try {
      await query.refetch();
      await onChanged();
    } catch {
      setError(
        t`The reporting action was saved, but this page could not refresh. Refresh before making another change.`,
      );
    }
    setChanging(false);
    return true;
  };
  const data = available ? candidate : retained;
  const choose = (action: () => void) =>
    requestAction(() => {
      setSelectedReportId('');
      setExpanded('');
      action();
    });
  const selectedReport = selectedReportId
    ? data?.selected?.id === selectedReportId
      ? data.selected
      : data?.reports.find((report) => report.id === selectedReportId)
    : data?.reports[0];
  const reportStatus = (status: string) =>
    status === 'REVIEW'
      ? t`Awaiting manager review`
      : status === 'APPROVED'
        ? t`Approved`
        : t`Changes requested`;
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
            <StyledDeliveryButton
              disabled={!available || busy}
              onClick={() => openConnection(null)}
            >
              <Trans>Connect Meta account</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryRow>
        <p>
          <Trans>
            Client performance reports reach the assigned project manager,
            marketer and administrators. Recommendations need independent
            approval before follow-up work is assigned. Performance dates and
            attribution follow the ad account settings.
          </Trans>
        </p>
        {query.loading && !data && (
          <p>
            <Trans>Loading connections…</Trans>
          </p>
        )}
        {(error || query.error) && (
          <p role="alert">
            {error ||
              (after
                ? t`This results page could not be loaded. Retry, or return to the latest reports.`
                : t`Reporting connection could not be loaded.`)}
          </p>
        )}
        {query.error && (
          <StyledDeliveryRow>
            <StyledDeliveryButton onClick={() => void query.refetch()}>
              <Trans>Retry reporting</Trans>
            </StyledDeliveryButton>
            {after && (
              <StyledDeliveryButton onClick={() => choose(navigation.latest)}>
                <Trans>Latest reports</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        )}
        {(!access.ready || (query.loading && !data)) && (
          <p role="status">
            <Trans>Checking reporting access…</Trans>
          </p>
        )}
        <StyledReportBoundary hidden={!available} disabled={!available || busy}>
          {workspace.actor.isAdmin && (
            <small>
              {data?.workerSeenAt
                ? t`Scheduler last checked: ${new Date(data.workerSeenAt).toLocaleString()}`
                : t`Scheduler heartbeat has not been recorded yet. An always-running server is required.`}
            </small>
          )}
          {data?.connections
            .filter(() => workspace.actor.isAdmin)
            .map((connection) => (
              <StyledDeliveryCard key={connection.accountId}>
                <StyledDeliveryStack>
                  <strong>
                    {connection.name} · {connection.accountId}
                  </strong>
                  <span>
                    {connection.currency} · {connection.timezone} ·{' '}
                    {connection.time}{' '}
                    {connection.scheduleTimezone ?? connection.timezone} ·{' '}
                    {connection.enabled
                      ? t`Daily reports enabled`
                      : t`Automatic reports off`}
                  </span>
                  {connection.engagementId && (
                    <p>
                      {data?.clientServices?.find(
                        (service) => service.id === connection.engagementId,
                      )?.name ?? t`Client service unavailable`}
                      {' · '}
                      {t`Recipients follow the client’s current project manager, marketer and workspace administrators.`}
                    </p>
                  )}
                  {connection.engagementId && !connection.routing && (
                    <p role="alert">{t`Client service or responsibilities need attention in Clients. Imports cannot continue until this is resolved.`}</p>
                  )}
                  <small>
                    {connection.lastSuccessAt
                      ? t`Last successful import: ${new Date(connection.lastSuccessAt).toLocaleString()}`
                      : t`No performance import yet`}
                  </small>
                  {connection.error && <p role="alert">{connection.error}</p>}
                  {connection.retryAt &&
                    new Date(connection.retryAt).getTime() > Date.now() && (
                      <p role="status">
                        {t`Imports are paused until ${new Date(connection.retryAt).toLocaleString()} after a failed attempt.`}
                      </p>
                    )}
                  <details>
                    <summary>
                      <Trans>Import status and connection settings</Trans>
                    </summary>
                    <StyledReportStack>
                      {workspace.actor.isAdmin && connection.coverage && (
                        <MetaImportCoverage
                          coverage={connection.coverage}
                          busy={busy}
                          unavailable={
                            connection.running ||
                            Boolean(
                              connection.retryAt &&
                              new Date(connection.retryAt).getTime() >
                                Date.now(),
                            )
                          }
                          onImport={(date) =>
                            run({
                              action: 'sync',
                              accountId: connection.accountId,
                              date,
                            })
                          }
                        />
                      )}
                      <StyledDeliveryRow>
                        <StyledDeliveryButton
                          disabled={
                            busy ||
                            connection.running ||
                            Boolean(
                              connection.retryAt &&
                              new Date(connection.retryAt).getTime() >
                                Date.now(),
                            ) ||
                            connection.coverage?.remainingToday === 0
                          }
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
                        <StyledDeliveryButton
                          onClick={() => openConnection(connection)}
                        >
                          <Trans>Edit connection</Trans>
                        </StyledDeliveryButton>
                        <StyledDeliveryButton
                          disabled={busy}
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
                    </StyledReportStack>
                  </details>
                </StyledDeliveryStack>
              </StyledDeliveryCard>
            ))}
          {editing !== undefined && (
            <MetaConnectionForm
              key={editing ? `${editing.accountId}-${editing.revision}` : 'new'}
              initial={editing}
              clientServices={data?.clientServices ?? []}
              formRef={connectionFormRef}
              workspace={workspace}
              busy={busy}
              onCancel={() => requestAction(() => setEditing(undefined))}
              latestRevision={
                data?.connections.find(
                  (connection) => connection.accountId === editing?.accountId,
                )?.revision ??
                editing?.revision ??
                0
              }
              onReload={() =>
                requestAction(() => {
                  const latest = data?.connections.find(
                    (connection) => connection.accountId === editing?.accountId,
                  );
                  if (latest) setEditing(latest);
                })
              }
              onSave={async (configuration) => {
                const saved = await run({ action: 'connect', configuration });
                if (saved) setEditing(undefined);
                return saved;
              }}
            />
          )}
          <h4>
            <Trans>Imported reports</Trans>
          </h4>
          <MetaReportFilters
            value={filters}
            busy={busy || !available}
            onApply={(value) => choose(() => navigation.filter(value))}
          />
          <p>
            <Trans>
              Archived reports keep their figures, decisions and follow-up
              tasks. Reports awaiting review stay active.
            </Trans>
          </p>
          <StyledDeliveryRow>
            <small>
              {data?.total === 1
                ? t`1 matching report`
                : t`${data?.total ?? 0} matching reports`}
            </small>
            {after && (
              <StyledDeliveryButton onClick={() => choose(navigation.newer)}>
                {navigation.hasPrevious ? t`Newer reports` : t`Latest reports`}
              </StyledDeliveryButton>
            )}
            {data?.nextCursor && (
              <StyledDeliveryButton
                onClick={() => choose(() => navigation.older(data.nextCursor!))}
              >
                <Trans>Older reports</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
          {!data?.reports.length && (
            <p>
              <Trans>
                No reports match these filters. Try another date, decision or
                archive view.
              </Trans>
            </p>
          )}
          {(Boolean(data?.reports.length) || selectedReport) && (
            <label>
              <Trans>Select report</Trans>
              <select
                value={selectedReport?.id ?? ''}
                onChange={(event) => {
                  const id = event.target.value;
                  requestAction(() => {
                    navigation.select(id);
                    setExpanded('');
                  });
                }}
              >
                {!selectedReport && (
                  <option value="" disabled>
                    {t`Select another report`}
                  </option>
                )}
                {selectedReport &&
                  !data?.reports.some(
                    (report) => report.id === selectedReport.id,
                  ) && (
                    <option value={selectedReport.id}>
                      {selectedReport.date} · {selectedReport.accountId} ·{' '}
                      {reportStatus(selectedReport.status)} ·{' '}
                      {t`Selected report`}
                    </option>
                  )}
                {data?.reports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.date} · {report.accountId} ·{' '}
                    {reportStatus(report.status)} ·{' '}
                    {new Date(report.fetchedAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectedReportId && !selectedReport && available && (
            <p role="status">
              <Trans>
                The selected report is no longer available to you. Select
                another report.
              </Trans>
            </p>
          )}
          {selectedReport &&
            !data?.reports.some(
              (report) => report.id === selectedReport.id,
            ) && (
              <p role="status">
                <Trans>
                  Your selected report remains open. It is outside this page of
                  results.
                </Trans>
              </p>
            )}
          {(selectedReport ? [selectedReport] : []).map((report) => (
            <StyledDeliveryCard
              key={`${JSON.stringify(requestedFilter)}:${report.id}`}
            >
              <StyledReportStack>
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
                {report.lastCheckedAt && (
                  <small>
                    {t`This version last matched Meta: ${new Date(report.lastCheckedAt).toLocaleString()}`}
                  </small>
                )}
                {report.hasNewerVersion && (
                  <p role="status">
                    <Trans>
                      A newer version is available for manager review. This
                      report’s figures and earlier decisions are preserved.
                    </Trans>
                  </p>
                )}
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
                  <MetaReportAds key={report.id} id={report.id} />
                )}
                <DeliveryGuardedForm
                  revision={0}
                  snapshot={JSON.stringify({
                    id: report.id,
                    status: report.status,
                    projectId: report.projectId,
                    managerId: report.managerId,
                    marketerId: report.marketerId,
                    note: report.note,
                    routing: report.routing,
                  })}
                  busy={busy}
                  visible={
                    report.status === 'REVIEW' &&
                    reportRouting(report)?.marketerId !==
                      workspace.actor.memberId &&
                    (workspace.actor.isAdmin ||
                      (workspace.actor.isManager &&
                        reportRouting(report)?.managerId ===
                          workspace.actor.memberId))
                  }
                  onSave={(fields) =>
                    needsReportAssignment(report)
                      ? Promise.resolve(false)
                      : run({
                          action: 'review',
                          ...(report.engagementId && report.routing
                            ? {
                                expectedRouting: {
                                  projectId: report.routing.projectId,
                                  managerId: report.routing.managerId,
                                  marketerId: report.routing.marketerId,
                                },
                              }
                            : {}),
                          id: report.id,
                          status: fields.get('status'),
                          note: fields.get('note'),
                        })
                  }
                >
                  <StyledDeliveryStack>
                    {report.engagementId && report.routing && (
                      <p>
                        {t`Current project manager`}:{' '}
                        {workspace.members.find(
                          (member) => member.id === report.routing?.managerId,
                        )?.name ?? t`Not assigned`}
                        {' · '}
                        {t`Follow-up goes to`}:{' '}
                        {workspace.members.find(
                          (member) => member.id === report.routing?.marketerId,
                        )?.name ?? t`Not assigned`}
                      </p>
                    )}
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
                    {needsReportAssignment(report) && (
                      <StyledDeliveryStack>
                        <p id={`report-setup-${report.id}`}>
                          <Trans>
                            This report needs a project, a project manager and a
                            separate marketer before a decision can be saved.
                            Set up the connection assignments, then import again
                            and review the new report. Your recommendation stays
                            here while you complete setup.
                          </Trans>
                        </p>
                        {workspace.actor.isAdmin ? (
                          <StyledDeliveryButton
                            type="button"
                            onClick={() =>
                              openConnection(
                                data?.connections.find(
                                  (connection) =>
                                    connection.accountId === report.accountId,
                                ) ?? null,
                                true,
                              )
                            }
                          >
                            <Trans>Set up report assignments</Trans>
                          </StyledDeliveryButton>
                        ) : (
                          <p>
                            <Trans>
                              Ask an administrator to complete the report
                              assignments.
                            </Trans>
                          </p>
                        )}
                      </StyledDeliveryStack>
                    )}
                    <StyledDeliveryButton
                      disabled={busy || needsReportAssignment(report)}
                      aria-describedby={
                        needsReportAssignment(report)
                          ? `report-setup-${report.id}`
                          : undefined
                      }
                      type="submit"
                    >
                      <Trans>Save report decision</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryStack>
                </DeliveryGuardedForm>
                {report.archivedAt && (
                  <p>
                    <Trans>
                      Archived. This report and its original decision are
                      preserved.
                    </Trans>
                  </p>
                )}
                {report.note && <p>{report.note}</p>}
                {report.status !== 'REVIEW' &&
                  (workspace.actor.isAdmin ||
                    (workspace.actor.isManager &&
                      reportRouting(report)?.managerId ===
                        workspace.actor.memberId)) && (
                    <StyledDeliveryButton
                      disabled={busy}
                      onClick={() =>
                        requestAction(() => {
                          void run({
                            action: 'archive',
                            id: report.id,
                            archived: !report.archivedAt,
                          });
                        })
                      }
                    >
                      {report.archivedAt
                        ? t`Restore to active reports`
                        : t`Archive report`}
                    </StyledDeliveryButton>
                  )}
                {report.taskId && (
                  <StyledDeliveryButton
                    onClick={() =>
                      requestAction(() => onOpenTask(report.taskId!))
                    }
                  >
                    <Trans>Open assigned follow-up</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledReportStack>
            </StyledDeliveryCard>
          ))}
        </StyledReportBoundary>
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
type MetaConnectionFormProps = {
  clientServices: MetaClientService[];
  initial: MetaConnection | null;
  formRef: RefObject<HTMLFormElement | null>;
  workspace: DeliveryWorkspace;
  busy: boolean;
  onCancel: () => void;
  onSave: (configuration: Record<string, unknown>) => Promise<boolean>;
  latestRevision: number;
  onReload: () => void;
};
const MetaConnectionForm = ({
  initial,
  clientServices,
  formRef,
  workspace,
  busy,
  onCancel,
  onSave,
  latestRevision,
  onReload,
}: MetaConnectionFormProps) => {
  const { t } = useLingui();
  const [saving, setSaving] = useState(false);
  const [engagementId, setEngagementId] = useState(initial?.engagementId ?? '');
  const clientService = clientServices.find(
    (service) => service.id === engagementId,
  );
  const clientReady = !engagementId || Boolean(clientService?.ready);
  const [scheduleTimezone, setScheduleTimezone] = useState(
    initial?.scheduleTimezone ?? (initial ? '' : 'Asia/Qatar'),
  );
  const memberName = (id: string | null | undefined) =>
    workspace.members.find((member) => member.id === id)?.name ??
    t`Not assigned`;

  const [catchUpDays, setCatchUpDays] = useState(initial?.catchUpDays ?? 14);
  const [refreshDays, setRefreshDays] = useState(initial?.refreshDays ?? 7);
  const [dailyImportLimit, setDailyImportLimit] = useState(
    initial?.dailyImportLimit ?? 10,
  );
  const recoveryValid =
    Number.isInteger(catchUpDays) &&
    catchUpDays >= 1 &&
    catchUpDays <= 90 &&
    Number.isInteger(refreshDays) &&
    refreshDays >= 0 &&
    refreshDays <= Math.min(catchUpDays, 30) &&
    Number.isInteger(dailyImportLimit) &&
    dailyImportLimit >= 1 &&
    dailyImportLimit <= 100;
  const draft = useDeliveryNativeDraft({
    extraValues: { engagementId, scheduleTimezone },
    busy: busy || saving,
  });
  const registerForm = draft.formRef;
  const attachForm = useCallback(
    (form: HTMLFormElement | null) => {
      formRef.current = form;
      registerForm(form);
    },
    [formRef, registerForm],
  );
  const stale = Boolean(initial && initial.revision !== latestRevision);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      busy ||
      saving ||
      stale ||
      !draft.dirty ||
      !recoveryValid ||
      !clientReady
    )
      return;
    const fields = new FormData(event.currentTarget);
    const token = String(fields.get('token') ?? '').trim();
    setSaving(true);
    try {
      await onSave({
        accountId: initial?.accountId ?? fields.get('accountId'),
        revision: initial?.revision ?? 0,
        ...(token ? { token } : {}),
        engagementId: engagementId || null,
        scheduleTimezone: scheduleTimezone || null,
        projectId:
          clientService?.projectId ??
          (String(fields.get('projectId') ?? '') || null),
        managerId:
          clientService?.managerId ??
          (String(fields.get('managerId') ?? '') || null),
        marketerId:
          clientService?.marketerId ??
          (String(fields.get('marketerId') ?? '') || null),
        time: fields.get('time'),
        enabled: fields.get('enabled') === 'on',
        catchUpDays,
        refreshDays,
        dailyImportLimit,
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form ref={attachForm} onChange={draft.onChange} onSubmit={submit}>
      {stale && (
        <DeliveryDraftConflict onReload={onReload} busy={busy || saving} />
      )}
      <fieldset disabled={busy || saving}>
        <StyledDeliveryStack>
          <h4>
            {initial
              ? t`Edit reporting connection`
              : t`New reporting connection`}
          </h4>
          <StyledDeliveryGrid>
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
          </StyledDeliveryGrid>
          <small>
            <Trans>
              Stored encrypted on the server. Leave blank when editing to retain
              the existing token.
            </Trans>
          </small>
          <label>
            <Trans>Report routing</Trans>
            <select
              name="engagementId"
              value={engagementId}
              onChange={(event) => setEngagementId(event.target.value)}
            >
              <option value="">{t`Internal / own business account`}</option>
              {initial?.engagementId &&
                !clientServices.some(
                  (service) => service.id === initial.engagementId,
                ) && (
                  <option
                    value={initial.engagementId}
                  >{t`Previously selected client service is unavailable`}</option>
                )}
              {clientServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                  {service.ready ? '' : t` — needs setup`}
                </option>
              ))}
            </select>
          </label>
          <small>
            {t`Client reports require the Performance marketing service. Set the PM and marketer once in Clients; future reports follow those assignments.`}{' '}
            <Link to="/delivery?view=clients">{t`Open Clients`}</Link>
          </small>
          {engagementId && (
            <section aria-label={t`Client report recipients`}>
              <p>
                {t`Project manager`}: {memberName(clientService?.managerId)} ·{' '}
                {t`Performance marketer`}:{' '}
                {memberName(clientService?.marketerId)}
              </p>
              <p>{t`Founder and secondary administrator receive the report through their current admin access. Recommendations still require independent approval.`}</p>
              {!clientReady && (
                <p role="alert">{t`Configure this client’s Meta responsibilities in Clients before saving this connection.`}</p>
              )}
            </section>
          )}
          <fieldset
            hidden={Boolean(engagementId)}
            disabled={Boolean(engagementId)}
          >
            <StyledDeliveryGrid>
              <label>
                <Trans>Reporting project</Trans>
                <select
                  name="projectId"
                  defaultValue={initial?.projectId ?? ''}
                >
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
                <select
                  name="managerId"
                  defaultValue={initial?.managerId ?? ''}
                >
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
                <select
                  name="marketerId"
                  defaultValue={initial?.marketerId ?? ''}
                >
                  <option value="">{t`Not assigned`}</option>
                  {workspace.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            </StyledDeliveryGrid>
          </fieldset>
          <label>
            <Trans>Reporting schedule timezone</Trans>
            <select
              value={scheduleTimezone}
              onChange={(event) => setScheduleTimezone(event.target.value)}
            >
              <option value="Asia/Qatar">{t`Qatar (Asia/Qatar)`}</option>
              <option value="">{t`Ad-account timezone`}</option>
            </select>
          </label>
          <small>{t`The schedule uses this timezone. Performance dates and spending remain in the ad account’s timezone and currency.`}</small>
          <label>
            <Trans>Daily reporting time</Trans>
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
          <details>
            <summary>
              <Trans>Missed days and conversion refresh</Trans>
            </summary>
            <StyledDeliveryStack>
              <p>
                <Trans>
                  Recovery runs after the daily reporting time. Recent dates are
                  checked again for delayed conversions. Changed figures create
                  a new report for review; previous approvals stay intact.
                </Trans>
              </p>
              <StyledDeliveryGrid>
                <label>
                  <Trans>Days to recover automatically</Trans>
                  <input
                    name="catchUpDays"
                    type="number"
                    min={1}
                    max={90}
                    step={1}
                    required
                    value={catchUpDays}
                    onChange={(event) =>
                      setCatchUpDays(Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  <Trans>Recent days to refresh for conversions</Trans>
                  <input
                    name="refreshDays"
                    type="number"
                    min={0}
                    max={Math.min(30, catchUpDays)}
                    step={1}
                    required
                    value={refreshDays}
                    onChange={(event) =>
                      setRefreshDays(Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  <Trans>Maximum import attempts per account each day</Trans>
                  <input
                    name="dailyImportLimit"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    required
                    value={dailyImportLimit}
                    onChange={(event) =>
                      setDailyImportLimit(Number(event.target.value))
                    }
                  />
                </label>
              </StyledDeliveryGrid>
              <small>
                <Trans>
                  Use 0 to stop rolling refreshes. The refresh window cannot
                  exceed the recovery window.
                </Trans>
              </small>
              {!recoveryValid && (
                <p role="alert">
                  <Trans>
                    Use 1–90 recovery days, 0–30 refresh days within that
                    window, and 1–100 attempts per day.
                  </Trans>
                </p>
              )}
            </StyledDeliveryStack>
          </details>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              disabled={
                busy ||
                saving ||
                stale ||
                !draft.dirty ||
                !recoveryValid ||
                !clientReady
              }
              type="submit"
            >
              <Trans>Test and save connection</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton type="button" onClick={onCancel}>
              <Trans>Cancel</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      </fieldset>
    </form>
  );
};
