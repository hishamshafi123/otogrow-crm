import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { FileTypeParser } from 'file-type';
import { createSsrfSafeAgent } from 'src/engine/core-modules/secure-http-client/utils/create-ssrf-safe-agent.util';
import {
  getStudioModelSpec,
  type StudioModelSpec,
} from 'src/modules/delivery/studio/delivery-studio-catalog';
import { type StudioProviderAttemptRecord } from 'src/modules/delivery/studio/entities/delivery-studio-job.entity';
import { type StudioRoutingMode } from 'src/modules/delivery/studio/entities/delivery-studio-provider-config.entity';

const WAVESPEED_API_BASE = 'https://api.wavespeed.ai/api/v3';
const KIE_API_BASE = 'https://api.kie.ai/api/v1';
const KIE_UPLOAD_BASE = 'https://kieai.redpandaai.co';

const WAVESPEED_STAGE_TTL_MS = 6 * 24 * 60 * 60 * 1000; // 6d (provider keeps 7d)
const KIE_STAGE_TTL_MS = 20 * 60 * 60 * 1000; // 20h (provider keeps 24h)
const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024; // 250 MB

export type StudioProviderId = 'wavespeed' | 'kie';

export type StudioProviderCredentials = {
  wavespeedApiKey: string | null;
  wavespeedEnabled: boolean;
  kieApiKey: string | null;
  kieEnabled: boolean;
};

export type StudioStageableMediaFile = {
  sha256: string;
  fileName: string;
  mimeType: string;
  kind: 'IMAGE' | 'VIDEO';
  readBytes: () => Promise<Buffer>;
  cachedWavespeedUrl?: string | null;
  cachedKieUrl?: string | null;
  onStagedUrl?: (
    provider: StudioProviderId,
    url: string,
    expiresAtIso: string,
  ) => Promise<void>;
};

export type StudioPreparedRequestSnapshot = {
  provider: StudioProviderId;
  endpoint: string;
  requestPayload: Record<string, unknown>;
  stagedImageUrls: string[];
  stagedVideoUrls: string[];
};

export type StudioNormalizedGenerationRequest = {
  modelKey: string;
  prompt: string;
  routingMode: StudioRoutingMode;
  aspectRatio?: string;
  resolution?: string;
  quality?: 'low' | 'medium' | 'high' | 'max';
  durationSec?: number;
  generateAudio?: boolean;
  referenceImages: StudioStageableMediaFile[];
  referenceVideos: StudioStageableMediaFile[];
  onProgress?: (status: 'STAGING' | 'PROCESSING' | 'DOWNLOADING', progress: number, externalTaskId?: string) => Promise<void>;
  onRequestPrepared?: (snapshot: StudioPreparedRequestSnapshot) => Promise<void>;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
};

export type StudioDownloadedOutput = {
  bytes: Buffer;
  mimeType: string;
  sourceUrl: string;
};

export type StudioRouterExecutionResult = {
  providerUsed: StudioProviderId;
  endpoint: string;
  failoverTriggered: boolean;
  externalTaskId: string;
  outputUrls: string[];
  requestPayload: Record<string, unknown>;
  stagedImageUrls: string[];
  stagedVideoUrls: string[];
  attempts: StudioProviderAttemptRecord[];
};

export class StudioProviderCallError extends Error {
  constructor(
    public readonly provider: StudioProviderId,
    message: string,
    public readonly retryable: boolean,
    public readonly errorCode: string | null = null,
    public readonly externalTaskId: string | null = null,
  ) {
    super(message);
    this.name = 'StudioProviderCallError';
  }
}

export const assertSafeHttpsOutputUrl = (rawUrl: string): URL => {
  const url = new URL(rawUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  ) {
    throw new Error('Provider returned an unsupported media download URL.');
  }
  return url;
};

export const classifyHttpStatusRetryable = (status: number | undefined): boolean => {
  if (!status) return true; // network / timeout / DNS / ECONNRESET
  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
};

