import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm';
import { z } from 'zod';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import {
  DeliveryNativeTaskPermissionDeniedException,
  type DeliveryNativeTaskVisibility,
} from 'src/modules/delivery/native-task-visibility';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { canAccessDeliveryProject } from 'src/modules/delivery/delivery-policy';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import {
  newDeliveryOperations,
  type DeliveryOperations,
} from 'src/modules/delivery/operations/delivery-operations.types';
import { readDeliveryOperations } from 'src/modules/delivery/read-delivery-snapshot';
import { type ClientEngagement } from 'src/modules/delivery/clients/delivery-clients.types';
import { DeliveryCommitmentPeriodEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-period.entity';
import { DeliveryCommitmentLineEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-line.entity';
import { DeliveryCommitmentAllocationEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-allocation.entity';
import { DeliveryCommitmentEventEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-event.entity';
import {
  commitmentAssignSchema,
  commitmentLineSchema,
  commitmentPeriodSchema,
  commitmentPeriodStateSchema,
  commitmentRemoveSchema,
  commitmentOrphanCleanupSchema,
  commitmentsInputSchema,
  type CommitmentChange,
} from 'src/modules/delivery/commitments/delivery-commitments.types';
import {
  type DeliveryCommitmentsDTO,
  type DeliveryCommitmentLineDTO,
  type DeliveryCommitmentTaskOptionDTO,
  type DeliveryCommitmentOrphanCleanupResultDTO,
} from 'src/modules/delivery/commitments/delivery-commitments.dto';
import {
  commitmentCredit,
  commitmentCleanupRequestHash,
} from 'src/modules/delivery/commitments/delivery-commitments.policy';
import {
  recordDeliveryCommitment,
  syncDeliveryCommitment,
} from 'src/modules/delivery/commitments/record-delivery-commitment';

type Context = {
  manager: EntityManager;
  operations: DeliveryOperations;
  engagement: ClientEngagement;
  canManage: boolean;
  policyScope: string;
};
type AllocationWithTask = DeliveryCommitmentAllocationEntity & {
  liveDetails: Pick<DeliveryDetails, 'state' | 'submissions'> | null;
};
const parseInput = <TOutput>(
  schema: z.ZodType<TOutput>,
  input: unknown,
): TOutput => {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      parsed.error.issues.map((issue) => issue.message).join(' '),
    );
  return parsed.data;
};
const cursorSchema = z
  .object({
    version: z.literal(2),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    workspaceId: z.uuid(),
    periodId: z.uuid(),
    kind: z.enum(['allocations', 'history', 'orphans']),
    id: z.uuid(),
    at: z.iso.datetime().optional(),
  })
  .strict();
const encodeCursor = (input: z.infer<typeof cursorSchema>) =>
  Buffer.from(JSON.stringify(input)).toString('base64url');
const decodeCursor = (
  value: string | null | undefined,
  workspaceId: string,
  periodId: string,
  kind: 'allocations' | 'history' | 'orphans',
  scope: string,
) => {
  if (!value) return null;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString()),
    );
    if (
      parsed.workspaceId !== workspaceId ||
      parsed.scope !== scope ||
      parsed.periodId !== periodId ||
      parsed.kind !== kind ||
      (kind === 'history' && !parsed.at)
    )
      throw new Error();
    return parsed;
  } catch {
    throw new ConflictException(
      'Commitment page access changed. Return to the first page of this period.',
    );
  }
};
const changesBetween = (
  before: Record<string, string | number | null | undefined>,
  after: Record<string, string | number | null>,
): CommitmentChange[] =>
  Object.keys(after)
    .filter((field) => before[field] !== after[field])
    .map((field) => ({
      field,
      before: before[field] == null ? null : String(before[field]),
      after: after[field] == null ? null : String(after[field]),
    }));

