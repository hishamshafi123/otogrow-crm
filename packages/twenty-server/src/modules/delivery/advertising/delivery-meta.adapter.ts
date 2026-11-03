import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { type MetaInsightRow } from 'src/modules/delivery/advertising/delivery-meta.types';
const amount = z.string().regex(/^\d+(\.\d+)?$/);
const actions = z
  .array(z.object({ action_type: z.string().max(200), value: amount }))
  .max(500);
const rowSchema = z
  .object({
    date_start: z.iso.date(),
    date_stop: z.iso.date(),
    account_id: z.string(),
    campaign_id: z.string().optional(),
    campaign_name: z.string().max(2000).optional(),
    adset_id: z.string().optional(),
    adset_name: z.string().max(2000).optional(),
    ad_id: z.string().optional(),
    ad_name: z.string().max(2000).optional(),
    spend: amount.optional(),
    impressions: amount.optional(),
    clicks: amount.optional(),
    actions: actions.optional(),
    action_values: actions.optional(),
  })
  .transform((row) => ({
    ...row,
    spend: row.spend ?? '0',
    impressions: row.impressions ?? '0',
    clicks: row.clicks ?? '0',
    actions: row.actions ?? [],
    action_values: row.action_values ?? [],
    reportedFields: {
      spend: row.spend !== undefined,
      impressions: row.impressions !== undefined,
      clicks: row.clicks !== undefined,
      actions: row.actions !== undefined,
      action_values: row.action_values !== undefined,
    },
  }));
export class MetaReportingError extends Error {
  constructor(
    public readonly reason: 'AUTH' | 'RATE_LIMIT' | 'PROVIDER' | 'RESPONSE',
  ) {
    super(
      reason === 'AUTH'
        ? 'Meta access expired or was denied. Replace the token or check assigned assets.'
        : reason === 'RATE_LIMIT'
          ? 'Meta rate limit reached. Retry later.'
          : 'Meta reporting could not complete. Check the connection and retry.',
    );
  }
}
@Injectable()
export class DeliveryMetaAdapter {
  private async get(
    path: string,
    token: string,
    parameters: Record<string, string>,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (!/^act_\d+(\/insights)?$/.test(path))
      throw new MetaReportingError('RESPONSE');
    const version = process.env.META_GRAPH_API_VERSION ?? 'v26.0';
    if (!/^v\d+\.\d+$/.test(version)) throw new MetaReportingError('RESPONSE');
    try {
      const response = await fetch(
        `https://graph.facebook.com/${version}/${path}?${new URLSearchParams(parameters)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal,
          redirect: 'error',
        },
      );
      const text = await response.text();
      if (text.length > 4000000) throw new MetaReportingError('RESPONSE');
      const body: unknown = JSON.parse(text);
      const error = z
        .object({ error: z.object({ code: z.number().optional() }) })
        .safeParse(body);
      if (!response.ok || error.success) {
        const code = error.success ? error.data.error.code : null;
        throw new MetaReportingError(
          [190, 10, 200].includes(code ?? 0) ||
            [401, 403].includes(response.status)
            ? 'AUTH'
            : [4, 17, 32, 613, 80004].includes(code ?? 0) ||
                response.status === 429
              ? 'RATE_LIMIT'
              : 'PROVIDER',
        );
      }
      return body;
    } catch (error) {
      if (error instanceof MetaReportingError) throw error;
      // Provider errors can contain credentials or URLs; never propagate their raw text.
      throw new MetaReportingError('PROVIDER');
    }
  }
  async account(accountId: string, token: string) {
    const result = z
      .object({
        id: z.string(),
        name: z.string().max(500),
        currency: z.string().regex(/^[A-Z]{3}$/),
        timezone_name: z.string(),
        account_status: z.number(),
      })
      .safeParse(
        await this.get(
          `act_${accountId}`,
          token,
          { fields: 'id,name,currency,timezone_name,account_status' },
          AbortSignal.timeout(30000),
        ),
      );
    if (!result.success || result.data.id !== `act_${accountId}`)
      throw new MetaReportingError('RESPONSE');
    try {
      new Intl.DateTimeFormat('en', {
        timeZone: result.data.timezone_name,
      }).format();
    } catch {
      throw new MetaReportingError('RESPONSE');
    }
    return result.data;
  }
  async insights(
    accountId: string,
    token: string,
    date: string,
    level: 'account' | 'ad',
    signal = AbortSignal.timeout(90000),
  ): Promise<MetaInsightRow[]> {
    const rows: MetaInsightRow[] = [];
    let after: string | undefined;
    const cursors = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const body = await this.get(
        `act_${accountId}/insights`,
        token,
        {
          fields:
            'account_id,date_start,date_stop,spend,impressions,clicks,actions,action_values' +
            (level === 'ad'
              ? ',campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name'
              : ''),
          time_range: JSON.stringify({ since: date, until: date }),
          level,
          time_increment: '1',
          limit: '250',
          use_account_attribution_setting: 'true',
          ...(after ? { after } : {}),
        },
        signal,
      );
      const parsed = z
        .object({
          data: z.array(rowSchema).max(250),
          paging: z
            .object({
              next: z.string().optional(),
              cursors: z
                .object({ after: z.string().max(4000).optional() })
                .optional(),
            })
            .optional(),
        })
        .safeParse(body);
      if (!parsed.success) throw new MetaReportingError('RESPONSE');
      for (const row of parsed.data.data) {
        if (
          row.account_id !== accountId ||
          row.date_start !== date ||
          row.date_stop !== date ||
          (level === 'ad' && !row.ad_id)
        )
          throw new MetaReportingError('RESPONSE');
        rows.push(row);
      }
      if (!parsed.data.paging?.next) return rows;
      after = parsed.data.paging.cursors?.after;
      if (!after || cursors.has(after))
        throw new MetaReportingError('RESPONSE');
      cursors.add(after);
    }
    throw new MetaReportingError('RESPONSE');
  }
}
