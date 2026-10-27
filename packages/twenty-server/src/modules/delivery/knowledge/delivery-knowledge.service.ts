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
import { escapeForIlike } from 'twenty-shared/utils';
import { deliveryKnowledgeCategorySchema } from 'src/modules/delivery/knowledge/delivery-knowledge-category';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { canAccessDeliveryProject } from 'src/modules/delivery/delivery-policy';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryKnowledgeSourceEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-source.entity';
import { DeliveryKnowledgeVersionEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-version.entity';
import {
  type DeliveryKnowledgeSnapshotDTO,
  type DeliveryKnowledgeItemDTO,
} from 'src/modules/delivery/knowledge/delivery-knowledge.dto';

const QUERY = z
  .object({
    projectId: z.uuid(),
    sourceId: z.uuid().nullish(),
    after: z.uuid().nullish(),
    version: z.number().int().positive().nullish(),
    category: deliveryKnowledgeCategorySchema.nullish(),
    search: z.string().trim().max(160).nullish(),
  })
  .strict();
const SOURCE_URL = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use a valid HTTPS source link without embedded credentials.');
const SAVE = z
  .object({
    projectId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(160),
    category: deliveryKnowledgeCategorySchema.optional(),
    meetingDate: z.iso.date(),
    sourceUrl: SOURCE_URL,
    transcript: z.string().trim().max(200000),
    knowledge: z.string().trim().max(8000),
  })
  .strict()
  .refine(
    (value) => Boolean(value.sourceUrl || value.transcript),
    'Add source notes, a transcript or a source link.',
  );
const PUBLISH = z
  .object({
    projectId: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().positive(),
    publish: z.boolean(),
  })
  .strict();
const parse = <TOutput>(
  schema: z.ZodType<TOutput>,
  input: unknown,
): TOutput => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((issue) => issue.message).join(' '),
    );
  return result.data;
};

