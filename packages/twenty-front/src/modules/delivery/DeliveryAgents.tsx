import { styled } from '@linaria/react';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { GET_OTOGROW_ROLE_DIRECTORY } from '@/otogrow-access/otogrow-access.graphql';
import { type OtogrowRoleDirectory } from '@/otogrow-access/otogrow-access.types';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { useState } from 'react';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { DeliveryAgentForm } from '@/delivery/DeliveryAgentForm';
import {
  type DeliveryAgent,
  type DeliveryAgentsSnapshot,
} from '@/delivery/delivery-agent.types';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const GET_AGENTS = gql`
  query DeliveryAgents {
    deliveryAgents
  }
`;
const CHANGE_AGENTS = gql`
  mutation ChangeDeliveryAgents($input: JSON!) {
    changeDeliveryAgents(input: $input)
  }
`;
type Preview = {
  context: Record<string, unknown> & {
    brandKnowledge?: {
      fingerprint: string;
      totalSources: number;
      omittedSources: number;
    };
  };
  taskRevision: number;
  agentVersion: number;
  budget?: {
    maximumCostUsd: string | null;
    pricingRevision: number | null;
    budgetReady: boolean;
    blockedReason: string | null;
  };
};
type DeliveryAgentsProps = {
  workspace: DeliveryWorkspace;
  task?: DeliveryTask;
  onTaskChanged: () => Promise<unknown>;
};
const StyledAgentBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
export const DeliveryAgents = (props: DeliveryAgentsProps) => {
  const permission = useWorkflowAccess();
  return (
    <AgentWorkspace
      key={`${permission.scope}:${props.task?.id ?? 'all'}`}
      workspace={props.workspace}
      task={props.task}
      onTaskChanged={props.onTaskChanged}
      permission={permission}
    />
  );
};
const AgentWorkspace = ({
  workspace,
  task,
  onTaskChanged,
  permission,
}: DeliveryAgentsProps & {
  permission: ReturnType<typeof useWorkflowAccess>;
}) => {
  const { t } = useLingui();
  const query = useQuery<{ deliveryAgents: DeliveryAgentsSnapshot }>(
    GET_AGENTS,
    { fetchPolicy: 'no-cache', pollInterval: 5000, skip: !permission.ready },
  );
  const directoryQuery = useQuery<{
    otogrowRoleDirectory: OtogrowRoleDirectory;
  }>(GET_OTOGROW_ROLE_DIRECTORY, {
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    skip: !permission.ready || !permission.canManageRoles || Boolean(task),
  });
  const directory =
    permission.canManageRoles &&
    !directoryQuery.error &&
    permission.matches(directoryQuery.data?.otogrowRoleDirectory.actor)
      ? directoryQuery.data?.otogrowRoleDirectory
      : undefined;
  const [mutate, mutation] = useMutation<{
    changeDeliveryAgents: Preview | { runId: string } | { saved: string };
  }>(CHANGE_AGENTS);
  const [error, setError] = useState('');
  const { requestAction } = useDeliveryDraftGuard();
  const [requesting, setRequesting] = useState(false);
  const [editing, setEditing] = useState<{
    agent?: DeliveryAgent;
    duplicate?: boolean;
  } | null>(null);
  const [agentId, setAgentId] = useState('');
  const [copy, setCopy] = useState(task?.details.draftCopy ?? '');
  const [requirements, setRequirements] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [anchor, setAnchor] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const candidate = query.data?.deliveryAgents;
  const available = !query.error && permission.matches(candidate?.actor);
  const [lastVerifiedData, setLastVerifiedData] =
    useState<DeliveryAgentsSnapshot>();
  if (available && candidate !== lastVerifiedData)
    setLastVerifiedData(candidate);
  const data = available ? candidate : lastVerifiedData;
  const selected = data?.agents.find(
    (agent) => agent.id === agentId && data.runnableAgentIds.includes(agent.id),
  );
  const change = async (input: Record<string, unknown>) => {
    if (requesting || !available) return null;
    setRequesting(true);
    setError('');
    try {
      const result = await mutate({ variables: { input } });
      try {
        await query.refetch();
      } catch {
        setError(
          t`The request completed, but the latest view could not load. Refresh before trying another action.`,
        );
      }
      return result.data?.changeDeliveryAgents ?? null;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Unable to complete the request.`,
      );
      return null;
    } finally {
      setRequesting(false);
    }
  };
  const resetPreview = () => {
    setPreview(null);
    setRequestId(crypto.randomUUID());
  };
  const inputs = {
    copy,
    requirements,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(targetUrl ? { targetUrl } : {}),
    ...(anchor ? { anchor } : {}),
  };
  const [inputBaseline, setInputBaseline] = useState(() =>
    JSON.stringify(inputs),
  );
  useDeliveryDraftStatus({
    dirty: Boolean(task) && JSON.stringify(inputs) !== inputBaseline,
    saving: mutation.loading || requesting,
  });
  const changeAgent = (nextAgentId: string) =>
    requestAction(() => {
      setAgentId(nextAgentId);
      setCopy(task?.details.draftCopy ?? '');
      setRequirements('');
      setSourceUrl('');
      setTargetUrl('');
      setAnchor('');
      setInputBaseline(
        JSON.stringify({
          copy: task?.details.draftCopy ?? '',
          requirements: '',
        }),
      );
      resetPreview();
    });
  const statuses: Record<string, string> = {
    QUEUED: t`Queued`,
    RUNNING: t`Running`,
    WAITING_REVIEW: t`Needs human review`,
    SUCCEEDED: t`Reviewed`,
    FAILED: t`Failed`,
    CANCELLED: t`Cancelled`,
  };
  if (!data)
    return (
      <StyledDeliveryStack>
        <p role={query.error || permission.error ? 'alert' : 'status'}>
          {query.error?.message ??
            permission.error?.message ??
            (query.loading
              ? t`Loading agents…`
              : t`Assistant access could not be verified.`)}
        </p>
        <StyledDeliveryButton
          onClick={() => {
            void query.refetch().catch(() => undefined);
            void permission.refetch?.();
          }}
        >
          <Trans>Retry assistants</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    );
  const runs = data.runs.filter((run) => !task || run.taskId === task.id);
  return (
    <StyledDeliveryStack>
      {!available && (
        <div role="alert">
          <p>
            <Trans>
              Assistant access could not be verified. Your drafts are kept;
              refresh to continue.
            </Trans>
          </p>
          <StyledDeliveryButton
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Retry assistants</Trans>
          </StyledDeliveryButton>
        </div>
      )}
      <StyledAgentBoundary hidden={!available} disabled={!available}>
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <h2>{task ? t`Task assistance` : t`Delivery agents`}</h2>
            <StyledDeliveryButton
              onClick={() => {
                void query.refetch().catch(() => undefined);
                if (permission.canManageRoles && !task)
                  void directoryQuery.refetch().catch(() => undefined);
              }}
              disabled={query.loading}
            >
              <Trans>Refresh agents</Trans>
            </StyledDeliveryButton>
            {!task && permission.canManageRoles && (
              <StyledDeliveryButton
                disabled={editing !== null}
                onClick={() => requestAction(() => setEditing({}))}
              >
                <Trans>Create agent</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
          <p>
            <Trans>
              Agents provide findings and proposed edits. Your assigned manager
              still approves delivery work.
            </Trans>
          </p>
          {(error || query.error) && (
            <p role="alert">{error || query.error?.message}</p>
          )}
          {!task && (
            <>
              {editing && !permission.canManageRoles && (
                <p role="status">
                  <Trans>
                    Administrator access is required to configure assistants.
                    Your unsaved edits are kept.
                  </Trans>
                </p>
              )}
              {editing && (
                <StyledAgentBoundary
                  hidden={!permission.canManageRoles}
                  disabled={!permission.canManageRoles}
                >
                  <DeliveryAgentForm
                    key={`${editing.agent?.id ?? 'new'}-${editing.agent?.version ?? 0}-${editing.duplicate}`}
                    agent={editing.agent}
                    duplicate={editing.duplicate}
                    workspace={workspace}
                    directory={directory}
                    models={data.models}
                    busy={mutation.loading || requesting}
                    latestVersion={
                      editing.agent
                        ? (data.agents.find(
                            (agent) => agent.id === editing.agent?.id,
                          )?.version ?? -1)
                        : undefined
                    }
                    onReload={() =>
                      requestAction(() => {
                        const latest = data.agents.find(
                          (agent) => agent.id === editing.agent?.id,
                        );
                        if (latest)
                          setEditing({
                            agent: latest,
                            duplicate: editing.duplicate,
                          });
                        else
                          setError(
                            t`This assistant is no longer available. Your edits are still here.`,
                          );
                      })
                    }
                    save={async (input) => Boolean(await change(input))}
                    close={() => setEditing(null)}
                  />
                </StyledAgentBoundary>
              )}
              {!data.agents.length && (
                <StyledDeliveryCard>
                  <p>
                    <Trans>
                      No delivery agents yet. An admin can create a brief
                      checker, copy checker or SEO verifier and enable it for
                      selected projects.
                    </Trans>
                  </p>
                </StyledDeliveryCard>
              )}
              <StyledDeliveryGrid>
                {data.agents.map((agent) => (
                  <StyledDeliveryCard key={agent.id}>
                    <StyledDeliveryStack>
                      <StyledDeliveryRow>
                        <h3>{agent.configuration.name}</h3>
                        <StyledDeliveryBadge>
                          {agent.configuration.enabled
                            ? t`Enabled`
                            : t`Disabled`}
                        </StyledDeliveryBadge>
                      </StyledDeliveryRow>
                      <p>{agent.configuration.purpose}</p>
                      <p>
                        <Trans>Version</Trans> {agent.version} ·{' '}
                        {agent.configuration.modelId ?? t`Public page tool`} ·{' '}
                        {agent.configuration.dailyRunLimit}{' '}
                        <Trans>runs/day</Trans>
                      </p>
                      <p>
                        {agent.configuration.projectIds
                          .map(
                            (id) =>
                              workspace.projects.find(
                                (project) => project.id === id,
                              )?.name,
                          )
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                      {permission.canManageRoles && (
                        <StyledDeliveryRow>
                          <StyledDeliveryButton
                            disabled={editing !== null}
                            onClick={() =>
                              requestAction(() => setEditing({ agent }))
                            }
                          >
                            <Trans>Configure</Trans>
                          </StyledDeliveryButton>
                          <StyledDeliveryButton
                            disabled={editing !== null}
                            onClick={() =>
                              requestAction(() =>
                                setEditing({ agent, duplicate: true }),
                              )
                            }
                          >
                            <Trans>Duplicate</Trans>
                          </StyledDeliveryButton>
                          <StyledDeliveryButton
                            disabled={mutation.loading || requesting}
                            onClick={() =>
                              void change({
                                type: 'save',
                                id: agent.id,
                                version: agent.version,
                                configuration: {
                                  ...agent.configuration,
                                  enabled: !agent.configuration.enabled,
                                },
                              })
                            }
                          >
                            {agent.configuration.enabled
                              ? t`Disable`
                              : t`Enable`}
                          </StyledDeliveryButton>
                        </StyledDeliveryRow>
                      )}
                    </StyledDeliveryStack>
                  </StyledDeliveryCard>
                ))}
              </StyledDeliveryGrid>
            </>
          )}
          {task && (
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <label>
                  <Trans>Choose an agent</Trans>
                  <select
                    disabled={mutation.loading || requesting}
                    value={agentId}
                    onChange={(event) => {
                      changeAgent(event.target.value);
                    }}
                  >
                    <option value="">{t`Select an enabled agent`}</option>
                    {data.agents
                      .filter(
                        (agent) =>
                          data.runnableAgentIds.includes(agent.id) &&
                          agent.configuration.enabled &&
                          agent.configuration.projectIds.includes(
                            task.projectId,
                          ),
                      )
                      .map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.configuration.name}
                        </option>
                      ))}
                  </select>
                </label>
                {selected && (
                  <>
                    <p>{selected.configuration.purpose}</p>
                    {selected.configuration.kind === 'SEO' ? (
                      <>
                        <label>
                          <Trans>Public source page URL</Trans>
                          <input
                            type="url"
                            disabled={mutation.loading || requesting}
                            value={sourceUrl}
                            onChange={(event) => {
                              setSourceUrl(event.target.value);
                              resetPreview();
                            }}
                          />
                        </label>
                        <label>
                          <Trans>Expected destination URL (exact match)</Trans>
                          <input
                            type="url"
                            disabled={mutation.loading || requesting}
                            value={targetUrl}
                            onChange={(event) => {
                              setTargetUrl(event.target.value);
                              resetPreview();
                            }}
                          />
                        </label>
                        <label>
                          <Trans>Expected anchor text (optional)</Trans>
                          <input
                            disabled={mutation.loading || requesting}
                            value={anchor}
                            onChange={(event) => {
                              setAnchor(event.target.value);
                              resetPreview();
                            }}
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <label>
                          <Trans>
                            Copy to check (leave blank to use the latest
                            submission)
                          </Trans>
                          <textarea
                            rows={4}
                            maxLength={20000}
                            disabled={mutation.loading || requesting}
                            value={copy}
                            onChange={(event) => {
                              setCopy(event.target.value);
                              resetPreview();
                            }}
                          />
                        </label>
                        <label>
                          <Trans>
                            Brand requirements and additional context
                          </Trans>
                          <textarea
                            rows={3}
                            maxLength={12000}
                            disabled={mutation.loading || requesting}
                            value={requirements}
                            onChange={(event) => {
                              setRequirements(event.target.value);
                              resetPreview();
                            }}
                          />
                        </label>
                        <p>
                          <Trans>
                            Task text, supplied requirements and published
                            project brand knowledge go to the selected model.
                            Linked videos and images are not opened. Preview the
                            inputs and source versions before starting a paid
                            request.
                          </Trans>
                        </p>
                      </>
                    )}
                    <StyledDeliveryButton
                      disabled={mutation.loading || requesting}
                      onClick={async () => {
                        const result = await change({
                          type: 'preview',
                          taskId: task.id,
                          agentId,
                          inputs,
                        });
                        if (result && 'context' in result) {
                          setPreview(result);
                          setRequestId(crypto.randomUUID());
                        }
                      }}
                    >
                      <Trans>Preview inputs</Trans>
                    </StyledDeliveryButton>
                    {preview && (
                      <>
                        {selected.configuration.kind !== 'SEO' && (
                          <StyledDeliveryCard>
                            <p>
                              {preview.budget?.maximumCostUsd
                                ? t`Maximum reservation: USD ${preview.budget.maximumCostUsd}`
                                : t`A verified price is required before this request can run.`}
                            </p>
                            <small>
                              <Trans>
                                This is a conservative hold, not a confirmed
                                charge. Current access and available budget are
                                checked again when the request starts.
                              </Trans>
                            </small>
                            {!preview.budget?.budgetReady && (
                              <p role="status">
                                {preview.budget?.blockedReason ??
                                  t`Ask an administrator to configure production AI spending.`}
                              </p>
                            )}
                          </StyledDeliveryCard>
                        )}
                        {preview.context.brandKnowledge && (
                          <p role="status">
                            <Trans>
                              Approved brand knowledge sources included:
                            </Trans>{' '}
                            {preview.context.brandKnowledge.totalSources -
                              preview.context.brandKnowledge
                                .omittedSources}{' '}
                            / {preview.context.brandKnowledge.totalSources}.{' '}
                            <Trans>
                              Review source versions and any omissions below.
                            </Trans>
                          </p>
                        )}
                        <details open>
                          <summary>
                            <Trans>Inputs for this run</Trans>
                          </summary>
                          <pre
                            style={{
                              whiteSpace: 'pre-wrap',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {JSON.stringify(preview.context, null, 2)}
                          </pre>
                        </details>
                        <StyledDeliveryButton
                          disabled={
                            mutation.loading ||
                            requesting ||
                            preview.taskRevision !== task.revision ||
                            preview.agentVersion !== selected.version ||
                            (selected.configuration.kind !== 'SEO' &&
                              !preview.budget?.budgetReady)
                          }
                          onClick={async () => {
                            if (
                              await change({
                                type: 'start',
                                knowledgeFingerprint:
                                  preview.context.brandKnowledge?.fingerprint,
                                taskId: task.id,
                                agentId,
                                inputs,
                                requestId,
                                taskRevision: preview.taskRevision,
                                agentVersion: preview.agentVersion,
                                pricingRevision:
                                  preview.budget?.pricingRevision,
                              })
                            ) {
                              setInputBaseline(JSON.stringify(inputs));
                              resetPreview();
                            }
                          }}
                        >
                          {selected.configuration.kind === 'SEO'
                            ? t`Start public page check`
                            : t`Start model run`}
                        </StyledDeliveryButton>
                        {(preview.taskRevision !== task.revision ||
                          preview.agentVersion !== selected.version) && (
                          <p role="status">
                            <Trans>
                              Task or agent changed. Preview the inputs again.
                            </Trans>
                          </p>
                        )}
                      </>
                    )}
                  </>
                )}
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          )}
          <h3>
            <Trans>Run history</Trans>
          </h3>
          <p>
            <Trans>
              Showing the latest 500 workspace runs you can access. Refresh or
              reopen a task to see updated delivery details.
            </Trans>
          </p>
          {!runs.length && (
            <p>
              <Trans>No runs yet.</Trans>
            </p>
          )}
          {runs.map((run) => (
            <StyledDeliveryCard key={run.id}>
              <StyledDeliveryStack>
                <StyledDeliveryRow>
                  <strong>{run.configuration.name}</strong>
                  <StyledDeliveryBadge>
                    {statuses[run.status]}
                  </StyledDeliveryBadge>
                </StyledDeliveryRow>
                <p>
                  {
                    workspace.tasks.find(
                      (candidate) => candidate.id === run.taskId,
                    )?.title
                  }{' '}
                  · {new Date(run.createdAt).toLocaleString()} ·{' '}
                  <Trans>Agent version</Trans> {run.agentVersion} ·{' '}
                  <Trans>Task revision</Trans> {run.taskRevision}
                </p>
                {run.error && <p role="alert">{run.error}</p>}
                {run.result && (
                  <>
                    <p>{run.result.summary}</p>
                    {run.result.findings.map((finding, index) => (
                      <StyledDeliveryCard key={index}>
                        <strong>{finding.severity}</strong>
                        <p style={{ whiteSpace: 'pre-wrap' }}>
                          {finding.evidence}
                        </p>
                        <p>{finding.correction}</p>
                      </StyledDeliveryCard>
                    ))}
                    {run.result.suggestedBrief && (
                      <details open>
                        <summary>
                          <Trans>Proposed brief</Trans>
                        </summary>
                        <p style={{ whiteSpace: 'pre-wrap' }}>
                          {run.result.suggestedBrief}
                        </p>
                      </details>
                    )}
                    {run.result.suggestedCopy && (
                      <details open>
                        <summary>
                          <Trans>Proposed copy</Trans>
                        </summary>
                        <p style={{ whiteSpace: 'pre-wrap' }}>
                          {run.result.suggestedCopy}
                        </p>
                      </details>
                    )}
                  </>
                )}
                <p>
                  <Trans>Input tokens:</Trans>{' '}
                  {run.usage?.inputTokens ?? t`Unknown`} ·{' '}
                  <Trans>Output tokens:</Trans>{' '}
                  {run.usage?.outputTokens ?? t`Unknown`} ·{' '}
                  <Trans>Provider cost:</Trans>{' '}
                  {run.configuration.kind === 'SEO'
                    ? t`No model call`
                    : t`Unknown`}
                </p>
                {run.decision && (
                  <p>
                    <Trans>Human decision:</Trans>{' '}
                    {run.decision.action === 'ACCEPT'
                      ? t`Accepted`
                      : t`Rejected`}{' '}
                    · {new Date(run.decision.at).toLocaleString()}
                  </p>
                )}
                <details>
                  <summary>
                    <Trans>Inputs, configuration and activity</Trans>
                  </summary>
                  <pre
                    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                  >
                    {JSON.stringify(
                      {
                        context: run.context,
                        configuration: run.configuration,
                        activity: run.activity,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
                {run.status === 'WAITING_REVIEW' && (
                  <StyledDeliveryRow>
                    <fieldset
                      disabled={!data.runnableAgentIds.includes(run.agentId)}
                    >
                      <StyledDeliveryRow>
                        {run.result?.suggestedBrief && permission.manager && (
                          <StyledDeliveryButton
                            disabled={mutation.loading || requesting}
                            onClick={async () => {
                              if (
                                await change({
                                  type: 'decide',
                                  runId: run.id,
                                  action: 'ACCEPT',
                                  field: 'brief',
                                })
                              )
                                await onTaskChanged();
                            }}
                          >
                            <Trans>Accept proposed brief</Trans>
                          </StyledDeliveryButton>
                        )}
                        {run.result?.suggestedCopy && (
                          <StyledDeliveryButton
                            disabled={mutation.loading || requesting}
                            onClick={async () => {
                              if (
                                await change({
                                  type: 'decide',
                                  runId: run.id,
                                  action: 'ACCEPT',
                                  field: 'copy',
                                })
                              )
                                await onTaskChanged();
                            }}
                          >
                            <Trans>Accept copy as draft</Trans>
                          </StyledDeliveryButton>
                        )}
                        <StyledDeliveryButton
                          disabled={mutation.loading || requesting}
                          onClick={() =>
                            void change({
                              type: 'decide',
                              runId: run.id,
                              action: 'ACCEPT',
                              field: null,
                            })
                          }
                        >
                          <Trans>Acknowledge findings only</Trans>
                        </StyledDeliveryButton>
                      </StyledDeliveryRow>
                    </fieldset>
                    {!data.runnableAgentIds.includes(run.agentId) && (
                      <p>
                        <Trans>
                          Your current access allows review and rejection, but
                          not accepting this assistant's output.
                        </Trans>
                      </p>
                    )}
                    <StyledDeliveryButton
                      disabled={mutation.loading || requesting}
                      onClick={() =>
                        void change({
                          type: 'decide',
                          runId: run.id,
                          action: 'REJECT',
                          field: null,
                        })
                      }
                    >
                      <Trans>Reject result</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                )}
                {['QUEUED', 'RUNNING'].includes(run.status) && (
                  <StyledDeliveryButton
                    disabled={mutation.loading || requesting}
                    onClick={() =>
                      void change({ type: 'cancel', runId: run.id })
                    }
                  >
                    <Trans>Cancel run</Trans>
                  </StyledDeliveryButton>
                )}
                {['FAILED', 'CANCELLED'].includes(run.status) && (
                  <p>
                    <Trans>
                      To retry, preview current inputs and start a new run from
                      the task. Interrupted provider calls may still be charged.
                    </Trans>
                  </p>
                )}
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          ))}
        </StyledDeliveryStack>
      </StyledAgentBoundary>
    </StyledDeliveryStack>
  );
};
