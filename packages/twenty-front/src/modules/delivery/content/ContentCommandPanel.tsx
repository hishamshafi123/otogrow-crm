import { useCallback, useRef, useState } from 'react';
import { useApolloClient, useQuery } from '@apollo/client/react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import {
  hashCanonicalCommandInput,
  canonicalCommandJson,
} from '@/delivery/commands/canonical-command-hash';
import {
  type ContentBody,
  type ContentChoices,
  type ContentCommand,
  type ContentIntent,
  type ContentReceipt,
  type ContentSavedBody,
} from '@/delivery/content/content.types';
import { type useContentAccess } from '@/delivery/content/useContentAccess';
import { useContentRead } from '@/delivery/content/useContentRead';
import { useContentCommands } from '@/delivery/content/useContentCommands';
import { useContentLabels } from '@/delivery/content/useContentLabels';
import {
  GET_CONTENT_CHOICES,
  GET_CONTENT_DETAIL,
  GET_CONTENT_PLANS,
  PREVIEW_CONTENT,
} from '@/delivery/content/delivery-content.graphql';
import { mergeContentChoices } from '@/delivery/content/content-choices';
import {
  ContentChoicePaging,
  EMPTY_CONTENT_CHOICE_PAGE,
} from '@/delivery/content/ContentChoicePaging';
import {
  contentDestination,
  CONTENT_CLOSE_COMMAND,
} from '@/delivery/content/content-navigation';
import {
  canonicalContentBody,
  newContentBody,
} from '@/delivery/content/content-body';
import { contentPlannedInstant } from '@/delivery/content/content-dates';
import {
  ContentAccountFields,
  ContentPlanFields,
  contentPlanReady,
} from '@/delivery/content/ContentSetupFields';
import {
  ContentVariantFields,
  contentVariantReady,
} from '@/delivery/content/ContentVariantFields';
import { ContentActionStage } from '@/delivery/content/ContentActionStage';
import { ContentPostingPreview } from '@/delivery/content/ContentPostingPreview';
import { StyledContentBoundary } from '@/delivery/content/contentStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  type DeliveryContentDetailQuery,
  type DeliveryContentPlansQuery,
  type DeliveryContentProjectChoicesQuery,
  type PreviewDeliveryContentQuery,
  type DeliveryContentAccountSaveInput,
  type DeliveryContentPlanSaveInput,
} from '~/generated-metadata/graphql';

