import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryOperationsService } from 'src/modules/delivery/operations/delivery-operations.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryMemberEntity } from 'src/modules/delivery/entities/delivery-member.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { canAccessDeliveryProject } from 'src/modules/delivery/delivery-policy';
import { canReadFinance } from 'src/modules/delivery/business/delivery-business.policy';
import {
  DELIVERY_STATES,
  type DeliveryDetails,
  type DeliverySubmission,
} from 'src/modules/delivery/delivery.types';
import { type Fulfilment } from 'src/modules/delivery/operations/delivery-operations.types';
import { getDeliveryLifecycle } from 'src/modules/delivery/lifecycle/delivery-lifecycle';
import {
  deliveryReviewAuthority,
  readCurrentDeliveryReviewAssignments,
} from 'src/modules/delivery/reviews/delivery-review-authority';
import {
  type DeliveryTaskCommandInput,
  type DeliveryTaskCommandResultDTO,
  type DeliveryTaskDetailDTO,
  type DeliveryTaskDetailInput,
  type DeliveryTaskListDTO,
  type DeliveryTaskListInput,
  type DeliveryTaskLifecycleDTO,
  type DeliveryWorkspaceContextDTO,
  type DeliveryTaskAssignmentSeenInput,
  type DeliveryTaskAssignmentSeenDTO,
} from 'src/modules/delivery/tasks/delivery-tasks.dto';
import {
  DELIVERY_TASK_DIRECTORY_LIMIT,
  DELIVERY_TASK_PAGE_SIZE,
  DELIVERY_TASK_WORK_GROUPS,
  deliveryTaskBusinessDate,
  deliveryTaskCommand,
  deliveryTaskCursor,
  deliveryTaskDetailSchema,
  deliveryTaskListSchema,
  deliveryTaskScopeHash,
  parseDeliveryTaskInput,
  readDeliveryTaskCursor,
  type DeliveryTaskSort,
} from 'src/modules/delivery/tasks/delivery-tasks.policy';

type TaskActor = Awaited<ReturnType<DeliveryService['actor']>>;
type TaskPeople = {
  members: Awaited<ReturnType<OtogrowAccessService['listActiveMembers']>>;
  access: Awaited<ReturnType<OtogrowAccessService['listAccess']>>;
};
type TaskRow = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  revision: number;
  assigneeId: string | null;
  dueAt: Date | string | null;
  service: string;
  state: string;
  priority: string;
  scheduledDate: string | null;
  primaryReviewerId: string | null;
  workGroup: string;
  groupRank: number;
  priorityRank: number;
  dueSort: string;
  scheduleSort: string;
  latest: Pick<
    DeliverySubmission,
    'version' | 'decision' | 'reviewedAt'
  > | null;
  checklistDone: number;
  checklistTotal: number;
  checklistValid: boolean;
  hasCreative: boolean;
  blockerPreview: string;
  blockerTruncated: boolean;
};
type TaskCounts = {
  totalCount: number;
  byState: { key: string; count: number }[];
  byWorkGroup: { key: string; count: number }[];
  overview: DeliveryTaskListDTO['overview'];
  serviceOptions: string[];
};
const isoDate = (value: Date | string | null) =>
  value ? new Date(value).toISOString() : null;
const ensureDirectoryBound = (length: number) => {
  if (length > DELIVERY_TASK_DIRECTORY_LIMIT)
    throw new BadRequestException(
      'The workspace directory exceeds this task view. Narrow the workspace configuration before using this view.',
    );
};

