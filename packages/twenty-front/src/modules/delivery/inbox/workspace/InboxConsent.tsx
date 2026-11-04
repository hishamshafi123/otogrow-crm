import { useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useInboxAccess } from '@/delivery/inbox/workspace/useInboxAccess';
import {
  type InboxConversation,
  type InboxIntent,
  type InboxRequest,
} from '@/delivery/inbox/workspace/inbox-workspace.types';
import { InboxAttempt } from '@/delivery/inbox/workspace/InboxAttempt';
import {
  GET_INBOX_ACCOUNTS,
  GET_INBOX_THREADS,
} from '@/delivery/inbox/workspace/delivery-inbox.graphql';
import {
  inboxDestination,
  INBOX_CLOSE_COMMAND,
} from '@/delivery/inbox/workspace/inbox-navigation';
import {
  StyledInboxGrant,
  StyledInboxFacts,
} from '@/delivery/inbox/workspace/inboxWorkspaceStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryInboxGmailAccountsQuery,
  type DeliveryInboxGmailThreadsQuery,
  type DeliveryInboxGrantInput,
} from '~/generated-metadata/graphql';
type InboxConsentProps = {
  state: ReturnType<typeof useInboxAccess>;
  value: InboxConversation;
  id: string;
  requestId: string;
  intent: InboxIntent | null;
  consumeIntent: (id: string) => void;
  enabled: boolean;
  onDenied: () => void;
  onSaved: (value: InboxRequest) => void;
};
export const InboxConsent = ({
  state,
  value,
  id,
  requestId,
  intent,
  consumeIntent,
  enabled,
  onDenied,
  onSaved,
}: InboxConsentProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const [owned] = useState(
    () =>
      intent?.mode === 'consent' &&
      intent.id === id &&
      intent.requestId === requestId,
  );
  useLayoutEffect(() => consumeIntent(requestId), [consumeIntent, requestId]);
  const [opened] = useState(() => ({
    conversationRevision: value.conversation.revision,
    revision: value.binding?.revision ?? 0,
  }));
  const [completed, setCompleted] = useState(false);
  const stale =
    value.conversation.revision !== opened.conversationRevision ||
    (value.binding?.revision ?? 0) !== opened.revision;
  return (
    <section aria-label={t`Owner consent for a Gmail thread`}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>
            <Trans>Connect and delegate one Gmail thread</Trans>
          </h3>
          <Link to={inboxDestination(params, INBOX_CLOSE_COMMAND)}>
            <Trans>Close owner consent</Trans>
          </Link>
        </StyledDeliveryRow>
        <p>
          <Trans>
            Only the Gmail account owner who also owns this conversation can
            consent. This does not share their whole mailbox or grant access to
            other threads.
          </Trans>
        </p>
        {stale && !completed && (
          <p role="alert">
            <Trans>
              Conversation access or consent changed. Your preparation is kept;
              check any submitted request before reopening current permissions.
            </Trans>
          </p>
        )}
        <InboxAttempt
          state={state}
          conversationId={value.conversation.id}
          requestId={requestId}
          id={id}
          kind="CONSENT"
          owned={owned}
          enabled={enabled}
          onDenied={onDenied}
          onSaved={(result) => {
            setCompleted(true);
            onSaved(result);
          }}
        >
          {({ execute, busy }) => (
            <InboxConsentFields
              state={state}
              value={value}
              disabled={stale || busy}
              onDenied={onDenied}
              onSubmit={(thread, grants) =>
                execute({
                  kind: 'CONSENT',
                  input: {
                    id,
                    requestId,
                    conversationId: value.conversation.id,
                    conversationRevision: opened.conversationRevision,
                    revision: opened.revision,
                    accountId: thread.accountId,
                    channelId: thread.channelId,
                    threadExternalId: thread.threadExternalId,
                    sourceFingerprint: thread.sourceFingerprint,
                    grants,
                    includeHistoryAndFutureReplies: true,
                  },
                })
              }
            />
          )}
        </InboxAttempt>
      </StyledDeliveryStack>
    </section>
  );
};
type Thread =
  DeliveryInboxGmailThreadsQuery['deliveryInboxGmailThreads']['items'][number];
