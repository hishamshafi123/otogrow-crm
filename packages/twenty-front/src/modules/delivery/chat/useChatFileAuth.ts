import { useEffect, useState } from 'react';
import { useStore } from 'jotai';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { type DeliveryChatAttachment } from '@/delivery/chat/deliveryChatTypes';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

export const CHAT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const CHAT_MAX_ATTACHMENTS = 5;

export const buildChatAuthHeaders = (
  store: ReturnType<typeof useStore>,
): Record<string, string> | undefined => {
  const token = store.get(tokenPairState.atom)?.accessOrWorkspaceAgnosticToken
    ?.token;
  if (!store.get(isCookieAuthActiveState.atom) && token) {
    return { Authorization: `Bearer ${token}` };
  }
  return undefined;
};

export const buildChatFileUrl = (attachmentId: string, inline = false) =>
  `${REACT_APP_SERVER_BASE_URL}/portal/delivery-chat-files/${encodeURIComponent(attachmentId)}${inline ? '?inline=true' : ''}`;

export const uploadChatFile = async ({
  store,
  recipientId,
  file,
  kind = 'AUTO',
  durationMs,
  waveform,
}: {
  store: ReturnType<typeof useStore>;
  recipientId: string;
  file: File | Blob;
  kind?: 'AUTO' | 'VOICE';
  durationMs?: number;
  waveform?: number[];
}): Promise<{
  status: number;
  attachment?: DeliveryChatAttachment;
  error?: string;
}> => {
  const headers = buildChatAuthHeaders(store);
  const body = new FormData();
  body.append('recipientId', recipientId);
  body.append('kind', kind);
  if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
    body.append('durationMs', String(Math.round(durationMs)));
  }
  if (waveform && waveform.length >= 4) {
    body.append('waveform', JSON.stringify(waveform));
  }
  const filename =
    file instanceof File
      ? file.name
      : kind === 'VOICE'
        ? `voice-note-${Date.now()}.webm`
        : `attachment-${Date.now()}`;
  body.append('file', file, filename);

  const response = await fetch(
    `${REACT_APP_SERVER_BASE_URL}/portal/delivery-chat-files/upload`,
    {
      method: 'POST',
      body,
      headers,
      credentials: 'include',
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message[0]
      : payload?.message;
    return {
      status: response.status,
      error: message ?? 'Could not upload file.',
    };
  }
  const attachment = (await response.json()) as DeliveryChatAttachment;
  return { status: response.status, attachment };
};

export const downloadChatFileToDisk = async ({
  store,
  attachmentId,
  filename,
}: {
  store: ReturnType<typeof useStore>;
  attachmentId: string;
  filename: string;
}): Promise<{ ok: boolean; unauthorized?: boolean }> => {
  const headers = buildChatAuthHeaders(store);
  const response = await fetch(buildChatFileUrl(attachmentId, false), {
    method: 'GET',
    headers,
    credentials: 'include',
  });
  if (response.status === 401 || response.status === 403) {
    return { ok: false, unauthorized: true };
  }
  if (!response.ok) return { ok: false };
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  return { ok: true };
};

export const useChatAuthenticatedBlobUrl = (
  attachmentId: string | null,
  enabled: boolean,
): { url: string | null; loading: boolean; error: boolean } => {
  const store = useStore();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || !attachmentId) {
      setUrl(null);
      setLoading(false);
      setError(false);
      return;
    }
    let active = true;
    let createdUrl: string | null = null;
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    const headers = buildChatAuthHeaders(store);
    fetch(buildChatFileUrl(attachmentId, true), {
      method: 'GET',
      headers,
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
        setLoading(false);
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [attachmentId, enabled, store]);

  return { url, loading, error };
};
