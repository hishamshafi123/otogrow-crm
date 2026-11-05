import {
  knowledgeAssetAnchorSql,
  type KnowledgeAssetBinding,
} from 'src/modules/delivery/knowledge/assets/delivery-knowledge-assets.policy';
import { readKnowledgeAssetBindings } from 'src/modules/delivery/knowledge/assets/delivery-knowledge-assets.binding';
import { fathomKnowledgeAnchorSql } from 'src/modules/delivery/knowledge/fathom/fathom-knowledge-anchor';
import { type FathomProvenance } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.types';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeForIlike } from 'twenty-shared/utils';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { canAccessDeliveryProject } from 'src/modules/delivery/delivery-policy';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import {
  type DeliveryKnowledgeDetailDTO,
  type DeliveryKnowledgeItemDTO,
} from 'src/modules/delivery/knowledge/delivery-knowledge.dto';
import {
  type DeliveryKnowledgeContextDTO,
  type DeliveryKnowledgeProjectsDTO,
  type DeliveryKnowledgeListDTO,
  type DeliveryKnowledgeStateDTO,
  type DeliveryKnowledgeExactDetailDTO,
  type DeliveryKnowledgeSourceStateDTO,
  type DeliveryKnowledgeProjectDTO,
} from 'src/modules/delivery/knowledge/reads/delivery-knowledge-reads.dto';
import {
  DELIVERY_KNOWLEDGE_PAGE_SIZE,
  deliveryKnowledgeContextSchema,
  deliveryKnowledgeProjectsSchema,
  deliveryKnowledgeListSchema,
  deliveryKnowledgeSelectionSchema,
  parseDeliveryKnowledgeRead,
  deliveryKnowledgeScope,
  deliveryKnowledgeCursor,
  readDeliveryKnowledgeCursor,
} from 'src/modules/delivery/knowledge/reads/delivery-knowledge-reads.policy';

type KnowledgeActor = Awaited<ReturnType<DeliveryService['actor']>>;
type KnowledgeReadScope = {
  manager: EntityManager;
  actor: KnowledgeActor;
  project: DeliveryKnowledgeProjectDTO | null;
};
type Metadata = { totalCount: number; fingerprint: string };
type SourceRow = DeliveryKnowledgeSourceStateDTO & {
  createdAtKey: string;
  sourceUrl?: string;
  transcript?: string | null;
  knowledge?: string;
  fathomProvenance?: FathomProvenance | null;
  attachments?: KnowledgeAssetBinding[];
};
const VISIBLE_VERSION = `CASE WHEN $3::boolean OR s."createdBy"=$4::uuid THEN s."currentVersion" ELSE s."publishedVersion" END`;
const SOURCE_FROM = `FROM core."deliveryKnowledgeSource" s JOIN core."deliveryKnowledgeVersion" v ON v."workspaceId"=s."workspaceId" AND v."sourceId"=s.id AND v.version=${VISIBLE_VERSION} WHERE s."workspaceId"=$1 AND s."projectId"=$2 AND ${fathomKnowledgeAnchorSql('s', 'v')} AND ${knowledgeAssetAnchorSql('s', 'v')}`;
const SOURCE_FIELDS = `s.id,s.revision,s."createdBy",s."currentVersion",s."publishedVersion",to_char(s."publishedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "publishedAt",v.title,v.category,v."meetingDate"::text AS "meetingDate",v.version,($3::boolean OR s."createdBy"=$4::uuid) AS "canEdit",to_char(s."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtKey"`;

const sourceSummary = (row: SourceRow): DeliveryKnowledgeItemDTO => ({
  id: row.id,
  revision: row.revision,
  title: row.title,
  category: row.category,
  meetingDate: row.meetingDate,
  version: row.version,
  publishedVersion: row.publishedVersion,
  publishedAt: row.publishedAt,
  createdBy: row.createdBy,
  canEdit: row.canEdit,
});