@Injectable()
export class DeliveryCommitmentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly nativeTasks: DeliveryNativeTaskAccessService,
  ) {}

  private async scope(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    engagementId: string,
    operations: DeliveryOperations,
    manager: EntityManager,
    write = false,
  ): Promise<Context> {
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (write && !actor.isManager)
      throw new ForbiddenException(
        'A delivery manager is required to change commitments.',
      );
    const engagement = operations.clients?.engagements.find(
      (item) => item.id === engagementId,
    );
    if (!engagement) throw new NotFoundException('Engagement not found.');
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({
        id: engagement.projectId,
        workspaceId: workspace.id,
        companyId: engagement.companyId,
      });
    if (
      !project ||
      !canAccessDeliveryProject(actor.isManager, memberId, project.memberIds)
    )
      throw new ForbiddenException('This engagement is not available to you.');
    const companies: { id: string }[] = await manager.query(
      `SELECT id FROM ${this.delivery.schema(workspace)}.company WHERE id=$1 AND "deletedAt" IS NULL`,
      [engagement.companyId],
    );
    if (!companies.length) throw new NotFoundException('Client not found.');
    return {
      manager,
      operations,
      engagement,
      canManage: actor.isManager,
      policyScope: financeReviewToken({
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        engagementId,
        projectId: project.id,
        companyId: project.companyId,
        projectRevision: project.revision,
        memberIds: [...project.memberIds].sort(),
        capabilities: [...actor.capabilities].sort(),
        roleIds: [...actor.roleIds].sort(),
      }),
    };
  }

  async engagements(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    return readDeliveryOperations(
      this.dataSource,
      workspace.id,
      async (operations, manager) => {
        const actor = await this.delivery.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        const projects = await manager
          .getRepository(DeliveryProjectEntity)
          .findBy({ workspaceId: workspace.id });
        const companies: { id: string }[] = await manager.query(
          `SELECT id FROM ${this.delivery.schema(workspace)}.company WHERE "deletedAt" IS NULL`,
        );
        const clients = new Set(companies.map((item) => item.id));
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          engagements: (operations.clients?.engagements ?? [])
            .filter(
              (engagement) =>
                clients.has(engagement.companyId) &&
                projects.some(
                  (project) =>
                    project.id === engagement.projectId &&
                    project.companyId === engagement.companyId &&
                    canAccessDeliveryProject(
                      actor.isManager,
                      memberId,
                      project.memberIds,
                    ),
                ),
            )
            .map(({ id, name, projectId, billing }) => ({
              id,
              name,
              projectId,
              billing,
            })),
        };
      },
    );
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryCommitmentsDTO> {
    const parsed = parseInput(commitmentsInputSchema, input);
    return readDeliveryOperations(
      this.dataSource,
      workspace.id,
      async (operations, manager) =>
        this.read(
          workspace,
          memberId,
          userWorkspaceId,
          parsed,
          await this.scope(
            workspace,
            memberId,
            userWorkspaceId,
            parsed.engagementId,
            operations,
            manager,
          ),
        ),
    );
  }

  private async periods(
    manager: EntityManager,
    workspaceId: string,
    engagement: ClientEngagement,
  ) {
    return manager.getRepository(DeliveryCommitmentPeriodEntity).find({
      where: {
        workspaceId,
        engagementId: engagement.id,
        projectId: engagement.projectId,
        clientId: engagement.companyId,
      },
      order: { startDate: 'DESC', id: 'DESC' },
    });
  }

  private async allocationRows(
    workspace: WorkspaceEntity,
    manager: EntityManager,
    periodId: string,
  ): Promise<AllocationWithTask[]> {
    return manager.query(
      `SELECT a.*, CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('state',d.details->'state','submissions',CASE WHEN jsonb_array_length(d.details->'submissions')>0 THEN jsonb_build_array(d.details->'submissions'->-1) ELSE '[]'::jsonb END) END AS "liveDetails" FROM core."deliveryCommitmentAllocation" a JOIN core."deliveryCommitmentPeriod" p ON p.id=a."periodId" AND p."workspaceId"=a."workspaceId" LEFT JOIN core."deliveryTask" d ON d."workspaceId"=a."workspaceId" AND d."taskId"=a."taskId" AND d."projectId"=p."projectId" LEFT JOIN ${this.delivery.schema(workspace)}.task t ON t.id=d."taskId" AND t."deletedAt" IS NULL WHERE a."workspaceId"=$1 AND a."periodId"=$2 ORDER BY a.id`,
      [workspace.id, periodId],
    );
  }

  private counts(
    lines: DeliveryCommitmentLineEntity[],
    allocations: AllocationWithTask[],
    operations: DeliveryOperations,
  ): DeliveryCommitmentLineDTO[] {
    const fulfilments = new Map(
      operations.fulfilments.map((item) => [item.taskId, item]),
    );
    return lines.map((line) => {
      const assigned = allocations.filter(
        (item) => item.lineId === line.id && item.state !== 'REMOVED',
      );
      const fulfilledQuantity = assigned.filter(
        (item) =>
          commitmentCredit(item, item.liveDetails, fulfilments.get(item.taskId))
            .credited,
      ).length;
      return {
        id: line.id,
        periodId: line.periodId,
        label: line.label,
        unit: line.unit,
        revision: line.revision,
        promisedQuantity: line.promisedQuantity,
        assignedQuantity: assigned.length,
        fulfilledQuantity,
        remainingQuantity: Math.max(
          0,
          line.promisedQuantity - fulfilledQuantity,
        ),
        overdeliveredQuantity: Math.max(
          0,
          fulfilledQuantity - line.promisedQuantity,
        ),
      };
    });
  }

  async portalSummary(
    workspace: WorkspaceEntity,
    engagement: ClientEngagement,
    operations: DeliveryOperations,
    manager: EntityManager,
  ) {
    const periods = await this.periods(manager, workspace.id, engagement);
    return Promise.all(
      periods.map(async (period) => {
        const lines = await manager
          .getRepository(DeliveryCommitmentLineEntity)
          .findBy({ workspaceId: workspace.id, periodId: period.id });
        const allocations = await this.allocationRows(
          workspace,
          manager,
          period.id,
        );
        return {
          ...this.periodDTO(period),
          lines: this.counts(lines, allocations, operations).map(
            ({
              revision: _revision,
              assignedQuantity: _assignedQuantity,
              ...line
            }) => line,
          ),
        };
      }),
    );
  }

  private periodDTO(period: DeliveryCommitmentPeriodEntity) {
    return {
      id: period.id,
      label: period.label,
      billing: period.billing,
      startDate: period.startDate,
      endDateExclusive: period.endDateExclusive,
      timezone: period.timezone,
      state: period.state,
      revision: period.revision,
    };
  }

  private async taskVisibility(
    workspace: WorkspaceEntity,
    manager: EntityManager,
    memberId: string,
    userWorkspaceId: string,
  ) {
    try {
      return await this.nativeTasks.visibility(
        manager,
        workspace,
        { memberId, userWorkspaceId },
        ['id', 'title'],
      );
    } catch (error) {
      if (error instanceof DeliveryNativeTaskPermissionDeniedException)
        return null;
      throw error;
    }
  }

  private taskPredicate(
    workspace: WorkspaceEntity,
    visibility: DeliveryNativeTaskVisibility,
    taskIdSql: string,
    projectIdSql: string,
  ) {
    return `${this.nativeTasks.predicate(workspace, visibility, taskIdSql)} AND EXISTS (SELECT 1 FROM core."deliveryTask" commitmentTask WHERE commitmentTask."workspaceId"=$1 AND commitmentTask."taskId"=${taskIdSql} AND commitmentTask."projectId"=${projectIdSql})`;
  }

  private orphanPredicate(workspace: WorkspaceEntity) {
    return `NOT EXISTS (SELECT 1 FROM ${this.delivery.schema(workspace)}.task orphanNative WHERE orphanNative.id=a."taskId" AND orphanNative."deletedAt" IS NULL) OR EXISTS (SELECT 1 FROM core."deliveryTask" orphanManaged WHERE orphanManaged."workspaceId"=a."workspaceId" AND orphanManaged."taskId"=a."taskId" AND orphanManaged."projectId"<>$2::uuid)`;
  }

  private async taskOptions(
    workspace: WorkspaceEntity,
    context: Context,
    visibility: DeliveryNativeTaskVisibility | null,
    search: string,
    selectedId?: string | null,
  ): Promise<DeliveryCommitmentTaskOptionDTO[]> {
    if (!context.canManage || !visibility) return [];
    return this.nativeTasks.query(
      context.manager,
      `SELECT d."taskId",t.title AS name,d.revision AS "taskRevision",d.details->>'state' AS state,COALESCE(a.revision,0) AS "allocationRevision",CASE WHEN a.state<>'REMOVED' THEN a."periodId" END AS "allocatedPeriodId",CASE WHEN a.state<>'REMOVED' THEN a."lineId" END AS "allocatedLineId",CASE WHEN a.state<>'REMOVED' THEN l.unit END AS "allocatedUnit" FROM core."deliveryTask" d JOIN ${this.delivery.schema(workspace)}.task t ON t.id=d."taskId" AND t."deletedAt" IS NULL LEFT JOIN core."deliveryCommitmentAllocation" a ON a."workspaceId"=d."workspaceId" AND a."taskId"=d."taskId" LEFT JOIN core."deliveryCommitmentPeriod" p ON p.id=a."periodId" AND p."workspaceId"=a."workspaceId" LEFT JOIN core."deliveryCommitmentLine" l ON l.id=a."lineId" AND l."workspaceId"=a."workspaceId" WHERE d."workspaceId"=$1 AND d."projectId"=$2 AND ($3='' OR strpos(lower(t.title),lower($3))>0) AND (a.id IS NULL OR p."engagementId"=$4) AND ($5::uuid IS NULL OR d."taskId"=$5::uuid) AND ${this.nativeTasks.predicate(workspace, visibility, 'd."taskId"')} ORDER BY t.title,d."taskId" LIMIT 101`,
      [
        workspace.id,
        context.engagement.projectId,
        search,
        context.engagement.id,
        selectedId ?? null,
      ],
      visibility,
    );
  }

  private async read(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: z.infer<typeof commitmentsInputSchema>,
    context: Context,
  ): Promise<DeliveryCommitmentsDTO> {
    const { manager, operations, engagement, canManage } = context;
    const visibility = await this.taskVisibility(
      workspace,
      manager,
      memberId,
      userWorkspaceId,
    );
    const pageScope = financeReviewToken([
      context.policyScope,
      visibility?.fingerprint ?? 'PERMISSION_DENIED',
    ]);
    const periods = await this.periods(manager, workspace.id, engagement);
    const period = input.periodId
      ? periods.find((item) => item.id === input.periodId)
      : periods[0];
    if (input.periodId && !period)
      throw new NotFoundException('Commitment period not found.');
    const base: DeliveryCommitmentsDTO = {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      engagementId: engagement.id,
      engagementName: engagement.name,
      projectId: engagement.projectId,
      canManage,
      taskDetailsAvailable: visibility !== null,
      legacyAllowance: canManage ? engagement.allowance : null,
      selectedPeriodId: period?.id ?? null,
      periods: periods.map((item) => this.periodDTO(item)),
      lines: [],
      allocations: [],
      history: [],
      taskOptions: [],
      orphanAllocations: [],
      selectedTask: null,
      selectedParent: null,
      moreTaskOptions: false,
      nextAllocationCursor: null,
      nextOrphanAllocationCursor: null,
      nextHistoryCursor: null,
    };
    if (!period) return base;
    const allocationCursor = decodeCursor(
      input.allocationCursor,
      workspace.id,
      period.id,
      'allocations',
      pageScope,
    );
    const historyCursor = decodeCursor(
      input.historyCursor,
      workspace.id,
      period.id,
      'history',
      pageScope,
    );
    const orphanCursor = decodeCursor(
      input.orphanAllocationCursor,
      workspace.id,
      period.id,
      'orphans',
      context.policyScope,
    );
    const limit = input.limit ?? 50;
    const lines = await manager
      .getRepository(DeliveryCommitmentLineEntity)
      .find({
        where: { workspaceId: workspace.id, periodId: period.id },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
    const allocations = await this.allocationRows(
      workspace,
      manager,
      period.id,
    );
    const completeAllocations = new Map(
      allocations.map((item) => [item.id, item]),
    );
    const fulfilments = new Map(
      operations.fulfilments.map((item) => [item.taskId, item]),
    );
    const page = visibility
      ? await this.nativeTasks.query<
          {
            id: string;
            taskName: string;
            parentTaskId: string | null;
          }[]
        >(
          manager,
          `SELECT a.id,t.title AS "taskName",CASE WHEN a."parentTaskId" IS NOT NULL AND (${this.taskPredicate(workspace, visibility, 'a."parentTaskId"', '$2::uuid')}) THEN a."parentTaskId" ELSE NULL END AS "parentTaskId" FROM core."deliveryCommitmentAllocation" a JOIN ${this.delivery.schema(workspace)}.task t ON t.id=a."taskId" WHERE a."workspaceId"=$1 AND a."periodId"=$3 AND ($4::uuid IS NULL OR a.id>$4::uuid) AND (${this.taskPredicate(workspace, visibility, 'a."taskId"', '$2::uuid')}) ORDER BY a.id LIMIT $5`,
          [
            workspace.id,
            engagement.projectId,
            period.id,
            allocationCursor?.id ?? null,
            limit + 1,
          ],
          visibility,
        )
      : [];
    const visible = page.slice(0, limit);
    const parentValue = `CASE WHEN parent.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN parent.value::uuid ELSE NULL END`;
    const historyPredicate = visibility
      ? `(event."taskId" IS NULL OR (${this.taskPredicate(workspace, visibility, 'event."taskId"', '$2::uuid')})) AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(event.changes) change CROSS JOIN LATERAL (VALUES (change->>'before'),(change->>'after')) parent(value) WHERE change->>'field'='parentTaskId' AND parent.value IS NOT NULL AND NOT (${this.taskPredicate(workspace, visibility, parentValue, '$2::uuid')}))`
      : `event."taskId" IS NULL AND $2::uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(event.changes) change WHERE change->>'field'='parentTaskId' AND (change->>'before' IS NOT NULL OR change->>'after' IS NOT NULL))`;
    const historySql = `SELECT event.* FROM core."deliveryCommitmentEvent" event WHERE event."workspaceId"=$1 AND event."periodId"=$3 AND ($4::timestamptz IS NULL OR (event."createdAt",event.id)<($4::timestamptz,$5::uuid)) AND (${historyPredicate}) ORDER BY event."createdAt" DESC,event.id DESC LIMIT $6`;
    const historyParameters = [
      workspace.id,
      engagement.projectId,
      period.id,
      historyCursor?.at ?? null,
      historyCursor?.id ?? null,
      limit + 1,
    ];
    const history: DeliveryCommitmentEventEntity[] = !canManage
      ? []
      : visibility
        ? await this.nativeTasks.query(
            manager,
            historySql,
            historyParameters,
            visibility,
          )
        : await manager.query(historySql, historyParameters);
    const orphans: (DeliveryCommitmentAllocationEntity & {
      hasChildren: boolean;
    })[] = canManage
      ? await manager.query(
          `SELECT a.*,EXISTS (SELECT 1 FROM core."deliveryCommitmentAllocation" child WHERE child."workspaceId"=a."workspaceId" AND child."parentTaskId"=a."taskId" AND child.state<>'REMOVED') AS "hasChildren" FROM core."deliveryCommitmentAllocation" a WHERE a."workspaceId"=$1 AND a."periodId"=$3 AND a.state<>'REMOVED' AND ($4::uuid IS NULL OR a.id>$4::uuid) AND (${this.orphanPredicate(workspace)}) ORDER BY a.id LIMIT $5`,
          [
            workspace.id,
            engagement.projectId,
            period.id,
            orphanCursor?.id ?? null,
            limit + 1,
          ],
        )
      : [];
    const tasks = await this.taskOptions(
      workspace,
      context,
      visibility,
      input.taskSearch ?? '',
    );
    const selectedTask = input.selectedTaskId
      ? ((
          await this.taskOptions(
            workspace,
            context,
            visibility,
            '',
            input.selectedTaskId,
          )
        )[0] ?? null)
      : null;
    const selectedParent = input.selectedParentTaskId
      ? ((
          await this.taskOptions(
            workspace,
            context,
            visibility,
            '',
            input.selectedParentTaskId,
          )
        )[0] ?? null)
      : null;
    const visibleHistory = history.slice(0, limit);
    const visibleOrphans = orphans.slice(0, limit);
    const lastAllocation = visible[visible.length - 1];
    const lastEvent = visibleHistory[visibleHistory.length - 1];
    const lastOrphan = visibleOrphans[visibleOrphans.length - 1];
    return {
      ...base,
      lines: this.counts(lines, allocations, operations),
      allocations: visible.map((row) => {
        const item = completeAllocations.get(row.id);
        if (!item)
          throw new ConflictException(
            'Commitment work changed. Refresh this period.',
          );
        const credit = commitmentCredit(
          item,
          item.liveDetails,
          fulfilments.get(item.taskId),
        );
        return {
          taskId: item.taskId,
          taskName: row.taskName,
          periodId: item.periodId,
          lineId: item.lineId,
          parentTaskId: row.parentTaskId,
          revision: item.revision,
          state:
            item.state === 'FULFILLED' && !credit.credited
              ? 'REOPENED'
              : item.state,
          credited: credit.credited,
          creditReason: credit.reason,
          fulfilledAt: item.fulfilledAt?.toISOString() ?? null,
          creditedCycle: item.creditedCycle,
          creditedSubmissionVersion: item.creditedSubmissionVersion,
        };
      }),
      taskOptions: tasks.slice(0, 100),
      moreTaskOptions: tasks.length > 100,
      selectedTask,
      selectedParent,
      orphanAllocations: visibleOrphans.map((item) => ({
        allocationId: item.id,
        periodId: item.periodId,
        lineId: item.lineId,
        revision: item.revision,
        state: item.state,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        canRemove: period.state === 'OPEN' && !item.hasChildren,
        removalBlockReason:
          period.state !== 'OPEN'
            ? 'Reopen this period before changing its plan.'
            : item.hasChildren
              ? 'Reassign or remove its variations first. Appropriate task access may be required.'
              : null,
      })),
      history: visibleHistory.map((event) => ({
        id: event.id,
        action: event.action,
        actorName: event.actorName,
        actorType: event.actorType,
        occurredAt: event.createdAt.toISOString(),
        taskId: event.taskId,
        taskName: event.taskName,
        reason: event.reason,
        changes: event.changes.filter(
          (change) => change.field !== 'requestHash',
        ),
      })),
      nextAllocationCursor:
        page.length > limit && lastAllocation
          ? encodeCursor({
              version: 2,
              scope: pageScope,
              workspaceId: workspace.id,
              periodId: period.id,
              kind: 'allocations',
              id: lastAllocation.id,
            })
          : null,
      nextOrphanAllocationCursor:
        orphans.length > limit && lastOrphan
          ? encodeCursor({
              version: 2,
              scope: context.policyScope,
              workspaceId: workspace.id,
              periodId: period.id,
              kind: 'orphans',
              id: lastOrphan.id,
            })
          : null,
      nextHistoryCursor:
        history.length > limit && lastEvent
          ? encodeCursor({
              version: 2,
              scope: pageScope,
              workspaceId: workspace.id,
              periodId: period.id,
              kind: 'history',
              id: lastEvent.id,
              at: lastEvent.createdAt.toISOString(),
            })
          : null,
    };
  }

  private async cleanupResult(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: z.infer<typeof commitmentOrphanCleanupSchema>,
    manager: EntityManager,
  ): Promise<DeliveryCommitmentOrphanCleanupResultDTO> {
    const event = await manager
      .getRepository(DeliveryCommitmentEventEntity)
      .findOneBy({ id: input.requestId });
    const requestHash = commitmentCleanupRequestHash(
      { workspaceId: workspace.id, memberId, userWorkspaceId },
      input,
    );
    if (
      event &&
      (event.workspaceId !== workspace.id ||
        event.periodId !== input.periodId ||
        event.actorId !== memberId ||
        event.actorType !== 'HUMAN' ||
        ![
          'COMMITMENT_ORPHAN_REMOVED',
          'COMMITMENT_ORPHAN_CLEANUP_CANCELLED',
        ].includes(event.action) ||
        event.taskId !== null ||
        event.taskName !== null ||
        event.changes.find((change) => change.field === 'requestHash')
          ?.after !== requestHash)
    )
      throw new ConflictException(
        'This cleanup request does not match its recorded result.',
      );
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      engagementId: input.engagementId,
      periodId: input.periodId,
      requestId: input.requestId,
      allocationId: input.allocationId,
      requestedAllocationRevision: input.allocationRevision,
      periodRevision: input.periodRevision,
      state: event
        ? event.action === 'COMMITMENT_ORPHAN_REMOVED'
          ? 'REMOVED'
          : 'CANCELLED'
        : 'NOT_FOUND',
      removedAllocationRevision:
        event?.action === 'COMMITMENT_ORPHAN_REMOVED'
          ? input.allocationRevision + 1
          : null,
      occurredAt: event?.createdAt.toISOString() ?? null,
    };
  }

  async orphanCleanupReceipt(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseInput(commitmentOrphanCleanupSchema, input);
    return readDeliveryOperations(
      this.dataSource,
      workspace.id,
      async (operations, manager) => {
        const context = await this.scope(
          workspace,
          memberId,
          userWorkspaceId,
          parsed.engagementId,
          operations,
          manager,
          true,
        );
        await this.taskVisibility(
          workspace,
          manager,
          memberId,
          userWorkspaceId,
        );
        await this.period(context, workspace.id, parsed.periodId, false);
        return this.cleanupResult(
          workspace,
          memberId,
          userWorkspaceId,
          parsed,
          manager,
        );
      },
    );
  }

  private async lockOrphanSource(
    workspace: WorkspaceEntity,
    context: Context,
    allocation: DeliveryCommitmentAllocationEntity,
  ) {
    const manager = context.manager;
    type NativeSource = { id: string; deletedAt: Date | null };
    const nativeQuery = `SELECT id,"deletedAt" FROM ${this.delivery.schema(workspace)}.task WHERE id=$1 FOR UPDATE`;
    let native: NativeSource[] = await manager.query(nativeQuery, [
      allocation.taskId,
    ]);
    if (!native.length) {
      // An absent row has no lock; serialize same-ID insertion only for this uncommon cleanup branch.
      await manager.query("SET LOCAL lock_timeout = '5s'");
      await manager.query(
        `LOCK TABLE ${this.delivery.schema(workspace)}.task IN SHARE MODE`,
      );
      native = await manager.query(nativeQuery, [allocation.taskId]);
    }
    const managed = await manager.getRepository(DeliveryTaskEntity).findOne({
      where: { workspaceId: workspace.id, taskId: allocation.taskId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      native.length &&
      !native[0].deletedAt &&
      (!managed || managed.projectId === context.engagement.projectId)
    )
      throw new ConflictException(
        'This allocation is no longer eligible for unavailable-source cleanup. Refresh its current status.',
      );
  }

  async removeOrphanAllocation(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryCommitmentOrphanCleanupResultDTO> {
    return this.changeOrphanAllocation(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      false,
    );
  }

  async cancelOrphanCleanup(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryCommitmentOrphanCleanupResultDTO> {
    return this.changeOrphanAllocation(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      true,
    );
  }

  private async changeOrphanAllocation(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    cancel: boolean,
  ): Promise<DeliveryCommitmentOrphanCleanupResultDTO> {
    const parsed = parseInput(commitmentOrphanCleanupSchema, input);
    return this.dataSource
      .transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout = '5s'");
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${workspace.id}`],
        );
        const operations =
          (
            await manager
              .getRepository(DeliveryOperationsEntity)
              .findOneBy({ workspaceId: workspace.id })
          )?.state ?? newDeliveryOperations();
        const context = await this.scope(
          workspace,
          memberId,
          userWorkspaceId,
          parsed.engagementId,
          operations,
          manager,
          true,
        );
        await this.taskVisibility(
          workspace,
          manager,
          memberId,
          userWorkspaceId,
        );
        const checkedPeriod = await this.period(
          context,
          workspace.id,
          parsed.periodId,
          false,
        );
        const receipt = await this.cleanupResult(
          workspace,
          memberId,
          userWorkspaceId,
          parsed,
          manager,
        );
        if (receipt.state !== 'NOT_FOUND') return receipt;
        if (cancel) {
          await recordDeliveryCommitment(
            manager,
            checkedPeriod,
            { actorId: memberId, actorType: 'HUMAN' },
            {
              eventId: parsed.requestId,
              action: 'COMMITMENT_ORPHAN_CLEANUP_CANCELLED',
              reason:
                'Cancelled this unavailable-source cleanup request before removal. No allocation was changed.',
              changes: [
                { field: 'state', before: null, after: 'CANCELLED' },
                {
                  field: 'requestHash',
                  before: null,
                  after: commitmentCleanupRequestHash(
                    { workspaceId: workspace.id, memberId, userWorkspaceId },
                    parsed,
                  ),
                },
              ],
            },
          );
          return this.cleanupResult(
            workspace,
            memberId,
            userWorkspaceId,
            parsed,
            manager,
          );
        }
        const period = await this.period(
          context,
          workspace.id,
          parsed.periodId,
        );
        this.assertRevision(period.revision, parsed.periodRevision);
        const repository = manager.getRepository(
          DeliveryCommitmentAllocationEntity,
        );
        const allocation = await repository.findOne({
          where: {
            id: parsed.allocationId,
            workspaceId: workspace.id,
            periodId: period.id,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!allocation)
          throw new NotFoundException(
            'Unavailable-source allocation not found.',
          );
        this.assertRevision(allocation.revision, parsed.allocationRevision);
        if (allocation.state === 'REMOVED')
          throw new ConflictException(
            'This allocation has already been removed. Check its recorded result.',
          );
        await this.lockOrphanSource(workspace, context, allocation);
        await this.assertNoChildren(manager, workspace.id, allocation.taskId);
        const before = allocation.state;
        allocation.state = 'REMOVED';
        allocation.revision += 1;
        await repository.save(allocation);
        await recordDeliveryCommitment(
          manager,
          period,
          { actorId: memberId, actorType: 'HUMAN' },
          {
            eventId: parsed.requestId,
            action: 'COMMITMENT_ORPHAN_REMOVED',
            reason:
              'Removed an unavailable-source allocation from this commitment. Promised quantities and delivery history are unchanged.',
            changes: [
              { field: 'state', before, after: 'REMOVED' },
              {
                field: 'requestHash',
                before: null,
                after: commitmentCleanupRequestHash(
                  { workspaceId: workspace.id, memberId, userWorkspaceId },
                  parsed,
                ),
              },
            ],
          },
        );
        return this.cleanupResult(
          workspace,
          memberId,
          userWorkspaceId,
          parsed,
          manager,
        );
      })
      .catch((failure: unknown) => {
        if (failure instanceof QueryFailedError) {
          const code = (failure.driverError as { code?: string }).code;
          if (code === '23505')
            throw new ConflictException(
              'This cleanup request conflicts with a recorded result. Check the original request before retrying.',
            );
          if (code === '55P03' || code === '40P01')
            throw new ConflictException(
              'Cleanup could not obtain the current source safely. Check its recorded result, then refresh before retrying.',
            );
        }
        throw failure;
      });
  }

  private async write(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    engagementId: string,
    periodId: string,
    operation: (context: Context) => Promise<void>,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${workspace.id}`],
      );
      const operations =
        (
          await manager
            .getRepository(DeliveryOperationsEntity)
            .findOneBy({ workspaceId: workspace.id })
        )?.state ?? newDeliveryOperations();
      const context = await this.scope(
        workspace,
        memberId,
        userWorkspaceId,
        engagementId,
        operations,
        manager,
        true,
      );
      await operation(context);
      return this.read(
        workspace,
        memberId,
        userWorkspaceId,
        { engagementId, periodId },
        context,
      );
    });
  }

  private assertRevision(actual: number | undefined, expected: number) {
    if ((actual ?? 0) !== expected)
      throw new ConflictException(
        'This commitment changed. Refresh it before saving your changes.',
      );
  }
  private async period(
    context: Context,
    workspaceId: string,
    id: string,
    open = true,
  ) {
    const period = await context.manager
      .getRepository(DeliveryCommitmentPeriodEntity)
      .findOneBy({
        id,
        workspaceId,
        engagementId: context.engagement.id,
        projectId: context.engagement.projectId,
        clientId: context.engagement.companyId,
      });
    if (!period) throw new NotFoundException('Commitment period not found.');
    if (open && period.state !== 'OPEN')
      throw new ConflictException(
        'Reopen this period before changing its plan.',
      );
    return period;
  }

  async savePeriod(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseInput(commitmentPeriodSchema, input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      parsed.engagementId,
      parsed.id,
      async (context) => {
        const repository = context.manager.getRepository(
          DeliveryCommitmentPeriodEntity,
        );
        const existing = await repository.findOneBy({ id: parsed.id });
        if (
          existing &&
          (existing.workspaceId !== workspace.id ||
            existing.engagementId !== parsed.engagementId)
        )
          throw new NotFoundException();
        this.assertRevision(existing?.revision, parsed.revision);
        if (existing?.state === 'CLOSED')
          throw new ConflictException(
            'Reopen this period before changing its plan.',
          );
        const billing = existing?.billing ?? context.engagement.billing;
        if (billing === 'RETAINER' && !parsed.endDateExclusive)
          throw new BadRequestException(
            'Retainer periods require an explicit end date.',
          );
        const before = existing
          ? {
              label: existing.label,
              startDate: existing.startDate,
              endDateExclusive: existing.endDateExclusive,
              timezone: existing.timezone,
            }
          : {};
        const period = repository.create({
          ...existing,
          id: parsed.id,
          workspaceId: workspace.id,
          engagementId: context.engagement.id,
          projectId: context.engagement.projectId,
          clientId: context.engagement.companyId,
          billing,
          label: parsed.label,
          startDate: parsed.startDate,
          endDateExclusive: parsed.endDateExclusive,
          timezone: parsed.timezone,
          state: 'OPEN',
          revision: (existing?.revision ?? 0) + 1,
        });
        await repository.save(period);
        await recordDeliveryCommitment(
          context.manager,
          period,
          { actorId: memberId, actorType: 'HUMAN' },
          {
            action: existing
              ? 'COMMITMENT_PERIOD_UPDATED'
              : 'COMMITMENT_PERIOD_CREATED',
            reason: parsed.reason,
            changes: changesBetween(before, {
              label: period.label,
              startDate: period.startDate,
              endDateExclusive: period.endDateExclusive,
              timezone: period.timezone,
            }),
          },
        );
      },
    );
  }

  async setPeriodState(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseInput(commitmentPeriodStateSchema, input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      parsed.engagementId,
      parsed.periodId,
      async (context) => {
        const period = await this.period(
          context,
          workspace.id,
          parsed.periodId,
          false,
        );
        this.assertRevision(period.revision, parsed.revision);
        if (period.state === parsed.state)
          throw new ConflictException('This period already has that state.');
        const before = period.state;
        period.state = parsed.state;
        period.revision++;
        await context.manager
          .getRepository(DeliveryCommitmentPeriodEntity)
          .save(period);
        await recordDeliveryCommitment(
          context.manager,
          period,
          { actorId: memberId, actorType: 'HUMAN' },
          {
            action:
              parsed.state === 'CLOSED'
                ? 'COMMITMENT_PERIOD_CLOSED'
                : 'COMMITMENT_PERIOD_REOPENED',
            reason: parsed.reason,
            changes: [{ field: 'state', before, after: parsed.state }],
          },
        );
      },
    );
  }

  async saveLine(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseInput(commitmentLineSchema, input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      parsed.engagementId,
      parsed.periodId,
      async (context) => {
        const period = await this.period(
          context,
          workspace.id,
          parsed.periodId,
        );
        this.assertRevision(period.revision, parsed.periodRevision);
        const repository = context.manager.getRepository(
          DeliveryCommitmentLineEntity,
        );
        const existing = await repository.findOneBy({ id: parsed.id });
        if (
          existing &&
          (existing.workspaceId !== workspace.id ||
            existing.periodId !== period.id)
        )
          throw new NotFoundException();
        this.assertRevision(existing?.revision, parsed.revision);
        if (
          existing &&
          existing.unit !== parsed.unit &&
          (await context.manager
            .getRepository(DeliveryCommitmentAllocationEntity)
            .createQueryBuilder('a')
            .where(
              'a."workspaceId"=:workspaceId AND a."lineId"=:lineId AND a.state<>:removed',
              {
                workspaceId: workspace.id,
                lineId: existing.id,
                removed: 'REMOVED',
              },
            )
            .getExists())
        )
          throw new ConflictException(
            'Move or remove assigned tasks before changing this line type.',
          );
        const before = existing
          ? {
              label: existing.label,
              unit: existing.unit,
              promisedQuantity: existing.promisedQuantity,
            }
          : {};
        const line = repository.create({
          ...existing,
          id: parsed.id,
          workspaceId: workspace.id,
          periodId: period.id,
          label: parsed.label,
          unit: parsed.unit,
          promisedQuantity: parsed.promisedQuantity,
          revision: (existing?.revision ?? 0) + 1,
        });
        await repository.save(line);
        await recordDeliveryCommitment(
          context.manager,
          period,
          { actorId: memberId, actorType: 'HUMAN' },
          {
            action: existing
              ? 'COMMITMENT_LINE_UPDATED'
              : 'COMMITMENT_LINE_CREATED',
            reason: parsed.reason,
            changes: changesBetween(before, {
              label: line.label,
              unit: line.unit,
              promisedQuantity: line.promisedQuantity,
            }),
          },
        );
      },
    );
  }

  private async assertNoChildren(
    manager: EntityManager,
    workspaceId: string,
    taskId: string,
  ) {
    if (
      await manager
        .getRepository(DeliveryCommitmentAllocationEntity)
        .createQueryBuilder('a')
        .where(
          'a."workspaceId"=:workspaceId AND a."parentTaskId"=:taskId AND a.state<>:removed',
          { workspaceId, taskId, removed: 'REMOVED' },
        )
        .getExists()
    )
      throw new ConflictException(
        'Update or remove the linked variations before changing their unique-video parent.',
      );
  }

  async assignTask(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseInput(commitmentAssignSchema, input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      parsed.engagementId,
      parsed.periodId,
      async (context) => {
        const { manager, engagement, operations } = context;
        const period = await this.period(
          context,
          workspace.id,
          parsed.periodId,
        );
        this.assertRevision(period.revision, parsed.periodRevision);
        const line = await manager
          .getRepository(DeliveryCommitmentLineEntity)
          .findOneBy({
            id: parsed.lineId,
            workspaceId: workspace.id,
            periodId: period.id,
          });
        if (!line) throw new NotFoundException('Commitment line not found.');
        this.assertRevision(line.revision, parsed.lineRevision);
        await this.nativeTasks.assert(
          manager,
          workspace,
          { memberId, userWorkspaceId },
          parsed.taskId,
          ['id', 'title'],
        );
        const task = await manager.getRepository(DeliveryTaskEntity).findOneBy({
          workspaceId: workspace.id,
          taskId: parsed.taskId,
          projectId: engagement.projectId,
        });
        const native: { title: string }[] = await manager.query(
          `SELECT title FROM ${this.delivery.schema(workspace)}.task WHERE id=$1 AND "deletedAt" IS NULL`,
          [parsed.taskId],
        );
        if (!task || !native.length)
          throw new NotFoundException(
            'Choose a current task in this engagement project.',
          );
        this.assertRevision(task.revision, parsed.taskRevision);
        const repository = manager.getRepository(
          DeliveryCommitmentAllocationEntity,
        );
        const existing = await repository.findOneBy({
          workspaceId: workspace.id,
          taskId: parsed.taskId,
        });
        this.assertRevision(existing?.revision, parsed.revision);
        if (existing)
          await this.period(context, workspace.id, existing.periodId);
        if (
          existing &&
          existing.state !== 'REMOVED' &&
          existing.lineId === line.id &&
          existing.periodId === period.id &&
          existing.parentTaskId === parsed.parentTaskId
        )
          throw new ConflictException(
            'This task is already assigned to this commitment.',
          );
        if (
          existing &&
          existing.state !== 'REMOVED' &&
          existing.lineId !== line.id
        )
          await this.assertNoChildren(manager, workspace.id, parsed.taskId);
        if (line.unit === 'VARIATION') {
          if (!parsed.parentTaskId || parsed.parentTaskId === parsed.taskId)
            throw new BadRequestException(
              'Choose a different unique-video parent for this variation.',
            );
          await this.nativeTasks.assert(
            manager,
            workspace,
            { memberId, userWorkspaceId },
            parsed.parentTaskId,
            ['id', 'title'],
          );
          const parent = await repository.findOneBy({
            workspaceId: workspace.id,
            taskId: parsed.parentTaskId,
          });
          const parentTasks: { id: string }[] = await manager.query(
            `SELECT d.id FROM core."deliveryTask" d JOIN ${this.delivery.schema(workspace)}.task t ON t.id=d."taskId" AND t."deletedAt" IS NULL WHERE d."workspaceId"=$1 AND d."taskId"=$2 AND d."projectId"=$3`,
            [workspace.id, parsed.parentTaskId, engagement.projectId],
          );
          const parentPeriod = parent
            ? await this.period(context, workspace.id, parent.periodId, false)
            : null;
          const parentLine = parent
            ? await manager
                .getRepository(DeliveryCommitmentLineEntity)
                .findOneBy({ workspaceId: workspace.id, id: parent.lineId })
            : null;
          if (
            !parent ||
            !parentTasks.length ||
            parent.state === 'REMOVED' ||
            !parentPeriod ||
            parentLine?.unit !== 'UNIQUE_VIDEO'
          )
            throw new BadRequestException(
              'The parent must be an allocated unique video in this engagement.',
            );
        } else if (parsed.parentTaskId)
          throw new BadRequestException(
            'Only variations have a unique-video parent.',
          );
        const before = existing
          ? {
              periodId: existing.periodId,
              lineId: existing.lineId,
              parentTaskId: existing.parentTaskId,
              state: existing.state,
            }
          : {};
        const oldPeriod =
          existing && existing.periodId !== period.id
            ? await this.period(context, workspace.id, existing.periodId)
            : null;
        const allocation = repository.create({
          ...existing,
          workspaceId: workspace.id,
          taskId: parsed.taskId,
          taskName: native[0].title,
          periodId: period.id,
          lineId: line.id,
          parentTaskId: parsed.parentTaskId,
          state: 'ASSIGNED',
          revision: (existing?.revision ?? 0) + 1,
          creditedCycle: null,
          creditedSubmissionVersion: null,
          fulfilledAt: null,
        });
        await repository.save(allocation);
        const event = {
          action: 'COMMITMENT_TASK_ASSIGNED',
          reason: parsed.reason,
          taskId: parsed.taskId,
          taskName: allocation.taskName,
          changes: changesBetween(before, {
            periodId: allocation.periodId,
            lineId: allocation.lineId,
            parentTaskId: allocation.parentTaskId,
            state: allocation.state,
          }),
        };
        await recordDeliveryCommitment(
          manager,
          period,
          { actorId: memberId, actorType: 'HUMAN' },
          event,
        );
        if (oldPeriod)
          await recordDeliveryCommitment(
            manager,
            oldPeriod,
            { actorId: memberId, actorType: 'HUMAN' },
            { ...event, action: 'COMMITMENT_TASK_REMOVED' },
          );
        await syncDeliveryCommitment(
          manager,
          workspace.id,
          task.taskId,
          task.details,
          operations.fulfilments.find((item) => item.taskId === task.taskId),
          { actorId: memberId, actorType: 'HUMAN' },
        );
        await this.nativeTasks.assert(
          manager,
          workspace,
          { memberId, userWorkspaceId },
          parsed.taskId,
          ['id', 'title'],
        );
        if (parsed.parentTaskId)
          await this.nativeTasks.assert(
            manager,
            workspace,
            { memberId, userWorkspaceId },
            parsed.parentTaskId,
            ['id', 'title'],
          );
      },
    );
  }

  async removeTask(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseInput(commitmentRemoveSchema, input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      parsed.engagementId,
      parsed.periodId,
      async (context) => {
        const period = await this.period(
          context,
          workspace.id,
          parsed.periodId,
        );
        await this.nativeTasks.assert(
          context.manager,
          workspace,
          { memberId, userWorkspaceId },
          parsed.taskId,
          ['id', 'title'],
        );
        if (
          !(await context.manager.getRepository(DeliveryTaskEntity).existsBy({
            workspaceId: workspace.id,
            taskId: parsed.taskId,
            projectId: context.engagement.projectId,
          }))
        )
          throw new NotFoundException(
            'This task is unavailable in the commitment project.',
          );
        const repository = context.manager.getRepository(
          DeliveryCommitmentAllocationEntity,
        );
        const allocation = await repository.findOneBy({
          workspaceId: workspace.id,
          taskId: parsed.taskId,
          periodId: period.id,
        });
        if (!allocation) throw new NotFoundException();
        this.assertRevision(allocation.revision, parsed.revision);
        if (allocation.state === 'REMOVED')
          throw new ConflictException('This task is already removed.');
        await this.assertNoChildren(
          context.manager,
          workspace.id,
          allocation.taskId,
        );
        const before = allocation.state;
        allocation.state = 'REMOVED';
        allocation.revision++;
        await repository.save(allocation);
        await recordDeliveryCommitment(
          context.manager,
          period,
          { actorId: memberId, actorType: 'HUMAN' },
          {
            action: 'COMMITMENT_TASK_REMOVED',
            reason: parsed.reason,
            taskId: allocation.taskId,
            taskName: allocation.taskName,
            changes: [{ field: 'state', before, after: 'REMOVED' }],
          },
        );
        await this.nativeTasks.assert(
          context.manager,
          workspace,
          { memberId, userWorkspaceId },
          parsed.taskId,
          ['id', 'title'],
        );
      },
    );
  }
}
