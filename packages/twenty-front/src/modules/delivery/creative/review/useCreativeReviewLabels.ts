import { useLingui } from '@lingui/react/macro';
import { type CreativeReviewTarget } from '@/delivery/creative/review/creative-review.types';
export const useCreativeReviewLabels = () => {
  const { t } = useLingui();
  const states: Record<string, string> = {
    OPEN: t`Open`,
    ADDRESSED: t`Addressed — reviewer verification needed`,
    RESOLVED: t`Resolved by reviewer`,
  };
  const actions: Record<string, string> = {
    CREATED: t`Feedback added`,
    REPLY: t`Reply added`,
    REPLIED: t`Reply added`,
    ADDRESSED: t`Marked addressed`,
    RESOLVED: t`Resolved`,
    REOPENED: t`Reopened`,
  };
  const availability: Record<string, string> = {
    NO_SUBMISSION: t`No submission yet. Submit completed work before final review.`,
    LEGACY_IDENTITY_MISSING: t`This older submission has no frozen asset identity. Its links remain in submission history; it cannot be substituted with the current asset.`,
    ASSET_MISSING: t`This exact asset is no longer available. Choose another permitted source explicitly.`,
    STORAGE_NOT_READY: t`This asset upload is not ready. Refresh its source before loading.`,
    UNSUPPORTED_MEDIA: t`This file type cannot be played here. Review the original source.`,
  };
  const warnings: Record<string, string> = {
    HISTORICAL_ASSET_LINEAGE: t`This asset belongs to earlier production. Its feedback and identity remain unchanged.`,
    DURATION_NOT_VERIFIED: t`Media duration is not independently verified. Check timestamp feedback against the player.`,
    LEGACY_SUBMISSION_NO_FROZEN_MEDIA: t`No frozen media identity was recorded for this older submission.`,
    MEDIA_ASSET_UNAVAILABLE: t`The recorded asset is unavailable.`,
    INVALID_FROZEN_FINAL_ASSET: t`The recorded final asset cannot be verified.`,
    MEDIA_STORAGE_NOT_READY: t`The stored asset is not ready.`,
    MEDIA_METADATA_INVALID: t`The recorded file size or metadata cannot be verified.`,
    MEDIA_TYPE_UNSUPPORTED: t`This media type is unsupported.`,
    TARGET_CHANGED_SINCE_FEEDBACK: t`This thread preserves the original review identity; current source metadata or availability has changed.`,
  };
  return {
    state: (code: string) => states[code] ?? t`Status unavailable`,
    action: (code: string) => actions[code] ?? t`Feedback changed`,
    warning: (code: string) =>
      warnings[code] ??
      t`This source has a review limitation. Inspect its exact identity before continuing.`,
    unavailable: (code: string) =>
      availability[code] ??
      t`This review target is unavailable. Refresh current access or choose another permitted source.`,
    target: (target: CreativeReviewTarget) =>
      target.targetKind === 'SUBMISSION'
        ? t`Submission ${target.submissionVersion}`
        : target.asset?.name
          ? t`Production asset: ${target.asset.name}`
          : t`Production asset`,
  };
};
