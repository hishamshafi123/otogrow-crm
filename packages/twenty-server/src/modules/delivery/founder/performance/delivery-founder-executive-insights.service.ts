import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, type EntityManager } from 'typeorm';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { OpportunityWorkspaceEntity } from 'src/modules/opportunity/standard-objects/opportunity.workspace-entity';
import { QuoteWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote.workspace-entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { canReadFinance } from 'src/modules/delivery/business/delivery-business.policy';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { FOUNDER_SOURCE_LIMIT } from 'src/modules/delivery/founder/delivery-founder.policy';
import {
  type DeliveryFounderExecutiveInsightsDTO,
  type DeliveryFounderSalesFunnelDTO,
} from 'src/modules/delivery/founder/performance/delivery-founder-executive-insights.dto';
import {
  aggregateCurrencyTrends,
  aggregateInboxSla,
  aggregateRenewalAlerts,
  aggregateSalesFunnel,
  parseExecutiveInsights,
  recentPerformanceMonths,
  type FunnelOpportunitySource,
  type FunnelQuoteSource,
  type InboxReplySource,
  type RenewalSourcePeriod,
  type TrendSourceEntry,
} from 'src/modules/delivery/founder/performance/delivery-founder-executive-insights.policy';

const CRM_FUNNEL_LIMIT = 500;

@Injectable()
export class DeliveryFounderExecutiveInsightsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly orm: GlobalWorkspaceOrmManager,
  ) {}

  private async bounded<TSource>(
    manager: EntityManager,
    sql: string,
    parameters: unknown[],
    label: string,
    limit = FOUNDER_SOURCE_LIMIT,
  ): Promise<TSource[]> {
    const rows = await manager.query<TSource[]>(
      `${sql} LIMIT $${parameters.length + 1}`,
      [...parameters, limit + 1],
    );
    if (rows.length > limit)
      throw new BadRequestException(
        `${label} exceeds the executive insights limit. No sources were truncated.`,
      );
    return rows;
  }

  private async readSalesFunnel(
    auth: WorkspaceAuthContext | null,
    currencyFilter: string | null,
    now: Date,
  ): Promise<{ funnel: DeliveryFounderSalesFunnelDTO; warnings: string[] }> {
    const restrictedFunnel: DeliveryFounderSalesFunnelDTO = {
      restricted: true,
      totalOpenDeals: 0,
      wonDealsCount: 0,
      openValuesByCurrency: [],
      stages: [],
      expiringQuotesCount: 0,
      expiringQuotes: [],
    };
    if (!auth) {
      return {
        funnel: restrictedFunnel,
        warnings: ['CRM_PIPELINE_RESTRICTED'],
      };
    }

    try {
      return await this.orm.executeInWorkspaceContext(async () => {
        const context = getWorkspaceContext();
        if (context.authContext.type !== 'user') {
          return {
            funnel: restrictedFunnel,
            warnings: ['CRM_PIPELINE_RESTRICTED'],
          };
        }
        const permissions = resolveRolePermissionConfig(context);
        if (!permissions) {
          return {
            funnel: restrictedFunnel,
            warnings: ['CRM_PIPELINE_RESTRICTED'],
          };
        }

        const opportunityRepository = await this.orm.getRepository(
          auth.workspace.id,
          OpportunityWorkspaceEntity,
          permissions,
        );
        const rawDeals = await opportunityRepository.find({
          select: { id: true, stage: true, amount: true },
          order: { updatedAt: 'DESC', id: 'ASC' },
          take: CRM_FUNNEL_LIMIT + 1,
        });
        const warnings: string[] = [];
        if (rawDeals.length > CRM_FUNNEL_LIMIT) {
          warnings.push('CRM_PIPELINE_BOUNDED');
        }
        const opportunities: FunnelOpportunitySource[] = rawDeals
          .slice(0, CRM_FUNNEL_LIMIT)
          .map((deal) => ({
            id: deal.id,
            stage: deal.stage,
            amountMicros:
              deal.amount?.amountMicros !== undefined &&
              deal.amount?.amountMicros !== null
                ? String(deal.amount.amountMicros)
                : null,
            currencyCode: deal.amount?.currencyCode ?? null,
          }));

        const quoteRepository = await this.orm.getRepository(
          auth.workspace.id,
          QuoteWorkspaceEntity,
          permissions,
        );
        const rawQuotes = await quoteRepository.find({
          where: { status: In(['DRAFT', 'SENT']) },
          select: {
            id: true,
            quoteNumber: true,
            status: true,
            validUntil: true,
            total: true,
          },
          order: { validUntil: 'ASC', id: 'ASC' },
          take: CRM_FUNNEL_LIMIT + 1,
        });
        if (rawQuotes.length > CRM_FUNNEL_LIMIT) {
          warnings.push('CRM_QUOTES_BOUNDED');
        }
        const quotes: FunnelQuoteSource[] = rawQuotes
          .slice(0, CRM_FUNNEL_LIMIT)
          .map((quote) => ({
            id: quote.id,
            quoteNumber: quote.quoteNumber,
            status: quote.status,
            validUntil: quote.validUntil,
            totalAmountMicros:
              quote.total?.amountMicros !== undefined &&
              quote.total?.amountMicros !== null
                ? String(quote.total.amountMicros)
                : null,
            currencyCode: quote.total?.currencyCode ?? null,
          }));

        return {
          funnel: aggregateSalesFunnel({
            opportunities,
            quotes,
            currencyFilter,
            now,
          }),
          warnings,
        };
      }, auth);
    } catch {
      return {
        funnel: restrictedFunnel,
        warnings: ['CRM_PIPELINE_RESTRICTED'],
      };
    }
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    auth: WorkspaceAuthContext | null = null,
    now = new Date(),
  ): Promise<DeliveryFounderExecutiveInsightsDTO> {
    const query = parseExecutiveInsights(input);
    const trendMonths = recentPerformanceMonths(query.month, query.months);

    const coreData = await readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const actor = await this.delivery.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        if (!actor.isAdmin)
          throw new ForbiddenException(
            'Executive insights require current workspace administrator access.',
          );
        const financial = canReadFinance(actor);
        const warnings: string[] = [];

        let entries: TrendSourceEntry[] = [];
        if (financial) {
          entries = await this.bounded<TrendSourceEntry>(
            manager,
            `SELECT month,currency,kind,status,"amountMicros" FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND month=ANY($2::text[]) AND status<>'VOID' ORDER BY month,id`,
            [workspace.id, trendMonths],
            'Multi-month finance trend entries',
          );
        } else {
          warnings.push('FINANCE_READ_REQUIRED');
        }

        const periods = await this.bounded<RenewalSourcePeriod>(
          manager,
          `SELECT period.id AS "periodId",period."projectId",project.name AS "projectName",project."companyId",period.label,period.billing,to_char(period."endDateExclusive",'YYYY-MM-DD') AS "endDateExclusive",period.state FROM core."deliveryCommitmentPeriod" period JOIN core."deliveryProject" project ON project."workspaceId"=period."workspaceId" AND project.id=period."projectId" WHERE period."workspaceId"=$1 AND period.state<>'ARCHIVED' AND period."endDateExclusive" IS NOT NULL ORDER BY period."endDateExclusive" ASC,period.id ASC`,
          [workspace.id],
          'Commitment renewal periods',
        );

        const connectedCountRows = await manager.query<{ count: number }[]>(
          `SELECT count(*)::int AS count FROM core."deliveryInboxBinding" WHERE "workspaceId"=$1 AND enabled=true`,
          [workspace.id],
        );
        const connectedThreadsCount = Number(connectedCountRows[0]?.count ?? 0);

        const inboxReplies = await this.bounded<InboxReplySource>(
          manager,
          `SELECT reply.id AS "replyId",reply."conversationId",binding."projectId",project.name AS "projectName",reply.status,to_char(reply."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",reply.problem FROM core."deliveryInboxReply" reply JOIN core."deliveryInboxBinding" binding ON binding."workspaceId"=reply."workspaceId" AND binding.id=reply."bindingId" JOIN core."deliveryProject" project ON project."workspaceId"=binding."workspaceId" AND project.id=binding."projectId" WHERE reply."workspaceId"=$1 AND reply.status IN ('GENERATING','DRAFT','QUEUED','SENDING','FAILED','UNCERTAIN') ORDER BY reply."createdAt" ASC,reply.id ASC`,
          [workspace.id],
          'Pending client inbox replies',
        );

        const verified = await this.delivery.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        if (!verified.isAdmin || canReadFinance(verified) !== financial)
          throw new ForbiddenException(
            'Executive insights access changed. Refresh before continuing.',
          );

        const trendResult = financial
          ? aggregateCurrencyTrends({
              months: trendMonths,
              currencyFilter: query.currency,
              entries,
            })
          : { trends: [], warnings: [] };

        return {
          financial,
          trends: trendResult.trends,
          renewals: aggregateRenewalAlerts({ periods, now }),
          inboxSla: aggregateInboxSla({
            connectedThreadsCount,
            replies: inboxReplies,
            now,
          }),
          warnings: [...warnings, ...trendResult.warnings],
        };
      },
    );

    const salesResult = await this.readSalesFunnel(auth, query.currency, now);

    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      observedAt: now.toISOString(),
      month: query.month,
      timezone: query.timezone,
      currency: query.currency,
      canReadFinance: coreData.financial,
      trendMonths,
      trends: coreData.trends,
      salesFunnel: salesResult.funnel,
      renewals: coreData.renewals,
      inboxSla: coreData.inboxSla,
      warnings: [
        ...new Set([...coreData.warnings, ...salesResult.warnings]),
      ].sort(),
    };
  }
}
