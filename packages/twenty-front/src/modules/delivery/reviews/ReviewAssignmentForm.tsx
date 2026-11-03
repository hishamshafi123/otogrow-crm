import { useCallback, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryReviewAssignmentInput } from '~/generated-metadata/graphql';
import { type TaskReviewSnapshot } from '@/delivery/reviews/review.types';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { StyledAssignmentBoundary } from '@/delivery/reviews/reviewStyles';
type ReviewAssignmentFormProps = {
  snapshot: TaskReviewSnapshot;
  readOnly: boolean;
  onSave: (input: DeliveryReviewAssignmentInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
export const ReviewAssignmentForm = ({
  snapshot,
  readOnly,
  onSave,
  onCancel,
  onReload,
}: ReviewAssignmentFormProps) => {
  const { t } = useLingui();
  const signature = `${snapshot.taskRevision}:${snapshot.pending?.submissionVersion}:${snapshot.assignment?.revision ?? 0}:${snapshot.eligibleReviewers.map((item) => item.id).join(',')}`;
  const [opened] = useState(signature);
  const [commandId] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState({
    mode: snapshot.assignment?.mode ?? 'PRIMARY',
    reviewerId: snapshot.assignment?.reviewerId ?? '',
    reason: '',
  });
  const [attempt, setAttempt] = useState<DeliveryReviewAssignmentInput | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: { values, attempt },
    busy: saving,
  });
  const stale = opened !== signature;
  const eligible =
    values.mode === 'PRIMARY' ||
    snapshot.eligibleReviewers.some((item) => item.id === values.reviewerId);
  const canSave =
    !readOnly &&
    !saving &&
    !stale &&
    !attempt &&
    snapshot.pending?.submissionVersion != null &&
    eligible &&
    Boolean(values.reason.trim());
  const focus = useCallback((element: HTMLElement | null) => {
    element?.focus();
    element?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const submit = async (input: DeliveryReviewAssignmentInput) => {
    setSaving(true);
    setError('');
    setAttempt(input);
    try {
      if (await onSave(input)) {
        draft.markSaved({ values, attempt: null });
        setAttempt(null);
      } else
        setError(
          t`The request was not confirmed. Check the earlier request before assigning again.`,
        );
    } finally {
      setSaving(false);
    }
  };
  return (
    <section
      aria-label={t`Assign submission reviewer`}
      tabIndex={-1}
      ref={focus}
    >
      <h3>
        <Trans>Assign submission reviewer</Trans>
      </h3>
      <p>
        <Trans>
          This applies only to this submitted version. It grants no project
          access or production rights and does not transfer client-delivery
          responsibility. A new submission returns to the primary manager.
        </Trans>
      </p>
      {stale && <DeliveryDraftConflict onReload={onReload} busy={saving} />}
      {error && <p role="alert">{error}</p>}
      <form
        ref={draft.formRef}
        onChange={draft.onChange}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave || snapshot.pending?.submissionVersion == null) return;
          void submit({
            commandId,
            taskId: snapshot.taskId,
            taskRevision: snapshot.taskRevision,
            submissionVersion: snapshot.pending.submissionVersion,
            assignmentRevision: snapshot.assignment?.revision ?? 0,
            mode: values.mode,
            reviewerId: values.mode === 'BACKUP' ? values.reviewerId : null,
            reason: values.reason,
          });
        }}
      >
        <StyledAssignmentBoundary
          disabled={readOnly || saving || stale || Boolean(attempt)}
        >
          <StyledDeliveryStack>
            <label>
              <Trans>Review assignment</Trans>
              <select
                aria-label={t`Review assignment`}
                value={values.mode}
                onChange={(event) =>
                  setValues({
                    ...values,
                    mode: event.target.value,
                    reviewerId: '',
                  })
                }
              >
                <option value="PRIMARY">{t`Use the primary manager`}</option>
                <option value="BACKUP">{t`Choose a submission backup`}</option>
              </select>
            </label>
            {values.mode === 'BACKUP' && (
              <label>
                <Trans>Eligible submission backup</Trans>
                <select
                  aria-label={t`Eligible submission backup`}
                  required
                  value={values.reviewerId}
                  onChange={(event) =>
                    setValues({ ...values, reviewerId: event.target.value })
                  }
                >
                  <option value="">{t`Choose an eligible project member`}</option>
                  {snapshot.eligibleReviewers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <Trans>Reason for reviewer assignment</Trans>
              <textarea
                required
                maxLength={2000}
                value={values.reason}
                onChange={(event) =>
                  setValues({ ...values, reason: event.target.value })
                }
              />
            </label>
            <StyledDeliveryButton disabled={!canSave} type="submit">
              <Trans>Save submission reviewer</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </StyledAssignmentBoundary>
      </form>
      {attempt && (
        <StyledDeliveryButton
          disabled={readOnly || saving}
          onClick={() => void submit(attempt)}
        >
          <Trans>Check earlier assignment request</Trans>
        </StyledDeliveryButton>
      )}
      <StyledDeliveryButton disabled={saving} onClick={onCancel}>
        <Trans>Cancel reviewer assignment</Trans>
      </StyledDeliveryButton>
    </section>
  );
};