const extractSafeAxiosFailure = (
  error: unknown,
  provider: StudioProviderId,
  fallbackMessage: string,
): StudioProviderCallError => {
  if (error instanceof StudioProviderCallError) return error;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as Record<string, unknown> | undefined;
    const rawMsg =
      (typeof data?.message === 'string' && data.message) ||
      (typeof data?.msg === 'string' && data.msg) ||
      (typeof data?.error === 'string' && data.error) ||
      error.code ||
      fallbackMessage;
    // Never include Axios config/headers (contains Authorization Bearer token)
    const safeMsg = String(rawMsg).slice(0, 300);
    const retryable = classifyHttpStatusRetryable(status);
    return new StudioProviderCallError(
      provider,
      `${provider === 'wavespeed' ? 'WaveSpeedAI' : 'Kie.ai'} error${status ? ` (${status})` : ''}: ${safeMsg}`,
      retryable,
      status ? String(status) : (error.code ?? 'NETWORK_ERROR'),
    );
  }
  const message =
    error instanceof Error ? error.message.slice(0, 300) : fallbackMessage;
  return new StudioProviderCallError(provider, message, true, 'UNKNOWN_ERROR');
};

const delayMs = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class DeliveryStudioProviderRouterService {
  private readonly logger = new Logger(
    DeliveryStudioProviderRouterService.name,
  );

  // =========================================================================
  // Provider Key Verification (Safe, never echoes keys)
  // =========================================================================

  async verifyProviderKey(
    provider: StudioProviderId,
    apiKey: string,
  ): Promise<{ ok: boolean; message: string }> {
    const trimmed = apiKey.trim();
    if (!trimmed || trimmed.length < 8) {
      return { ok: false, message: 'API key appears empty or too short.' };
    }
    try {
      if (provider === 'wavespeed') {
        const res = await axios.get<Record<string, unknown>>(
          `${WAVESPEED_API_BASE}/balance`,
          {
            headers: { Authorization: `Bearer ${trimmed}` },
            timeout: 15_000,
            maxRedirects: 0,
            validateStatus: () => true,
          },
        );
        if (res.status === 200) {
          return { ok: true, message: 'WaveSpeedAI key verified.' };
        }
        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            message: 'WaveSpeedAI rejected this API key (401/403).',
          };
        }
        // Fallback probe on predictions endpoint if /balance is unavailable on an account tier
        const probe = await axios.get<Record<string, unknown>>(
          `${WAVESPEED_API_BASE}/predictions/ping-verify-key/result`,
          {
            headers: { Authorization: `Bearer ${trimmed}` },
            timeout: 15_000,
            maxRedirects: 0,
            validateStatus: () => true,
          },
        );
        if (probe.status === 401 || probe.status === 403) {
          return {
            ok: false,
            message: 'WaveSpeedAI rejected this API key (401/403).',
          };
        }
        return { ok: true, message: 'WaveSpeedAI key accepted.' };
      }

      // Kie.ai key check via /chat/credit or recordInfo probe
      const res = await axios.get<Record<string, unknown>>(
        `${KIE_API_BASE}/chat/credit`,
        {
          headers: { Authorization: `Bearer ${trimmed}` },
          timeout: 15_000,
          maxRedirects: 0,
          validateStatus: () => true,
        },
      );
      const bodyCode = Number(res.data?.code ?? res.status);
      if (res.status === 401 || res.status === 403 || bodyCode === 401 || bodyCode === 403) {
        return { ok: false, message: 'Kie.ai rejected this API key (401).' };
      }
      if (res.status >= 200 && res.status < 300 && (bodyCode === 200 || bodyCode === 0)) {
        return { ok: true, message: 'Kie.ai key verified.' };
      }
      return {
        ok: false,
        message: `Kie.ai verification returned status ${bodyCode || res.status}.`,
      };
    } catch (error) {
      const safe = extractSafeAxiosFailure(
        error,
        provider,
        'Could not reach provider to verify key.',
      );
      return { ok: false, message: safe.message };
    }
  }

  // =========================================================================
  // Main Routed Execution: WaveSpeedAI Primary -> Kie.ai Auto-Failover
  // =========================================================================

  async execute(
    request: StudioNormalizedGenerationRequest,
    credentials: StudioProviderCredentials,
  ): Promise<StudioRouterExecutionResult> {
    const spec = getStudioModelSpec(request.modelKey);
    if (!spec) {
      throw new StudioProviderCallError(
        'wavespeed',
        `Unsupported studio model "${request.modelKey}".`,
        false,
        'UNSUPPORTED_MODEL',
      );
    }

    const plan = this.resolveProviderOrder(request.routingMode, credentials);
    if (plan.length === 0) {
      throw new StudioProviderCallError(
        'wavespeed',
        'No enabled AI Studio provider API key is configured. Add your WaveSpeedAI or Kie.ai key in Providers & Keys.',
        false,
        'NO_PROVIDER_CONFIGURED',
      );
    }

    const attempts: StudioProviderAttemptRecord[] = [];
    let lastError: StudioProviderCallError | null = null;

    for (let index = 0; index < plan.length; index += 1) {
      const provider = plan[index];
      const endpoint =
        provider === 'wavespeed'
          ? `${WAVESPEED_API_BASE}/${spec.wavespeed.endpoint}`
          : `${KIE_API_BASE}/jobs/createTask (${spec.kie.model})`;
      const startedAt = new Date().toISOString();
      let preparedForAttempt: StudioPreparedRequestSnapshot | null = null;
      const attemptRequest: StudioNormalizedGenerationRequest = {
        ...request,
        onRequestPrepared: async (snapshot) => {
          preparedForAttempt = snapshot;
          await request.onRequestPrepared?.(snapshot);
        },
      };

      try {
        const result =
          provider === 'wavespeed'
            ? await this.runOnWaveSpeed(
                spec,
                attemptRequest,
                credentials.wavespeedApiKey as string,
              )
            : await this.runOnKie(
                spec,
                attemptRequest,
                credentials.kieApiKey as string,
              );

        attempts.push({
          provider,
          endpoint,
          externalTaskId: result.externalTaskId,
          startedAt,
          finishedAt: new Date().toISOString(),
          status: 'SUCCESS',
          retryable: false,
          errorCode: null,
          errorMessage: null,
          requestPayload: result.requestPayload,
          stagedImageUrls: result.stagedImageUrls,
          stagedVideoUrls: result.stagedVideoUrls,
        });

        return {
          providerUsed: provider,
          endpoint,
          failoverTriggered: index > 0,
          externalTaskId: result.externalTaskId,
          outputUrls: result.outputUrls,
          requestPayload: result.requestPayload,
          stagedImageUrls: result.stagedImageUrls,
          stagedVideoUrls: result.stagedVideoUrls,
          attempts,
        };
      } catch (error) {
        const classified = extractSafeAxiosFailure(
          error,
          provider,
          `${provider} generation failed.`,
        );
        lastError = classified;
        const captured = preparedForAttempt as StudioPreparedRequestSnapshot | null;
        attempts.push({
          provider,
          endpoint,
          externalTaskId: classified.externalTaskId,
          startedAt,
          finishedAt: new Date().toISOString(),
          status: 'FAILED',
          retryable: classified.retryable,
          errorCode: classified.errorCode,
          errorMessage: classified.message,
          requestPayload: captured?.requestPayload ?? null,
          stagedImageUrls: captured?.stagedImageUrls ?? [],
          stagedVideoUrls: captured?.stagedVideoUrls ?? [],
        });

        const hasNextProvider = index + 1 < plan.length;
        if (hasNextProvider && classified.retryable) {
          this.logger.warn(
            `Primary provider "${provider}" failed with retryable error (${classified.errorCode}); automatically failing over to "${plan[index + 1]}".`,
          );
          continue;
        }
        break;
      }
    }

    const finalError =
      lastError ??
      new StudioProviderCallError(
        plan[0],
        'Generation failed across configured providers.',
        false,
        'ALL_FAILED',
      );
    (finalError as StudioProviderCallError & { attempts?: StudioProviderAttemptRecord[] }).attempts =
      attempts;
    throw finalError;
  }

  resolveProviderOrder(
    routingMode: StudioRoutingMode,
    credentials: StudioProviderCredentials,
  ): StudioProviderId[] {
    const canWaveSpeed = Boolean(
      credentials.wavespeedEnabled && credentials.wavespeedApiKey?.trim(),
    );
    const canKie = Boolean(
      credentials.kieEnabled && credentials.kieApiKey?.trim(),
    );

    if (routingMode === 'WAVESPEED_ONLY') {
      return canWaveSpeed ? ['wavespeed'] : [];
    }
    if (routingMode === 'KIE_ONLY') {
      return canKie ? ['kie'] : [];
    }
    // AUTO_FAILOVER: WaveSpeedAI primary, Kie.ai automatic failover
    const order: StudioProviderId[] = [];
    if (canWaveSpeed) order.push('wavespeed');
    if (canKie) order.push('kie');
    return order;
  }

  // =========================================================================
  // WaveSpeedAI v3 Execution
  // =========================================================================

  private async stageFileToWaveSpeed(
    apiKey: string,
    file: StudioStageableMediaFile,
  ): Promise<string> {
    if (file.cachedWavespeedUrl) {
      return file.cachedWavespeedUrl;
    }
    const bytes = await file.readBytes();
    try {
      // Preferred 2-step direct upload (up to 200 MB)
      const ticketRes = await axios.post<{
        code?: number;
        data?: {
          download_url?: string;
          upload?: { url?: string; headers?: Record<string, string> };
        };
      }>(
        `${WAVESPEED_API_BASE}/media/uploads`,
        {
          filename: file.fileName,
          size: bytes.length,
          content_type: file.mimeType,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
          maxRedirects: 0,
        },
      );

      const uploadUrl = ticketRes.data?.data?.upload?.url;
      const downloadUrl = ticketRes.data?.data?.download_url;
      const uploadHeaders = ticketRes.data?.data?.upload?.headers ?? {};

      if (uploadUrl && downloadUrl) {
        await axios.put(uploadUrl, bytes, {
          headers: {
            'Content-Type': file.mimeType,
            ...uploadHeaders,
          },
          timeout: 120_000,
          maxBodyLength: MAX_DOWNLOAD_BYTES,
          maxContentLength: MAX_DOWNLOAD_BYTES,
          maxRedirects: 0,
        });
        const expiresAt = new Date(
          Date.now() + WAVESPEED_STAGE_TTL_MS,
        ).toISOString();
        if (file.onStagedUrl) {
          await file.onStagedUrl('wavespeed', downloadUrl, expiresAt);
        }
        return downloadUrl;
      }
    } catch (directError) {
      this.logger.warn(
        `WaveSpeed direct upload ticket unavailable; falling back to binary upload.`,
      );
      if (
        axios.isAxiosError(directError) &&
        directError.response?.status &&
        (directError.response.status === 401 ||
          directError.response.status === 403)
      ) {
        throw extractSafeAxiosFailure(
          directError,
          'wavespeed',
          'WaveSpeedAI authentication failed during upload.',
        );
      }
    }

    // Fallback single-request binary upload (up to 100 MB)
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: file.mimeType }),
      file.fileName,
    );
    const binRes = await axios.post<{
      data?: { download_url?: string };
    }>(`${WAVESPEED_API_BASE}/media/upload/binary`, form, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 120_000,
      maxBodyLength: MAX_DOWNLOAD_BYTES,
      maxContentLength: MAX_DOWNLOAD_BYTES,
      maxRedirects: 0,
    });
    const url = binRes.data?.data?.download_url;
    if (!url) {
      throw new StudioProviderCallError(
        'wavespeed',
        'WaveSpeedAI upload did not return a download_url.',
        true,
        'UPLOAD_NO_URL',
      );
    }
    const expiresAt = new Date(
      Date.now() + WAVESPEED_STAGE_TTL_MS,
    ).toISOString();
    if (file.onStagedUrl) {
      await file.onStagedUrl('wavespeed', url, expiresAt);
    }
    return url;
  }

  buildWaveSpeedPayload(
    spec: StudioModelSpec,
    request: StudioNormalizedGenerationRequest,
    stagedImageUrls: string[],
    stagedVideoUrls: string[],
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      prompt: request.prompt,
    };

    if (request.aspectRatio) {
      body.aspect_ratio = request.aspectRatio;
    }

    if (spec.kind === 'IMAGE') {
      if (request.resolution && !spec.wavespeed.omitResolution) {
        body.resolution = request.resolution.toLowerCase();
      }
      if (request.quality) {
        body.quality = request.quality;
      }
      body.output_format = 'png';
      if (stagedImageUrls.length > 0 && spec.wavespeed.imageInputField) {
        body[spec.wavespeed.imageInputField] =
          spec.wavespeed.imageInputField === 'image'
            ? stagedImageUrls[0]
            : stagedImageUrls.slice(0, spec.capabilities.maxReferenceImages);
      }
    } else {
      if (request.resolution && !spec.wavespeed.omitResolution) {
        body.resolution = request.resolution.toLowerCase();
      }
      if (request.durationSec) {
        body.duration = request.durationSec;
      }
      if (
        spec.capabilities.supportsAudio &&
        request.generateAudio !== undefined
      ) {
        body.generate_audio = request.generateAudio;
      }
      if (stagedImageUrls.length > 0 && spec.wavespeed.imageInputField) {
        body[spec.wavespeed.imageInputField] = stagedImageUrls.slice(
          0,
          spec.capabilities.maxReferenceImages,
        );
      }
      if (stagedVideoUrls.length > 0 && spec.wavespeed.videoInputField) {
        body[spec.wavespeed.videoInputField] =
          spec.wavespeed.videoInputField === 'video'
            ? stagedVideoUrls[0]
            : stagedVideoUrls.slice(0, spec.capabilities.maxReferenceVideos);
      }
    }

    return body;
  }

  private async runOnWaveSpeed(
    spec: StudioModelSpec,
    request: StudioNormalizedGenerationRequest,
    apiKey: string,
  ): Promise<{
    externalTaskId: string;
    outputUrls: string[];
    requestPayload: Record<string, unknown>;
    stagedImageUrls: string[];
    stagedVideoUrls: string[];
  }> {
    await request.onProgress?.('STAGING', 12);
    const stagedImages: string[] = [];
    for (const img of request.referenceImages.slice(
      0,
      spec.capabilities.maxReferenceImages,
    )) {
      stagedImages.push(await this.stageFileToWaveSpeed(apiKey, img));
    }
    const stagedVideos: string[] = [];
    for (const vid of request.referenceVideos.slice(
      0,
      spec.capabilities.maxReferenceVideos,
    )) {
      stagedVideos.push(await this.stageFileToWaveSpeed(apiKey, vid));
    }

    const endpoint = `${WAVESPEED_API_BASE}/${spec.wavespeed.endpoint}`;
    const payload = this.buildWaveSpeedPayload(
      spec,
      request,
      stagedImages,
      stagedVideos,
    );

    await request.onRequestPrepared?.({
      provider: 'wavespeed',
      endpoint,
      requestPayload: payload,
      stagedImageUrls: stagedImages,
      stagedVideoUrls: stagedVideos,
    });

    const submitRes = await axios.post<{
      code?: number;
      message?: string;
      data?: {
        id?: string;
        status?: string;
        outputs?: string[];
        error?: string;
      };
    }>(endpoint, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 45_000,
      maxRedirects: 0,
    });

    if (
      submitRes.data?.code !== undefined &&
      submitRes.data.code !== 200 &&
      submitRes.data.code !== 0
    ) {
      throw new StudioProviderCallError(
        'wavespeed',
        submitRes.data.message || 'WaveSpeedAI rejected the generation request.',
        classifyHttpStatusRetryable(submitRes.data.code),
        String(submitRes.data.code),
      );
    }

    const predictionId = submitRes.data?.data?.id;
    if (!predictionId) {
      throw new StudioProviderCallError(
        'wavespeed',
        'WaveSpeedAI did not return a prediction ID.',
        true,
        'NO_PREDICTION_ID',
      );
    }

    await request.onProgress?.('PROCESSING', 25, predictionId);

    if (
      submitRes.data?.data?.status === 'completed' &&
      Array.isArray(submitRes.data.data.outputs) &&
      submitRes.data.data.outputs.length > 0
    ) {
      return {
        externalTaskId: predictionId,
        outputUrls: submitRes.data.data.outputs,
        requestPayload: payload,
        stagedImageUrls: stagedImages,
        stagedVideoUrls: stagedVideos,
      };
    }

    const pollIntervalMs = request.pollIntervalMs ?? 3000;
    const maxAttempts =
      request.maxPollAttempts ?? (spec.kind === 'VIDEO' ? 180 : 60);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await delayMs(pollIntervalMs);
      const pollRes = await axios.get<{
        code?: number;
        message?: string;
        data?: {
          id?: string;
          status?: string;
          outputs?: string[];
          error?: string;
          has_nsfw_contents?: boolean[];
        };
      }>(`${WAVESPEED_API_BASE}/predictions/${encodeURIComponent(predictionId)}/result`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30_000,
        maxRedirects: 0,
      });

      const data = pollRes.data?.data;
      const status = (data?.status ?? '').toLowerCase();

      if (status === 'completed' || status === 'succeeded') {
        if (data?.has_nsfw_contents?.some(Boolean)) {
          throw new StudioProviderCallError(
            'wavespeed',
            'Output was flagged by provider safety filters.',
            false,
            'SAFETY_BLOCKED',
            predictionId,
          );
        }
        const outputs = Array.isArray(data?.outputs)
          ? data.outputs.filter((u): u is string => typeof u === 'string' && u.length > 0)
          : [];
        if (outputs.length === 0) {
          throw new StudioProviderCallError(
            'wavespeed',
            'WaveSpeedAI completed without returning any output URLs.',
            true,
            'EMPTY_OUTPUTS',
            predictionId,
          );
        }
        await request.onProgress?.('DOWNLOADING', 90, predictionId);
        return {
          externalTaskId: predictionId,
          outputUrls: outputs,
          requestPayload: payload,
          stagedImageUrls: stagedImages,
          stagedVideoUrls: stagedVideos,
        };
      }

      if (status === 'failed' || status === 'cancelled') {
        const errMsg = data?.error || 'WaveSpeedAI generation failed.';
        const isPolicyError = /nsfw|safety|policy|invalid|unsupported/i.test(
          errMsg,
        );
        throw new StudioProviderCallError(
          'wavespeed',
          errMsg.slice(0, 300),
          !isPolicyError,
          status.toUpperCase(),
          predictionId,
        );
      }

      const pct = Math.min(
        85,
        25 + Math.round(((attempt + 1) / Math.max(10, maxAttempts * 0.45)) * 60),
      );
      await request.onProgress?.('PROCESSING', pct, predictionId);
    }

    throw new StudioProviderCallError(
      'wavespeed',
      'WaveSpeedAI generation timed out while waiting for completion.',
      true,
      'POLL_TIMEOUT',
      predictionId,
    );
  }

  // =========================================================================
  // Kie.ai v1 Execution (Failsafe & Manual Secondary Provider)
  // =========================================================================

  private async stageFileToKie(
    apiKey: string,
    file: StudioStageableMediaFile,
  ): Promise<string> {
    if (file.cachedKieUrl) {
      return file.cachedKieUrl;
    }
    const bytes = await file.readBytes();
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: file.mimeType }),
      file.fileName,
    );
    form.append(
      'uploadPath',
      file.kind === 'VIDEO' ? 'studio/videos' : 'studio/images',
    );
    form.append('fileName', file.fileName);

    const res = await axios.post<{
      success?: boolean;
      code?: number;
      msg?: string;
      data?: { downloadUrl?: string };
    }>(`${KIE_UPLOAD_BASE}/api/file-stream-upload`, form, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 120_000,
      maxBodyLength: MAX_DOWNLOAD_BYTES,
      maxContentLength: MAX_DOWNLOAD_BYTES,
      maxRedirects: 0,
    });

    const code = Number(res.data?.code ?? 200);
    if (code !== 200 && code !== 0) {
      throw new StudioProviderCallError(
        'kie',
        res.data?.msg || `Kie.ai file upload rejected (code ${code}).`,
        classifyHttpStatusRetryable(code),
        String(code),
      );
    }
    const downloadUrl = res.data?.data?.downloadUrl;
    if (!downloadUrl) {
      throw new StudioProviderCallError(
        'kie',
        'Kie.ai file upload did not return a downloadUrl.',
        true,
        'UPLOAD_NO_URL',
      );
    }
    const expiresAt = new Date(Date.now() + KIE_STAGE_TTL_MS).toISOString();
    if (file.onStagedUrl) {
      await file.onStagedUrl('kie', downloadUrl, expiresAt);
    }
    return downloadUrl;
  }

  buildKiePayload(
    spec: StudioModelSpec,
    request: StudioNormalizedGenerationRequest,
    stagedImageUrls: string[],
    stagedVideoUrls: string[],
  ): { model: string; input: Record<string, unknown> } {
    const input: Record<string, unknown> = {
      prompt: request.prompt,
    };

    if (request.aspectRatio) {
      input.aspect_ratio = request.aspectRatio;
    }

    if (spec.kind === 'IMAGE') {
      if (request.resolution) {
        input.resolution = request.resolution.toUpperCase();
      }
      if (request.quality) {
        input.quality = request.quality;
      }
      input.output_format = 'png';
      if (stagedImageUrls.length > 0 && spec.kie.imageInputField) {
        input[spec.kie.imageInputField] = stagedImageUrls.slice(
          0,
          spec.capabilities.maxReferenceImages,
        );
      }
    } else {
      const hasRefs =
        stagedImageUrls.length > 0 || stagedVideoUrls.length > 0;
      const isKieEditMode =
        spec.kie.omniReferenceTaskType === 'edit' && stagedVideoUrls.length > 0;

      if (request.resolution) {
        let normalizedRes = request.resolution.toLowerCase();
        if (spec.kie.model === 'magi-2/reference-to-video') {
          normalizedRes = '1080p';
        } else if (
          spec.kie.maxResolution === '720p' &&
          (normalizedRes === '1080p' || normalizedRes === '4k')
        ) {
          normalizedRes = '720p';
        }
        input.resolution =
          spec.kie.resolutionFormat === 'UPPER'
            ? normalizedRes.toUpperCase()
            : normalizedRes;
      }

      if (isKieEditMode) {
        input.omni_reference_task_type = 'edit';
        input.aspect_ratio = 'adaptive';
        input.duration = -1;
      } else {
        if (spec.kie.omniReferenceTaskType === 'reference' && hasRefs) {
          input.omni_reference_task_type = 'reference';
        }
        if (request.durationSec) {
          input.duration = spec.kie.durationAsNumber
            ? request.durationSec
            : String(request.durationSec);
        }
      }

      if (
        spec.capabilities.supportsAudio &&
        request.generateAudio !== undefined
      ) {
        const audioField = spec.kie.audioInputField ?? 'generate_audio';
        input[audioField] = request.generateAudio;
      }
      if (stagedImageUrls.length > 0 && spec.kie.imageInputField) {
        input[spec.kie.imageInputField] = stagedImageUrls.slice(
          0,
          spec.capabilities.maxReferenceImages,
        );
      }
      if (stagedVideoUrls.length > 0 && spec.kie.videoInputField) {
        input[spec.kie.videoInputField] =
          spec.kie.videoInputField === 'video_url'
            ? stagedVideoUrls[0]
            : stagedVideoUrls.slice(0, spec.capabilities.maxReferenceVideos);
      }
    }

    return { model: spec.kie.model, input };
  }

  private async runOnKie(
    spec: StudioModelSpec,
    request: StudioNormalizedGenerationRequest,
    apiKey: string,
  ): Promise<{
    externalTaskId: string;
    outputUrls: string[];
    requestPayload: Record<string, unknown>;
    stagedImageUrls: string[];
    stagedVideoUrls: string[];
  }> {
    await request.onProgress?.('STAGING', 15);
    const stagedImages: string[] = [];
    for (const img of request.referenceImages.slice(
      0,
      spec.capabilities.maxReferenceImages,
    )) {
      stagedImages.push(await this.stageFileToKie(apiKey, img));
    }
    const stagedVideos: string[] = [];
    for (const vid of request.referenceVideos.slice(
      0,
      spec.capabilities.maxReferenceVideos,
    )) {
      stagedVideos.push(await this.stageFileToKie(apiKey, vid));
    }

    const endpoint = `${KIE_API_BASE}/jobs/createTask (${spec.kie.model})`;
    const payload = this.buildKiePayload(
      spec,
      request,
      stagedImages,
      stagedVideos,
    );

    await request.onRequestPrepared?.({
      provider: 'kie',
      endpoint,
      requestPayload: payload as unknown as Record<string, unknown>,
      stagedImageUrls: stagedImages,
      stagedVideoUrls: stagedVideos,
    });

    const submitRes = await axios.post<{
      code?: number;
      msg?: string;
      data?: { taskId?: string };
    }>(`${KIE_API_BASE}/jobs/createTask`, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 45_000,
      maxRedirects: 0,
    });

    // Kie.ai returns HTTP 200 with application-level `code` in body
    const submitCode = Number(submitRes.data?.code ?? 200);
    if (submitCode !== 200 && submitCode !== 0) {
      throw new StudioProviderCallError(
        'kie',
        submitRes.data?.msg || `Kie.ai rejected the task (code ${submitCode}).`,
        classifyHttpStatusRetryable(submitCode),
        String(submitCode),
      );
    }

    const taskId = submitRes.data?.data?.taskId;
    if (!taskId) {
      throw new StudioProviderCallError(
        'kie',
        'Kie.ai createTask did not return a taskId.',
        true,
        'NO_TASK_ID',
      );
    }

    await request.onProgress?.('PROCESSING', 25, taskId);

    const pollIntervalMs = request.pollIntervalMs ?? 3000;
    const maxAttempts =
      request.maxPollAttempts ?? (spec.kind === 'VIDEO' ? 180 : 60);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await delayMs(pollIntervalMs);
      const pollRes = await axios.get<{
        code?: number;
        msg?: string;
        data?: {
          taskId?: string;
          state?: string;
          resultJson?: string;
          failCode?: string;
          failMsg?: string;
        };
      }>(`${KIE_API_BASE}/jobs/recordInfo`, {
        params: { taskId },
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30_000,
        maxRedirects: 0,
      });

      const pollCode = Number(pollRes.data?.code ?? 200);
      if (pollCode !== 200 && pollCode !== 0) {
        if (classifyHttpStatusRetryable(pollCode)) {
          continue;
        }
        throw new StudioProviderCallError(
          'kie',
          pollRes.data?.msg || `Kie.ai recordInfo failed (code ${pollCode}).`,
          false,
          String(pollCode),
          taskId,
        );
      }

      const data = pollRes.data?.data;
      const state = (data?.state ?? '').toLowerCase();

      if (state === 'success') {
        let urls: string[] = [];
        if (typeof data?.resultJson === 'string' && data.resultJson.trim()) {
          try {
            const parsed = JSON.parse(data.resultJson) as {
              resultUrls?: unknown;
              urls?: unknown;
            };
            const list = Array.isArray(parsed.resultUrls)
              ? parsed.resultUrls
              : Array.isArray(parsed.urls)
                ? parsed.urls
                : [];
            urls = list.filter(
              (u): u is string => typeof u === 'string' && u.length > 0,
            );
          } catch {
            // Fall through to empty check
          }
        }
        if (urls.length === 0) {
          throw new StudioProviderCallError(
            'kie',
            'Kie.ai completed without returning any resultUrls.',
            true,
            'EMPTY_OUTPUTS',
            taskId,
          );
        }
        await request.onProgress?.('DOWNLOADING', 90, taskId);
        return {
          externalTaskId: taskId,
          outputUrls: urls,
          requestPayload: payload as unknown as Record<string, unknown>,
          stagedImageUrls: stagedImages,
          stagedVideoUrls: stagedVideos,
        };
      }

      if (state === 'fail' || state === 'failed') {
        const failMsg = data?.failMsg || 'Kie.ai generation failed.';
        const isPolicyError = /nsfw|safety|policy|invalid|unsupported/i.test(
          failMsg,
        );
        throw new StudioProviderCallError(
          'kie',
          failMsg.slice(0, 300),
          !isPolicyError,
          data?.failCode || 'FAILED',
          taskId,
        );
      }

      const pct = Math.min(
        85,
        25 + Math.round(((attempt + 1) / Math.max(10, maxAttempts * 0.45)) * 60),
      );
      await request.onProgress?.('PROCESSING', pct, taskId);
    }

    throw new StudioProviderCallError(
      'kie',
      'Kie.ai generation timed out while waiting for completion.',
      true,
      'POLL_TIMEOUT',
      taskId,
    );
  }

  // =========================================================================
  // SSRF-Safe Output Download (Immediate Canonical Persistence)
  // =========================================================================

  async downloadOutput(
    rawUrl: string,
    expectedKind: 'IMAGE' | 'VIDEO',
  ): Promise<StudioDownloadedOutput> {
    const safeUrl = assertSafeHttpsOutputUrl(rawUrl);
    const agent = createSsrfSafeAgent('https');
    const res = await axios.get<ArrayBuffer>(safeUrl.toString(), {
      httpsAgent: agent,
      responseType: 'arraybuffer',
      timeout: 120_000,
      maxRedirects: 0,
      maxContentLength: MAX_DOWNLOAD_BYTES,
      maxBodyLength: MAX_DOWNLOAD_BYTES,
      proxy: false,
    });

    const bytes = Buffer.from(res.data);
    if (bytes.length === 0) {
      throw new Error('Downloaded output file was empty.');
    }

    const detected = await new FileTypeParser().fromBuffer(
      bytes.subarray(0, Math.min(bytes.length, 8192)),
    );
    const headerMime = String(res.headers['content-type'] ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const mimeType =
      detected?.mime ??
      (headerMime || (expectedKind === 'VIDEO' ? 'video/mp4' : 'image/png'));

    const allowedPrefix = expectedKind === 'VIDEO' ? 'video/' : 'image/';
    if (!mimeType.startsWith(allowedPrefix)) {
      throw new Error(
        `Unexpected downloaded MIME type "${mimeType}" for ${expectedKind} output.`,
      );
    }

    return {
      bytes,
      mimeType,
      sourceUrl: safeUrl.toString(),
    };
  }
}