@Injectable()
export class DeliveryTasksService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
    private readonly operations: DeliveryOperationsService,
  ) {}

  private async projects(
    manager: EntityManager,
    workspaceId: string,
    actor: TaskActor,
  ) {
    const projects = await manager
      .getRepository(DeliveryProjectEntity)
      .createQueryBuilder('project')
      .where('project."workspaceId"=:workspaceId', { workspaceId })
      .andWhere('( :isManager OR project."memberIds" @> :memberIds::jsonb )', {
        isManager: actor.isManager,
        memberIds: JSON.stringify([actor.memberId]),
      })
      .orderBy('project.id', 'ASC')
      .take(DELIVERY_TASK_DIRECTORY_LIMIT + 1)
      .getMany();
    ensureDirectoryBound(projects.length);
    return projects;
  }
  private async people(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<TaskPeople> {
    const members = await this.access.listActiveMembers(workspaceId, manager);
    ensureDirectoryBound(members.length);
    return {
      members,
      access: await this.access.listAccess(workspaceId, manager),
    };
  }
  private identity(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
  ) {
    return { workspaceId, memberId, userWorkspaceId };
  }

  async context(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    transactionManager?: EntityManager,
  ): Promise<DeliveryWorkspaceContextDTO> {
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
        const projects = await this.projects(manager, workspace.id, actor);
        const people = await this.people(manager, workspace.id);
        const profiles = await manager
          .getRepository(DeliveryMemberEntity)
          .findBy({ workspaceId: workspace.id });
        const visibleIds = new Set([
          memberId,
          ...projects.flatMap((project) => project.memberIds),
        ]);
        if (!actor.isManager && projects.length) {
          const owners: { id: string }[] = await manager.query(
            `SELECT DISTINCT owners.id FROM core."deliveryTask" d JOIN ${this.delivery.schema(workspace)}."task" t ON t.id=d."taskId" CROSS JOIN LATERAL (VALUES (t."assigneeId"::text),(d.details->>'reviewerId')) owners(id) WHERE d."workspaceId"=$1 AND d."projectId"=ANY($2::uuid[]) AND t."deletedAt" IS NULL AND owners.id=ANY($3::text[])`,
            [
              workspace.id,
              projects.map((project) => project.id),
              people.members.map((person) => person.memberId),
            ],
          );
          for (const owner of owners) visibleIds.add(owner.id);
        }
        const companies: { id: string; name: string }[] = await manager.query(
          `SELECT id,name FROM ${this.delivery.schema(workspace)}."company" WHERE "deletedAt" IS NULL AND ($1::boolean OR id=ANY($2::uuid[])) ORDER BY name COLLATE "C",id LIMIT $3`,
          [
            actor.isManager,
            projects.map((project) => project.companyId).filter(isDefined),
            DELIVERY_TASK_DIRECTORY_LIMIT + 1,
          ],
        );
        ensureDirectoryBound(companies.length);
        const currentAccess = new Map(
          people.access.map((access) => [access.memberId, access]),
        );
        return {
          ...this.identity(workspace.id, memberId, userWorkspaceId),
          observedAt: new Date().toISOString(),
          actor,
          projects: projects.map(
            ({ id, name, companyId, memberIds, revision }) => ({
              id,
              name,
              companyId,
              memberIds,
              revision,
            }),
          ),
          companies,
          members: people.members
            .filter(
              (person) =>
                currentAccess.has(person.memberId) &&
                (actor.isManager || visibleIds.has(person.memberId)),
            )
            .map((person) => ({
              id: person.memberId,
              name: person.name,
              roleLabel:
                profiles.find(
                  (profile) => profile.workspaceMemberId === person.memberId,
                )?.roleLabel ?? '',
              access: currentAccess
                .get(person.memberId)
                ?.capabilities.includes('workspace.admin')
                ? 'ADMIN'
                : currentAccess
                      .get(person.memberId)
                      ?.capabilities.includes('delivery.manage')
                  ? 'MANAGER'
                  : 'MEMBER',
            })),
        };
      },
      transactionManager,
    );
  }

  private async lifecycles(
    manager: EntityManager,
    workspaceId: string,
    rows: { id: string; state: string; latest: TaskRow['latest'] }[],
  ): Promise<Map<string, DeliveryTaskLifecycleDTO>> {
    const deliveries: { delivery: Fulfilment; timezone: string | null }[] =
      rows.length
        ? await manager.query(
            `SELECT jsonb_build_object('taskId',item->>'taskId','status',item->>'status','cycle',item->'cycle','deliveredAt',item->>'deliveredAt','nextCheckAt',item->>'nextCheckAt','deliveredSubmissionVersion',item->'deliveredSubmissionVersion','history',CASE WHEN jsonb_typeof(item->'history')='array' AND jsonb_array_length(item->'history')>0 THEN jsonb_build_array(jsonb_build_object('action',item->'history'->-1->>'action','at',item->'history'->-1->>'at')) ELSE '[]'::jsonb END) AS delivery,state->>'timezone' AS timezone FROM core."deliveryOperations",jsonb_array_elements(CASE WHEN jsonb_typeof(state->'fulfilments')='array' THEN state->'fulfilments' ELSE '[]'::jsonb END) item WHERE "workspaceId"=$1 AND item->>'taskId'=ANY($2::text[])`,
            [workspaceId, rows.map((row) => row.id)],
          )
        : [];
    return new Map(
      rows.map((row) => {
        const delivery = deliveries.find(
          (candidate) => candidate.delivery.taskId === row.id,
        );
        const latest =
          Number.isSafeInteger(row.latest?.version) &&
          Number(row.latest?.version) > 0
            ? row.latest
            : null;
        const state = DELIVERY_STATES.find((state) => state === row.state);
        const submissions: DeliveryDetails['submissions'] = latest
          ? [
              {
                ...latest,
                description: '',
                evidence: [],
                submittedAt: '',
                submittedBy: '',
              },
            ]
          : [];
        const lifecycle = state
          ? getDeliveryLifecycle({ state, submissions }, delivery?.delivery)
          : {
              status: 'UNAVAILABLE',
              cycle: delivery?.delivery.cycle ?? 0,
              deliveredAt: delivery?.delivery.deliveredAt ?? null,
              nextCheckAt: null,
              deliveredSubmissionVersion:
                delivery?.delivery.deliveredSubmissionVersion ?? null,
            };
        return [
          row.id,
          {
            ...lifecycle,
            timezone: delivery?.timezone ?? 'UTC',
          },
        ];
      }),
    );
  }

  async list(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryTaskListInput,
    transactionManager?: EntityManager,
    now = new Date(),
  ): Promise<DeliveryTaskListDTO> {
    const query = parseDeliveryTaskInput(deliveryTaskListSchema, input);
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
        if (query.view === 'PLANNER' && !actor.isManager)
          throw new ForbiddenException(
            'A delivery manager is required to open the team planner.',
          );
        const projects = await this.projects(manager, workspace.id, actor);
        const people = await this.people(manager, workspace.id);
        const businessDate = deliveryTaskBusinessDate(now, query.timezone);
        const scope = deliveryTaskScopeHash({
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          capabilities: [...actor.capabilities].sort(),
          projects: projects.map((project) => [project.id, project.revision]),
          query: {
            view: query.view,
            timezone: query.timezone,
            projectId: query.projectId ?? null,
            assigneeId:
              query.view === 'MINE' ? null : (query.assigneeId ?? null),
            service: query.service ?? null,
            state: query.state ?? null,
            search: query.search ?? '',
            scheduledFrom: query.scheduledFrom ?? null,
            scheduledThrough:
              query.scheduledThrough ?? query.scheduledFrom ?? null,
            attention: query.attention ?? null,
          },
          businessDate,
        });
        const cursor = readDeliveryTaskCursor(query.after, scope);
        const reference = cursor ? new Date(cursor.observedAt) : now;
        if (
          reference > now ||
          deliveryTaskBusinessDate(reference, query.timezone) !== businessDate
        )
          throw new BadRequestException(
            'The task calendar changed. Open the first page.',
          );
        const parameters: unknown[] = [
          workspace.id,
          projects.map((project) => project.id),
          reference.toISOString(),
          query.timezone,
          businessDate,
          actor.isManager && query.view !== 'MINE',
          memberId,
          query.projectId ?? null,
          query.view === 'MINE' ? null : (query.assigneeId ?? null),
          query.service ?? null,
          query.state ?? null,
          query.search ?? '',
          query.scheduledFrom ?? null,
          query.scheduledThrough ?? query.scheduledFrom ?? null,
          query.attention ?? null,
        ];
        const source = `WITH source AS (
        SELECT t.id,t.title,t."assigneeId",t."dueAt",d."projectId",p.name AS "projectName",d.revision,
          COALESCE(d.details->>'service','') AS service,CASE WHEN d.details->>'state'=ANY(ARRAY['PLANNED','IN_PROGRESS','BLOCKED','IN_REVIEW','CHANGES_REQUESTED','APPROVED']) THEN d.details->>'state' ELSE 'UNKNOWN' END AS state,
          COALESCE(d.details->>'priority','UNKNOWN') AS priority,d.details->>'scheduledDate' AS "scheduledDate",d.details->>'reviewerId' AS "primaryReviewerId",
          CASE WHEN d.details->>'state'='APPROVED' THEN 'approved' WHEN d.details->>'state'='IN_REVIEW' THEN 'review' WHEN d.details->>'state'='CHANGES_REQUESTED' THEN 'revisions' WHEN d.details->>'state'='BLOCKED' THEN 'blocked'
            WHEN t."dueAt"<$3::timestamptz THEN 'overdue' WHEN d.details->>'state'='IN_PROGRESS' OR d.details->>'scheduledDate'<=$5 OR to_char(t."dueAt" AT TIME ZONE $4,'YYYY-MM-DD')=$5 THEN 'today'
            WHEN d.details->>'scheduledDate' IS NOT NULL OR t."dueAt" IS NOT NULL THEN 'upcoming' ELSE 'unscheduled' END AS "workGroup",
          CASE d.details->>'priority' WHEN 'HIGH' THEN 0 WHEN 'NORMAL' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END AS "priorityRank",
          COALESCE(to_char(t."dueAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),'9999') AS "dueSort",COALESCE(d.details->>'scheduledDate','9999') AS "scheduleSort"
        FROM core."deliveryTask" d JOIN ${this.delivery.schema(workspace)}."task" t ON t.id=d."taskId"
        JOIN core."deliveryProject" p ON p.id=d."projectId" AND p."workspaceId"=d."workspaceId"
        WHERE d."workspaceId"=$1 AND d."projectId"=ANY($2::uuid[]) AND t."deletedAt" IS NULL AND ($6::boolean OR t."assigneeId"=$7::uuid)
      ), grouped AS (SELECT *,CASE "workGroup" WHEN 'revisions' THEN 0 WHEN 'blocked' THEN 1 WHEN 'overdue' THEN 2 WHEN 'today' THEN 3 WHEN 'upcoming' THEN 4 WHEN 'unscheduled' THEN 5 WHEN 'review' THEN 6 ELSE 7 END AS "groupRank" FROM source),
      filtered AS (SELECT * FROM grouped WHERE ($8::uuid IS NULL OR "projectId"=$8::uuid) AND ($9::uuid IS NULL OR "assigneeId"=$9::uuid)
        AND ($10::text IS NULL OR service=$10) AND ($11::text IS NULL OR state=$11) AND strpos(lower(title),lower($12))>0
        AND ($13::text IS NULL OR "scheduledDate" BETWEEN $13 AND $14)
        AND ($15::text IS NULL OR state<>'APPROVED' AND CASE $15 WHEN 'OVERDUE' THEN "dueAt"<$3::timestamptz ELSE "scheduledDate"=$5 OR to_char("dueAt" AT TIME ZONE $4,'YYYY-MM-DD')=$5 END))`;
        const counts: TaskCounts[] = await manager.query(
          `${source} SELECT (SELECT count(*)::int FROM filtered) AS "totalCount",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('key',state,'count',amount) ORDER BY state) FROM (SELECT state,count(*)::int amount FROM filtered GROUP BY state) counts),'[]') AS "byState",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('key',"workGroup",'count',amount) ORDER BY "workGroup") FROM (SELECT "workGroup",count(*)::int amount FROM filtered GROUP BY "workGroup") counts),'[]') AS "byWorkGroup",
        (SELECT jsonb_build_object('totalCount',count(*),'blockedCount',count(*) FILTER(WHERE state='BLOCKED'),'approvedCount',count(*) FILTER(WHERE state='APPROVED'),'reviewCount',count(*) FILTER(WHERE state='IN_REVIEW'),'overdueCount',count(*) FILTER(WHERE state<>'APPROVED' AND "dueAt"<$3::timestamptz),'dueTodayCount',count(*) FILTER(WHERE state<>'APPROVED' AND ("scheduledDate"=$5 OR to_char("dueAt" AT TIME ZONE $4,'YYYY-MM-DD')=$5))) FROM source) AS overview,
        ARRAY(SELECT DISTINCT service FROM source WHERE service<>'' ORDER BY service LIMIT ${DELIVERY_TASK_DIRECTORY_LIMIT + 1}) AS "serviceOptions"`,
          parameters,
        );
        const count = counts[0];
        ensureDirectoryBound(count.serviceOptions.length);
        const limit = query.limit ?? DELIVERY_TASK_PAGE_SIZE;
        const pageParameters = [
          ...parameters,
          ...(cursor?.sort ?? [null, null, null, null, null, null]),
          limit + 1,
        ];
        const rows: TaskRow[] = await manager.query(
          `${source}, page AS MATERIALIZED (
        SELECT * FROM filtered WHERE $16::integer IS NULL OR ("groupRank","priorityRank","dueSort","scheduleSort",title COLLATE "C",id) > ($16::integer,$17::integer,$18::text,$19::text,$20::text COLLATE "C",$21::uuid)
        ORDER BY "groupRank","priorityRank","dueSort","scheduleSort",title COLLATE "C",id LIMIT $22)
        SELECT page.*,jsonb_build_object('version',d.details->'submissions'->-1->'version','decision',d.details->'submissions'->-1->'decision','reviewedAt',d.details->'submissions'->-1->'reviewedAt') AS latest,
          (SELECT count(*)::int FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.details->'checklist')='array' THEN d.details->'checklist' ELSE '[]' END)) AS "checklistTotal",
          (SELECT count(*)::int FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.details->'checklist')='array' THEN d.details->'checklist' ELSE '[]' END) item WHERE item->'done'='true'::jsonb) AS "checklistDone",
          jsonb_typeof(d.details->'checklist')='array' AS "checklistValid",jsonb_typeof(d.details->'creative')='object' AS "hasCreative",
          left(COALESCE(d.details->>'blocker',''),180) AS "blockerPreview",length(COALESCE(d.details->>'blocker',''))>180 AS "blockerTruncated"
        FROM page JOIN core."deliveryTask" d ON d."workspaceId"=$1 AND d."taskId"=page.id ORDER BY "groupRank","priorityRank","dueSort","scheduleSort",title COLLATE "C",id`,
          pageParameters,
        );
        const page = rows.slice(0, limit);
        const assignments = await readCurrentDeliveryReviewAssignments(
          manager,
          workspace.id,
          page.flatMap((row) =>
            Number.isSafeInteger(row.latest?.version) &&
            Number(row.latest?.version) > 0
              ? [{ taskId: row.id, submissionVersion: row.latest!.version }]
              : [],
          ),
        );
        const lifecycles = await this.lifecycles(manager, workspace.id, page);
        const last = page[page.length - 1];
        const sort: DeliveryTaskSort | null = last
          ? [
              last.groupRank,
              last.priorityRank,
              last.dueSort,
              last.scheduleSort,
              last.title,
              last.id,
            ]
          : null;
        const byState: DeliveryTaskListDTO['byState'] = DELIVERY_STATES.map(
          (key) => ({
            key,
            count: count.byState.find((entry) => entry.key === key)?.count ?? 0,
          }),
        );
        return {
          ...this.identity(workspace.id, memberId, userWorkspaceId),
          observedAt: now.toISOString(),
          pageReferenceAt: reference.toISOString(),
          timezone: query.timezone,
          businessDate,
          totalCount: count.totalCount,
          byState: byState.concat(
            count.byState.filter(
              (entry) =>
                !DELIVERY_STATES.includes(
                  entry.key as DeliveryDetails['state'],
                ),
            ),
          ),
          byWorkGroup: DELIVERY_TASK_WORK_GROUPS.map((key) => ({
            key,
            count:
              count.byWorkGroup.find((entry) => entry.key === key)?.count ?? 0,
          })),
          overview: count.overview,
          serviceOptions: count.serviceOptions,
          items: page.map((row) => ({
            id: row.id,
            title: row.title,
            projectId: row.projectId,
            projectName: row.projectName,
            revision: row.revision,
            assigneeId: row.assigneeId,
            assigneeName:
              people.members.find(
                (person) => person.memberId === row.assigneeId,
              )?.name ?? null,
            dueAt: isoDate(row.dueAt),
            service: row.service,
            state: row.state,
            priority: row.priority,
            scheduledDate: row.scheduledDate,
            workGroup: row.workGroup,
            blockerPreview: row.blockerPreview,
            blockerTruncated: row.blockerTruncated,
            checklistDone: row.checklistValid ? row.checklistDone : null,
            checklistTotal: row.checklistValid ? row.checklistTotal : null,
            hasCreative: row.hasCreative === true,
            review: {
              submissionVersion:
                Number.isSafeInteger(row.latest?.version) &&
                Number(row.latest?.version) > 0
                  ? row.latest!.version
                  : null,
              ...deliveryReviewAuthority({
                primaryReviewerId: row.primaryReviewerId,
                assigneeId: row.assigneeId,
                assignment: assignments.get(row.id),
                projectMemberIds:
                  projects.find((project) => project.id === row.projectId)
                    ?.memberIds ?? [],
                access: people.access,
                actorId: memberId,
              }),
            },
            delivery: lifecycles.get(row.id)!,
            warnings: [
              ...(row.checklistValid ? [] : ['CHECKLIST_UNAVAILABLE']),
              ...(row.state === 'UNKNOWN' ? ['TASK_STATE_UNAVAILABLE'] : []),
            ],
          })),
          nextCursor:
            rows.length > limit && sort
              ? deliveryTaskCursor(scope, reference.toISOString(), sort)
              : null,
        };
      },
      transactionManager,
    );
  }

  async detail(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryTaskDetailInput,
    transactionManager?: EntityManager,
  ): Promise<DeliveryTaskDetailDTO> {
    const query = parseDeliveryTaskInput(deliveryTaskDetailSchema, input);
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
        const record = await manager
          .getRepository(DeliveryTaskEntity)
          .findOneBy({ workspaceId: workspace.id, taskId: query.taskId });
        if (!record) throw new NotFoundException();
        const project = await manager
          .getRepository(DeliveryProjectEntity)
          .findOneBy({ workspaceId: workspace.id, id: record.projectId });
        if (
          !project ||
          !canAccessDeliveryProject(
            actor.isManager,
            memberId,
            project.memberIds,
          )
        )
          throw new NotFoundException();
        const tasks: {
          id: string;
          title: string;
          assigneeId: string | null;
          dueAt: Date | string | null;
        }[] = await manager.query(
          `SELECT id,title,"assigneeId","dueAt" FROM ${this.delivery.schema(workspace)}."task" WHERE id=$1 AND "deletedAt" IS NULL`,
          [query.taskId],
        );
        const task = tasks[0];
        if (!task) throw new NotFoundException();
        const latest =
          record.details.submissions[record.details.submissions.length - 1] ??
          null;
        const assignments = await readCurrentDeliveryReviewAssignments(
          manager,
          workspace.id,
          latest
            ? [{ taskId: task.id, submissionVersion: latest.version }]
            : [],
        );
        const lifecycles = await this.lifecycles(manager, workspace.id, [
          { id: task.id, state: record.details.state, latest },
        ]);
        const access = await this.access.listAccess(workspace.id, manager);
        return {
          ...this.identity(workspace.id, memberId, userWorkspaceId),
          observedAt: new Date().toISOString(),
          task: {
            ...task,
            dueAt: isoDate(task.dueAt),
            projectId: project.id,
            revision: record.revision,
            details:
              record.details.creative && !canReadFinance(actor)
                ? {
                    ...record.details,
                    creative: { ...record.details.creative, revisionCharge: 0 },
                  }
                : record.details,
            review: {
              submissionVersion: latest?.version ?? null,
              ...deliveryReviewAuthority({
                primaryReviewerId: record.details.reviewerId,
                assigneeId: task.assigneeId,
                assignment: assignments.get(task.id),
                projectMemberIds: project.memberIds,
                access,
                actorId: memberId,
              }),
            },
            delivery: lifecycles.get(task.id)!,
          },
        };
      },
      transactionManager,
    );
  }

  async seeAssignment(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryTaskAssignmentSeenInput,
  ): Promise<DeliveryTaskAssignmentSeenDTO> {
    const seen = await this.operations.seeAssignment(
      workspace,
      memberId,
      userWorkspaceId,
      input.taskId,
      input.expectedAssignmentKey,
    );
    return {
      ...this.identity(workspace.id, memberId, userWorkspaceId),
      taskId: input.taskId,
      seen,
    };
  }

  async command(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryTaskCommandInput,
  ): Promise<DeliveryTaskCommandResultDTO> {
    const command = deliveryTaskCommand(input);
    return this.dataSource.transaction(async (manager) => {
      const result = await this.delivery.command(
        workspace,
        memberId,
        userWorkspaceId,
        command,
        manager,
      );
      const taskId = command.action === 'create' ? result : command.taskId;
      if (typeof taskId !== 'string' || !isValidUuid(taskId))
        throw new Error('The task command did not return its source identity.');
      const rows: { revision: number; state: string }[] = await manager.query(
        `SELECT revision,details->>'state' AS state FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2`,
        [workspace.id, taskId],
      );
      if (!rows[0]) throw new Error('The task command result is unavailable.');
      return {
        ...this.identity(workspace.id, memberId, userWorkspaceId),
        taskId,
        revision: rows[0].revision,
        state: rows[0].state,
      };
    });
  }
}
