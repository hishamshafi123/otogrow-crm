import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import { DeliveryAgentService } from 'src/modules/delivery/agents/delivery-agent.service';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { DeliveryAgentRunEntity } from 'src/modules/delivery/entities/delivery-agent-run.entity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { type DeliveryAgentConfiguration } from 'src/modules/delivery/agents/delivery-agent.types';
import {
  deliveryAgentProjectScopeSql,
  readDeliveryAgentActor,
  type DeliveryAssistantActor,
} from 'src/modules/delivery/agents/delivery-agent-scope';
import {
  DELIVERY_ASSISTANT_DIRECTORY_LIMIT,
  DELIVERY_ASSISTANT_PAGE_SIZE,
  deliveryAssistantCatalogSchema,
  deliveryAssistantContextSchema,
  deliveryAssistantCursor,
  deliveryAssistantRequestSchema,
  deliveryAssistantRunSchema,
  deliveryAssistantRunsSchema,
  deliveryAssistantSaveSchema,
  deliveryAssistantScopeHash,
  deliveryAssistantSelectionSchema,
  parseDeliveryAssistantInput,
  readDeliveryAssistantCursor,
} from 'src/modules/delivery/agents/reads/delivery-assistants.policy';
import {
  type DeliveryAssistantCatalogDTO,
  type DeliveryAssistantConfigurationDetailDTO,
  type DeliveryAssistantContextDTO,
  type DeliveryAssistantProjectDTO,
  type DeliveryAssistantRunDetailDTO,
  type DeliveryAssistantRunReceiptDTO,
  type DeliveryAssistantRunSummaryDTO,
  type DeliveryAssistantRunsDTO,
  type DeliveryAssistantSummaryDTO,
  type DeliveryAssistantTaskDTO,
} from 'src/modules/delivery/agents/reads/delivery-assistants.dto';

type AssistantReadScope = {
  actor: DeliveryAssistantActor;
  projects: DeliveryAssistantProjectDTO[];
  task: DeliveryAssistantTaskDTO | null;
  fingerprint: string;
};
type AssistantCatalogRow = DeliveryAssistantSummaryDTO;
type AssistantRunRow = DeliveryAssistantRunSummaryDTO;
const timestampSql = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const identity = (
  workspace: WorkspaceEntity,
  memberId: string,
  userWorkspaceId: string,
) => ({ workspaceId: workspace.id, memberId, userWorkspaceId });
const dateString = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : value;
const cleanCommand = (
  value: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null)
      .map(([key, item]) => [
        key,
        key === 'inputs' && typeof item === 'object' && item !== null
          ? cleanCommand(item as Record<string, unknown>)
          : item,
      ]),
  );
const configurationDto = (value: DeliveryAgentConfiguration) => ({
  ...value,
  roleIds: value.roleIds ?? null,
});

