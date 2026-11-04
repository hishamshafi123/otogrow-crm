import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { type OtogrowAccess } from 'src/modules/otogrow-access/otogrow-access.types';
import { DeliveryCompetitorSourceEntity } from './entities/delivery-competitor-source.entity';
import { DeliveryCompetitorSourceVersionEntity } from './entities/delivery-competitor-source-version.entity';
import { DeliveryCompetitorSourceEventEntity } from './entities/delivery-competitor-source-event.entity';
import { DeliveryCompetitorSourceService } from './delivery-competitor-source.service';
import {
  DeliveryCompetitorReadsService,
  competitorSourceReceipt,
} from './delivery-competitor-reads.service';
import {
  assertCompetitorEditor,
  canonicalCompetitorSource,
  competitorManager,
  parseCompetitorInput,
} from './delivery-competitor-source.policy';
import {
  competitorSourceChangeSchema,
  competitorSourceSaveSchema,
  type CompetitorSourceAction,
} from './delivery-competitor.types';

@Injectable()
export class DeliveryCompetitorService {
  constructor(
    private readonly source: DeliveryCompetitorSourceService,
    private readonly reads: DeliveryCompetitorReadsService,
  ) {}
  projects(...input: Parameters<DeliveryCompetitorReadsService['projects']>) {
    return this.reads.projects(...input);
  }
  list(...input: Parameters<DeliveryCompetitorReadsService['list']>) {
    return this.reads.list(...input);
  }
  choices(...input: Parameters<DeliveryCompetitorReadsService['choices']>) {
    return this.reads.choices(...input);
  }
  detail(...input: Parameters<DeliveryCompetitorReadsService['detail']>) {
    return this.reads.detail(...input);
  }
  preview(...input: Parameters<DeliveryCompetitorReadsService['preview']>) {
    return this.reads.preview(...input);
  }
  receipt(...input: Parameters<DeliveryCompetitorReadsService['receipt']>) {
    return this.reads.receipt(...input);
  }

