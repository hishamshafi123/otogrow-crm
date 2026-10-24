import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { z } from 'zod';
import { FileTypeParser } from 'file-type';

const inlineSchema = z.object({
  data: z.string().min(1).max(140000000),
  mimeType: z.string(),
});
const imageResponseSchema = z.object({
  responseId: z.string().optional(),
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ inlineData: inlineSchema.optional() })),
        }),
      }),
    )
    .min(1),
});
const videoResponseSchema = z.object({
  id: z.string().optional(),
  status: z.literal('completed'),
  steps: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(
          z.object({
            type: z.string().optional(),
            data: z.string().min(1).max(140000000).optional(),
          }),
        )
        .optional(),
    }),
  ),
});

@Injectable()
export class DeliveryGoogleMediaAdapter {
  async generate(input: {
    apiKey: string;
    model: string;
    kind: 'IMAGE' | 'CLIP';
    prompt: string;
    references: { mimeType: string; data: string }[];
  }) {
    const base = 'https://generativelanguage.googleapis.com/v1beta';
    const image = input.kind === 'IMAGE';
    const body = image
      ? {
          contents: [
            {
              parts: [
                { text: input.prompt },
                ...input.references.map((reference) => ({
                  inlineData: reference,
                })),
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['IMAGE'],
            candidateCount: 1,
            maxOutputTokens: 8192,
            imageConfig: { imageSize: '1K' },
          },
        }
      : {
          model: input.model,
          input: [
            ...input.references.map((reference) => ({
              type: 'image',
              mime_type: reference.mimeType,
              data: reference.data,
            })),
            { type: 'text', text: input.prompt },
          ],
          response_format: { type: 'video', resolution: '720p' },
          generation_config: { max_output_tokens: 60000 },
          background: false,
          store: false,
          stream: false,
        };
    const response = await axios.post<unknown>(
      image
        ? `${base}/models/${encodeURIComponent(input.model)}:generateContent`
        : `${base}/interactions`,
      body,
      {
        headers: { 'x-goog-api-key': input.apiKey },
        timeout: 180000,
        signal: AbortSignal.timeout(180000),
        maxRedirects: 0,
        maxContentLength: 140000000,
        maxBodyLength: 30000000,
        proxy: false,
      },
    );
    let data: string;
    let providerJobId: string | null;
    if (image) {
      const result = imageResponseSchema.parse(response.data);
      const part = result.candidates[0].content.parts.find(
        (item) => item.inlineData,
      )?.inlineData;
      if (!part) throw new Error('Provider did not return an image.');
      data = part.data;
      providerJobId = result.responseId ?? null;
    } else {
      const result = videoResponseSchema.parse(response.data);
      const video = result.steps
        .filter((step) => step.type === 'model_output')
        .flatMap((step) => step.content ?? [])
        .find((part) => part.type === 'video' && part.data);
      if (!video?.data) throw new Error('Provider did not return a video.');
      data = video.data;
      providerJobId = result.id ?? null;
    }
    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length || bytes.length > 100 * 1024 * 1024)
      throw new Error('Provider output exceeds the asset limit.');
    const detected = await new FileTypeParser().fromBuffer(bytes);
    if (
      !detected ||
      !(image
        ? ['image/png', 'image/jpeg', 'image/webp'].includes(detected.mime)
        : detected.mime === 'video/mp4')
    )
      throw new Error('Unsupported provider output.');
    return {
      bytes,
      mimeType: detected.mime,
      extension: detected.ext,
      providerJobId,
    };
  }
}
