import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import {
  canManageFinance,
  canReadFinance,
} from 'src/modules/delivery/business/delivery-business.policy';
import { DeliveryFinancePeriodEntity } from 'src/modules/delivery/finance/entities/delivery-finance-period.entity';
import { DeliveryFinanceEventEntity } from 'src/modules/delivery/finance/entities/delivery-finance-event.entity';
import {
  financePeriodChangeSchema,
  financePeriodHistorySchema,
  financePeriodQuerySchema,
  financePeriodSummariesSchema,
} from 'src/modules/delivery/finance/delivery-finance-period.policy';
import {
  lockFinancePeriods,
  projectFinancePeriod,
  readFinancePeriod,
} from 'src/modules/delivery/finance/delivery-finance-period.helpers';
import { readFinancePeriodReview } from 'src/modules/delivery/finance/read-delivery-finance-period';
import {
  DELIVERY_FINANCE_HISTORY_PAGE_SIZE,
  parseDeliveryFinance,
} from 'src/modules/delivery/finance/delivery-finance.policy';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import {
  type DeliveryFinancePeriodChangeResultDTO,
  type DeliveryFinancePeriodHistoryDTO,
  type DeliveryFinancePeriodSnapshotDTO,
} from 'src/modules/delivery/finance/delivery-finance-period.dto';