@Injectable()
export class DeliveryKnowledgeService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
  ) {}

  private async scope(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    projectId: string,
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
      throw new ForbiddenException('This project is unavailable.');
    return actor;
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ): Promise<DeliveryKnowledgeSnapshotDTO> {
    const input = parse(QUERY, raw);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const actor = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.projectId,
        );
        const rows = await manager
          .getRepository(DeliveryKnowledgeSourceEntity)
          .createQueryBuilder('source')
          .innerJoin(
            DeliveryKnowledgeVersionEntity,
            'visible',
            'visible."workspaceId"=source."workspaceId" AND visible."sourceId"=source.id AND visible.version=CASE WHEN :manager=true OR source."createdBy"=:memberId THEN source."currentVersion" ELSE source."publishedVersion" END',
            { manager: actor.isManager, memberId },
          )
          .where(
            'source."workspaceId"=:workspaceId AND source."projectId"=:projectId',
            { workspaceId: workspace.id, projectId: input.projectId },
          )
          .andWhere(
            '( :manager = true OR source."createdBy"=:memberId OR source."publishedVersion" IS NOT NULL)',
            { manager: actor.isManager, memberId },
          )
          .andWhere(input.after ? 'source.id > :after' : 'TRUE', {
            after: input.after,
          })
          .andWhere(input.category ? 'visible.category=:category' : 'TRUE', {
            category: input.category,
          })
          .andWhere(
            input.search
              ? '(visible.title ILIKE :search OR visible.knowledge ILIKE :search)'
              : 'TRUE',
            { search: `%${escapeForIlike(input.search ?? '')}%` },
          )
          .orderBy('source.id', 'ASC')
          .take(31)
          .getMany();
        const item = async (
          source: DeliveryKnowledgeSourceEntity,
          requestedVersion?: number | null,
          includeContent = false,
        ) => {
          const canEdit = actor.isManager || source.createdBy === memberId;
          const version =
            requestedVersion ??
            (canEdit ? source.currentVersion : source.publishedVersion);
          if (!version || (!canEdit && version !== source.publishedVersion))
            throw new ForbiddenException(
              'This knowledge version is unavailable.',
            );
          const content = await manager
            .getRepository(DeliveryKnowledgeVersionEntity)
            .findOne({
              select: includeContent
                ? undefined
                : {
                    id: true,
                    title: true,
                    category: true,
                    meetingDate: true,
                    version: true,
                  },
              where: {
                workspaceId: workspace.id,
                sourceId: source.id,
                version,
              },
            });
          if (!content)
            throw new NotFoundException('Knowledge version is unavailable.');
          const summary: DeliveryKnowledgeItemDTO = {
            id: source.id,
            revision: source.revision,
            title: content.title,
            category: content.category,
            meetingDate: content.meetingDate,
            version,
            publishedVersion: source.publishedVersion,
            publishedAt: source.publishedAt?.toISOString() ?? null,
            createdBy: source.createdBy,
            canEdit,
          };
          return { summary, content };
        };
        const items = [];
        for (const source of rows.slice(0, 30))
          items.push((await item(source)).summary);
        let detail = null;
        if (input.sourceId) {
          const source = await manager
            .getRepository(DeliveryKnowledgeSourceEntity)
            .findOneBy({
              workspaceId: workspace.id,
              projectId: input.projectId,
              id: input.sourceId,
            });
          if (
            !source ||
            (!actor.isManager &&
              source.createdBy !== memberId &&
              !source.publishedVersion)
          )
            throw new NotFoundException('Knowledge source is unavailable.');
          const result = await item(source, input.version, true);
          detail = {
            ...result.summary,
            sourceUrl: result.summary.canEdit ? result.content.sourceUrl : '',
            transcript: result.summary.canEdit
              ? result.content.transcript
              : null,
            knowledge: result.content.knowledge,
            currentVersion: source.currentVersion,
          };
        }
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          canPublish: actor.isManager,
          items,
          nextCursor: rows.length > 30 ? rows[29].id : null,
          detail,
        };
      },
    );
  }

  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parse(SAVE, raw);
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',
        [`delivery:${workspace.id}`],
      );
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`knowledge:${workspace.id}:${input.projectId}`],
      );
      const actor = await this.scope(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input.projectId,
      );
      const repository = manager.getRepository(DeliveryKnowledgeSourceEntity);
      let source = await repository.findOneBy({ id: input.id });
      if (
        source &&
        (source.workspaceId !== workspace.id ||
          source.projectId !== input.projectId ||
          (!actor.isManager && source.createdBy !== memberId))
      )
        throw new ForbiddenException();
      if ((source?.revision ?? 0) !== input.revision)
        throw new ConflictException(
          'This knowledge source changed. Reload it before saving.',
        );
      source ??= repository.create({
        id: input.id,
        workspaceId: workspace.id,
        projectId: input.projectId,
        createdBy: memberId,
        revision: 0,
        currentVersion: 0,
        publishedVersion: null,
        publishedBy: null,
        publishedAt: null,
      });
      const previous = source.currentVersion
        ? await manager
            .getRepository(DeliveryKnowledgeVersionEntity)
            .findOneByOrFail({
              workspaceId: workspace.id,
              sourceId: source.id,
              version: source.currentVersion,
            })
        : null;
      source.revision++;
      source.currentVersion++;
      await repository.save(source);
      await manager.getRepository(DeliveryKnowledgeVersionEntity).insert({
        workspaceId: workspace.id,
        sourceId: source.id,
        version: source.currentVersion,
        title: input.title,
        category: input.category ?? previous?.category ?? 'MEETING',
        meetingDate: input.meetingDate,
        sourceUrl: input.sourceUrl,
        transcript: input.transcript,
        knowledge: input.knowledge,
        createdBy: memberId,
      });
      await this.activity(
        manager,
        workspace.id,
        memberId,
        source,
        'KNOWLEDGE_DRAFT_SAVED',
        'Saved a brand knowledge draft; published context is unchanged.',
      );
      return source.id;
    });
  }

  async publish(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parse(PUBLISH, raw);
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',
        [`delivery:${workspace.id}`],
      );
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`knowledge:${workspace.id}:${input.projectId}`],
      );
      const actor = await this.scope(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input.projectId,
      );
      if (!actor.isManager)
        throw new ForbiddenException(
          'A manager must review and publish brand knowledge.',
        );
      const repository = manager.getRepository(DeliveryKnowledgeSourceEntity);
      const source = await repository.findOneBy({
        workspaceId: workspace.id,
        projectId: input.projectId,
        id: input.id,
      });
      if (!source) throw new NotFoundException();
      if (source.revision !== input.revision)
        throw new ConflictException(
          'This knowledge source changed. Reload it before publishing.',
        );
      const content = await manager
        .getRepository(DeliveryKnowledgeVersionEntity)
        .findOneByOrFail({
          workspaceId: workspace.id,
          sourceId: source.id,
          version: source.currentVersion,
        });
      if (input.publish && (!content.transcript || !content.knowledge))
        throw new BadRequestException(
          'Add source notes or a transcript and reviewed knowledge before publishing. A recording link alone is not imported evidence.',
        );
      source.publishedVersion = input.publish ? source.currentVersion : null;
      source.publishedAt = input.publish ? new Date() : null;
      source.publishedBy = input.publish ? memberId : null;
      source.revision++;
      await repository.save(source);
      await this.activity(
        manager,
        workspace.id,
        memberId,
        source,
        input.publish ? 'KNOWLEDGE_PUBLISHED' : 'KNOWLEDGE_WITHDRAWN',
        input.publish
          ? 'Published reviewed brand knowledge for scoped project assistants.'
          : 'Withdrew brand knowledge from new assistant context.',
      );
      return true;
    });
  }

  private activity(
    manager: EntityManager,
    workspaceId: string,
    memberId: string,
    source: DeliveryKnowledgeSourceEntity,
    action: string,
    summary: string,
  ) {
    return recordOtogrowActivity(manager, {
      workspaceId,
      actorId: memberId,
      projectId: source.projectId,
      category: 'CLIENT',
      sourceType: 'brand-knowledge',
      sourceId: source.id,
      action,
      summary,
      outcome: action === 'KNOWLEDGE_PUBLISHED' ? 'APPROVED' : 'RECORDED',
      changes: [
        {
          field: 'revision',
          before: String(source.revision - 1),
          after: String(source.revision),
        },
      ],
    });
  }
}
