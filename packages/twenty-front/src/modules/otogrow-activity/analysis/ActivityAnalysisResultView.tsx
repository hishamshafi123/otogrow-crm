import { Trans, useLingui } from '@lingui/react/macro';
import {
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type ActivityAnalysisDetail,
  type ActivityAnalysisCitationTarget,
} from '@/otogrow-activity/analysis/activity-analysis.types';
import { ActivityAnalysisCitation } from '@/otogrow-activity/analysis/ActivityAnalysisCitation';

export const ActivityAnalysisResultView = ({
  detail,
  onCitation,
}: {
  detail: ActivityAnalysisDetail;
  onCitation: (target: ActivityAnalysisCitationTarget) => void;
}) => {
  const { t } = useLingui();
  const result = detail.result;
  if (!result)
    return (
      <p>
        <Trans>No validated answer is available for this run.</Trans>
      </p>
    );
  const citations = (referenceIds: string[]) => (
    <StyledDeliveryRow>
      {referenceIds.map((id) => (
        <ActivityAnalysisCitation
          key={id}
          context={detail.context}
          referenceId={id}
          onCitation={onCitation}
        />
      ))}
    </StyledDeliveryRow>
  );
  return (
    <StyledDeliveryStack>
      <h3>
        <Trans>Answer from recorded evidence</Trans>
      </h3>
      <p>
        <Trans>
          AI interpretation requires review. It describes a saved evidence
          snapshot, not a live measure of someone’s performance.
        </Trans>
      </p>
      {detail.context.currentWork && (
        <p>
          <Trans>
            Task and reviewer facts describe their saved capture time. Open a
            task citation for a fresh source check; that check does not rewrite
            this answer.
          </Trans>
        </p>
      )}
      <p>{result.summary}</p>
      {citations(result.summaryCitationIds)}
      {result.findings.map((finding) => (
        <article key={finding.id}>
          <h4>
            {finding.kind === 'POSSIBLE_BOTTLENECK'
              ? t`Possible handoff issue · verify current work`
              : finding.kind === 'CURRENT_STATE'
                ? t`Current work finding`
                : t`Recorded finding`}
          </h4>
          <p>{finding.text}</p>
          {citations(finding.citationIds)}
        </article>
      ))}
      <h4>
        <Trans>What this cannot establish</Trans>
      </h4>
      {result.unknowns.length ? (
        <ul>
          {result.unknowns.map((unknown) => (
            <li key={unknown}>{unknown}</li>
          ))}
        </ul>
      ) : (
        <p>
          {detail.context.currentWork
            ? t`Changes after capture, unrecorded work and facts outside this scope remain unknown.`
            : t`Current task status, unrecorded work and activity outside this scope remain unknown.`}
        </p>
      )}
      {result.limitations.length > 0 && (
        <details>
          <summary tabIndex={0}>
            <Trans>Evidence limits and interpretation notes</Trans>
          </summary>
          <ul>
            {result.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </details>
      )}
    </StyledDeliveryStack>
  );
};
