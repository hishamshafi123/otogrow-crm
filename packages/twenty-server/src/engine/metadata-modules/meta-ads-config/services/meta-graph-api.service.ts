import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

const GRAPH_API_BASE_URL = 'https://graph.facebook.com/v21.0';

export type MetaLeadFieldDatum = {
  name: string;
  values: string[];
};

export type MetaLead = {
  id: string;
  fieldData: MetaLeadFieldDatum[];
  formId: string | null;
  formName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string | null;
  adName: string | null;
};

export type MetaConnectionTestResult = {
  success: boolean;
  message: string | null;
};

type GraphLeadResponse = {
  id?: string;
  field_data?: { name?: string; values?: string[] }[];
  form_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  error?: { message?: string };
};

@Injectable()
export class MetaGraphApiService {
  async fetchLead({
    leadgenId,
    pageAccessToken,
  }: {
    leadgenId: string;
    pageAccessToken: string;
  }): Promise<MetaLead> {
    const lead = await this.graphGet<GraphLeadResponse>(
      `/${leadgenId}`,
      pageAccessToken,
    );

    const formId = lead.form_id ?? null;
    const formName = isDefined(formId)
      ? await this.fetchFormName({ formId, pageAccessToken })
      : null;

    return {
      id: lead.id ?? leadgenId,
      fieldData: (lead.field_data ?? [])
        .filter(
          (datum): datum is { name: string; values: string[] } =>
            typeof datum.name === 'string' && Array.isArray(datum.values),
        )
        .map((datum) => ({ name: datum.name, values: datum.values })),
      formId,
      formName,
      campaignId: lead.campaign_id ?? null,
      campaignName: lead.campaign_name ?? null,
      adsetId: lead.adset_id ?? null,
      adsetName: lead.adset_name ?? null,
      adId: lead.ad_id ?? null,
      adName: lead.ad_name ?? null,
    };
  }

  async fetchFormName({
    formId,
    pageAccessToken,
  }: {
    formId: string;
    pageAccessToken: string;
  }): Promise<string | null> {
    try {
      const form = await this.graphGet<{ name?: string }>(
        `/${formId}?fields=name`,
        pageAccessToken,
      );

      return form.name ?? null;
    } catch {
      // The form name is cosmetic; a missing leads_retrieval scope on the
      // form edge must not drop the lead.
      return null;
    }
  }

  async testConnection({
    pageAccessToken,
  }: {
    pageAccessToken: string;
  }): Promise<MetaConnectionTestResult> {
    try {
      const me = await this.graphGet<{ id?: string; name?: string }>(
        '/me',
        pageAccessToken,
      );

      return { success: true, message: me.name ?? null };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async graphGet<TResponse>(
    path: string,
    pageAccessToken: string,
  ): Promise<TResponse> {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(
      `${GRAPH_API_BASE_URL}${path}${separator}access_token=${encodeURIComponent(pageAccessToken)}`,
    );
    const body = (await response.json()) as TResponse & {
      error?: { message?: string };
    };

    if (!response.ok || isDefined(body.error)) {
      throw new Error(
        body.error?.message ??
          `Meta Graph API request failed with status ${response.status}`,
      );
    }

    return body;
  }
}
