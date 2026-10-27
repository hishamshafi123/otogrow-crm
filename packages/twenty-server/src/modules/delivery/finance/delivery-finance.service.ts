import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, In, MoreThan, type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import {
  canManageFinance,
  canReadFinance,
} from 'src/modules/delivery/business/delivery-business.policy';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { reverseFinanceMonthlyMatches } from 'src/modules/delivery/finance/delivery-finance-reconciliation.hooks';
import {
  lockAndAssertFinancePeriodsOpen,
  readFinancePeriod,
} from 'src/modules/delivery/finance/delivery-finance-period.helpers';
import { DeliveryFinancePeriodEntity } from 'src/modules/delivery/finance/entities/delivery-finance-period.entity';
import {
  lockFinanceAiSource,
  projectFinanceAiCostOrigin,
  releaseFinanceAiClaim,
} from 'src/modules/delivery/finance/delivery-finance-ai-cost.hooks';
import { DeliveryFinancePlanEntity } from 'src/modules/delivery/finance/entities/delivery-finance-plan.entity';
import { DeliveryFinanceEntryEntity } from 'src/modules/delivery/finance/entities/delivery-finance-entry.entity';
import { DeliveryFinanceAllocationEntity } from 'src/modules/delivery/finance/entities/delivery-finance-allocation.entity';
import { DeliveryFinanceEventEntity } from 'src/modules/delivery/finance/entities/delivery-finance-event.entity';
import {
  DELIVERY_FINANCE_PAGE_SIZE,
  DELIVERY_FINANCE_HISTORY_PAGE_SIZE,
  deliveryFinanceQuerySchema,
  deliveryFinancePlanSchema,
  deliveryFinanceEntrySchema,
  deliveryFinancePrepareSchema,
  deliveryFinancePostSchema,
  deliveryFinanceVoidSchema,
  deliveryFinanceHistorySchema,
  financeAllocationTotal,
  financeDueDate,
  parseDeliveryFinance,
} from 'src/modules/delivery/finance/delivery-finance.policy';
import {
  type DeliveryFinanceEntryDTO,
  type DeliveryFinancePlanDTO,
  type DeliveryFinanceSnapshotDTO,
  type DeliveryFinanceSummaryDTO,
  type DeliveryFinanceHistoryDTO,
  type DeliveryFinancePreparationDTO,
} from 'src/modules/delivery/finance/delivery-finance.dto';

type FinanceMember = { memberId: string; name: string };
type FinanceAllocation = {
  projectId: string | null;
  projectName: string | null;
  amountMicros: string;
};

