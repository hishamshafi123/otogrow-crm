import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThan, type EntityManager } from 'typeorm';
import { isDefined } from 'twenty-shared/utils';
import { z } from 'zod';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { canAccessDeliveryProject } from 'src/modules/delivery/delivery-policy';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import {
  canManageFinance,
  canReadFinance,
} from 'src/modules/delivery/business/delivery-business.policy';
import {
  deliveryCurrencySchema,
  deliveryMoneySchema,
} from 'src/modules/delivery/business/delivery-business.types';
import { DeliveryRevisionEntity } from 'src/modules/delivery/revisions/entities/delivery-revision.entity';
import {
  type DeliveryRevisionsDTO,
  type DeliveryRevisionCostsDTO,
  type DeliveryRevisionCostGroupDTO,
} from 'src/modules/delivery/revisions/delivery-revisions.dto';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

const QUERY = z
  .object({
    taskId: z.uuid(),
    beforeRound: z.number().int().positive().nullish(),
  })
  .strict();
const SAVE = z
  .object({
    taskId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    cause: z.enum([
      'UNCLASSIFIED',
      'INTERNAL_DEFECT',
      'CLIENT_PREFERENCE',
      'SCOPE_CHANGE',
      'OTHER',
    ]),
    effortMinutes: z.number().int().min(0).max(100000).nullable(),
    internalCost: deliveryMoneySchema.nullish(),
    proposedCharge: deliveryMoneySchema.nullish(),
    currency: deliveryCurrencySchema.nullish(),
  })
  .strict();
const COSTS = z
  .object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    projectId: z.uuid().nullish(),
  })
  .strict()
  .refine(
    (input) =>
      input.startDate <= input.endDate &&
      (Date.parse(input.endDate) - Date.parse(input.startDate)) / 86400000 <=
        366,
    'Choose a range of at most 366 days.',
  );
const parse = <TOutput>(
  schema: z.ZodType<TOutput>,
  input: unknown,
): TOutput => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      'Check revision dates, classification, whole minutes and amounts in minor units.',
    );
  return result.data;
};
const structural = (row: DeliveryRevisionEntity) => ({
  revisionCause: row.cause,
  revisionEffortMinutes: isDefined(row.effortMinutes)
    ? String(row.effortMinutes)
    : null,
  revisionInternalCost: isDefined(row.internalCost)
    ? String(row.internalCost)
    : null,
  revisionProposedCharge: String(row.proposedCharge),
  revisionCurrency: row.currency,
  revision: String(row.revision),
});

