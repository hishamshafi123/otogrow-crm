import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryTasksService } from 'src/modules/delivery/tasks/delivery-tasks.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import {
  type DeliveryCapacitySummaryInput,
  type DeliveryCapacitySummaryDTO,
  type DeliveryCapacityMemberSummaryDTO,
  type DeliveryCapacityWarningDTO,
  type DeliveryCapacityAssignmentsInput,
  type DeliveryCapacityAssignmentsDTO,
  type DeliveryCapacityAssignmentDTO,
} from 'src/modules/delivery/capacity/read/delivery-capacity-read.dto';
import {
  DELIVERY_CAPACITY_READ_PAGE_SIZE,
  deliveryCapacitySummarySchema,
  deliveryCapacityAssignmentsSchema,
  deliveryCapacityReadDates,
  parseCapacityReadInput,
  capacityReadScope,
  capacityReadCursor,
  readCapacityReadCursor,
  capacityReadSource,
} from 'src/modules/delivery/capacity/read/delivery-capacity-read.policy';

type CapacityPerson = {
  memberId: string;
  name: string;
  canManage: boolean;
  canReview: boolean;
};
type AssignmentRow = DeliveryCapacityAssignmentDTO & { dateSort: string };

@Injectable()
export class DeliveryCapacityReadService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly tasks: DeliveryTasksService,
    private readonly access: OtogrowAccessService,
  ) {}

  private async context(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    const context = await this.tasks.context(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (!context.actor.isManager)
      throw new ForbiddenException(
        'A delivery manager is required to plan team capacity.',
      );
    const access = await this.access.listAccess(workspace.id, manager);
    const people: CapacityPerson[] = context.members.map((person) => {
      const capabilities =
        access.find((candidate) => candidate.memberId === person.id)
          ?.capabilities ?? [];
      return {
        memberId: person.id,
        name: person.name,
        canManage: capabilities.some((capability) =>
          ['workspace.admin', 'delivery.manage'].includes(capability),
        ),
        canReview: capabilities.includes('delivery.review'),
      };
    });
    return {
      context,
      people,
      scope: {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        capabilities: [...context.actor.capabilities].sort(),
        roleIds: [...context.actor.roleIds].sort(),
        projects: context.projects
          .map((project) => ({
            id: project.id,
            revision: project.revision,
            memberIds: [...project.memberIds].sort(),
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
        people: [...people].sort((left, right) =>
          left.memberId.localeCompare(right.memberId),
        ),
      },
    };
  }

  async summary(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryCapacitySummaryInput,
    transactionManager?: EntityManager,
    now = new Date(),
  ): Promise<DeliveryCapacitySummaryDTO> {
    const query = parseCapacityReadInput(deliveryCapacitySummarySchema, input);
    const dates = deliveryCapacityReadDates(query.startDate),
      endDate = dates[6];
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const {
          context,
          people,
          scope: contextScope,
        } = await this.context(manager, workspace, memberId, userWorkspaceId);
        const scope = capacityReadScope({
          ...contextScope,
          startDate: query.startDate,
          timezone: query.timezone,
          kind: 'SUMMARY',
        });
        const after = readCapacityReadCursor(query.after, scope, 'SUMMARY');
        const limit = query.limit ?? DELIVERY_CAPACITY_READ_PAGE_SIZE;
        const parameters = [
          workspace.id,
          context.projects.map((project) => project.id),
          JSON.stringify(people),
          query.startDate,
          endDate,
        ];
        const source = capacityReadSource(this.delivery.schema(workspace));
        // Slot writes intentionally remain concurrent; warnings and exact slots need one MVCC read.
        const [{ warnings, rows }]: {
          warnings: DeliveryCapacityWarningDTO[];
          rows: DeliveryCapacityMemberSummaryDTO[];
        }[] = await manager.query(
          `${source}, warning_rows AS (
        SELECT 'UNAVAILABLE_PRODUCTION_OWNER' AS code,'OPEN_PLANNING'::text AS scope,count(*)::int AS count FROM loads WHERE kind='PRODUCTION' AND NOT "ownerAvailable"
        UNION ALL SELECT 'UNAVAILABLE_REVIEW_OWNER','OPEN_PLANNING',count(*)::int FROM loads WHERE kind='REVIEW' AND NOT "ownerAvailable"
        UNION ALL SELECT 'UNAVAILABLE_REVIEWER','OPEN_PLANNING',count(*)::int FROM loads WHERE kind='REVIEW' AND "ownerAvailable" AND "reviewerState"<>'ACTIVE'
        UNION ALL SELECT warning,'OPEN_PLANNING',count(DISTINCT "taskId")::int FROM assigned CROSS JOIN LATERAL unnest(warnings) warning GROUP BY warning
        UNION ALL SELECT 'INVALID_AVAILABILITY','SELECTED_WEEK',count(*)::int FROM core."deliveryAvailability" availability JOIN people ON people."memberId"=availability."memberId" WHERE availability."workspaceId"=$1 AND availability.date BETWEEN $4::date AND $5::date AND availability.minutes NOT BETWEEN 0 AND 1440
      ), warning_summary AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'scope',scope,'count',count) ORDER BY code) FILTER(WHERE count>0),'[]'::jsonb) AS warnings FROM warning_rows
      ), daily AS (
        SELECT "ownerId",date,count(*)::int AS "assignmentCount",sum(COALESCE("workMinutes",0)+COALESCE("revisionMinutes",0)) AS "workMinutes",
          sum(CASE WHEN kind='PRODUCTION' THEN COALESCE("workMinutes",0) ELSE 0 END) AS "productionMinutes",sum(COALESCE("revisionMinutes",0)) AS "revisionMinutes",
          sum(CASE WHEN kind='REVIEW' THEN COALESCE("workMinutes",0) ELSE 0 END) AS "reviewMinutes",sum(COALESCE("waitMinutes",0)) AS "waitMinutes",
          count(*) FILTER(WHERE "unknownEffort")::int AS "unknownCount",bool_or("unknownWait") AS "unknownWait",count(*) FILTER(WHERE kind='REVIEW' AND "reviewerState"<>'ACTIVE')::int AS "unavailableReviewCount"
        FROM loads WHERE "ownerAvailable" AND date BETWEEN $4 AND $5 GROUP BY "ownerId",date
      ), member_page AS MATERIALIZED (
        SELECT * FROM people WHERE $6::text IS NULL OR (name COLLATE "C","memberId")>($6::text COLLATE "C",$7::uuid) ORDER BY name COLLATE "C","memberId" LIMIT $8
      ), slots AS (
        SELECT person."memberId",person.name,to_char($4::date+day,'YYYY-MM-DD') AS date,CASE WHEN a.minutes BETWEEN 0 AND 1440 THEN a.minutes END AS "availableMinutes",COALESCE(a.revision,0) AS "availabilityRevision",COALESCE(a.minutes NOT BETWEEN 0 AND 1440,false) AS "availabilityInvalid",
          COALESCE(daily."assignmentCount",0) AS "assignmentCount",COALESCE(daily."workMinutes",0) AS "workMinutes",COALESCE(daily."productionMinutes",0) AS "productionMinutes",COALESCE(daily."revisionMinutes",0) AS "revisionMinutes",COALESCE(daily."reviewMinutes",0) AS "reviewMinutes",COALESCE(daily."waitMinutes",0) AS "waitMinutes",COALESCE(daily."unknownCount",0) AS "unknownCount",COALESCE(daily."unknownWait",false) AS "unknownWait",COALESCE(daily."unavailableReviewCount",0) AS "unavailableReviewCount",
          CASE WHEN a.minutes BETWEEN 0 AND 1440 THEN greatest(0,COALESCE(daily."workMinutes",0)-a.minutes) ELSE 0 END AS "overloadMinutes"
        FROM member_page person CROSS JOIN generate_series(0,6) day LEFT JOIN daily ON daily."ownerId"=person."memberId"::text AND daily.date=to_char($4::date+day,'YYYY-MM-DD')
        LEFT JOIN core."deliveryAvailability" a ON a."workspaceId"=$1 AND a."memberId"=person."memberId" AND a.date=$4::date+day
      ), member_rows AS (
        SELECT "memberId",name,count(*) FILTER(WHERE "overloadMinutes">0)::int AS "overloadDays",count(*) FILTER(WHERE "unknownCount">0 OR "availableMinutes" IS NULL)::int AS "incompleteDays",
        (SELECT count(*)::int FROM loads WHERE "ownerId"=slots."memberId"::text AND (date IS NULL OR date<$4)) AS "needsPlanningCount",
        jsonb_agg(jsonb_build_object('date',date,'availableMinutes',"availableMinutes",'availabilityRevision',"availabilityRevision",'availabilityInvalid',"availabilityInvalid",'assignmentCount',"assignmentCount",'workMinutes',"workMinutes",'productionMinutes',"productionMinutes",'revisionMinutes',"revisionMinutes",'reviewMinutes',"reviewMinutes",'waitMinutes',"waitMinutes",'unknownCount',"unknownCount",'unknownWait',"unknownWait",'overloadMinutes',"overloadMinutes",'unavailableReviewCount',"unavailableReviewCount") ORDER BY date) AS days
        FROM slots GROUP BY "memberId",name
      ) SELECT warning_summary.warnings,COALESCE((SELECT jsonb_agg(to_jsonb(member_rows) ORDER BY name COLLATE "C","memberId") FROM member_rows),'[]'::jsonb) AS rows FROM warning_summary`,
          [...parameters, after?.[0] ?? null, after?.[1] ?? null, limit + 1],
        );
        const members = rows.slice(0, limit),
          last = members[members.length - 1];
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          observedAt: now.toISOString(),
          timezone: query.timezone,
          startDate: query.startDate,
          endDate,
          totalMemberCount: people.length,
          warningScope: 'OPEN_PLANNING',
          warnings,
          members,
          nextCursor:
            rows.length > limit && last
              ? capacityReadCursor(scope, 'SUMMARY', [last.name, last.memberId])
              : null,
        };
      },
      transactionManager,
    );
  }

  async assignments(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryCapacityAssignmentsInput,
    transactionManager?: EntityManager,
    now = new Date(),
  ): Promise<DeliveryCapacityAssignmentsDTO> {
    const query = parseCapacityReadInput(
      deliveryCapacityAssignmentsSchema,
      input,
    );
    const dates = deliveryCapacityReadDates(query.startDate),
      endDate = dates[6];
    if (query.bucket === 'DAY' && !dates.includes(query.date!))
      throw new BadRequestException('Choose a day within this capacity range.');
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const {
          context,
          people,
          scope: contextScope,
        } = await this.context(manager, workspace, memberId, userWorkspaceId);
        if (
          query.memberId &&
          !people.some((person) => person.memberId === query.memberId)
        )
          throw new NotFoundException('This active teammate is not available.');
        const selection = {
          startDate: query.startDate,
          timezone: query.timezone,
          memberId: query.memberId,
          bucket: query.bucket,
          date: query.date,
        };
        const scope = capacityReadScope({
          ...contextScope,
          ...selection,
          kind: 'ASSIGNMENTS',
        });
        const after = readCapacityReadCursor(query.after, scope, 'ASSIGNMENTS');
        const parameters = [
          workspace.id,
          context.projects.map((project) => project.id),
          JSON.stringify(people),
          query.startDate,
          endDate,
          query.memberId,
          query.bucket,
          query.date,
        ];
        const source = `${capacityReadSource(this.delivery.schema(workspace))}, filtered AS (
        SELECT * FROM loads WHERE CASE WHEN $6::uuid IS NULL THEN NOT "ownerAvailable" ELSE "ownerId"=$6::text END
          AND CASE $7::text WHEN 'DAY' THEN date=$8::text WHEN 'NEEDS_PLANNING' THEN date IS NULL OR date<$4 ELSE true END
      )`;
        const [{ count }]: { count: number }[] = await manager.query(
          `${source} SELECT count(*)::int AS count FROM filtered`,
          parameters,
        );
        const limit = query.limit ?? DELIVERY_CAPACITY_READ_PAGE_SIZE;
        const rows: AssignmentRow[] = await manager.query(
          `${source} SELECT "taskId",title,"projectId","projectName",revision,state,kind,date,"ownerId","ownerName","workMinutes","revisionMinutes","waitMinutes","unknownEffort","unknownWait","reviewerState","submissionVersion","reviewAssignmentRevision",warnings,COALESCE(date,'') AS "dateSort"
        FROM filtered WHERE $9::text IS NULL OR (COALESCE(date,''),title COLLATE "C","taskId",kind)>($9::text,$10::text COLLATE "C",$11::uuid,$12::text)
        ORDER BY COALESCE(date,''),title COLLATE "C","taskId",kind LIMIT $13`,
          [...parameters, ...(after ?? [null, null, null, null]), limit + 1],
        );
        const page = rows.slice(0, limit),
          last = page[page.length - 1];
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          observedAt: now.toISOString(),
          timezone: query.timezone,
          startDate: query.startDate,
          endDate,
          selectedMemberId: query.memberId,
          bucket: query.bucket,
          selectionScope:
            query.bucket === 'UNAVAILABLE_OWNER'
              ? 'OPEN_PLANNING'
              : query.bucket,
          date: query.date,
          totalCount: count,
          items: page.map(({ dateSort: _dateSort, ...row }) => row),
          nextCursor:
            rows.length > limit && last
              ? capacityReadCursor(scope, 'ASSIGNMENTS', [
                  last.dateSort,
                  last.title,
                  last.taskId,
                  last.kind,
                ])
              : null,
        };
      },
      transactionManager,
    );
  }
}
