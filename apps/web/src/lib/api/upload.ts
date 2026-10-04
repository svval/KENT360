import { type ApiError, type ApiSuccess } from '@kent360/shared-types';
import { ApiRequestError } from '../api-client';
import { appConfig } from '../config';
import { getAccessToken, refreshSession } from '../session';

/**
 * Uploads one file as multipart/form-data with progress reporting (fetch cannot report
 * upload progress). Extra form fields go before the file. Renews an expired access token
 * once, like apiFetch.
 */
export function uploadFile<T>(
  path: string,
  file: File,
  fields: Record<string, string>,
  onProgress: (percent: number) => void,
  retried = false,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${appConfig.apiUrl}${path}`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new ApiRequestError(0, 'NETWORK_ERROR', 'Sunucuya ulaşılamıyor.'));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((body as ApiSuccess<T>).data);
        return;
      }
      if (xhr.status === 401 && token && !retried) {
        void refreshSession().then((session) =>
          session
            ? uploadFile<T>(path, file, fields, onProgress, true).then(resolve, reject)
            : reject(new ApiRequestError(401, 'UNAUTHORIZED', 'Oturumunuzun süresi doldu.')),
        );
        return;
      }
      const error = body as ApiError | null;
      reject(
        new ApiRequestError(
          xhr.status,
          error?.code ?? 'HTTP_ERROR',
          error?.message ?? 'Fotoğraf yüklenemedi.',
          error?.details ?? null,
        ),
      );
    };
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append('files', file);
    xhr.send(form);
  });
}
