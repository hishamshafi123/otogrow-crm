import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeForIlike } from 'twenty-shared/utils';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { type CreativeDocument } from 'src/modules/delivery/creative/delivery-creative.types';
import {
  creativeProjectsSchema,
  creativeTasksSchema,
  creativeSelectionSchema,
  creativeReferencesSchema,
  parseCreativeRead,
  creativeReadHash,
  creativeReadCursor,
  readCreativeCursor,
} from 'src/modules/delivery/creative/reads/delivery-creative-reads.policy';
import {
  type DeliveryCreativeContextDTO,
  type DeliveryCreativeProjectDTO,
  type DeliveryCreativeProjectsDTO,
  type DeliveryCreativeTasksDTO,
  type DeliveryCreativeTaskSummaryDTO,
  type DeliveryCreativeStateDTO,
  type DeliveryCreativeDetailDTO,
  type DeliveryCreativeReferencesDTO,
  type DeliveryCreativeApprovedReferenceDTO,
} from 'src/modules/delivery/creative/reads/delivery-creative-reads.dto';

type CreativeActor = Awaited<ReturnType<DeliveryService['actor']>>;
type ReadScope = {
  manager: EntityManager;
  actor: CreativeActor;
  identity: DeliveryCreativeContextDTO;
};
type Metadata = { totalCount: number; fingerprint: string };
type TaskRow = DeliveryCreativeTaskSummaryDTO & {
  createdAtKey: string;
  document?: CreativeDocument | null;
};
const PROJECT_SCOPE =
  'p."workspaceId"=$1 AND ($2::boolean OR p."memberIds" @> $3::jsonb)';
const TASK_FIELDS = `n.id,n.title,d."projectId",p.name AS "projectName",p.revision AS "projectRevision",d.revision,n."assigneeId",CASE WHEN n."assigneeId" IS NULL THEN NULL ELSE n."assigneeId"::text || ':' || COALESCE(d.details->>'assignmentAt','legacy') END AS "assignmentKey",NULLIF(trim(concat_ws(' ',m."nameFirstName",m."nameLastName")),'') AS "assigneeName",to_char(n."dueAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "dueAt",d.details->>'state' AS state,d.details->>'service' AS service,(d.details->'creative' IS NOT NULL AND d.details->'creative'<>'null'::jsonb) AS "hasProduction",to_char(d."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtKey"`;

export const creativeTaskSummary = (
  row: TaskRow,
  actor: CreativeActor,
): DeliveryCreativeTaskSummaryDTO => ({
  id: row.id,
  title: row.title,
  projectId: row.projectId,
  projectName: row.projectName,
  projectRevision: row.projectRevision,
  revision: row.revision,
  assigneeId: row.assigneeId,
  assigneeName: row.assigneeName,
  assignmentKey: row.assignmentKey,
  dueAt: row.dueAt,
  state: row.state,
  service: row.service,
  hasProduction: row.hasProduction,
  canEdit:
    !['APPROVED', 'IN_REVIEW'].includes(row.state) &&
    (actor.isManager || row.assigneeId === actor.memberId),
});
export const creativeDocumentProjection = (
  document: CreativeDocument | null | undefined,
  actor: CreativeActor,
) => {
  if (!document) return null;
  const result = structuredClone(document);
  if (!actor.capabilities.includes('finance.read')) {
    result.revisionCharge = 0;
    result.mediaRuns?.forEach((run) => {
      run.cost = null;
    });
  }
  return result;
};

