import { useCreativeLearningLabels } from '@/delivery/creative/learning/useCreativeLearningLabels';
import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAdvertisingLabels } from '@/delivery/advertising/workbench/useAdvertisingLabels';
import { type CreativeLearningBody } from '@/delivery/creative/learning/creative-learning.types';
import {
  StyledLearningFacts,
  StyledLearningText,
} from '@/delivery/creative/learning/creativeLearningStyles';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';
type CreativeLearningEvidenceProps = {
  body: CreativeLearningBody;
};

export const CreativeLearningEvidence = ({
  body,
}: CreativeLearningEvidenceProps) => {
  const { t } = useLingui();
  const labels = useAdvertisingLabels();
  const learningLabels = useCreativeLearningLabels();
  const source = body.source;
  const target = body.creativeTarget;
  const componentLabels: Record<string, string> = {
    BASE: t`Main video`,
    HOOK: t`Opening hook`,
    CTA: t`Call to action`,
  };
  return (
    <StyledDeliveryStack>
      <p>
        <Trans>
          This is a human-proposed association of one ad and one approved
          creative. It does not verify Meta’s creative identity, prove causation
          or establish a future winning ad.
        </Trans>
      </p>
      <StyledLearningFacts>
        <div>
          <dt>
            <Trans>Reporting currency</Trans>
          </dt>
          <dd>{source.currency}</dd>
        </div>
        <div>
          <dt>
            <Trans>Exact ad and account</Trans>
          </dt>
          <dd>
            {body.adName} · {body.adId} ·{' '}
            {source.accountId ?? t`Account unknown`}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Reporting window</Trans>
          </dt>
          <dd>
            {source.fromDate} – {source.throughDate} ·{' '}
            {source.timezone ?? t`Timezone unknown`}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Ad spend</Trans>
          </dt>
          <dd>{labels.money(body.adSpendMicros, source.currency)}</dd>
        </div>
        <div>
          <dt>
            <Trans>Selected outcome</Trans>
          </dt>
          <dd>
            {labels.goal(body.goalSnapshot.kind)} ·{' '}
            {body.goalSnapshot.metricLabel ?? t`Human evidence`} ·{' '}
            {body.goalSnapshot.value ?? t`Unknown`}{' '}
            {body.goalSnapshot.metricUnit === 'MONEY' ? source.currency : ''}
          </dd>
        </div>
        {body.goalSnapshot.targetCostMicros != null && (
          <div>
            <dt>
              <Trans>Selected target cost</Trans>
            </dt>
            <dd>
              {labels.money(
                body.goalSnapshot.targetCostMicros,
                source.currency,
              )}
            </dd>
          </div>
        )}
        <div>
          <dt>
            <Trans>Measurement provenance</Trans>
          </dt>
          <dd>
            {labels.provenance(body.goalSnapshot.metricProvenance)}{' '}
            {body.goalSnapshot.metricReason ?? ''}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Approved creative</Trans>
          </dt>
          <dd>
            {target.asset?.name ?? t`Asset unavailable`} ·{' '}
            {t`Submission ${body.submissionVersion}`} ·{' '}
            {t`Creative version ${target.creativeVersion ?? 0}`}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Submitted and independently approved by</Trans>
          </dt>
          <dd>
            {body.submittedByName} · {body.approvedByName}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Copy evidence</Trans>
          </dt>
          <dd>
            {body.copyProvenance === 'SUBMITTED_COPY'
              ? t`Frozen submitted copy`
              : body.copyProvenance === 'HUMAN_DECLARED'
                ? t`Human-declared copy, not independently verified`
                : t`Copy unknown`}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Final file identity captured</Trans>
          </dt>
          <dd>{body.assetHashCapturedAt}</dd>
        </div>
      </StyledLearningFacts>
      <p>{body.associationEvidence}</p>
      {body.evidenceUrl && (
        <a href={body.evidenceUrl} target="_blank" rel="noreferrer">
          <Trans>Open association evidence</Trans>
        </a>
      )}
      {body.goalSnapshot.evidence && <p>{body.goalSnapshot.evidence}</p>}
      <StyledDeliveryStack>
        {body.warnings.map((warning) => (
          <p role="status" key={warning}>
            {learningLabels.warning(warning)}
          </p>
        ))}
      </StyledDeliveryStack>
      <details>
        <summary>
          <Trans>Creative components, planned intent and source versions</Trans>
        </summary>
        <StyledDeliveryStack>
          {body.submittedLearning ? (
            <>
              <p>
                <Trans>
                  The approved brief describes intent. Rendered component
                  evidence is listed separately.
                </Trans>
              </p>
              <StyledLearningText>{t`Concept: ${body.submittedLearning.concept}\nAngle: ${body.submittedLearning.angle}\nPlanned hook: ${body.submittedLearning.plannedHook}\nPlanned CTA: ${body.submittedLearning.plannedCta}`}</StyledLearningText>
            </>
          ) : (
            <p>
              <Trans>
                This earlier submission has no frozen learning snapshot. Current
                briefs or later variants have not been substituted.
              </Trans>
            </p>
          )}
          {body.components.length ? (
            body.components.map((component) => (
              <p key={component.role}>
                {componentLabels[component.role] ?? t`Creative part`} ·{' '}
                {component.provenance === 'ASSEMBLY_RUN'
                  ? t`Recorded assembly component`
                  : t`Human-declared component`}{' '}
                · {component.name}
              </p>
            ))
          ) : (
            <p>
              <Trans>Rendered hook, base and CTA components are unknown.</Trans>
            </p>
          )}
          {body.copyText && (
            <StyledLearningText>{body.copyText}</StyledLearningText>
          )}
          <small>{t`Final file SHA-256: ${body.assetSha256}`}</small>
        </StyledDeliveryStack>
      </details>
      <Link to={`/delivery?view=ads&adSource=META&adReport=${body.sourceId}`}>
        <Trans>Inspect exact advertising report</Trans>
      </Link>
      <Link
        to={`/delivery?view=creative&task=${body.taskId}&creativeStage=final&creativeSubmission=${body.submissionVersion}`}
      >
        <Trans>Inspect approved creative submission</Trans>
      </Link>
    </StyledDeliveryStack>
  );
};
