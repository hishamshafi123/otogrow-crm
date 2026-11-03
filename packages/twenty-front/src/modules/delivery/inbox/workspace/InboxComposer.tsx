import { useLayoutEffect, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { hashCanonicalCommandInput } from '@/delivery/commands/canonical-command-hash';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useInboxAccess } from '@/delivery/inbox/workspace/useInboxAccess';
import {
  type InboxConversation,
  type InboxMessage,
  type InboxIntent,
  type InboxRequest,
} from '@/delivery/inbox/workspace/inbox-workspace.types';
import { InboxAttempt } from '@/delivery/inbox/workspace/InboxAttempt';
import { InboxAssistantPicker } from '@/delivery/inbox/workspace/InboxAssistantPicker';
import { GET_INBOX_DRAFT_PREVIEW } from '@/delivery/inbox/workspace/delivery-inbox.graphql';
import {
  inboxDestination,
  INBOX_CLOSE_COMMAND,
} from '@/delivery/inbox/workspace/inbox-navigation';
import {
  StyledInboxFacts,
  StyledInboxMessage,
} from '@/delivery/inbox/workspace/inboxWorkspaceStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryInboxMessagesQuery,
  type DeliveryInboxDraftPreviewQuery,
  type DeliveryInboxDraftPreviewInput,
} from '~/generated-metadata/graphql';
type InboxComposerProps = {
  state: ReturnType<typeof useInboxAccess>;
  conversation: InboxConversation;
  messages: DeliveryInboxMessagesQuery['deliveryInboxMessages'] | null;
  id: string;
  requestId: string;
  intent: InboxIntent | null;
  consumeIntent: (id: string) => void;
  enabled: boolean;
  onDenied: () => void;
  onSaved: (value: InboxRequest) => void;
};
export const InboxComposer = ({
  state,
  conversation,
  messages,
  id,
  requestId,
  intent,
  consumeIntent,
  enabled,
  onDenied,
  onSaved,
}: InboxComposerProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const client = useApolloClient();
  const [owned] = useState(
    () =>
      intent?.mode === 'prepare' &&
      intent.id === id &&
      intent.requestId === requestId,
  );
  const [seed] = useState(() => (owned ? intent?.seed : undefined));
  useLayoutEffect(() => consumeIntent(requestId), [consumeIntent, requestId]);
  const [source, setSource] = useState(() => ({
      bindingRevision: conversation.binding?.revision ?? 0,
      fingerprint: messages?.sourceFingerprint ?? '',
    })),
    [replyTo, setReplyTo] = useState(seed?.replyToMessageId ?? ''),
    [targetLabel, setTargetLabel] = useState(
      seed ? t`Original incoming message for the saved reply` : '',
    ),
    [text, setText] = useState(seed?.text ?? ''),
    [mode, setMode] = useState<'MANUAL' | 'AI'>('MANUAL'),
    [selected, setSelected] = useState<InboxMessage[]>([]),
    [assistant, setAssistant] = useState<{
      id: string;
      name: string;
      version: number;
    } | null>(null),
    [preview, setPreview] = useState<
      DeliveryInboxDraftPreviewQuery['deliveryInboxDraftPreview'] | null
    >(null),
    [quotedInput, setQuotedInput] =
      useState<DeliveryInboxDraftPreviewInput | null>(null),
    [previewBusy, setPreviewBusy] = useState(false),
    [previewError, setPreviewError] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const request = useFinanceExportRequestGuard(
    `${state.source}:${conversation.conversation.id}:${requestId}`,
    enabled,
  );
  const stale =
    !messages ||
    messages.sourceFingerprint !== source.fingerprint ||
    conversation.binding?.revision !== source.bindingRevision;
  const invalidatePreview = () => {
    setPreview(null);
    setConfirmed(false);
  };
  const currentTargets =
    messages?.items.filter(
      (message) =>
        message.direction === 'INCOMING' && !message.participantsTruncated,
    ) ?? [];
  const previewInput: DeliveryInboxDraftPreviewInput | null =
    assistant && replyTo && selected.length > 0
      ? {
          id,
          conversationId: conversation.conversation.id,
          bindingRevision: source.bindingRevision,
          sourceFingerprint: source.fingerprint,
          replyToMessageId: replyTo,
          agentId: assistant.id,
          sourceIds: selected.map((message) => message.id),
        }
      : null;
  const quote = async () => {
    if (!previewInput || !enabled || stale || previewBusy) return;
    const currentRequest = request(),
      currentSource = state.capture();
    const current = () => currentRequest() && currentSource();
    setPreviewBusy(true);
    setPreviewError('');
    invalidatePreview();
    try {
      const hash = await hashCanonicalCommandInput(previewInput);
      if (!current()) return;
      const value = (
        await client.query<DeliveryInboxDraftPreviewQuery>({
          query: GET_INBOX_DRAFT_PREVIEW,
          variables: { input: previewInput },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryInboxDraftPreview;
      if (!current()) return;
      if (
        !value ||
        !state.matches(value) ||
        value.bodyFingerprint !== hash ||
        value.agentId !== previewInput.agentId ||
        value.sourceCount !== previewInput.sourceIds.length ||
        !fastDeepEqual(
          value.sources.map((message) => message.id).sort(),
          [...previewInput.sourceIds].sort(),
        )
      ) {
        setPreviewError(
          t`The returned quote does not match this selected thread and messages. Recheck before generating.`,
        );
        return;
      }
      setQuotedInput(previewInput);
      setPreview(value);
    } catch (caught) {
      if (!current()) return;
      if (isOtogrowAccessDenied(caught)) onDenied();
      else
        setPreviewError(
          caught instanceof Error
            ? caught.message
            : t`Draft evidence and its maximum reservation could not be checked.`,
        );
    } finally {
      if (current()) setPreviewBusy(false);
    }
  };
  return (
    <section aria-label={t`Prepare an unsent reply`}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>
            <Trans>Prepare an unsent reply</Trans>
          </h3>
          <Link to={inboxDestination(params, INBOX_CLOSE_COMMAND)}>
            <Trans>Close preparation</Trans>
          </Link>
        </StyledDeliveryRow>
        <p>
          <Trans>
            The server fixes the recipient and subject from an eligible incoming
            message. Preparing a draft never sends email. Review the saved
            recipient, subject and full text in the next step.
          </Trans>
        </p>
        <InboxAttempt
          state={state}
          conversationId={conversation.conversation.id}
          id={id}
          requestId={requestId}
          kind="PREPARE"
          owned={owned}
          enabled={enabled}
          onDenied={onDenied}
          onSaved={onSaved}
        >
          {({ execute, busy }) => (
            <StyledDeliveryStack>
              {stale && (
                <div role="alert">
                  <p>
                    <Trans>
                      The thread or consent changed. Your text is retained. Read
                      current messages before updating this preparation.
                    </Trans>
                  </p>
                  <StyledDeliveryButton
                    type="button"
                    disabled={
                      !messages ||
                      !conversation.binding?.canDraft ||
                      busy ||
                      previewBusy
                    }
                    onClick={() => {
                      if (messages && conversation.binding) {
                        setSource({
                          bindingRevision: conversation.binding.revision,
                          fingerprint: messages.sourceFingerprint,
                        });
                        invalidatePreview();
                      }
                    }}
                  >
                    <Trans>Use the current thread and keep my text</Trans>
                  </StyledDeliveryButton>
                </div>
              )}
              <label>
                <Trans>Incoming message to answer</Trans>
                <select
                  required
                  data-inbox-reply-target={replyTo}
                  value={replyTo}
                  onChange={(event) => {
                    const target = currentTargets.find(
                      (message) => message.id === event.currentTarget.value,
                    );
                    setReplyTo(event.currentTarget.value);
                    setTargetLabel(target?.subject ?? '');
                    invalidatePreview();
                  }}
                >
                  <option value="">{t`Choose an incoming message`}</option>
                  {replyTo &&
                    !currentTargets.some(
                      (message) => message.id === replyTo,
                    ) && (
                      <option value={replyTo}>
                        {targetLabel || t`Previously selected incoming message`}
                      </option>
                    )}
                  {currentTargets.map((message) => (
                    <option key={message.id} value={message.id}>
                      {message.subject || t`No subject`} ·{' '}
                      {message.receivedAt
                        ? new Date(message.receivedAt).toLocaleString()
                        : t`Time not recorded`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Draft method</Trans>
                <select
                  value={mode}
                  onChange={(event) => {
                    setMode(
                      event.currentTarget.value === 'AI' ? 'AI' : 'MANUAL',
                    );
                    invalidatePreview();
                  }}
                >
                  <option value="MANUAL">{t`Write a manual reply`}</option>
                  <option value="AI">{t`Prepare with a copy assistant`}</option>
                </select>
              </label>
              {mode === 'MANUAL' ? (
                <>
                  <label>
                    <Trans>Unsent reply text</Trans>
                    <textarea
                      required
                      maxLength={12000}
                      value={text}
                      onChange={(event) => setText(event.currentTarget.value)}
                    />
                  </label>
                  <StyledDeliveryButton
                    type="button"
                    disabled={
                      stale ||
                      !replyTo ||
                      !text.trim() ||
                      busy ||
                      previewBusy ||
                      !conversation.binding?.canDraft
                    }
                    onClick={() =>
                      void execute({
                        kind: 'PREPARE',
                        input: {
                          id,
                          requestId,
                          conversationId: conversation.conversation.id,
                          bindingRevision: source.bindingRevision,
                          sourceFingerprint: source.fingerprint,
                          replyToMessageId: replyTo,
                          text: text.trim(),
                          agentId: null,
                          sourceIds: [],
                          previewFingerprint: null,
                          agentVersion: null,
                          pricingRevision: null,
                        },
                      })
                    }
                  >
                    <Trans>Save unsent reply for final review</Trans>
                  </StyledDeliveryButton>
                </>
              ) : (
                <>
                  <p>
                    <Trans>
                      Select up to ten complete incoming messages from this same
                      thread. Page through earlier messages if needed. A
                      shortened text or participant preview cannot feed the
                      assistant.
                    </Trans>
                  </p>
                  <p>{t`${selected.length} selected messages; your manual text remains retained if you switch back.`}</p>
                  {messages?.items.map((message) => (
                    <label key={message.id}>
                      <input
                        type="checkbox"
                        data-inbox-source={message.id}
                        checked={selected.some(
                          (item) => item.id === message.id,
                        )}
                        disabled={
                          message.direction !== 'INCOMING' ||
                          message.textTruncated ||
                          message.participantsTruncated ||
                          (selected.length >= 10 &&
                            !selected.some((item) => item.id === message.id))
                        }
                        onChange={(event) => {
                          setSelected(
                            event.currentTarget.checked
                              ? [...selected, message]
                              : selected.filter(
                                  (item) => item.id !== message.id,
                                ),
                          );
                          invalidatePreview();
                        }}
                      />
                      {message.subject || t`No subject`} ·{' '}
                      {message.receivedAt
                        ? new Date(message.receivedAt).toLocaleString()
                        : t`Time not recorded`}
                    </label>
                  ))}
                  {selected.length > 0 && (
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => {
                        setSelected([]);
                        invalidatePreview();
                      }}
                    >
                      <Trans>Clear selected AI messages</Trans>
                    </StyledDeliveryButton>
                  )}
                  <InboxAssistantPicker
                    state={state}
                    projectId={conversation.conversation.projectId}
                    id={assistant?.id ?? null}
                    name={assistant?.name ?? null}
                    onChoose={(value) => {
                      setAssistant(value);
                      invalidatePreview();
                    }}
                  />
                  <StyledDeliveryButton
                    type="button"
                    disabled={
                      !previewInput ||
                      stale ||
                      busy ||
                      previewBusy ||
                      !conversation.binding?.canDraft
                    }
                    onClick={() => void quote()}
                  >
                    <Trans>Review AI evidence and maximum reservation</Trans>
                  </StyledDeliveryButton>
                  {previewError && <p role="alert">{previewError}</p>}
                  {preview && (
                    <>
                      <StyledInboxFacts>
                        <div>
                          <dt>
                            <Trans>Fixed recipient</Trans>
                          </dt>
                          <dd>{preview.to}</dd>
                        </div>
                        <div>
                          <dt>
                            <Trans>Subject</Trans>
                          </dt>
                          <dd>{preview.subject}</dd>
                        </div>
                        <div>
                          <dt>
                            <Trans>Assistant and model</Trans>
                          </dt>
                          <dd>
                            {preview.agentName} ·{' '}
                            {t`Configuration version ${preview.agentVersion}`} ·{' '}
                            {preview.modelId}
                          </dd>
                        </div>
                        <div>
                          <dt>
                            <Trans>Maximum AI reservation</Trans>
                          </dt>
                          <dd>
                            {preview.budget.maximumCostUsd === null
                              ? t`Not available`
                              : `USD ${preview.budget.maximumCostUsd}`}
                          </dd>
                        </div>
                      </StyledInboxFacts>
                      {preview.budget.blockedReason && (
                        <p role="status">{preview.budget.blockedReason}</p>
                      )}
                      <details>
                        <summary>
                          <Trans>Exact messages sent to the assistant</Trans>
                        </summary>
                        {preview.sources.map((message) => (
                          <StyledInboxMessage key={message.id}>
                            <strong>{message.subject}</strong>
                            <div>{message.text}</div>
                          </StyledInboxMessage>
                        ))}
                      </details>
                      <p>
                        <Trans>
                          The assistant uses its saved private configuration and
                          selected message text. It has no email sending tools.
                          Generated text still requires a separate human send
                          review.
                        </Trans>
                      </p>
                      <label>
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(event) =>
                            setConfirmed(event.currentTarget.checked)
                          }
                        />
                        <Trans>
                          I reviewed this selected evidence and maximum AI
                          reservation.
                        </Trans>
                      </label>
                      <StyledDeliveryButton
                        type="button"
                        disabled={
                          stale ||
                          !fastDeepEqual(previewInput, quotedInput) ||
                          !confirmed ||
                          busy ||
                          previewBusy ||
                          !preview.budget.budgetReady ||
                          preview.budget.pricingRevision === null ||
                          preview.budget.maximumCostUsd === null ||
                          !conversation.binding?.canDraft
                        }
                        onClick={() => {
                          const pricingRevision =
                            preview.budget.pricingRevision;
                          if (
                            pricingRevision === null ||
                            !quotedInput ||
                            !fastDeepEqual(previewInput, quotedInput) ||
                            stale
                          )
                            return;
                          void execute({
                            kind: 'PREPARE',
                            input: {
                              ...quotedInput,
                              requestId,
                              text: '',
                              previewFingerprint: preview.previewFingerprint,
                              agentVersion: preview.agentVersion,
                              pricingRevision,
                            },
                          });
                        }}
                      >
                        <Trans>Generate an unsent AI reply</Trans>
                      </StyledDeliveryButton>
                    </>
                  )}
                </>
              )}
            </StyledDeliveryStack>
          )}
        </InboxAttempt>
      </StyledDeliveryStack>
    </section>
  );
};