@Injectable()
export class DeliveryCreativeReadsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
  ) {}

  private read<TResult>(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    read: (scope: ReadScope) => Promise<TResult>,
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
        const [projects]: { fingerprint: string }[] = await manager.query(
          `SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(p.id,p.revision) ORDER BY p.id)::text,'[]')) AS fingerprint FROM core."deliveryProject" p WHERE ${PROJECT_SCOPE}`,
          [workspace.id, actor.isManager, JSON.stringify([memberId])],
        );
        const identity = {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          actor,
          observedAt: new Date().toISOString(),
          scope: creativeReadHash({
            workspaceId: workspace.id,
            memberId,
            userWorkspaceId,
            roles: [...actor.roleIds].sort(),
            capabilities: [...actor.capabilities].sort(),
            isManager: actor.isManager,
            isAdmin: actor.isAdmin,
            projects: projects.fingerprint,
          }),
        };
        return read({ manager, actor, identity });
      },
      transactionManager,
    );
  }
  private taskFrom(workspace: WorkspaceEntity) {
    const schema = this.delivery.schema(workspace);
    return `FROM core."deliveryTask" d JOIN core."deliveryProject" p ON p."workspaceId"=d."workspaceId" AND p.id=d."projectId" JOIN ${schema}.task n ON n.id=d."taskId" AND n."deletedAt" IS NULL LEFT JOIN ${schema}."workspaceMember" m ON m.id=n."assigneeId" AND m."deletedAt" IS NULL WHERE ${PROJECT_SCOPE} AND d."workspaceId"=$1`;
  }
  private async exact(
    scope: ReadScope,
    workspace: WorkspaceEntity,
    taskId: string,
    document: boolean,
  ) {
    const rows: TaskRow[] = await scope.manager.query(
      `SELECT ${TASK_FIELDS}${document ? ",d.details->'creative' AS document" : ''} ${this.taskFrom(workspace)} AND d."taskId"=$4`,
      [
        workspace.id,
        scope.actor.isManager,
        JSON.stringify([scope.actor.memberId]),
        taskId,
      ],
    );
    if (!rows[0])
      throw new NotFoundException('This creative task is unavailable.');
    return rows[0];
  }
  context(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    transactionManager?: EntityManager,
  ) {
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      async ({ identity }) => identity,
      transactionManager,
    );
  }
  async projects(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryCreativeProjectsDTO> {
    const input = parseCreativeRead(creativeProjectsSchema, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      async ({ manager, actor, identity }) => {
        const search = input.search || null;
        const parameters = [
          workspace.id,
          actor.isManager,
          JSON.stringify([memberId]),
          search ? `%${escapeForIlike(search)}%` : null,
        ];
        const from = `FROM core."deliveryProject" p WHERE ${PROJECT_SCOPE} AND ($4::text IS NULL OR p.name ILIKE $4)`;
        const [metadata]: Metadata[] = await manager.query(
          `SELECT count(*)::int AS "totalCount",md5(COALESCE(jsonb_agg(jsonb_build_array(p.id,p.revision,p.name) ORDER BY p.id)::text,'[]')) AS fingerprint ${from}`,
          parameters,
        );
        const scope = creativeReadHash({
          authority: identity.scope,
          search,
          fingerprint: metadata.fingerprint,
        });
        const cursor = readCreativeCursor(input.after, scope, 'PROJECT');
        const limit = input.limit ?? 25;
        const rows: DeliveryCreativeProjectDTO[] = await manager.query(
          `SELECT p.id,p.name,p.revision ${from} AND ($5::text IS NULL OR (p.name,p.id)>($5,$6::uuid)) ORDER BY p.name,p.id LIMIT $7`,
          [...parameters, cursor?.key ?? null, cursor?.id ?? null, limit + 1],
        );
        const items = rows.slice(0, limit);
        const last = items[items.length - 1];
        return {
          ...identity,
          items,
          totalCount: metadata.totalCount,
          nextCursor:
            rows.length > limit && last
              ? creativeReadCursor(scope, 'PROJECT', last.name, last.id)
              : null,
        };
      },
      transactionManager,
    );
  }
  async tasks(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryCreativeTasksDTO> {
    const input = parseCreativeRead(creativeTasksSchema, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      async ({ manager, actor, identity }) => {
        let selectedProject: DeliveryCreativeProjectDTO | null = null;
        if (input.projectId) {
          const projects: DeliveryCreativeProjectDTO[] = await manager.query(
            `SELECT p.id,p.name,p.revision FROM core."deliveryProject" p WHERE ${PROJECT_SCOPE} AND p.id=$4`,
            [
              workspace.id,
              actor.isManager,
              JSON.stringify([memberId]),
              input.projectId,
            ],
          );
          if (!projects[0])
            throw new NotFoundException(
              'This creative project is unavailable.',
            );
          selectedProject = projects[0];
        }
        const filters = {
          projectId: input.projectId ?? null,
          search: input.search || null,
          state: input.state ?? null,
          mine: input.mine ?? false,
          production: input.production ?? 'ALL',
        };
        const parameters = [
          workspace.id,
          actor.isManager,
          JSON.stringify([memberId]),
          filters.projectId,
          filters.search ? `%${escapeForIlike(filters.search)}%` : null,
          filters.state,
          filters.mine ? memberId : null,
          filters.production,
        ];
        const from = `${this.taskFrom(workspace)} AND ($4::uuid IS NULL OR d."projectId"=$4) AND ($5::text IS NULL OR n.title ILIKE $5) AND ($6::text IS NULL OR d.details->>'state'=$6) AND ($7::uuid IS NULL OR n."assigneeId"=$7) AND ($8='ALL' OR ($8='STARTED' AND d.details->'creative' IS NOT NULL AND d.details->'creative'<>'null'::jsonb) OR ($8='NOT_STARTED' AND (d.details->'creative' IS NULL OR d.details->'creative'='null'::jsonb)))`;
        const [metadata]: Metadata[] = await manager.query(
          `SELECT count(*)::int AS "totalCount",md5(COALESCE(jsonb_agg(jsonb_build_array(d."taskId",d.revision,n.title,n."assigneeId",n."dueAt") ORDER BY d."taskId")::text,'[]')) AS fingerprint ${from}`,
          parameters,
        );
        const scope = creativeReadHash({
          authority: identity.scope,
          filters,
          fingerprint: metadata.fingerprint,
        });
        const cursor = readCreativeCursor(input.after, scope, 'TASK');
        const limit = input.limit ?? 25;
        const rows: TaskRow[] = await manager.query(
          `SELECT ${TASK_FIELDS} ${from} AND ($9::timestamptz IS NULL OR (d."createdAt",d."taskId")<($9::timestamptz,$10::uuid)) ORDER BY d."createdAt" DESC,d."taskId" DESC LIMIT $11`,
          [...parameters, cursor?.key ?? null, cursor?.id ?? null, limit + 1],
        );
        const selected = rows.slice(0, limit);
        const last = selected[selected.length - 1];
        return {
          ...identity,
          selectedProject,
          totalCount: metadata.totalCount,
          items: selected.map((row) => creativeTaskSummary(row, actor)),
          nextCursor:
            rows.length > limit && last
              ? creativeReadCursor(scope, 'TASK', last.createdAtKey, last.id)
              : null,
        };
      },
      transactionManager,
    );
  }
  async state(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryCreativeStateDTO> {
    const input = parseCreativeRead(creativeSelectionSchema, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (scope) => ({
        ...scope.identity,
        task: creativeTaskSummary(
          await this.exact(scope, workspace, input.taskId, false),
          scope.actor,
        ),
      }),
      transactionManager,
    );
  }
  async detail(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryCreativeDetailDTO> {
    const input = parseCreativeRead(creativeSelectionSchema, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (scope) => {
        const row = await this.exact(scope, workspace, input.taskId, true);
        return {
          ...scope.identity,
          task: creativeTaskSummary(row, scope.actor),
          document: creativeDocumentProjection(row.document, scope.actor),
        };
      },
      transactionManager,
    );
  }
  async references(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryCreativeReferencesDTO> {
    const input = parseCreativeRead(creativeReferencesSchema, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (scope) => {
        const task = await this.exact(scope, workspace, input.taskId, false);
        const search = input.search || null;
        const parameters = [
          workspace.id,
          scope.actor.isManager,
          JSON.stringify([memberId]),
          task.projectId,
          task.id,
          search ? `%${escapeForIlike(search)}%` : null,
        ];
        const from = `${this.taskFrom(workspace).replace(' WHERE ', ` CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d.details->'creative'->'references','[]'::jsonb)) reference(value) WHERE `)} AND d."projectId"=$4 AND d."taskId"<>$5 AND reference.value->>'url' ~ '^https?://' AND reference.value->'reviews'->-1->>'decision'='APPROVED' AND ($6::text IS NULL OR reference.value->>'title' ILIKE $6 OR n.title ILIKE $6)`;
        const [metadata]: Metadata[] = await scope.manager.query(
          `SELECT count(*)::int AS "totalCount",md5(COALESCE(jsonb_agg(jsonb_build_array(d."taskId",d.revision,reference.value->>'id',reference.value->>'version') ORDER BY d."taskId",reference.value->>'id')::text,'[]')) AS fingerprint ${from}`,
          parameters,
        );
        const pageScope = creativeReadHash({
          authority: scope.identity.scope,
          taskId: task.id,
          projectId: task.projectId,
          search,
          fingerprint: metadata.fingerprint,
        });
        const cursor = readCreativeCursor(input.after, pageScope, 'REFERENCE');
        const limit = input.limit ?? 25;
        const rows: DeliveryCreativeApprovedReferenceDTO[] =
          await scope.manager.query(
            `SELECT reference.value->>'id' AS id,(reference.value->>'version')::int AS version,reference.value->>'title' AS title,reference.value->>'url' AS url,left(reference.value->>'summary',300) AS "summaryPreview",length(reference.value->>'summary')>300 AS "summaryTruncated",d."taskId" AS "sourceTaskId",n.title AS "sourceTaskTitle",d.revision AS "sourceTaskRevision",reference.value->'reviews'->-1->>'at' AS "approvedAt" ${from} AND ($7::uuid IS NULL OR (d."taskId",(reference.value->>'id')::uuid)>($7::uuid,$8::uuid)) ORDER BY d."taskId",(reference.value->>'id')::uuid LIMIT $9`,
            [...parameters, cursor?.key ?? null, cursor?.id ?? null, limit + 1],
          );
        const items = rows.slice(0, limit);
        const last = items[items.length - 1];
        return {
          ...scope.identity,
          taskId: task.id,
          projectId: task.projectId,
          projectRevision: task.projectRevision,
          items,
          totalCount: metadata.totalCount,
          nextCursor:
            rows.length > limit && last
              ? creativeReadCursor(
                  pageScope,
                  'REFERENCE',
                  last.sourceTaskId,
                  last.id,
                )
              : null,
        };
      },
      transactionManager,
    );
  }
}
