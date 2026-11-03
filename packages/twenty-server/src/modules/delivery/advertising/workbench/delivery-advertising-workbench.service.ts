import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, type EntityManager } from 'typeorm';
import { z } from 'zod';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { canUseDeliveryAgent } from 'src/modules/delivery/agents/delivery-agent-access';
import { validateAdvertisingActionOrigin } from 'src/modules/delivery/advertising/drafts/read-advertising-draft-basis';
import { DeliveryAdvertisingSourcesService } from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.service';
import { type AdvertisingSourceEnvelope } from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.types';
import { DeliveryAdvertisingReviewEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-review.entity';
import { DeliveryAdvertisingActionEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-action.entity';
import { DeliveryAdvertisingObservationEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-observation.entity';
import { DeliveryAdvertisingEventEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-event.entity';
import { readAdvertisingTask } from 'src/modules/delivery/advertising/workbench/read-advertising-task';
import {
  advertisingSourceKindSchema,
  assignAdvertisingReviewSchema,
  observeAdvertisingActionSchema,
  saveAdvertisingReviewSchema,
  type AdvertisingActionInput,
  type AdvertisingEventResult,
  type AdvertisingLegacyHandling,
  type AdvertisingMetric,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';
import {
  advertisingChoicesSchema,
  advertisingCursor,
  advertisingHash,
  advertisingObservationsSchema,
  advertisingReceiptSchema,
  advertisingReviewsSchema,
  advertisingSelectionSchema,
  advertisingTimestampSql,
  parseAdvertisingInput,
  readAdvertisingCursor,
  assertAdvertisingLegacyDecision,
  assertAdvertisingObservationMetric,
  assertAdvertisingObservationSource,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  type DeliveryAdvertisingCommandReceiptDTO,
  type DeliveryAdvertisingIdentityDTO,
  type DeliveryAdvertisingReviewDetailDTO,
  type DeliveryAdvertisingWriteResultDTO,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.dto';

const asDate = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : value;
const sourceInputSchema = z
  .object({
    kind: advertisingSourceKindSchema,
    id: z.uuid(),
    adOffset: z.number().int().nonnegative().nullish(),
    metricAdId: z.string().min(1).max(100).nullish(),
    metadataOnly: z.boolean().nullish(),
  })
  .strict();
const isManager = (capabilities: string[]) =>
  capabilities.some((value) =>
    ['workspace.admin', 'delivery.manage'].includes(value),
  );

@Injectable()
export class DeliveryAdvertisingWorkbenchService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
    private readonly sourceAdapter: DeliveryAdvertisingSourcesService,
  ) {}

  private async write<TResult>(
    workspaceId: string,
    operation: (manager: EntityManager) => Promise<TResult>,
    transactionManager?: EntityManager,
  ) {
    if (
      transactionManager &&
      !transactionManager.queryRunner?.isTransactionActive
    )
      throw new Error('Advertising writes require an active transaction.');
    const apply = async (manager: EntityManager) => {
      // Task creation takes this same exclusive lock; never upgrade a shared lock after a domain lock.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery:${workspaceId}`],
      );
      return operation(manager);
    };
    try {
      return await (transactionManager
        ? apply(transactionManager)
        : this.dataSource.transaction(apply));
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        'code' in error.driverError &&
        error.driverError.code === '23505'
      )
        throw new ConflictException(
          'This advertising request or draft already exists. Check its exact saved result before continuing.',
        );
      throw error;
    }
  }

  private identity(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    actor: AdvertisingSourceEnvelope['actor'],
  ): DeliveryAdvertisingIdentityDTO {
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      actor,
      observedAt: new Date().toISOString(),
    };
  }

  private receiptDto(
    event: DeliveryAdvertisingEventEntity,
  ): DeliveryAdvertisingCommandReceiptDTO {
    return {
      requestId: event.id,
      action: event.action,
      actorId: event.actorId,
      createdAt: asDate(event.createdAt),
      ...event.result,
    };
  }

  private packetBoundary(
    packet: DeliveryAdvertisingReviewEntity,
    source: AdvertisingSourceEnvelope,
  ) {
    const changed =
      packet.projectId !== source.source.projectId ||
      packet.source.companyId !== source.source.companyId;
    if (changed && !source.actor.isAdmin)
      throw new ForbiddenException(
        'The original client project is no longer available in this advertising view.',
      );
    return changed;
  }

  private async packet(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    id: string,
    metrics = false,
  ) {
    const packet = await manager
      .getRepository(DeliveryAdvertisingReviewEntity)
      .findOneBy({ workspaceId: workspace.id, id });
    if (!packet)
      throw new NotFoundException('Advertising review is unavailable.');
    const source = await this.sourceAdapter.read(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      { kind: packet.sourceKind, id: packet.sourceId },
      0,
      packet.goal.metricAdId,
      !metrics,
    );
    if (packet.state === 'DRAFT' && !source.actor.isManager)
      throw new NotFoundException('Advertising review is unavailable.');
    const changed = this.packetBoundary(packet, source);
    return { packet, source, changed };
  }

  private async replay(
    manager: EntityManager,
    workspaceId: string,
    memberId: string,
    requestId: string,
    action: DeliveryAdvertisingEventEntity['action'],
    input: unknown,
  ) {
    const event = await manager
      .getRepository(DeliveryAdvertisingEventEntity)
      .findOneBy({ workspaceId, id: requestId });
    if (!event) return null;
    if (
      event.actorId !== memberId ||
      event.action !== action ||
      event.inputHash !== advertisingHash(input)
    )
      throw new ConflictException(
        'This request identity belongs to another saved command. Check it before preparing a new change.',
      );
    return event;
  }

  private async event(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    packet: DeliveryAdvertisingReviewEntity,
    actions: DeliveryAdvertisingActionEntity[],
    requestId: string,
    action: DeliveryAdvertisingEventEntity['action'],
    input: unknown,
    observationId: string | null = null,
  ) {
    const result: AdvertisingEventResult = {
      reviewId: packet.id,
      revision: packet.revision,
      state: packet.state,
      actionTasks: actions.flatMap((item) =>
        item.taskId ? [{ actionId: item.id, taskId: item.taskId }] : [],
      ),
      observationId,
    };
    const createdAt = new Date();
    const value = {
      id: requestId,
      workspaceId: workspace.id,
      reviewId: packet.id,
      actorId: memberId,
      action,
      inputHash: advertisingHash(input),
      result,
      createdAt,
      definition:
        action === 'OBSERVED'
          ? null
          : {
              source: packet.source,
              goal: packet.goal,
              note: packet.note,
              noChangeReason: packet.noChangeReason,
              legacyHandling: packet.legacyHandling,
              actions: actions.map((item) => item.definition),
            },
    };
    await manager.getRepository(DeliveryAdvertisingEventEntity).insert(value);
    await recordOtogrowActivity(manager, {
      workspaceId: workspace.id,
      actorId: memberId,
      projectId: packet.projectId,
      category: 'ADVERTISING',
      action: `ADVERTISING_WORK_${action}`,
      outcome: action === 'ASSIGNED' ? 'APPROVED' : 'RECORDED',
      summary:
        action === 'ASSIGNED'
          ? actions.length
            ? 'Reviewed advertising recommendations and recorded their explicit task assignments.'
            : 'Reviewed an advertising report and recorded that no changes were needed.'
          : action === 'OBSERVED'
            ? 'Recorded an advertising outcome observation or correction.'
            : 'Saved an advertising recommendation draft.',
      sourceType: packet.sourceKind === 'META' ? 'meta-report' : 'ad-report',
      sourceId: packet.sourceId,
      changes: [
        { field: 'revision', before: null, after: String(packet.revision) },
        { field: 'state', before: null, after: packet.state },
      ],
    });
    return manager.getRepository(DeliveryAdvertisingEventEntity).create(value);
  }

  async context(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    transactionManager?: EntityManager,
  ) {
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
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, actor),
          canManage: actor.isManager,
        };
      },
      transactionManager,
    );
  }

  async sources(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
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
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, actor),
          ...(await this.sourceAdapter.list(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            input,
          )),
        };
      },
      transactionManager,
    );
  }

  async source(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
    const selected = parseAdvertisingInput(sourceInputSchema, input);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const source = await this.sourceAdapter.read(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          { kind: selected.kind, id: selected.id },
          selected.adOffset ?? 0,
          selected.metricAdId ?? null,
          selected.metadataOnly ?? false,
        );
        return {
          ...source,
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
        };
      },
      transactionManager,
    );
  }

  async receipt(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
    const selected = parseAdvertisingInput(advertisingReceiptSchema, input);
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
        const event = await manager
          .getRepository(DeliveryAdvertisingEventEntity)
          .findOneBy({ workspaceId: workspace.id, id: selected.requestId });
        if (!event)
          return {
            ...this.identity(workspace, memberId, userWorkspaceId, actor),
            receipt: null,
          };
        await this.packet(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          event.reviewId,
        );
        if (!actor.isManager && event.actorId !== memberId)
          throw new ForbiddenException();
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, actor),
          receipt: this.receiptDto(event),
        };
      },
      transactionManager,
    );
  }

  private task(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    projectId: string | null,
    taskId: string | null,
  ) {
    return readAdvertisingTask(
      manager,
      workspace.id,
      this.delivery.schema(workspace),
      projectId,
      taskId,
    );
  }

  private async actions(
    manager: EntityManager,
    workspaceId: string,
    reviewId: string,
  ) {
    return manager.getRepository(DeliveryAdvertisingActionEntity).find({
      where: { workspaceId, reviewId },
      order: { position: 'ASC' },
      take: 21,
    });
  }

  async review(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryAdvertisingReviewDetailDTO> {
    const selected = parseAdvertisingInput(advertisingSelectionSchema, input);
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
        const found = await manager
          .getRepository(DeliveryAdvertisingReviewEntity)
          .existsBy({ workspaceId: workspace.id, id: selected.id });
        if (!found)
          return {
            ...this.identity(workspace, memberId, userWorkspaceId, actor),
            review: null,
            canEdit: false,
            canAssign: false,
            blockingReasons: ['REVIEW_UNAVAILABLE'],
            currentSourceFingerprint: null,
            legacyTask: null,
            legacyAdoptedReviewId: null,
          };
        const { packet, source, changed } = await this.packet(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          selected.id,
        );
        const actions = await this.actions(manager, workspace.id, packet.id);
        if (actions.length > 20)
          throw new ConflictException(
            'The saved recommendation packet exceeds its supported bound.',
          );
        const legacyTask = await this.task(
          manager,
          workspace,
          packet.projectId,
          source.legacyTaskId,
        );
        const adopted = source.legacyTaskId
          ? await manager
              .getRepository(DeliveryAdvertisingActionEntity)
              .findOneBy({
                workspaceId: workspace.id,
                taskId: source.legacyTaskId,
              })
          : null;
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, actor),
          review: {
            id: packet.id,
            revision: packet.revision,
            state: packet.state,
            source: packet.source,
            goal: packet.goal,
            note: packet.note,
            noChangeReason: packet.noChangeReason,
            legacyHandling: packet.legacyHandling,
            createdBy: packet.createdBy,
            assignedBy: packet.assignedBy,
            assignedAt: packet.assignedAt ? asDate(packet.assignedAt) : null,
            createdAt: asDate(packet.createdAt),
            actions: await Promise.all(
              actions.map(async (action) => ({
                ...action.definition,
                origin: action.definition.origin ?? null,
                ownerName: action.ownerName,
                reviewerName: action.reviewerName,
                taskId: action.taskId,
                assistantVersion: action.assistantVersion,
                assistantName: action.assistantName,
                task: await this.task(
                  manager,
                  workspace,
                  packet.projectId,
                  action.taskId,
                ),
              })),
            ),
          },
          canEdit:
            !changed &&
            actor.isManager &&
            source.canManageDraft &&
            packet.state === 'DRAFT',
          canAssign:
            !changed &&
            source.canReview &&
            packet.state === 'DRAFT' &&
            packet.source.fingerprint === source.fingerprint,
          blockingReasons: [
            ...source.reasonCodes,
            ...(changed ? ['ORIGINAL_CLIENT_CHANGED'] : []),
            ...(packet.state === 'DRAFT' &&
            packet.source.fingerprint !== source.fingerprint
              ? ['SOURCE_CHANGED']
              : []),
            ...(packet.state === 'ASSIGNED' &&
            (packet.source.evidenceFingerprint !== source.evidenceFingerprint ||
              advertisingHash(packet.source.routing) !==
                advertisingHash(source.source.routing))
              ? ['SOURCE_LATER_CHANGED']
              : []),
          ],
          currentSourceFingerprint: source.fingerprint,
          legacyTask,
          legacyAdoptedReviewId: adopted?.reviewId ?? null,
        };
      },
      transactionManager,
    );
  }

  private async validateAction(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    source: AdvertisingSourceEnvelope,
    definition: AdvertisingActionInput,
    adoption = false,
  ) {
    if (
      !source.project ||
      !source.project.memberIds.includes(definition.ownerId)
    )
      throw new BadRequestException(
        'Choose an active owner assigned to the original project.',
      );
    const owner = await this.access.getAccess(
      workspace.id,
      definition.ownerId,
      manager,
    );
    const reviewer = await this.access.getAccess(
      workspace.id,
      definition.reviewerId,
      manager,
    );
    const canReview =
      isManager(reviewer.capabilities) ||
      (adoption &&
        source.project.memberIds.includes(reviewer.memberId) &&
        reviewer.capabilities.includes('delivery.review'));
    if (!canReview || owner.memberId === reviewer.memberId)
      throw new BadRequestException('Choose a separate eligible reviewer.');
    const members = await manager.query<{ id: string; name: string }[]>(
      `SELECT id,trim(concat_ws(' ',"nameFirstName","nameLastName")) AS name FROM ${this.delivery.schema(workspace)}."workspaceMember" WHERE id=ANY($1::uuid[]) AND "deletedAt" IS NULL`,
      [[owner.memberId, reviewer.memberId]],
    );
    let assistant: DeliveryAgentEntity | null = null;
    if (definition.assistantId) {
      assistant = await manager
        .getRepository(DeliveryAgentEntity)
        .findOneBy({ workspaceId: workspace.id, id: definition.assistantId });
      if (
        !assistant?.configuration.enabled ||
        !['BRIEF', 'COPY', 'SEO'].includes(assistant.configuration.kind) ||
        !assistant.configuration.projectIds.includes(source.project.id) ||
        !canUseDeliveryAgent(assistant.configuration, {
          roleIds: owner.roleIds,
          isAdmin: owner.capabilities.includes('workspace.admin'),
          isManager: isManager(owner.capabilities),
        })
      )
        throw new BadRequestException(
          'Choose an enabled assistant permitted for this owner and project. Running it still requires the existing preview and budget checks.',
        );
    }
    return {
      ownerName:
        members.find((member) => member.id === owner.memberId)?.name ??
        'Team member',
      reviewerName:
        members.find((member) => member.id === reviewer.memberId)?.name ??
        'Team member',
      assistantVersion: assistant?.version ?? null,
      assistantName: assistant?.configuration.name ?? null,
    };
  }

  async state(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
    const selected = parseAdvertisingInput(advertisingSelectionSchema, input);
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
        if (
          !(await manager
            .getRepository(DeliveryAdvertisingReviewEntity)
            .existsBy({ workspaceId: workspace.id, id: selected.id }))
        )
          return {
            ...this.identity(workspace, memberId, userWorkspaceId, actor),
            review: null,
            currentSourceFingerprint: null,
            canEdit: false,
            canAssign: false,
            blockingReasons: ['REVIEW_UNAVAILABLE'],
            tasks: [],
          };
        const { packet, source, changed } = await this.packet(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          selected.id,
        );
        const tasks: {
          actionId: string;
          taskId: string;
          revision: number | null;
          state: string;
        }[] = await manager.query(
          `SELECT action.id AS "actionId",action."taskId",CASE WHEN native.id IS NULL THEN NULL ELSE task.revision END AS revision,
          CASE WHEN native.id IS NULL THEN 'UNAVAILABLE' ELSE task.details->>'state' END AS state
        FROM core."deliveryAdvertisingAction" action
        LEFT JOIN core."deliveryTask" task ON task."workspaceId"=action."workspaceId" AND task."taskId"=action."taskId" AND task."projectId"=$3
        LEFT JOIN ${this.delivery.schema(workspace)}.task native ON native.id=task."taskId" AND native."deletedAt" IS NULL
        WHERE action."workspaceId"=$1 AND action."reviewId"=$2 AND action."taskId" IS NOT NULL ORDER BY action.position LIMIT 20`,
          [workspace.id, packet.id, packet.projectId],
        );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, actor),
          review: {
            id: packet.id,
            revision: packet.revision,
            state: packet.state,
            sourceKind: packet.sourceKind,
            sourceId: packet.sourceId,
          },
          currentSourceFingerprint: source.fingerprint,
          tasks,
          canEdit:
            !changed &&
            actor.isManager &&
            source.canManageDraft &&
            packet.state === 'DRAFT',
          canAssign:
            !changed &&
            source.canReview &&
            packet.state === 'DRAFT' &&
            packet.source.fingerprint === source.fingerprint,
          blockingReasons: [
            ...source.reasonCodes,
            ...(changed ? ['ORIGINAL_CLIENT_CHANGED'] : []),
            ...(packet.state === 'DRAFT' &&
            packet.source.fingerprint !== source.fingerprint
              ? ['SOURCE_CHANGED']
              : []),
          ],
        };
      },
      transactionManager,
    );
  }

  private async validateLegacy(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    source: AdvertisingSourceEnvelope,
    handling: AdvertisingLegacyHandling,
    definitions: AdvertisingActionInput[],
  ) {
    const task = await this.task(
      manager,
      workspace,
      source.source.projectId,
      source.legacyTaskId,
    );
    const alreadyAdopted = Boolean(
      source.legacyTaskId &&
      (await manager
        .getRepository(DeliveryAdvertisingActionEntity)
        .existsBy({ workspaceId: workspace.id, taskId: source.legacyTaskId })),
    );
    assertAdvertisingLegacyDecision(
      source.legacyTaskId,
      task,
      handling,
      definitions,
      alreadyAdopted,
    );
  }

  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryAdvertisingWriteResultDTO> {
    const command = parseAdvertisingInput(saveAdvertisingReviewSchema, input);
    return this.write(
      workspace.id,
      async (manager) => {
        const source = await this.sourceAdapter.read(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          { kind: command.sourceKind, id: command.sourceId },
          0,
          command.goal.metricAdId,
        );
        if (
          !source.actor.isManager ||
          !source.canManageDraft ||
          !source.project
        )
          throw new ForbiddenException(
            'A currently authorized manager and mapped original project are required.',
          );
        const prior = await this.replay(
          manager,
          workspace.id,
          memberId,
          command.requestId,
          'SAVED',
          command,
        );
        if (prior) {
          await this.packet(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            prior.reviewId,
          );
          return {
            ...this.identity(
              workspace,
              memberId,
              userWorkspaceId,
              source.actor,
            ),
            receipt: this.receiptDto(prior),
          };
        }
        if (source.fingerprint !== command.sourceFingerprint)
          throw new ConflictException(
            'The report or its responsibilities changed. Refresh its exact evidence before saving.',
          );
        const repository = manager.getRepository(
          DeliveryAdvertisingReviewEntity,
        );
        const existing = await repository.findOneBy({
          workspaceId: workspace.id,
          id: command.id,
        });
        if (
          existing &&
          (existing.state !== 'DRAFT' ||
            existing.revision !== command.revision ||
            existing.sourceKind !== command.sourceKind ||
            existing.sourceId !== command.sourceId ||
            this.packetBoundary(existing, source))
        )
          throw new ConflictException(
            'This packet changed or is already immutable. Open its current version before continuing.',
          );
        if (!existing && command.revision !== 0)
          throw new ConflictException(
            'This draft is unavailable. Check its exact saved request.',
          );
        await this.validateLegacy(
          manager,
          workspace,
          source,
          command.legacyHandling,
          command.actions,
        );
        const goal = this.sourceAdapter.validateGoal(source, command.goal);
        const definitions = await Promise.all(
          command.actions.map(async (definition, position) => ({
            id: definition.id,
            workspaceId: workspace.id,
            reviewId: command.id,
            position,
            definition: {
              ...definition,
              origin: await validateAdvertisingActionOrigin(
                manager,
                workspace.id,
                source,
                goal,
                definition,
              ),
            },
            taskId: null,
            ...(await this.validateAction(
              manager,
              workspace,
              source,
              definition,
              definition.adoptTaskId !== null,
            )),
          })),
        );
        const values = {
          sourceKind: command.sourceKind,
          sourceId: command.sourceId,
          projectId: source.project.id,
          revision: command.revision + 1,
          state: 'DRAFT' as const,
          source: source.source,
          goal,
          note: command.note,
          noChangeReason: command.noChangeReason,
          legacyHandling: command.legacyHandling,
        };
        if (existing) {
          const updated = await repository.update(
            {
              workspaceId: workspace.id,
              id: existing.id,
              revision: command.revision,
              state: 'DRAFT',
            },
            values,
          );
          if (updated.affected !== 1)
            throw new ConflictException('The packet changed while saving.');
        } else
          await repository.insert({
            id: command.id,
            workspaceId: workspace.id,
            ...values,
            createdBy: memberId,
            assignedBy: null,
            assignedAt: null,
          });
        const oldActions = await this.actions(
          manager,
          workspace.id,
          command.id,
        );
        const actionRepository = manager.getRepository(
          DeliveryAdvertisingActionEntity,
        );
        for (const definition of definitions) {
          if (oldActions.some((item) => item.id === definition.id))
            await actionRepository.update(
              {
                workspaceId: workspace.id,
                reviewId: command.id,
                id: definition.id,
              },
              definition,
            );
          else await actionRepository.insert(definition);
        }
        const removed = oldActions.filter(
          (item) =>
            !definitions.some((definition) => definition.id === item.id),
        );
        if (removed.length)
          await actionRepository.delete({
            workspaceId: workspace.id,
            reviewId: command.id,
            id: In(removed.map((item) => item.id)),
          });
        const packet = await repository.findOneByOrFail({
          workspaceId: workspace.id,
          id: command.id,
        });
        const event = await this.event(
          manager,
          workspace,
          memberId,
          packet,
          await this.actions(manager, workspace.id, packet.id),
          command.requestId,
          'SAVED',
          command,
        );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
          receipt: this.receiptDto(event),
        };
      },
      transactionManager,
    );
  }

  async assign(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryAdvertisingWriteResultDTO> {
    const command = parseAdvertisingInput(assignAdvertisingReviewSchema, input);
    return this.write(
      workspace.id,
      async (manager) => {
        const { packet, source, changed } = await this.packet(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          command.id,
          true,
        );
        if (!source.actor.isManager || !source.canReview || changed)
          throw new ForbiddenException(
            'Current independent report review authority is required.',
          );
        const prior = await this.replay(
          manager,
          workspace.id,
          memberId,
          command.requestId,
          'ASSIGNED',
          command,
        );
        if (prior)
          return {
            ...this.identity(
              workspace,
              memberId,
              userWorkspaceId,
              source.actor,
            ),
            receipt: this.receiptDto(prior),
          };
        if (
          packet.state !== 'DRAFT' ||
          packet.revision !== command.revision ||
          packet.source.fingerprint !== command.sourceFingerprint ||
          source.fingerprint !== command.sourceFingerprint
        )
          throw new ConflictException(
            'Review the current report, responsibilities and recommendation packet before assignment.',
          );
        const actions = await this.actions(manager, workspace.id, packet.id);
        if (
          actions.length > 20 ||
          (!actions.length && !packet.noChangeReason.trim())
        )
          throw new BadRequestException(
            'Add recommendations or explain an explicit no-change review.',
          );
        const currentGoal = this.sourceAdapter.validateGoal(
          source,
          packet.goal,
        );
        if (advertisingHash(currentGoal) !== advertisingHash(packet.goal))
          throw new ConflictException(
            'The selected primary outcome changed. Review its evidence again.',
          );
        await this.validateLegacy(
          manager,
          workspace,
          source,
          packet.legacyHandling,
          actions.map((action) => action.definition),
        );
        for (const action of actions) {
          await validateAdvertisingActionOrigin(
            manager,
            workspace.id,
            source,
            currentGoal,
            action.definition,
          );
          const current = await this.validateAction(
            manager,
            workspace,
            source,
            action.definition,
            action.definition.adoptTaskId !== null,
          );
          if (current.assistantVersion !== action.assistantVersion)
            throw new ConflictException(
              'An attached assistant changed. Review it before assigning.',
            );
        }
        await this.sourceAdapter.approve(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          { kind: packet.sourceKind, id: packet.sourceId },
          source.fingerprint,
          packet.note,
        );
        for (const action of actions) {
          if (action.definition.adoptTaskId)
            action.taskId = action.definition.adoptTaskId;
          else {
            const fields = action.definition;
            const taskId = await this.delivery.command(
              workspace,
              memberId,
              userWorkspaceId,
              {
                action: 'create',
                projectId: packet.projectId,
                fields: {
                  title: fields.title,
                  brief: `Reviewed recommendation\n${fields.rationale}\n\nExpected result\n${fields.expectedResult}\n\nEvidence and instructions\n${fields.evidence}`,
                  service: 'PERFORMANCE_MARKETING',
                  priority: 'NORMAL',
                  scheduledDate: fields.dueDate,
                  dueAt: `${fields.dueDate}T23:59:00.000Z`,
                  assigneeId: fields.ownerId,
                  reviewerId: fields.reviewerId,
                  checklist: [],
                  evidence: [],
                },
              },
              manager,
            );
            if (typeof taskId !== 'string')
              throw new ConflictException(
                'The recommendation task could not be verified.',
              );
            action.taskId = taskId;
          }
          await manager
            .getRepository(DeliveryAdvertisingActionEntity)
            .update(
              { workspaceId: workspace.id, reviewId: packet.id, id: action.id },
              { taskId: action.taskId },
            );
        }
        const assignedAt = new Date();
        const updated = await manager
          .getRepository(DeliveryAdvertisingReviewEntity)
          .update(
            {
              workspaceId: workspace.id,
              id: packet.id,
              revision: command.revision,
              state: 'DRAFT',
            },
            {
              state: 'ASSIGNED',
              revision: packet.revision + 1,
              assignedBy: memberId,
              assignedAt,
            },
          );
        if (updated.affected !== 1)
          throw new ConflictException('This packet changed during assignment.');
        Object.assign(packet, {
          state: 'ASSIGNED',
          revision: packet.revision + 1,
          assignedBy: memberId,
          assignedAt,
        });
        const event = await this.event(
          manager,
          workspace,
          memberId,
          packet,
          actions,
          command.requestId,
          'ASSIGNED',
          command,
        );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
          receipt: this.receiptDto(event),
        };
      },
      transactionManager,
    );
  }

  async reviews(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
    const selected = parseAdvertisingInput(advertisingReviewsSchema, input);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const source = await this.sourceAdapter.read(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          { kind: selected.sourceKind, id: selected.sourceId },
          0,
          null,
          true,
        );
        const values = [
          workspace.id,
          selected.sourceKind,
          selected.sourceId,
          source.actor.isManager,
        ];
        const [totals]: {
          count: number;
          signature: string;
          currentDraftId: string | null;
        }[] = await manager.query(
          `SELECT count(*)::integer AS count,md5(COALESCE(jsonb_agg(jsonb_build_array(id,revision,state) ORDER BY id)::text,'[]')) AS signature,
          min(id::text) FILTER (WHERE state='DRAFT') AS "currentDraftId" FROM core."deliveryAdvertisingReview" WHERE "workspaceId"=$1 AND "sourceKind"=$2 AND "sourceId"=$3
          AND ($4::boolean OR state='ASSIGNED')`,
          values,
        );
        const scope = advertisingHash({
          identity: this.identity(
            workspace,
            memberId,
            userWorkspaceId,
            source.actor,
          ).actor,
          workspaceId: workspace.id,
          userWorkspaceId,
          source: source.fingerprint,
          signature: totals.signature,
        });
        const cursor = readAdvertisingCursor(selected.after, scope);
        const rows: {
          id: string;
          revision: number;
          state: string;
          createdAt: string;
          assignedAt: string | null;
          actionCount: number;
          goalKind: string;
        }[] = await manager.query(
          `SELECT review.id,review.revision,review.state,${advertisingTimestampSql('review."createdAt"')} AS "createdAt",review."assignedAt"::text AS "assignedAt",
          (SELECT count(*)::integer FROM core."deliveryAdvertisingAction" action WHERE action."workspaceId"=review."workspaceId" AND action."reviewId"=review.id) AS "actionCount",review.goal->>'kind' AS "goalKind"
        FROM core."deliveryAdvertisingReview" review WHERE review."workspaceId"=$1 AND review."sourceKind"=$2 AND review."sourceId"=$3
          AND ($4::boolean OR review.state='ASSIGNED')
          AND ($5::timestamptz IS NULL OR (review."createdAt",review.id)<($5::timestamptz,$6::uuid))
        ORDER BY review."createdAt" DESC,review.id DESC LIMIT $7`,
          [
            ...values,
            cursor?.key ?? null,
            cursor?.id ?? null,
            selected.limit + 1,
          ],
        );
        const items = rows.slice(0, selected.limit),
          last = items[items.length - 1];
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
          items,
          totalCount: totals.count,
          currentDraftId: totals.currentDraftId,
          scope,
          nextCursor:
            rows.length > selected.limit && last
              ? advertisingCursor(scope, last.createdAt, last.id)
              : null,
        };
      },
      transactionManager,
    );
  }

  async choices(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
    const selected = parseAdvertisingInput(advertisingChoicesSchema, input);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const source = await this.sourceAdapter.read(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          { kind: selected.sourceKind, id: selected.sourceId },
          0,
          null,
          true,
        );
        if (
          !source.actor.isManager ||
          !source.canManageDraft ||
          !source.project
        )
          throw new ForbiddenException();
        let choices: { id: string; name: string; version: number | null }[];
        if (selected.kind === 'ASSISTANT') {
          const owner = await this.access.getAccess(
            workspace.id,
            selected.ownerId!,
            manager,
          );
          if (!source.project.memberIds.includes(owner.memberId))
            throw new ForbiddenException(
              'Choose a current project owner first.',
            );
          const level = owner.capabilities.includes('workspace.admin')
            ? 'ADMIN'
            : isManager(owner.capabilities)
              ? 'MANAGER'
              : 'MEMBER';
          choices = await manager.query(
            `SELECT id,version,configuration->>'name' AS name FROM core."deliveryAgent" WHERE "workspaceId"=$1
          AND configuration->>'enabled'='true' AND configuration->>'kind' IN ('BRIEF','COPY','SEO') AND configuration->'projectIds' ? $2
          AND CASE WHEN configuration->'roleIds' IS NOT NULL AND configuration->'roleIds'<>'null'::jsonb
            THEN configuration->'roleIds' ?| $3::text[] ELSE configuration->'roles' ? $4 END
          ORDER BY configuration->>'name' COLLATE "C",id LIMIT 201`,
            [workspace.id, source.project.id, owner.roleIds, level],
          );
          if (choices.length > 200)
            throw new BadRequestException(
              'This project has more than 200 permitted assistants. Narrow its assistant configuration before selecting support.',
            );
        } else {
          const members = await this.access.listActiveMembers(
            workspace.id,
            manager,
          );
          if (members.length > 200)
            throw new BadRequestException(
              'The active people directory exceeds 200 members. This assignment selector requires a narrower directory.',
            );
          const reviewers =
            selected.kind === 'REVIEWER'
              ? new Set(
                  (await this.access.listAccess(workspace.id, manager))
                    .filter((item) => isManager(item.capabilities))
                    .map((item) => item.memberId),
                )
              : null;
          choices = members
            .filter((member) =>
              reviewers
                ? reviewers.has(member.memberId) &&
                  member.memberId !== selected.ownerId
                : source.project!.memberIds.includes(member.memberId),
            )
            .map((member) => ({
              id: member.memberId,
              name: member.name,
              version: null,
            }));
        }
        const search = selected.search?.toLocaleLowerCase() ?? '';
        choices = choices
          .filter(
            (item) => !search || item.name.toLocaleLowerCase().includes(search),
          )
          .sort(
            (left, right) =>
              left.name.localeCompare(right.name) ||
              left.id.localeCompare(right.id),
          );
        const scope = advertisingHash({
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          actor: source.actor,
          source: source.fingerprint,
          kind: selected.kind,
          ownerId: selected.ownerId,
          search,
          choices,
        });
        const cursor = readAdvertisingCursor(selected.after, scope, false);
        const previousIndex = cursor
          ? choices.findIndex(
              (item) => item.id === cursor.id && item.name === cursor.key,
            )
          : -1;
        if (cursor && previousIndex < 0)
          throw new ConflictException(
            'These choices changed. Return to their first page.',
          );
        const items = choices.slice(
            previousIndex + 1,
            previousIndex + 1 + selected.limit,
          ),
          last = items[items.length - 1];
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
          items,
          totalCount: choices.length,
          scope,
          nextCursor:
            last && previousIndex + 1 + items.length < choices.length
              ? advertisingCursor(scope, last.name, last.id)
              : null,
        };
      },
      transactionManager,
    );
  }

  async observations(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
    const selected = parseAdvertisingInput(
      advertisingObservationsSchema,
      input,
    );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const { source } = await this.packet(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          selected.reviewId,
        );
        const values = [
          workspace.id,
          selected.reviewId,
          selected.actionId ?? null,
        ];
        const [totals]: { count: number; signature: string }[] =
          await manager.query(
            `SELECT count(*)::integer AS count,md5(COALESCE(jsonb_agg(jsonb_build_array(id,"correctsId") ORDER BY id)::text,'[]')) AS signature
        FROM core."deliveryAdvertisingObservation" WHERE "workspaceId"=$1 AND "reviewId"=$2 AND ($3::uuid IS NULL OR "actionId"=$3)`,
            values,
          );
        const scope = advertisingHash({
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          actor: source.actor,
          source: source.fingerprint,
          signature: totals.signature,
          actionId: selected.actionId,
        });
        const cursor = readAdvertisingCursor(selected.after, scope);
        const rows: (DeliveryAdvertisingObservationEntity & {
          createdAtKey: string;
          correctedById: string | null;
        })[] = await manager.query(
          `SELECT observation.*,${advertisingTimestampSql('observation."createdAt"')} AS "createdAtKey",
          (SELECT correction.id FROM core."deliveryAdvertisingObservation" correction WHERE correction."workspaceId"=observation."workspaceId" AND correction."correctsId"=observation.id) AS "correctedById"
        FROM core."deliveryAdvertisingObservation" observation WHERE observation."workspaceId"=$1 AND observation."reviewId"=$2
          AND ($3::uuid IS NULL OR observation."actionId"=$3) AND ($4::timestamptz IS NULL OR (observation."createdAt",observation.id)<($4::timestamptz,$5::uuid))
        ORDER BY observation."createdAt" DESC,observation.id DESC LIMIT $6`,
          [
            ...values,
            cursor?.key ?? null,
            cursor?.id ?? null,
            selected.limit + 1,
          ],
        );
        const page = rows.slice(0, selected.limit),
          last = page[page.length - 1];
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
          items: page.map((item) => ({
            ...item.observation,
            id: item.id,
            actorId: item.actorId,
            createdAt: item.createdAtKey,
            correctedById: item.correctedById,
            source: item.source,
            metric: item.metric,
            task: item.task,
          })),
          totalCount: totals.count,
          scope,
          nextCursor:
            rows.length > selected.limit && last
              ? advertisingCursor(scope, last.createdAtKey, last.id)
              : null,
        };
      },
      transactionManager,
    );
  }

  async observe(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryAdvertisingWriteResultDTO> {
    const command = parseAdvertisingInput(
      observeAdvertisingActionSchema,
      input,
    );
    return this.write(
      workspace.id,
      async (manager) => {
        const { packet, source, changed } = await this.packet(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          command.reviewId,
        );
        if (changed || packet.state !== 'ASSIGNED')
          throw new ForbiddenException(
            'Observe work from a reviewed packet in its original client project.',
          );
        const action = await manager
          .getRepository(DeliveryAdvertisingActionEntity)
          .findOneBy({
            workspaceId: workspace.id,
            reviewId: packet.id,
            id: command.actionId,
          });
        if (!action?.taskId)
          throw new NotFoundException('The reviewed action is unavailable.');
        const task = await this.task(
          manager,
          workspace,
          packet.projectId,
          action.taskId,
        );
        if (
          !task ||
          (!source.actor.isManager &&
            task.ownerId !== memberId &&
            task.reviewerId !== memberId)
        )
          throw new ForbiddenException(
            'The current task owner, reviewer or manager must record this observation.',
          );
        const prior = await this.replay(
          manager,
          workspace.id,
          memberId,
          command.requestId,
          'OBSERVED',
          command,
        );
        if (prior)
          return {
            ...this.identity(
              workspace,
              memberId,
              userWorkspaceId,
              source.actor,
            ),
            receipt: this.receiptDto(prior),
          };
        if (
          command.fromDate <= packet.source.throughDate ||
          command.throughDate > new Date().toISOString().slice(0, 10)
        )
          throw new BadRequestException(
            'Use an observed period after the original report and no later than today.',
          );
        let observationSource: AdvertisingSourceEnvelope | null = null;
        let metric: AdvertisingMetric | null = null;
        if (command.sourceKind && command.sourceId && command.metricKey) {
          observationSource = await this.sourceAdapter.read(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            { kind: command.sourceKind, id: command.sourceId },
            0,
            command.metricAdId,
          );
          if (
            observationSource.fingerprint !== command.sourceFingerprint ||
            observationSource.source.projectId !== packet.projectId ||
            observationSource.source.companyId !== packet.source.companyId ||
            observationSource.source.currency !== packet.source.currency ||
            observationSource.source.channel !== packet.source.channel ||
            observationSource.source.fromDate !== command.fromDate ||
            observationSource.source.throughDate !== command.throughDate
          )
            throw new ConflictException(
              'The later report, original client, currency or observed period changed. Review its exact evidence.',
            );
          metric = this.sourceAdapter.observationMetric(
            observationSource,
            command.metricKey,
          );
          assertAdvertisingObservationSource(
            packet.source,
            observationSource.source,
            command.assessment,
          );
          assertAdvertisingObservationMetric(
            packet.goal,
            metric,
            command.value,
            command.metricAdId,
            command.assessment,
          );
        } else if (command.sourceFingerprint || command.metricAdId)
          throw new BadRequestException(
            'Human observations must not claim a provider source.',
          );
        if (
          (command.value === null || packet.goal.value === null) &&
          command.assessment !== 'INCONCLUSIVE'
        )
          throw new BadRequestException(
            'An unknown outcome must remain inconclusive.',
          );
        const observations = manager.getRepository(
          DeliveryAdvertisingObservationEntity,
        );
        if (command.correctsId) {
          const previous = await observations.findOneBy({
            workspaceId: workspace.id,
            reviewId: packet.id,
            actionId: action.id,
            id: command.correctsId,
          });
          if (
            !previous ||
            (await observations.existsBy({
              workspaceId: workspace.id,
              correctsId: previous.id,
            }))
          )
            throw new ConflictException(
              'Correct the latest observation in this action history. Earlier evidence is preserved.',
            );
        }
        await observations.insert({
          id: command.id,
          workspaceId: workspace.id,
          reviewId: packet.id,
          actionId: action.id,
          correctsId: command.correctsId,
          actorId: memberId,
          observation: command,
          source: observationSource?.source ?? null,
          metric,
          task,
        });
        const event = await this.event(
          manager,
          workspace,
          memberId,
          packet,
          await this.actions(manager, workspace.id, packet.id),
          command.requestId,
          'OBSERVED',
          command,
          command.id,
        );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
          receipt: this.receiptDto(event),
        };
      },
      transactionManager,
    );
  }
}