  private write<TResult>(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    id: string,
    requestId: string,
    operation: (
      manager: EntityManager,
      access: OtogrowAccess,
    ) => Promise<TResult>,
    transactionManager?: EntityManager,
  ) {
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery-competitor-request:${workspace.id}:${requestId}`],
        );
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery-competitor-source:${workspace.id}:${id}`],
        );
        return operation(manager, access);
      },
      transactionManager,
    );
  }

  private async replay(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    requestId: string,
    inputHash: string,
  ) {
    const event = await manager
      .getRepository(DeliveryCompetitorSourceEventEntity)
      .findOneBy({ workspaceId: workspace.id, requestId });
    if (!event) return null;
    await this.source.selected(
      manager,
      workspace,
      access,
      event.sourceId,
      event.version,
    );
    if (
      event.actorId !== access.memberId ||
      event.userWorkspaceId !== access.userWorkspaceId ||
      event.inputHash !== inputHash
    )
      throw new ConflictException(
        'This request identity belongs to a different competitor source action.',
      );
    return competitorSourceReceipt(event);
  }

  private async record(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    source: DeliveryCompetitorSourceEntity,
    input: {
      requestId: string;
      inputHash: string;
      action: CompetitorSourceAction;
      note?: string;
    },
  ) {
    const actor = (
      await this.source.access.listActiveMembers(workspace.id, manager)
    ).find((member) => member.memberId === access.memberId);
    const event = await manager
      .getRepository(DeliveryCompetitorSourceEventEntity)
      .save({
        workspaceId: workspace.id,
        sourceId: source.id,
        actorId: access.memberId,
        userWorkspaceId: access.userWorkspaceId,
        actorName: actor?.name || 'Workspace member',
        requestId: input.requestId,
        inputHash: input.inputHash,
        action: input.action,
        note: input.note ?? '',
        revision: source.revision,
        version: source.currentVersion,
        status: source.status,
      });
    await recordOtogrowActivity(manager, {
      workspaceId: workspace.id,
      actorId: access.memberId,
      actorType: 'HUMAN',
      category: 'DELIVERY',
      action: `COMPETITOR_SOURCE_${input.action}`,
      sourceType: 'competitor-source',
      sourceId: source.id,
      projectId: source.projectId,
      subjectMemberId: source.ownerId,
      outcome: 'RECORDED',
      summary:
        'Recorded competitor source configuration. Collection remains off; no provider request was made.',
      changes: [
        { field: 'state', before: null, after: source.status },
        { field: 'revision', before: null, after: String(source.revision) },
      ],
    });
    return competitorSourceReceipt(event);
  }

  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCompetitorInput(competitorSourceSaveSchema, raw),
      inputHash = advertisingHash(input);
    const canonical = canonicalCompetitorSource(
      input.body.platform,
      input.body.accountReference,
    );
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      input.id,
      input.requestId,
      async (manager, access) => {
        const replay = await this.replay(
          manager,
          workspace,
          access,
          input.requestId,
          inputHash,
        );
        if (replay) return replay;
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [
            `delivery-competitor-identity:${workspace.id}:${input.projectId}:${input.body.platform}:${canonical.canonicalKey}`,
          ],
        );
        const prepared = await this.source.prepare(
          manager,
          workspace,
          access,
          input,
        );
        const { project, body } = prepared;
        const repository = manager.getRepository(
          DeliveryCompetitorSourceEntity,
        );
        const source =
          prepared.source ??
          repository.create({
            id: input.id,
            workspaceId: workspace.id,
            projectId: project.id,
            companyId: project.companyId,
            createdBy: memberId,
            revision: 0,
            currentVersion: 0,
            status: 'ACTIVE',
          });
        source.revision++;
        source.currentVersion++;
        source.label = body.label;
        source.platform = body.platform;
        source.canonicalReference = body.canonicalReference;
        source.canonicalKey = body.canonicalKey;
        source.ownerId = body.ownerId;
        source.ownerName = body.ownerName;
        source.reviewerId = body.reviewerId;
        source.reviewerName = body.reviewerName;
        source.cadenceHours = body.cadenceHours;
        source.lookbackDays = body.lookbackDays;
        await repository.save(source);
        await manager
          .getRepository(DeliveryCompetitorSourceVersionEntity)
          .insert({
            workspaceId: workspace.id,
            sourceId: source.id,
            version: source.currentVersion,
            companyId: source.companyId,
            body,
            createdBy: memberId,
          });
        return this.record(manager, workspace, access, source, {
          requestId: input.requestId,
          inputHash,
          action: 'SAVE',
        });
      },
      transactionManager,
    );
  }

  async changeState(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCompetitorInput(competitorSourceChangeSchema, raw),
      inputHash = advertisingHash(input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      input.id,
      input.requestId,
      async (manager, access) => {
        const replay = await this.replay(
          manager,
          workspace,
          access,
          input.requestId,
          inputHash,
        );
        if (replay) return replay;
        const { source, project } = await this.source.selected(
          manager,
          workspace,
          access,
          input.id,
        );
        this.source.assertProjectVersion(project, input);
        if (source.revision !== input.revision)
          throw new ConflictException(
            'This competitor source changed. Refresh before recording this action.',
          );
        assertCompetitorEditor(source.ownerId, access);
        if (input.action === 'PAUSE') {
          if (source.status !== 'ACTIVE')
            throw new BadRequestException(
              'Only an active saved source can be paused.',
            );
          source.status = 'PAUSED';
        } else if (input.action === 'ARCHIVE') {
          if (source.status === 'ARCHIVED')
            throw new BadRequestException('This source is already archived.');
          source.status = 'ARCHIVED';
        } else {
          if (source.status === 'ACTIVE')
            throw new BadRequestException('This source is already active.');
          if (source.status === 'ARCHIVED' && !competitorManager(access))
            throw new ForbiddenException(
              'Only a current delivery manager can restore an archived source.',
            );
          await this.source.eligible(
            manager,
            workspace,
            project,
            source.ownerId,
            source.reviewerId,
          );
          source.status = source.status === 'ARCHIVED' ? 'PAUSED' : 'ACTIVE';
        }
        source.revision++;
        await manager
          .getRepository(DeliveryCompetitorSourceEntity)
          .save(source);
        return this.record(manager, workspace, access, source, {
          ...input,
          inputHash,
        });
      },
      transactionManager,
    );
  }
}