@Injectable()
export class DeliveryAssistantsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly agents: DeliveryAgentService,
    private readonly models: AiModelRegistryService,
    private readonly nativeTasks: DeliveryNativeTaskAccessService,
  ) {}
  private async scope(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId?: string | null,
  ): Promise<AssistantReadScope> {
    const actor = await readDeliveryAgentActor(
      manager,
      this.delivery,
      workspace,
      memberId,
      userWorkspaceId,
    );
    const projects: DeliveryAssistantProjectDTO[] = await manager.query(
      `SELECT project.id,project.name,project.revision FROM core."deliveryProject" project WHERE project."workspaceId"=$1 AND ${deliveryAgentProjectScopeSql('$2', '$3')} ORDER BY project.id LIMIT $4`,
      [
        workspace.id,
        actor.isManager,
        JSON.stringify([memberId]),
        DELIVERY_ASSISTANT_DIRECTORY_LIMIT + 1,
      ],
    );
    if (projects.length > DELIVERY_ASSISTANT_DIRECTORY_LIMIT)
      throw new BadRequestException(
        'There are too many project choices to load safely. Narrow the workspace project directory before continuing.',
      );
    let task: DeliveryAssistantTaskDTO | null = null;
    let taskAccess: string | null = null;
    if (taskId) {
      const visibility = await this.nativeTasks.visibility(
        manager,
        workspace,
        { memberId, userWorkspaceId },
        ['id', 'title', 'assigneeId'],
      );
      taskAccess = visibility.fingerprint;
      const rows = await this.nativeTasks.query<DeliveryAssistantTaskDTO[]>(
        manager,
        `SELECT task."taskId" AS id,native.title,task."projectId",task.revision,COALESCE(NULLIF(task.details->>'state',''),'UNAVAILABLE') AS state,native."assigneeId",left(COALESCE(task.details->>'brief',''),20000) AS brief,left(COALESCE(task.details->>'draftCopy',''),20000) AS "draftCopy" ${this.taskFrom(workspace)} WHERE task."workspaceId"=$1 AND ${deliveryAgentProjectScopeSql('$2', '$3')} AND task."taskId"=$4 AND ${this.nativeTasks.predicate(workspace, visibility, 'task."taskId"')}`,
        [workspace.id, actor.isManager, JSON.stringify([memberId]), taskId],
        visibility,
      );
      task = rows[0] ?? null;
      if (!task)
        throw new NotFoundException(
          'This task is unavailable in your current project access.',
        );
    }
    return {
      actor,
      projects,
      task,
      fingerprint: deliveryAssistantScopeHash({
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        taskAccess,
        actor: {
          isAdmin: actor.isAdmin,
          isManager: actor.isManager,
          roleIds: [...actor.roleIds].sort(),
          capabilities: [...actor.capabilities].sort(),
        },
        projects: projects.map(({ id, revision }) => ({ id, revision })),
        task: task
          ? { id: task.id, projectId: task.projectId, revision: task.revision }
          : null,
      }),
    };
  }
  private taskFrom(workspace: WorkspaceEntity) {
    return `FROM core."deliveryTask" task JOIN core."deliveryProject" project ON project.id=task."projectId" AND project."workspaceId"=task."workspaceId" JOIN ${this.delivery.schema(workspace)}.task native ON native.id=task."taskId" AND native."deletedAt" IS NULL`;
  }
  private catalogAccess() {
    // Named roles take precedence over broad access groups, including for administrators.
    return `(agent.configuration->>'enabled'='true' AND CASE WHEN jsonb_typeof(agent.configuration->'roleIds')='array' THEN (agent.configuration->'roleIds') ?| $3::text[] WHEN agent.configuration->'roleIds' IS NULL OR agent.configuration->'roleIds'='null'::jsonb THEN (agent.configuration->'roles') ? $4::text ELSE false END AND CASE WHEN agent.configuration->>'kind'='ACTIVITY' THEN $2::boolean AND agent.configuration->'projectIds'='[]'::jsonb ELSE (agent.configuration->'projectIds') ?| $5::text[] END)`;
  }
  private catalogParameters(
    workspace: WorkspaceEntity,
    scope: AssistantReadScope,
  ) {
    return [
      workspace.id,
      scope.actor.isAdmin,
      scope.actor.roleIds,
      scope.actor.isAdmin
        ? 'ADMIN'
        : scope.actor.isManager
          ? 'MANAGER'
          : 'MEMBER',
      scope.task ? [scope.task.projectId] : scope.projects.map(({ id }) => id),
    ];
  }
  private catalogProjection(scope: AssistantReadScope) {
    return `agent.id,left(agent.configuration->>'name',100) AS name,left(agent.configuration->>'purpose',1000) AS purpose,agent.configuration->>'kind' AS kind,(agent.configuration->>'enabled'='true') AS enabled,agent.version,COALESCE(agent.configuration->'requiredInputs','[]'::jsonb) AS "requiredInputs",${timestampSql('agent."createdAt"')} AS "createdAt",${timestampSql('agent."updatedAt"')} AS "updatedAt",(${this.catalogAccess()} AND (agent.configuration->>'kind'<>'ADVERTISING' OR ${scope.actor.isManager && !scope.task ? 'true' : 'false'})) AS "canRun"`;
  }
  async context(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryAssistantContextDTO> {
    const parsed = parseDeliveryAssistantInput(
      deliveryAssistantContextSchema,
      input,
    );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          parsed.taskId,
        );
        const models = scope.actor.isAdmin
          ? this.models
              .getAdminFilteredModels()
              .filter((model) => {
                try {
                  this.models.validateModelAvailability(
                    model.modelId,
                    workspace,
                  );
                  return true;
                } catch {
                  return false;
                }
              })
              .map((model) => ({
                id: model.modelId,
                provider: model.providerName ?? '',
              }))
          : [];
        return {
          ...identity(workspace, memberId, userWorkspaceId),
          observedAt: new Date().toISOString(),
          actor: scope.actor,
          canConfigure: scope.actor.isAdmin,
          projects: scope.actor.isAdmin ? scope.projects : [],
          models,
          selectedTask: scope.task,
        };
      },
      transactionManager,
    );
  }
  async catalog(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryAssistantCatalogDTO> {
    const parsed = parseDeliveryAssistantInput(
      deliveryAssistantCatalogSchema,
      input,
    );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          parsed.taskId,
        );
        if (
          parsed.projectId &&
          !scope.projects.some((project) => project.id === parsed.projectId)
        )
          throw new NotFoundException(
            'This project is unavailable in your current assistant access.',
          );
        if (
          scope.task &&
          parsed.projectId &&
          scope.task.projectId !== parsed.projectId
        )
          throw new NotFoundException(
            'The selected task and project do not match.',
          );
        const limit = parsed.limit ?? DELIVERY_ASSISTANT_PAGE_SIZE;
        const filters = {
          taskId: parsed.taskId ?? null,
          projectId: parsed.projectId ?? null,
          search: parsed.search ?? '',
          kind: parsed.kind ?? null,
          enabled: parsed.enabled ?? null,
          limit,
        };
        const fingerprint = deliveryAssistantScopeHash({
          scope: scope.fingerprint,
          filters,
          kind: 'CATALOG',
        });
        const cursor = readDeliveryAssistantCursor(parsed.after, fingerprint);
        const observedAt = cursor?.observedAt ?? new Date().toISOString();
        const parameters: unknown[] = [
          ...this.catalogParameters(workspace, scope),
          observedAt,
        ];
        const where = [
          'agent."workspaceId"=$1',
          `($2::boolean OR ${this.catalogAccess()})`,
          'agent."createdAt"<=$6::timestamptz',
        ];
        const add = (value: unknown) => {
          parameters.push(value);
          return `$${parameters.length}`;
        };
        if (scope.task)
          where.push("agent.configuration->>'kind' IN ('BRIEF','COPY','SEO')");
        else if (parsed.projectId)
          where.push("agent.configuration->>'kind'<>'ACTIVITY'");
        if (parsed.projectId)
          where.push(
            `(agent.configuration->'projectIds') ? ${add(parsed.projectId)}::text`,
          );
        if (scope.task)
          where.push(
            `(agent.configuration->'projectIds') ? ${add(scope.task.projectId)}::text`,
          );
        if (parsed.search)
          where.push(
            `(strpos(lower(agent.configuration->>'name'),lower(${add(parsed.search)}::text))>0 OR strpos(lower(agent.configuration->>'purpose'),lower($${parameters.length}::text))>0)`,
          );
        if (parsed.kind)
          where.push(`agent.configuration->>'kind'=${add(parsed.kind)}`);
        if (parsed.enabled != null)
          where.push(
            `(agent.configuration->>'enabled'='true')=${add(parsed.enabled)}::boolean`,
          );
        const pageWhere = cursor
          ? `(source."createdAt"::timestamptz,source.id)<(${add(cursor.createdAt)}::timestamptz,${add(cursor.id)}::uuid)`
          : 'true';
        const take = add(limit + 1);
        const rows: { totalCount: number; items: AssistantCatalogRow[] }[] =
          await manager.query(
            `WITH source AS MATERIALIZED (SELECT ${this.catalogProjection(scope)} FROM core."deliveryAgent" agent WHERE ${where.join(' AND ')}) SELECT (SELECT count(*)::int FROM source) AS "totalCount",COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY page."createdAt" DESC,page.id DESC) FROM (SELECT * FROM source WHERE ${pageWhere} ORDER BY "createdAt" DESC,id DESC LIMIT ${take}) page),'[]'::jsonb) AS items`,
            parameters,
          );
        const result = rows[0];
        const items = (result?.items ?? []).slice(0, limit);
        const last = items[items.length - 1];
        return {
          ...identity(workspace, memberId, userWorkspaceId),
          observedAt,
          totalCount: result?.totalCount ?? 0,
          items,
          nextCursor:
            (result?.items.length ?? 0) > limit && last
              ? deliveryAssistantCursor(
                  fingerprint,
                  observedAt,
                  last.createdAt,
                  last.id,
                )
              : null,
        };
      },
      transactionManager,
    );
  }
  async assistant(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
    const parsed = parseDeliveryAssistantInput(
      deliveryAssistantSelectionSchema,
      input,
    );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          parsed.taskId,
        );
        const parameters: unknown[] = [
          ...this.catalogParameters(workspace, scope),
          parsed.agentId,
        ];
        const selectedTask = scope.task
          ? " AND (agent.configuration->'projectIds') ? $7::text AND agent.configuration->>'kind' IN ('BRIEF','COPY','SEO')"
          : '';
        if (scope.task) parameters.push(scope.task.projectId);
        const rows: AssistantCatalogRow[] = await manager.query(
          `SELECT ${this.catalogProjection(scope)} FROM core."deliveryAgent" agent WHERE agent."workspaceId"=$1 AND agent.id=$6 AND ($2::boolean OR ${this.catalogAccess()})${selectedTask}`,
          parameters,
        );
        if (!rows[0])
          throw new NotFoundException(
            'This assistant is unavailable in your current access.',
          );
        return {
          ...identity(workspace, memberId, userWorkspaceId),
          observedAt: new Date().toISOString(),
          assistant: rows[0],
        };
      },
      transactionManager,
    );
  }
  async configuration(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryAssistantConfigurationDetailDTO> {
    const parsed = parseDeliveryAssistantInput(
      deliveryAssistantSelectionSchema,
      input,
    );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          parsed.taskId,
        );
        if (!scope.actor.isAdmin)
          throw new ForbiddenException(
            'Only admins can read assistant configuration.',
          );
        const agent = await manager
          .getRepository(DeliveryAgentEntity)
          .findOneBy({ workspaceId: workspace.id, id: parsed.agentId });
        if (!agent)
          throw new NotFoundException(
            'Assistant configuration is unavailable.',
          );
        return {
          ...identity(workspace, memberId, userWorkspaceId),
          observedAt: new Date().toISOString(),
          id: agent.id,
          version: agent.version,
          createdAt: dateString(agent.createdAt),
          updatedAt: dateString(agent.updatedAt),
          configuration: configurationDto(agent.configuration),
        };
      },
      transactionManager,
    );
  }
  private runFrom(workspace: WorkspaceEntity) {
    return `FROM core."deliveryAgentRun" run JOIN core."deliveryTask" task ON task."taskId"=run."taskId" AND task."workspaceId"=run."workspaceId" JOIN core."deliveryProject" project ON project.id=task."projectId" AND project."workspaceId"=run."workspaceId" JOIN ${this.delivery.schema(workspace)}.task native ON native.id=task."taskId" AND native."deletedAt" IS NULL`;
  }
  private runProjection() {
    return `run.id,run."taskId",native.title AS "taskTitle",task."projectId",project.name AS "projectName",run."agentId",left(run.configuration->>'name',100) AS "agentName",run.configuration->>'kind' AS kind,run."initiatorId",run."taskRevision",run."agentVersion",run.status,${timestampSql('run."createdAt"')} AS "createdAt",${timestampSql('run."updatedAt"')} AS "updatedAt",run.decision->>'at' AS "decisionAt",run.decision->>'action' AS "decisionAction",CASE WHEN jsonb_typeof(run.result->'findings')='array' THEN jsonb_array_length(run.result->'findings')>0 ELSE false END AS "hasFindings",nullif(run.result->>'suggestedBrief','') IS NOT NULL AS "hasSuggestedBrief",nullif(run.result->>'suggestedCopy','') IS NOT NULL AS "hasSuggestedCopy"`;
  }
  async runs(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryAssistantRunsDTO> {
    const parsed = parseDeliveryAssistantInput(
      deliveryAssistantRunsSchema,
      input,
    );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          parsed.taskId,
        );
        if (
          parsed.projectId &&
          !scope.projects.some(({ id }) => id === parsed.projectId)
        )
          throw new NotFoundException(
            'This project is unavailable in your current access.',
          );
        const limit = parsed.limit ?? DELIVERY_ASSISTANT_PAGE_SIZE;
        const filters = {
          taskId: parsed.taskId ?? null,
          projectId: parsed.projectId ?? null,
          agentId: parsed.agentId ?? null,
          status: parsed.status ?? null,
          limit,
        };
        const visibility = await this.nativeTasks.visibility(
          manager,
          workspace,
          { memberId, userWorkspaceId },
          ['id', 'title'],
        );
        const fingerprint = deliveryAssistantScopeHash({
          scope: scope.fingerprint,
          nativeAccess: visibility.fingerprint,
          filters,
          kind: 'RUNS',
        });
        const cursor = readDeliveryAssistantCursor(parsed.after, fingerprint);
        const observedAt = cursor?.observedAt ?? new Date().toISOString();
        const parameters: unknown[] = [
          workspace.id,
          scope.actor.isManager,
          JSON.stringify([memberId]),
          memberId,
          observedAt,
        ];
        const where = [
          'run."workspaceId"=$1',
          deliveryAgentProjectScopeSql('$2', '$3'),
          '($2::boolean OR run."initiatorId"=$4::uuid)',
          'run."createdAt"<=$5::timestamptz',
          this.nativeTasks.predicate(workspace, visibility, 'run."taskId"'),
        ];
        const add = (value: unknown) => {
          parameters.push(value);
          return `$${parameters.length}`;
        };
        if (parsed.taskId)
          where.push(`run."taskId"=${add(parsed.taskId)}::uuid`);
        if (parsed.projectId)
          where.push(`task."projectId"=${add(parsed.projectId)}::uuid`);
        if (parsed.agentId)
          where.push(`run."agentId"=${add(parsed.agentId)}::uuid`);
        if (parsed.status) where.push(`run.status=${add(parsed.status)}`);
        const pageWhere = cursor
          ? `(source."createdAt",source.id)<(${add(cursor.createdAt)}::timestamptz,${add(cursor.id)}::uuid)`
          : 'true';
        const take = add(limit + 1);
        const rows: {
          totalCount: number;
          byStatus: { status: string; count: number }[];
          items: AssistantRunRow[];
        }[] = await this.nativeTasks.query(
          manager,
          `WITH source AS MATERIALIZED (SELECT run.id,run.status,run."createdAt" ${this.runFrom(workspace)} WHERE ${where.join(' AND ')}),selected AS MATERIALIZED (SELECT source.id,source."createdAt" FROM source WHERE ${pageWhere} ORDER BY source."createdAt" DESC,source.id DESC LIMIT ${take}),page AS MATERIALIZED (SELECT ${this.runProjection()} ${this.runFrom(workspace)} JOIN selected ON selected.id=run.id WHERE run."workspaceId"=$1) SELECT (SELECT count(*)::int FROM source) AS "totalCount",COALESCE((SELECT jsonb_agg(to_jsonb(counts) ORDER BY counts.status) FROM (SELECT status,count(*)::int AS count FROM source GROUP BY status) counts),'[]'::jsonb) AS "byStatus",COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY page."createdAt" DESC,page.id DESC) FROM page),'[]'::jsonb) AS items`,
          parameters,
          visibility,
        );
        const result = rows[0];
        const items = (result?.items ?? []).slice(0, limit);
        const last = items[items.length - 1];
        return {
          ...identity(workspace, memberId, userWorkspaceId),
          observedAt,
          totalCount: result?.totalCount ?? 0,
          byStatus: result?.byStatus ?? [],
          items,
          nextCursor:
            (result?.items.length ?? 0) > limit && last
              ? deliveryAssistantCursor(
                  fingerprint,
                  observedAt,
                  last.createdAt,
                  last.id,
                )
              : null,
        };
      },
      transactionManager,
    );
  }
  private async runSummary(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    scope: AssistantReadScope,
    memberId: string,
    userWorkspaceId: string,
    runId: string,
  ) {
    const visibility = await this.nativeTasks.visibility(
      manager,
      workspace,
      { memberId, userWorkspaceId },
      ['id', 'title'],
    );
    const rows = await this.nativeTasks.query<AssistantRunRow[]>(
      manager,
      `SELECT ${this.runProjection()} ${this.runFrom(workspace)} WHERE run."workspaceId"=$1 AND ${deliveryAgentProjectScopeSql('$2', '$3')} AND ($2::boolean OR run."initiatorId"=$4::uuid) AND run.id=$5 AND ${this.nativeTasks.predicate(workspace, visibility, 'run."taskId"')}`,
      [
        workspace.id,
        scope.actor.isManager,
        JSON.stringify([memberId]),
        memberId,
        runId,
      ],
      visibility,
    );
    if (!rows[0])
      throw new NotFoundException(
        'This run is unavailable in your current task and project access.',
      );
    return rows[0];
  }
  async run(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryAssistantRunDetailDTO> {
    const parsed = parseDeliveryAssistantInput(
      deliveryAssistantRunSchema,
      input,
    );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        const summary = await this.runSummary(
          manager,
          workspace,
          scope,
          memberId,
          userWorkspaceId,
          parsed.runId,
        );
        const exactScope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          summary.taskId,
        );
        const run = await manager
          .getRepository(DeliveryAgentRunEntity)
          .findOneByOrFail({ workspaceId: workspace.id, id: summary.id });
        const task = exactScope.task;
        if (!task) throw new NotFoundException();
        const eligibility = await this.agents.reviewAvailability(
          manager,
          workspace,
          scope.actor,
          memberId,
          {
            projectId: task.projectId,
            revision: task.revision,
            taskId: task.id,
            state: task.state,
            assigneeId: task.assigneeId,
          },
          run,
        );
        return {
          ...identity(workspace, memberId, userWorkspaceId),
          observedAt: new Date().toISOString(),
          run: summary,
          requestId: run.requestId,
          configuration: configurationDto(run.configuration),
          context: run.context,
          result: run.result,
          activity: run.activity,
          usage: run.usage,
          error: run.error,
          decision: run.decision,
          ...eligibility,
        };
      },
      transactionManager,
    );
  }
  private async receipt(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    runId: string,
  ): Promise<DeliveryAssistantRunReceiptDTO> {
    const scope = await this.scope(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
    );
    const summary = await this.runSummary(
      manager,
      workspace,
      scope,
      memberId,
      userWorkspaceId,
      runId,
    );
    return {
      ...identity(workspace, memberId, userWorkspaceId),
      runId: summary.id,
      taskId: summary.taskId,
      agentId: summary.agentId,
      status: summary.status,
      updatedAt: summary.updatedAt,
    };
  }
  async request(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
    const parsed = parseDeliveryAssistantInput(
      deliveryAssistantRequestSchema,
      input,
    );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        const visibility = await this.nativeTasks.visibility(
          manager,
          workspace,
          { memberId, userWorkspaceId },
          ['id', 'title'],
        );
        const rows = await this.nativeTasks.query<{ id: string }[]>(
          manager,
          `SELECT run.id ${this.runFrom(workspace)} WHERE run."workspaceId"=$1 AND ${deliveryAgentProjectScopeSql('$2', '$3')} AND run."initiatorId"=$4::uuid AND run."requestId"=$5 AND ${this.nativeTasks.predicate(workspace, visibility, 'run."taskId"')}`,
          [
            workspace.id,
            scope.actor.isManager,
            JSON.stringify([memberId]),
            memberId,
            parsed.requestId,
          ],
          visibility,
        );
        return {
          ...identity(workspace, memberId, userWorkspaceId),
          requestId: parsed.requestId,
          receipt: rows[0]
            ? await this.receipt(
                manager,
                workspace,
                memberId,
                userWorkspaceId,
                rows[0].id,
              )
            : null,
        };
      },
      transactionManager,
    );
  }
  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseDeliveryAssistantInput(
      deliveryAssistantSaveSchema,
      input,
    );
    const result = await this.agents.command(
      workspace,
      memberId,
      userWorkspaceId,
      { type: 'save', ...cleanCommand(parsed) },
    );
    if (
      !('saved' in result) ||
      !('version' in result) ||
      !('replayed' in result)
    )
      throw new BadRequestException(
        'Assistant save did not return a configuration receipt.',
      );
    return {
      ...identity(workspace, memberId, userWorkspaceId),
      saved: result.saved,
      version: result.version,
      replayed: result.replayed,
    };
  }
  async preview(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const normalized = this.commandObject(input);
    const result = await this.agents.command(
      workspace,
      memberId,
      userWorkspaceId,
      { type: 'preview', ...normalized },
    );
    if (!('context' in result))
      throw new BadRequestException('Assistant preview is unavailable.');
    return {
      ...identity(workspace, memberId, userWorkspaceId),
      taskId: String(normalized.taskId),
      agentId: String(normalized.agentId),
      ...result,
    };
  }
  async start(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    return this.runCommand(
      workspace,
      memberId,
      userWorkspaceId,
      'start',
      input,
    );
  }
  async cancel(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    return this.runCommand(
      workspace,
      memberId,
      userWorkspaceId,
      'cancel',
      input,
    );
  }
  async decide(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    return this.runCommand(
      workspace,
      memberId,
      userWorkspaceId,
      'decide',
      input,
    );
  }
  private commandObject(input: unknown) {
    if (typeof input !== 'object' || input === null || Array.isArray(input))
      throw new BadRequestException('Check the assistant command.');
    const normalized = cleanCommand(input as Record<string, unknown>);
    if ('type' in normalized)
      throw new BadRequestException('Check the assistant command.');
    return normalized;
  }
  private async runCommand(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    type: 'start' | 'cancel' | 'decide',
    input: unknown,
  ) {
    const normalized = this.commandObject(input);
    if (type === 'decide' && !('field' in normalized)) normalized.field = null;
    const result = await this.agents.command(
      workspace,
      memberId,
      userWorkspaceId,
      { type, ...normalized },
    );
    if (!('runId' in result) || typeof result.runId !== 'string')
      throw new BadRequestException(
        'Assistant run did not return its identity.',
      );
    return readDeliverySnapshot(this.dataSource, workspace.id, (manager) =>
      this.receipt(manager, workspace, memberId, userWorkspaceId, result.runId),
    );
  }
}
