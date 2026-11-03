import { useCallback, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type DeliveryCreativeFeedbackChangeInput,
  type DeliveryCreativeFeedbackCreateInput,
} from '~/generated-metadata/graphql';
import {
  type CreativeFeedback,
  type CreativeReviewTarget,
} from '@/delivery/creative/review/creative-review.types';
import {
  formatCreativeReviewTime,
  parseCreativeReviewTime,
} from '@/delivery/creative/review/creative-review-navigation';
import { useCreativeReviewLabels } from '@/delivery/creative/review/useCreativeReviewLabels';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { StyledReviewBoundary } from '@/delivery/creative/review/creativeReviewStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export type CreativeFeedbackCommand =
  | DeliveryCreativeFeedbackCreateInput
  | DeliveryCreativeFeedbackChangeInput;
type CreativeFeedbackFormProps = {
  taskId: string;
  target: CreativeReviewTarget;
  comparison?: CreativeReviewTarget | null;
  feedback?: CreativeFeedback;
  action: 'CREATE' | 'REPLY' | 'ADDRESSED' | 'RESOLVED' | 'REOPENED';
  readOnly: boolean;
  playhead: number | null;
  onSave: (input: CreativeFeedbackCommand) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
export const CreativeFeedbackForm = ({
  taskId,
  target,
  comparison,
  feedback,
  action,
  readOnly,
  playhead,
  onSave,
  onCancel,
  onReload,
}: CreativeFeedbackFormProps) => {
  const { t } = useLingui();
  const labels = useCreativeReviewLabels();
  const title =
    action === 'CREATE'
      ? t`Add precise feedback`
      : action === 'REPLY'
        ? t`Reply to feedback`
        : action === 'ADDRESSED'
          ? t`Mark feedback addressed`
          : action === 'RESOLVED'
            ? t`Verify and resolve feedback`
            : t`Reopen feedback`;
  const signature = `${target.targetToken}:${feedback?.id}:${feedback?.revision}:${comparison?.targetToken}`;
  const [opened] = useState(signature);
  const [commandId] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState({
    body: '',
    anchorKind: 'GENERAL',
    start: '',
    end: '',
    evidence: 'NONE',
  });
  const [attempt, setAttempt] = useState<CreativeFeedbackCommand | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: { values, attempt },
    busy: saving,
  });
  const stale = opened !== signature;
  const timeAllowed = Boolean(
    target.asset && /^(video|audio)\//.test(target.asset.mimeType),
  );
  const startMs = parseCreativeReviewTime(values.start);
  const endMs = parseCreativeReviewTime(values.end);
  const validAnchor =
    values.anchorKind === 'GENERAL' ||
    (timeAllowed &&
      startMs !== null &&
      (values.anchorKind === 'TIME' || (endMs !== null && endMs > startMs)));
  const correction =
    values.evidence === 'COMPARISON'
      ? comparison
      : values.evidence === 'RECORDED'
        ? feedback?.correction
        : values.evidence === 'ORIGINAL'
          ? target
          : null;
  const requiresEvidence = action === 'ADDRESSED' || action === 'RESOLVED';
  const canSave =
    !readOnly &&
    !saving &&
    !stale &&
    !attempt &&
    Boolean(values.body.trim()) &&
    values.body.trim().length <= 6000 &&
    (!requiresEvidence ||
      (correction?.availability === 'AVAILABLE' &&
        Boolean(correction.assetId && correction.targetToken) &&
        (action !== 'ADDRESSED' ||
          correction.assetId !== feedback?.assetId))) &&
    (action !== 'CREATE' ||
      (validAnchor && Boolean(target.assetId && target.targetToken)));
  const focus = useCallback((element: HTMLElement | null) => {
    element?.focus();
    element?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const submit = async (input: CreativeFeedbackCommand) => {
    setSaving(true);
    setError('');
    try {
      setAttempt(input);
      if (await onSave(input)) {
        draft.markSaved({ values, attempt: null });
        setAttempt(null);
      } else
        setError(
          t`The request was not confirmed. Check the same earlier request before starting another.`,
        );
    } finally {
      setSaving(false);
    }
  };
  return (
    <section role="region" aria-label={title} tabIndex={-1} ref={focus}>
      <h3>{title}</h3>
      {stale && <DeliveryDraftConflict onReload={onReload} busy={saving} />}
      {error && <p role="alert">{error}</p>}
      {attempt && (
        <p role="status">
          <Trans>
            Your earlier request is kept with its original identity and
            contents.
          </Trans>
        </p>
      )}
      <form
        ref={draft.formRef}
        onChange={draft.onChange}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          if (action === 'CREATE' && target.assetId && target.targetToken)
            void submit({
              commandId,
              taskId,
              targetKind: target.targetKind,
              submissionVersion: target.submissionVersion ?? null,
              assetId: target.assetId,
              targetToken: target.targetToken,
              body: values.body,
              anchorKind: values.anchorKind,
              startMs: values.anchorKind === 'GENERAL' ? null : startMs,
              endMs: values.anchorKind === 'RANGE' ? endMs : null,
            });
          else if (feedback)
            void submit({
              commandId,
              taskId,
              feedbackId: feedback.id,
              revision: feedback.revision,
              action,
              body: values.body,
              evidenceTargetKind: correction?.targetKind ?? null,
              evidenceSubmissionVersion: correction?.submissionVersion ?? null,
              evidenceAssetId: correction?.assetId ?? null,
              evidenceTargetToken: correction?.targetToken ?? null,
            });
        }}
      >
        <StyledReviewBoundary
          disabled={readOnly || saving || stale || Boolean(attempt)}
        >
          <StyledDeliveryStack>
            <p>
              {labels.target(target)} · {target.asset?.name}
            </p>
            {action === 'CREATE' && (
              <>
                <label>
                  <Trans>Feedback location</Trans>
                  <select
                    aria-label={t`Feedback location`}
                    value={values.anchorKind}
                    onChange={(event) =>
                      setValues({ ...values, anchorKind: event.target.value })
                    }
                  >
                    <option value="GENERAL">{t`General asset feedback`}</option>
                    {timeAllowed && (
                      <>
                        <option value="TIME">{t`At a time`}</option>
                        <option value="RANGE">{t`Time range`}</option>
                      </>
                    )}
                  </select>
                </label>
                {values.anchorKind !== 'GENERAL' && (
                  <>
                    <label>
                      <Trans>Start time (minutes:seconds)</Trans>
                      <input
                        value={values.start}
                        placeholder="0:12.500"
                        onChange={(event) =>
                          setValues({ ...values, start: event.target.value })
                        }
                      />
                    </label>
                    <StyledDeliveryButton
                      type="button"
                      disabled={playhead === null || !Number.isFinite(playhead)}
                      onClick={() => {
                        if (playhead !== null)
                          setValues({
                            ...values,
                            start: formatCreativeReviewTime(
                              Math.round(playhead * 1000),
                            ),
                          });
                      }}
                    >
                      <Trans>Use current playback time</Trans>
                    </StyledDeliveryButton>
                    {values.anchorKind === 'RANGE' && (
                      <label>
                        <Trans>End time (minutes:seconds)</Trans>
                        <input
                          value={values.end}
                          onChange={(event) =>
                            setValues({ ...values, end: event.target.value })
                          }
                        />
                      </label>
                    )}
                    <small>
                      <Trans>
                        Times refer to this exact asset. Duration is not
                        independently verified; inspect the player before
                        saving.
                      </Trans>
                    </small>
                  </>
                )}
              </>
            )}
            {requiresEvidence && (
              <>
                <p>
                  <Trans>
                    Explain what changed or what you verified. This does not
                    approve the deliverable or resolve its source automatically.
                  </Trans>
                </p>
                <label>
                  <Trans>Correction evidence</Trans>
                  <select
                    aria-label={t`Correction evidence`}
                    value={values.evidence}
                    onChange={(event) =>
                      setValues({ ...values, evidence: event.target.value })
                    }
                  >
                    <option value="NONE">{t`Choose exact evidence`}</option>
                    {action === 'RESOLVED' &&
                      target.availability === 'AVAILABLE' && (
                        <option value="ORIGINAL">{t`Original asset reviewed`}</option>
                      )}
                    {comparison?.availability === 'AVAILABLE' && (
                      <option value="COMPARISON">{t`Compared version: ${labels.target(comparison)} — ${comparison.asset?.name}`}</option>
                    )}
                    {feedback?.correction?.availability === 'AVAILABLE' && (
                      <option value="RECORDED">{t`Previously recorded correction`}</option>
                    )}
                  </select>
                </label>
                {!comparison && (
                  <small>
                    <Trans>
                      Choose a comparison above to cite another exact version as
                      correction evidence.
                    </Trans>
                  </small>
                )}
              </>
            )}
            <label>
              <Trans>Feedback or explanation</Trans>
              <textarea
                required
                maxLength={6000}
                value={values.body}
                onChange={(event) =>
                  setValues({ ...values, body: event.target.value })
                }
              />
            </label>
            <StyledDeliveryButton type="submit" disabled={!canSave}>
              {title}
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </StyledReviewBoundary>
      </form>
      {attempt && (
        <StyledDeliveryButton
          disabled={readOnly || saving}
          onClick={() => void submit(attempt)}
        >
          <Trans>Check earlier feedback request</Trans>
        </StyledDeliveryButton>
      )}
      <StyledDeliveryButton disabled={saving} onClick={onCancel}>
        <Trans>Cancel feedback editing</Trans>
      </StyledDeliveryButton>
    </section>
  );
};
