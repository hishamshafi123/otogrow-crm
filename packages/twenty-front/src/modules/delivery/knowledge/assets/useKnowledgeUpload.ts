import { useLayoutEffect, useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import {
  hashKnowledgeBytes,
  validateKnowledgeFile,
} from '@/delivery/knowledge/assets/knowledge-file-bytes';
import {
  GET_KNOWLEDGE_UPLOAD,
  RECOVER_KNOWLEDGE_UPLOAD,
} from '@/delivery/knowledge/assets/knowledge-assets.graphql';
import {
  type KnowledgeAssetContext,
  type KnowledgeUploadReceipt,
  type KnowledgeUploadRequest,
  knowledgeUploadMatchesContext,
  knowledgeUploadResultMatches,
} from '@/delivery/knowledge/assets/knowledge-assets.types';
import {
  type KnowledgeUploadResultFragment,
  type DeliveryKnowledgeUploadQuery,
  type RecoverDeliveryKnowledgeUploadMutation,
} from '~/generated-metadata/graphql';

type SelectedKnowledgeFile = { file: File; request: KnowledgeUploadRequest };
export const useKnowledgeUpload = (
  context: KnowledgeAssetContext,
  enabled: boolean,
  onAuthorityLost: () => void,
) => {
  const { t } = useLingui();
  const client = useApolloClient();
  const store = useStore();
  const [recover] = useMutation<RecoverDeliveryKnowledgeUploadMutation>(
    RECOVER_KNOWLEDGE_UPLOAD,
  );
  const [selected, setSelected] = useState<SelectedKnowledgeFile | null>(null);
  const [receipt, setReceipt] = useState<KnowledgeUploadReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [message, setMessage] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const identity = JSON.stringify(context);
  // oxlint-disable-next-line twenty/no-state-useref -- An upload or digest may complete after its author, source or permission boundary changed.
  const operation = useRef({
    epoch: 0,
    busy: false,
    controller: null as AbortController | null,
    identity,
  });
  useLayoutEffect(() => {
    const currentOperation = operation.current;
    currentOperation.epoch += 1;
    currentOperation.controller?.abort();
    currentOperation.busy = false;
    setBusy(false);
    if (currentOperation.identity !== identity) {
      currentOperation.identity = identity;
      setSelected(null);
      setReceipt(null);
      setUnknown(false);
      setCanRetry(false);
      setMessage('');
      setValidationMessage('');
    }
    return () => {
      currentOperation.epoch += 1;
      currentOperation.controller?.abort();
      currentOperation.busy = false;
    };
  }, [enabled, identity]);
  const clear = () => {
    if (busy || unknown) return;
    setSelected(null);
    setReceipt(null);
    setCanRetry(false);
    setMessage('');
    setValidationMessage('');
  };
  const select = async (file: File | null) => {
    if (!enabled || operation.current.busy || unknown) return;
    clear();
    if (!file) return;
    const invalid = validateKnowledgeFile(file);
    if (invalid) {
      setMessage(
        invalid === 'FILE_TOO_LARGE'
          ? t`Choose a file no larger than 20 MiB.`
          : invalid === 'FILE_EMPTY'
            ? t`Choose a non-empty file.`
            : t`Choose a PNG, JPEG, WebP image or PDF.`,
      );
      return;
    }
    const started = operation.current.epoch;
    operation.current.busy = true;
    setBusy(true);
    try {
      const sha256 = await hashKnowledgeBytes(await file.arrayBuffer());
      if (started !== operation.current.epoch) return;
      setSelected({
        file,
        request: {
          requestId: crypto.randomUUID(),
          projectId: context.projectId,
          sourceId: context.sourceId,
          sourceRevision: context.sourceRevision,
          expectedCompanyId: context.companyId,
          name: file.name.trim(),
          size: file.size,
          sha256,
        },
      });
    } catch {
      if (started === operation.current.epoch)
        setMessage(t`The selected file could not be read. Choose it again.`);
    } finally {
      if (started === operation.current.epoch) {
        operation.current.busy = false;
        setBusy(false);
      }
    }
  };
  const accept = (
    result: KnowledgeUploadResultFragment | undefined,
    request: KnowledgeUploadRequest,
  ) => {
    if (
      !result ||
      !knowledgeUploadResultMatches(result, context) ||
      result.receipt === undefined
    )
      throw new Error('Unverified upload');
    const current = result.receipt;
    if (
      current !== null &&
      (!knowledgeUploadMatchesContext(current, context) ||
        current.requestId !== request.requestId ||
        current.id !== request.requestId ||
        current.sha256 !== request.sha256 ||
        current.size !== request.size ||
        current.name !== request.name ||
        current.sourceRevision !== request.sourceRevision)
    )
      throw new Error('Different upload');
    setUnknown(false);
    setReceipt(current);
    if (current?.state === 'READY') setValidationMessage('');
    setCanRetry(
      current === null ||
        current.state === 'FAILED' ||
        current.state === 'DISCARDED',
    );
    setMessage(
      current === null
        ? t`No saved upload was found. Check the file format and storage limits, or discard unused uploads to free space. You can then upload the selected file with a new request.`
        : current.state === 'READY'
          ? t`File uploaded privately. Use it in this draft, then save the knowledge version.`
          : current.state === 'PENDING'
            ? t`The upload is still being checked. It cannot be attached until ready.`
            : t`This upload is not available. You can select a new upload attempt.`,
    );
  };
  const upload = async (retry = false) => {
    if (
      !enabled ||
      !selected ||
      operation.current.busy ||
      unknown ||
      (receipt !== null && !retry) ||
      (retry && !canRetry)
    )
      return;
    const chosen = retry
      ? {
          ...selected,
          request: { ...selected.request, requestId: crypto.randomUUID() },
        }
      : selected;
    setSelected(chosen);
    setReceipt(null);
    setCanRetry(false);
    operation.current.busy = true;
    const started = operation.current.epoch;
    const controller = new AbortController();
    operation.current.controller = controller;
    setBusy(true);
    setUnknown(true);
    setMessage('');
    setValidationMessage('');
    try {
      const token = store.get(tokenPairState.atom)
        ?.accessOrWorkspaceAgnosticToken?.token;
      const headers =
        !store.get(isCookieAuthActiveState.atom) && token
          ? { Authorization: `Bearer ${token}` }
          : undefined;
      const body = new FormData();
      body.append('input', JSON.stringify(chosen.request));
      body.append('file', chosen.file);
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/portal/delivery-knowledge-files/upload`,
        {
          method: 'POST',
          body,
          headers,
          credentials: 'include',
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        },
      );
      if (started !== operation.current.epoch) return;
      if (response.status === 401 || response.status === 403) {
        onAuthorityLost();
        return;
      }
      if (!response.ok) {
        if (response.status === 400 || response.status === 409) {
          const body: unknown = await response.json().catch(() => null);
          if (started !== operation.current.epoch) return;
          if (
            typeof body === 'object' &&
            body !== null &&
            'message' in body &&
            typeof body.message === 'string'
          )
            setValidationMessage(body.message.trim().slice(0, 600));
        }
        throw new Error('Upload not confirmed');
      }
      const result = (await response.json()) as KnowledgeUploadResultFragment;
      if (started !== operation.current.epoch) return;
      accept(result, chosen.request);
    } catch {
      if (started === operation.current.epoch)
        setMessage(
          t`The upload outcome is unknown. Check this upload before trying again; your selected file is kept.`,
        );
    } finally {
      if (started === operation.current.epoch) {
        operation.current.busy = false;
        setBusy(false);
      }
    }
  };
  const check = async (recoverPending = false) => {
    if (!enabled || !selected || operation.current.busy) return;
    const started = operation.current.epoch;
    operation.current.busy = true;
    setBusy(true);
    setMessage('');
    try {
      const input = {
        projectId: context.projectId,
        sourceId: context.sourceId,
        requestId: selected.request.requestId,
        sha256: selected.request.sha256,
      };
      const result = recoverPending
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
      accept(result, selected.request);
    } catch (error) {
      if (started !== operation.current.epoch) return;
      if (isOtogrowAccessDenied(error)) onAuthorityLost();
      else {
        setUnknown(true);
        setMessage(
          t`This upload could not be checked. Keep the selected file here and check again.`,
        );
      }
    } finally {
      if (started === operation.current.epoch) {
        operation.current.busy = false;
        setBusy(false);
      }
    }
  };
  return {
    selected,
    receipt,
    busy,
    unknown,
    canRetry,
    message,
    validationMessage,
    select,
    upload,
    check,
    clear,
  };
};