@Injectable()
export class DeliveryFinanceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
  ) {}

  private async lock(manager: EntityManager, key: string, shared = false) {
    await manager.query(
      `SELECT ${shared ? 'pg_advisory_xact_lock_shared' : 'pg_advisory_xact_lock'}(hashtextextended($1,0))`,
      [key],
    );
  }

  private async authorize(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manage = false,
    exclusive = false,
  ) {
    await this.lock(manager, `delivery:${workspace.id}`, !exclusive);
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (manage ? !canManageFinance(actor) : !canReadFinance(actor))
      throw new ForbiddenException(
        'Your current roles do not allow this finance action.',
      );
    return actor;
  }

  private planDTO(
    plan: DeliveryFinancePlanEntity,
    members: FinanceMember[],
  ): DeliveryFinancePlanDTO {
    return {
      id: plan.id,
      revision: plan.revision,
      type: plan.type,
      name: plan.name,
      currency: plan.currency,
      monthlyAmountMicros: plan.monthlyAmountMicros,
      memberId: plan.memberId,
      memberName: plan.memberName,
      memberActive: plan.memberId
        ? members.some((member) => member.memberId === plan.memberId)
        : null,
      startMonth: plan.startMonth,
      endMonth: plan.endMonth,
      dueDay: plan.dueDay,
      active: plan.active,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    };
  }

  private sourceReview(
    entry: DeliveryFinanceEntryEntity,
    plans: DeliveryFinancePlanEntity[],
    members: FinanceMember[],
  ) {
    if (entry.sourceType !== 'PLAN' || !entry.sourcePlan)
      return { sourceWarnings: [], sourceReviewToken: null };
    const plan = plans.find(
      (candidate) => candidate.id === entry.sourcePlan?.planId,
    );
    const memberActive = entry.sourcePlan.memberId
      ? members.some((member) => member.memberId === entry.sourcePlan?.memberId)
      : null;
    const sourceWarnings = [
      ...(!plan ? ['SOURCE_PLAN_MISSING'] : []),
      ...(plan && plan.revision !== entry.sourcePlan.revision
        ? ['SOURCE_PLAN_CHANGED']
        : []),
      ...(plan && !plan.active ? ['SOURCE_PLAN_INACTIVE'] : []),
      ...(memberActive === false ? ['SOURCE_MEMBER_INACTIVE'] : []),
    ];
    const sourceReviewToken = createHash('sha256')
      .update(
        JSON.stringify([
          entry.workspaceId,
          entry.id,
          entry.revision,
          entry.sourcePlan,
          plan
            ? {
                revision: plan.revision,
                active: plan.active,
                memberId: plan.memberId,
              }
            : null,
          memberActive,
        ]),
      )
      .digest('hex');
    return { sourceWarnings, sourceReviewToken };
  }

  private entryDTO(
    entry: DeliveryFinanceEntryEntity,
    allocations: FinanceAllocation[],
    plans: DeliveryFinancePlanEntity[],
    members: FinanceMember[],
    lockedMonths: string[],
  ): DeliveryFinanceEntryDTO {
    return {
      lockedMonths,
      id: entry.id,
      revision: entry.revision,
      month: entry.month,
      kind: entry.kind,
      category: entry.category,
      title: entry.title,
      currency: entry.currency,
      amountMicros: entry.amountMicros,
      note: entry.note,
      evidenceUrl: entry.evidenceUrl,
      status: entry.status,
      sourceType: entry.sourceType,
      sourceAiSpend: projectFinanceAiCostOrigin(entry.sourceAiSpend),
      sourcePlan: entry.sourcePlan,
      ...this.sourceReview(entry, plans, members),
      dueDate: entry.dueDate,
      remainingAllocationMicros: (
        BigInt(entry.amountMicros) - financeAllocationTotal(allocations)
      ).toString(),
      allocations,
      createdBy: entry.createdBy,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      postedAt: entry.postedAt?.toISOString() ?? null,
      voidedAt: entry.voidedAt?.toISOString() ?? null,
      voidReason: entry.voidReason,
    };
  }

  entrySnapshot(
    entry: DeliveryFinanceEntryEntity,
    allocations: FinanceAllocation[],
  ): Record<string, unknown> {
    return {
      id: entry.id,
      revision: entry.revision,
      month: entry.month,
      kind: entry.kind,
      category: entry.category,
      title: entry.title,
      currency: entry.currency,
      amountMicros: entry.amountMicros,
      note: entry.note,
      evidenceUrl: entry.evidenceUrl,
      status: entry.status,
      sourceType: entry.sourceType,
      sourceAiSpend: projectFinanceAiCostOrigin(entry.sourceAiSpend),
      sourcePlan: entry.sourcePlan,
      allocations: allocations.map(
        ({ projectId, projectName, amountMicros }) => ({
          projectId,
          projectName,
          amountMicros,
        }),
      ),
      dueDate: entry.dueDate,
      postedAt: entry.postedAt?.toISOString() ?? null,
      postedBy: entry.postedBy,
      voidedAt: entry.voidedAt?.toISOString() ?? null,
      voidedBy: entry.voidedBy,
      voidReason: entry.voidReason,
    };
  }

  private planSnapshot(
    plan: DeliveryFinancePlanEntity,
  ): Record<string, unknown> {
    return {
      id: plan.id,
      revision: plan.revision,
      type: plan.type,
      name: plan.name,
      currency: plan.currency,
      monthlyAmountMicros: plan.monthlyAmountMicros,
      memberId: plan.memberId,
      memberName: plan.memberName,
      startMonth: plan.startMonth,
      endMonth: plan.endMonth,
      dueDay: plan.dueDay,
      active: plan.active,
    };
  }

  async event(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    actorId: string,
    members: FinanceMember[],
    sourceType: 'PLAN' | 'ENTRY',
    sourceId: string,
    revision: number,
    action: string,
    reason: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
    subjectMemberId: string | null = null,
  ) {
    const repository = manager.getRepository(DeliveryFinanceEventEntity);
    await repository.save(
      repository.create({
        workspaceId: workspace.id,
        sourceType,
        sourceId,
        actorId,
        actorName:
          members.find((member) => member.memberId === actorId)?.name ||
          'Former team member',
        action,
        revision,
        reason,
        before,
        after,
      }),
    );
    await recordOtogrowActivity(manager, {
      workspaceId: workspace.id,
      actorId,
      subjectMemberId,
      category: 'BUSINESS',
      action,
      outcome: 'RECORDED',
      summary:
        sourceType === 'PLAN'
          ? 'Updated a monthly finance cost plan.'
          : action === 'FINANCE_ENTRY_POSTED' ||
              action === 'FINANCE_AI_COST_POSTED'
            ? 'Posted a reviewed monthly finance entry.'
            : action === 'FINANCE_ENTRY_VOIDED'
              ? 'Voided a monthly finance entry with a reason.'
              : 'Saved a monthly finance draft.',
      sourceType: sourceType === 'PLAN' ? 'finance-plan' : 'finance-entry',
      sourceId,
      changes: [
        {
          field: 'revision',
          before: before ? String(before.revision) : null,
          after: String(revision),
        },
        ...(sourceType === 'ENTRY'
          ? [
              {
                field: 'state',
                before: before ? String(before.status) : null,
                after: String(after.status),
              },
              {
                field: 'financeMonth',
                before: before ? String(before.month) : null,
                after: String(after.month),
              },
              {
                field: 'financeCategory',
                before: before ? String(before.category) : null,
                after: String(after.category),
              },
              {
                field: 'allocationCount',
                before:
                  before && Array.isArray(before.allocations)
                    ? String(before.allocations.length)
                    : null,
                after: Array.isArray(after.allocations)
                  ? String(after.allocations.length)
                  : null,
              },
            ]
          : [
              {
                field: 'financePlanType',
                before: before ? String(before.type) : null,
                after: String(after.type),
              },
            ]),
      ],
    });
  }

  async allocationRows(
    manager: EntityManager,
    workspaceId: string,
    entryId: string,
  ) {
    return manager
      .getRepository(DeliveryFinanceAllocationEntity)
      .find({ where: { workspaceId, entryId }, order: { bucket: 'ASC' } });
  }

  async validatedAllocations(
    manager: EntityManager,
    workspaceId: string,
    allocations: { projectId: string | null; amountMicros: string }[],
    amountMicros: string,
  ) {
    const total = financeAllocationTotal(allocations);
    if (total > BigInt(amountMicros))
      throw new BadRequestException('Allocations exceed the entry amount.');
    const projectIds = allocations.flatMap((allocation) =>
      allocation.projectId ? [allocation.projectId] : [],
    );
    const projects = projectIds.length
      ? await manager
          .getRepository(DeliveryProjectEntity)
          .findBy({ workspaceId, id: In(projectIds) })
      : [];
    if (projects.length !== projectIds.length)
      throw new NotFoundException(
        'An allocation project is no longer available in this workspace.',
      );
    return allocations.map((allocation) => ({
      ...allocation,
      projectName: allocation.projectId
        ? projects.find((project) => project.id === allocation.projectId)!.name
        : null,
    }));
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceSnapshotDTO> {
    const query = parseDeliveryFinance(deliveryFinanceQuerySchema, input);
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
      );
      await this.lock(
        manager,
        `finance-period:${workspace.id}:${query.month}`,
        true,
      );
      const entryRepository = manager.getRepository(DeliveryFinanceEntryEntity);
      let selectedEntry = query.selectedEntryId
        ? await entryRepository.findOneBy({
            workspaceId: workspace.id,
            id: query.selectedEntryId,
          })
        : null;
      if (selectedEntry && selectedEntry.month !== query.month) {
        await this.lock(
          manager,
          `finance-period:${workspace.id}:${selectedEntry.month}`,
          true,
        );
        selectedEntry = await entryRepository.findOneBy({
          workspaceId: workspace.id,
          id: selectedEntry.id,
        });
      }
      const planRepository = manager.getRepository(DeliveryFinancePlanEntity);
      const selectedPlan = query.selectedPlanId
        ? await planRepository.findOneBy({
            workspaceId: workspace.id,
            id: query.selectedPlanId,
          })
        : null;
      const members = await this.access.listActiveMembers(
        workspace.id,
        manager,
      );
      const projects = await manager.getRepository(DeliveryProjectEntity).find({
        where: { workspaceId: workspace.id },
        order: { name: 'ASC', id: 'ASC' },
      });
      const currencyFilter = query.currency ? { currency: query.currency } : {};
      const plans = await planRepository.find({
        where: {
          workspaceId: workspace.id,
          ...currencyFilter,
          ...(query.afterPlanId ? { id: MoreThan(query.afterPlanId) } : {}),
        },
        order: { id: 'ASC' },
        take: DELIVERY_FINANCE_PAGE_SIZE + 1,
      });
      const entries = await entryRepository.find({
        where: {
          workspaceId: workspace.id,
          month: query.month,
          ...currencyFilter,
          ...(query.afterEntryId ? { id: MoreThan(query.afterEntryId) } : {}),
        },
        order: { id: 'ASC' },
        take: DELIVERY_FINANCE_PAGE_SIZE + 1,
      });
      const visiblePlans = plans.slice(0, DELIVERY_FINANCE_PAGE_SIZE);
      const visibleEntries = entries.slice(0, DELIVERY_FINANCE_PAGE_SIZE);
      const entryIds = [
        ...new Set([
          ...visibleEntries.map((entry) => entry.id),
          ...(selectedEntry ? [selectedEntry.id] : []),
        ]),
      ];
      const allocations = entryIds.length
        ? await manager
            .getRepository(DeliveryFinanceAllocationEntity)
            .findBy({ workspaceId: workspace.id, entryId: In(entryIds) })
        : [];
      const sourcePlanIds = [
        ...new Set(
          [
            ...visibleEntries,
            ...(selectedEntry ? [selectedEntry] : []),
          ].flatMap((entry) => (entry.planId ? [entry.planId] : [])),
        ),
      ];
      const sourcePlans = sourcePlanIds.length
        ? await planRepository.findBy({
            workspaceId: workspace.id,
            id: In(sourcePlanIds),
          })
        : [];
      const summaryRows: Omit<
        DeliveryFinanceSummaryDTO,
        | 'resultMicros'
        | 'projects'
        | 'unassignedRevenueMicros'
        | 'unassignedCostMicros'
      >[] = await manager.query(
        `SELECT currency, COALESCE(sum(CASE WHEN status='POSTED' AND kind='REVENUE' THEN "amountMicros" ELSE 0 END),0)::text AS "revenueMicros", COALESCE(sum(CASE WHEN status='POSTED' AND kind='COST' THEN "amountMicros" ELSE 0 END),0)::text AS "costMicros", count(*) FILTER (WHERE status='DRAFT')::int AS "draftCount", count(*) FILTER (WHERE status='POSTED')::int AS "postedCount", count(*) FILTER (WHERE status='VOID')::int AS "voidCount" FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND month=$2 AND ($3::text IS NULL OR currency=$3) GROUP BY currency ORDER BY currency`,
        [workspace.id, query.month, query.currency],
      );
      const projectRows: {
        currency: string;
        projectId: string | null;
        projectName: string | null;
        revenueMicros: string;
        costMicros: string;
      }[] = await manager.query(
        `SELECT entry.currency, allocation."projectId", COALESCE(project.name, max(allocation."projectName")) AS "projectName", COALESCE(sum(CASE WHEN entry.kind='REVENUE' THEN allocation."amountMicros" ELSE 0 END),0)::text AS "revenueMicros", COALESCE(sum(CASE WHEN entry.kind='COST' THEN allocation."amountMicros" ELSE 0 END),0)::text AS "costMicros" FROM core."deliveryFinanceAllocation" allocation JOIN core."deliveryFinanceEntry" entry ON entry.id=allocation."entryId" AND entry."workspaceId"=allocation."workspaceId" LEFT JOIN core."deliveryProject" project ON project.id=allocation."projectId" AND project."workspaceId"=allocation."workspaceId" WHERE entry."workspaceId"=$1 AND entry.month=$2 AND entry.status='POSTED' AND ($3::text IS NULL OR entry.currency=$3) GROUP BY entry.currency, allocation."projectId", project.name ORDER BY entry.currency, allocation."projectId" NULLS LAST`,
        [workspace.id, query.month, query.currency],
      );
      const summaries = summaryRows.map((row) => {
        const projectResults = projectRows
          .filter((project) => project.currency === row.currency)
          .map(({ currency: _currency, ...project }) => ({
            ...project,
            resultMicros: (
              BigInt(project.revenueMicros) - BigInt(project.costMicros)
            ).toString(),
          }));
        const unassigned = projectResults.find(
          (project) => project.projectId === null,
        );
        return {
          ...row,
          resultMicros: (
            BigInt(row.revenueMicros) - BigInt(row.costMicros)
          ).toString(),
          unassignedRevenueMicros: unassigned?.revenueMicros ?? '0',
          unassignedCostMicros: unassigned?.costMicros ?? '0',
          projects: projectResults,
        };
      });
      const displayedEntries = [
        ...visibleEntries,
        ...(selectedEntry ? [selectedEntry] : []),
      ];
      const replacedEntryIds = [
        ...new Set(
          displayedEntries.flatMap((entry) =>
            entry.sourceAiSpend?.replacesEntryId
              ? [entry.sourceAiSpend.replacesEntryId]
              : [],
          ),
        ),
      ];
      const replacedEntries = replacedEntryIds.length
        ? await entryRepository.findBy({
            workspaceId: workspace.id,
            id: In(replacedEntryIds),
          })
        : [];
      const entryMonths = (entry: DeliveryFinanceEntryEntity) => [
        ...new Set([
          entry.month,
          ...replacedEntries
            .filter(
              (previous) =>
                previous.id === entry.sourceAiSpend?.replacesEntryId,
            )
            .map((previous) => previous.month),
        ]),
      ];
      const displayedMonths = [
        ...new Set([query.month, ...displayedEntries.flatMap(entryMonths)]),
      ];
      const periodRows = await manager
        .getRepository(DeliveryFinancePeriodEntity)
        .findBy({ workspaceId: workspace.id, month: In(displayedMonths) });
      const lockedMonthSet = new Set(
        periodRows
          .filter((period) => period.status === 'LOCKED')
          .map((period) => period.month),
      );
      const toEntryDTO = (entry: DeliveryFinanceEntryEntity) =>
        this.entryDTO(
          entry,
          allocations.filter((allocation) => allocation.entryId === entry.id),
          sourcePlans,
          members,
          entryMonths(entry).filter((month) => lockedMonthSet.has(month)),
        );
      return {
        period: await readFinancePeriod(manager, workspace.id, query.month),
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        month: query.month,
        currency: query.currency,
        canManage: canManageFinance(actor),
        plans: visiblePlans.map((plan) => this.planDTO(plan, members)),
        entries: visibleEntries.map(toEntryDTO),
        selectedPlan: selectedPlan ? this.planDTO(selectedPlan, members) : null,
        selectedEntry: selectedEntry ? toEntryDTO(selectedEntry) : null,
        planTotal: await planRepository.countBy({
          workspaceId: workspace.id,
          ...currencyFilter,
        }),
        entryTotal: await entryRepository.countBy({
          workspaceId: workspace.id,
          month: query.month,
          ...currencyFilter,
        }),
        nextPlanId:
          plans.length > DELIVERY_FINANCE_PAGE_SIZE
            ? visiblePlans[visiblePlans.length - 1].id
            : null,
        nextEntryId:
          entries.length > DELIVERY_FINANCE_PAGE_SIZE
            ? visibleEntries[visibleEntries.length - 1].id
            : null,
        summaries,
        projects: projects.map(({ id, name }) => ({ id, name })),
        members: members.map(({ memberId: id, name }) => ({ id, name })),
      };
    });
  }

  async savePlan(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const fields = parseDeliveryFinance(deliveryFinancePlanSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      await this.lock(manager, `finance-plan:${workspace.id}:${fields.id}`);
      const repository = manager.getRepository(DeliveryFinancePlanEntity);
      const existing = await repository.findOneBy({ id: fields.id });
      if (existing && existing.workspaceId !== workspace.id)
        throw new NotFoundException('Cost plan is not available.');
      if (
        existing &&
        fields.revision === 0 &&
        existing.revision === 1 &&
        existing.createdBy === memberId &&
        (
          [
            'type',
            'name',
            'currency',
            'monthlyAmountMicros',
            'memberId',
            'startMonth',
            'endMonth',
            'dueDay',
            'active',
          ] as const
        ).every((key) => existing[key] === fields[key])
      )
        return existing.id;
      if ((existing?.revision ?? 0) !== fields.revision)
        throw new ConflictException(
          'This cost plan changed. Refresh it before saving.',
        );
      const members = await this.access.listActiveMembers(
        workspace.id,
        manager,
      );
      const selectedMember = members.find(
        (member) => member.memberId === fields.memberId,
      );
      if (
        fields.memberId &&
        !selectedMember &&
        !(existing?.memberId === fields.memberId && !fields.active)
      )
        throw new BadRequestException(
          'Choose an active employee, or pause the existing plan for the departed employee.',
        );
      if (fields.type === 'SALARY' && fields.active && !fields.memberId)
        throw new BadRequestException(
          'Choose the employee for an active salary plan.',
        );
      const before = existing ? this.planSnapshot(existing) : null;
      const plan = await repository.save(
        repository.create({
          ...fields,
          workspaceId: workspace.id,
          revision: fields.revision + 1,
          memberName: fields.memberId
            ? (selectedMember?.name ??
              existing?.memberName ??
              'Former team member')
            : null,
          createdBy: existing?.createdBy ?? memberId,
          ...(existing ? { createdAt: existing.createdAt } : {}),
        }),
      );
      await this.event(
        manager,
        workspace,
        memberId,
        members,
        'PLAN',
        plan.id,
        plan.revision,
        'FINANCE_PLAN_SAVED',
        existing
          ? 'Cost plan revised; existing monthly entries are unchanged.'
          : 'Cost plan created.',
        before,
        this.planSnapshot(plan),
        plan.memberId,
      );
      return plan.id;
    });
  }

  async prepareMonth(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinancePreparationDTO> {
    const query = parseDeliveryFinance(deliveryFinancePrepareSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      await lockAndAssertFinancePeriodsOpen(manager, workspace.id, [
        query.month,
      ]);
      const planRepository = manager.getRepository(DeliveryFinancePlanEntity);
      const candidates = await planRepository
        .createQueryBuilder('plan')
        .where(
          'plan."workspaceId"=:workspaceId AND plan.active=true AND plan."startMonth"<=:month',
          { workspaceId: workspace.id, month: query.month },
        )
        .andWhere('(plan."endMonth" IS NULL OR plan."endMonth">=:month)', {
          month: query.month,
        })
        .andWhere('(:currency::text IS NULL OR plan.currency=:currency)', {
          currency: query.currency,
        })
        .andWhere('(:afterId::uuid IS NULL OR plan.id>:afterId)', {
          afterId: query.afterPlanId,
        })
        .orderBy('plan.id', 'ASC')
        .take(DELIVERY_FINANCE_PAGE_SIZE + 1)
        .getMany();
      const members = await this.access.listActiveMembers(
        workspace.id,
        manager,
      );
      const result: DeliveryFinancePreparationDTO = {
        createdCount: 0,
        existingCount: 0,
        skipped: [],
        nextPlanId:
          candidates.length > DELIVERY_FINANCE_PAGE_SIZE
            ? candidates[DELIVERY_FINANCE_PAGE_SIZE - 1].id
            : null,
      };
      for (const candidate of candidates.slice(0, DELIVERY_FINANCE_PAGE_SIZE)) {
        await this.lock(
          manager,
          `finance-plan:${workspace.id}:${candidate.id}`,
          true,
        );
        const plan = await planRepository.findOneByOrFail({
          workspaceId: workspace.id,
          id: candidate.id,
        });
        const repository = manager.getRepository(DeliveryFinanceEntryEntity);
        if (
          await repository.existsBy({
            workspaceId: workspace.id,
            planId: plan.id,
            month: query.month,
          })
        ) {
          result.existingCount++;
          continue;
        }
        if (
          !plan.active ||
          plan.startMonth > query.month ||
          (plan.endMonth && plan.endMonth < query.month) ||
          (query.currency && plan.currency !== query.currency)
        ) {
          result.skipped.push({
            planId: plan.id,
            reason: 'SOURCE_PLAN_CHANGED',
          });
          continue;
        }
        if (
          plan.memberId &&
          !members.some((member) => member.memberId === plan.memberId)
        ) {
          result.skipped.push({
            planId: plan.id,
            reason: 'SOURCE_MEMBER_INACTIVE',
          });
          continue;
        }
        const entry = await repository.save(
          repository.create({
            id: randomUUID(),
            workspaceId: workspace.id,
            revision: 1,
            month: query.month,
            kind: 'COST',
            category: plan.type,
            title: plan.name,
            currency: plan.currency,
            amountMicros: plan.monthlyAmountMicros,
            note: '',
            evidenceUrl: null,
            status: 'DRAFT',
            sourceType: 'PLAN',
            planId: plan.id,
            sourcePlan: {
              planId: plan.id,
              revision: plan.revision,
              type: plan.type,
              name: plan.name,
              memberId: plan.memberId,
              memberName: plan.memberName,
              monthlyAmountMicros: plan.monthlyAmountMicros,
              startMonth: plan.startMonth,
              endMonth: plan.endMonth,
              dueDay: plan.dueDay,
            },
            dueDate: financeDueDate(query.month, plan.dueDay),
            createdBy: memberId,
            postedBy: null,
            postedAt: null,
            voidedBy: null,
            voidedAt: null,
            voidReason: null,
          }),
        );
        await this.event(
          manager,
          workspace,
          memberId,
          members,
          'ENTRY',
          entry.id,
          entry.revision,
          'FINANCE_ENTRY_PREPARED',
          'Prepared once from the saved cost-plan version. Allocations require review.',
          null,
          this.entrySnapshot(entry, []),
          plan.memberId,
        );
        result.createdCount++;
      }
      return result;
    });
  }

  async saveEntry(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const fields = parseDeliveryFinance(deliveryFinanceEntrySchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      await lockAndAssertFinancePeriodsOpen(manager, workspace.id, [
        fields.month,
      ]);
      await this.lock(manager, `finance-entry:${workspace.id}:${fields.id}`);
      const repository = manager.getRepository(DeliveryFinanceEntryEntity);
      const existing = await repository.findOneBy({ id: fields.id });
      if (existing && existing.workspaceId !== workspace.id)
        throw new NotFoundException('Monthly entry is not available.');
      if (
        existing &&
        fields.revision === 0 &&
        existing.revision === 1 &&
        existing.createdBy === memberId &&
        existing.sourceType === 'MANUAL' &&
        existing.status === 'DRAFT' &&
        (
          [
            'month',
            'kind',
            'category',
            'title',
            'currency',
            'amountMicros',
            'note',
            'evidenceUrl',
          ] as const
        ).every((key) => existing[key] === fields[key])
      ) {
        const originalAllocations = await this.allocationRows(
          manager,
          workspace.id,
          existing.id,
        );
        const signature = (
          allocations: { projectId: string | null; amountMicros: string }[],
        ) =>
          JSON.stringify(
            allocations
              .map(({ projectId, amountMicros }) => ({
                projectId,
                amountMicros,
              }))
              .sort((left, right) =>
                (left.projectId ?? '').localeCompare(right.projectId ?? ''),
              ),
          );
        if (signature(originalAllocations) === signature(fields.allocations))
          return existing.id;
      }
      if ((existing?.revision ?? 0) !== fields.revision)
        throw new ConflictException(
          'This monthly entry changed. Refresh it before saving.',
        );
      if (existing && existing.status !== 'DRAFT')
        throw new ConflictException(
          'Posted and voided entries are immutable. Void and add a correction instead.',
        );
      if (existing && existing.month !== fields.month)
        throw new BadRequestException(
          'A monthly entry keeps its original month. Void this draft and create one in the correct month.',
        );
      if (existing && existing.currency !== fields.currency)
        throw new BadRequestException(
          'A monthly entry keeps its original currency. Void this draft and create one in the correct currency.',
        );
      if (
        existing?.sourceType === 'PLAN' &&
        (fields.kind !== existing.kind ||
          fields.category !== existing.category ||
          fields.currency !== existing.currency)
      )
        throw new BadRequestException(
          'A plan draft retains its original cost category and currency. Add a separate correction if needed.',
        );
      if (
        existing?.sourceType === 'AI_SPEND' &&
        (!existing.sourceAiSpend ||
          fields.kind !== 'COST' ||
          fields.category !== existing.category ||
          fields.currency !== 'USD' ||
          fields.amountMicros !== existing.sourceAiSpend.amountMicros)
      )
        throw new BadRequestException(
          'An AI cost retains its exact selected source amount, category and USD currency. Prepare a reviewed replacement to change its source.',
        );
      if (
        existing?.sourcePlan &&
        fields.amountMicros !== existing.sourcePlan.monthlyAmountMicros &&
        !fields.note
      )
        throw new BadRequestException(
          'Explain the amount override in the entry note. Salaries are not prorated automatically.',
        );
      const allocations = await this.validatedAllocations(
        manager,
        workspace.id,
        fields.allocations,
        fields.amountMicros,
      );
      const oldAllocations = existing
        ? await this.allocationRows(manager, workspace.id, existing.id)
        : [];
      const before = existing
        ? this.entrySnapshot(existing, oldAllocations)
        : null;
      const { allocations: _allocations, ...entryFields } = fields;
      const entry = await repository.save(
        repository.create({
          ...entryFields,
          workspaceId: workspace.id,
          revision: fields.revision + 1,
          status: 'DRAFT',
          sourceType: existing?.sourceType ?? 'MANUAL',
          planId: existing?.planId ?? null,
          sourcePlan: existing?.sourcePlan ?? null,
          sourceAiSpend: existing?.sourceAiSpend ?? null,
          dueDate: existing?.dueDate ?? null,
          createdBy: existing?.createdBy ?? memberId,
          createdAt: existing?.createdAt,
          postedBy: null,
          postedAt: null,
          voidedBy: null,
          voidedAt: null,
          voidReason: null,
        }),
      );
      const allocationRepository = manager.getRepository(
        DeliveryFinanceAllocationEntity,
      );
      await allocationRepository.delete({
        workspaceId: workspace.id,
        entryId: entry.id,
      });
      if (allocations.length)
        await allocationRepository.insert(
          allocations.map((allocation) => ({
            ...allocation,
            workspaceId: workspace.id,
            entryId: entry.id,
            bucket: allocation.projectId ?? 'COMPANY',
          })),
        );
      const members = await this.access.listActiveMembers(
        workspace.id,
        manager,
      );
      await this.event(
        manager,
        workspace,
        memberId,
        members,
        'ENTRY',
        entry.id,
        entry.revision,
        'FINANCE_ENTRY_SAVED',
        existing ? 'Monthly draft revised.' : 'Manual monthly draft created.',
        before,
        this.entrySnapshot(entry, allocations),
        entry.sourcePlan?.memberId ?? null,
      );
      return entry.id;
    });
  }

  private async lockedEntry(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    id: string,
    revision: number,
  ) {
    const repository = manager.getRepository(DeliveryFinanceEntryEntity);
    const initial = await repository.findOneBy({
      workspaceId: workspace.id,
      id,
    });
    if (!initial)
      throw new NotFoundException('Monthly entry is not available.');
    await lockAndAssertFinancePeriodsOpen(manager, workspace.id, [
      initial.month,
    ]);
    await this.lock(manager, `finance-entry:${workspace.id}:${id}`);
    const entry = await repository.findOneByOrFail({
      workspaceId: workspace.id,
      id,
    });
    if (entry.revision !== revision)
      throw new ConflictException(
        'This monthly entry changed. Refresh it before continuing.',
      );
    return entry;
  }

  async postEntry(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const fields = parseDeliveryFinance(deliveryFinancePostSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      const entry = await this.lockedEntry(
        manager,
        workspace,
        fields.id,
        fields.revision,
      );
      if (entry.sourceType === 'AI_SPEND')
        throw new BadRequestException(
          'Use the reviewed AI cost posting action for this entry.',
        );
      if (entry.status !== 'DRAFT')
        throw new ConflictException('Only a draft can be posted.');
      const allocations = await this.allocationRows(
        manager,
        workspace.id,
        entry.id,
      );
      await this.validatedAllocations(
        manager,
        workspace.id,
        allocations,
        entry.amountMicros,
      );
      if (financeAllocationTotal(allocations) !== BigInt(entry.amountMicros))
        throw new BadRequestException(
          'Allocate the full entry amount explicitly before posting.',
        );
      const members = await this.access.listActiveMembers(
        workspace.id,
        manager,
      );
      let sourceWarnings: string[] = [];
      if (entry.sourceType === 'PLAN') {
        if (!entry.sourcePlan || !entry.planId)
          throw new BadRequestException(
            'This plan source is incomplete. Keep the draft for investigation.',
          );
        await this.lock(
          manager,
          `finance-plan:${workspace.id}:${entry.planId}`,
          true,
        );
        const plan = await manager
          .getRepository(DeliveryFinancePlanEntity)
          .findOneBy({ workspaceId: workspace.id, id: entry.planId });
        const review = this.sourceReview(entry, plan ? [plan] : [], members);
        sourceWarnings = review.sourceWarnings;
        if (fields.expectedSourceReviewToken !== review.sourceReviewToken)
          throw new ConflictException(
            'The source plan or employee state changed. Refresh and review the source before posting.',
          );
        if (sourceWarnings.length && !fields.acknowledgeSourceWarnings)
          throw new BadRequestException(
            'Review and acknowledge the changed or inactive source before posting this historical obligation.',
          );
      } else if (!entry.note && !entry.evidenceUrl) {
        throw new BadRequestException(
          'Add a source note or evidence link before posting manual revenue or cost.',
        );
      }
      const before = this.entrySnapshot(entry, allocations);
      entry.status = 'POSTED';
      entry.postedAt = new Date();
      entry.postedBy = memberId;
      entry.revision++;
      await manager.getRepository(DeliveryFinanceEntryEntity).save(entry);
      await this.event(
        manager,
        workspace,
        memberId,
        members,
        'ENTRY',
        entry.id,
        entry.revision,
        'FINANCE_ENTRY_POSTED',
        sourceWarnings.length
          ? `Reviewed source warnings: ${sourceWarnings.join(', ')}.`
          : 'Reviewed source and exact allocations.',
        before,
        this.entrySnapshot(entry, allocations),
        entry.sourcePlan?.memberId ?? null,
      );
      return entry.id;
    });
  }

  async voidEntry(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const fields = parseDeliveryFinance(deliveryFinanceVoidSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        true,
        true,
      );
      const initial = await manager
        .getRepository(DeliveryFinanceEntryEntity)
        .findOneBy({ workspaceId: workspace.id, id: fields.id });
      if (initial?.sourceType === 'AI_SPEND' && initial.sourceAiSpend)
        await lockFinanceAiSource(
          manager,
          workspace.id,
          initial.sourceAiSpend.spendId,
        );
      const entry = await this.lockedEntry(
        manager,
        workspace,
        fields.id,
        fields.revision,
      );
      if (entry.status === 'VOID')
        throw new ConflictException('This entry has already been voided.');
      await releaseFinanceAiClaim(manager, workspace.id, entry);
      const allocations = await this.allocationRows(
        manager,
        workspace.id,
        entry.id,
      );
      const before = this.entrySnapshot(entry, allocations);
      const members = await this.access.listActiveMembers(
        workspace.id,
        manager,
      );
      await reverseFinanceMonthlyMatches(
        manager,
        workspace.id,
        entry.id,
        memberId,
        members.find((member) => member.memberId === memberId)?.name ??
          'Team member',
        fields.reason,
      );
      entry.status = 'VOID';
      entry.voidReason = fields.reason;
      entry.voidedBy = memberId;
      entry.voidedAt = new Date();
      entry.revision++;
      await manager.getRepository(DeliveryFinanceEntryEntity).save(entry);
      await this.event(
        manager,
        workspace,
        memberId,
        members,
        'ENTRY',
        entry.id,
        entry.revision,
        'FINANCE_ENTRY_VOIDED',
        fields.reason,
        before,
        this.entrySnapshot(entry, allocations),
        entry.sourcePlan?.memberId ?? null,
      );
      return entry.id;
    });
  }

  async history(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceHistoryDTO> {
    const query = parseDeliveryFinance(deliveryFinanceHistorySchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId);
      const entry = await manager
        .getRepository(DeliveryFinanceEntryEntity)
        .findOneBy({ workspaceId: workspace.id, id: query.entryId });
      if (!entry)
        throw new NotFoundException('Monthly entry is not available.');
      await this.lock(
        manager,
        `finance-period:${workspace.id}:${entry.month}`,
        true,
      );
      if (
        query.beforeId &&
        !(await manager.getRepository(DeliveryFinanceEventEntity).existsBy({
          workspaceId: workspace.id,
          id: query.beforeId,
          sourceType: 'ENTRY',
          sourceId: query.entryId,
        }))
      )
        throw new BadRequestException(
          'The finance history cursor is not valid for this entry.',
        );
      const rows = await manager
        .getRepository(DeliveryFinanceEventEntity)
        .createQueryBuilder('event')
        .where(
          'event."workspaceId"=:workspaceId AND event."sourceType"=:sourceType AND event."sourceId"=:entryId',
          {
            workspaceId: workspace.id,
            sourceType: 'ENTRY',
            entryId: query.entryId,
          },
        )
        .andWhere(
          '(:beforeId::uuid IS NULL OR (event."createdAt", event.id)<(SELECT cursor."createdAt",cursor.id FROM core."deliveryFinanceEvent" cursor WHERE cursor."workspaceId"=:workspaceId AND cursor.id=:beforeId))',
          { beforeId: query.beforeId, workspaceId: workspace.id },
        )
        .orderBy('event."createdAt"', 'DESC')
        .addOrderBy('event.id', 'DESC')
        .take(DELIVERY_FINANCE_HISTORY_PAGE_SIZE + 1)
        .getMany();
      const visible = rows.slice(0, DELIVERY_FINANCE_HISTORY_PAGE_SIZE);
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        entryId: entry.id,
        events: visible.map((row) => ({
          id: row.id,
          actorId: row.actorId,
          actorName: row.actorName,
          action: row.action,
          revision: row.revision,
          reason: row.reason,
          createdAt: row.createdAt.toISOString(),
          beforeAmountMicros:
            typeof row.before?.amountMicros === 'string'
              ? row.before.amountMicros
              : null,
          afterAmountMicros:
            typeof row.after.amountMicros === 'string'
              ? row.after.amountMicros
              : null,
          beforeStatus:
            typeof row.before?.status === 'string' ? row.before.status : null,
          afterStatus:
            typeof row.after.status === 'string' ? row.after.status : null,
        })),
        nextBeforeId:
          rows.length > DELIVERY_FINANCE_HISTORY_PAGE_SIZE
            ? visible[visible.length - 1].id
            : null,
      };
    });
  }
}