type ContentCommandPanelProps = {
  access: ReturnType<typeof useContentAccess>;
  choices: ContentChoices;
  intent: ContentIntent | null;
  enabled: boolean;
  onDenied: () => void;
  onSaved: () => Promise<unknown>;
  onReplaceIntent: (intent: ContentIntent) => void;
};
export const ContentCommandPanel = ({
  access,
  choices,
  intent,
  enabled,
  onDenied,
  onSaved,
  onReplaceIntent,
}: ContentCommandPanelProps) => {
  const { t } = useLingui();
  const labels = useContentLabels();
  const client = useApolloClient();
  const [params] = useSearchParams();
  const location = useLocation();
  const mode = params.get('contentMode') ?? '';
  const requestId = params.get('contentRequest') ?? '';
  const targetId =
    params.get(
      mode.includes('account')
        ? 'contentAccountId'
        : mode.includes('plan')
          ? 'contentPlanId'
          : 'contentPostId',
    ) ?? '';
  const focus = useAssistantPanelFocus();
  const [opened] = useState(() =>
    intent?.requestId === requestId &&
    intent.targetId === targetId &&
    intent.mode === mode
      ? intent
      : null,
  );
  const planningVariant = mode === 'variant' || mode === 'edit-variant';
  const existingPost =
    !mode.includes('account') && !mode.includes('plan') && mode !== 'variant';
  const [account, setAccount] =
    useState<DeliveryContentAccountSaveInput | null>(() =>
      opened && mode.includes('account')
        ? {
            projectId: opened.project.id,
            expectedCompanyId: opened.project.companyId ?? null,
            platform: opened.account?.platform ?? 'X',
            name: opened.account?.name ?? '',
            handle: opened.account?.handle ?? '',
            profileUrl: opened.account?.profileUrl ?? '',
            archived: opened.account?.archived ?? false,
            ...opened.preparation?.account,
            id: targetId,
            requestId,
            revision: opened.account?.revision ?? 0,
            projectRevision: opened.project.revision,
          }
        : null,
    );
  const [plan, setPlan] = useState<DeliveryContentPlanSaveInput | null>(() =>
    opened && mode.includes('plan')
      ? {
          projectId: opened.project.id,
          expectedCompanyId: opened.project.companyId ?? null,
          title: opened.plan?.title ?? '',
          purpose: opened.plan?.purpose ?? '',
          engagementId: opened.plan?.engagementId ?? null,
          service: opened.plan?.service ?? null,
          ...opened.preparation?.plan,
          id: targetId,
          requestId,
          revision: opened.plan?.revision ?? 0,
          projectRevision: opened.project.revision,
        }
      : null,
  );
  const [body, setBody] = useState<ContentBody | null>(() =>
    opened && planningVariant
      ? (opened.preparation?.body ??
        (opened.detail
          ? canonicalContentBody(opened.detail.body)
          : newContentBody(access.permission.access?.memberId ?? '')))
      : null,
  );
  const [note, setNote] = useState(opened?.preparation?.note ?? '');
  const [evidenceUrl, setEvidenceUrl] = useState(
    opened?.preparation?.evidenceUrl ?? '',
  );
  const [actualLocal, setActualLocal] = useState(
    opened?.preparation?.actualLocal ?? '',
  );
  const [actualTimezone, setActualTimezone] = useState(
    opened?.preparation?.actualTimezone ??
      opened?.detail?.body.timezone ??
      'UTC',
  );
  const [correctsEventId, setCorrectsEventId] = useState(
    opened?.preparation?.correctsEventId ?? '',
  );
  const [preparing, setPreparing] = useState(false);
  const [frozen, setFrozen] = useState<ContentCommand | null>(null);
  const [preview, setPreview] = useState<ContentSavedBody | null>(null);
  const [receipt, setReceipt] = useState<ContentReceipt | null>(null);
  const [refreshingSaved, setRefreshingSaved] = useState(false);
  const [sent, setSent] = useState(false);
  const [retry, setRetry] = useState(false);
  const [absent, setAbsent] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [rebaseConfirmed, setRebaseConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [choicePage, setChoicePage] = useState(EMPTY_CONTENT_CHOICE_PAGE);
  const selectedAccountIds = [body?.accountId, opened?.account?.id].filter(
    (id): id is string => Boolean(id),
  );
  const selectedMemberIds = [body?.ownerId, body?.reviewerId].filter(
    (id): id is string => Boolean(id),
  );
  const choicesQuery = useQuery<DeliveryContentProjectChoicesQuery>(
    GET_CONTENT_CHOICES,
    {
      variables: {
        input: {
          projectId: choices.project.id,
          ...choicePage,
          selectedAccountIds: [...new Set(selectedAccountIds)],
          selectedMemberIds: [...new Set(selectedMemberIds)],
          selectedEngagementIds: plan?.engagementId ? [plan.engagementId] : [],
        },
      },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
      skip: !enabled,
    },
  );
  const choicesRead = useContentRead({
    value: choicesQuery.data?.deliveryContentProjectChoices,
    access,
    query: choicesQuery,
    scope: `preparation-choices:${choices.project.id}:${JSON.stringify(choicePage)}:${selectedAccountIds.join(',')}:${selectedMemberIds.join(',')}:${plan?.engagementId}`,
    onDenied,
    matches: (value) =>
      value.project.id === choices.project.id && value.scope === choices.scope,
  });
  const formChoices = choicesRead.data
    ? mergeContentChoices(choicesRead.data)
    : choices;
  const query = useQuery<DeliveryContentDetailQuery>(GET_CONTENT_DETAIL, {
    variables: { input: { id: targetId } },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !enabled || !existingPost,
  });
  const read = useContentRead({
    value: query.data?.deliveryContentDetail,
    access,
    query,
    scope: `preparation:${targetId}`,
    onDenied,
    matches: (value) =>
      value.project.id === choices.project.id &&
      value.project.companyId === choices.project.companyId &&
      value.variant.id === targetId,
  });
  const current = existingPost ? read.data : null;
  const planQuery = useQuery<DeliveryContentPlansQuery>(GET_CONTENT_PLANS, {
    variables: {
      input: { projectId: choices.project.id, planId: opened?.plan?.id },
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !enabled || !opened?.plan,
  });
  const planRead = useContentRead({
    value: planQuery.data?.deliveryContentPlans,
    access,
    query: planQuery,
    scope: `preparation-plan:${choices.project.id}:${opened?.plan?.id}`,
    onDenied,
    matches: (value) => value.scope === choices.scope,
  });
  const currentPlan = planRead.data?.items.find(
    (item) => item.id === opened?.plan?.id,
  );
  const currentAccount = formChoices.accounts.find(
    (item) => item.id === opened?.account?.id,
  );
  const sourceAvailable =
    enabled &&
    choicesRead.data !== null &&
    (!opened ||
      (opened.project.id === choices.project.id &&
        opened.project.companyId === choices.project.companyId &&
        opened.sourceScope === choices.scope)) &&
    (!opened?.account || Boolean(currentAccount)) &&
    (!existingPost || current !== null) &&
    (!opened?.plan || Boolean(currentPlan));
  const preparationLoading =
    enabled &&
    !choicesQuery.error &&
    !query.error &&
    !planQuery.error &&
    (choicesQuery.loading ||
      (existingPost && query.loading) ||
      (Boolean(opened?.plan) && planQuery.loading));
  const changed = Boolean(
    opened &&
    (opened.project.revision !== choices.project.revision ||
      opened.project.companyId !== choices.project.companyId ||
      opened.sourceScope !== choices.scope ||
      (opened.detail &&
        current &&
        (opened.detail.variant.revision !== current.variant.revision ||
          opened.detail.scope !== current.scope)) ||
      (opened.account &&
        currentAccount?.revision !== opened.account.revision) ||
      (opened.plan && currentPlan?.revision !== opened.plan.revision)),
  );
  const canExecute = mode.includes('account')
    ? choices.isManager
    : mode === 'plan'
      ? true
      : mode === 'edit-plan'
        ? currentPlan?.canEdit === true
        : mode === 'variant'
          ? true
          : mode === 'edit-variant'
            ? current?.canEdit === true
            : current?.allowedActions.includes(mode) === true;
  const commands = useContentCommands({
    access,
    scope: `${choices.project.id}:${choices.scope}:${targetId}:${requestId}`,
    enabled: sourceAvailable,
    onDenied,
  });
  const begin = useFinanceExportRequestGuard(
    `${access.source}:${choices.scope}:${targetId}:${requestId}`,
    sourceAvailable,
  );
  const [baseline] = useState(() =>
    canonicalCommandJson({
      account,
      plan,
      body,
      note,
      evidenceUrl,
      actualLocal,
      actualTimezone,
      correctsEventId,
    }),
  );
  const preparation = {
    account,
    plan,
    body,
    note,
    evidenceUrl,
    actualLocal,
    actualTimezone,
    correctsEventId,
  };
  const payload = canonicalCommandJson(preparation);
  // oxlint-disable-next-line twenty/no-state-useref -- Only an exact retained draft transfer may bypass the discard prompt.
  const transfer = useRef<{
    from: string;
    to: string;
    owner: string;
    payload: string;
  } | null>(null);
  const retention = useCallback(
    (
      from: { pathname: string; search: string },
      to: { pathname: string; search: string },
    ) =>
      Boolean(
        transfer.current &&
        transfer.current.owner === `${access.source}:${choices.scope}` &&
        transfer.current.payload === payload &&
        transfer.current.from === `${from.pathname}${from.search}` &&
        transfer.current.to === `${to.pathname}${to.search}`,
      ),
    [access.source, choices.scope, payload],
  );
  useDeliveryDraftStatus({
    retainsNavigation: retention,
    dirty:
      !receipt &&
      Boolean(
        sent ||
        frozen ||
        Boolean(opened?.preparation) ||
        canonicalCommandJson({
          account,
          plan,
          body,
          note,
          evidenceUrl,
          actualLocal,
          actualTimezone,
          correctsEventId,
        }) !== baseline,
      ),
    saving: preparing || commands.busy,
  });
  const accept = async (value: ContentReceipt) => {
    setRefreshingSaved(true);
    setReceipt(value);
    setRetry(false);
    setMessage('');
    try {
      await onSaved();
    } catch {
      setMessage(
        t`This action is saved. The content list could not refresh yet.`,
      );
    } finally {
      setRefreshingSaved(false);
    }
  };
  const execute = async (command: ContentCommand) => {
    if (
      !sourceAvailable ||
      changed ||
      !canExecute ||
      commands.busy ||
      preparing
    )
      return;
    setSent(true);
    setRetry(false);
    setAbsent(false);
    setConflict(false);
    setMessage('');
    const result = await commands.execute(command);
    if (result.kind === 'FOUND') await accept(result.receipt);
    else if (result.kind === 'REJECTED') {
      setSent(false);
      setFrozen(null);
      setPreview(null);
      setMessage(result.message);
    } else if (result.kind === 'CONFLICT') {
      setConflict(true);
      setMessage(result.message);
    } else
      setMessage(
        t`The saved result is not known. Check this exact action before retrying.`,
      );
  };
  const check = async () => {
    const result = await commands.check(requestId, targetId, mode, frozen);
    if (result.kind === 'FOUND') await accept(result.receipt);
    else if (result.kind === 'NOT_FOUND') {
      setAbsent(true);
      setRetry(Boolean(frozen) && !conflict);
      setMessage(
        conflict
          ? t`No saved action was found. Refresh the current context, then review your retained draft as a new request.`
          : frozen
            ? t`No saved action was found. You can retry the exact unchanged request.`
            : t`No saved action was found. Unsaved preparation cannot be restored after a reload; start from the current record.`,
      );
    } else
      setMessage(
        t`The saved action could not be checked. Keep this request open and retry the check.`,
      );
  };
  const prepare = async () => {
    if (
      !opened ||
      !sourceAvailable ||
      changed ||
      !canExecute ||
      commands.busy ||
      preparing ||
      sent
    )
      return;
    setPreparing(true);
    setMessage('');
    const active = begin();
    try {
      let command: ContentCommand;
      if (account) {
        const input = {
          ...account,
          name: account.name.trim(),
          handle: account.handle.trim(),
          profileUrl: account.profileUrl.trim(),
        };
        command = {
          kind: 'ACCOUNT',
          input,
          hash: await hashCanonicalCommandInput(input),
        };
      } else if (plan) {
        const input = {
          ...plan,
          title: plan.title.trim(),
          purpose: plan.purpose.trim(),
        };
        command = {
          kind: 'PLAN',
          input,
          hash: await hashCanonicalCommandInput(input),
        };
      } else if (body && opened.plan) {
        if (
          !contentVariantReady(
            body,
            formChoices,
            opened.detail?.body,
            access.permission.access?.memberId ?? '',
          )
        )
          return;
        const input = {
          id: targetId,
          requestId,
          revision: opened.detail?.variant.revision ?? 0,
          planId: opened.plan.id,
          planRevision: opened.plan.revision,
          body: canonicalContentBody(body),
          expectedSourceFingerprint: null as string | null,
        };
        const result = (
          await client.query<PreviewDeliveryContentQuery>({
            query: PREVIEW_CONTENT,
            variables: { input },
            fetchPolicy: 'no-cache',
          })
        ).data?.previewDeliveryContent;
        if (
          !active() ||
          !result ||
          !access.matches(result) ||
          result.variantId !== targetId ||
          result.requestId !== requestId
        )
          throw new Error(
            t`Current posting preparation could not be verified. Retry the preview.`,
          );
        input.expectedSourceFingerprint = result.body.sourceFingerprint;
        const hash = await hashCanonicalCommandInput(input);
        if (hash !== result.inputHash)
          throw new Error(
            t`The prepared post did not match this request. Check the current package again.`,
          );
        command = { kind: 'VARIANT', input, hash };
        if (active()) setPreview(result.body);
      } else if (current) {
        const recordsPublication =
          mode === 'RECORD_PUBLICATION' || mode === 'CORRECT_PUBLICATION';
        const publishedAt = recordsPublication
          ? contentPlannedInstant(actualLocal, actualTimezone)
          : null;
        if (recordsPublication && !publishedAt)
          throw new Error(
            t`Choose a valid actual publication time and time zone; correct ambiguous daylight-saving times.`,
          );
        const input = {
          id: targetId,
          requestId,
          revision: current.variant.revision,
          action: mode,
          sourceFingerprint: current.currentSourceFingerprint,
          note: note.trim(),
          evidenceUrl: recordsPublication ? evidenceUrl.trim() : '',
          publishedAt,
          correctsEventId:
            mode === 'CORRECT_PUBLICATION' ? correctsEventId : null,
        };
        command = {
          kind: 'DECISION',
          input,
          hash: await hashCanonicalCommandInput(input),
        };
      } else return;
      if (active()) setFrozen(command);
    } catch (error) {
      if (active() && isOtogrowAccessDenied(error)) onDenied();
      if (active())
        setMessage(
          error instanceof Error
            ? error.message
            : t`This content action could not be prepared.`,
        );
    } finally {
      setPreparing(false);
    }
  };
  const replace = () => {
    if (
      !opened ||
      !sourceAvailable ||
      !canExecute ||
      commands.busy ||
      preparing ||
      (sent && !absent) ||
      !rebaseConfirmed ||
      opened.project.companyId !== choices.project.companyId
    )
      return;
    const next: ContentIntent = {
      ...opened,
      requestId: crypto.randomUUID(),
      sourceScope: choices.scope,
      project: choices.project,
      targetId: ['account', 'plan', 'variant'].includes(mode)
        ? crypto.randomUUID()
        : targetId,
      account: currentAccount,
      plan: currentPlan,
      detail: current ?? undefined,
      preparation,
    };
    const destination = contentDestination(params, {
      contentRequest: next.requestId,
      ...(mode.includes('account')
        ? { contentAccountId: next.targetId }
        : mode.includes('plan')
          ? { contentPlanId: next.targetId }
          : { contentPostId: next.targetId }),
    });
    transfer.current = {
      from: `${location.pathname}${location.search}`,
      to: destination,
      owner: `${access.source}:${choices.scope}`,
      payload,
    };
    onReplaceIntent(next);
  };
  const close = contentDestination(params, {
    ...CONTENT_CLOSE_COMMAND,
    ...(!receipt && mode === 'variant' ? { contentPostId: null } : {}),
    ...(!receipt && mode === 'account'
      ? { contentAccountId: null, contentView: 'accounts' }
      : {}),
    ...(!receipt && mode === 'plan'
      ? { contentPlanId: null, contentView: 'plans' }
      : {}),
  });
  const historyDestination = receipt
    ? contentDestination(params, {
        ...CONTENT_CLOSE_COMMAND,
        contentView:
          receipt.targetKind === 'ACCOUNT'
            ? 'accounts'
            : receipt.targetKind === 'PLAN'
              ? 'plans'
              : 'table',
        ...(receipt.targetKind === 'VARIANT'
          ? {
              contentPostId: receipt.targetId,
              contentVersion: String(receipt.version),
              contentHistoryAfter: null,
            }
          : {}),
      })
    : close;
  const publication =
    mode === 'RECORD_PUBLICATION' || mode === 'CORRECT_PUBLICATION';
  return (
    <section
      ref={focus}
      tabIndex={-1}
      aria-label={t`Content action preparation`}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h2>{labels.action(mode)}</h2>
          <Link to={close}>
            <Trans>Close preparation</Trans>
          </Link>
        </StyledDeliveryRow>
        {!sourceAvailable && (
          <p
            role={
              query.error || choicesQuery.error || planQuery.error
                ? 'alert'
                : 'status'
            }
          >
            {preparationLoading ? (
              <Trans>Loading content preparation…</Trans>
            ) : (
              <>
                <Trans>
                  Current content access could not be checked. Private
                  preparation is hidden and kept while you reconnect.
                </Trans>{' '}
                <StyledDeliveryButton
                  type="button"
                  disabled={!enabled}
                  onClick={() =>
                    void Promise.all([
                      choicesQuery.refetch(),
                      ...(existingPost ? [query.refetch()] : []),
                      ...(opened?.plan ? [planQuery.refetch()] : []),
                    ]).catch(() => undefined)
                  }
                >
                  <Trans>Check current preparation</Trans>
                </StyledDeliveryButton>
              </>
            )}
          </p>
        )}
        {message && <p role="alert">{message}</p>}
        {changed && !receipt && (
          <p role="alert">
            <Trans>
              This project, account or post changed. Check a sent action before
              preparing a new request from the current record.
            </Trans>
          </p>
        )}
        {(changed || conflict) && opened && !receipt && (
          <StyledDeliveryStack>
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || commands.busy || preparing}
              onClick={() =>
                void Promise.all([
                  choicesQuery.refetch(),
                  ...(existingPost ? [query.refetch()] : []),
                  ...(opened.plan ? [planQuery.refetch()] : []),
                  onSaved(),
                ]).catch(() => undefined)
              }
            >
              <Trans>Refresh current content context</Trans>
            </StyledDeliveryButton>
            <label>
              <input
                type="checkbox"
                checked={rebaseConfirmed}
                onChange={(event) =>
                  setRebaseConfirmed(event.currentTarget.checked)
                }
              />
              <Trans>
                Keep my entered fields and review them against the current
                record as a new request.
              </Trans>
            </label>
            <StyledDeliveryButton
              type="button"
              disabled={
                !sourceAvailable ||
                !canExecute ||
                commands.busy ||
                preparing ||
                (sent && !absent) ||
                !rebaseConfirmed ||
                opened.project.companyId !== choices.project.companyId
              }
              onClick={replace}
            >
              <Trans>Review retained draft as a new request</Trans>
            </StyledDeliveryButton>
            {sent && !absent && (
              <p>
                <Trans>
                  Check the exact sent action first. A new request is available
                  only after no saved result is confirmed.
                </Trans>
              </p>
            )}
          </StyledDeliveryStack>
        )}
        {!opened && !receipt && (
          <p>
            <Trans>
              This link can check a saved content action. Unsaved preparation is
              not restored after a reload.
            </Trans>
          </p>
        )}
        {!receipt && (sent || !opened) && (
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              disabled={!sourceAvailable || commands.busy || preparing}
              onClick={() => void check()}
            >
              <Trans>Check saved content action</Trans>
            </StyledDeliveryButton>
            {retry && frozen && (
              <StyledDeliveryButton
                type="button"
                disabled={
                  !sourceAvailable || changed || !canExecute || commands.busy
                }
                onClick={() => void execute(frozen)}
              >
                <Trans>Retry exact content action</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        )}
        <StyledContentBoundary
          hidden={!sourceAvailable}
          inert={!sourceAvailable || undefined}
          disabled={!sourceAvailable || commands.busy || preparing}
        >
          {receipt ? (
            <ContentActionStage
              key="saved"
              enabled={
                sourceAvailable &&
                !commands.busy &&
                !preparing &&
                !refreshingSaved
              }
              label={t`Saved content action`}
            >
              <h3>
                <Trans>Saved content action</Trans>
              </h3>
              <p role="status">
                {labels.action(receipt.action)} ·{' '}
                {receipt.version
                  ? t`Posting package version ${receipt.version}`
                  : t`Revision ${receipt.revision}`}
              </p>
              <p>
                <Trans>No social post was sent or changed by the OS.</Trans>
              </p>
              <Link to={historyDestination}>
                <Trans>Open saved result</Trans>
              </Link>
            </ContentActionStage>
          ) : (
            opened && (
              <>
                {!canExecute && (
                  <p role="status">
                    {current?.blockedReason ??
                      t`Your current role cannot perform this action.`}
                  </p>
                )}
                {frozen ? (
                  <ContentActionStage
                    key="preview"
                    enabled={sourceAvailable && !commands.busy && !preparing}
                    label={t`Review prepared content action`}
                  >
                    {preview ? (
                      <ContentPostingPreview body={preview} />
                    ) : current ? (
                      <ContentPostingPreview body={current.body} />
                    ) : account ? (
                      <StyledDeliveryStack>
                        <h3>{account.name}</h3>
                        <p>
                          {labels.platform(account.platform)} · {account.handle}
                        </p>
                        <p>{account.profileUrl}</p>
                        <p>
                          {account.archived
                            ? t`Account will be archived from new choices.`
                            : t`Account is for manual content planning only.`}
                        </p>
                      </StyledDeliveryStack>
                    ) : plan ? (
                      <StyledDeliveryStack>
                        <h3>{plan.title}</h3>
                        <p>{plan.purpose}</p>
                        <p>{plan.service ?? t`No client service linked`}</p>
                      </StyledDeliveryStack>
                    ) : null}
                    {note && <p>{note}</p>}
                    {publication && (
                      <p>
                        {evidenceUrl} · {actualLocal.replace('T', ' ')} ·{' '}
                        {actualTimezone}
                      </p>
                    )}
                    {!sent && (
                      <StyledDeliveryRow>
                        <StyledDeliveryButton
                          type="button"
                          disabled={changed || !canExecute}
                          onClick={() => void execute(frozen)}
                        >
                          {planningVariant
                            ? t`Save posting package`
                            : account
                              ? t`Save account metadata`
                              : plan
                                ? t`Save content plan`
                                : labels.action(mode)}
                        </StyledDeliveryButton>
                        <StyledDeliveryButton
                          type="button"
                          onClick={() => {
                            setFrozen(null);
                            setPreview(null);
                          }}
                        >
                          <Trans>Back to preparation</Trans>
                        </StyledDeliveryButton>
                      </StyledDeliveryRow>
                    )}
                  </ContentActionStage>
                ) : (
                  !sent && (
                    <ContentActionStage
                      key="preparation"
                      enabled={sourceAvailable && !commands.busy && !preparing}
                      label={t`Prepare content fields`}
                    >
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void prepare();
                        }}
                      >
                        <StyledDeliveryStack>
                          {account && (
                            <ContentAccountFields
                              value={account}
                              update={setAccount}
                              editing={mode === 'edit-account'}
                            />
                          )}
                          {(plan || body) && (
                            <ContentChoicePaging
                              choices={formChoices}
                              page={choicePage}
                              update={setChoicePage}
                              enabled={sourceAvailable}
                              accounts={Boolean(body)}
                              members={Boolean(body)}
                              engagements={Boolean(plan)}
                            />
                          )}
                          {plan && (
                            <ContentPlanFields
                              value={plan}
                              update={setPlan}
                              choices={formChoices}
                            />
                          )}
                          {body && (
                            <ContentVariantFields
                              value={body}
                              update={setBody}
                              choices={formChoices}
                              access={access}
                              original={opened.detail?.body}
                              enabled={sourceAvailable}
                              onDenied={onDenied}
                            />
                          )}
                          {!account && !plan && !body && current && (
                            <>
                              <ContentPostingPreview body={current.body} />
                              {current.blockedReason && (
                                <p role="alert">{current.blockedReason}</p>
                              )}
                              <p>
                                {publication
                                  ? t`Recording this link confirms you checked the post belongs to this account. The OS has not verified it with the platform.`
                                  : mode === 'CANCEL'
                                    ? t`Cancel this unpublished plan without deleting its history. This does not remove a social post.`
                                    : mode === 'RECORD_UNCERTAIN'
                                      ? t`Record uncertainty honestly. Check the social account before making another external posting attempt.`
                                      : mode === 'RECORD_FAILED'
                                        ? t`Record the failed manual attempt. This does not send or retry a social post.`
                                        : mode === 'APPROVE'
                                          ? t`Approve this exact posting package, including its caption, account, format and planned time.`
                                          : t`Review the exact posting package before recording your decision.`}
                              </p>
                              <label>
                                <Trans>Review or evidence note</Trans>
                                <textarea
                                  required={
                                    mode !== 'SUBMIT' && mode !== 'APPROVE'
                                  }
                                  maxLength={6000}
                                  rows={3}
                                  value={note}
                                  onChange={(event) =>
                                    setNote(event.currentTarget.value)
                                  }
                                />
                              </label>
                              {publication && (
                                <>
                                  {mode === 'CORRECT_PUBLICATION' && (
                                    <label>
                                      <Trans>
                                        Publication evidence to correct
                                      </Trans>
                                      <select
                                        required
                                        value={correctsEventId}
                                        onChange={(event) =>
                                          setCorrectsEventId(
                                            event.currentTarget.value,
                                          )
                                        }
                                      >
                                        <option value="">{t`Choose current recorded evidence`}</option>
                                        {current.latestPublication && (
                                          <option
                                            value={current.latestPublication.id}
                                          >
                                            {
                                              current.latestPublication
                                                .createdAt
                                            }{' '}
                                            ·{' '}
                                            {
                                              current.latestPublication
                                                .evidenceUrl
                                            }
                                          </option>
                                        )}
                                      </select>
                                    </label>
                                  )}
                                  <label>
                                    <Trans>Public post link</Trans>
                                    <input
                                      required
                                      type="url"
                                      pattern="https://.*"
                                      maxLength={2000}
                                      value={evidenceUrl}
                                      onChange={(event) =>
                                        setEvidenceUrl(
                                          event.currentTarget.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label>
                                    <Trans>Actual publication time</Trans>
                                    <input
                                      required
                                      type="datetime-local"
                                      value={actualLocal}
                                      onChange={(event) =>
                                        setActualLocal(
                                          event.currentTarget.value,
                                        )
                                      }
                                    />
                                  </label>
                                  <label>
                                    <Trans>Actual publication time zone</Trans>
                                    <input
                                      required
                                      value={actualTimezone}
                                      onChange={(event) =>
                                        setActualTimezone(
                                          event.currentTarget.value,
                                        )
                                      }
                                    />
                                  </label>
                                  {mode === 'CORRECT_PUBLICATION' && (
                                    <p>
                                      <Trans>
                                        This appends corrected evidence. It does
                                        not edit the social post or erase the
                                        original record.
                                      </Trans>
                                    </p>
                                  )}
                                </>
                              )}
                            </>
                          )}
                          <StyledDeliveryButton
                            type="submit"
                            disabled={
                              changed ||
                              !canExecute ||
                              Boolean(
                                plan && !contentPlanReady(plan, formChoices),
                              ) ||
                              Boolean(
                                body &&
                                !contentVariantReady(
                                  body,
                                  formChoices,
                                  opened.detail?.body,
                                  access.permission.access?.memberId ?? '',
                                ),
                              )
                            }
                          >
                            {planningVariant
                              ? t`Preview exact posting package`
                              : t`Review this action`}
                          </StyledDeliveryButton>
                        </StyledDeliveryStack>
                      </form>
                    </ContentActionStage>
                  )
                )}
              </>
            )
          )}
        </StyledContentBoundary>
      </StyledDeliveryStack>
    </section>
  );
};
