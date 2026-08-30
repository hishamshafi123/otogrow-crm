import { Injectable, NotFoundException } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CompanyWorkspaceEntity } from 'src/modules/company/standard-objects/company.workspace-entity';
import { OpportunityWorkspaceEntity } from 'src/modules/opportunity/standard-objects/opportunity.workspace-entity';
import { type PortalAccessEntity } from 'src/modules/portal/entities/portal-access.entity';
import { QuoteWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote.workspace-entity';

// CUSTOMER is the only closed stage of the standard opportunity pipeline.
const CLOSED_OPPORTUNITY_STAGES = ['CUSTOMER'];

const OPPORTUNITY_STAGE_ORDER = [
  'NEW',
  'SCREENING',
  'MEETING',
  'PROPOSAL',
  'CUSTOMER',
];

export type PortalOpportunityPayload = {
  id: string;
  name: string;
  stage: string;
  amountMicros: number;
  currencyCode: string;
  closeDate: string | null;
};

export type PortalQuotePayload = {
  id: string;
  quoteNumber: string | null;
  status: string;
  totalAmountMicros: number;
  currencyCode: string;
  validUntil: string | null;
};

export type PortalDataPayload = {
  company: { name: string };
  opportunities: PortalOpportunityPayload[];
  quotes: PortalQuotePayload[];
  metrics: {
    openPipelineAmountMicros: number;
    currencyCode: string;
    dealsByStage: { stage: string; count: number }[];
    acceptedQuotesCount: number;
  };
};

@Injectable()
export class PortalDataService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async getPortalData(
    portalAccess: PortalAccessEntity,
  ): Promise<PortalDataPayload> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workspaceId = portalAccess.workspaceId;
        const { companyId } = portalAccess;

        const companyRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            CompanyWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );
        const opportunityRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            OpportunityWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );
        const quoteRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            QuoteWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        const company = await companyRepository.findOne({
          where: { id: companyId },
        });

        if (!isDefined(company)) {
          throw new NotFoundException('Company not found');
        }

        const opportunities = await opportunityRepository.find({
          where: { companyId },
          order: { createdAt: 'DESC' },
        });

        const quotes = await quoteRepository.find({
          where: { companyId },
          order: { createdAt: 'DESC' },
        });

        const openOpportunities = opportunities.filter(
          (opportunity) =>
            !CLOSED_OPPORTUNITY_STAGES.includes(opportunity.stage),
        );

        const currencyCode =
          opportunities.find((opportunity) =>
            isDefined(opportunity.amount?.currencyCode),
          )?.amount?.currencyCode ??
          quotes.find((quote) => isDefined(quote.total?.currencyCode))?.total
            ?.currencyCode ??
          'USD';

        const countByStage = new Map<string, number>();

        for (const opportunity of opportunities) {
          countByStage.set(
            opportunity.stage,
            (countByStage.get(opportunity.stage) ?? 0) + 1,
          );
        }

        const dealsByStage = [...countByStage.entries()]
          .map(([stage, count]) => ({ stage, count }))
          .sort(
            (a, b) =>
              OPPORTUNITY_STAGE_ORDER.indexOf(a.stage) -
              OPPORTUNITY_STAGE_ORDER.indexOf(b.stage),
          );

        return {
          company: { name: company.name ?? '' },
          opportunities: opportunities.map((opportunity) => ({
            id: opportunity.id,
            name: opportunity.name,
            stage: opportunity.stage,
            amountMicros: opportunity.amount?.amountMicros ?? 0,
            currencyCode: opportunity.amount?.currencyCode ?? currencyCode,
            closeDate: isDefined(opportunity.closeDate)
              ? new Date(opportunity.closeDate).toISOString()
              : null,
          })),
          quotes: quotes.map((quote) => ({
            id: quote.id,
            quoteNumber: quote.quoteNumber,
            status: quote.status,
            totalAmountMicros: quote.total?.amountMicros ?? 0,
            currencyCode: quote.total?.currencyCode ?? currencyCode,
            validUntil: quote.validUntil,
          })),
          metrics: {
            openPipelineAmountMicros: openOpportunities.reduce(
              (total, opportunity) =>
                total + (opportunity.amount?.amountMicros ?? 0),
              0,
            ),
            currencyCode,
            dealsByStage,
            acceptedQuotesCount: quotes.filter(
              (quote) => quote.status === 'ACCEPTED',
            ).length,
          },
        };
      },
      buildSystemAuthContext(portalAccess.workspaceId),
    );
  }
}
