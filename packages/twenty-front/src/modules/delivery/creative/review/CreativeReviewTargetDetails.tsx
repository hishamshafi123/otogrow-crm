import { Trans, useLingui } from '@lingui/react/macro';
import { type CreativeReviewTarget } from '@/delivery/creative/review/creative-review.types';
import { useCreativeReviewLabels } from '@/delivery/creative/review/useCreativeReviewLabels';

type CreativeReviewTargetDetailsProps = {
  target: CreativeReviewTarget;
  recorded?: boolean;
};
export const CreativeReviewTargetDetails = ({
  target,
  recorded = false,
}: CreativeReviewTargetDetailsProps) => {
  const { t } = useLingui();
  const labels = useCreativeReviewLabels();
  return (
    <>
      <strong>{labels.target(target)}</strong>
      {target.availability !== 'AVAILABLE' && (
        <p role="status">{labels.unavailable(target.availability)}</p>
      )}
      {target.asset && (
        <>
          <p>
            {target.asset.name} ·{' '}
            {recorded
              ? t`Lineage as recorded for this event`
              : target.asset.current
                ? t`Current production lineage`
                : t`Earlier production lineage`}
          </p>
          <details>
            <summary>
              <Trans>Exact source versions</Trans>
            </summary>
            <p>
              {t`Brief ${target.asset.briefVersion} · Production ${target.asset.productionVersion} · Assembly ${target.asset.assemblyVersion}`}
              {target.asset.shotVersion
                ? ` · ${t`Shot version ${target.asset.shotVersion}`}`
                : ''}
            </p>
            {target.creativeVersion != null && (
              <p>{t`Submitted creative version ${target.creativeVersion}`}</p>
            )}
          </details>
        </>
      )}
      {target.warnings.length > 0 && (
        <details>
          <summary>
            <Trans>Source limitations</Trans>
          </summary>
          {target.warnings.map((code) => (
            <p key={code}>{labels.warning(code)}</p>
          ))}
        </details>
      )}
    </>
  );
};