const InboxConsentFields = ({
  state,
  value,
  disabled,
  onDenied,
  onSubmit,
}: {
  state: ReturnType<typeof useInboxAccess>;
  value: InboxConversation;
  disabled: boolean;
  onDenied: () => void;
  onSubmit: (
    thread: Thread,
    grants: DeliveryInboxGrantInput[],
  ) => Promise<void>;
}) => {
  const { t } = useLingui();
  const [accountId, setAccountId] = useState(value.binding?.accountId ?? ''),
    [accountSearch, setAccountSearch] = useState(''),
    [accountAfter, setAccountAfter] = useState<string | null>(null),
    [threadSearch, setThreadSearch] = useState(''),
    [threadAfter, setThreadAfter] = useState<string | null>(null),
    [target, setTarget] = useState(() =>
      value.binding
        ? {
            channelId: value.binding.channelId,
            threadExternalId: value.binding.threadExternalId,
          }
        : null,
    ),
    [confirmation, setConfirmation] = useState<string | null>(null),
    [grants, setGrants] = useState<DeliveryInboxGrantInput[]>(
      () =>
        value.binding?.grants.map(({ kind, id, read, draft, send }) => ({
          kind,
          id,
          read,
          draft,
          send,
        })) ?? [],
    );
  const accountInput = { search: accountSearch, after: accountAfter };
  const accountSource = `${state.source}:${JSON.stringify(accountInput)}`;
  const accountsQuery = useQuery<DeliveryInboxGmailAccountsQuery>(
    GET_INBOX_ACCOUNTS,
    {
      variables: { input: accountInput, identity: accountSource },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: state.data === null,
    },
  );
  const accounts = useAssistantRead({
    value: accountsQuery.data?.deliveryInboxGmailAccounts,
    source: accountSource,
    enabled: state.data !== null,
    loading: accountsQuery.loading,
    error: accountsQuery.error,
    networkStatus: accountsQuery.networkStatus,
    matches: state.matches,
  });
  const threadInput = {
    accountId,
    search: threadSearch,
    after: threadAfter,
    selectedChannelId: target?.channelId ?? null,
    selectedThreadExternalId: target?.threadExternalId ?? null,
  };
  const threadSource = `${state.source}:${JSON.stringify(threadInput)}`;
  const threadsQuery = useQuery<DeliveryInboxGmailThreadsQuery>(
    GET_INBOX_THREADS,
    {
      variables: { input: threadInput, identity: threadSource },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      notifyOnNetworkStatusChange: true,
      skip: !accountId || state.data === null,
    },
  );
  const threads = useAssistantRead({
    value: threadsQuery.data?.deliveryInboxGmailThreads,
    source: threadSource,
    enabled: Boolean(accountId) && state.data !== null,
    loading: threadsQuery.loading,
    error: threadsQuery.error,
    networkStatus: threadsQuery.networkStatus,
    matches: (result) =>
      state.matches(result) &&
      result.items.every((thread) => thread.accountId === accountId) &&
      (!result.selected ||
        (result.selected.accountId === accountId &&
          result.selected.channelId === target?.channelId &&
          result.selected.threadExternalId === target.threadExternalId)),
  });
  useLayoutEffect(() => {
    if (
      isOtogrowAccessDenied(accountsQuery.error) ||
      isOtogrowAccessDenied(threadsQuery.error)
    )
      onDenied();
  }, [accountsQuery.error, threadsQuery.error, onDenied]);
  const selected = threads.data?.selected ?? null;
  const currentGrant = (kind: string, id: string) =>
    grants.find((grant) => grant.kind === kind && grant.id === id);
  const invalid = grants.some((grant) => {
    const allowed = value.availableGrants.find(
      (item) => item.kind === grant.kind && item.id === grant.id,
    );
    return (
      !allowed ||
      !allowed.read ||
      ((grant.draft || grant.send) && !allowed.draft)
    );
  });
  const update = (
    kind: string,
    id: string,
    permission: 'read' | 'draft' | 'send',
    checked: boolean,
  ) => {
    const current = currentGrant(kind, id) ?? {
      kind,
      id,
      read: false,
      draft: false,
      send: false,
    };
    const next = { ...current, [permission]: checked };
    if (permission === 'send' && checked) {
      next.read = true;
      next.draft = true;
    }
    if (permission === 'draft' && checked) next.read = true;
    if (permission === 'draft' && !checked) next.send = false;
    if (permission === 'read' && !checked) {
      next.draft = false;
      next.send = false;
    }
    setGrants(
      [
        ...grants.filter((grant) => grant.kind !== kind || grant.id !== id),
        next,
      ].filter((grant) => grant.read),
    );
    setConfirmation(null);
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (
          disabled ||
          invalid ||
          !selected ||
          confirmation !== selected.sourceFingerprint
        )
          return;
        void onSubmit(selected, grants);
      }}
    >
      <StyledDeliveryStack>
        <fieldset disabled={disabled}>
          <legend>
            <Trans>Your Gmail account and the thread to share</Trans>
          </legend>
          <label>
            <Trans>Search your connected Gmail accounts</Trans>
            <input
              value={accountSearch}
              maxLength={160}
              onChange={(event) => {
                setAccountSearch(event.currentTarget.value);
                setAccountAfter(null);
              }}
            />
          </label>
          <label>
            <Trans>Gmail account</Trans>
            <select
              required
              value={accountId}
              disabled={value.binding !== null}
              onChange={(event) => {
                setAccountId(event.currentTarget.value);
                setTarget(null);
                setThreadAfter(null);
                setConfirmation(null);
              }}
            >
              <option value="">{t`Choose your connected Gmail account`}</option>
              {value.binding &&
                !accounts.data?.items.some(
                  (account) => account.id === value.binding?.accountId,
                ) && (
                  <option value={value.binding.accountId}>
                    {value.binding.accountHandle ||
                      t`Original owner Gmail account`}
                  </option>
                )}
              {accounts.data?.items.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.handle}
                  {account.needsReconnect ? ` · ${t`Reconnect required`}` : ''}
                </option>
              ))}
            </select>
          </label>
          {accounts.data?.nextCursor && (
            <StyledDeliveryButton
              type="button"
              onClick={() => setAccountAfter(accounts.data?.nextCursor ?? null)}
            >
              <Trans>More Gmail accounts</Trans>
            </StyledDeliveryButton>
          )}
          {accountAfter && (
            <StyledDeliveryButton
              type="button"
              onClick={() => setAccountAfter(null)}
            >
              <Trans>First Gmail accounts</Trans>
            </StyledDeliveryButton>
          )}
          {!accounts.data && (
            <p role={accountsQuery.error ? 'alert' : 'status'}>
              {accountsQuery.error
                ? t`Your connected accounts could not be checked.`
                : t`Checking your Gmail accounts…`}
            </p>
          )}
          {accounts.data?.totalCount === 0 && (
            <p>
              <Trans>
                Connect your Gmail account in Accounts settings first. Other
                teammates’ mailbox connections remain private.
              </Trans>
            </p>
          )}
          <Link to={getSettingsPath(SettingsPath.Accounts)}>
            <Trans>Open email account settings</Trans>
          </Link>
          {accountId && (
            <>
              <label>
                <Trans>Find an imported thread</Trans>
                <input
                  maxLength={160}
                  value={threadSearch}
                  disabled={value.binding !== null}
                  onChange={(event) => {
                    setThreadSearch(event.currentTarget.value);
                    setThreadAfter(null);
                  }}
                />
              </label>
              <p>
                <Trans>
                  Only synchronized threads from this account are listed. If a
                  thread is missing, check synchronization in email account
                  settings.
                </Trans>
              </p>
              {threads.data ? (
                <>
                  <p>{t`Showing ${threads.data.items.length} of ${threads.data.totalCount} imported threads.`}</p>
                  {!value.binding &&
                    threads.data.items.map((thread) => (
                      <StyledDeliveryButton
                        type="button"
                        key={`${thread.channelId}:${thread.threadExternalId}`}
                        onClick={() => {
                          setTarget({
                            channelId: thread.channelId,
                            threadExternalId: thread.threadExternalId,
                          });
                          setConfirmation(null);
                        }}
                      >
                        {thread.subject || t`No subject`} ·{' '}
                        {t`${thread.messageCount} imported messages`}
                      </StyledDeliveryButton>
                    ))}
                  {threads.data.nextCursor && !value.binding && (
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        setThreadAfter(threads.data?.nextCursor ?? null)
                      }
                    >
                      <Trans>More imported threads</Trans>
                    </StyledDeliveryButton>
                  )}
                  {threadAfter && (
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => setThreadAfter(null)}
                    >
                      <Trans>First imported threads</Trans>
                    </StyledDeliveryButton>
                  )}
                </>
              ) : (
                <p role={threadsQuery.error ? 'alert' : 'status'}>
                  {threadsQuery.error
                    ? t`The exact account/thread could not be verified. Your preparation is retained.`
                    : t`Checking imported threads…`}
                </p>
              )}
            </>
          )}
          {selected && (
            <StyledInboxFacts>
              <div>
                <dt>
                  <Trans>Mailbox</Trans>
                </dt>
                <dd>{selected.accountHandle}</dd>
              </div>
              <div>
                <dt>
                  <Trans>Exact selected thread</Trans>
                </dt>
                <dd>{selected.subject || t`No subject`}</dd>
              </div>
              <div>
                <dt>
                  <Trans>Client project</Trans>
                </dt>
                <dd>{value.conversation.projectName}</dd>
              </div>
              <div>
                <dt>
                  <Trans>Imported messages</Trans>
                </dt>
                <dd>{selected.messageCount}</dd>
              </div>
            </StyledInboxFacts>
          )}
        </fieldset>
        <h4>
          <Trans>Maximum delegated permissions</Trans>
        </h4>
        <p>
          <Trans>
            All additional access is off for a new connection. Every action
            still requires the person’s current OS conversation access. Role
            grants apply to current and future people assigned that role.
            Sending is separate from preparing drafts and never happens
            automatically.
          </Trans>
        </p>
        {value.conversation.private && (
          <p>
            <Trans>
              This conversation is private to its owner. No staff permissions
              can be added here.
            </Trans>
          </p>
        )}
        {value.availableGrants.map((available) => (
          <StyledInboxGrant key={`${available.kind}:${available.id}`}>
            <strong>
              {available.kind === 'ROLE' ? t`Team role` : t`Person`}:{' '}
              {available.name}
            </strong>
            {(['read', 'draft', 'send'] as const).map((permission) => (
              <label key={permission}>
                <input
                  type="checkbox"
                  aria-label={`${available.name}: ${permission === 'read' ? t`view` : permission === 'draft' ? t`prepare drafts` : t`send reviewed replies`}`}
                  checked={
                    currentGrant(available.kind, available.id)?.[permission] ??
                    false
                  }
                  disabled={
                    disabled ||
                    !available.read ||
                    (permission !== 'read' && !available.draft)
                  }
                  onChange={(event) =>
                    update(
                      available.kind,
                      available.id,
                      permission,
                      event.currentTarget.checked,
                    )
                  }
                />
                {permission === 'read'
                  ? t`View`
                  : permission === 'draft'
                    ? t`Prepare drafts`
                    : t`Send reviewed replies`}
              </label>
            ))}
          </StyledInboxGrant>
        ))}
        {invalid && (
          <div role="alert">
            <p>
              <Trans>
                An earlier consent exceeds the current conversation grants.
                Remove it or first review the conversation’s access; consent
                cannot expand OS permissions.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              onClick={() => {
                setGrants(
                  grants.filter((grant) =>
                    value.availableGrants.some(
                      (available) =>
                        available.kind === grant.kind &&
                        available.id === grant.id &&
                        available.read &&
                        (!(grant.draft || grant.send) || available.draft),
                    ),
                  ),
                );
                setConfirmation(null);
              }}
            >
              <Trans>Remove ineligible earlier grants</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        <label>
          <input
            type="checkbox"
            required
            checked={Boolean(
              selected && confirmation === selected.sourceFingerprint,
            )}
            disabled={!selected || disabled || invalid}
            onChange={(event) =>
              setConfirmation(
                event.currentTarget.checked
                  ? (selected?.sourceFingerprint ?? null)
                  : null,
              )
            }
          />
          <Trans>
            I authorize these maximum permissions for the selected exact Gmail
            thread, including its imported history and future replies in that
            thread.
          </Trans>
        </label>
        <StyledDeliveryButton
          type="submit"
          disabled={
            disabled ||
            invalid ||
            !selected ||
            confirmation !== selected.sourceFingerprint
          }
        >
          <Trans>Confirm owner consent</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
