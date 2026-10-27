import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { z } from 'zod';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { canAccessDeliveryProject } from 'src/modules/delivery/delivery-policy';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { readDeliveryOperations } from 'src/modules/delivery/read-delivery-snapshot';
import { type DeliveryOperations } from 'src/modules/delivery/operations/delivery-operations.types';
import { DeliveryBatchEntity } from 'src/modules/delivery/batches/entities/delivery-batch.entity';
import { DeliveryBatchItemEntity } from 'src/modules/delivery/batches/entities/delivery-batch-item.entity';
import { DeliveryBatchEventEntity } from 'src/modules/delivery/batches/entities/delivery-batch-event.entity';
import {
  batchesQuerySchema,
  batchSaveSchema,
  batchStateSchema,
  batchItemSchema,
  batchCursorSchema,
  MAX_BATCH_TASKS,
} from 'src/modules/delivery/batches/delivery-batches.types';
import {
  type DeliveryBatchesDTO,
  type DeliveryBatchTaskDTO,
  type DeliveryBatchCountDTO,
  type DeliveryBatchTaskOptionDTO,
} from 'src/modules/delivery/batches/delivery-batches.dto';
import { type DeliveryCommitmentAllocationEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-allocation.entity';
import { type CommitmentChange } from 'src/modules/delivery/commitments/delivery-commitments.types';
import { DeliveryCommitmentPeriodEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-period.entity';
import {
  commitmentCredit,
  currentCommitmentEvidence,
} from 'src/modules/delivery/commitments/delivery-commitments.policy';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

type QueryInput = z.infer<typeof batchesQuerySchema>;
type Row = DeliveryBatchItemEntity & {
  title: string | null;
  details: Pick<DeliveryDetails, 'state' | 'submissions'> | null;
  taskRevision: number | null;
  assigneeName: string | null;
  reviewerName: string | null;
  allocation: DeliveryCommitmentAllocationEntity | null;
  unit: string | null;
};
const parse = <TOutput>(
  schema: z.ZodType<TOutput>,
  value: unknown,
): TOutput => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((issue) => issue.message).join(' '),
    );
  return result.data;
};
const changes = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): CommitmentChange[] =>
  Object.keys(after)
    .filter((field) => before[field] !== after[field])
    .map((field) => ({
      field,
      before: before[field] == null ? null : String(before[field]),
      after: after[field] == null ? null : String(after[field]),
    }));

