import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';

import { DataSource } from 'typeorm';
import { z } from 'zod';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { OtogrowActivityEventEntity } from 'src/modules/otogrow-activity/entities/otogrow-activity-event.entity';
import { type OtogrowActivityFeedDTO } from 'src/modules/otogrow-activity/otogrow-activity.dto';
import {
  OTOGROW_ACTIVITY_CATEGORIES,
  OTOGROW_ACTIVITY_OUTCOMES,
} from 'src/modules/otogrow-activity/otogrow-activity.types';

const FILTER = z
  .object({
    personId: z.string().uuid().nullish(),
    projectId: z.string().uuid().nullish(),
    clientId: z.string().uuid().nullish(),
    category: z.enum(OTOGROW_ACTIVITY_CATEGORIES).nullish(),
    action: z
      .string()
      .regex(/^[A-Z][A-Z_]{0,79}$/)
      .nullish(),
    outcome: z.enum(OTOGROW_ACTIVITY_OUTCOMES).nullish(),
    from: z.string().datetime().nullish(),
    through: z.string().datetime().nullish(),
    cursor: z.string().min(1).max(1200).nullish(),
    limit: z.number().int().min(1).max(100).nullish(),
  })
  .strict();
const CURSOR = z
  .object({
    version: z.literal(1),
    workspaceId: z.string().uuid(),
    filter: z.string().length(64),
    at: z.string().datetime(),
    id: z.string().uuid(),
  })
  .strict();

@Injectable()
export class OtogrowActivityService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: OtogrowAccessService,
  ) {}

  async feed(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<OtogrowActivityFeedDTO> {
    const parsed = FILTER.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        'Check the activity filters and date range.',
      );
    const filter = parsed.data;
    if (
      filter.from &&
      filter.through &&
      Date.parse(filter.from) >= Date.parse(filter.through)
    )
      throw new BadRequestException(
        'The end of the activity range must follow its start.',
      );
    const filterKey = createHash('sha256')
      .update(
        JSON.stringify([
          filter.personId ?? null,
          filter.projectId ?? null,
          filter.clientId ?? null,
          filter.category ?? null,
          filter.action ?? null,
          filter.outcome ?? null,
          filter.from ?? null,
          filter.through ?? null,
        ]),
      )
      .digest('hex');
    let cursor: z.infer<typeof CURSOR> | null = null;
    if (filter.cursor) {
      try {
        cursor = CURSOR.parse(
          JSON.parse(Buffer.from(filter.cursor, 'base64url').toString('utf8')),
        );
      } catch {
        throw new BadRequestException('Reload activity to reset this page.');
      }
      if (cursor.workspaceId !== workspace.id || cursor.filter !== filterKey)
        throw new BadRequestException(
          'Reload activity after changing filters or workspace.',
        );
    }
    return this.dataSource.transaction(async (manager) => {
      // Role writes use the exclusive form; authorization stays valid throughout this read.
      await manager.query(
        'SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))',
        [`delivery:${workspace.id}`],
      );
      const access = await this.access.accessForUser(
        workspace.id,
        memberId,
        userWorkspaceId,
        manager,
      );
      if (!access.capabilities.includes('workspace.admin'))
        throw new ForbiddenException(
          'Only administrators can view company activity.',
        );
      const query = manager
        .getRepository(OtogrowActivityEventEntity)
        .createQueryBuilder('activity')
        .where('activity.workspaceId = :workspaceId', {
          workspaceId: workspace.id,
        });
      if (filter.personId)
        query.andWhere(
          '(activity.actorId = :personId OR activity.subjectMemberId = :personId)',
          { personId: filter.personId },
        );
      for (const field of [
        'projectId',
        'clientId',
        'category',
        'action',
        'outcome',
      ] as const) {
        if (filter[field])
          query.andWhere(`activity.${field} = :${field}`, {
            [field]: filter[field],
          });
      }
      if (filter.from)
        query.andWhere('activity.occurredAt >= :from', { from: filter.from });
      if (filter.through)
        query.andWhere('activity.occurredAt < :through', {
          through: filter.through,
        });
      if (cursor)
        query.andWhere('(activity.occurredAt, activity.id) < (:at, :id)', {
          at: cursor.at,
          id: cursor.id,
        });
      const limit = filter.limit ?? 30;
      const rows = await query
        .orderBy('activity.occurredAt', 'DESC')
        .addOrderBy('activity.id', 'DESC')
        .take(limit + 1)
        .getMany();
      const selected = rows.slice(0, limit);
      const last = selected[selected.length - 1];
      const nextCursor =
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({
                version: 1,
                workspaceId: workspace.id,
                filter: filterKey,
                at: last.occurredAt.toISOString(),
                id: last.id,
              }),
            ).toString('base64url')
          : null;
      const people: { id: string; name: string }[] = await manager.query(
        `
        SELECT DISTINCT ON (id) id, name FROM (
          SELECT "actorId" AS id, "actorName" AS name, "occurredAt" FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "actorId" IS NOT NULL
          UNION ALL
          SELECT "subjectMemberId" AS id, "subjectName" AS name, "occurredAt" FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "subjectMemberId" IS NOT NULL
        ) names ORDER BY id, "occurredAt" DESC`,
        [workspace.id],
      );
      const options = async (
        field: 'project' | 'client',
      ): Promise<{ id: string; name: string }[]> =>
        manager.query(
          `SELECT DISTINCT ON ("${field}Id") "${field}Id" AS id, COALESCE("${field}Name", 'Removed record') AS name FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "${field}Id" IS NOT NULL ORDER BY "${field}Id", "occurredAt" DESC`,
          [workspace.id],
        );
      const [{ start }]: { start: Date | null }[] = await manager.query(
        'SELECT min("recordedAt") AS start FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1',
        [workspace.id],
      );
      const sortOptions = (items: { id: string; name: string }[]) =>
        items.sort((left, right) => left.name.localeCompare(right.name));
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        events: selected.map((event) => ({
          ...event,
          occurredAt: event.occurredAt.toISOString(),
        })),
        nextCursor,
        people: sortOptions(people),
        projects: sortOptions(await options('project')),
        clients: sortOptions(await options('client')),
        coverageStartedAt: start?.toISOString() ?? null,
      };
    });
  }
}
