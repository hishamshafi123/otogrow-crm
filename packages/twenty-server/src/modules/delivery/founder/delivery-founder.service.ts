import {
  deliveryReviewAuthority,
  readCurrentDeliveryReviewAssignments,
} from 'src/modules/delivery/reviews/delivery-review-authority';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { z } from 'zod';
import { isValidUuid } from 'twenty-shared/utils';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import {
  DELIVERY_STATES,
  type DeliveryDetails,
} from 'src/modules/delivery/delivery.types';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { canReadFinance } from 'src/modules/delivery/business/delivery-business.policy';
import { deliveryCurrencySchema } from 'src/modules/delivery/business/delivery-business.types';
import { hasPerformanceMarketingService } from 'src/modules/delivery/advertising/delivery-meta-client-routing';
import { commitmentCredit } from 'src/modules/delivery/commitments/delivery-commitments.policy';
import { type DeliveryCommitmentAllocationEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-allocation.entity';
import { type Fulfilment } from 'src/modules/delivery/operations/delivery-operations.types';
import { projectFinanceForecastCash } from 'src/modules/delivery/finance/read-delivery-forecast-cash';
import {
  forecastItemDTO,
  forecastAmountTotal,
  type FinanceForecastState,
} from 'src/modules/delivery/finance/read-delivery-finance-forecast';
import { calculateFinanceForecast } from 'src/modules/delivery/finance/delivery-finance-forecast.projection';
import { financeForecastBusinessDate } from 'src/modules/delivery/finance/delivery-finance-forecast.policy';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import {
  deliveryFinanceAmountSchema,
  financeAllocationTotal,
} from 'src/modules/delivery/finance/delivery-finance.policy';
import { DeliveryFinanceForecastAnchorEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-anchor.entity';
import { DeliveryFinanceForecastItemEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-item.entity';
import { DeliveryFinancePlanEntity } from 'src/modules/delivery/finance/entities/delivery-finance-plan.entity';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import {
  type DeliveryFounderCoverageDTO,
  type DeliveryFounderExceptionDTO,
  type DeliveryFounderExceptionsSnapshotDTO,
  type DeliveryFounderOptionDTO,
  type FounderDomain,
} from 'src/modules/delivery/founder/delivery-founder.dto';
import {
  FOUNDER_DOMAINS,
  FOUNDER_SOURCE_LIMIT,
  founderAction,
  founderEvidence,
  founderException,
  founderExceptionPage,
  founderExceptionsSchema,
  founderOwner,
  founderTaskExceptions,
  type FounderExceptionsQuery,
  type FounderTask,
} from 'src/modules/delivery/founder/delivery-founder.policy';

type TaskSource = FounderTask & {
  submissions: DeliveryDetails['submissions'];
  allowSelfReview?: boolean;
};
type Engagement = {
  id: string;
  projectId: string;
  companyId: string;
  name: string;
  services: string[];
  advertising: {
    managerId: string;
    marketerId: string;
    channel: string;
  } | null;
};
type CommitmentPeriod = {
  id: string;
  engagementId: string;
  projectId: string;
  clientId: string;
  label: string;
  startDate: string;
  endDateExclusive: string | null;
  timezone: string;
  state: string;
  revision: number;
};
type CommitmentLine = {
  id: string;
  periodId: string;
  label: string;
  unit: string;
  promisedQuantity: number;
  revision: number;
};
type CommitmentAllocation = Pick<
  DeliveryCommitmentAllocationEntity,
  | 'id'
  | 'taskId'
  | 'periodId'
  | 'lineId'
  | 'state'
  | 'creditedCycle'
  | 'creditedSubmissionVersion'
  | 'revision'
>;
type ForecastStoredSource = Parameters<
  typeof projectFinanceForecastCash
>[0]['storedSources'][number];
type ForecastSettlement = Parameters<
  typeof projectFinanceForecastCash
>[0]['settlements'][number];
type ForecastRealization = {
  id: string;
  revision: number;
  itemId: string;
  cashId: string;
  amountMicros: string;
  status: string;
};
type MonthlyEntry = {
  id: string;
  revision: number;
  currency: string;
  kind: string;
  status: string;
  amountMicros: string;
};
type MonthlyAllocation = {
  id: string;
  entryId: string;
  bucket: string;
  projectId: string | null;
  amountMicros: string;
};
type ManualReport = {
  id: string;
  revision: number;
  projectId: string;
  title: string;
  status: string;
  date: string;
  currency: string;
  marketerId: string | null;
  updatedAt: string;
};
type MetaReport = {
  id: string;
  projectId: string | null;
  managerId: string | null;
  marketerId: string | null;
  engagementId: string | null;
  status: string;
  date: string;
  currency: string;
  timezone: string;
  position: string;
  checkedAt: string;
};
type MetaConnection = {
  accountId: string;
  projectId: string | null;
  ownerId: string | null;
  name: string;
  revision: number;
  enabled: boolean;
  hasError: boolean;
};
const identifier = (value: unknown) =>
  typeof value === 'string' && isValidUuid(value) ? value : null;
const safeArray = (path: string) =>
  `CASE WHEN jsonb_typeof(state#>'${path}')='array' THEN state#>'${path}' ELSE '[]'::jsonb END`;
const engagementSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  companyId: z.uuid(),
  name: z.string().max(6000),
  services: z.array(z.string()),
  advertising: z
    .object({ managerId: z.uuid(), marketerId: z.uuid(), channel: z.string() })
    .nullable(),
});

@Injectable()
export class DeliveryFounderService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
  ) {}

  private async bounded<TSource>(
    manager: EntityManager,
    sql: string,
    parameters: unknown[],
    label: string,
  ): Promise<TSource[]> {
    const rows = await manager.query<TSource[]>(
      `${sql} LIMIT $${parameters.length + 1}`,
      [...parameters, FOUNDER_SOURCE_LIMIT + 1],
    );
    if (rows.length > FOUNDER_SOURCE_LIMIT)
      throw new BadRequestException(
        `${label} exceeds the founder review limit. Narrow the domain or project; no sources were truncated.`,
      );
    return rows;
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFounderExceptionsSnapshotDTO> {
    const parsed = founderExceptionsSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        'Choose valid founder filters and a page size between 1 and 50.',
      );
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const collection = await this.collect(
          workspace,
          memberId,
          userWorkspaceId,
          parsed.data,
          manager,
        );
        const { verifiedSourceKeys: _verifiedSourceKeys, ...snapshot } =
          collection;
        return {
          ...snapshot,
          ...founderExceptionPage(workspace.id, collection.items, parsed.data),
        };
      },
    );
  }

  async collect(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    manager: EntityManager,
    now = new Date(),
  ): Promise<
    DeliveryFounderExceptionsSnapshotDTO & { verifiedSourceKeys: string[] }
  > {
    if (manager.queryRunner && !manager.queryRunner.isTransactionActive)
      throw new Error(
        'Founder collection requires an active transaction manager.',
      );
    const parsed = founderExceptionsSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Choose valid founder source filters.');
    const query = parsed.data;
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (!actor.isAdmin)
      throw new ForbiddenException(
        'Company overview requires current workspace administrator access.',
      );
    const projects = await this.bounded<
      DeliveryFounderOptionDTO & { memberIds: string[] }
    >(
      manager,
      'SELECT id,name,"memberIds" FROM core."deliveryProject" WHERE "workspaceId"=$1 ORDER BY id',
      [workspace.id],
      'Project directory',
    );
    const owners = (
      await this.access.listActiveMembers(workspace.id, manager)
    ).map((member) => ({ id: member.memberId, name: member.name }));
    if (owners.length > FOUNDER_SOURCE_LIMIT)
      throw new BadRequestException(
        'The active member directory exceeds the founder review limit.',
      );
    if (
      query.projectId &&
      !projects.some((project) => project.id === query.projectId)
    )
      throw new BadRequestException(
        'The selected founder project is unavailable.',
      );
    if (query.ownerId && !owners.some((owner) => owner.id === query.ownerId))
      throw new BadRequestException(
        'The selected owner is unavailable. Refresh the owner filter.',
      );
    const coverage: DeliveryFounderCoverageDTO[] = FOUNDER_DOMAINS.map(
      (domain) => ({
        domain,
        status:
          query.domain === 'ALL' || query.domain === domain
            ? 'INCLUDED'
            : 'NOT_SELECTED',
        codes: [],
      }),
    );
    const items: DeliveryFounderExceptionDTO[] = [];
    const verifiedSourceKeys = new Set<string>();
    const included = (domain: FounderDomain) =>
      query.domain === 'ALL' || query.domain === domain;
    const partial = (
      domain: FounderDomain,
      code: string,
      incomplete = true,
    ) => {
      const entry = coverage.find((row) => row.domain === domain);
      if (entry && entry.status !== 'RESTRICTED') {
        if (incomplete) entry.status = 'PARTIAL';
        if (!entry.codes.includes(code)) entry.codes.push(code);
      }
    };
    const [containers] = await manager.query<
      {
        records: string | null;
        engagements: string | null;
        fulfilments: string | null;
        connections: string | null;
        alerts: string | null;
      }[]
    >(
      "SELECT jsonb_typeof(state#>'{business,records}') AS records,jsonb_typeof(state#>'{clients,engagements}') AS engagements,jsonb_typeof(state->'fulfilments') AS fulfilments,jsonb_typeof(state#>'{metaReporting,connections}') AS connections,jsonb_typeof(state->'alerts') AS alerts FROM core.\"deliveryOperations\" WHERE \"workspaceId\"=$1",
      [workspace.id],
    );
    if (containers?.records && containers.records !== 'array') {
      if (included('FINANCE')) partial('FINANCE', 'INVALID_FINANCE_SOURCE');
      if (included('CAMPAIGNS'))
        partial('CAMPAIGNS', 'INVALID_CAMPAIGN_SOURCE');
    }
    if (containers?.engagements && containers.engagements !== 'array') {
      if (included('COMMITMENTS'))
        partial('COMMITMENTS', 'UNAVAILABLE_ENGAGEMENT');
      if (included('CAMPAIGNS')) partial('CAMPAIGNS', 'UNAVAILABLE_ENGAGEMENT');
    }
    if (
      included('COMMITMENTS') &&
      containers?.fulfilments &&
      containers.fulfilments !== 'array'
    )
      partial('COMMITMENTS', 'INVALID_FULFILMENT_EVIDENCE');
    if (
      included('CAMPAIGNS') &&
      containers?.connections &&
      containers.connections !== 'array'
    )
      partial('CAMPAIGNS', 'INVALID_CAMPAIGN_SOURCE');
    if (
      included('MANUAL_RISKS') &&
      containers?.alerts &&
      containers.alerts !== 'array'
    )
      partial('MANUAL_RISKS', 'INVALID_MANUAL_RISK_SOURCE');
    let tasks: TaskSource[] = [];
    if (
      included('DELIVERY') ||
      included('COMMITMENTS') ||
      included('MANUAL_RISKS')
    ) {
      tasks = await this.bounded<TaskSource>(
        manager,
        `SELECT task.id,task.title,delivery."projectId",delivery.revision,delivery.details->>'state' AS state,task."assigneeId",delivery.details->>'reviewerId' AS "reviewerId",COALESCE(delivery.details->'allowSelfReview','false'::jsonb) AS "allowSelfReview",to_char(task."dueAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "dueAt",to_char(GREATEST(task."updatedAt",delivery."updatedAt") AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt",to_char(task."updatedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "nativeUpdatedAt",CASE WHEN jsonb_typeof(delivery.details->'submissions')='array' AND jsonb_array_length(delivery.details->'submissions')>0 THEN jsonb_build_array(jsonb_build_object('version',delivery.details->'submissions'->-1->'version','decision',delivery.details->'submissions'->-1->'decision','reviewedAt',delivery.details->'submissions'->-1->'reviewedAt','description','','evidence','[]'::jsonb,'submittedBy','','submittedAt',delivery.details->'submissions'->-1->'submittedAt')) ELSE '[]'::jsonb END AS submissions FROM core."deliveryTask" delivery JOIN ${this.delivery.schema(workspace)}.task task ON task.id=delivery."taskId" JOIN core."deliveryProject" project ON project.id=delivery."projectId" AND project."workspaceId"=delivery."workspaceId" WHERE delivery."workspaceId"=$1 AND task."deletedAt" IS NULL AND ($2::uuid IS NULL OR delivery."projectId"=$2) ORDER BY task.id`,
        [workspace.id, query.projectId],
        'Current delivery tasks',
      );
    }
    const deliveries = included('DELIVERY')
      ? await this.currentFulfilments(
          manager,
          workspace.id,
          tasks
            .filter((task) => task.state === 'APPROVED')
            .map((task) => task.id),
          'DELIVERY',
          partial,
        )
      : [];
    const pendingReviews = tasks.filter((task) => task.state === 'IN_REVIEW');
    const reviewAssignments = await readCurrentDeliveryReviewAssignments(
      manager,
      workspace.id,
      pendingReviews.flatMap((task) => {
        const submission = task.submissions[task.submissions.length - 1];
        return Number.isSafeInteger(submission?.version) &&
          submission.version > 0
          ? [{ taskId: task.id, submissionVersion: submission.version }]
          : [];
      }),
    );
    const reviewAccess = pendingReviews.length
      ? await this.access.listAccess(workspace.id, manager)
      : [];
    for (const task of pendingReviews) {
      const submission = task.submissions[task.submissions.length - 1];
      task.review =
        Number.isSafeInteger(submission?.version) && submission.version > 0
          ? deliveryReviewAuthority({
              primaryReviewerId: task.reviewerId,
              assigneeId: task.assigneeId,
              allowSelfReview: task.allowSelfReview,
              assignment: reviewAssignments.get(task.id),
              projectMemberIds:
                projects.find((project) => project.id === task.projectId)
                  ?.memberIds ?? [],
              access: reviewAccess,
              actorId: memberId,
            })
          : {
              effectiveReviewerId: task.reviewerId,
              reviewerState: 'UNAVAILABLE',
              assignmentRevision: 0,
            };
    }
    for (const task of tasks)
      if (DELIVERY_STATES.includes(task.state as DeliveryDetails['state']))
        verifiedSourceKeys.add(`TASK:${task.id}`);
    if (included('DELIVERY'))
      for (const task of tasks) {
        if (!DELIVERY_STATES.includes(task.state as DeliveryDetails['state'])) {
          partial('DELIVERY', 'INVALID_TASK_SOURCE');
          continue;
        }
        items.push(
          ...founderTaskExceptions(
            task,
            owners,
            projects.find((project) => project.id === task.projectId)?.name ??
              null,
            now,
            deliveries.find((delivery) => delivery.taskId === task.id),
            task.submissions,
          ),
        );
      }
    let engagements: Engagement[] = [];
    if (included('COMMITMENTS') || included('CAMPAIGNS')) {
      const values = await this.bounded<{ value: unknown }>(
        manager,
        `SELECT jsonb_build_object('id',item->'id','projectId',item->'projectId','companyId',item->'companyId','name',item->'name','services',item->'services','advertising',item->'advertising') AS value FROM core."deliveryOperations",jsonb_array_elements(${safeArray('{clients,engagements}')}) item WHERE "workspaceId"=$1 AND ($2::uuid IS NULL OR item->>'projectId'=$2::text) ORDER BY item->>'id'`,
        [workspace.id, query.projectId],
        'Client engagements',
      );
      for (const row of values) {
        const engagement = engagementSchema.safeParse(row.value);
        if (
          engagement.success &&
          projects.some((project) => project.id === engagement.data.projectId)
        )
          engagements.push(engagement.data);
        else {
          if (included('COMMITMENTS'))
            partial('COMMITMENTS', 'UNAVAILABLE_ENGAGEMENT');
          if (included('CAMPAIGNS'))
            partial('CAMPAIGNS', 'UNAVAILABLE_ENGAGEMENT');
        }
      }
    }
    if (included('COMMITMENTS'))
      await this.commitments(
        manager,
        workspace,
        query,
        tasks,
        engagements,
        projects,
        items,
        partial,
        now,
        verifiedSourceKeys,
      );
    const financial = canReadFinance(actor);
    if (included('FINANCE')) {
      if (!financial) {
        const entry = coverage.find((row) => row.domain === 'FINANCE');
        if (entry) {
          entry.status = 'RESTRICTED';
          entry.codes = ['FINANCE_READ_REQUIRED'];
        }
      } else
        await this.finance(
          manager,
          workspace.id,
          query,
          projects,
          owners,
          items,
          partial,
          verifiedSourceKeys,
        );
    }
    if (included('CAMPAIGNS'))
      await this.campaigns(
        manager,
        workspace.id,
        query,
        engagements,
        projects,
        owners,
        items,
        partial,
        verifiedSourceKeys,
      );
    if (included('MANUAL_RISKS'))
      await this.manualRisks(
        manager,
        workspace.id,
        tasks,
        projects,
        owners,
        items,
        partial,
        verifiedSourceKeys,
        financial,
      );
    const verified = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (!verified.isAdmin || canReadFinance(verified) !== financial)
      throw new ForbiddenException(
        'Company overview access changed. Refresh before continuing.',
      );
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      observedAt: now.toISOString(),
      canReadFinance: financial,
      projects,
      owners,
      coverage,
      ...founderExceptionPage(workspace.id, items, {
        ...query,
        after: null,
        limit: 12000,
      }),
      verifiedSourceKeys: [...verifiedSourceKeys],
    };
  }
  private async currentFulfilments(
    manager: EntityManager,
    workspaceId: string,
    taskIds: string[],
    domain: FounderDomain,
    partial: (
      domain: FounderDomain,
      code: string,
      incomplete?: boolean,
    ) => void,
  ): Promise<Fulfilment[]> {
    if (!taskIds.length) return [];
    const fulfilmentRows = await this.bounded<{ value: unknown }>(
      manager,
      `SELECT jsonb_build_object('taskId',item->'taskId','status',item->'status','deliveredAt',item->'deliveredAt','cycle',item->'cycle','deliveredSubmissionVersion',item->'deliveredSubmissionVersion','nextCheckAt',NULL,'history',CASE WHEN jsonb_typeof(item->'history')='array' AND jsonb_array_length(item->'history')>0 THEN jsonb_build_array(jsonb_build_object('at',item->'history'->-1->'at','action',item->'history'->-1->'action','actorId','','note','')) ELSE '[]'::jsonb END) AS value FROM core."deliveryOperations",jsonb_array_elements(${safeArray('{fulfilments}')}) item WHERE "workspaceId"=$1 AND item->>'taskId'=ANY($2::text[]) ORDER BY item->>'taskId'`,
      [workspaceId, taskIds],
      'Current fulfilment evidence',
    );
    const fulfilments: Fulfilment[] = [];
    const fulfilmentSchema = z.object({
      taskId: z.uuid(),
      status: z.enum(['WAITING', 'FULFILLED', 'REDOING']),
      deliveredAt: z.string(),
      cycle: z.number().int().nonnegative(),
      deliveredSubmissionVersion: z.number().int().positive().nullish(),
      nextCheckAt: z.string().nullable(),
      history: z.array(
        z.object({
          at: z.string(),
          action: z.string(),
          actorId: z.string(),
          note: z.string(),
        }),
      ),
    });
    for (const row of fulfilmentRows) {
      const parsed = fulfilmentSchema.safeParse(row.value);
      if (!parsed.success) {
        partial(domain, 'INVALID_FULFILMENT_EVIDENCE');
        continue;
      }
      fulfilments.push({
        ...parsed.data,
        deliveredSubmissionVersion:
          parsed.data.deliveredSubmissionVersion ?? undefined,
      });
    }
    const duplicateFulfilments = new Set(
      fulfilments
        .filter(
          (row, index) =>
            fulfilments.findIndex(
              (candidate) => candidate.taskId === row.taskId,
            ) !== index,
        )
        .map((row) => row.taskId),
    );
    if (duplicateFulfilments.size)
      partial(domain, 'INVALID_FULFILMENT_EVIDENCE');
    return fulfilments.filter(
      (fulfilment) => !duplicateFulfilments.has(fulfilment.taskId),
    );
  }

  private async commitments(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    query: FounderExceptionsQuery,
    tasks: TaskSource[],
    engagements: Engagement[],
    projects: DeliveryFounderOptionDTO[],
    items: DeliveryFounderExceptionDTO[],
    partial: (
      domain: FounderDomain,
      code: string,
      incomplete?: boolean,
    ) => void,
    now: Date,
    verifiedSourceKeys: Set<string> = new Set(),
  ) {
    const periods = await this.bounded<CommitmentPeriod>(
      manager,
      'SELECT id,"engagementId","projectId","clientId",label,to_char("startDate",\'YYYY-MM-DD\') AS "startDate",to_char("endDateExclusive",\'YYYY-MM-DD\') AS "endDateExclusive",timezone,state,revision FROM core."deliveryCommitmentPeriod" WHERE "workspaceId"=$1 AND ($2::uuid IS NULL OR "projectId"=$2) ORDER BY id',
      [workspace.id, query.projectId],
      'Commitment periods',
    );
    const periodIds = periods.map((period) => period.id);
    if (!periodIds.length) {
      partial('COMMITMENTS', 'NO_RECORDED_COMMITMENTS');
      return;
    }
    const lines = await this.bounded<CommitmentLine>(
      manager,
      'SELECT id,"periodId",label,unit,"promisedQuantity",revision FROM core."deliveryCommitmentLine" WHERE "workspaceId"=$1 AND "periodId"=ANY($2::uuid[]) ORDER BY id',
      [workspace.id, periodIds],
      'Commitment allowances',
    );
    const allocations = await this.bounded<CommitmentAllocation>(
      manager,
      'SELECT id,"taskId","periodId","lineId",state,"creditedCycle","creditedSubmissionVersion",revision FROM core."deliveryCommitmentAllocation" WHERE "workspaceId"=$1 AND "periodId"=ANY($2::uuid[]) AND state<>\'REMOVED\' ORDER BY id',
      [workspace.id, periodIds],
      'Current commitment allocations',
    );
    const fulfilments = await this.currentFulfilments(
      manager,
      workspace.id,
      allocations.map((allocation) => allocation.taskId),
      'COMMITMENTS',
      partial,
    );
    for (const period of periods) {
      const engagement = engagements.find(
        (row) =>
          row.id === period.engagementId &&
          row.projectId === period.projectId &&
          row.companyId === period.clientId,
      );
      if (!engagement) {
        partial('COMMITMENTS', 'UNAVAILABLE_ENGAGEMENT');
        continue;
      }
      let today: string;
      try {
        today = financeForecastBusinessDate(period.timezone, now);
      } catch {
        partial('COMMITMENTS', 'INVALID_COMMITMENT_CALENDAR');
        continue;
      }
      const ownLines = lines.filter((line) => line.periodId === period.id);
      if (!ownLines.length)
        partial('COMMITMENTS', 'MISSING_COMMITMENT_ALLOWANCES');
      for (const line of ownLines) {
        if (
          !Number.isSafeInteger(line.promisedQuantity) ||
          line.promisedQuantity < 0
        ) {
          partial('COMMITMENTS', 'INVALID_COMMITMENT_ALLOWANCE');
          continue;
        }
        verifiedSourceKeys.add(`COMMITMENT:${line.id}`);
        const ownAllocations = allocations.filter(
          (allocation) =>
            allocation.periodId === period.id && allocation.lineId === line.id,
        );
        const credited = ownAllocations.filter((allocation) => {
          const task = tasks.find(
            (candidate) =>
              candidate.id === allocation.taskId &&
              candidate.projectId === period.projectId,
          );
          return commitmentCredit(
            allocation,
            task
              ? {
                  state: task.state as DeliveryDetails['state'],
                  submissions: task.submissions,
                }
              : null,
            fulfilments.find(
              (fulfilment) => fulfilment.taskId === allocation.taskId,
            ),
          ).credited;
        }).length;
        const remaining = Math.max(0, line.promisedQuantity - credited);
        if (remaining === 0) continue;
        const reasonCode = !period.endDateExclusive
          ? 'COMMITMENT_END_UNSET'
          : period.endDateExclusive <= today
            ? 'COMMITMENT_SHORTFALL'
            : null;
        if (!reasonCode) continue;
        items.push(
          founderException({
            domain: 'COMMITMENTS',
            reasonCode,
            sourceType: 'COMMITMENT',
            sourceId: line.id,
            sourceRevision: financeReviewToken({
              period: period.revision,
              line: line.revision,
              allocations: ownAllocations,
              credited,
            }),
            projectId: period.projectId,
            projectName:
              projects.find((project) => project.id === period.projectId)
                ?.name ?? null,
            title: `${engagement.name} · ${line.label}`,
            dueAt: period.endDateExclusive,
            evidence: founderEvidence({
              state: period.state,
              date: period.endDateExclusive,
              timezone: period.timezone,
              promisedQuantity: line.promisedQuantity,
              fulfilledQuantity: credited,
              remainingQuantity: remaining,
              warnings: ['COMMITMENT_OWNER_UNASSIGNED'],
            }),
            nextAction: founderAction({
              code: 'REVIEW_COMMITMENT',
              targetType: 'COMMITMENT',
              targetId: line.id,
              engagementId: period.engagementId,
              periodId: period.id,
            }),
          }),
        );
      }
    }
  }
  private async finance(
    manager: EntityManager,
    workspaceId: string,
    query: FounderExceptionsQuery,
    projects: DeliveryFounderOptionDTO[],
    owners: DeliveryFounderOptionDTO[],
    items: DeliveryFounderExceptionDTO[],
    partial: (
      domain: FounderDomain,
      code: string,
      incomplete?: boolean,
    ) => void,
    verifiedSourceKeys: Set<string> = new Set(),
  ) {
    partial('FINANCE', 'REVIEWED_FORECAST_90_DAYS');
    partial('FINANCE', 'COST_COMPLETENESS_NOT_VERIFIED');
    if (query.serviceMonth)
      await manager.query(
        'SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',
        [`finance-period:${workspaceId}:${query.serviceMonth}`],
      );
    else partial('FINANCE', 'SERVICE_MONTH_NOT_SELECTED');
    const records = await this.bounded<{ record: unknown }>(
      manager,
      `SELECT jsonb_build_object('id',item->'id','kind',item->'kind','revision',item->'revision','projectId',item->'projectId','title',item->'title','category',item->'category','currency',item->'currency','amount',item->'amount','date',item->'date','dueDate',item->'dueDate','status',item->'status','externalReference',item->'externalReference','evidenceUrl',item->'evidenceUrl','notes',item->'notes','createdAt',item->'createdAt') AS record FROM core."deliveryOperations",jsonb_array_elements(${safeArray('{business,records}')}) item WHERE "workspaceId"=$1 AND item->>'kind'='FINANCE' ORDER BY item->>'id'`,
      [workspaceId],
      'Current financial source records',
    ).then((rows) => rows.map((row) => row.record));
    const anchors = await manager
      .getRepository(DeliveryFinanceForecastAnchorEntity)
      .find({ where: { workspaceId }, take: FOUNDER_SOURCE_LIMIT + 1 });
    const forecastItems = await manager
      .getRepository(DeliveryFinanceForecastItemEntity)
      .find({
        where: {
          workspaceId,
          ...(query.currency ? { currency: query.currency } : {}),
        },
        take: FOUNDER_SOURCE_LIMIT + 1,
        order: { id: 'ASC' },
      });
    const plans = await manager.getRepository(DeliveryFinancePlanEntity).find({
      where: {
        workspaceId,
        ...(query.currency ? { currency: query.currency } : {}),
      },
      take: FOUNDER_SOURCE_LIMIT + 1,
    });
    if (
      [anchors, forecastItems, plans].some(
        (rows) => rows.length > FOUNDER_SOURCE_LIMIT,
      )
    )
      throw new BadRequestException(
        'Current forecast sources exceed the founder review limit; no sources were truncated.',
      );
    const storedSources = await this.bounded<ForecastStoredSource>(
      manager,
      'SELECT id,kind,currency,"amountMicros",snapshot FROM core."deliveryFinanceSource" WHERE "workspaceId"=$1 ORDER BY id',
      [workspaceId],
      'Normalized financial sources',
    );
    const settlements = await this.bounded<ForecastSettlement>(
      manager,
      'SELECT id,"cashId","receivableId",currency,"amountMicros" FROM core."deliveryFinanceSettlement" WHERE "workspaceId"=$1 AND status=\'ACTIVE\' ORDER BY id',
      [workspaceId],
      'Active invoice settlements',
    );
    const realizations = await this.bounded<ForecastRealization>(
      manager,
      'SELECT id,revision,"itemId","cashId","amountMicros",status FROM core."deliveryFinanceForecastRealization" WHERE "workspaceId"=$1 AND status=\'ACTIVE\' ORDER BY id',
      [workspaceId],
      'Active planned-payment applications',
    );
    const accesses = await this.access.listAccess(workspaceId, manager);
    const eligibleOwners = owners.filter((owner) =>
      accesses.some(
        (access) =>
          access.memberId === owner.id &&
          (access.nativeAdministrator ||
            access.capabilities.some((capability) =>
              ['workspace.admin', 'finance.read', 'finance.manage'].includes(
                capability,
              ),
            )),
      ),
    );
    const currencies = query.currency
      ? [query.currency]
      : [
          ...new Set([
            ...anchors.map((anchor) => anchor.currency),
            ...forecastItems.map((item) => item.currency),
            ...records.flatMap((record) =>
              record &&
              typeof record === 'object' &&
              'currency' in record &&
              typeof record.currency === 'string'
                ? [record.currency]
                : [],
            ),
          ]),
        ].sort();
    if (!currencies.length) partial('FINANCE', 'NO_RECORDED_FINANCE');
    for (const currency of currencies) {
      if (!deliveryCurrencySchema.safeParse(currency).success) {
        partial('FINANCE', 'INVALID_FINANCE_CURRENCY');
        continue;
      }
      const anchor =
        anchors.find((candidate) => candidate.currency === currency) ?? null;
      let businessDate: string | null = null;
      try {
        businessDate = anchor
          ? financeForecastBusinessDate(anchor.timezone)
          : null;
      } catch {
        partial('FINANCE', 'INVALID_FINANCE_CALENDAR');
      }
      const cashData = projectFinanceForecastCash({
        workspaceId,
        currency,
        businessDate,
        records,
        projects,
        storedSources,
        settlements,
      });
      const groups = new Map<string, ForecastRealization[]>();
      for (const row of realizations) {
        const key = `${row.itemId}:${row.cashId}`;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      const state: FinanceForecastState = {
        anchor,
        businessDate,
        cashData,
        items: forecastItems.filter((item) => item.currency === currency),
        plans: plans.filter((plan) => plan.currency === currency),
        owners: eligibleOwners,
        totals: [...groups.values()].map((rows) => ({
          itemId: rows[0].itemId,
          cashId: rows[0].cashId,
          amount: rows
            .reduce((sum, row) => sum + BigInt(row.amountMicros), BigInt(0))
            .toString(),
          version: financeReviewToken(rows),
        })),
      };
      const projected = state.items.map((item) => forecastItemDTO(item, state));
      if (anchor && businessDate)
        verifiedSourceKeys.add(`FORECAST_ANCHOR:${currency}`);
      for (const item of projected)
        if (
          item.remainingMicros !== null &&
          !item.warnings.some((warning) =>
            ['SOURCE_CHANGED', 'MISSING_SOURCE', 'INVALID_CASH'].includes(
              warning,
            ),
          )
        )
          verifiedSourceKeys.add(`FORECAST_ITEM:${item.id}`);
      for (const source of [...cashData.cash, ...cashData.receivables])
        if (
          !source.warnings.some((warning) =>
            ['SOURCE_CHANGED', 'INVALID_CASH', 'INVALID_RECEIVABLE'].includes(
              warning,
            ),
          )
        )
          verifiedSourceKeys.add(`FORECAST_SOURCE:${source.snapshot.id}`);
      const action = (
        code: string,
        sourceKind: string,
        targetId: string | null = null,
      ) =>
        founderAction({
          code,
          targetType: 'FORECAST',
          currency,
          sourceKind,
          targetId,
        });
      if (!anchor || !businessDate)
        items.push(
          founderException({
            domain: 'FINANCE',
            reasonCode: 'FORECAST_ANCHOR_MISSING',
            sourceType: 'FORECAST_ANCHOR',
            sourceId: anchor?.id ?? null,
            sourceRevision: anchor ? String(anchor.revision) : null,
            title: currency,
            evidence: founderEvidence({
              currency,
              warnings: ['REPORTING_DATE_NOT_SET'],
            }),
            nextAction: action('SET_UP_CASH', 'ANCHOR', anchor?.id ?? null),
          }),
        );
      for (const item of projected) {
        if (item.status !== 'ACTIVE') continue;
        const source = item.sourceId
          ? cashData.receivables.find(
              (row) => row.snapshot.id === item.sourceId,
            )
          : null;
        const projectId = source?.snapshot.projectId ?? null;
        const reasonCodes = [
          ...(item.warnings.includes('OVERDUE_EXPECTATION')
            ? ['FORECAST_EXPECTATION_OVERDUE']
            : []),
          ...(item.warnings.includes('NEXT_ACTION_OVERDUE')
            ? ['FORECAST_NEXT_ACTION_OVERDUE']
            : []),
          ...(!item.ownerEligible ? ['FORECAST_OWNER_UNAVAILABLE'] : []),
          ...(item.warnings.includes('UNDATED_EXPECTATION')
            ? ['FORECAST_UNDATED']
            : []),
          ...(item.warnings.some(
            (warning) =>
              ![
                'OVERDUE_EXPECTATION',
                'NEXT_ACTION_OVERDUE',
                'OWNER_INELIGIBLE',
                'UNDATED_EXPECTATION',
              ].includes(warning),
          )
            ? ['FORECAST_REVIEW_REQUIRED']
            : []),
        ];
        for (const reasonCode of reasonCodes)
          items.push(
            founderException({
              domain: 'FINANCE',
              reasonCode,
              sourceType: 'FORECAST_ITEM',
              sourceId: item.id,
              sourceRevision: item.reviewToken,
              title: item.title,
              projectId,
              projectName:
                projects.find((project) => project.id === projectId)?.name ??
                null,
              occurredAt: item.changedAt,
              dueAt:
                reasonCode === 'FORECAST_NEXT_ACTION_OVERDUE'
                  ? item.nextActionDate
                  : item.expectedDate,
              ...founderOwner(item.ownerId, eligibleOwners),
              evidence: founderEvidence({
                state: item.status,
                date: item.expectedDate,
                timezone: anchor?.timezone ?? null,
                currency,
                amountMicros: item.remainingMicros,
                warnings: item.warnings,
              }),
              nextAction: action('REVIEW_FORECAST', 'ITEM', item.id),
            }),
          );
      }
      for (const source of cashData.receivables) {
        if (
          source.snapshot.status === 'VOID' ||
          projected.some(
            (item) =>
              item.status === 'ACTIVE' &&
              item.sourceType === 'RECEIVABLE' &&
              item.sourceId === source.snapshot.id,
          )
        )
          continue;
        if (source.outstandingMicros === '0') continue;
        items.push(
          founderException({
            domain: 'FINANCE',
            reasonCode:
              source.outstandingMicros === null
                ? 'FORECAST_UNKNOWN_COLLECTION'
                : 'FORECAST_UNSCHEDULED_COLLECTION',
            sourceType: 'FORECAST_SOURCE',
            sourceId: source.snapshot.id,
            sourceRevision: source.sourceToken,
            title: source.snapshot.title,
            projectId: source.snapshot.projectId,
            projectName: source.snapshot.projectName,
            dueAt: source.snapshot.dueDate,
            evidence: founderEvidence({
              state: source.snapshot.status,
              currency,
              amountMicros: source.outstandingMicros,
              date: source.snapshot.dueDate,
              timezone: anchor?.timezone ?? null,
              warnings: source.warnings,
            }),
            nextAction: action(
              'REVIEW_COLLECTION',
              'RECEIVABLE',
              source.snapshot.id,
            ),
          }),
        );
      }
      for (const anomaly of cashData.anomalies) {
        if (anomaly.code === 'REPORTING_DATE_NOT_SET') continue;
        items.push(
          founderException({
            key: `FINANCE:SOURCE:${currency}:${anomaly.id ?? 'UNKNOWN'}:${anomaly.code}`,
            domain: 'FINANCE',
            reasonCode: 'FORECAST_CASH_WARNING',
            sourceType: 'FORECAST_SOURCE',
            sourceId: anomaly.id,
            title: anomaly.title ?? currency,
            dueAt: anomaly.date,
            projectId:
              cashData.cash.find((cash) => cash.snapshot.id === anomaly.id)
                ?.snapshot.projectId ??
              cashData.receivables.find(
                (invoice) => invoice.snapshot.id === anomaly.id,
              )?.snapshot.projectId ??
              null,
            evidence: founderEvidence({
              currency,
              amountMicros: anomaly.amountMicros,
              date: anomaly.date,
              timezone: anchor?.timezone ?? null,
              warnings: [anomaly.code],
            }),
            nextAction: action(
              anomaly.sourceType === 'CASH'
                ? 'REVIEW_CASH'
                : 'REVIEW_COLLECTION',
              anomaly.sourceType ?? 'ANCHOR',
              anomaly.id,
            ),
          }),
        );
      }
      for (const cash of cashData.cash) {
        const source = cash.snapshot;
        if (
          !cash.eligible ||
          !['EXPENSE', 'SALARY'].includes(source.category) ||
          !businessDate ||
          source.date > businessDate ||
          (anchor && source.date <= anchor.closingDate)
        )
          continue;
        const remaining =
          BigInt(source.amountMicros) -
          forecastAmountTotal(
            state.totals.filter((total) => total.cashId === source.id),
          );
        if (remaining > BigInt(0))
          items.push(
            founderException({
              domain: 'FINANCE',
              reasonCode: 'FORECAST_UNAPPLIED_OUTFLOW',
              sourceType: 'FORECAST_SOURCE',
              sourceId: source.id,
              sourceRevision: financeReviewToken({
                token: cash.sourceToken,
                remaining: remaining.toString(),
              }),
              title: source.title,
              projectId: source.projectId,
              projectName: source.projectName,
              dueAt: source.date,
              evidence: founderEvidence({
                currency,
                amountMicros: remaining.toString(),
                date: source.date,
                timezone: anchor?.timezone ?? null,
              }),
              nextAction: action('APPLY_OUTFLOW', 'CASH', source.id),
            }),
          );
      }
      if (anchor && businessDate) {
        const projection = calculateFinanceForecast({
          anchorMicros: anchor.amountMicros,
          anchorClosingDate: anchor.closingDate,
          businessDate,
          horizonDays: 90,
          actualMovements: cashData.cash
            .filter((cash) => cash.eligible)
            .flatMap((cash) =>
              cash.snapshot.category === 'INCOME' ||
              cash.snapshot.category === 'EXPENSE' ||
              cash.snapshot.category === 'SALARY'
                ? [
                    {
                      date: cash.snapshot.date,
                      kind: cash.snapshot.category,
                      amountMicros: cash.snapshot.amountMicros,
                    },
                  ]
                : [],
            ),
          expectedMovements: projected
            .filter(
              (item) =>
                item.eligible &&
                item.expectedDate !== null &&
                item.remainingMicros !== null,
            )
            .map((item) => ({
              id: item.id,
              date: item.expectedDate!,
              kind: item.kind === 'COLLECTION' ? 'INFLOW' : 'OUTFLOW',
              amountMicros: item.remainingMicros!,
            })),
        });
        if (projection.firstNegativeDate)
          items.push(
            founderException({
              domain: 'FINANCE',
              reasonCode: 'FORECAST_NEGATIVE_CLOSING',
              sourceType: 'FORECAST_ANCHOR',
              sourceId: anchor.id,
              sourceRevision: financeReviewToken({
                anchor: anchor.revision,
                projection,
              }),
              title: currency,
              dueAt: projection.firstNegativeDate,
              evidence: founderEvidence({
                currency,
                amountMicros:
                  projection.timeline.find(
                    (day) => day.date === projection.firstNegativeDate,
                  )?.closingMicros ?? null,
                date: projection.firstNegativeDate,
                timezone: anchor.timezone,
                warnings: [
                  'REVIEWED_90_DAY_SCENARIO',
                  ...(cashData.anomalies.length ||
                  projected.some(
                    (item) => item.status === 'ACTIVE' && !item.eligible,
                  )
                    ? ['INCOMPLETE_FORECAST']
                    : []),
                ],
              }),
              nextAction: action('REVIEW_FORECAST', 'ANCHOR', anchor.id),
            }),
          );
      }
    }
    if (query.serviceMonth)
      await this.monthly(
        manager,
        workspaceId,
        query,
        projects,
        items,
        partial,
        verifiedSourceKeys,
      );
  }
  private async monthly(
    manager: EntityManager,
    workspaceId: string,
    query: FounderExceptionsQuery,
    projects: DeliveryFounderOptionDTO[],
    items: DeliveryFounderExceptionDTO[],
    partial: (
      domain: FounderDomain,
      code: string,
      incomplete?: boolean,
    ) => void,
    verifiedSourceKeys: Set<string> = new Set(),
  ) {
    const entries = await this.bounded<MonthlyEntry>(
      manager,
      'SELECT id,revision,currency,kind,status,"amountMicros" FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND month=$2 AND status<>\'VOID\' AND ($3::text IS NULL OR currency=$3) ORDER BY id',
      [workspaceId, query.serviceMonth, query.currency],
      'Selected monthly recognition entries',
    );
    const allocations = await this.bounded<MonthlyAllocation>(
      manager,
      'SELECT id,"entryId",bucket,"projectId","amountMicros" FROM core."deliveryFinanceAllocation" WHERE "workspaceId"=$1 AND "entryId"=ANY($2::uuid[]) ORDER BY id',
      [workspaceId, entries.map((entry) => entry.id)],
      'Selected monthly allocations',
    );
    for (const currency of [
      ...new Set(entries.map((entry) => entry.currency)),
    ].sort()) {
      const ownEntries = entries.filter((entry) => entry.currency === currency);
      const sourceRevision = financeReviewToken({
        entries: ownEntries,
        allocations: allocations.filter((allocation) =>
          ownEntries.some((entry) => entry.id === allocation.entryId),
        ),
      });
      const action = founderAction({
        code: 'REVIEW_MONTHLY',
        targetType: 'MONTHLY',
        currency,
        serviceMonth: query.serviceMonth,
      });
      const title = `${currency} · ${query.serviceMonth}`;
      const add = (
        reasonCode: string,
        evidence: Parameters<typeof founderEvidence>[0],
        projectId: string | null = null,
      ) =>
        items.push(
          founderException({
            key: `FINANCE:MONTHLY:${currency}:${query.serviceMonth}:${projectId ?? 'COMPANY'}:${reasonCode}`,
            domain: 'FINANCE',
            reasonCode,
            sourceType: 'MONTHLY_RESULT',
            sourceId: projectId,
            sourceRevision,
            projectId,
            projectName:
              projects.find((project) => project.id === projectId)?.name ??
              null,
            title,
            evidence: founderEvidence({
              currency,
              date: query.serviceMonth,
              ...evidence,
            }),
            nextAction: action,
          }),
        );
      const draftCount = ownEntries.filter(
        (entry) => entry.status === 'DRAFT',
      ).length;
      if (draftCount > 0)
        add('MONTHLY_DRAFTS', {
          state: 'DRAFT',
          warnings: ['POSTED_RESULTS_ONLY'],
        });
      let invalid = !deliveryCurrencySchema.safeParse(currency).success;
      let revenue = BigInt(0),
        cost = BigInt(0);
      const groups = new Map<
        string,
        { projectId: string | null; revenue: bigint; cost: bigint }
      >();
      for (const entry of ownEntries.filter(
        (candidate) => candidate.status === 'POSTED',
      )) {
        const amount = deliveryFinanceAmountSchema.safeParse(
          entry.amountMicros,
        );
        const ownAllocations = allocations.filter(
          (allocation) => allocation.entryId === entry.id,
        );
        if (
          !amount.success ||
          !['REVENUE', 'COST'].includes(entry.kind) ||
          ownAllocations.some(
            (allocation) =>
              !deliveryFinanceAmountSchema.safeParse(allocation.amountMicros)
                .success ||
              allocation.bucket !== (allocation.projectId ?? 'COMPANY') ||
              (allocation.projectId !== null &&
                !projects.some(
                  (project) => project.id === allocation.projectId,
                )),
          )
        ) {
          invalid = true;
          continue;
        }
        try {
          if (financeAllocationTotal(ownAllocations) !== BigInt(amount.data)) {
            invalid = true;
            continue;
          }
        } catch {
          invalid = true;
          continue;
        }
        if (entry.kind === 'REVENUE') revenue += BigInt(amount.data);
        else cost += BigInt(amount.data);
        for (const allocation of ownAllocations) {
          const key = allocation.projectId ?? 'COMPANY';
          const group = groups.get(key) ?? {
            projectId: allocation.projectId,
            revenue: BigInt(0),
            cost: BigInt(0),
          };
          if (entry.kind === 'REVENUE')
            group.revenue += BigInt(allocation.amountMicros);
          else group.cost += BigInt(allocation.amountMicros);
          groups.set(key, group);
        }
      }
      if (invalid) {
        partial('FINANCE', 'INVALID_MONTHLY_SOURCE');
        add('MONTHLY_RESULT_UNKNOWN', {
          state: 'UNKNOWN',
          warnings: ['INVALID_MONTHLY_SOURCE'],
        });
        continue;
      }
      verifiedSourceKeys.add(
        `MONTHLY_RESULT:${currency}:${query.serviceMonth}:COMPANY`,
      );
      for (const group of groups.values())
        verifiedSourceKeys.add(
          `MONTHLY_RESULT:${currency}:${query.serviceMonth}:${group.projectId ?? 'COMPANY'}`,
        );
      for (const project of projects)
        verifiedSourceKeys.add(
          `MONTHLY_RESULT:${currency}:${query.serviceMonth}:${project.id}`,
        );
      const warnings = [
        'POSTED_RESULTS_ONLY',
        'COST_COMPLETENESS_NOT_VERIFIED',
        ...(draftCount > 0 ? ['DRAFTS_NOT_RECOGNIZED'] : []),
      ];
      if (revenue - cost < BigInt(0))
        add('MONTHLY_NEGATIVE_RESULT', {
          revenueMicros: revenue.toString(),
          costMicros: cost.toString(),
          resultMicros: (revenue - cost).toString(),
          warnings,
        });
      for (const group of groups.values()) {
        if (group.projectId && group.revenue - group.cost < BigInt(0))
          add(
            'MONTHLY_NEGATIVE_RESULT',
            {
              revenueMicros: group.revenue.toString(),
              costMicros: group.cost.toString(),
              resultMicros: (group.revenue - group.cost).toString(),
              warnings,
            },
            group.projectId,
          );
        if (
          group.projectId === null &&
          (group.revenue > BigInt(0) || group.cost > BigInt(0))
        )
          partial('FINANCE', 'CLIENT_RESULTS_EXCLUDE_COMPANY_AMOUNTS', false);
      }
    }
    if (!entries.length) partial('FINANCE', 'NO_MONTHLY_ENTRIES');
  }

  private async campaigns(
    manager: EntityManager,
    workspaceId: string,
    query: FounderExceptionsQuery,
    engagements: Engagement[],
    projects: DeliveryFounderOptionDTO[],
    owners: DeliveryFounderOptionDTO[],
    items: DeliveryFounderExceptionDTO[],
    partial: (
      domain: FounderDomain,
      code: string,
      incomplete?: boolean,
    ) => void,
    verifiedSourceKeys: Set<string> = new Set(),
  ) {
    partial('CAMPAIGNS', 'UNIFIED_GOALS_OUTCOMES_NOT_AVAILABLE');
    const manual = await this.bounded<ManualReport>(
      manager,
      `SELECT item->>'id' AS id,CASE WHEN item->>'revision' ~ '^[0-9]{1,8}$' THEN (item->>'revision')::integer ELSE 0 END AS revision,item->>'projectId' AS "projectId",item->>'title' AS title,item->>'status' AS status,item->>'date' AS date,item->>'currency' AS currency,item->>'marketerId' AS "marketerId",item->>'updatedAt' AS "updatedAt" FROM core."deliveryOperations",jsonb_array_elements(${safeArray('{business,records}')}) item WHERE "workspaceId"=$1 AND item->>'kind'='AD_REPORT' AND ($2::uuid IS NULL OR item->>'projectId'=$2::text) ORDER BY item->>'id'`,
      [workspaceId, query.projectId],
      'Manual campaign reviews',
    );
    const reports = await this.bounded<MetaReport>(
      manager,
      'SELECT id,"projectId","managerId","marketerId",report->>\'engagementId\' AS "engagementId",status,to_char(date,\'YYYY-MM-DD\') AS date,report->>\'currency\' AS currency,report->>\'timezone\' AS timezone,position::text,to_char("checkedAt" AT TIME ZONE \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\') AS "checkedAt" FROM core."deliveryMetaReport" WHERE "workspaceId"=$1 AND "archivedAt" IS NULL AND ($2::uuid IS NULL OR "projectId"=$2) ORDER BY position,id',
      [workspaceId, query.projectId],
      'Current Meta report reviews',
    );
    for (const report of manual) {
      if (
        !identifier(report.id) ||
        !Number.isSafeInteger(report.revision) ||
        report.revision <= 0 ||
        !identifier(report.projectId) ||
        !projects.some((project) => project.id === report.projectId)
      ) {
        partial('CAMPAIGNS', 'INVALID_CAMPAIGN_SOURCE');
        continue;
      }
      verifiedSourceKeys.add(`MANUAL_REPORT:${report.id}`);
      if (!['REVIEW', 'CHANGES_REQUESTED'].includes(report.status)) continue;
      items.push(
        founderException({
          domain: 'CAMPAIGNS',
          reasonCode:
            report.status === 'REVIEW'
              ? 'CAMPAIGN_REVIEW'
              : 'CAMPAIGN_CHANGES_REQUESTED',
          sourceType: 'MANUAL_REPORT',
          sourceId: report.id,
          sourceRevision: String(report.revision),
          title: report.title,
          projectId: report.projectId,
          projectName:
            projects.find((project) => project.id === report.projectId)?.name ??
            null,
          occurredAt: report.updatedAt,
          ...founderOwner(
            report.status === 'CHANGES_REQUESTED'
              ? identifier(report.marketerId)
              : null,
            owners,
          ),
          evidence: founderEvidence({
            state: report.status,
            date: report.date,
            currency: deliveryCurrencySchema.safeParse(report.currency).success
              ? report.currency
              : null,
            warnings: [
              'MANUAL_REPORT',
              ...(report.status === 'REVIEW' ? ['REVIEWER_NOT_ASSIGNED'] : []),
            ],
          }),
          nextAction: founderAction({
            code: 'REVIEW_CAMPAIGN',
            targetType: 'MANUAL_REPORT',
            targetId: report.id,
          }),
        }),
      );
    }
    for (const report of reports) {
      const engagement = report.engagementId
        ? engagements.find((row) => row.id === report.engagementId)
        : null;
      const routingValid =
        !report.engagementId ||
        (engagement !== undefined &&
          engagement !== null &&
          hasPerformanceMarketingService(engagement.services) &&
          engagement.advertising?.channel === 'META' &&
          (!report.projectId || report.projectId === engagement.projectId));
      const projectId = routingValid
        ? (engagement?.projectId ?? report.projectId)
        : report.projectId;
      const managerId = routingValid
        ? (engagement?.advertising?.managerId ?? report.managerId)
        : null;
      const marketerId = routingValid
        ? (engagement?.advertising?.marketerId ?? report.marketerId)
        : null;
      const ownerId = report.status === 'REVIEW' ? managerId : marketerId;
      if (routingValid) verifiedSourceKeys.add(`META_REPORT:${report.id}`);
      if (!['REVIEW', 'CHANGES_REQUESTED'].includes(report.status)) continue;
      items.push(
        founderException({
          domain: 'CAMPAIGNS',
          reasonCode: !routingValid
            ? 'CAMPAIGN_ROUTING_UNAVAILABLE'
            : report.status === 'REVIEW'
              ? 'CAMPAIGN_REVIEW'
              : 'CAMPAIGN_CHANGES_REQUESTED',
          sourceType: 'META_REPORT',
          sourceId: report.id,
          sourceRevision: financeReviewToken({
            position: report.position,
            status: report.status,
            checkedAt: report.checkedAt,
            managerId,
            marketerId,
          }),
          title: `Meta · ${report.date}`,
          projectId,
          projectName:
            projects.find((project) => project.id === projectId)?.name ?? null,
          occurredAt: report.checkedAt,
          ...founderOwner(ownerId, owners),
          evidence: founderEvidence({
            state: report.status,
            date: report.date,
            timezone: report.timezone,
            currency: deliveryCurrencySchema.safeParse(report.currency).success
              ? report.currency
              : null,
            warnings: routingValid
              ? []
              : ['CURRENT_CLIENT_ROUTING_UNAVAILABLE'],
          }),
          nextAction: founderAction({
            code: 'REVIEW_CAMPAIGN',
            targetType: 'META_REPORT',
            targetId: report.id,
          }),
        }),
      );
    }
    const connections = await this.bounded<MetaConnection>(
      manager,
      `SELECT item->>'accountId' AS "accountId",item->>'projectId' AS "projectId",item->>'ownerId' AS "ownerId",item->>'name' AS name,CASE WHEN item->>'revision' ~ '^[0-9]{1,8}$' THEN (item->>'revision')::integer ELSE 0 END AS revision,COALESCE((item->>'enabled')='true',false) AS enabled,COALESCE(length(item->>'error')>0,false) AS "hasError" FROM core."deliveryOperations",jsonb_array_elements(${safeArray('{metaReporting,connections}')}) item WHERE "workspaceId"=$1 ORDER BY item->>'accountId'`,
      [workspaceId],
      'Current campaign connection metadata',
    );
    if (connections.length) verifiedSourceKeys.add('CAMPAIGN_SETUP:META');
    for (const connection of connections)
      verifiedSourceKeys.add(`CAMPAIGN_SETUP:${connection.accountId}`);
    if (!connections.length) {
      partial('CAMPAIGNS', 'META_NOT_CONFIGURED');
      items.push(
        founderException({
          domain: 'CAMPAIGNS',
          reasonCode: 'CAMPAIGN_SETUP',
          sourceType: 'CAMPAIGN_SETUP',
          title: 'Meta',
          evidence: founderEvidence({ warnings: ['META_NOT_CONFIGURED'] }),
          nextAction: founderAction({
            code: 'REVIEW_SETUP',
            targetType: 'READINESS',
          }),
        }),
      );
    }
    for (const connection of connections) {
      if (!connection.enabled) partial('CAMPAIGNS', 'CAMPAIGN_SCHEDULE_PAUSED');
      if (!connection.hasError) continue;
      items.push(
        founderException({
          key: `CAMPAIGNS:CONNECTION:${connection.accountId}:ATTENTION`,
          domain: 'CAMPAIGNS',
          reasonCode: 'CAMPAIGN_CONNECTION_ATTENTION',
          sourceType: 'CAMPAIGN_SETUP',
          sourceRevision: String(connection.revision),
          title: connection.name || 'Meta',
          projectId: identifier(connection.projectId),
          projectName:
            projects.find((project) => project.id === connection.projectId)
              ?.name ?? null,
          ...founderOwner(identifier(connection.ownerId), owners),
          evidence: founderEvidence({
            state: connection.enabled ? 'ENABLED' : 'PAUSED',
            warnings: ['CONNECTION_REQUIRES_REVIEW'],
          }),
          nextAction: founderAction({
            code: 'REVIEW_SETUP',
            targetType: 'READINESS',
          }),
        }),
      );
    }
  }
  private async manualRisks(
    manager: EntityManager,
    workspaceId: string,
    tasks: TaskSource[],
    projects: DeliveryFounderOptionDTO[],
    owners: DeliveryFounderOptionDTO[],
    items: DeliveryFounderExceptionDTO[],
    partial: (
      domain: FounderDomain,
      code: string,
      incomplete?: boolean,
    ) => void,
    verifiedSourceKeys: Set<string>,
    financial: boolean,
  ) {
    const rows = await this.bounded<{ value: unknown }>(
      manager,
      `SELECT jsonb_build_object('id',item->'id','taskId',item->'taskId','category',item->'category','severity',item->'severity','reason',item->'reason','ownerId',item->'ownerId','createdAt',item->'createdAt','resolvedAt',item->'resolvedAt') AS value FROM core."deliveryOperations",jsonb_array_elements(${safeArray('{alerts}')}) item WHERE "workspaceId"=$1 AND item->>'category' IN ('CLIENT','CONTRACT','BUDGET') ORDER BY item->>'id'`,
      [workspaceId],
      'Manual client/contract/budget concerns',
    );
    const schema = z.object({
      id: z.uuid(),
      taskId: z.uuid(),
      category: z.enum(['CLIENT', 'CONTRACT', 'BUDGET']),
      severity: z.enum(['NORMAL', 'URGENT']),
      reason: z.string().min(1).max(6000),
      ownerId: z.uuid(),
      createdAt: z.iso.datetime({ offset: true }),
      resolvedAt: z.iso.datetime({ offset: true }).nullable(),
    });
    for (const row of rows) {
      const parsed = schema.safeParse(row.value);
      if (!parsed.success) {
        partial('MANUAL_RISKS', 'INVALID_MANUAL_RISK_SOURCE');
        continue;
      }
      const risk = parsed.data;
      if (risk.category === 'BUDGET' && !financial) {
        partial('MANUAL_RISKS', 'MANUAL_BUDGET_READ_RESTRICTED');
        continue;
      }
      const task = tasks.find((candidate) => candidate.id === risk.taskId);
      if (!task) {
        partial('MANUAL_RISKS', 'UNAVAILABLE_MANUAL_RISK_SOURCE');
        continue;
      }
      verifiedSourceKeys.add(`MANUAL_RISK:${risk.id}`);
      if (risk.resolvedAt) continue;
      items.push(
        founderException({
          key: `MANUAL_RISKS:${risk.id}`,
          domain: 'MANUAL_RISKS',
          reasonCode: `MANUAL_${risk.category}_CONCERN`,
          sourceType: 'MANUAL_RISK',
          sourceId: risk.id,
          sourceRevision: financeReviewToken(risk),
          title: risk.reason.slice(0, 240),
          projectId: task.projectId,
          projectName:
            projects.find((project) => project.id === task.projectId)?.name ??
            null,
          occurredAt: risk.createdAt,
          ...founderOwner(risk.ownerId, owners),
          evidence: founderEvidence({
            state: 'OPEN',
            warnings: [`RECORDED_${risk.severity}_CONCERN`],
          }),
          nextAction: founderAction({
            code: 'OPEN_ALERT',
            targetType: 'TASK',
            targetId: risk.taskId,
          }),
        }),
      );
    }
  }
}
