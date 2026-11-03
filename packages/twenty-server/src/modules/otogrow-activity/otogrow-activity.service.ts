import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import {
  advertisingCursor,
  advertisingHash,
  advertisingTimestampSql,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  activityFiltersSchema,
  activityPageFields,
  type ActivityFilters,
} from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.types';
import {
  activityAuthority,
  activityCoverage,
  activityExactTimes,
  activityHasFinance,
  parseActivityInput,
  readActivityCursor,
  activityQuery,
  projectActivityEvent,
  validateActivityRange,
  activityFinanceEvent,
  readBoundedActivityEvents,
} from 'src/modules/otogrow-activity/otogrow-activity.reads';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';

import { DataSource, type EntityManager } from 'typeorm';
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
    version: z.literal(2),
    workspaceId: z.string().uuid(),
    filter: z.string().regex(/^[a-f0-9]{64}$/),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    at: z
      .string()
      .datetime()
      .regex(/\.\d{6}Z$/),
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
      if (filter.from && filter.through) {
        const [range]: { validRange: boolean }[] = await manager.query(
          'SELECT $1::timestamptz < $2::timestamptz AS "validRange"',
          [filter.from, filter.through],
        );
        if (!range.validRange)
          throw new BadRequestException(
            'The end of the activity range must follow its start.',
          );
      }
      const scope = createHash('sha256')
        .update(
          JSON.stringify([
            workspace.id,
            memberId,
            userWorkspaceId,
            access.nativeAdministrator,
            [...access.roleIds].sort(),
            [...access.capabilities].sort(),
          ]),
        )
        .digest('hex');
      if (cursor && cursor.scope !== scope)
        throw new BadRequestException(
          'Reload activity after your account or permissions change.',
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
      const { entities: rows, raw } = await query
        // A direct custom alias for the entity id breaks TypeORM hydration.
        .addSelect('CAST(activity.id AS text)', 'activityCursorId')
        // JavaScript dates discard the microseconds used by the database ordering.
        .addSelect(
          `to_char(activity."occurredAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          'activityCursorAt',
        )
        .orderBy('activity.occurredAt', 'DESC')
        .addOrderBy('activity.id', 'DESC')
        .take(limit + 1)
        .getRawAndEntities<{
          activityCursorId: string;
          activityCursorAt: string;
        }>();
      const selected = rows.slice(0, limit);
      const last = selected[selected.length - 1];
      const nextCursor =
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({
                version: 2,
                workspaceId: workspace.id,
                filter: filterKey,
                scope,
                at: CURSOR.shape.at.parse(
                  raw.find((row) => row.activityCursorId === last.id)
                    ?.activityCursorAt,
                ),
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
        events: selected.map((event) =>
          projectActivityEvent(
            event,
            event.occurredAt.toISOString(),
            access.capabilities.includes('finance.read'),
          ),
        ),
        nextCursor,
        people: sortOptions(people),
        projects: sortOptions(await options('project')),
        clients: sortOptions(await options('client')),
        coverageStartedAt: start?.toISOString() ?? null,
      };
    });
  }

  authority(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    return activityAuthority(
      manager,
      this.access,
      workspace,
      memberId,
      userWorkspaceId,
    );
  }
  context(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    transactionManager?: EntityManager,
  ) {
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => ({
        ...(await this.authority(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        )),
        coverageStartedAt: await activityCoverage(manager, workspace.id),
        canAnalyze: true,
      }),
      transactionManager,
    );
  }
  async page(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseActivityInput(
      z
        .object({ filters: activityFiltersSchema, ...activityPageFields })
        .strict(),
      raw,
    );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const identity = await this.authority(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        await validateActivityRange(manager, input.filters);
        const scope = advertisingHash([identity.scope, input.filters]);
        const cursor = readActivityCursor(input.after, scope);
        const query = activityQuery(manager, workspace.id, input.filters);
        const totalCount = await query.clone().getCount();
        if (cursor)
          query.andWhere('(activity."occurredAt",activity.id) < (:at,:id)', {
            at: cursor.key,
            id: cursor.id,
          });
        const { events } = await readBoundedActivityEvents(
          query,
          activityHasFinance(identity),
          input.limit + 1,
        );
        const selected = events.slice(0, input.limit);
        const last = selected[selected.length - 1];
        return {
          ...identity,
          filters: input.filters,
          totalCount,
          events: selected,
          nextCursor:
            events.length > input.limit && last
              ? advertisingCursor(scope, last.occurredAt, last.id)
              : null,
          coverageStartedAt: await activityCoverage(manager, workspace.id),
        };
      },
      transactionManager,
    );
  }
  async event(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseActivityInput(z.object({ id: z.uuid() }).strict(), raw);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const identity = await this.authority(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        const { entities, raw: rows } = await activityExactTimes(
          activityQuery(
            manager,
            workspace.id,
            activityFiltersSchema.parse({}),
          ).andWhere('activity.id=:id', { id: input.id }),
        )
          .take(1)
          .getRawAndEntities<{ cursorId: string; cursorAt: string }>();
        return {
          ...identity,
          event: entities[0]
            ? projectActivityEvent(
                entities[0],
                rows[0].cursorAt,
                activityHasFinance(identity),
              )
            : null,
        };
      },
      transactionManager,
    );
  }
  async options(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseActivityInput(
      z
        .object({
          kind: z.enum(['PERSON', 'PROJECT', 'CLIENT']),
          search: z.string().trim().max(120).nullish(),
          selectedId: z.uuid().nullish(),
          ...activityPageFields,
        })
        .strict(),
      raw,
    );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const identity = await this.authority(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        const scope = advertisingHash([
          identity.scope,
          input.kind,
          input.search ?? '',
        ]);
        const cursor = readActivityCursor(input.after, scope, false);
        const names =
          input.kind === 'PERSON'
            ? `SELECT "actorId" AS id,"actorName" AS name,"occurredAt",id AS "eventId" FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "actorId" IS NOT NULL UNION ALL SELECT "subjectMemberId" AS id,"subjectName" AS name,"occurredAt",id AS "eventId" FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "subjectMemberId" IS NOT NULL`
            : `SELECT "${input.kind === 'PROJECT' ? 'project' : 'client'}Id" AS id,"${input.kind === 'PROJECT' ? 'project' : 'client'}Name" AS name,"occurredAt",id AS "eventId" FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "${input.kind === 'PROJECT' ? 'project' : 'client'}Id" IS NOT NULL`;
        const common = `WITH names AS (${names}), latest AS (SELECT DISTINCT ON (id) id,COALESCE(name,'Removed record') AS name FROM names ORDER BY id,"occurredAt" DESC,"eventId" DESC)`;
        const [count]: { count: string }[] = await manager.query(
          `${common} SELECT count(*)::text AS count FROM latest WHERE position(lower($2) in lower(name))>0`,
          [workspace.id, input.search ?? ''],
        );
        const items: { id: string; name: string }[] = await manager.query(
          `${common} SELECT id,left(name,160) AS name FROM latest WHERE position(lower($2) in lower(name))>0 AND ($3::uuid IS NULL OR id>$3::uuid) ORDER BY id LIMIT $4`,
          [
            workspace.id,
            input.search ?? '',
            cursor?.id ?? null,
            input.limit + 1,
          ],
        );
        const selected: { id: string; name: string }[] = input.selectedId
          ? await manager.query(
              `${common} SELECT id,left(name,160) AS name FROM latest WHERE id=$2::uuid`,
              [workspace.id, input.selectedId],
            )
          : [];
        const chosen = items.slice(0, input.limit);
        const last = chosen[chosen.length - 1];
        return {
          ...identity,
          items: chosen,
          selected: selected[0] ?? null,
          totalCount: Number(count.count),
          nextCursor:
            items.length > input.limit && last
              ? advertisingCursor(scope, last.id, last.id)
              : null,
        };
      },
      transactionManager,
    );
  }
  async evidence(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    filters: ActivityFilters,
    capturedAt?: string,
  ) {
    const identity = await this.authority(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
    );
    await validateActivityRange(manager, filters);
    const [capture]: { at: string; valid: boolean }[] = await manager.query(
      `SELECT ${advertisingTimestampSql('COALESCE($1::timestamptz,clock_timestamp())')} AS at,($1::timestamptz IS NULL OR $1::timestamptz<=clock_timestamp()) AS valid`,
      [capturedAt ?? null],
    );
    if (!capture.valid)
      throw new BadRequestException(
        'The activity capture time cannot be in the future. Preview again.',
      );
    const query = activityQuery(manager, workspace.id, filters).andWhere(
      'activity."recordedAt" <= :capturedAt',
      { capturedAt: capture.at },
    );
    const totalCount = await query.clone().getCount();
    const { events, omittedBytes, truncatedFieldCount } =
      await readBoundedActivityEvents(query, activityHasFinance(identity), 200);
    return {
      identity,
      capturedAt: capture.at,
      coverageStartedAt: await activityCoverage(manager, workspace.id),
      totalCount,
      events,
      omittedBytes,
      truncatedFieldCount,
      containsFinance:
        activityHasFinance(identity) && events.some(activityFinanceEvent),
    };
  }
}
