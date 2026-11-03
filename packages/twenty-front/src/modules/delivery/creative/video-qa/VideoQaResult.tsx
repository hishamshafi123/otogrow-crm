import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type VideoQaRun } from '@/delivery/creative/video-qa/video-qa.types';
import { VideoQaCoverage } from '@/delivery/creative/video-qa/VideoQaCoverage';
import { VideoQaEvidenceMedia } from '@/delivery/creative/video-qa/VideoQaEvidenceMedia';
import { formatCreativeReviewTime } from '@/delivery/creative/review/creative-review-navigation';
import { StyledVideoQaText } from '@/delivery/creative/video-qa/videoQaStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
export const VideoQaResult = ({
  run,
  enabled,
  onDenied,
}: {
  run: VideoQaRun;
  enabled: boolean;
  onDenied: () => void;
}) => {
  const { t } = useLingui();
  const [seek, setSeek] = useState<{ atMs: number; generation: number }>();
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const frame = run.input.preparation.frames.find(
    (item) => item.index === frameIndex,
  );
  const jump = (atMs: number) =>
    setSeek((previous) => ({
      atMs,
      generation: (previous?.generation ?? 0) + 1,
    }));
  const categories: Record<string, string> = {
    VISUAL: t`Visual detail`,
    CONTINUITY: t`Continuity`,
    PRODUCT: t`Product fidelity`,
    TEXT: t`Visible text`,
    AUDIO: t`Audio`,
    COPY: t`Copy and claims`,
  };
  const technical: Record<string, string> = {
    BLACK_INTERVAL: t`Dark interval`,
    FROZEN_INTERVAL: t`Possible frozen interval`,
    SILENT_INTERVAL: t`Silent interval`,
    NO_AUDIO: t`No audio track`,
    PEAK_LEVEL: t`Audio peak level`,
  };
  return (
    <StyledDeliveryStack>
      <VideoQaCoverage input={run.input} historical />
      {!run.sourceCurrent && (
        <p role="status">
          <Trans>
            Production changed after this inspection. These are saved historical
            findings; inspect the current video before relying on them.
          </Trans>
        </p>
      )}
      <VideoQaEvidenceMedia
        key={`${run.runId}:video`}
        taskId={run.taskId}
        runId={run.runId}
        type="VIDEO"
        size={run.input.preparation.proxyBytes}
        label={t`Inspected video evidence`}
        seek={seek}
        enabled={enabled}
        onDenied={onDenied}
      />
      <section>
        <h4>
          <Trans>Technical observations</Trans>
        </h4>
        {run.input.preparation.technicalFindings.length === 0 && (
          <p>
            <Trans>
              No technical observations were recorded. Human review is still
              required.
            </Trans>
          </p>
        )}
        {run.input.preparation.technicalFindings.map((finding, index) => (
          <div key={`${finding.code}:${finding.startMs}:${index}`}>
            <StyledDeliveryButton
              type="button"
              onClick={() => jump(finding.startMs)}
            >
              {technical[finding.code] ?? t`Technical observation`} ·{' '}
              {formatCreativeReviewTime(finding.startMs)} –{' '}
              {formatCreativeReviewTime(finding.endMs)}
            </StyledDeliveryButton>
            <StyledVideoQaText>{finding.evidence}</StyledVideoQaText>
          </div>
        ))}
      </section>
      {run.result ? (
        <>
          <section>
            <h4>
              <Trans>Model findings for human review</Trans>
            </h4>
            <StyledVideoQaText>{run.result.summary}</StyledVideoQaText>
            {run.result.findings.length === 0 && (
              <p>
                <Trans>
                  The model returned no issues. Independent human final review
                  remains required.
                </Trans>
              </p>
            )}
            {run.result.findings.map((finding, index) => (
              <section
                key={`${finding.category}:${finding.startMs}:${index}`}
                aria-label={t`Finding ${index + 1}`}
              >
                <StyledDeliveryStack>
                  <h5>{categories[finding.category] ?? t`Review finding`}</h5>
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => jump(finding.startMs)}
                  >
                    {formatCreativeReviewTime(finding.startMs)} –{' '}
                    {formatCreativeReviewTime(finding.endMs)}
                  </StyledDeliveryButton>
                  <StyledVideoQaText>{finding.evidence}</StyledVideoQaText>
                  {finding.correction && (
                    <StyledVideoQaText>{t`Suggested correction: ${finding.correction}`}</StyledVideoQaText>
                  )}
                  <StyledVideoQaText>{t`Uncertainty: ${finding.uncertainty}`}</StyledVideoQaText>
                  <StyledDeliveryRow>
                    {finding.frameIndexes.map((index) => (
                      <StyledDeliveryButton
                        key={index}
                        type="button"
                        onClick={() => setFrameIndex(index)}
                      >{t`Inspect frame ${index + 1}`}</StyledDeliveryButton>
                    ))}
                  </StyledDeliveryRow>
                  {finding.referenceAssetIds.map((id) => (
                    <p
                      key={id}
                    >{t`Reference: ${run.input.references.find((asset) => asset.id === id)?.name ?? t`Saved approved reference`}`}</p>
                  ))}
                </StyledDeliveryStack>
              </section>
            ))}
          </section>
          <details>
            <summary>
              <Trans>Model-observed audio transcript</Trans>
            </summary>
            {run.result.transcript.length === 0 ? (
              <p>
                <Trans>
                  No transcript was returned. This does not establish that all
                  speech was understood.
                </Trans>
              </p>
            ) : (
              run.result.transcript.map((segment, index) => (
                <div key={`${segment.startMs}:${index}`}>
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => jump(segment.startMs)}
                  >
                    {formatCreativeReviewTime(segment.startMs)} –{' '}
                    {formatCreativeReviewTime(segment.endMs)}
                  </StyledDeliveryButton>
                  <StyledVideoQaText>{segment.text}</StyledVideoQaText>
                </div>
              ))
            )}
          </details>
          <details>
            <summary>
              <Trans>Model-observed visible text</Trans>
            </summary>
            {run.result.visibleText.map((segment, index) => (
              <div key={`${segment.startMs}:${index}`}>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => jump(segment.startMs)}
                >
                  {formatCreativeReviewTime(segment.startMs)} –{' '}
                  {formatCreativeReviewTime(segment.endMs)}
                </StyledDeliveryButton>
                <StyledVideoQaText>{segment.text}</StyledVideoQaText>
              </div>
            ))}
          </details>
          <details>
            <summary>
              <Trans>Model limitations and interpretation notes</Trans>
            </summary>
            <StyledVideoQaText>{run.result.limitations}</StyledVideoQaText>
          </details>
        </>
      ) : (
        <p>
          <Trans>
            No model result is available yet. Technical observations and saved
            source coverage remain separate from a completed model inspection.
          </Trans>
        </p>
      )}
      {frame && (
        <VideoQaEvidenceMedia
          key={`${run.runId}:${frame.index}`}
          taskId={run.taskId}
          runId={run.runId}
          type="FRAME"
          frameIndex={frame.index}
          size={frame.size}
          label={t`Evidence frame at ${formatCreativeReviewTime(frame.atMs)}`}
          enabled={enabled}
          onDenied={onDenied}
        />
      )}
    </StyledDeliveryStack>
  );
};
