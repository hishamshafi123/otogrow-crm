import { useLayoutEffect, useRef, useState } from 'react';
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { knowledgeDestination } from '@/delivery/knowledge/knowledge-navigation';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import { KnowledgeAssetFile } from '@/delivery/knowledge/assets/KnowledgeAssetFile';
import { StyledKnowledgeAttachments } from '@/delivery/knowledge/assets/knowledgeAssetStyles';
import {
  GET_KNOWLEDGE_UPLOADS,
  GET_KNOWLEDGE_UPLOAD,
  RECOVER_KNOWLEDGE_UPLOAD,
  DISCARD_KNOWLEDGE_UPLOAD,
} from '@/delivery/knowledge/assets/knowledge-assets.graphql';
import {
  type KnowledgeAssetContext,
  type KnowledgeUploadReceipt,
  knowledgeAssetMetadata,
  knowledgeUploadResultMatches,
} from '@/delivery/knowledge/assets/knowledge-assets.types';
import {
  type DeliveryKnowledgeUploadsQuery,
  type DeliveryKnowledgeUploadQuery,
  type RecoverDeliveryKnowledgeUploadMutation,
  type DiscardDeliveryKnowledgeUploadMutation,
} from '~/generated-metadata/graphql';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type KnowledgeUnusedUploadsProps = {
  context: KnowledgeAssetContext;
  enabled: boolean;
  projectWide?: boolean;
  selectedIds?: string[];
  onUse?: (receipt: KnowledgeUploadReceipt) => void;
  onAuthorityLost: () => void;
};
const KnowledgeUnusedUpload = ({
  receipt,
  context,
  enabled,
  onUse,
  onAuthorityLost,
  onRefresh,
  showRecoveryLink,
}: {
  receipt: KnowledgeUploadReceipt;
  context: KnowledgeAssetContext;
  enabled: boolean;
  onUse?: (receipt: KnowledgeUploadReceipt) => void;
  onAuthorityLost: () => void;
  onRefresh: () => Promise<unknown>;
  showRecoveryLink: boolean;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const client = useApolloClient();
  const [recover] = useMutation<RecoverDeliveryKnowledgeUploadMutation>(
    RECOVER_KNOWLEDGE_UPLOAD,
  );
  const [discard] = useMutation<DiscardDeliveryKnowledgeUploadMutation>(
    DISCARD_KNOWLEDGE_UPLOAD,
  );
  const previousCompany = receipt.availability === 'PREVIOUS_COMPANY';
  const displayName = previousCompany
    ? t`Unused upload from an earlier brand`
    : receipt.name;
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [message, setMessage] = useState('');
  // oxlint-disable-next-line twenty/no-state-useref -- File recovery may return after the displayed source or authority changes.
  const operation = useRef({ epoch: 0, busy: false });
  useLayoutEffect(() => {
    const currentOperation = operation.current;
    currentOperation.epoch += 1;
    currentOperation.busy = false;
    setBusy(false);
    return () => {
      currentOperation.epoch += 1;
      currentOperation.busy = false;
    };
  }, [enabled, context.scope, receipt.id]);
  useDeliveryDraftStatus({ dirty: unknown, saving: busy });
  const act = async (action: 'CHECK' | 'RECOVER' | 'DISCARD') => {
    if (!enabled || operation.current.busy || (unknown && action !== 'CHECK'))
      return;
    const started = operation.current.epoch;
    operation.current.busy = true;
    setBusy(true);
    setMessage('');
    if (action !== 'CHECK') setUnknown(true);
    try {
      const input = {
        projectId: context.projectId,
        sourceId: receipt.sourceId,
        requestId: receipt.requestId,
        sha256: receipt.sha256,
      };
      const result =
        action === 'DISCARD'
          ? (await discard({ variables: { input } })).data
              ?.discardDeliveryKnowledgeUpload
          : action === 'RECOVER'
            ? (await recover({ variables: { input } })).data
                ?.recoverDeliveryKnowledgeUpload
            : (
                await client.query<DeliveryKnowledgeUploadQuery>({
                  query: GET_KNOWLEDGE_UPLOAD,
                  variables: { input },
                  fetchPolicy: 'no-cache',
                })
              ).data?.deliveryKnowledgeUpload;
      if (started !== operation.current.epoch) return;
      if (
        !result ||
        !knowledgeUploadResultMatches(result, {
          ...context,
          sourceId: receipt.sourceId,
        }) ||
        result.receipt === undefined ||
        (result.receipt !== null &&
          (result.receipt.id !== receipt.id ||
            result.receipt.requestId !== receipt.requestId ||
            result.receipt.workspaceId !== context.workspaceId ||
            result.receipt.projectId !== context.projectId ||
            result.receipt.sourceId !== receipt.sourceId ||
            result.receipt.uploadedBy !== context.memberId ||
            result.receipt.uploaderUserWorkspaceId !==
              context.userWorkspaceId ||
            result.receipt.sha256 !== receipt.sha256 ||
            (result.receipt.companyId !== context.companyId &&
              !(
                result.receipt.availability === 'PREVIOUS_COMPANY' &&
                !result.receipt.canAttach &&
                !result.receipt.canRecover
              ))))
      )
        throw new Error('Unverified receipt');
      setUnknown(false);
      setMessage(
        t`Current upload status checked. Saved knowledge versions were not changed.`,
      );
      await onRefresh().catch(() => undefined);
    } catch (error) {
      if (started !== operation.current.epoch) return;
      if (isOtogrowAccessDenied(error)) onAuthorityLost();
      else {
        setUnknown(true);
        setMessage(
          t`The file action could not be confirmed. Check its current status before another action.`,
        );
      }
    } finally {
      if (started === operation.current.epoch) {
        operation.current.busy = false;
        setBusy(false);
      }
    }
  };
  return (
    <StyledDeliveryStack>
      <strong>{displayName}</strong>
      <small>
        {receipt.mimeType} · {t`${Math.ceil(receipt.size / 1024)} KB`} ·{' '}
        {receipt.state === 'READY'
          ? t`Ready, not attached`
          : receipt.state === 'PENDING'
            ? t`Upload pending`
            : receipt.state === 'DISCARDED'
              ? t`Discarded upload`
              : t`Upload unavailable`}
      </small>
      {previousCompany && (
        <p>
          <Trans>
            This unused file belongs to an earlier brand on this project. It can
            only be discarded; it cannot be previewed or attached to current
            knowledge.
          </Trans>
        </p>
      )}
      {receipt.cleanupPending && (
        <p>
          <Trans>
            Storage cleanup is still pending. Check this upload before
            considering its storage released.
          </Trans>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <StyledDeliveryRow>
        {unknown ? (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || busy}
            onClick={() => void act('CHECK')}
          >
            <Trans>Check upload status</Trans>
          </StyledDeliveryButton>
        ) : (
          <>
            {showRecoveryLink &&
              enabled &&
              !busy &&
              receipt.state === 'READY' &&
              receipt.canAttach &&
              !previousCompany && (
                <Link
                  to={knowledgeDestination(params, {
                    project: context.projectId,
                    source: null,
                    knowledgeCreate: receipt.sourceId,
                    knowledgeEdit: null,
                    knowledgeVersion: null,
                  })}
                >{t`Recover draft for ${displayName}`}</Link>
              )}
            {onUse &&
              receipt.state === 'READY' &&
              receipt.canAttach &&
              !previousCompany && (
                <StyledDeliveryButton
                  type="button"
                  disabled={!enabled || busy}
                  onClick={() => onUse(receipt)}
                >{t`Use ${displayName} in this draft`}</StyledDeliveryButton>
              )}
            {receipt.canRecover && (
              <StyledDeliveryButton
                type="button"
                disabled={!enabled || busy}
                onClick={() => void act('RECOVER')}
              >
                <Trans>Recover stored upload</Trans>
              </StyledDeliveryButton>
            )}
            {receipt.canDiscard && (
              <StyledDeliveryButton
                type="button"
                disabled={!enabled || busy}
                onClick={() => void act('DISCARD')}
              >{t`Discard unused ${displayName}`}</StyledDeliveryButton>
            )}
          </>
        )}
      </StyledDeliveryRow>
      {onUse &&
        receipt.state === 'READY' &&
        receipt.canAttach &&
        !previousCompany && (
          <KnowledgeAssetFile
            sourceId={receipt.sourceId}
            selection={{
              asset: knowledgeAssetMetadata(receipt),
              version: null,
            }}
            scope={context.scope}
            enabled={enabled && !unknown}
            onAuthorityLost={onAuthorityLost}
          />
        )}
    </StyledDeliveryStack>
  );
};
export const KnowledgeUnusedUploads = ({
  context,
  enabled,
  projectWide = false,
  selectedIds = [],
  onUse,
  onAuthorityLost,
}: KnowledgeUnusedUploadsProps) => {
  const { t } = useLingui();
  const [opened, setOpened] = useState(false);
  const [afterId, setAfterId] = useState<string | null>(null);
  const sourceId = projectWide ? null : context.sourceId;
  const query = useQuery<DeliveryKnowledgeUploadsQuery>(GET_KNOWLEDGE_UPLOADS, {
    variables: { input: { projectId: context.projectId, sourceId, afterId } },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !opened || !enabled,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryKnowledgeUploads,
    source: `${context.scope}:${sourceId}:${afterId}`,
    enabled: opened && enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      value.workspaceId === context.workspaceId &&
      value.memberId === context.memberId &&
      value.userWorkspaceId === context.userWorkspaceId &&
      value.projectId === context.projectId &&
      value.items.every(
        (item) =>
          (item.companyId === context.companyId ||
            (item.availability === 'PREVIOUS_COMPANY' &&
              !item.canAttach &&
              !item.canRecover)) &&
          item.workspaceId === context.workspaceId &&
          item.projectId === context.projectId &&
          item.uploadedBy === context.memberId &&
          item.uploaderUserWorkspaceId === context.userWorkspaceId &&
          (projectWide || item.sourceId === context.sourceId),
      ),
  });
  useLayoutEffect(() => {
    if (opened && enabled && isOtogrowAccessDenied(query.error))
      onAuthorityLost();
  }, [opened, enabled, query.error, onAuthorityLost]);
  return (
    <StyledKnowledgeAttachments aria-label={t`Unused brand uploads`}>
      <details>
        <summary>
          <Trans>Unused brand uploads</Trans>
        </summary>
        <StyledDeliveryStack>
          <p>
            <Trans>
              Check uploads left by interrupted drafts, reopen their original
              draft, or discard unused files. Unsaved notes cannot be restored.
              Earlier saved versions are preserved.
            </Trans>
          </p>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || query.loading}
            onClick={() => {
              setOpened(true);
              if (opened) void query.refetch().catch(() => undefined);
            }}
          >
            <Trans>Check unused uploads</Trans>
          </StyledDeliveryButton>
          {opened && enabled && !reading.data && (
            <p role={query.error ? 'alert' : 'status'}>
              {query.loading
                ? t`Checking unused uploads…`
                : t`Unused uploads could not be checked. Refresh current access and try again.`}
            </p>
          )}
          {opened && reading.data && (
            <>
              {reading.data.items
                .filter((item) => !selectedIds.includes(item.id))
                .map((receipt) => (
                  <KnowledgeUnusedUpload
                    key={`${context.scope}:${receipt.id}`}
                    receipt={receipt}
                    context={context}
                    enabled={enabled}
                    onUse={onUse}
                    onAuthorityLost={onAuthorityLost}
                    onRefresh={() => query.refetch()}
                    showRecoveryLink={projectWide}
                  />
                ))}
              {!reading.data.items.some(
                (item) => !selectedIds.includes(item.id),
              ) && (
                <p>
                  <Trans>No unused uploads on this page.</Trans>
                </p>
              )}
              <StyledDeliveryRow>
                {afterId !== null && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => setAfterId(null)}
                  >
                    <Trans>First upload page</Trans>
                  </StyledDeliveryButton>
                )}
                {reading.data.nextCursor && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => setAfterId(reading.data?.nextCursor ?? null)}
                  >
                    <Trans>More unused uploads</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledDeliveryRow>
            </>
          )}
        </StyledDeliveryStack>
      </details>
    </StyledKnowledgeAttachments>
  );
};