@Injectable()
export class DeliveryFinancePeriodService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
  ) {}
  private async authorize(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manage = false,
  ) {
    await manager.query(
      `SELECT pg_advisory_xact_lock${manage ? '' : '_shared'}(hashtextextended($1,0))`,
      [`delivery:${workspace.id}`],
    );
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (manage ? !canManageFinance(actor) : !canReadFinance(actor))
      throw new ForbiddenException(
        'Your current roles do not allow this finance action.',
      );
    return actor;
  }
  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinancePeriodSnapshotDTO> {
    const fields = parseDeliveryFinance(financePeriodQuerySchema, input);
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
      );
      await lockFinancePeriods(manager, workspace.id, [fields.month], true);
      const review = await readFinancePeriodReview(
        manager,
        workspace.id,
        fields.month,
        fields.afterBlockerId,
      );
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        canManage: canManageFinance(actor),
        ...review,
        canLock:
          canManageFinance(actor) &&
          review.period.status === 'OPEN' &&
          review.blockerCount === 0,
        canReopen: canManageFinance(actor) && review.period.status === 'LOCKED',
      };
    });
  }
  async change(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinancePeriodChangeResultDTO> {
    const fields = parseDeliveryFinance(financePeriodChangeSchema, input);
    const requestHash = financeReviewToken(fields);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      const events = manager.getRepository(DeliveryFinanceEventEntity);
      const [previousRequest]: DeliveryFinanceEventEntity[] =
        await manager.query(
          'SELECT * FROM core."deliveryFinanceEvent" WHERE "workspaceId"=$1 AND "sourceType"=\'PERIOD\' AND "after"->>\'commandId\'=$2 ORDER BY id LIMIT 1',
          [workspace.id, fields.id],
        );
      if (previousRequest) {
        if (
          previousRequest.actorId !== memberId ||
          previousRequest.after.requestHash !== requestHash
        )
          throw new ConflictException(
            'This period request identity was already used for another change.',
          );
        return {
          period: await readFinancePeriod(manager, workspace.id, fields.month),
          replayed: true,
        };
      }
      await lockFinancePeriods(manager, workspace.id, [fields.month]);
      const review = await readFinancePeriodReview(
        manager,
        workspace.id,
        fields.month,
      );
      if (
        fields.revision !== review.period.revision ||
        fields.expectedPreviewToken !== review.previewToken
      )
        throw new ConflictException(
          'This month or its recorded recognition changed. Refresh the complete period review before continuing.',
        );
      if (fields.status === review.period.status)
        throw new ConflictException(
          `Monthly results are already ${fields.status === 'LOCKED' ? 'locked' : 'open'}.`,
        );
      if (
        fields.status === 'LOCKED' &&
        (!fields.acknowledgeLimitations || review.blockerCount > 0)
      )
        throw new BadRequestException(
          'Resolve every draft and pending correction affecting this month, then acknowledge the management-review limitations before locking.',
        );
      const members = await this.access.listActiveMembers(
        workspace.id,
        manager,
      );
      const actorName =
        members.find((member) => member.memberId === memberId)?.name ??
        'Team member';
      const repository = manager.getRepository(DeliveryFinancePeriodEntity);
      const saved = await repository.save(
        repository.create({
          ...(review.period.id ? { id: review.period.id } : {}),
          workspaceId: workspace.id,
          month: fields.month,
          revision: review.period.revision + 1,
          status: fields.status,
          changedBy: memberId,
          changedByName: actorName,
          reason: fields.reason,
        }),
      );
      const period = projectFinancePeriod(fields.month, saved);
      const action =
        fields.status === 'LOCKED'
          ? 'FINANCE_PERIOD_LOCKED'
          : 'FINANCE_PERIOD_REOPENED';
      await events.save({
        workspaceId: workspace.id,
        sourceType: 'PERIOD',
        sourceId: saved.id,
        actorId: memberId,
        actorName,
        action,
        revision: saved.revision,
        reason: fields.reason,
        before: { ...review.period },
        after: {
          ...period,
          commandId: fields.id,
          requestHash,
          recognitionHash: review.recognitionHash,
          summaries: review.summaries,
          limitations: review.limitations,
          blockerCount: review.blockerCount,
        },
      });
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'BUSINESS',
        action,
        outcome: 'RECORDED',
        summary:
          fields.status === 'LOCKED'
            ? 'Locked reviewed monthly management results.'
            : 'Reopened monthly management results with a reason.',
        sourceType: 'finance-period',
        sourceId: saved.id,
        changes: [
          {
            field: 'state',
            before: review.period.status,
            after: period.status,
          },
          {
            field: 'revision',
            before: String(review.period.revision),
            after: String(period.revision),
          },
          { field: 'financeMonth', before: fields.month, after: fields.month },
        ],
      });
      return { period, replayed: false };
    });
  }
  async history(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinancePeriodHistoryDTO> {
    const fields = parseDeliveryFinance(financePeriodHistorySchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId);
      await lockFinancePeriods(manager, workspace.id, [fields.month], true);
      const period = await readFinancePeriod(
        manager,
        workspace.id,
        fields.month,
      );
      if (
        fields.beforeId &&
        (!period.id ||
          !(await manager.getRepository(DeliveryFinanceEventEntity).existsBy({
            workspaceId: workspace.id,
            sourceType: 'PERIOD',
            sourceId: period.id,
            id: fields.beforeId,
          })))
      )
        throw new BadRequestException(
          'This period history cursor is not valid for the selected month.',
        );
      const rows: DeliveryFinanceEventEntity[] = period.id
        ? await manager.query(
            'SELECT * FROM core."deliveryFinanceEvent" event WHERE event."workspaceId"=$1 AND event."sourceType"=\'PERIOD\' AND event."sourceId"=$2 AND ($3::uuid IS NULL OR (event."createdAt",event.id)<(SELECT cursor."createdAt",cursor.id FROM core."deliveryFinanceEvent" cursor WHERE cursor."workspaceId"=$1 AND cursor."sourceType"=\'PERIOD\' AND cursor."sourceId"=$2 AND cursor.id=$3)) ORDER BY event."createdAt" DESC,event.id DESC LIMIT $4',
            [
              workspace.id,
              period.id,
              fields.beforeId,
              DELIVERY_FINANCE_HISTORY_PAGE_SIZE + 1,
            ],
          )
        : [];
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        month: fields.month,
        events: rows.slice(0, DELIVERY_FINANCE_HISTORY_PAGE_SIZE).map((row) => {
          const summaries = financePeriodSummariesSchema.safeParse(
            row.after.summaries,
          );
          return {
            id: row.id,
            action: [
              'FINANCE_PERIOD_LOCKED',
              'FINANCE_PERIOD_REOPENED',
            ].includes(row.action)
              ? row.action
              : 'UNKNOWN',
            beforeStatus:
              row.before?.status === 'OPEN' || row.before?.status === 'LOCKED'
                ? row.before.status
                : 'UNKNOWN',
            afterStatus:
              row.after.status === 'OPEN' || row.after.status === 'LOCKED'
                ? row.after.status
                : 'UNKNOWN',
            revision: row.revision,
            reason: row.reason,
            actorId: row.actorId,
            actorName: row.actorName,
            createdAt: row.createdAt.toISOString(),
            recognitionHash:
              typeof row.after.recognitionHash === 'string' &&
              /^[a-f0-9]{64}$/.test(row.after.recognitionHash)
                ? row.after.recognitionHash
                : '',
            summaries: summaries.success ? summaries.data : [],
          };
        }),
        nextBeforeId:
          rows.length > DELIVERY_FINANCE_HISTORY_PAGE_SIZE
            ? rows[DELIVERY_FINANCE_HISTORY_PAGE_SIZE - 1].id
            : null,
      };
    });
  }
}
