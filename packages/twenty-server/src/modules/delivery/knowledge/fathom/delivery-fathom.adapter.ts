import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  FATHOM_MAX_BYTES,
  formatFathomTranscript,
  normalizeFathomUrl,
  parseFathomInput,
} from 'src/modules/delivery/knowledge/fathom/delivery-fathom.policy';

@Injectable()
export class DeliveryFathomAdapter {
  private async get(
    path: string,
    apiKey: string,
    parameters?: URLSearchParams,
  ): Promise<unknown> {
    const url = new URL(`https://api.fathom.ai/external/v1/${path}`);
    if (parameters) url.search = parameters.toString();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new BadGatewayException(
        'Fathom could not be reached. No transcript was imported.',
      );
    }
    if (!response.ok) await response.body?.cancel();
    if (response.status === 429) {
      const seconds = Number(response.headers.get('retry-after'));
      throw new HttpException(
        `Fathom rate limit reached. Wait ${Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.ceil(seconds), 86400) : 60} seconds before requesting again.`,
        429,
      );
    }
    if (response.status === 401 || response.status === 403)
      throw new BadGatewayException(
        'The Fathom credential cannot access this request. Ask an administrator to check the connection and meeting sharing.',
      );
    if (response.status === 404)
      throw new NotFoundException(
        'This Fathom recording is unavailable to the connected account.',
      );
    if (!response.ok)
      throw new BadGatewayException(
        'Fathom did not return a usable response. Try again later.',
      );
    if (
      !response.headers.get('content-type')?.includes('application/json') ||
      !response.body
    )
      throw new BadGatewayException('Fathom returned unsupported content.');
    if (Number(response.headers.get('content-length')) > FATHOM_MAX_BYTES) {
      await response.body.cancel();
      throw new BadRequestException(
        'This Fathom response exceeds the import limit. Narrow the selection or export text manually.',
      );
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > FATHOM_MAX_BYTES) {
          await reader.cancel();
          throw new BadRequestException(
            'This Fathom response exceeds the import limit. Narrow the selection or export text manually.',
          );
        }
        chunks.push(value);
      }
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadGatewayException(
        'Fathom returned an incomplete or invalid response. No transcript was imported.',
      );
    } finally {
      reader.releaseLock();
    }
  }
  async meetings(
    apiKey: string,
    input: {
      createdAfter: string;
      createdBefore: string;
      after?: string | null;
      exactUrl?: string | null;
    },
  ) {
    const parameters = new URLSearchParams({
      created_after: input.createdAfter,
      created_before: input.createdBefore,
    });
    if (input.after) parameters.set('cursor', input.after);
    const response = parseFathomInput(
      z.object({
        items: z
          .array(
            z.object({
              recording_id: z.number().int().positive().max(999999999999999),
              title: z.string().max(1000).nullish(),
              meeting_title: z.string().max(1000).nullish(),
              recording_start_time: z.iso.datetime({ offset: true }).nullish(),
              url: z.string().max(2000).nullish(),
              share_url: z.string().max(2000).nullish(),
            }),
          )
          .max(10),
        next_cursor: z.string().max(2000).nullish(),
      }),
      await this.get('meetings', apiKey, parameters),
    );
    const exact = input.exactUrl ? normalizeFathomUrl(input.exactUrl) : null;
    const items = response.items
      .map((item) => ({
        recordingId: String(item.recording_id),
        title: item.title ?? item.meeting_title ?? null,
        recordedAt: item.recording_start_time ?? null,
        sourceUrl: item.url
          ? normalizeFathomUrl(item.url)
          : item.share_url
            ? normalizeFathomUrl(item.share_url)
            : null,
        shareUrl: item.share_url ? normalizeFathomUrl(item.share_url) : null,
      }))
      .filter(
        (item) => !exact || item.sourceUrl === exact || item.shareUrl === exact,
      )
      .map(({ shareUrl: _shareUrl, ...item }) => item);
    return {
      items,
      nextCursor: response.next_cursor ?? null,
      scannedCount: response.items.length,
    };
  }
  async transcript(apiKey: string, recordingId: string) {
    if (!/^[1-9][0-9]{0,14}$/.test(recordingId))
      throw new BadRequestException(
        'Use the API recording ID from the meeting list, not the ID in a call link.',
      );
    return formatFathomTranscript(
      await this.get(`recordings/${recordingId}/transcript`, apiKey),
    );
  }
}