@Injectable()
export class DeliveryKnowledgeReadsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
  ) {}

  private read<TResult>(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    projectId: string | null | undefined,
    read: (scope: KnowledgeReadScope) => Promise<TResult>,
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
        let project: DeliveryKnowledgeProjectDTO | null = null;
        if (projectId) {
          const selected = await manager
            .getRepository(DeliveryProjectEntity)
            .findOne({
              select: {
                id: true,
                name: true,
                revision: true,
                memberIds: true,
                companyId: true,
              },
              where: { workspaceId: workspace.id, id: projectId },
            });
          if (
            !selected ||
            !canAccessDeliveryProject(
              actor.isManager,
              memberId,
              selected.memberIds,
            )
          )
            throw new ForbiddenException('This project is unavailable.');
          await manager.query(
            'SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',
            [`knowledge:${workspace.id}:${projectId}`],
          );
          project = {
            id: selected.id,
            name: selected.name,
            revision: selected.revision,
            companyId: selected.companyId ?? null,
          };
        }
        return read({ manager, actor, project });
      },
    );
  }

  private identity(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    actor: KnowledgeActor,
  ) {
    return {
      workspaceId,
      memberId,
      userWorkspaceId,
      actor,
      observedAt: new Date().toISOString(),
    };
  }

  private scopeIdentity(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    actor: KnowledgeActor,
  ) {
    return {
      workspaceId,
      memberId,
      userWorkspaceId,
      roleIds: actor.roleIds.slice().sort(),
      capabilities: actor.capabilities.slice().sort(),
      isManager: actor.isManager,
      isAdmin: actor.isAdmin,
    };
  }

  async context(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ): Promise<DeliveryKnowledgeContextDTO> {
    const input = parseDeliveryKnowledgeRead(
      deliveryKnowledgeContextSchema,
      raw,
    );
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      input.projectId,
      async ({ actor, project }) => ({
        ...this.identity(workspace.id, memberId, userWorkspaceId, actor),
        selectedProject: project,
        canPublish: actor.isManager,
      }),
    );
  }

  async projects(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ): Promise<DeliveryKnowledgeProjectsDTO> {
    const input = parseDeliveryKnowledgeRead(
      deliveryKnowledgeProjectsSchema,
      raw,
    );
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      null,
      async ({ manager, actor }) => {
        const search = input.search || null;
        const parameters = [
          workspace.id,
          actor.isManager,
          JSON.stringify([memberId]),
          search ? `%${escapeForIlike(search)}%` : null,
        ];
        const from = `FROM core."deliveryProject" p WHERE p."workspaceId"=$1 AND ($2::boolean OR p."memberIds" @> $3::jsonb) AND ($4::text IS NULL OR p.name ILIKE $4)`;
        const [metadata]: Metadata[] = await manager.query(
          `SELECT count(*)::int AS "totalCount",md5(COALESCE(jsonb_agg(jsonb_build_array(p.id,p.revision,p.name,p."companyId") ORDER BY p.id)::text,'[]')) AS fingerprint ${from}`,
          parameters,
        );
        const scope = deliveryKnowledgeScope({
          identity: this.scopeIdentity(
            workspace.id,
            memberId,
            userWorkspaceId,
            actor,
          ),
          search,
          fingerprint: metadata.fingerprint,
        });
        const cursor = readDeliveryKnowledgeCursor(
          input.after,
          scope,
          'PROJECT',
        );
        const limit = input.limit ?? DELIVERY_KNOWLEDGE_PAGE_SIZE;
        const rows: DeliveryKnowledgeProjectDTO[] = await manager.query(
          `SELECT p.id,p.name,p.revision,p."companyId" ${from} AND ($5::text IS NULL OR (p.name COLLATE "C",p.id)>($5::text COLLATE "C",$6::uuid)) ORDER BY p.name COLLATE "C",p.id LIMIT $7`,
          [...parameters, cursor?.key ?? null, cursor?.id ?? null, limit + 1],
        );
        const items = rows.slice(0, limit);
        const last = items[items.length - 1];
        return {
          ...this.identity(workspace.id, memberId, userWorkspaceId, actor),
          items,
          totalCount: metadata.totalCount,
          scope,
          nextCursor:
            rows.length > limit && last
              ? deliveryKnowledgeCursor(scope, 'PROJECT', last.name, last.id)
              : null,
        };
      },
    );
  }

  async list(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ): Promise<DeliveryKnowledgeListDTO> {
    const input = parseDeliveryKnowledgeRead(deliveryKnowledgeListSchema, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      input.projectId,
      async ({ manager, actor, project }) => {
        const search = input.search || null;
        const category = input.category ?? null;
        const parameters = [
          workspace.id,
          input.projectId,
          actor.isManager,
          memberId,
          category,
          search ? `%${escapeForIlike(search)}%` : null,
        ];
        const from = `${SOURCE_FROM} AND ($5::text IS NULL OR v.category=$5) AND ($6::text IS NULL OR v.title ILIKE $6 OR v.knowledge ILIKE $6)`;
        const [metadata]: Metadata[] = await manager.query(
          `SELECT count(*)::int AS "totalCount",md5(COALESCE(string_agg(s.id::text || ':' || s.revision::text || ':' || v.version::text,'|' ORDER BY s.id),'')) AS fingerprint ${from}`,
          parameters,
        );
        const scope = deliveryKnowledgeScope({
          identity: this.scopeIdentity(
            workspace.id,
            memberId,
            userWorkspaceId,
            actor,
          ),
          project,
          category,
          search,
          fingerprint: metadata.fingerprint,
        });
        const cursor = readDeliveryKnowledgeCursor(
          input.after,
          scope,
          'SOURCE',
        );
        const limit = input.limit ?? DELIVERY_KNOWLEDGE_PAGE_SIZE;
        const rows: SourceRow[] = await manager.query(
          `SELECT ${SOURCE_FIELDS} ${from} AND ($7::timestamptz IS NULL OR (s."createdAt",s.id)<($7::timestamptz,$8::uuid)) ORDER BY s."createdAt" DESC,s.id DESC LIMIT $9`,
          [...parameters, cursor?.key ?? null, cursor?.id ?? null, limit + 1],
        );
        const shown = rows.slice(0, limit);
        const last = shown[shown.length - 1];
        return {
          ...this.identity(workspace.id, memberId, userWorkspaceId, actor),
          project: project!,
          items: shown.map(sourceSummary),
          totalCount: metadata.totalCount,
          scope,
          nextCursor:
            rows.length > limit && last
              ? deliveryKnowledgeCursor(
                  scope,
                  'SOURCE',
                  last.createdAtKey,
                  last.id,
                )
              : null,
        };
      },
    );
  }

  private async selection(
    manager: EntityManager,
    workspaceId: string,
    memberId: string,
    actor: KnowledgeActor,
    input: { projectId: string; sourceId: string; version?: number | null },
    content: boolean,
  ) {
    // A staff member's requested version must still be the current published version.
    const version = `COALESCE($6::integer,${VISIBLE_VERSION})`;
    const projection = content
      ? `,CASE WHEN $3::boolean OR s."createdBy"=$4::uuid THEN v."sourceUrl" ELSE '' END AS "sourceUrl",CASE WHEN $3::boolean OR s."createdBy"=$4::uuid THEN v.transcript ELSE NULL END AS transcript,v.knowledge,v.attachments,CASE WHEN $3::boolean OR s."createdBy"=$4::uuid THEN v."fathomProvenance" ELSE NULL END AS "fathomProvenance"`
      : '';
    const rows: SourceRow[] = await manager.query(
      `SELECT ${SOURCE_FIELDS}${projection} FROM core."deliveryKnowledgeSource" s JOIN core."deliveryKnowledgeVersion" v ON v."workspaceId"=s."workspaceId" AND v."sourceId"=s.id AND v.version=${version} WHERE s."workspaceId"=$1 AND s."projectId"=$2 AND s.id=$5 AND ($3::boolean OR s."createdBy"=$4::uuid OR v.version=s."publishedVersion") AND ${fathomKnowledgeAnchorSql('s', 'v')} AND ${knowledgeAssetAnchorSql('s', 'v')} LIMIT 1`,
      [
        workspaceId,
        input.projectId,
        actor.isManager,
        memberId,
        input.sourceId,
        input.version ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async state(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ): Promise<DeliveryKnowledgeStateDTO> {
    const input = parseDeliveryKnowledgeRead(
      deliveryKnowledgeSelectionSchema,
      raw,
    );
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      input.projectId,
      async ({ manager, actor, project }) => {
        const row = await this.selection(
          manager,
          workspace.id,
          memberId,
          actor,
          input,
          false,
        );
        return {
          ...this.identity(workspace.id, memberId, userWorkspaceId, actor),
          project: project!,
          canPublish: actor.isManager,
          source: row
            ? { ...sourceSummary(row), currentVersion: row.currentVersion }
            : null,
        };
      },
    );
  }

  async detail(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ): Promise<DeliveryKnowledgeExactDetailDTO> {
    const input = parseDeliveryKnowledgeRead(
      deliveryKnowledgeSelectionSchema,
      raw,
    );
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      input.projectId,
      async ({ manager, actor, project }) => {
        const row = await this.selection(
          manager,
          workspace.id,
          memberId,
          actor,
          input,
          true,
        );
        const detail: DeliveryKnowledgeDetailDTO | null = row
          ? {
              ...sourceSummary(row),
              currentVersion: row.currentVersion,
              sourceUrl: row.canEdit ? (row.sourceUrl ?? '') : '',
              transcript: row.canEdit ? (row.transcript ?? null) : null,
              knowledge: row.knowledge ?? '',
              attachments: await readKnowledgeAssetBindings(
                manager,
                workspace.id,
                input.projectId,
                input.sourceId,
                row.attachments,
              ),
              fathomProvenance: row.canEdit
                ? (row.fathomProvenance ?? null)
                : null,
            }
          : null;
        return {
          ...this.identity(workspace.id, memberId, userWorkspaceId, actor),
          project: project!,
          canPublish: actor.isManager,
          detail,
        };
      },
    );
  }
}
