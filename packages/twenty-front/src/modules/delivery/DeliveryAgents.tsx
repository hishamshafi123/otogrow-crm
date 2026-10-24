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
  context: Record<string, unknown>;
  taskRevision: number;
  agentVersion: number;
};
type DeliveryAgentsProps = {
  workspace: DeliveryWorkspace;
  task?: DeliveryTask;
  onTaskChanged: () => Promise<unknown>;
};
export const DeliveryAgents = ({
  workspace,
  task,
  onTaskChanged,
}: DeliveryAgentsProps) => {
  const { t } = useLingui();
  const query = useQuery<{ deliveryAgents: DeliveryAgentsSnapshot }>(
    GET_AGENTS,
    { fetchPolicy: 'network-only', pollInterval: 5000 },
  );
  const [mutate, mutation] = useMutation<{
    changeDeliveryAgents: Preview | { runId: string } | { saved: string };
  }>(CHANGE_AGENTS);
  const [error, setError] = useState('');
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
  const data = query.data?.deliveryAgents;
  const selected = data?.agents.find((agent) => agent.id === agentId);
  const change = async (input: Record<string, unknown>) => {
    setError('');
    try {
      const result = await mutate({ variables: { input } });
      await query.refetch();
      return result.data?.changeDeliveryAgents ?? null;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Unable to complete the request.`,
      );
      return null;
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
      <p role={query.error ? 'alert' : 'status'}>
        {query.error?.message ?? t`Loading agents…`}
      </p>
    );
  const runs = data.runs.filter((run) => !task || run.taskId === task.id);
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <h2>{task ? t`Task assistance` : t`Delivery agents`}</h2>
        <StyledDeliveryButton
          onClick={() => void query.refetch()}
          disabled={query.loading}
        >
          <Trans>Refresh agents</Trans>
        </StyledDeliveryButton>
        {!task && workspace.actor.isAdmin && (
          <StyledDeliveryButton onClick={() => setEditing({})}>
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
          {editing && (
            <DeliveryAgentForm
              key={`${editing.agent?.id ?? 'new'}-${editing.duplicate}`}
              agent={editing.agent}
              duplicate={editing.duplicate}
              workspace={workspace}
              models={data.models}
              busy={mutation.loading}
              save={async (input) => Boolean(await change(input))}
              close={() => setEditing(null)}
            />
          )}
          {!data.agents.length && (
            <StyledDeliveryCard>
              <p>
                <Trans>
                  No delivery agents yet. An admin can create a brief checker,
                  copy checker or SEO verifier and enable it for selected
                  projects.
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
                      {agent.configuration.enabled ? t`Enabled` : t`Disabled`}
                    </StyledDeliveryBadge>
                  </StyledDeliveryRow>
                  <p>{agent.configuration.purpose}</p>
                  <p>
                    <Trans>Version</Trans> {agent.version} ·{' '}
                    {agent.configuration.modelId ?? t`Public page tool`} ·{' '}
                    {agent.configuration.dailyRunLimit} <Trans>runs/day</Trans>
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
                  {workspace.actor.isAdmin && (
                    <StyledDeliveryRow>
                      <StyledDeliveryButton
                        onClick={() => setEditing({ agent })}
                      >
                        <Trans>Configure</Trans>
                      </StyledDeliveryButton>
                      <StyledDeliveryButton
                        onClick={() => setEditing({ agent, duplicate: true })}
                      >
                        <Trans>Duplicate</Trans>
                      </StyledDeliveryButton>
                      <StyledDeliveryButton
                        disabled={mutation.loading}
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
                        {agent.configuration.enabled ? t`Disable` : t`Enable`}
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
                value={agentId}
                onChange={(event) => {
                  setAgentId(event.target.value);
                  resetPreview();
                }}
              >
                <option value="">{t`Select an enabled agent`}</option>
                {data.agents
                  .filter(
                    (agent) =>
                      agent.configuration.enabled &&
                      agent.configuration.projectIds.includes(task.projectId),
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
                        Copy to check (leave blank to use the latest submission)
                      </Trans>
                      <textarea
                        rows={4}
                        maxLength={20000}
                        value={copy}
                        onChange={(event) => {
                          setCopy(event.target.value);
                          resetPreview();
                        }}
                      />
                    </label>
                    <label>
                      <Trans>Brand requirements and additional context</Trans>
                      <textarea
                        rows={3}
                        maxLength={12000}
                        value={requirements}
                        onChange={(event) => {
                          setRequirements(event.target.value);
                          resetPreview();
                        }}
                      />
                    </label>
                    <p>
                      <Trans>
                        Only task text and supplied requirements go to the
                        selected model. Linked videos and images are not opened.
                        Provider charges may apply; pricing is unknown here.
                      </Trans>
                    </p>
                  </>
                )}
                <StyledDeliveryButton
                  disabled={mutation.loading}
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
                        preview.taskRevision !== task.revision ||
                        preview.agentVersion !== selected.version
                      }
                      onClick={async () => {
                        if (
                          await change({
                            type: 'start',
                            taskId: task.id,
                            agentId,
                            inputs,
                            requestId,
                            taskRevision: preview.taskRevision,
                            agentVersion: preview.agentVersion,
                          })
                        )
                          resetPreview();
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
              <StyledDeliveryBadge>{statuses[run.status]}</StyledDeliveryBadge>
            </StyledDeliveryRow>
            <p>
              {
                workspace.tasks.find((candidate) => candidate.id === run.taskId)
                  ?.title
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
                    <p style={{ whiteSpace: 'pre-wrap' }}>{finding.evidence}</p>
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
              {run.configuration.kind === 'SEO' ? t`No model call` : t`Unknown`}
            </p>
            {run.decision && (
              <p>
                <Trans>Human decision:</Trans>{' '}
                {run.decision.action === 'ACCEPT' ? t`Accepted` : t`Rejected`} ·{' '}
                {new Date(run.decision.at).toLocaleString()}
              </p>
            )}
            <details>
              <summary>
                <Trans>Inputs, configuration and activity</Trans>
              </summary>
              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
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
                {run.result?.suggestedBrief && workspace.actor.isManager && (
                  <StyledDeliveryButton
                    disabled={mutation.loading}
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
                    disabled={mutation.loading}
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
                  disabled={mutation.loading}
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
                <StyledDeliveryButton
                  disabled={mutation.loading}
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
                disabled={mutation.loading}
                onClick={() => void change({ type: 'cancel', runId: run.id })}
              >
                <Trans>Cancel run</Trans>
              </StyledDeliveryButton>
            )}
            {['FAILED', 'CANCELLED'].includes(run.status) && (
              <p>
                <Trans>
                  To retry, preview current inputs and start a new run from the
                  task. Interrupted provider calls may still be charged.
                </Trans>
              </p>
            )}
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      ))}
    </StyledDeliveryStack>
  );
};
