import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'jotai';
import { Trans, useLingui } from '@lingui/react/macro';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { readKnowledgeFileBytes } from '@/delivery/knowledge/assets/knowledge-file-bytes';
import { type KnowledgeAssetSelection } from '@/delivery/knowledge/assets/knowledge-assets.types';
import { StyledKnowledgeAsset } from '@/delivery/knowledge/assets/knowledgeAssetStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type KnowledgeAssetFileProps = {
  sourceId: string;
  selection: KnowledgeAssetSelection;
  scope: string;
  enabled: boolean;
  onAuthorityLost: () => void;
};
export const KnowledgeAssetFile = ({
  sourceId,
  selection,
  scope,
  enabled,
  onAuthorityLost,
}: KnowledgeAssetFileProps) => {
  const { t } = useLingui();
  const store = useStore();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { asset, version } = selection;
  // oxlint-disable-next-line twenty/no-state-useref -- A private byte response cannot survive scope loss or a different immutable file selection.
  const operation = useRef<{ controller: AbortController | null; url: string }>(
    { controller: null, url: '' },
  );
  const clear = useCallback(() => {
    operation.current.controller?.abort();
    if (operation.current.url) URL.revokeObjectURL(operation.current.url);
    operation.current = { controller: null, url: '' };
    setUrl('');
    setBusy(false);
  }, []);
  useLayoutEffect(() => {
    clear();
    setError('');
    return () => {
      operation.current.controller?.abort();
      if (operation.current.url) URL.revokeObjectURL(operation.current.url);
      operation.current = { controller: null, url: '' };
    };
  }, [enabled, scope, sourceId, asset.id, asset.sha256, version, clear]);
  const load = async () => {
    if (!enabled || busy) return;
    clear();
    const controller = new AbortController();
    operation.current.controller = controller;
    setBusy(true);
    setError('');
    try {
      const token = store.get(tokenPairState.atom)
        ?.accessOrWorkspaceAgnosticToken?.token;
      const headers =
        !store.get(isCookieAuthActiveState.atom) && token
          ? { Authorization: `Bearer ${token}` }
          : undefined;
      const path =
        version === null
          ? `upload/${asset.id}`
          : `${sourceId}/${version}/${asset.id}`;
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/portal/delivery-knowledge-files/${path}`,
        {
          headers,
          credentials: 'include',
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        clear();
        onAuthorityLost();
        return;
      }
      if (!response.ok) throw new Error('Unavailable');
      const blob = await readKnowledgeFileBytes(response, asset);
      if (
        controller.signal.aborted ||
        operation.current.controller !== controller
      )
        return;
      const objectUrl = URL.createObjectURL(blob);
      operation.current.url = objectUrl;
      setUrl(objectUrl);
    } catch {
      if (!controller.signal.aborted)
        setError(
          t`This exact file could not be verified. It may be unavailable or access may have changed. Check current source access before retrying.`,
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <StyledKnowledgeAsset aria-label={asset.name}>
      <StyledDeliveryStack>
        <strong>{asset.name}</strong>
        <small>
          {asset.mimeType} · {t`${Math.ceil(asset.size / 1024)} KB`} ·{' '}
          {version === null
            ? t`Uploaded privately`
            : t`Knowledge version ${version}`}
        </small>
        {error && <p role="alert">{error}</p>}
        <StyledDeliveryRow>
          {!url && (
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || busy}
              onClick={() => void load()}
            >
              {busy ? t`Loading file…` : t`Load ${asset.name}`}
            </StyledDeliveryButton>
          )}
          {busy && (
            <StyledDeliveryButton type="button" onClick={clear}>
              <Trans>Cancel file load</Trans>
            </StyledDeliveryButton>
          )}
          {enabled && url && (
            <>
              <a
                href={url}
                download={asset.name}
              >{t`Download ${asset.name}`}</a>
              <StyledDeliveryButton type="button" onClick={clear}>
                <Trans>Close file</Trans>
              </StyledDeliveryButton>
            </>
          )}
        </StyledDeliveryRow>
        {enabled && url && asset.mimeType.startsWith('image/') && (
          <img
            src={url}
            alt={asset.name}
            onError={() =>
              setError(
                t`Image preview is unavailable. Download this exact file to inspect it.`,
              )
            }
          />
        )}
      </StyledDeliveryStack>
    </StyledKnowledgeAsset>
  );
};
