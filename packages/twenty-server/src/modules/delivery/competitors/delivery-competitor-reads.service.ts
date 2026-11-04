import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { escapeForIlike } from 'twenty-shared/utils';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { deliveryNativeTaskSchema } from 'src/modules/delivery/native-task-visibility';
import { DeliveryCompetitorSourceEntity } from './entities/delivery-competitor-source.entity';
import { DeliveryCompetitorSourceEventEntity } from './entities/delivery-competitor-source-event.entity';
import { DeliveryCompetitorSourceVersionEntity } from './entities/delivery-competitor-source-version.entity';
import { DeliveryCompetitorSourceService } from './delivery-competitor-source.service';
import {
  competitorCollectionState,
  competitorCursor,
  competitorManager,
  parseCompetitorInput,
  readCompetitorCursor,
} from './delivery-competitor-source.policy';
import {
  competitorProjectsSchema,
  competitorSourceChoicesSchema,
  competitorSourceReceiptSchema,
  competitorSourceSaveSchema,
  competitorSourceSelectionSchema,
  competitorSourcesSchema,
} from './delivery-competitor.types';

export const competitorSourceReceipt = (
  event: DeliveryCompetitorSourceEventEntity,
) => ({
  workspaceId: event.workspaceId,
  actorId: event.actorId,
  userWorkspaceId: event.userWorkspaceId,
  requestId: event.requestId,
  sourceId: event.sourceId,
  inputHash: event.inputHash,
  action: event.action,
  revision: event.revision,
  version: event.version,
  status: event.status,
  note: event.note,
  actorName: event.actorName,
  createdAt: event.createdAt.toISOString(),
});

@Injectable()
export class DeliveryCompetitorReadsService {
  constructor(private readonly source: DeliveryCompetitorSourceService) {}

