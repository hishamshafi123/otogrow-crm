import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { AssistantContextSummary } from '@/delivery/assistants/AssistantContextSummary';
import { assistantInputProblems } from '@/delivery/assistants/assistant-inputs';
import { useLayoutEffect, useRef, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { isDefined } from 'twenty-shared/utils';
import {
  type DeliveryAssistantRequestQuery,
  type StartDeliveryAssistantInput,
} from '~/generated-metadata/graphql';
import { GET_ASSISTANT_REQUEST } from '@/delivery/assistants/delivery-assistants.graphql';
import { assistantDestination } from '@/delivery/assistants/assistant-navigation';
import {
  type AssistantPreview,
  type AssistantSummary,
  type AssistantContext,
} from '@/delivery/assistants/assistant.types';
import { type useAssistantContext } from '@/delivery/assistants/useAssistantContext';
import { type useAssistantCommands } from '@/delivery/assistants/useAssistantCommands';
import { StyledAssistantBoundary } from '@/delivery/assistants/assistantStyles';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const AssistantPreparation = ({
  state,
  commands,
  assistant,
  requestId,
  task,
  newIntent,
  consumeRequestIntent,
  openRun,
}: {
  state: ReturnType<typeof useAssistantContext>;
  commands: ReturnType<typeof useAssistantCommands>;
  assistant: AssistantSummary;
  requestId: string;
  task: NonNullable<AssistantContext['selectedTask']>;
  newIntent: boolean;
  consumeRequestIntent: () => void;
  openRun: (id: string) => void;
}) => {
  const { t } = useLingui();
  const focusPanel = useAssistantPanelFocus();
  const [params] = useSearchParams();
  const { requestAction } = useDeliveryDraftGuard();
  const [inputs, setInputs] = useState({
    copy: task.draftCopy,
    requirements: '',
    sourceUrl: '',
    targetUrl: '',
    anchor: '',
  });
  const [baseline] = useState(() => JSON.stringify(inputs));
  const [preview, setPreview] = useState<AssistantPreview | null>(null);
  const [frozen, setFrozen] = useState<StartDeliveryAssistantInput | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const [recovered, setRecovered] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [checked, setChecked] = useState(newIntent);
  const [ownsOriginalInputs] = useState(newIntent);
  useLayoutEffect(() => consumeRequestIntent(), [consumeRequestIntent]);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const available =
    state.data?.selectedTask?.id === task.id &&
    state.permission.ready &&
    assistant.canRun &&
    ['BRIEF', 'COPY', 'SEO'].includes(assistant.kind);
  const stale =
    preview !== null &&
    (preview.taskRevision !== state.data?.selectedTask?.revision ||
      preview.agentVersion !== assistant.version);
  const problems = assistantInputProblems({
    kind: assistant.kind,
    requiredInputs: assistant.requiredInputs,
    brief: state.data?.selectedTask?.brief ?? task.brief,
    ...inputs,
  });
  const problemLabels: Record<string, string> = {
    brief: t`A task brief is required. Open the current task to prepare it.`,
    copy: t`Enter the copy this assistant should check.`,
    requirements: t`Enter the brand requirements this assistant needs.`,
    sourceUrl: t`Enter a public HTTP or HTTPS source URL.`,
    targetUrl: t`Enter the exact HTTP or HTTPS destination URL.`,
  };
  useDeliveryDraftStatus({
    dirty:
      recovered === null &&
      (JSON.stringify(inputs) !== baseline ||
        preview !== null ||
        frozen !== null ||
        confirmed),
    saving: commands.busy || checking,
  });
  // oxlint-disable-next-line twenty/no-state-useref -- Exact-request recovery cannot publish into a changed authority/task source.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [state.scope, available]);
  const check = async () => {
    if (!state.permission.ready || state.data === null || checking) return;
    const started = epoch.current;
    setChecking(true);
    setNotice('');
    setRetryAllowed(false);
    try {
      const response =
        await state.query.client.query<DeliveryAssistantRequestQuery>({
          query: GET_ASSISTANT_REQUEST,
          variables: { input: { requestId } },
          fetchPolicy: 'no-cache',
        });
      const result = response.data?.deliveryAssistantRequest;
      if (
        started !== epoch.current ||
        !state.permission.matches(result) ||
        result?.requestId !== requestId
      )
        return;
      if (result.receipt !== null && result.receipt !== undefined) {
        if (
          !state.permission.matches(result.receipt) ||
          result.receipt.taskId !== task.id ||
          result.receipt.agentId !== assistant.id
        ) {
          setNotice(
            t`The saved request does not match this prepared task and assistant. No new request was sent.`,
          );
          return;
        }
        setRecovered(result.receipt.runId);
        setFrozen(null);
        setPreview(null);
        setConfirmed(false);
        setNotice(
          t`The original request was found. Open its saved run for current status.`,
        );
      } else if (result.receipt === null) {
        setChecked(ownsOriginalInputs || frozen !== null);
        setRetryAllowed(frozen !== null);
        setNotice(
          frozen !== null
            ? t`No accessible matching run was found. Only the exact original prepared start can be retried; visibility or an earlier response may still be uncertain.`
            : t`No accessible matching run was found. The original prepared inputs are not saved in this link, so a different body cannot be sent under this request ID. Close this preparation to explicitly prepare a new request; an earlier accepted run is not stopped.`,
        );
      } else
        setNotice(
          t`The exact request response could not be verified. Keep its request ID and check again.`,
        );
    } catch {
      if (started === epoch.current)
        setNotice(
          t`The original request could not be checked. Your inputs and request ID are kept.`,
        );
    } finally {
      setChecking(false);
    }
  };
  const start = async (input: StartDeliveryAssistantInput) => {
    const started = epoch.current;
    setFrozen(input);
    setRetryAllowed(false);
    const result = await commands.start(input);
    if (started !== epoch.current) return;
    if (result !== null) {
      setRecovered(result.runId);
      setFrozen(null);
      setPreview(null);
      setConfirmed(false);
      setNotice(
        t`The request was recorded. Open its saved run for current status; this does not approve delivery.`,
      );
    }
  };
  const knowledge = preview?.context?.brandKnowledge;
  const fingerprint =
    isDefined(knowledge) &&
    typeof knowledge === 'object' &&
    'fingerprint' in knowledge &&
    typeof knowledge.fingerprint === 'string'
      ? knowledge.fingerprint
      : null;
  if (assistant.kind === 'ADVERTISING')
    return (
      <StyledDeliveryCard>
        <p>
          <Trans>
            Advertising recommendations require an exact report. Open
            Advertising to prepare and review them.
          </Trans>
        </p>
        <Link to="/delivery?view=ads">
          <Trans>Open Advertising</Trans>
        </Link>
      </StyledDeliveryCard>
    );
  if (assistant.kind === 'ACTIVITY')
    return (
      <StyledDeliveryCard>
        <p>
          <Trans>
            Team activity analysis uses a reviewed activity scope and question.
            Open Team activity to prepare it.
          </Trans>
        </p>
        <Link to="/delivery?view=activity">
          <Trans>Open Team activity</Trans>
        </Link>
      </StyledDeliveryCard>
    );
  return (
    <StyledDeliveryCard
      ref={focusPanel}
      tabIndex={-1}
      aria-label={t`Prepare assistant run`}
    >
      <StyledDeliveryStack>
        <h3>{t`Prepare ${assistant.name}`}</h3>
        <p>{task.title}</p>
        <Link to={assistantDestination(params, { assistantRequest: null })}>
          <Trans>Close preparation</Trans>
        </Link>
        {(!checked || frozen !== null) && (
          <>
            <p role="status">
              <Trans>
                The start result is unconfirmed. Check the exact original
                request before another attempt. Closing preparation does not
                stop an accepted run.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              disabled={
                !state.permission.ready ||
                state.data === null ||
                checking ||
                commands.busy
              }
              onClick={() => void check()}
            >
              <Trans>Check saved request</Trans>
            </StyledDeliveryButton>
          </>
        )}
        {notice && <p role="status">{notice}</p>}
        {recovered && (
          <StyledDeliveryButton
            type="button"
            onClick={() => requestAction(() => openRun(recovered))}
          >
            <Trans>Open original saved run</Trans>
          </StyledDeliveryButton>
        )}
        <StyledAssistantBoundary
          hidden={!available || recovered !== null}
          inert={!available ? true : undefined}
          disabled={
            !available ||
            frozen !== null ||
            !checked ||
            commands.busy ||
            checking
          }
        >
          <StyledDeliveryStack>
            <p>
              <Trans>
                Preview reads the current task, permitted brand knowledge and
                these inputs. Start is a separate explicit action.
              </Trans>
            </p>
            <StyledDeliveryGrid>
              {assistant.kind !== 'SEO' ? (
                <>
                  <label>
                    <Trans>Copy to check</Trans>
                    <textarea
                      value={inputs.copy}
                      maxLength={20000}
                      rows={5}
                      onChange={(event) => {
                        setInputs({ ...inputs, copy: event.target.value });
                        setPreview(null);
                        setConfirmed(false);
                      }}
                    />
                  </label>
                  <label>
                    <Trans>Brand requirements</Trans>
                    <textarea
                      value={inputs.requirements}
                      maxLength={12000}
                      rows={4}
                      onChange={(event) => {
                        setInputs({
                          ...inputs,
                          requirements: event.target.value,
                        });
                        setPreview(null);
                        setConfirmed(false);
                      }}
                    />
                  </label>
                </>
              ) : (
                <>
                  {[
                    ['sourceUrl', t`Public source URL`],
                    ['targetUrl', t`Exact destination URL`],
                    ['anchor', t`Anchor text (optional)`],
                  ].map(([field, label]) => (
                    <label key={field}>
                      {label}
                      <input
                        type={field === 'anchor' ? 'text' : 'url'}
                        required={field !== 'anchor'}
                        maxLength={field === 'anchor' ? 300 : 2000}
                        value={
                          inputs[field as 'sourceUrl' | 'targetUrl' | 'anchor']
                        }
                        onChange={(event) => {
                          setInputs({ ...inputs, [field]: event.target.value });
                          setPreview(null);
                          setConfirmed(false);
                        }}
                      />
                    </label>
                  ))}
                </>
              )}
            </StyledDeliveryGrid>
            {problems.length > 0 && (
              <div role="status">
                <ul>
                  {problems.map((problem) => (
                    <li key={problem}>
                      {problemLabels[problem] ??
                        t`The assistant input requirements are unavailable. Refresh its current configuration.`}
                    </li>
                  ))}
                </ul>
                {problems.includes('brief') && (
                  <Link to={`/delivery?view=home&task=${task.id}`}>
                    <Trans>Open current task</Trans>
                  </Link>
                )}
              </div>
            )}
            <StyledDeliveryButton
              type="button"
              disabled={problems.length > 0}
              onClick={async () => {
                const started = epoch.current;
                const result = await commands.preview({
                  taskId: task.id,
                  agentId: assistant.id,
                  inputs,
                });
                if (started !== epoch.current) return;
                if (result) {
                  setPreview(result);
                  setConfirmed(false);
                }
              }}
            >
              <Trans>Preview current inputs</Trans>
            </StyledDeliveryButton>
            {preview && (
              <>
                <AssistantContextSummary context={preview.context} />
                {assistant.kind !== 'SEO' && (
                  <>
                    <p>
                      {preview.budget?.maximumCostUsd == null
                        ? t`Maximum reservation unavailable`
                        : t`Maximum reservation: USD ${preview.budget.maximumCostUsd}`}
                    </p>
                    <p>
                      <Trans>
                        This is a spending reservation, not a confirmed charge
                        or a provider price guarantee. Actual cost remains
                        unconfirmed until recorded.
                      </Trans>
                    </p>
                    {!preview.budget?.budgetReady && (
                      <p role="status">
                        {preview.budget?.blockedReason ??
                          t`Review AI spending setup before starting.`}{' '}
                        <Link to="/delivery?view=agents&agentView=spending">
                          <Trans>Review AI spending</Trans>
                        </Link>
                      </p>
                    )}
                  </>
                )}
                {stale && (
                  <p role="alert">
                    <Trans>
                      The task or assistant changed. Preview current inputs
                      again.
                    </Trans>
                  </p>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  <Trans>
                    I reviewed these exact inputs and any spending reservation.
                  </Trans>
                </label>
                <StyledDeliveryButton
                  type="button"
                  disabled={
                    !confirmed ||
                    problems.length > 0 ||
                    stale ||
                    (assistant.kind !== 'SEO' && !preview.budget?.budgetReady)
                  }
                  onClick={() =>
                    void start({
                      taskId: task.id,
                      agentId: assistant.id,
                      requestId,
                      taskRevision: preview.taskRevision,
                      agentVersion: preview.agentVersion,
                      pricingRevision: preview.budget?.pricingRevision,
                      knowledgeFingerprint: fingerprint,
                      inputs,
                    })
                  }
                >
                  <Trans>Start one run</Trans>
                </StyledDeliveryButton>
              </>
            )}
          </StyledDeliveryStack>
        </StyledAssistantBoundary>
        {retryAllowed && frozen !== null && (
          <StyledDeliveryButton
            type="button"
            disabled={!available || commands.busy || checking}
            onClick={() => void start(frozen)}
          >
            <Trans>Retry exact original start</Trans>
          </StyledDeliveryButton>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
