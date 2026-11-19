import { useLayoutEffect, useRef, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useOrphanCleanup } from '@/delivery/commitments/useOrphanCleanup';
import {
  orphanCleanupStorageKey,
  type OrphanCleanupOwner,
} from '@/delivery/commitments/orphanCleanupStorage';
import { type CommitmentSnapshot } from '@/delivery/commitments/commitment.types';
import { useCommitmentLabels } from '@/delivery/commitments/useCommitmentLabels';
import {
  StyledCommitmentActions,
  StyledCommitmentList,
} from '@/delivery/commitments/commitmentStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
type OrphanAllocation = CommitmentSnapshot['orphanAllocations'][number];
type CommitmentOrphanCleanupProps = {
  data: CommitmentSnapshot | undefined;
  identity: string | null;
  owner: OrphanCleanupOwner | undefined;
  engagementId: string;
  canManage: boolean;
  denied: boolean;
  cursor: string | null;
  editorOpen: boolean;
  onPrepare: () => void;
  onPage: (cursor: string | null) => void;
  onChanged: () => Promise<unknown>;
};
export const CommitmentOrphanCleanup = ({
  data,
  identity,
  owner,
  engagementId,
  canManage,
  denied,
  cursor,
  editorOpen,
  onPrepare,
  onPage,
  onChanged,
}: CommitmentOrphanCleanupProps) => {
  const { t } = useLingui();
  const labels = useCommitmentLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [selected, setSelected] = useState<
    (OrphanAllocation & { periodRevision: number }) | null
  >(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const cleanup = useOrphanCleanup({
    storageKey: orphanCleanupStorageKey(identity, engagementId),
    owner,
    engagementId,
    available: Boolean(data && canManage),
    denied,
    onChanged,
  });
  useLayoutEffect(() => {
    if (denied || editorOpen) setSelected(null);
  }, [denied, editorOpen]);
  useLayoutEffect(() => {
    heading.current?.focus();
  }, [selected?.allocationId]);
  const period = data?.periods.find(
    (item) => item.id === data.selectedPeriodId,
  );
  const current = data?.orphanAllocations.find(
    (item) => item.allocationId === selected?.allocationId,
  );
  const currentSelection = Boolean(
    current &&
    selected &&
    current.revision === selected.revision &&
    current.canRemove &&
    period?.id === selected.periodId &&
    period.state === 'OPEN' &&
    period.revision === selected.periodRevision,
  );
  const focusResult = () => {
    if (
      document.activeElement === document.body ||
      document.activeElement === document.documentElement
    )
      status.current?.focus();
  };
  if (denied) return null;
  return (
    <div hidden={!data || !canManage}>
      <details
        open={
          Boolean(cleanup.recovery || cleanup.receipt || selected) || undefined
        }
      >
        <summary>
          <Trans>Allocations with an unavailable source</Trans>
        </summary>
        <StyledDeliveryStack>
          <p>
            <Trans>
              These allocations no longer have current work in this commitment.
              Restricted live work is excluded. Releasing an allocation changes
              assigned quantity, not the promised quantity.
            </Trans>
          </p>
          {cleanup.error && <p role="alert">{cleanup.error}</p>}
          {cleanup.receipt && (
            <p role="status" ref={status} tabIndex={-1}>
              {cleanup.receipt.state === 'CANCELLED'
                ? t`This cleanup request was stopped before removal. Current commitment totals are checked separately.`
                : t`Cleanup recorded at ${new Date(cleanup.receipt.occurredAt!).toLocaleString()}. This confirms the earlier request. Current commitment totals are checked separately.`}
            </p>
          )}
          {cleanup.recovery && (
            <section aria-label={t`Cleanup result check`}>
              <p role="status" ref={status} tabIndex={-1}>
                {cleanup.checkedAbsent
                  ? t`No completed cleanup is recorded yet. The original request may still finish. Check again, retry the same request, or stop it with a recorded result.`
                  : t`A cleanup request needs its recorded result checked. The original request is kept, including after a reload.`}
              </p>
              <p>
                <Trans>
                  Stopping records a cancellation if this request has not
                  finished. If cleanup already finished, its recorded result
                  will be shown instead.
                </Trans>
              </p>
              <StyledCommitmentActions>
                <StyledDeliveryButton
                  disabled={cleanup.busy || !canManage}
                  onClick={async () => {
                    await cleanup.stop();
                    focusResult();
                  }}
                >
                  <Trans>Stop pending cleanup</Trans>
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  disabled={!data || !canManage || cleanup.busy}
                  onClick={async () => {
                    await cleanup.check();
                    focusResult();
                  }}
                >
                  <Trans>Check cleanup result</Trans>
                </StyledDeliveryButton>
                {cleanup.checkedAbsent && (
                  <>
                    <StyledDeliveryButton
                      disabled={
                        cleanup.busy ||
                        !data?.orphanAllocations.some(
                          (item) =>
                            item.allocationId ===
                              cleanup.recovery!.input.allocationId &&
                            item.revision ===
                              cleanup.recovery!.input.allocationRevision &&
                            item.canRemove,
                        ) ||
                        period?.revision !==
                          cleanup.recovery.input.periodRevision ||
                        period?.id !== cleanup.recovery.input.periodId
                      }
                      onClick={async () => {
                        await cleanup.submit(cleanup.recovery!.input);
                        focusResult();
                      }}
                    >
                      <Trans>Retry original cleanup</Trans>
                    </StyledDeliveryButton>
                  </>
                )}
              </StyledCommitmentActions>
            </section>
          )}
          {!data?.orphanAllocations.length && (
            <p>
              <Trans>No unavailable-source allocations on this page.</Trans>
            </p>
          )}
          <StyledCommitmentList>
            {data?.orphanAllocations.map((item) => {
              const line = data.lines.find((entry) => entry.id === item.lineId);
              return (
                <li key={item.allocationId}>
                  <strong>{line?.label ?? t`Commitment item`}</strong>
                  {line && <p>{labels.unit(line.unit)}</p>}
                  <small>
                    {period?.label} ·{' '}
                    {new Date(item.createdAt).toLocaleString(undefined, {
                      timeZone: period?.timezone ?? 'UTC',
                      timeZoneName: 'short',
                    })}
                  </small>
                  <p>
                    <Trans>
                      This allocation has no current fulfilment credit.
                    </Trans>
                  </p>
                  {!item.canRemove && (
                    <p role="status">
                      {item.removalBlockReason ||
                        t`This allocation cannot be released with the current plan. Refresh to check its eligibility.`}
                    </p>
                  )}
                  <StyledDeliveryButton
                    disabled={
                      cleanup.busy ||
                      Boolean(cleanup.recovery) ||
                      !item.canRemove
                    }
                    onClick={() =>
                      requestAction(() => {
                        onPrepare();
                        cleanup.prepare();
                        if (period)
                          setSelected({
                            ...item,
                            periodRevision: period.revision,
                          });
                      })
                    }
                  >
                    <Trans>Release this allocation</Trans>
                  </StyledDeliveryButton>
                </li>
              );
            })}
          </StyledCommitmentList>
          {selected &&
            !cleanup.recovery &&
            cleanup.receipt?.allocationId !== selected.allocationId && (
              <section aria-label={t`Confirm allocation release`}>
                <h3 ref={heading} tabIndex={-1}>
                  <Trans>Release one assigned work item?</Trans>
                </h3>
                <p>
                  {data?.lines.find((item) => item.id === selected.lineId)
                    ?.label ?? t`Commitment item`}{' '}
                  · {period?.label}
                </p>
                <p>
                  <Trans>
                    Assigned quantity decreases by one. Promised quantity and
                    delivery history stay unchanged. No task is deleted.
                  </Trans>
                </p>
                {!currentSelection && (
                  <p role="alert">
                    <Trans>
                      This allocation changed or is no longer eligible. Refresh
                      commitments before choosing it again.
                    </Trans>
                  </p>
                )}
                <StyledCommitmentActions>
                  <StyledDeliveryButton
                    disabled={!currentSelection || cleanup.busy}
                    onClick={async () => {
                      if (!period || !currentSelection) return;
                      await cleanup.submit({
                        requestId: crypto.randomUUID(),
                        engagementId,
                        periodId: period.id,
                        periodRevision: selected.periodRevision,
                        allocationId: selected.allocationId,
                        allocationRevision: selected.revision,
                        confirm: true,
                      });
                      focusResult();
                    }}
                  >
                    <Trans>Confirm release</Trans>
                  </StyledDeliveryButton>
                  <StyledDeliveryButton
                    disabled={cleanup.busy}
                    onClick={() => setSelected(null)}
                  >
                    <Trans>Cancel release</Trans>
                  </StyledDeliveryButton>
                </StyledCommitmentActions>
              </section>
            )}
          <StyledCommitmentActions>
            {cursor && (
              <StyledDeliveryButton
                disabled={cleanup.busy}
                onClick={() => onPage(null)}
              >
                <Trans>First unavailable-source page</Trans>
              </StyledDeliveryButton>
            )}
            {data?.nextOrphanAllocationCursor && (
              <StyledDeliveryButton
                disabled={cleanup.busy}
                onClick={() => onPage(data.nextOrphanAllocationCursor ?? null)}
              >
                <Trans>Next unavailable-source page</Trans>
              </StyledDeliveryButton>
            )}
          </StyledCommitmentActions>
        </StyledDeliveryStack>
      </details>
    </div>
  );
};
