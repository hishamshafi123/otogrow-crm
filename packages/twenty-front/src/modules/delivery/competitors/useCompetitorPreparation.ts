import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useApolloClient, useQuery } from '@apollo/client/react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { hashCanonicalCommandInput } from '@/delivery/commands/canonical-command-hash';
import { type useCompetitorAccess } from '@/delivery/competitors/useCompetitorAccess';
import { useCompetitorRead } from '@/delivery/competitors/useCompetitorRead';
import { useCompetitorCommands } from '@/delivery/competitors/useCompetitorCommands';
import {
  type CompetitorBody,
  type CompetitorCommand,
  type CompetitorDetail,
  type CompetitorIntent,
  type CompetitorPreview,
  type CompetitorProject,
  type CompetitorReceipt,
  type CompetitorStateAction,
} from '@/delivery/competitors/competitor.types';
import {
  GET_COMPETITOR_SOURCE,
  PREVIEW_COMPETITOR_SOURCE,
} from '@/delivery/competitors/delivery-competitors.graphql';
import { canonicalCompetitorBody } from '@/delivery/competitors/competitor-body';
import { competitorDestination } from '@/delivery/competitors/competitor-navigation';

export type CompetitorPreparationOptions = {
  access: ReturnType<typeof useCompetitorAccess>;
  project: CompetitorProject;
  sourceId: string;
  requestId: string;
  mode: string;
  intent: CompetitorIntent | null;
  consumeIntent: (requestId: string) => void;
  enabled: boolean;
  contextScope: string;
  onDenied: () => void;
  onSaved: () => Promise<unknown>;
  onReplaceIntent: (intent: CompetitorIntent) => void;
};
export const useCompetitorPreparation = ({
  access,
  project,
  sourceId,
  requestId,
  mode,
  intent,
  consumeIntent,
  enabled,
  contextScope,
  onDenied,
  onSaved,
  onReplaceIntent,
}: CompetitorPreparationOptions) => {
  const { t } = useLingui();
  const client = useApolloClient();
  const [params] = useSearchParams();
  const location = useLocation();
  const planning = mode === 'new' || mode === 'edit';
  const [opened] = useState(() =>
    intent?.requestId === requestId &&
    intent.id === sourceId &&
    intent.projectId === project.id &&
    intent.mode === mode
      ? intent
      : null,
  );
  const [body, setBody] = useState<CompetitorBody | null>(opened?.body ?? null);
  const [note, setNote] = useState(opened?.note ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [rebaseConfirmed, setRebaseConfirmed] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [formScope, setFormScope] = useState<string | null>(null);
  const [frozen, setFrozen] = useState<CompetitorCommand | null>(null);
  const [receipt, setReceipt] = useState<CompetitorReceipt | null>(null);
  const [preview, setPreview] = useState<CompetitorPreview | null>(null);
  const [sent, setSent] = useState(false);
  const [absent, setAbsent] = useState(false);
  const [retry, setRetry] = useState(false);
  const [message, setMessage] = useState('');
  // oxlint-disable-next-line twenty/no-state-useref -- A transfer authorizes only its exact destination and unchanged private payload.
  const transfer = useRef<{
    from: string;
    to: string;
    owner: string;
    payload: string;
  } | null>(null);
  useLayoutEffect(() => consumeIntent(requestId), [requestId, consumeIntent]);
  const detailQuery = useQuery<{ deliveryCompetitorSource: CompetitorDetail }>(
    GET_COMPETITOR_SOURCE,
    {
      variables: { input: { id: sourceId } },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
      skip: !enabled || mode === 'new',
    },
  );
  const read = useCompetitorRead({
    value: detailQuery.data?.deliveryCompetitorSource,
    access,
    scope: `command:${sourceId}`,
    query: detailQuery,
    matches: (value) =>
      value.source.id === sourceId &&
      value.project.id === project.id &&
      value.scope === contextScope &&
      value.collectionEnabled === false,
    onDenied,
  });
  const current = mode === 'new' ? null : read.data;
  const anchorMatches =
    !opened || project.companyId === opened.expectedCompanyId;
  const sourceAvailable =
    enabled && anchorMatches && (mode === 'new' || current !== null);
  useLayoutEffect(() => {
    if (!anchorMatches) onDenied();
  }, [anchorMatches, onDenied]);
  const formReady = formScope === contextScope;
  const changed = Boolean(
    opened &&
    (project.revision !== opened.projectRevision ||
      project.companyId !== opened.expectedCompanyId ||
      contextScope !== opened.scope ||
      (current && current.source.revision !== opened.revision)),
  );
  const canExecute =
    mode === 'new'
      ? access.permission.manager
      : mode === 'edit'
        ? current?.canEdit
        : mode === 'PAUSE'
          ? current?.canPause
          : mode === 'ARCHIVE'
            ? current?.canArchive
            : mode === 'RESTORE'
              ? current?.canRestore
              : false;
  const commands = useCompetitorCommands({
    access,
    scope: `${project.id}:${project.revision}:${project.companyId}:${sourceId}:${contextScope}`,
    enabled: sourceAvailable,
    onDenied,
  });
  const begin = useFinanceExportRequestGuard(
    `${access.source}:${project.id}:${project.revision}:${project.companyId}:${contextScope}:${sourceId}:${requestId}`,
    sourceAvailable,
  );
  const payload = JSON.stringify({ body, note });
  const retention = useCallback(
    (
      from: { pathname: string; search: string },
      to: { pathname: string; search: string },
    ) => {
      if (
        transfer.current &&
        transfer.current.owner === `${access.source}:${contextScope}` &&
        transfer.current.payload === payload &&
        transfer.current.from === `${from.pathname}${from.search}` &&
        transfer.current.to === `${to.pathname}${to.search}`
      )
        return true;
      if (
        !opened ||
        !access.permission.ready ||
        from.pathname !== '/delivery' ||
        to.pathname !== '/delivery'
      )
        return false;
      const previous = new URLSearchParams(from.search);
      const next = new URLSearchParams(to.search);
      if (
        !previous.has('competitorAfter') ||
        next.has('competitorAfter') ||
        previous.get('competitorProject') !== opened.projectId ||
        previous.get('competitorSource') !== opened.id ||
        previous.get('competitorRequest') !== opened.requestId ||
        previous.get('competitorMode') !== opened.mode
      )
        return false;
      previous.delete('competitorAfter');
      previous.sort();
      next.sort();
      return previous.toString() === next.toString();
    },
    [access.source, access.permission.ready, contextScope, opened, payload],
  );
  useDeliveryDraftStatus({
    dirty:
      receipt === null &&
      Boolean(
        sent ||
        frozen ||
        confirmed ||
        rebaseConfirmed ||
        (opened && body && !fastDeepEqual(body, opened.body)) ||
        note !== (opened?.note ?? ''),
      ),
    saving: commands.busy || preparing,
    retainsNavigation: retention,
  });
  const accept = async (value: CompetitorReceipt) => {
    setReceipt(value);
    setRetry(false);
    setAbsent(false);
    setMessage('');
    try {
      await onSaved();
    } catch {
      setMessage(
        t`The saved result is confirmed. The source directory could not reload yet.`,
      );
    }
  };
  const execute = async (command: CompetitorCommand) => {
    if (
      !sourceAvailable ||
      changed ||
      !canExecute ||
      commands.busy ||
      preparing ||
      !confirmed ||
      (planning && !formReady)
    )
      return;
    setSent(true);
    setAbsent(false);
    setRetry(false);
    setMessage('');
    const result = await commands.execute(command);
    if (result.kind === 'FOUND') await accept(result.receipt);
    else
      setMessage(
        result.kind === 'UNKNOWN'
          ? t`The saved result could not be confirmed. Keep this exact action and check its result before trying again.`
          : result.message,
      );
  };
  const check = async () => {
    setRetry(false);
    setAbsent(false);
    const result = await commands.check(
      requestId,
      sourceId,
      project.id,
      planning ? 'SAVE' : mode,
      frozen,
    );
    if (result.kind === 'FOUND') await accept(result.receipt);
    else if (result.kind === 'NOT_FOUND') {
      setAbsent(true);
      setRetry(
        Boolean(frozen && !changed && canExecute && (!planning || formReady)),
      );
      setMessage(
        frozen
          ? t`No saved action was found under your current access. You can retry the same prepared action or explicitly prepare a new request.`
          : t`No saved action was found under your current access. Close this recovery link and prepare a new source action from the current directory.`,
      );
    } else
      setMessage(
        t`The saved action could not be checked. Keep this view open and check again.`,
      );
  };
  const prepare = async () => {
    if (
      !opened ||
      !sourceAvailable ||
      changed ||
      !canExecute ||
      preparing ||
      commands.busy
    )
      return;
    setPreparing(true);
    setMessage('');
    const valid = begin();
    try {
      const anchor = {
        id: sourceId,
        requestId,
        revision: opened.revision,
        projectId: project.id,
        projectRevision: opened.projectRevision,
        expectedCompanyId: opened.expectedCompanyId,
      };
      if (planning && body && formReady) {
        const input = { ...anchor, body: canonicalCompetitorBody(body) };
        const hash = await hashCanonicalCommandInput(input);
        const result = (
          await client.query<{
            previewDeliveryCompetitorSource: CompetitorPreview;
          }>({
            query: PREVIEW_COMPETITOR_SOURCE,
            variables: { input },
            fetchPolicy: 'no-cache',
          })
        ).data?.previewDeliveryCompetitorSource;
        if (!valid()) return;
        if (
          !result ||
          !access.matches(result) ||
          result.scope !== contextScope ||
          result.project.id !== project.id ||
          result.project.revision !== project.revision ||
          result.project.companyId !== project.companyId ||
          result.requestId !== requestId ||
          result.sourceId !== sourceId ||
          result.inputHash !== hash ||
          result.collectionEnabled !== false ||
          result.collectionState !==
            (['MANUAL', 'META_AD_LIBRARY'].includes(body.platform)
              ? 'MANUAL_ONLY'
              : 'NOT_CONNECTED') ||
          !result.body.canonicalReference ||
          !result.body.canonicalKey ||
          !fastDeepEqual(canonicalCompetitorBody(result.body), input.body)
        ) {
          setMessage(
            t`The current source preview could not be confirmed. Your draft is retained. Check access and try again.`,
          );
          return;
        }
        setPreview(result);
        setFrozen({ kind: 'SAVE', input, hash });
      } else if (!planning) {
        const input = {
          ...anchor,
          action: mode as CompetitorStateAction,
          note: note.trim(),
        };
        const hash = await hashCanonicalCommandInput(input);
        if (valid()) setFrozen({ kind: 'CHANGE', input, hash });
      }
    } catch (error) {
      if (valid() && isOtogrowAccessDenied(error)) onDenied();
      else if (valid())
        setMessage(
          error instanceof Error
            ? error.message
            : t`The source could not be checked. Your draft is retained.`,
        );
    } finally {
      setPreparing(false);
    }
  };
  const replace = () => {
    if (
      !opened ||
      !body ||
      !sourceAvailable ||
      !canExecute ||
      commands.busy ||
      preparing ||
      (sent && !absent) ||
      !rebaseConfirmed ||
      project.companyId !== opened.expectedCompanyId
    )
      return;
    const next: CompetitorIntent = {
      ...opened,
      id: mode === 'new' ? crypto.randomUUID() : sourceId,
      requestId: crypto.randomUUID(),
      projectRevision: project.revision,
      expectedCompanyId: project.companyId,
      revision:
        mode === 'new' ? 0 : (current?.source.revision ?? opened.revision),
      scope: contextScope,
      body: !planning && current ? canonicalCompetitorBody(current.body) : body,
      note,
    };
    const destination = competitorDestination(params, {
      competitorSource: next.id,
      competitorRequest: next.requestId,
      competitorMode: next.mode,
      competitorVersion: null,
      competitorHistoryAfter: null,
    });
    transfer.current = {
      from: `${location.pathname}${location.search}`,
      to: destination,
      owner: `${access.source}:${contextScope}`,
      payload,
    };
    onReplaceIntent(next);
  };
  const returnToEditing = () => {
    if (sent) return;
    setFrozen(null);
    setPreview(null);
    setConfirmed(false);
  };
  return {
    planning,
    opened,
    body,
    setBody,
    note,
    setNote,
    confirmed,
    setConfirmed,
    rebaseConfirmed,
    setRebaseConfirmed,
    preparing,
    setFormScope,
    frozen,
    receipt,
    preview,
    sent,
    absent,
    retry,
    message,
    detailQuery,
    current,
    sourceAvailable,
    formReady,
    changed,
    canExecute,
    commands,
    execute,
    check,
    prepare,
    replace,
    returnToEditing,
  };
};
