import { type createStore } from 'jotai';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

type JotaiStore = ReturnType<typeof createStore>;

export const uploadStudioMultipart = <T = unknown>(params: {
  store: JotaiStore;
  endpointPath: string;
  formData: FormData;
  onProgress?: (percent: number) => void;
}): Promise<T> =>
  new Promise((resolve, reject) => {
    const base = (REACT_APP_SERVER_BASE_URL || '').replace(/\/+$/, '');
    const url = `${base}${params.endpointPath.startsWith('/') ? '' : '/'}${params.endpointPath}`;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    xhr.withCredentials = true;
    const cookieAuth = params.store.get(isCookieAuthActiveState.atom);
    if (!cookieAuth) {
      const token = params.store.get(tokenPairState.atom)
        ?.accessOrWorkspaceAgnosticToken?.token;
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !params.onProgress) return;
      params.onProgress(
        Math.min(100, Math.round((event.loaded / event.total) * 100)),
      );
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          resolve(undefined as T);
        }
        return;
      }
      let message = `Upload failed (${xhr.status})`;
      try {
        const parsed = JSON.parse(xhr.responseText) as {
          message?: string | string[];
        };
        if (Array.isArray(parsed.message)) {
          message = parsed.message[0] || message;
        } else if (typeof parsed.message === 'string') {
          message = parsed.message;
        }
      } catch {
        // Use fallback error message
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error('Network error while uploading file.'));
    xhr.send(params.formData);
  });