@Injectable()
export class DeliveryRevisionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly nativeTasks: DeliveryNativeTaskAccessService,
  ) {}
  private async scope(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
  ) {
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    await this.nativeTasks.assert(
      manager,
      workspace,
      { memberId, userWorkspaceId },
      taskId,
      ['id'],
    );
    const task = await manager
      .getRepository(DeliveryTaskEntity)
      .findOneBy({ workspaceId: workspace.id, taskId });
    const project =
      task &&
      (await manager
        .getRepository(DeliveryProjectEntity)
        .findOneBy({ workspaceId: workspace.id, id: task.projectId }));
    if (
      !task ||
      !project ||
      !canAccessDeliveryProject(actor.isManager, memberId, project.memberIds)
    )
      throw new NotFoundException('Task not available.');
    return { actor, task };
  }
  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryRevisionsDTO> {
    const parsed = parse(QUERY, input);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const { actor } = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          parsed.taskId,
        );
        const repository = manager.getRepository(DeliveryRevisionEntity);
        const where = { workspaceId: workspace.id, taskId: parsed.taskId };
        const rows = await repository.find({
          where: {
            ...where,
            ...(parsed.beforeRound
              ? { round: LessThan(parsed.beforeRound) }
              : {}),
          },
          order: { round: 'DESC' },
          take: 21,
        });
        const visible = rows.slice(0, 20);
        const financial = canReadFinance(actor);
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          taskId: parsed.taskId,
          canManage: actor.isManager,
          canReadFinance: financial,
          canManageFinance: canManageFinance(actor),
          total: await repository.countBy(where),
          nextBeforeRound:
            rows.length > 20 ? visible[visible.length - 1].round : null,
          rounds: visible.map((row) => ({
            id: row.id,
            round: row.round,
            revision: row.revision,
            submissionVersion: row.submissionVersion,
            source: row.source,
            reason: row.reason,
            cause: row.cause,
            createdAt: row.createdAt.toISOString(),
            effortMinutes: row.effortMinutes,
            internalCost: financial ? row.internalCost : null,
            proposedCharge: financial ? row.proposedCharge : null,
            currency: financial ? row.currency : null,
          })),
        };
      },
    );
  }
  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parse(SAVE, input);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const { actor, task } = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          parsed.taskId,
        );
        const repository = manager.getRepository(DeliveryRevisionEntity);
        const row = await repository.findOne({
          where: {
            workspaceId: workspace.id,
            taskId: parsed.taskId,
            id: parsed.id,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!row) throw new NotFoundException('Revision round not available.');
        if (row.revision !== parsed.revision)
          throw new ConflictException(
            'Revision details changed. Reload before saving.',
          );
        const hasFinance =
          parsed.internalCost !== undefined ||
          parsed.proposedCharge !== undefined ||
          parsed.currency !== undefined;
        if (hasFinance && !canManageFinance(actor))
          throw new ForbiddenException(
            'Finance editing permission is required.',
          );
        if (
          !actor.isManager &&
          (!canManageFinance(actor) ||
            parsed.cause !== row.cause ||
            parsed.effortMinutes !== row.effortMinutes)
        )
          throw new ForbiddenException(
            'A delivery manager must classify revision effort.',
          );
        const before = structural(row);
        row.cause = parsed.cause;
        row.effortMinutes = parsed.effortMinutes;
        if (parsed.internalCost !== undefined)
          row.internalCost = parsed.internalCost;
        if (parsed.proposedCharge !== undefined)
          row.proposedCharge = parsed.proposedCharge ?? 0;
        if (parsed.currency !== undefined) row.currency = parsed.currency;
        if (
          (row.internalCost !== null || row.proposedCharge > 0) &&
          !row.currency
        )
          throw new BadRequestException(
            'Choose a currency for a recorded cost or proposed charge.',
          );
        row.revision++;
        await repository.save(row);
        const after = structural(row);
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          actorType: 'HUMAN',
          category: 'DELIVERY',
          action: 'REVISION_UPDATED',
          outcome: 'RECORDED',
          summary: 'Updated revision classification, effort or cost.',
          projectId: task.projectId,
          taskId: task.taskId,
          sourceType: 'task',
          sourceId: task.taskId,
          changes: (Object.keys(after) as (keyof typeof after)[])
            .filter((field) => before[field] !== after[field])
            .map((field) => ({
              field,
              before: before[field],
              after: after[field],
            })),
        });
        return true;
      },
    );
  }
  async costs(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryRevisionCostsDTO> {
    const parsed = parse(COSTS, input);
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
        if (!canReadFinance(actor))
          throw new ForbiddenException(
            'Finance access is required to view revision costs.',
          );
        const rows: DeliveryRevisionCostGroupDTO[] = await manager.query(
          `SELECT r."projectId",COALESCE(p.name,'Former project') AS "projectName",r.cause,r.currency,count(*)::int AS rounds,count(*) FILTER(WHERE r."internalCost" IS NULL)::int AS "missingCostCount",count(*) FILTER(WHERE r."effortMinutes" IS NULL)::int AS "missingEffortCount",COALESCE(sum(r."internalCost"),0)::float8 AS "recordedCost",sum(r."proposedCharge")::float8 AS "proposedCharges",COALESCE(sum(r."effortMinutes"),0)::float8 AS "recordedEffortMinutes" FROM core."deliveryRevision" r LEFT JOIN core."deliveryProject" p ON p.id=r."projectId" AND p."workspaceId"=r."workspaceId" WHERE r."workspaceId"=$1 AND r."createdAt">=$2::date AT TIME ZONE 'UTC' AND r."createdAt"<($3::date+1) AT TIME ZONE 'UTC' AND ($4::uuid IS NULL OR r."projectId"=$4) GROUP BY r."projectId",p.name,r.cause,r.currency ORDER BY p.name,r.cause,r.currency LIMIT 501`,
          [
            workspace.id,
            parsed.startDate,
            parsed.endDate,
            parsed.projectId ?? null,
          ],
        );
        if (
          rows.length > 500 ||
          rows.some(
            (row) =>
              ![
                row.recordedCost,
                row.proposedCharges,
                row.recordedEffortMinutes,
              ].every(Number.isSafeInteger),
          )
        )
          throw new BadRequestException(
            'Narrow the date range or select one project for complete revision totals.',
          );
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          groups: rows,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          projectId: parsed.projectId ?? null,
        };
      },
    );
  }
}
