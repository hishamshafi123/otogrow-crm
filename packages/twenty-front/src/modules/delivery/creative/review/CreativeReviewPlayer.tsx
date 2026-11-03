import { useCallback, useEffect, useRef, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { type CreativeAsset } from '@/delivery/delivery-creative.types';
import { StyledReviewPlayer } from '@/delivery/creative/review/creativeReviewStyles';
import { formatCreativeReviewTime } from '@/delivery/creative/review/creative-review-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const MAX_ASSET_BYTES = 100 * 1024 * 1024;
type CreativeReviewPlayerProps = {
  taskId: string;
  asset: Pick<CreativeAsset, 'id' | 'name' | 'mimeType' | 'size'>;
  label: string;
  seek?: { seconds: number; requestId: number };
  onTime?: (seconds: number) => void;
};
export const CreativeReviewPlayer = ({
  taskId,
  asset,
  label,
  seek,
  onTime,
}: CreativeReviewPlayerProps) => {
  const { t } = useLingui();
  const store = useStore();
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [seekNotice, setSeekNotice] = useState('');
  // oxlint-disable-next-line twenty/no-state-useref -- Abort pending bytes before an old target can publish a local URL.
  const controller = useRef<AbortController | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Native playback position belongs to the media element.
  const media = useRef<HTMLMediaElement | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const applySeek = useCallback(
    (element: HTMLMediaElement | null) => {
      if (!seek) {
        setSeekNotice('');
        return;
      }
      if (!Number.isFinite(seek.seconds) || seek.seconds < 0) {
        setSeekNotice(
          t`This saved time is invalid. The feedback is unchanged; inspect the original source.`,
        );
        return;
      }
      if (
        !element ||
        element.readyState < 1 ||
        !Number.isFinite(element.duration)
      ) {
        setSeekNotice(
          t`Playback metadata is not ready. Load the asset; the requested time will be checked when its duration is available.`,
        );
        return;
      }
      if (seek.seconds > element.duration) {
        setSeekNotice(
          t`Saved time ${formatCreativeReviewTime(Math.round(seek.seconds * 1000))} exceeds this file's loaded duration ${formatCreativeReviewTime(Math.round(element.duration * 1000))}. The saved feedback is unchanged.`,
        );
        return;
      }
      try {
        element.currentTime = seek.seconds;
        setSeekNotice('');
      } catch {
        setSeekNotice(
          t`This browser could not seek to the saved time. Keep the feedback unchanged and inspect or download the original.`,
        );
      }
    },
    [seek, t],
  );
  useEffect(() => applySeek(media.current), [applySeek]);
  const load = async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    try {
      if (
        asset.size <= 0 ||
        asset.size > MAX_ASSET_BYTES ||
        !/^(image|video|audio)\//.test(asset.mimeType)
      )
        throw new Error(
          t`This asset cannot be previewed. Review its source or download it from Media review.`,
        );
      const token = store.get(tokenPairState.atom)
        ?.accessOrWorkspaceAgnosticToken?.token;
      const headers =
        !store.get(isCookieAuthActiveState.atom) && token
          ? { Authorization: `Bearer ${token}` }
          : undefined;
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/delivery-creative/${taskId}/assets/${asset.id}`,
        { headers, credentials: 'include', signal: request.signal },
      );
      if (!response.ok)
        throw new Error(
          t`This asset is unavailable or your access changed. Refresh review access before retrying.`,
        );
      const mimeType = response.headers.get('Content-Type')?.split(';')[0];
      if (mimeType && mimeType !== asset.mimeType)
        throw new Error(
          t`The returned file type does not match this asset. Refresh the review.`,
        );
      const declaredSize = response.headers.get('Content-Length');
      if (
        declaredSize &&
        (!Number.isFinite(Number(declaredSize)) ||
          Number(declaredSize) > MAX_ASSET_BYTES)
      )
        throw new Error(t`The asset exceeds the preview size limit.`);
      const reader = response.body?.getReader();
      let blob: Blob;
      if (reader) {
        const parts: Uint8Array<ArrayBuffer>[] = [];
        let size = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_ASSET_BYTES || size > asset.size) {
            await reader.cancel();
            throw new Error(
              t`The asset size changed or exceeds the preview limit. Refresh the review.`,
            );
          }
          parts.push(new Uint8Array(chunk.value));
        }
        blob = new Blob(parts, { type: asset.mimeType });
      } else blob = await response.blob();
      if (!blob.size || blob.size > MAX_ASSET_BYTES || blob.size !== asset.size)
        throw new Error(
          t`The asset could not be loaded completely. Retry or refresh the review.`,
        );
      if (request.signal.aborted) return;
      setUrl(URL.createObjectURL(blob));
    } catch (failure) {
      if (!request.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : t`The asset could not load.`,
        );
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  };
  return (
    <StyledReviewPlayer aria-label={label}>
      <StyledDeliveryStack>
        <strong>
          {label} · {asset.name}
        </strong>
        {!url && (
          <small>
            <Trans>
              Download before playback; maximum 100 MB. No autoplay.
            </Trans>
          </small>
        )}
        {error && <p role="alert">{error}</p>}
        {seekNotice && <p role="status">{seekNotice}</p>}
        {loading ? (
          <>
            <p role="status">
              <Trans>Loading selected asset…</Trans>
            </p>
            <StyledDeliveryButton
              onClick={() => {
                controller.current?.abort();
                setLoading(false);
              }}
            >
              <Trans>Cancel asset load</Trans>
            </StyledDeliveryButton>
          </>
        ) : !url ? (
          <StyledDeliveryButton onClick={() => void load()}>
            {error ? t`Retry ${label}` : t`Load ${label}`}
          </StyledDeliveryButton>
        ) : null}
        {url && (
          <>
            {asset.mimeType.startsWith('image/') ? (
              <img
                src={url}
                alt={asset.name}
                onError={() =>
                  setError(
                    t`This browser cannot display the file. Download the original to inspect it.`,
                  )
                }
              />
            ) : asset.mimeType.startsWith('video/') ? (
              <video
                ref={(element) => {
                  media.current = element;
                }}
                src={url}
                controls
                preload="metadata"
                onLoadedMetadata={(event) => applySeek(event.currentTarget)}
                onDurationChange={(event) => applySeek(event.currentTarget)}
                onTimeUpdate={(event) =>
                  onTime?.(event.currentTarget.currentTime)
                }
                onError={() =>
                  setError(
                    t`This browser cannot play the file. Download the original to inspect it.`,
                  )
                }
              />
            ) : (
              <audio
                ref={(element) => {
                  media.current = element;
                }}
                src={url}
                controls
                preload="metadata"
                onLoadedMetadata={(event) => applySeek(event.currentTarget)}
                onDurationChange={(event) => applySeek(event.currentTarget)}
                onTimeUpdate={(event) =>
                  onTime?.(event.currentTarget.currentTime)
                }
                onError={() =>
                  setError(
                    t`This browser cannot play the file. Download the original to inspect it.`,
                  )
                }
              />
            )}
            <StyledDeliveryRow>
              <a href={url} download={asset.name}>
                <Trans>Download original</Trans>
              </a>
              <StyledDeliveryButton
                onClick={() => {
                  setUrl('');
                  setError('');
                  setSeekNotice('');
                }}
              >
                <Trans>Unload asset</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          </>
        )}
      </StyledDeliveryStack>
    </StyledReviewPlayer>
  );
};
