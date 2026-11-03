import { useLayoutEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useInboxAccess } from '@/delivery/inbox/workspace/useInboxAccess';
import {
  type InboxReply,
  type InboxIntent,
  type InboxRequest,
} from '@/delivery/inbox/workspace/inbox-workspace.types';
import {
  GET_INBOX_REPLY,
  GET_INBOX_REPLY_STATE,
  RECONCILE_INBOX_REPLY,
} from '@/delivery/inbox/workspace/delivery-inbox.graphql';
import { inboxDestination } from '@/delivery/inbox/workspace/inbox-navigation';
import { useInboxLabels } from '@/delivery/inbox/workspace/useInboxLabels';
import { InboxAttempt } from '@/delivery/inbox/workspace/InboxAttempt';
import {
  StyledInboxBoundary,
  StyledInboxFacts,
  StyledInboxMessage,
} from '@/delivery/inbox/workspace/inboxWorkspaceStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryInboxReplyQuery,
  type DeliveryInboxReplyStateQuery,
  type ReconcileDeliveryInboxReplyMutation,
} from '~/generated-metadata/graphql';
type InboxReplyViewProps = {
  state: ReturnType<typeof useInboxAccess>;
  conversationId: string;
  id: string;
  enabled: boolean;
  canDraft: boolean;
  intent: InboxIntent | null;
  consumeIntent: (id: string) => void;
  onIntent: (
    mode: InboxIntent['mode'],
    id: string,
    seed?: InboxIntent['seed'],
  ) => void;
  onDenied: () => void;
};
export const InboxReplyView = ({
  state,
  conversationId,
  id,
  enabled,
  canDraft,
  intent,
  consumeIntent,
  onIntent,
  onDenied,
}: InboxReplyViewProps) => {
  const { t } = useLingui();
  const labels = useInboxLabels();
  const [params] = useSearchParams();
  const source = `${state.source}:${conversationId}:${id}`;
  const [interval, setInterval] = useState(5000);
  const lightQuery = useQuery<DeliveryInboxReplyStateQuery>(
    GET_INBOX_REPLY_STATE,
    {
      variables: { input: { id }, identity: source },
      fetchPolicy: 'no-cache',
      pollInterval: interval,
      notifyOnNetworkStatusChange: true,
      skip: !enabled,
    },
  );
  const light = useAssistantRead({
    value: lightQuery.data?.deliveryInboxReply,
    source,
    enabled,
    loading: lightQuery.loading,
    error: lightQuery.error,
    networkStatus: lightQuery.networkStatus,
    matches: (value) =>
      state.matches(value) &&
      value.id === id &&
      value.conversationId === conversationId,
  });
  const query = useQuery<DeliveryInboxReplyQuery>(GET_INBOX_REPLY, {
    variables: { input: { id }, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !enabled,
  });
  const detail = useAssistantRead({
    value: query.data?.deliveryInboxReply,
    source,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.matches(value) &&
      value.id === id &&
      value.conversationId === conversationId,
  });
  const [retained, setRetained] = useState<InboxReply | null>(null);
  if (detail.data && !fastDeepEqual(retained, detail.data))
    setRetained(detail.data);
  const value = detail.data ?? retained;
  const nextInterval =
    light.data &&
    ['GENERATING', 'QUEUED', 'SENDING'].includes(light.data.status)
      ? 5000
      : 30000;
  if (interval !== nextInterval) setInterval(nextInterval);
  const denied =
    isOtogrowAccessDenied(lightQuery.error) ||
    isOtogrowAccessDenied(query.error);
  useLayoutEffect(() => {
    if (denied) onDenied();
  }, [denied, onDenied]);
  const changed = Boolean(
    value &&
    light.data &&
    (value.status !== light.data.status ||
      value.bodyFingerprint !== light.data.bodyFingerprint ||
      value.sourceFingerprint !== light.data.sourceFingerprint ||
      value.canSend !== light.data.canSend ||
      value.canCancel !== light.data.canCancel),
  );
  const available =
    enabled &&
    !denied &&
    detail.data !== null &&
    light.data !== null &&
    !changed;
  const [reconcile] = useMutation<ReconcileDeliveryInboxReplyMutation>(
    RECONCILE_INBOX_REPLY,
  );
  const [checking, setChecking] = useState(false),
    [message, setMessage] = useState('');
  const refresh = async () => {
    await Promise.allSettled([query.refetch(), lightQuery.refetch()]);
  };
  const requestId = params.get('inboxRequest'),
    mode = params.get('inboxMode'),
    commandId = params.get('inboxCommandId');
  return (
    <section aria-label={t`Saved reply and delivery outcome`}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>
            <Trans>Saved reply and delivery outcome</Trans>
          </h3>
          <Link to={inboxDestination(params, { inboxReply: null })}>
            <Trans>Close recorded reply</Trans>
          </Link>
        </StyledDeliveryRow>
        {light.data && <p role="status">{labels.state(light.data.status)}</p>}
        {!available && (
          <p role={query.error || lightQuery.error ? 'alert' : 'status'}>
            {changed
              ? t`The saved reply or its sending eligibility changed. Refresh to inspect the current result.`
              : t`Current reply access could not be verified. Private text is hidden while you retry.`}
          </p>
        )}
        <StyledDeliveryButton type="button" onClick={() => void refresh()}>
          <Trans>Refresh saved reply</Trans>
        </StyledDeliveryButton>
        <StyledInboxBoundary
          hidden={!available}
          disabled={!available}
          inert={!available || undefined}
        >
          {value && (
            <StyledDeliveryStack>
              {value.problem && (
                <p role="alert">{labels.problem(value.problem)}</p>
              )}
              {value.body ? (
                <>
                  <StyledInboxFacts>
                    <div>
                      <dt>
                        <Trans>Fixed recipient</Trans>
                      </dt>
                      <dd>{value.body.to}</dd>
                    </div>
                    <div>
                      <dt>
                        <Trans>Fixed subject</Trans>
                      </dt>
                      <dd>{value.body.subject}</dd>
                    </div>
                    <div>
                      <dt>
                        <Trans>Draft source</Trans>
                      </dt>
                      <dd>
                        {value.body.agentId
                          ? t`Copy assistant — human send review required`
                          : t`Manually prepared reply`}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <Trans>Recorded</Trans>
                      </dt>
                      <dd>{new Date(value.createdAt).toLocaleString()}</dd>
                    </div>
                  </StyledInboxFacts>
                  <StyledInboxMessage>{value.body.text}</StyledInboxMessage>
                  <StyledDeliveryRow>
                    {value.canSend && (
                      <StyledDeliveryButton
                        type="button"
                        onClick={() => onIntent('send', id)}
                      >
                        <Trans>Review and request sending</Trans>
                      </StyledDeliveryButton>
                    )}
                    {canDraft && value.status === 'DRAFT' && (
                      <StyledDeliveryButton
                        type="button"
                        onClick={() =>
                          onIntent('prepare', crypto.randomUUID(), {
                            replyToMessageId:
                              value.body?.replyToMessageId ?? '',
                            text: value.body?.text ?? '',
                          })
                        }
                      >
                        <Trans>Edit as a new manual draft</Trans>
                      </StyledDeliveryButton>
                    )}
                  </StyledDeliveryRow>
                </>
              ) : (
                <p>
                  <Trans>
                    No completed reply text is available. Generation may still
                    be running or have failed; no email was sent by draft
                    preparation.
                  </Trans>
                </p>
              )}
              {value.canCancel && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => onIntent('cancel', id)}
                >
                  <Trans>Review cancellation before dispatch</Trans>
                </StyledDeliveryButton>
              )}
              {value.status === 'UNCERTAIN' && (
                <>
                  <p>
                    <Trans>
                      Do not resend this reply. This check uses exact
                      already-synchronized Sent-mail evidence; a missing match
                      does not prove the email was not sent.
                    </Trans>
                  </p>
                  <StyledDeliveryButton
                    type="button"
                    disabled={checking}
                    onClick={async () => {
                      if (checking) return;
                      const current = state.capture();
                      setChecking(true);
                      setMessage('');
                      try {
                        const result = (
                          await reconcile({ variables: { input: { id } } })
                        ).data?.reconcileDeliveryInboxReply;
                        if (
                          current() &&
                          result &&
                          state.matches(result) &&
                          result.id === id
                        ) {
                          setMessage(
                            result.status === 'SENT'
                              ? t`An exact copy was found in synchronized Sent mail. This confirms sending, not the recipient’s delivery or reading.`
                              : t`No confirming synchronized evidence is available. Delivery remains uncertain; do not resend.`,
                          );
                          await refresh();
                        }
                      } catch (caught) {
                        if (current()) {
                          if (isOtogrowAccessDenied(caught)) onDenied();
                          else
                            setMessage(
                              t`Sent-mail evidence could not be checked. Delivery remains uncertain.`,
                            );
                        }
                      } finally {
                        if (current()) setChecking(false);
                      }
                    }}
                  >
                    <Trans>Check synchronized Sent-mail evidence</Trans>
                  </StyledDeliveryButton>
                  {message && <p role="status">{message}</p>}
                </>
              )}
            </StyledDeliveryStack>
          )}
        </StyledInboxBoundary>
        {value &&
          requestId &&
          commandId === id &&
          (mode === 'send' || mode === 'cancel') && (
            <InboxReplyDecision
              key={requestId}
              state={state}
              value={value}
              requestId={requestId}
              kind={mode === 'send' ? 'SEND' : 'CANCEL'}
              intent={intent}
              consumeIntent={consumeIntent}
              enabled={available}
              allowed={
                mode === 'send'
                  ? light.data?.canSend === true
                  : light.data?.canCancel === true
              }
              onDenied={onDenied}
              onSaved={() => void refresh()}
            />
          )}
      </StyledDeliveryStack>
    </section>
  );
};
const InboxReplyDecision = ({
  state,
  value,
  requestId,
  kind,
  intent,
  consumeIntent,
  enabled,
  allowed,
  onDenied,
  onSaved,
}: {
  state: ReturnType<typeof useInboxAccess>;
  value: InboxReply;
  requestId: string;
  kind: 'SEND' | 'CANCEL';
  intent: InboxIntent | null;
  consumeIntent: (id: string) => void;
  enabled: boolean;
  allowed: boolean;
  onDenied: () => void;
  onSaved: (value: InboxRequest) => void;
}) => {
  const { t } = useLingui();
  const [owned] = useState(
    () =>
      intent?.id === value.id &&
      intent.requestId === requestId &&
      intent.mode === (kind === 'SEND' ? 'send' : 'cancel'),
  );
  useLayoutEffect(() => consumeIntent(requestId), [consumeIntent, requestId]);
  const [opened] = useState(() => ({
    bodyFingerprint: value.bodyFingerprint,
    sourceFingerprint: value.sourceFingerprint,
  }));
  const [confirmed, setConfirmed] = useState(false);
  const current =
    opened.bodyFingerprint === value.bodyFingerprint &&
    opened.sourceFingerprint === value.sourceFingerprint;
  return (
    <section
      aria-label={
        kind === 'SEND'
          ? t`Final human send review`
          : t`Confirm reply cancellation`
      }
    >
      <h4>
        {kind === 'SEND'
          ? t`Final human send review`
          : t`Cancel before dispatch`}
      </h4>
      <InboxAttempt
        state={state}
        conversationId={value.conversationId}
        requestId={requestId}
        id={value.id}
        kind={kind}
        owned={owned}
        enabled={enabled}
        onDenied={onDenied}
        onSaved={onSaved}
      >
        {({ execute }) => (
          <StyledDeliveryStack>
            {(!current || !allowed) && (
              <p role="alert">
                <Trans>
                  The source or sending state changed. This reviewed preparation
                  cannot be committed; check its saved status and reopen current
                  evidence.
                </Trans>
              </p>
            )}
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
              />
              {kind === 'SEND'
                ? t`I reviewed the exact recipient, subject and full reply text above and authorize sending this reply.`
                : t`I understand this only cancels work before dispatch and cannot recall email already being sent.`}
            </label>
            <StyledDeliveryButton
              type="button"
              disabled={
                !allowed ||
                !current ||
                !confirmed ||
                (kind === 'SEND' && opened.bodyFingerprint === null)
              }
              onClick={() => {
                if (!allowed || !current || !confirmed) return;
                if (kind === 'SEND') {
                  if (!opened.bodyFingerprint) return;
                  void execute({
                    kind: 'SEND',
                    input: {
                      id: value.id,
                      requestId,
                      bodyFingerprint: opened.bodyFingerprint,
                      sourceFingerprint: opened.sourceFingerprint,
                    },
                  });
                } else
                  void execute({
                    kind: 'CANCEL',
                    input: { id: value.id, requestId },
                  });
              }}
            >
              {kind === 'SEND'
                ? t`Request this reviewed send`
                : t`Confirm cancellation before dispatch`}
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        )}
      </InboxAttempt>
    </section>
  );
};
