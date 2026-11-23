import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryMemberEntity } from 'src/modules/delivery/entities/delivery-member.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { canReadFinance } from 'src/modules/delivery/business/delivery-business.policy';
import { deliveryCurrencySchema } from 'src/modules/delivery/business/delivery-business.types';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { readFinancePeriod } from 'src/modules/delivery/finance/delivery-finance-period.helpers';
import { readFinanceForecastCash } from 'src/modules/delivery/finance/read-delivery-forecast-cash';
import {
  financeReportingClock,
  readFinanceReportingClocks,
} from 'src/modules/delivery/finance/delivery-finance-reporting-date';
import { FOUNDER_SOURCE_LIMIT } from 'src/modules/delivery/founder/delivery-founder.policy';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type DeliveryFounderPerformanceSnapshotDTO } from 'src/modules/delivery/founder/performance/delivery-founder-performance.dto';
import {
  FOUNDER_PERFORMANCE_SOURCE_LIMIT,
  calculateFounderPerformance,
  parseFounderPerformance,
  performancePeriod,
  previousPerformanceMonth,
  type PerformanceAllocation,
  type PerformanceEntry,
  type PerformanceRevision,
  type PerformanceTask,
} from 'src/modules/delivery/founder/performance/delivery-founder-performance.policy';

