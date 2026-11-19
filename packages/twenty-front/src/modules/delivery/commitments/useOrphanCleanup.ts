import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  GET_ORPHAN_CLEANUP_RECEIPT,
  REMOVE_ORPHAN_ALLOCATION,
  CANCEL_ORPHAN_CLEANUP,
} from '@/delivery/commitments/delivery-commitments.graphql';
import {
  clearOrphanCleanupRecovery,
  readOrphanCleanupRecovery,
  saveOrphanCleanupRecovery,
  type OrphanCleanupOwner,
} from '@/delivery/commitments/orphanCleanupStorage';
import {
  type DeliveryCommitmentOrphanCleanupInput,
  type DeliveryCommitmentOrphanCleanupFieldsFragment,
  type DeliveryOrphanCommitmentCleanupReceiptQuery,
  type DeliveryOrphanCommitmentCleanupReceiptQueryVariables,
  type RemoveDeliveryOrphanCommitmentAllocationMutation,
  type RemoveDeliveryOrphanCommitmentAllocationMutationVariables,
  type CancelDeliveryOrphanCommitmentCleanupMutation,
  type CancelDeliveryOrphanCommitmentCleanupMutationVariables,
} from '~/generated-metadata/graphql';
const CLEANUP_REQUEST_TIMEOUT_MS = 30000;
const boundedCleanupRequest = async <TResult>(
  request: (signal: AbortSignal) => Promise<TResult>,
): Promise<TResult> => {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error('Cleanup request timed out'));
        }, CLEANUP_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};
