import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { isNonEmptyString } from '@sniptt/guards';
import { createSsrfSafeAgent } from 'src/engine/core-modules/secure-http-client/utils/create-ssrf-safe-agent.util';
import {
  competitorXPageUrl,
  competitorXReadBound,
} from '../delivery-competitor.policy';
import { parseCompetitorXPage } from '../delivery-competitor-x.parser';
import {
  type CompetitorDataTariff,
  type CompetitorPage,
  type CompetitorXPageInput,
} from '../delivery-competitor.types';

export type CompetitorReadDispatch = (
  maximumCostMicros: string,
  perform: () => Promise<CompetitorPage>,
) => Promise<CompetitorPage>;
export type CompetitorCollectionFailure =
  | 'CONFIGURATION_REQUIRED'
  | 'UNKNOWN_TARIFF'
  | 'READ_ALREADY_DISPATCHED'
  | 'AUTHENTICATION_REQUIRED'
  | 'ACCESS_DENIED'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE';
export class CompetitorCollectionError extends Error {
  constructor(
    readonly code: CompetitorCollectionFailure,
    readonly costUncertain: boolean,
    readonly retryAfterMilliseconds: number | null = null,
  ) {
    super(code);
    this.name = 'CompetitorCollectionError';
  }
}

@Injectable()
export class DeliveryCompetitorXTransport {
  async collectPage(
    input: CompetitorXPageInput,
    configuration: { accessToken: string; tariff: CompetitorDataTariff | null },
    dispatch: CompetitorReadDispatch,
  ): Promise<CompetitorPage> {
    if (
      !isNonEmptyString(configuration.accessToken) ||
      configuration.accessToken.length > 16384 ||
      /\s/.test(configuration.accessToken)
    )
      throw new CompetitorCollectionError('CONFIGURATION_REQUIRED', false);
    const url = competitorXPageUrl(input);
    const maximumCost = competitorXReadBound(
      input.limit,
      false,
      configuration.tariff,
    );
    if (maximumCost === null)
      throw new CompetitorCollectionError('UNKNOWN_TARIFF', false);
    let requested = false;
    return dispatch(maximumCost, async () => {
      // A dispatcher retry needs a new reservation; one permit cannot pay for another HTTP attempt.
      if (requested)
        throw new CompetitorCollectionError('READ_ALREADY_DISPATCHED', false);
      requested = true;
      let data: unknown;
      try {
        const response = await axios.get<unknown>(url.toString(), {
          headers: { Authorization: `Bearer ${configuration.accessToken}` },
          httpsAgent: createSsrfSafeAgent('https'),
          maxRedirects: 0,
          timeout: 20000,
          maxContentLength: 1048576,
          maxBodyLength: 1048576,
          responseType: 'json',
        });
        data = response.data;
      } catch (error) {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : null;
        const rawRetry = axios.isAxiosError(error)
          ? error.response?.headers['retry-after']
          : null;
        const retryAfterMilliseconds =
          typeof rawRetry === 'string' && /^\d{1,5}$/.test(rawRetry)
            ? Math.min(Number(rawRetry) * 1000, 86400000)
            : null;
        const code: CompetitorCollectionFailure =
          status === 401
            ? 'AUTHENTICATION_REQUIRED'
            : status === 403
              ? 'ACCESS_DENIED'
              : status === 429
                ? 'RATE_LIMITED'
                : 'PROVIDER_UNAVAILABLE';
        throw new CompetitorCollectionError(code, true, retryAfterMilliseconds);
      }
      try {
        return parseCompetitorXPage(data, input, new Date().toISOString());
      } catch {
        throw new CompetitorCollectionError('INVALID_RESPONSE', true);
      }
    });
  }
}