@Injectable()
export class DeliveryFounderPerformanceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
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
        `${label} exceeds the performance reporting limit. No sources were truncated.`,
      );
    return rows;
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    now = new Date(),
  ): Promise<DeliveryFounderPerformanceSnapshotDTO> {
    const query = parseFounderPerformance(input);
    const previousMonth = previousPerformanceMonth(query.month);
    return readDeliverySnapshot(
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
            'Company performance requires current workspace administrator access.',
          );
        const financial = canReadFinance(actor);
        const period = performancePeriod(query.month, query.timezone);
        const projects = await manager
          .getRepository(DeliveryProjectEntity)
          .find({
            where: { workspaceId: workspace.id },
            order: { name: 'ASC', id: 'ASC' },
          });
        if (projects.length > FOUNDER_SOURCE_LIMIT)
          throw new BadRequestException(
            'The project directory exceeds the performance reporting limit.',
          );
        const activeMembers = await this.access.listActiveMembers(
          workspace.id,
          manager,
        );
        if (activeMembers.length > FOUNDER_SOURCE_LIMIT)
          throw new BadRequestException(
            'The active team exceeds the performance reporting limit.',
          );
        const profiles = await manager
          .getRepository(DeliveryMemberEntity)
          .findBy({ workspaceId: workspace.id });
        const members = activeMembers.map((member) => ({
          id: member.memberId,
          name: member.name,
          roleLabel:
            profiles.find(
              (profile) => profile.workspaceMemberId === member.memberId,
            )?.roleLabel ?? '',
        }));
        const tasks = await this.bounded<PerformanceTask>(
          manager,
          `SELECT task.id,delivery."projectId",task."assigneeId",COALESCE(delivery.details->>'state','') AS state,to_char(task."dueAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "dueAt",CASE WHEN jsonb_typeof(delivery.details->'submissions')='array' THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('version',submission.value->'version','decision',submission.value->'decision','reviewedAt',submission.value->'reviewedAt') ORDER BY submission.position) FROM jsonb_array_elements(delivery.details->'submissions') WITH ORDINALITY AS submission(value,position)),'[]'::jsonb) ELSE NULL END AS submissions FROM core."deliveryTask" delivery JOIN ${this.delivery.schema(workspace)}.task task ON task.id=delivery."taskId" WHERE delivery."workspaceId"=$1 AND task."deletedAt" IS NULL ORDER BY task.id`,
          [workspace.id],
          'Current delivery tasks',
        );
        const revisions = await this.bounded<PerformanceRevision>(
          manager,
          `SELECT "taskId","projectId",cause,to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM core."deliveryRevision" WHERE "workspaceId"=$1 AND "createdAt">=$2::timestamptz AND "createdAt"<$3::timestamptz ORDER BY id`,
          [workspace.id, period.periodStart, period.periodEnd],
          'Selected-month revision evidence',
          FOUNDER_PERFORMANCE_SOURCE_LIMIT,
        );
        let entries: PerformanceEntry[] = [];
        let allocations: PerformanceAllocation[] = [];
        let periodStatus = 'RESTRICTED';
        const cashData: Record<
          string,
          Awaited<ReturnType<typeof readFinanceForecastCash>>
        > = {};
        const cashReporting: Record<
          string,
          { businessDate: string; confirmed: boolean }
        > = {};
        const sourceWarnings: string[] = [];
        if (financial) {
          periodStatus = (
            await readFinancePeriod(manager, workspace.id, query.month)
          ).status;
          entries = await this.bounded<PerformanceEntry>(
            manager,
            `SELECT id,month,currency,kind,category,status,"amountMicros","sourceType","sourcePlan"->>'memberId' AS "sourceMemberId" FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND month=ANY($2::text[]) AND status<>'VOID' ORDER BY id`,
            [workspace.id, [query.month, previousMonth]],
            'Selected monthly finance entries',
          );
          allocations = entries.length
            ? await this.bounded<PerformanceAllocation>(
                manager,
                `SELECT allocation."entryId",allocation."projectId",allocation."amountMicros" FROM core."deliveryFinanceAllocation" allocation JOIN core."deliveryFinanceEntry" entry ON entry."workspaceId"=allocation."workspaceId" AND entry.id=allocation."entryId" WHERE allocation."workspaceId"=$1 AND entry.month=ANY($2::text[]) AND entry.status='POSTED' ORDER BY allocation.id`,
                [workspace.id, [query.month, previousMonth]],
                'Selected monthly finance allocations',
                FOUNDER_PERFORMANCE_SOURCE_LIMIT,
              )
            : [];
          const currencyRows = await this.bounded<{ currency: string }>(
            manager,
            `SELECT DISTINCT currency FROM (SELECT currency FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND month=ANY($2::text[]) UNION SELECT currency FROM core."deliveryFinanceSource" WHERE "workspaceId"=$1 UNION SELECT item->>'currency' AS currency FROM core."deliveryOperations",jsonb_array_elements(CASE WHEN jsonb_typeof(state#>'{business,records}')='array' THEN state#>'{business,records}' ELSE '[]'::jsonb END) item WHERE "workspaceId"=$1 AND item->>'kind'='FINANCE') sources WHERE currency IS NOT NULL ORDER BY currency`,
            [workspace.id, [query.month, previousMonth]],
            'Financial currencies',
          );
          const reportingClocks = await readFinanceReportingClocks(
            manager,
            workspace.id,
            now,
          );
          for (const row of currencyRows) {
            if (query.currency && row.currency !== query.currency) continue;
            if (!deliveryCurrencySchema.safeParse(row.currency).success) {
              sourceWarnings.push('INVALID_FINANCE_CURRENCY');
              continue;
            }
            const clock = financeReportingClock(reportingClocks, row.currency);
            cashReporting[row.currency] = {
              businessDate: clock.businessDate,
              confirmed: clock.confirmed,
            };
            cashData[row.currency] = await readFinanceForecastCash(
              manager,
              workspace.id,
              row.currency,
              clock.businessDate,
            );
          }
        } else sourceWarnings.push('FINANCE_READ_REQUIRED');
        const calculated = calculateFounderPerformance({
          month: query.month,
          previousMonth,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          currency: query.currency,
          canReadFinance: financial,
          periodStatus,
          projects: projects.map((project) => ({
            id: project.id,
            name: project.name,
            companyId: project.companyId,
            memberIds: project.memberIds,
          })),
          members,
          entries,
          allocations,
          tasks,
          revisions,
          cash: cashData,
          cashReporting,
          afterProjectId: query.afterProjectId,
          afterMemberId: query.afterMemberId,
          now,
        });
        const verified = await this.delivery.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        if (!verified.isAdmin || canReadFinance(verified) !== financial)
          throw new ForbiddenException(
            'Company performance access changed. Refresh before continuing.',
          );
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          observedAt: now.toISOString(),
          month: query.month,
          previousMonth,
          timezone: query.timezone,
          currency: query.currency,
          canReadFinance: financial,
          projects: projects.map(({ id, name }) => ({ id, name })),
          ...calculated,
          warnings: [
            ...new Set([...calculated.warnings, ...sourceWarnings]),
          ].sort(),
        };
      },
    );
  }
}