@Injectable()
export class DeliveryBatchesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
  ) {}

  private async scope(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    projectId: string,
    manager: EntityManager,
    write = false,
  ) {
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId: workspace.id, id: projectId });
    if (
      !project ||
      !canAccessDeliveryProject(actor.isManager, memberId, project.memberIds)
    )
      throw new NotFoundException('Project not available.');
    if (write && !actor.isManager)
      throw new ForbiddenException(
        'A delivery manager is required to change batch plans.',
      );
    return { project, actor };
  }

  private async batch(
    manager: EntityManager,
    workspaceId: string,
    projectId: string,
    id: string,
    revision?: number,
  ) {
    const batch = await manager
      .getRepository(DeliveryBatchEntity)
      .findOneBy({ workspaceId, projectId, id });
    if (!batch) throw new NotFoundException('Batch not available.');
    if (revision !== undefined && batch.revision !== revision)
      throw new ConflictException('This batch changed. Refresh before saving.');
    return batch;
  }

  private cursor(
    value: string | null | undefined,
    workspaceId: string,
    input: QueryInput,
    kind: 'batches' | 'tasks' | 'history',
  ) {
    if (!value) return null;
    try {
      const parsed = batchCursorSchema.parse(
        JSON.parse(Buffer.from(value, 'base64url').toString()),
      );
      if (
        parsed.workspaceId !== workspaceId ||
        parsed.projectId !== input.projectId ||
        parsed.batchId !==
          (kind === 'batches' ? null : (input.batchId ?? null)) ||
        parsed.kind !== kind ||
        parsed.includeClosed !== Boolean(input.includeClosed) ||
        (kind === 'history' && !parsed.at)
      )
        throw new Error();
      return parsed;
    } catch {
      throw new BadRequestException('Invalid batch page. Refresh the view.');
    }
  }

  private encode(
    workspaceId: string,
    input: QueryInput,
    kind: 'batches' | 'tasks' | 'history',
    id: string,
    at?: Date,
  ) {
    return Buffer.from(
      JSON.stringify({
        workspaceId,
        projectId: input.projectId,
        batchId: kind === 'batches' ? null : input.batchId,
        kind,
        id,
        at: at?.toISOString(),
        includeClosed: Boolean(input.includeClosed),
      }),
    ).toString('base64url');
  }

  private async read(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: QueryInput,
    operations: DeliveryOperations,
    manager: EntityManager,
  ): Promise<DeliveryBatchesDTO> {
    const { actor, project } = await this.scope(
      workspace,
      memberId,
      userWorkspaceId,
      input.projectId,
      manager,
    );
    const limit = input.limit ?? 25;
    const cursor = this.cursor(input.cursor, workspace.id, input, 'batches');
    const query = manager
      .getRepository(DeliveryBatchEntity)
      .createQueryBuilder('batch')
      .where(
        'batch."workspaceId"=:workspaceId AND batch."projectId"=:projectId',
        { workspaceId: workspace.id, projectId: input.projectId },
      )
      .orderBy('batch.id', 'DESC')
      .take(limit + 1);
    if (!input.includeClosed) query.andWhere('batch.closed=false');
    if (cursor) query.andWhere('batch.id<:id', { id: cursor.id });
    const found = await query.getMany();
    const batches = found.slice(0, limit);
    const selected = input.batchId
      ? await this.batch(manager, workspace.id, input.projectId, input.batchId)
      : null;
    const periods = (
      await manager.getRepository(DeliveryCommitmentPeriodEntity).find({
        where: { workspaceId: workspace.id, projectId: project.id },
        order: { startDate: 'DESC', id: 'DESC' },
        take: 100,
      })
    )
      .filter(
        (period) =>
          period.clientId === project.companyId &&
          operations.clients?.engagements.some(
            (engagement) =>
              engagement.id === period.engagementId &&
              engagement.projectId === project.id &&
              engagement.companyId === project.companyId,
          ),
      )
      .map((period) => ({ id: period.id, label: period.label }));
    const response: DeliveryBatchesDTO = {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      projectId: input.projectId,
      canManage: actor.isManager,
      batches,
      selected,
      periods,
      tasks: [],
      counts: [],
      history: [],
      taskOptions: [],
      moreTaskOptions: false,
      nextCursor:
        found.length > limit
          ? this.encode(
              workspace.id,
              input,
              'batches',
              batches[batches.length - 1].id,
            )
          : null,
      nextTaskCursor: null,
      nextHistoryCursor: null,
    };
    if (!selected) return response;
    const schema = this.delivery.schema(workspace);
    // Only the current submission is needed for counts; never load every asset or revision into a batch list.
    const rows: Row[] = await manager.query(
      `SELECT i.*, t.title, CASE WHEN t.id IS NOT NULL THEN jsonb_build_object('state',d.details->'state','submissions',CASE WHEN jsonb_array_length(d.details->'submissions')>0 THEN jsonb_build_array(jsonb_build_object('version',d.details->'submissions'->-1->'version','decision',d.details->'submissions'->-1->'decision','reviewedAt',d.details->'submissions'->-1->'reviewedAt')) ELSE '[]'::jsonb END) ELSE NULL END AS details,
      CASE WHEN t.id IS NOT NULL THEN d.revision ELSE NULL END AS "taskRevision",
      CASE WHEN t.id IS NOT NULL THEN trim(concat_ws(' ',a."nameFirstName",a."nameLastName")) ELSE NULL END AS "assigneeName",
      CASE WHEN t.id IS NOT NULL THEN trim(concat_ws(' ',r."nameFirstName",r."nameLastName")) ELSE NULL END AS "reviewerName",
      CASE WHEN t.id IS NOT NULL AND p.id IS NOT NULL AND l.id IS NOT NULL THEN to_jsonb(c) ELSE NULL END AS allocation,
      CASE WHEN t.id IS NOT NULL AND p.id IS NOT NULL THEN l.unit ELSE NULL END AS unit
      FROM core."deliveryBatchItem" i
      LEFT JOIN core."deliveryTask" d ON d."workspaceId"=i."workspaceId" AND d."taskId"=i."taskId" AND d."projectId"=$3
      LEFT JOIN ${schema}.task t ON t.id=d."taskId" AND t."deletedAt" IS NULL
      LEFT JOIN ${schema}."workspaceMember" a ON a.id=t."assigneeId"
      LEFT JOIN ${schema}."workspaceMember" r ON r.id::text=d.details->>'reviewerId'
      LEFT JOIN core."deliveryCommitmentAllocation" c ON c."workspaceId"=i."workspaceId" AND c."taskId"=i."taskId" AND c.state<>'REMOVED'
      LEFT JOIN core."deliveryCommitmentPeriod" p ON p.id=c."periodId" AND p."workspaceId"=i."workspaceId" AND p."projectId"=$3 AND p."clientId"=$4 AND p."engagementId"=ANY($7::uuid[]) AND ($5::uuid IS NULL OR p.id=$5)
      LEFT JOIN core."deliveryCommitmentLine" l ON l.id=c."lineId" AND l."workspaceId"=i."workspaceId" AND l."periodId"=p.id
      WHERE i."workspaceId"=$1 AND i."batchId"=$2 AND i.active=true ORDER BY i.id DESC LIMIT $6`,
      [
        workspace.id,
        selected.id,
        project.id,
        project.companyId,
        selected.periodId,
        MAX_BATCH_TASKS + 1,
        (operations.clients?.engagements ?? [])
          .filter(
            (engagement) =>
              engagement.projectId === project.id &&
              engagement.companyId === project.companyId,
          )
          .map((engagement) => engagement.id),
      ],
    );
    if (rows.length > MAX_BATCH_TASKS)
      throw new ConflictException(
        'This batch exceeds its supported size. Split the planning batch before continuing.',
      );
    const taskRows = rows.map((row): DeliveryBatchTaskDTO & { id: string } => {
      const latest =
        row.details?.submissions[row.details.submissions.length - 1];
      const fulfilment = operations.fulfilments.find(
        (item) => item.taskId === row.taskId,
      );
      return {
        id: row.id,
        taskId: row.taskId,
        title: row.title ?? row.taskName,
        concept: row.concept,
        available: Boolean(row.details),
        state: row.details?.state ?? null,
        taskRevision: row.taskRevision,
        assigneeName: row.assigneeName,
        reviewerName: row.reviewerName,
        submissionVersion: latest?.version ?? null,
        unit: row.allocation ? (row.unit ?? 'UNCLASSIFIED') : 'UNCLASSIFIED',
        approved: Boolean(
          row.details?.state === 'APPROVED' &&
          latest?.decision === 'APPROVED' &&
          latest.reviewedAt,
        ),
        fulfilled: row.allocation
          ? commitmentCredit(row.allocation, row.details, fulfilment).credited
          : currentCommitmentEvidence(row.details, fulfilment).valid,
      };
    });
    const counts = new Map<string, DeliveryBatchCountDTO>([
      ['ALL', { key: 'ALL', total: 0, approved: 0, fulfilled: 0 }],
    ]);
    for (const row of taskRows)
      for (const key of ['ALL', row.available ? row.unit : 'UNAVAILABLE']) {
        const count = counts.get(key) ?? {
          key,
          total: 0,
          approved: 0,
          fulfilled: 0,
        };
        count.total++;
        count.approved += Number(row.approved);
        count.fulfilled += Number(row.fulfilled);
        counts.set(key, count);
      }
    response.counts = [...counts.values()];
    const taskCursor = this.cursor(
      input.taskCursor,
      workspace.id,
      input,
      'tasks',
    );
    const page = taskRows.filter(
      (row) => !taskCursor || row.id < taskCursor.id,
    );
    response.tasks = page.slice(0, limit);
    response.nextTaskCursor =
      page.length > limit
        ? this.encode(workspace.id, input, 'tasks', page[limit - 1].id)
        : null;
    const historyCursor = this.cursor(
      input.historyCursor,
      workspace.id,
      input,
      'history',
    );
    const history = manager
      .getRepository(DeliveryBatchEventEntity)
      .createQueryBuilder('event')
      .where('event."workspaceId"=:workspaceId AND event."batchId"=:batchId', {
        workspaceId: workspace.id,
        batchId: selected.id,
      })
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .take(limit + 1);
    if (historyCursor)
      history.andWhere(
        '(event."createdAt",event.id)<(:at::timestamptz,:id::uuid)',
        historyCursor,
      );
    const events = await history.getMany();
    response.history = events.slice(0, limit).map((event) => ({
      ...event,
      occurredAt: event.createdAt.toISOString(),
    }));
    response.nextHistoryCursor =
      events.length > limit
        ? this.encode(
            workspace.id,
            input,
            'history',
            events[limit - 1].id,
            events[limit - 1].createdAt,
          )
        : null;
    if (actor.isManager && !selected.closed) {
      const options: DeliveryBatchTaskOptionDTO[] = await manager.query(
        `SELECT t.id AS "taskId",t.title,d.revision AS "taskRevision" FROM core."deliveryTask" d JOIN ${schema}.task t ON t.id=d."taskId" AND t."deletedAt" IS NULL WHERE d."workspaceId"=$1 AND d."projectId"=$2 AND strpos(lower(t.title),lower($3))>0 AND NOT EXISTS (SELECT 1 FROM core."deliveryBatchItem" i WHERE i."workspaceId"=$1 AND i."batchId"=$4 AND i."taskId"=d."taskId" AND i.active=true) ORDER BY t.title,t.id LIMIT 51`,
        [workspace.id, project.id, input.search ?? '', selected.id],
      );
      response.taskOptions = options.slice(0, 50);
      response.moreTaskOptions = options.length > 50;
    }
    return response;
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parse(batchesQuerySchema, input);
    return readDeliveryOperations(
      this.dataSource,
      workspace.id,
      (operations, manager) =>
        this.read(
          workspace,
          memberId,
          userWorkspaceId,
          parsed,
          operations,
          manager,
        ),
    );
  }

  private transaction<TResult>(
    workspaceId: string,
    operation: (manager: EntityManager) => Promise<TResult>,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${workspaceId}`],
      );
      return operation(manager);
    });
  }

  private async record(
    workspace: WorkspaceEntity,
    manager: EntityManager,
    batch: DeliveryBatchEntity,
    memberId: string,
    action: string,
    reason: string,
    changed: CommitmentChange[],
    item?: DeliveryBatchItemEntity,
  ) {
    const people: { name: string }[] = await manager.query(
      `SELECT trim(concat_ws(' ',"nameFirstName","nameLastName")) AS name FROM ${this.delivery.schema(workspace)}."workspaceMember" WHERE id=$1`,
      [memberId],
    );
    await manager.getRepository(DeliveryBatchEventEntity).insert({
      workspaceId: workspace.id,
      batchId: batch.id,
      actorId: memberId,
      actorName: people[0]?.name || 'Former team member',
      action,
      reason,
      changes: changed,
      taskId: item?.taskId ?? null,
      taskName: item?.taskName ?? null,
      createdAt: new Date(),
    });
    await recordOtogrowActivity(manager, {
      workspaceId: workspace.id,
      actorId: memberId,
      actorType: 'HUMAN',
      category: 'DELIVERY',
      action,
      outcome: 'RECORDED',
      summary:
        'Updated a production batch plan without changing task approvals.',
      projectId: batch.projectId,
      taskId: item?.taskId,
      sourceType: 'delivery-batch',
      sourceId: batch.id,
      changes: [
        {
          field: 'revision',
          before: String(batch.revision - 1),
          after: String(batch.revision),
        },
      ],
    });
  }

  private result(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    projectId: string,
    batchId: string,
    manager: EntityManager,
  ) {
    return readDeliveryOperations(
      this.dataSource,
      workspace.id,
      (operations, transactionManager) =>
        this.read(
          workspace,
          memberId,
          userWorkspaceId,
          { projectId, batchId, includeClosed: true },
          operations,
          transactionManager,
        ),
      manager,
    );
  }

  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parse(batchSaveSchema, input);
    return this.transaction(workspace.id, async (manager) => {
      const { project } = await this.scope(
        workspace,
        memberId,
        userWorkspaceId,
        parsed.projectId,
        manager,
        true,
      );
      const repository = manager.getRepository(DeliveryBatchEntity);
      const previous = await repository.findOneBy({ id: parsed.id });
      if (
        previous &&
        (previous.workspaceId !== workspace.id ||
          previous.projectId !== parsed.projectId)
      )
        throw new NotFoundException('Batch not available.');
      if ((previous?.revision ?? 0) !== parsed.revision)
        throw new ConflictException(
          'This batch changed. Refresh before saving.',
        );
      if (previous?.closed)
        throw new ConflictException(
          'Reopen the batch before changing its plan.',
        );
      if (parsed.periodId) {
        const period = await manager
          .getRepository(DeliveryCommitmentPeriodEntity)
          .findOneBy({
            workspaceId: workspace.id,
            id: parsed.periodId,
            projectId: parsed.projectId,
          });
        if (!period || period.clientId !== project.companyId)
          throw new BadRequestException(
            'Choose a commitment period for this project.',
          );
      }
      const after = {
        label: parsed.label,
        periodId: parsed.periodId,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        timezone: parsed.timezone,
      };
      const changed = changes(previous ? { ...previous } : {}, after);
      if (!changed.length)
        throw new BadRequestException('Change the batch plan before saving.');
      const batch = repository.create({
        ...previous,
        ...after,
        id: parsed.id,
        workspaceId: workspace.id,
        projectId: parsed.projectId,
        closed: false,
        revision: parsed.revision + 1,
      });
      await repository.save(batch);
      await this.record(
        workspace,
        manager,
        batch,
        memberId,
        previous ? 'BATCH_UPDATED' : 'BATCH_CREATED',
        parsed.reason,
        changed,
      );
      return this.result(
        workspace,
        memberId,
        userWorkspaceId,
        parsed.projectId,
        batch.id,
        manager,
      );
    });
  }

  async state(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parse(batchStateSchema, input);
    return this.transaction(workspace.id, async (manager) => {
      await this.scope(
        workspace,
        memberId,
        userWorkspaceId,
        parsed.projectId,
        manager,
        true,
      );
      const batch = await this.batch(
        manager,
        workspace.id,
        parsed.projectId,
        parsed.batchId,
        parsed.revision,
      );
      if (batch.closed === parsed.closed)
        throw new BadRequestException('The batch already has this state.');
      batch.closed = parsed.closed;
      batch.revision++;
      await manager.getRepository(DeliveryBatchEntity).save(batch);
      await this.record(
        workspace,
        manager,
        batch,
        memberId,
        parsed.closed ? 'BATCH_CLOSED' : 'BATCH_REOPENED',
        parsed.reason,
        [
          {
            field: 'closed',
            before: String(!parsed.closed),
            after: String(parsed.closed),
          },
        ],
      );
      return this.result(
        workspace,
        memberId,
        userWorkspaceId,
        parsed.projectId,
        batch.id,
        manager,
      );
    });
  }

  async item(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parse(batchItemSchema, input);
    return this.transaction(workspace.id, async (manager) => {
      await this.scope(
        workspace,
        memberId,
        userWorkspaceId,
        parsed.projectId,
        manager,
        true,
      );
      const batch = await this.batch(
        manager,
        workspace.id,
        parsed.projectId,
        parsed.batchId,
        parsed.revision,
      );
      if (batch.closed)
        throw new ConflictException(
          'Reopen the batch before changing its plan.',
        );
      const repository = manager.getRepository(DeliveryBatchItemEntity);
      const previous = await repository.findOneBy({
        workspaceId: workspace.id,
        batchId: batch.id,
        taskId: parsed.taskId,
      });
      if (!parsed.active && !previous?.active)
        throw new BadRequestException('This task is not in the batch.');
      let title = previous?.taskName ?? '';
      if (parsed.active) {
        const task = await manager.getRepository(DeliveryTaskEntity).findOneBy({
          workspaceId: workspace.id,
          projectId: batch.projectId,
          taskId: parsed.taskId,
        });
        const native: { title: string }[] = await manager.query(
          `SELECT title FROM ${this.delivery.schema(workspace)}.task WHERE id=$1 AND "deletedAt" IS NULL`,
          [parsed.taskId],
        );
        if (!task || !native[0])
          throw new NotFoundException('Task not available in this project.');
        if (parsed.taskRevision !== task.revision)
          throw new ConflictException(
            'This task changed. Refresh before adding it.',
          );
        title = native[0].title;
        if (
          !previous?.active &&
          (await repository.countBy({
            workspaceId: workspace.id,
            batchId: batch.id,
            active: true,
          })) >= MAX_BATCH_TASKS
        )
          throw new BadRequestException(
            `A planning batch can contain up to ${MAX_BATCH_TASKS} tasks. Create another batch.`,
          );
      }
      const after = {
        active: parsed.active,
        concept: parsed.active ? parsed.concept : (previous?.concept ?? ''),
      };
      const changed = changes(previous ? { ...previous } : {}, after);
      if (!changed.length)
        throw new BadRequestException(
          'This task is already in the batch with the same concept.',
        );
      const item = repository.create({
        ...previous,
        workspaceId: workspace.id,
        batchId: batch.id,
        taskId: parsed.taskId,
        taskName: title,
        ...after,
      });
      await repository.save(item);
      batch.revision++;
      await manager.getRepository(DeliveryBatchEntity).save(batch);
      await this.record(
        workspace,
        manager,
        batch,
        memberId,
        !parsed.active
          ? 'BATCH_TASK_REMOVED'
          : previous?.active
            ? 'BATCH_CONCEPT_UPDATED'
            : 'BATCH_TASK_ADDED',
        parsed.reason,
        changed,
        item,
      );
      return this.result(
        workspace,
        memberId,
        userWorkspaceId,
        parsed.projectId,
        batch.id,
        manager,
      );
    });
  }
}