export const useOrphanCleanup = ({
  storageKey,
  owner,
  engagementId,
  available,
  denied,
  onChanged,
}: {
  storageKey: string;
  owner: OrphanCleanupOwner | undefined;
  engagementId: string;
  available: boolean;
  denied: boolean;
  onChanged: () => Promise<unknown>;
}) => {
  const { t } = useLingui();
  const client = useApolloClient();
  const [savedRecovery, setRecovery] = useState(() =>
    readOrphanCleanupRecovery(storageKey),
  );
  const [receipt, setReceipt] =
    useState<DeliveryCommitmentOrphanCleanupFieldsFragment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checkedAbsent, setCheckedAbsent] = useState(false);
  const [mutate] = useMutation<
    RemoveDeliveryOrphanCommitmentAllocationMutation,
    RemoveDeliveryOrphanCommitmentAllocationMutationVariables
  >(REMOVE_ORPHAN_ALLOCATION);
  const [cancel] = useMutation<
    CancelDeliveryOrphanCommitmentCleanupMutation,
    CancelDeliveryOrphanCommitmentCleanupMutationVariables
  >(CANCEL_ORPHAN_CLEANUP);
  // oxlint-disable-next-line twenty/no-state-useref -- A reply cannot restore a receipt after current contract authority changes.
  const epoch = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref -- Same-turn confirmation clicks must share a single request.
  const pending = useRef(false);
  useDeliveryDraftStatus({ dirty: false, saving: busy });
  const matchesOwner = useCallback(
    (candidate: OrphanCleanupOwner) =>
      Boolean(
        owner &&
        candidate.workspaceId === owner.workspaceId &&
        candidate.memberId === owner.memberId &&
        candidate.userWorkspaceId === owner.userWorkspaceId,
      ),
    [owner],
  );
  const recovery =
    savedRecovery &&
    matchesOwner(savedRecovery.owner) &&
    savedRecovery.input.engagementId === engagementId
      ? savedRecovery
      : null;
  useLayoutEffect(() => {
    epoch.current += 1;
    setBusy(false);
    pending.current = false;
    return () => {
      epoch.current += 1;
    };
  }, [
    storageKey,
    available,
    denied,
    owner?.workspaceId,
    owner?.memberId,
    owner?.userWorkspaceId,
  ]);
  useLayoutEffect(() => {
    if (
      denied ||
      (owner && savedRecovery && !matchesOwner(savedRecovery.owner))
    ) {
      clearOrphanCleanupRecovery(storageKey);
      setRecovery(null);
      setReceipt(null);
      setError('');
      setCheckedAbsent(false);
    }
  }, [denied, owner, savedRecovery, matchesOwner, storageKey]);
  const accept = (
    result: DeliveryCommitmentOrphanCleanupFieldsFragment | undefined,
    input: DeliveryCommitmentOrphanCleanupInput,
  ) => {
    if (
      !result ||
      !matchesOwner(result) ||
      result.engagementId !== engagementId ||
      result.periodId !== input.periodId ||
      result.requestId !== input.requestId ||
      result.allocationId !== input.allocationId ||
      result.requestedAllocationRevision !== input.allocationRevision ||
      result.periodRevision !== input.periodRevision ||
      !['NOT_FOUND', 'REMOVED', 'CANCELLED'].includes(result.state)
    )
      return false;
    if (
      result.state === 'REMOVED' &&
      (result.removedAllocationRevision !== input.allocationRevision + 1 ||
        !result.occurredAt ||
        !Number.isFinite(Date.parse(result.occurredAt)))
    )
      return false;
    if (
      result.state === 'CANCELLED' &&
      (result.removedAllocationRevision !== null ||
        !result.occurredAt ||
        !Number.isFinite(Date.parse(result.occurredAt)))
    )
      return false;
    if (
      result.state === 'NOT_FOUND' &&
      (result.removedAllocationRevision !== null || result.occurredAt !== null)
    )
      return false;
    if (result.state === 'REMOVED' || result.state === 'CANCELLED') {
      setReceipt(result);
      setRecovery(null);
      clearOrphanCleanupRecovery(storageKey);
      setCheckedAbsent(false);
    } else setCheckedAbsent(true);
    return true;
  };
  const check = async () => {
    if (!available || !recovery || pending.current) return;
    const started = epoch.current;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await boundedCleanupRequest((signal) =>
        client.query<
          DeliveryOrphanCommitmentCleanupReceiptQuery,
          DeliveryOrphanCommitmentCleanupReceiptQueryVariables
        >({
          query: GET_ORPHAN_CLEANUP_RECEIPT,
          variables: { input: recovery.input },
          fetchPolicy: 'no-cache',
          context: { fetchOptions: { signal } },
        }),
      );
      if (started !== epoch.current) return;
      if (
        !accept(
          result.data?.deliveryOrphanCommitmentCleanupReceipt,
          recovery.input,
        )
      )
        throw new Error();
      if (
        result.data?.deliveryOrphanCommitmentCleanupReceipt.state !==
        'NOT_FOUND'
      ) {
        try {
          await boundedCleanupRequest(() => onChanged());
        } catch {
          if (started === epoch.current)
            setError(
              t`The cleanup result is recorded, but the current plan could not refresh. Refresh commitments to check current totals.`,
            );
        }
      }
    } catch {
      if (started === epoch.current)
        setError(
          t`The cleanup result could not be checked. The original request is kept; check again before retrying.`,
        );
    } finally {
      if (started === epoch.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  const submit = async (input: DeliveryCommitmentOrphanCleanupInput) => {
    if (
      !available ||
      !owner ||
      pending.current ||
      (recovery && JSON.stringify(recovery.input) !== JSON.stringify(input))
    )
      return false;
    const nextRecovery = { owner, input };
    if (!saveOrphanCleanupRecovery(storageKey, nextRecovery)) {
      setError(
        t`This browser could not keep the recovery request. Allow browser session storage and retry before releasing the allocation.`,
      );
      return false;
    }
    setRecovery(nextRecovery);
    setReceipt(null);
    setCheckedAbsent(false);
    setError('');
    const started = epoch.current;
    pending.current = true;
    setBusy(true);
    try {
      const result = (
        await boundedCleanupRequest((signal) =>
          mutate({
            variables: { input },
            context: { fetchOptions: { signal } },
          }),
        )
      ).data?.removeDeliveryOrphanCommitmentAllocation;
      if (started !== epoch.current) return false;
      if (
        !result ||
        !['REMOVED', 'CANCELLED'].includes(result.state) ||
        !accept(result, input)
      )
        throw new Error();
      try {
        await boundedCleanupRequest(() => onChanged());
      } catch {
        if (started === epoch.current)
          setError(
            t`The cleanup was recorded, but current totals could not refresh. Refresh commitments to check the current plan.`,
          );
      }
      return started === epoch.current;
    } catch {
      if (started === epoch.current)
        setError(
          t`The cleanup result is not confirmed. Check the recorded result before retrying; the original request is kept.`,
        );
      return false;
    } finally {
      if (started === epoch.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  const stop = async () => {
    if (!available || !recovery || pending.current) return;
    const started = epoch.current;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = (
        await boundedCleanupRequest((signal) =>
          cancel({
            variables: { input: recovery.input },
            context: { fetchOptions: { signal } },
          }),
        )
      ).data?.cancelDeliveryOrphanCommitmentCleanup;
      if (started !== epoch.current) return;
      if (
        !result ||
        !['REMOVED', 'CANCELLED'].includes(result.state) ||
        !accept(result, recovery.input)
      )
        throw new Error();
      try {
        await boundedCleanupRequest(() => onChanged());
      } catch {
        if (started === epoch.current)
          setError(
            t`The cleanup result is recorded, but the current plan could not refresh. Refresh commitments to check current totals.`,
          );
      }
    } catch {
      if (started === epoch.current)
        setError(
          t`Stopping this cleanup could not be confirmed. The original request is kept. Check its recorded result before another attempt.`,
        );
    } finally {
      if (started === epoch.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  return {
    recovery,
    receipt,
    busy,
    error,
    checkedAbsent,
    check,
    submit,
    stop,
    prepare: () => {
      if (recovery || busy) return;
      setReceipt(null);
      setError('');
    },
  };
};