  async projects(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCompetitorInput(competitorProjectsSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const identity = this.source.identity(workspace, access);
        const scope = advertisingHash([
          identity.scope,
          'PROJECT',
          input.search ?? '',
        ]);
        const cursor = readCompetitorCursor(input.after, scope, 'PROJECT');
        const query = manager
          .getRepository(DeliveryProjectEntity)
          .createQueryBuilder('project')
          .where('project."workspaceId"=:workspaceId', {
            workspaceId: workspace.id,
          })
          .andWhere(
            `(project."companyId" IS NULL OR EXISTS (SELECT 1 FROM "${deliveryNativeTaskSchema(workspace)}".company client WHERE client.id=project."companyId" AND client."deletedAt" IS NULL))`,
          );
        if (!competitorManager(access))
          query.andWhere('project."memberIds" ? :memberId', { memberId });
        if (input.search)
          query.andWhere('project.name ILIKE :search', {
            search: `%${escapeForIlike(input.search)}%`,
          });
        const totalCount = await query.getCount();
        if (cursor)
          query.andWhere('project.id>:afterId', { afterId: cursor.id });
        const rows = await query
          .orderBy('project.id', 'ASC')
          .take(26)
          .getMany();
        return {
          ...identity,
          items: rows.slice(0, 25),
          totalCount,
          nextCursor:
            rows.length > 25
              ? competitorCursor(scope, 'PROJECT', rows[24].id)
              : null,
        };
      },
      transactionManager,
    );
  }

  async list(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCompetitorInput(competitorSourcesSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const project = await this.source.project(
          manager,
          workspace,
          access,
          input.projectId,
        );
        const identity = this.source.identity(workspace, access, project);
        const scope = advertisingHash([
          identity.scope,
          'SOURCE',
          input.status ?? null,
        ]);
        const cursor = readCompetitorCursor(input.after, scope, 'SOURCE');
        const query = manager
          .getRepository(DeliveryCompetitorSourceEntity)
          .createQueryBuilder('source')
          .innerJoin(
            DeliveryCompetitorSourceVersionEntity,
            'version',
            'version."workspaceId"=source."workspaceId" AND version."sourceId"=source.id AND version.version=source."currentVersion" AND version."companyId" IS NOT DISTINCT FROM source."companyId" AND version.body->>\'projectId\'=source."projectId"::text',
          )
          .where(
            'source."workspaceId"=:workspaceId AND source."projectId"=:projectId AND source."companyId" IS NOT DISTINCT FROM :companyId::uuid',
            {
              workspaceId: workspace.id,
              projectId: project.id,
              companyId: project.companyId,
            },
          );
        if (input.status)
          query.andWhere('source.status=:status', { status: input.status });
        const totalCount = await query.getCount();
        if (cursor)
          query.andWhere('source.id>:afterId', { afterId: cursor.id });
        const rows = await query.orderBy('source.id', 'ASC').take(26).getMany();
        return {
          ...identity,
          project,
          items: rows.slice(0, 25),
          totalCount,
          nextCursor:
            rows.length > 25
              ? competitorCursor(scope, 'SOURCE', rows[24].id)
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
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCompetitorInput(competitorSourceChoicesSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const project = await this.source.project(
          manager,
          workspace,
          access,
          input.projectId,
        );
        return {
          ...this.source.identity(workspace, access, project),
          project,
          ...(await this.source.choices(manager, workspace, project)),
        };
      },
      transactionManager,
    );
  }

  async detail(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCompetitorInput(competitorSourceSelectionSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const { source, project, version } = await this.source.selected(
          manager,
          workspace,
          access,
          input.id,
          input.version,
        );
        const identity = this.source.identity(workspace, access, project);
        const scope = advertisingHash([
          identity.scope,
          'HISTORY',
          source.id,
          source.revision,
          version.version,
        ]);
        const cursor = readCompetitorCursor(input.after, scope, 'HISTORY');
        const query = manager
          .getRepository(DeliveryCompetitorSourceEventEntity)
          .createQueryBuilder('event')
          .innerJoin(
            DeliveryCompetitorSourceVersionEntity,
            'historyversion',
            'historyversion."workspaceId"=event."workspaceId" AND historyversion."sourceId"=event."sourceId" AND historyversion.version=event.version AND historyversion."companyId" IS NOT DISTINCT FROM :companyId::uuid AND historyversion.body->>\'projectId\'=:projectId',
          )
          .where(
            'event."workspaceId"=:workspaceId AND event."sourceId"=:sourceId',
            {
              workspaceId: workspace.id,
              sourceId: source.id,
              companyId: source.companyId,
              projectId: project.id,
            },
          );
        if (cursor) {
          const previous = await manager
            .getRepository(DeliveryCompetitorSourceEventEntity)
            .findOneBy({
              workspaceId: workspace.id,
              sourceId: source.id,
              id: cursor.id,
              revision: cursor.revision ?? 0,
            });
          if (!previous)
            throw new BadRequestException(
              'This source history page is unavailable. Open the first page.',
            );
          query.andWhere('event.revision<:revision', {
            revision: previous.revision,
          });
        }
        const events = await query
          .orderBy('event.revision', 'DESC')
          .take(26)
          .getMany();
        const editable =
          version.version === source.currentVersion &&
          (competitorManager(access) || source.ownerId === memberId);
        const choices = await this.source.choices(manager, workspace, project);
        const eligible =
          source.ownerId !== source.reviewerId &&
          choices.owners.some((owner) => owner.id === source.ownerId) &&
          choices.reviewers.some(
            (reviewer) => reviewer.id === source.reviewerId,
          );
        return {
          ...identity,
          project,
          source,
          selectedVersion: version.version,
          body: version.body,
          history: events.slice(0, 25).map(competitorSourceReceipt),
          nextCursor:
            events.length > 25
              ? competitorCursor(
                  scope,
                  'HISTORY',
                  events[24].id,
                  events[24].revision,
                )
              : null,
          canEdit:
            editable &&
            (source.status !== 'ARCHIVED' || competitorManager(access)) &&
            (eligible || competitorManager(access)),
          canPause: editable && source.status === 'ACTIVE',
          canArchive: editable && source.status !== 'ARCHIVED',
          canRestore:
            editable &&
            eligible &&
            (source.status === 'PAUSED' ||
              (source.status === 'ARCHIVED' && competitorManager(access))),
          collectionEnabled: false,
          collectionState: competitorCollectionState(source.platform),
        };
      },
      transactionManager,
    );
  }

  async preview(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCompetitorInput(competitorSourceSaveSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const { project, body } = await this.source.prepare(
          manager,
          workspace,
          access,
          input,
        );
        return {
          ...this.source.identity(workspace, access, project),
          project,
          sourceId: input.id,
          requestId: input.requestId,
          inputHash: advertisingHash(input),
          body,
          collectionEnabled: false,
          collectionState: competitorCollectionState(body.platform),
        };
      },
      transactionManager,
    );
  }

  async receipt(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCompetitorInput(competitorSourceReceiptSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const project = await this.source.project(
          manager,
          workspace,
          access,
          input.projectId,
        );
        const identity = this.source.identity(workspace, access, project);
        const source = await manager
          .getRepository(DeliveryCompetitorSourceEntity)
          .findOneBy({ workspaceId: workspace.id, id: input.sourceId });
        if (source) {
          const selected = await this.source.selected(
            manager,
            workspace,
            access,
            source.id,
          );
          if (selected.project.id !== project.id)
            throw new ForbiddenException(
              'This request belongs to another project.',
            );
        }
        const event = await manager
          .getRepository(DeliveryCompetitorSourceEventEntity)
          .findOneBy({ workspaceId: workspace.id, requestId: input.requestId });
        if (!event) return { ...identity, receipt: null };
        if (
          event.sourceId !== input.sourceId ||
          event.actorId !== memberId ||
          event.userWorkspaceId !== userWorkspaceId
        )
          throw new ForbiddenException(
            'This saved source request belongs to another person or source.',
          );
        const selected = await this.source.selected(
          manager,
          workspace,
          access,
          event.sourceId,
          event.version,
        );
        if (selected.project.id !== project.id)
          throw new ForbiddenException(
            'This request belongs to another project.',
          );
        return { ...identity, receipt: competitorSourceReceipt(event) };
      },
      transactionManager,
    );
  }
}
