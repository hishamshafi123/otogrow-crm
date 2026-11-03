import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useStore } from 'jotai';
import { Trans, useLingui } from '@lingui/react/macro';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { formatCreativeReviewTime } from '@/delivery/creative/review/creative-review-navigation';
import { StyledVideoQaMedia } from '@/delivery/creative/video-qa/videoQaStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type VideoQaEvidenceMediaProps = {
  taskId: string;
  runId: string;
  type: 'VIDEO' | 'FRAME';
  size: number;
  frameIndex?: number;
  label: string;
  enabled: boolean;
  onDenied: () => void;
  seek?: { atMs: number; generation: number };
};
export const VideoQaEvidenceMedia = ({
  taskId,
  runId,
  type,
  size,
  frameIndex,
  label,
  enabled,
  onDenied,
  seek,
}: VideoQaEvidenceMediaProps) => {
  const { t } = useLingui();
  const store = useStore();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seekNotice, setSeekNotice] = useState('');
  // oxlint-disable-next-line twenty/no-state-useref -- Private media bytes and local URLs must not outlive their exact authorized source.
  const lifetime = useRef({
    epoch: 0,
    request: null as AbortController | null,
    url: '',
  });
  // oxlint-disable-next-line twenty/no-state-useref -- Playback position belongs to the native video element.
  const media = useRef<HTMLVideoElement | null>(null);
  useLayoutEffect(() => {
    const boundary = lifetime.current;
    boundary.epoch++;
    return () => {
      boundary.epoch++;
      boundary.request?.abort();
      if (boundary.url) URL.revokeObjectURL(boundary.url);
      boundary.url = '';
    };
  }, [taskId, runId, type, frameIndex]);
  const applySeek = useCallback(() => {
    if (!seek) return;
    const element = media.current;
    if (
      !element ||
      element.readyState < 1 ||
      !Number.isFinite(element.duration)
    ) {
      setSeekNotice(t`Load the inspected video to check this time.`);
      return;
    }
    if (seek.atMs < 0 || seek.atMs / 1000 > element.duration) {
      setSeekNotice(
        t`This time is outside the loaded video. Inspect the recorded evidence without changing its timestamps.`,
      );
      return;
    }
    element.currentTime = seek.atMs / 1000;
    setSeekNotice('');
  }, [seek, t]);
  useEffect(applySeek, [applySeek]);
  useLayoutEffect(() => {
    if (!enabled) media.current?.pause();
  }, [enabled]);
  const load = async () => {
    if (!enabled || busy) return;
    const maximum = type === 'VIDEO' ? 11000000 : 150000;
    if (
      size <= 0 ||
      size > maximum ||
      (type === 'FRAME' &&
        (!Number.isInteger(frameIndex) || (frameIndex ?? -1) < 0))
    ) {
      setError(t`This evidence exceeds the supported preview limits.`);
      return;
    }
    lifetime.current.request?.abort();
    const request = new AbortController();
    lifetime.current.request = request;
    const epoch = lifetime.current.epoch;
    setBusy(true);
    setError('');
    try {
      const token = store.get(tokenPairState.atom)
        ?.accessOrWorkspaceAgnosticToken?.token;
      const headers =
        !store.get(isCookieAuthActiveState.atom) && token
          ? { Authorization: `Bearer ${token}` }
          : undefined;
      const filename =
        type === 'VIDEO' ? 'proxy.mp4' : `frame-${frameIndex}.jpg`;
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/delivery-creative/${taskId}/video-qa/${runId}/${filename}`,
        {
          headers,
          credentials: 'include',
          cache: 'no-store',
          signal: request.signal,
        },
      );
      if ([401, 403].includes(response.status)) {
        onDenied();
        throw new Error(t`Current evidence access was denied.`);
      }
      if (!response.ok)
        throw new Error(
          t`The saved evidence is unavailable. Refresh the inspection before retrying.`,
        );
      const mimeType = type === 'VIDEO' ? 'video/mp4' : 'image/jpeg';
      if (response.headers.get('Content-Type')?.split(';')[0] !== mimeType)
        throw new Error(t`The returned evidence format is unexpected.`);
      const reader = response.body?.getReader();
      let blob: Blob;
      if (reader) {
        const parts: Uint8Array<ArrayBuffer>[] = [];
        let bytes = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > size || bytes > maximum) {
            await reader.cancel();
            throw new Error(
              t`The saved evidence size changed. Refresh the inspection.`,
            );
          }
          parts.push(new Uint8Array(chunk.value));
        }
        blob = new Blob(parts, { type: mimeType });
      } else blob = await response.blob();
      if (request.signal.aborted || epoch !== lifetime.current.epoch) return;
      if (blob.size !== size)
        throw new Error(
          t`The evidence could not be loaded completely. Refresh the inspection.`,
        );
      if (lifetime.current.url) URL.revokeObjectURL(lifetime.current.url);
      const objectUrl = URL.createObjectURL(blob);
      lifetime.current.url = objectUrl;
      setUrl(objectUrl);
    } catch (caught) {
      if (!request.signal.aborted && epoch === lifetime.current.epoch)
        setError(
          caught instanceof Error
            ? caught.message
            : t`Evidence could not be loaded.`,
        );
    } finally {
      if (!request.signal.aborted && epoch === lifetime.current.epoch)
        setBusy(false);
    }
  };
  return (
    <StyledVideoQaMedia>
      <StyledDeliveryStack>
        <strong>{label}</strong>
        {error && <p role="alert">{error}</p>}
        {!url && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || busy}
            onClick={() => void load()}
          >
            {busy
              ? t`Loading private evidence…`
              : type === 'VIDEO'
                ? t`Load inspected video`
                : t`Load evidence frame`}
          </StyledDeliveryButton>
        )}
        {url &&
          (type === 'VIDEO' ? (
            <video
              ref={media}
              src={url}
              controls
              preload="metadata"
              onLoadedMetadata={applySeek}
              aria-label={label}
            />
          ) : (
            <img src={url} alt={label} />
          ))}
        {seek && (
          <p>{t`Selected time: ${formatCreativeReviewTime(seek.atMs)}`}</p>
        )}
        {seekNotice && <p role="status">{seekNotice}</p>}
        <small>
          <Trans>
            Private saved evidence. Loading does not approve the video.
          </Trans>
        </small>
      </StyledDeliveryStack>
    </StyledVideoQaMedia>
  );
};
