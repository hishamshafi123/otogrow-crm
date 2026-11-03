import { Trans, useLingui } from '@lingui/react/macro';
import { type VideoQaPreview } from '@/delivery/creative/video-qa/video-qa.types';
import { formatCreativeReviewTime } from '@/delivery/creative/review/creative-review-navigation';
import {
  StyledVideoQaFacts,
  StyledVideoQaText,
} from '@/delivery/creative/video-qa/videoQaStyles';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';
export const VideoQaCoverage = ({
  input,
  historical = false,
}: {
  input: VideoQaPreview;
  historical?: boolean;
}) => {
  const { t } = useLingui();
  const preparation = input.preparation;
  return (
    <StyledDeliveryStack>
      <StyledVideoQaFacts>
        <div>
          <dt>
            <Trans>Inspected video</Trans>
          </dt>
          <dd>{input.asset.name}</dd>
        </div>
        <div>
          <dt>
            <Trans>Approved brief</Trans>
          </dt>
          <dd>{t`Version ${input.briefVersion}`}</dd>
        </div>
        <div>
          <dt>
            <Trans>Duration and dimensions</Trans>
          </dt>
          <dd>
            {formatCreativeReviewTime(preparation.durationMs)} ·{' '}
            {preparation.width} × {preparation.height}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Audio stream</Trans>
          </dt>
          <dd>
            {preparation.hasAudio
              ? t`Audio included (${preparation.audioChannels ?? t`Unknown`} channels)`
              : t`No audio track was found`}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Timestamped evidence frames</Trans>
          </dt>
          <dd>{t`${preparation.frames.length} frames; sampling interval ${preparation.samplingIntervalMs / 1000} seconds`}</dd>
        </div>
        <div>
          <dt>
            <Trans>Model</Trans>
          </dt>
          <dd>
            <Trans>Google Gemini 3.5 Flash Lite</Trans>
          </dd>
        </div>
      </StyledVideoQaFacts>
      {!historical && (
        <p>
          <Trans>
            Preparation checks the complete supported clip locally. The model
            receives the normalized video and selected approved evidence. Human
            review remains responsible for quality and final approval.
          </Trans>
        </p>
      )}
      <details>
        <summary>
          <Trans>Reviewed brief and reference evidence</Trans>
        </summary>
        <StyledDeliveryStack>
          <p>{t`Objective: ${input.brief.objective}`}</p>
          <p>{t`Product facts: ${input.brief.productFacts}`}</p>
          <p>{t`Required claims: ${input.brief.mandatoryClaims}`}</p>
          <p>{t`Hook: ${input.brief.hook}`}</p>
          <p>{t`Call to action: ${input.brief.cta}`}</p>
          <p>{t`Music: ${input.brief.music}`}</p>
          {input.references.length ? (
            input.references.map((asset) => (
              <p key={asset.id}>
                {asset.name} · {t`Brief version ${asset.briefVersion}`}
              </p>
            ))
          ) : (
            <p>
              <Trans>
                No approved product reference images were selected.
                Product-fidelity conclusions are limited.
              </Trans>
            </p>
          )}
          {input.manualTranscript && (
            <>
              <h4>
                <Trans>Supplemental manual transcript — unverified</Trans>
              </h4>
              <StyledVideoQaText>{input.manualTranscript}</StyledVideoQaText>
              <p>
                <Trans>
                  This text is supplied by a person. It does not confirm what
                  the audio contains.
                </Trans>
              </p>
            </>
          )}
        </StyledDeliveryStack>
      </details>
      <details>
        <summary>
          <Trans>Coverage limits</Trans>
        </summary>
        <ul>
          {preparation.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </details>
      {!historical && (
        <p>
          {input.maximumCostUsd === null || input.maximumCostUsd === undefined
            ? t`A verified maximum reservation is unavailable. An administrator must check video-inspection pricing and spending limits.`
            : t`Maximum reservation: USD ${input.maximumCostUsd}. Starting requires this hold; the final recorded charge can differ.`}
        </p>
      )}
    </StyledDeliveryStack>
  );
};
