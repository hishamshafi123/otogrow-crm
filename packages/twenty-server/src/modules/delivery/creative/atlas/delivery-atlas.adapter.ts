import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { FileTypeParser } from 'file-type';
import { z } from 'zod';
import { createSsrfSafeAgent } from 'src/engine/core-modules/secure-http-client/utils/create-ssrf-safe-agent.util';
import { microToUsd } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.policy';
import { type AtlasProfile } from 'src/modules/delivery/creative/atlas/delivery-atlas.catalog';
import { type AtlasParameters } from 'src/modules/delivery/creative/atlas/delivery-atlas.types';

const API = 'https://api.atlascloud.ai';
const predictionSchema = z.object({
  id: z.string().min(1).max(200),
  model: z.string().optional(),
  status: z.enum(['created', 'processing', 'completed', 'succeeded', 'failed']),
  outputs: z.array(z.string().max(4000)).max(10).optional(),
  has_nsfw_contents: z.array(z.boolean()).optional(),
});
export type AtlasPrediction = z.infer<typeof predictionSchema>;
const payload = (value: unknown): unknown => {
  const envelope = z
    .object({
      code: z.union([z.number(), z.string()]).optional(),
      data: z.unknown().optional(),
    })
    .passthrough()
    .parse(value);
  if (
    envelope.code !== undefined &&
    ![0, 200, '0', '200'].includes(envelope.code)
  )
    throw new Error('Atlas rejected the request.');
  return envelope.data ?? value;
};
export const atlasPublicUrl = (value: string): URL => {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new Error('Atlas returned an unsupported media location.');
  return url;
};
export const atlasQuoteAmount = (value: string | number): string => {
  const decimal = String(value);
  const match =
    decimal.length <= 350
      ? /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(decimal)
      : null;
  if (!match || (typeof value === 'number' && !Number.isFinite(value)))
    throw new Error('Atlas returned an unsupported quote amount.');
  const digits = match[1] + (match[2] ?? ''),
    point = match[1].length + Number(match[3] ?? 0),
    microPoint = point + 6,
    whole =
      point > 0
        ? digits.slice(0, point).padEnd(point, '0').replace(/^0+/, '')
        : '';
  if (whole.length > 10 || Math.abs(Number(match[3] ?? 0)) > 324)
    throw new Error('Atlas returned an unsupported quote amount.');
  const truncated =
      microPoint <= 0
        ? ''
        : digits.slice(0, microPoint).padEnd(microPoint, '0'),
    remainder = microPoint < 0 ? digits : digits.slice(microPoint),
    micros =
      BigInt(truncated || '0') +
      (/[1-9]/.test(remainder) ? BigInt(1) : BigInt(0));
  return microToUsd(micros);
};
const atlasRequest = async <TResponse>(
  request: () => Promise<TResponse>,
): Promise<TResponse> => {
  try {
    return await request();
  } catch {
    // Axios errors retain authorization headers and must not reach API or worker logs.
    throw new Error('Atlas could not verify this request.');
  }
};
const quotePayload = (input: unknown): unknown => {
  if (typeof input !== 'string' || input.length > 1000000)
    throw new Error('Atlas returned an unsupported quote response.');
  const parse = JSON.parse as (
    text: string,
    reviver: (
      key: string,
      value: unknown,
      context?: { source?: string },
    ) => unknown,
  ) => unknown;
  return payload(
    parse(input, (key, value, context) => {
      if (key !== 'price' || typeof value !== 'number') return value;
      if (!context?.source || !Number.isFinite(value))
        throw new Error('Atlas quote precision could not be verified.');
      // The validated JSON numeric lexeme must survive before floating-point rounding.
      return context.source;
    }),
  );
};
@Injectable()
export class DeliveryAtlasAdapter {
  body(
    profile: AtlasProfile,
    prompt: string,
    parameters: AtlasParameters,
    references: string[],
  ) {
    const body: Record<string, string | number | boolean | string[]> = {
      model: profile.id,
      prompt,
    };
    for (const [name, value] of Object.entries(parameters)) {
      const key = profile.remoteKeys[name as keyof AtlasParameters];
      if (key && value !== undefined) body[key] = value;
    }
    if (profile.operation === 'IMAGE_EDIT') body.images = references;
    if (profile.operation === 'IMAGE_TO_VIDEO')
      body.image = references[0] ?? '';
    if (profile.kind === 'IMAGE') body.output_format = 'png';
    return body;
  }
  async calculate(
    apiKey: string,
    body: Record<string, string | number | boolean | string[]>,
  ) {
    const response = await atlasRequest(() =>
      axios.post<unknown>(`${API}/api/v1/model/calculate`, body, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30000,
        maxRedirects: 0,
        maxContentLength: 1000000,
        maxBodyLength: 1000000,
        proxy: false,
        responseType: 'text',
        transformResponse: [(data: unknown) => data],
      }),
    );
    const result = z
      .object({
        price: z.union([z.string(), z.number().finite().nonnegative()]),
        estimated: z.boolean().optional(),
      })
      .parse(quotePayload(response.data));
    return {
      costUsd: atlasQuoteAmount(result.price),
      estimated: result.estimated === true,
    };
  }
  async upload(apiKey: string, bytes: Buffer, mimeType: string) {
    const detected = bytes.length
      ? await new FileTypeParser().fromBuffer(bytes)
      : null;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType) ||
      bytes.length > 6000000 ||
      detected?.mime !== mimeType
    )
      throw new Error('Unsupported Atlas reference.');
    const boundary = `atlas-${randomUUID()}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="reference.${mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1]}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await atlasRequest(() =>
      axios.post<unknown>(`${API}/api/v1/model/uploadMedia`, body, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        timeout: 60000,
        maxRedirects: 0,
        maxContentLength: 1000000,
        maxBodyLength: 7000000,
        proxy: false,
      }),
    );
    return atlasPublicUrl(
      z
        .object({ url: z.string().url().max(4000) })
        .parse(payload(response.data)).url,
    ).toString();
  }
  async submit(
    apiKey: string,
    profile: AtlasProfile,
    body: Record<string, string | number | boolean | string[]>,
  ) {
    const response = await atlasRequest(() =>
      axios.post<unknown>(
        `${API}/api/v1/model/${profile.kind === 'IMAGE' ? 'generateImage' : 'generateVideo'}`,
        body,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'X-AtlasCloud-Object-Expiration-Hours': '24',
            'X-AtlasCloud-Request-Retention-Hours': '168',
          },
          timeout: 60000,
          maxRedirects: 0,
          maxContentLength: 1000000,
          maxBodyLength: 1000000,
          proxy: false,
        },
      ),
    );
    return this.prediction(response.data, profile.id);
  }
  async poll(apiKey: string, predictionId: string, profileId: string) {
    const response = await atlasRequest(() =>
      axios.get<unknown>(
        `${API}/api/v1/model/prediction/${encodeURIComponent(predictionId)}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 30000,
          maxRedirects: 0,
          maxContentLength: 1000000,
          proxy: false,
        },
      ),
    );
    const result = this.prediction(response.data, profileId);
    if (result.id !== predictionId)
      throw new Error('Atlas prediction identity changed.');
    return result;
  }
  private prediction(value: unknown, profileId: string): AtlasPrediction {
    const result = predictionSchema.parse(payload(value));
    if (result.model && result.model !== profileId)
      throw new Error('Atlas prediction model changed.');
    return result;
  }
  async download(value: string, kind: 'IMAGE' | 'CLIP') {
    const url = atlasPublicUrl(value);
    const response = await atlasRequest(() =>
      axios.get<ArrayBuffer>(url.toString(), {
        responseType: 'arraybuffer',
        httpsAgent: createSsrfSafeAgent('https'),
        timeout: 90000,
        maxRedirects: 0,
        maxContentLength: 100000000,
        maxBodyLength: 100000000,
        proxy: false,
      }),
    );
    const bytes = Buffer.from(response.data);
    if (!bytes.length || bytes.length > 100000000)
      throw new Error('Atlas output exceeds the asset limit.');
    const detected = await new FileTypeParser().fromBuffer(bytes);
    if (
      !detected ||
      !(kind === 'IMAGE'
        ? ['image/png', 'image/jpeg', 'image/webp'].includes(detected.mime)
        : detected.mime === 'video/mp4')
    )
      throw new Error('Atlas returned an unsupported media file.');
    return { bytes, mimeType: detected.mime, extension: detected.ext };
  }
}
