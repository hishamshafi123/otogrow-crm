import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { DeliveryFinanceService } from 'src/modules/delivery/finance/delivery-finance.service';
import { DeliveryFinanceEntryEntity } from 'src/modules/delivery/finance/entities/delivery-finance-entry.entity';
import { DeliveryFinanceAllocationEntity } from 'src/modules/delivery/finance/entities/delivery-finance-allocation.entity';
import { DeliveryFinanceEventEntity } from 'src/modules/delivery/finance/entities/delivery-finance-event.entity';
import { DeliveryFinanceAiClaimEntity } from 'src/modules/delivery/finance/entities/delivery-finance-ai-claim.entity';
import { OtogrowAiSpendEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import {
  canManageFinance,
  canReadFinance,
} from 'src/modules/delivery/business/delivery-business.policy';
import {
  financeAiCostsQuerySchema,
  financeAiCostPrepareSchema,
  financeAiCostPostSchema,
  type FinanceAiCostOrigin,
} from 'src/modules/delivery/finance/delivery-finance-ai-cost.policy';
import {
  DELIVERY_FINANCE_PAGE_SIZE,
  financeAllocationTotal,
  parseDeliveryFinance,
} from 'src/modules/delivery/finance/delivery-finance.policy';
import { lockFinanceAiSource } from 'src/modules/delivery/finance/delivery-finance-ai-cost.hooks';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import {
  readFinanceAiSource,
  readFinanceAiEvidence,
  readFinanceAiEvidencePage,
} from 'src/modules/delivery/finance/read-delivery-finance-ai-cost';
import { reverseFinanceMonthlyMatches } from 'src/modules/delivery/finance/delivery-finance-reconciliation.hooks';
import { lockAndAssertFinancePeriodsOpen } from 'src/modules/delivery/finance/delivery-finance-period.helpers';
import {
  type DeliveryFinanceAiCostResultDTO,
  type DeliveryFinanceAiCostsSnapshotDTO,
} from 'src/modules/delivery/finance/delivery-finance-ai-cost.dto';

@Injectable()
export class DeliveryFinanceAiCostService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
    private readonly finance: DeliveryFinanceService,
  ) {}

  private async authorize(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manage = false,
  ) {
    // Cross-ledger writes must start exclusive; upgrading after a period lock can deadlock.
    await manager.query(
      `SELECT pg_advisory_xact_lock${manage ? '' : '_shared'}(hashtextextended($1,0))`,
      [`delivery:${workspace.id}`],
    );
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

  private async source(
    manager: EntityManager,
    workspaceId: string,
    id: string,
  ) {
    const spend = await manager
      .getRepository(OtogrowAiSpendEntity)
      .findOneBy({ workspaceId, id });
    if (!spend)
      throw new NotFoundException('This production AI charge is unavailable.');
    return readFinanceAiSource(manager, workspaceId, spend);
  }

  private async lockEntries(
    manager: EntityManager,
    workspaceId: string,
    months: string[],
    ids: string[],
  ) {
    await lockAndAssertFinancePeriodsOpen(manager, workspaceId, months);
    for (const id of [...new Set(ids)].sort())
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`finance-entry:${workspaceId}:${id}`],
      );
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceAiCostsSnapshotDTO> {
    const fields = parseDeliveryFinance(financeAiCostsQuerySchema, input);
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
      );
      const filter =
        fields.filter === 'UNRECOGNIZED'
          ? 'AND spend.state=\'SETTLED\' AND claim."currentEntryId" IS NULL'
          : fields.filter === 'RECOGNIZED'
            ? 'AND claim."currentEntryId" IS NOT NULL'
            : fields.filter === 'NEEDS_REVIEW'
              ? 'AND (claim."replacementEntryId" IS NOT NULL OR (spend.state=\'SETTLED\' AND (claim."currentEntryId" IS NULL OR claim."reviewedSpendRevision" IS NULL OR claim."reviewedSpendRevision"<spend.revision)))'
              : '';
      const selected = `FROM core."otogrowAiSpend" spend LEFT JOIN core."deliveryFinanceAiClaim" claim ON claim."workspaceId"=spend."workspaceId" AND claim."spendId"=spend.id WHERE spend."workspaceId"=$1 ${filter}`;
      if (fields.afterSpendId) {
        const [cursor]: { id: string }[] = await manager.query(
          `SELECT spend.id ${selected} AND spend.id=$2`,
          [workspace.id, fields.afterSpendId],
        );
        if (!cursor)
          throw new BadRequestException(
            'This AI cost cursor is not valid for the current filters.',
          );
      }
      const spends: OtogrowAiSpendEntity[] = await manager.query(
        `SELECT spend.* ${selected} AND ($2::uuid IS NULL OR spend.id>$2) ORDER BY spend.id LIMIT $3`,
        [workspace.id, fields.afterSpendId, DELIVERY_FINANCE_PAGE_SIZE + 1],
      );
      const visible = spends.slice(0, DELIVERY_FINANCE_PAGE_SIZE);
      const states = await Promise.all(
        visible.map((spend) =>
          readFinanceAiSource(manager, workspace.id, spend),
        ),
      );
      let selectedState = fields.selectedSpendId
        ? states.find((state) => state.spend.id === fields.selectedSpendId)
        : null;
      if (fields.selectedSpendId && !selectedState) {
        const spend = await manager
          .getRepository(OtogrowAiSpendEntity)
          .findOneBy({ workspaceId: workspace.id, id: fields.selectedSpendId });
        selectedState = spend
          ? await readFinanceAiSource(manager, workspace.id, spend)
          : null;
      }
      if (fields.afterEvidenceId && !selectedState)
        throw new BadRequestException('The selected AI charge is unavailable.');
      const selectedSource = selectedState
        ? {
            ...selectedState.source,
            ...(await readFinanceAiEvidencePage(
              manager,
              workspace.id,
              selectedState.spend.id,
              fields.afterEvidenceId,
            )),
          }
        : null;
      const projects = await manager.getRepository(DeliveryProjectEntity).find({
        where: { workspaceId: workspace.id },
        order: { name: 'ASC', id: 'ASC' },
      });
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        canManage: canManageFinance(actor),
        canReadBudget: actor.isAdmin,
        filter: fields.filter,
        sources: states.map((state) => state.source),
        selectedSource,
        nextSpendId:
          spends.length > DELIVERY_FINANCE_PAGE_SIZE
            ? visible[visible.length - 1].id
            : null,
        projects: projects.map(({ id, name }) => ({ id, name })),
      };
    });
  }

  async prepare(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceAiCostResultDTO> {
    const fields = parseDeliveryFinance(financeAiCostPrepareSchema, input);
    const requestHash = financeReviewToken(fields);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      const repository = manager.getRepository(DeliveryFinanceEntryEntity);
      const existing = await repository.findOneBy({ id: fields.id });
      if (existing) {
        if (
          existing.workspaceId === workspace.id &&
          existing.sourceType === 'AI_SPEND' &&
          existing.sourceAiSpend?.preparedBy === memberId &&
          existing.sourceAiSpend.requestHash === requestHash
        )
          return {
            entryId: existing.id,
            status: existing.status,
            replayed: true,
          };
        throw new ConflictException(
          'This finance request identity was already used.',
        );
      }
      await lockFinanceAiSource(manager, workspace.id, fields.spendId);
      const state = await this.source(manager, workspace.id, fields.spendId);
      if (!state.source.eligible)
        throw new BadRequestException(
          'Only an exactly recorded settled AI charge with settlement evidence can be recognized.',
        );
      if (
        state.source.sourceReviewToken !== fields.expectedSourceReviewToken ||
        (state.claim?.revision ?? 0) !== fields.expectedClaimRevision
      )
        throw new ConflictException(
          'This AI source or recognition changed. Refresh and review it before preparing a draft.',
        );
      if (
        state.source.sourceWarnings.length &&
        !fields.acknowledgeSourceWarnings
      )
        throw new BadRequestException(
          'Review and acknowledge the current AI source warnings.',
        );
      if (
        state.replacementEntry ||
        (state.currentEntry &&
          (!fields.replacesEntryId ||
            state.currentEntry.status !== 'POSTED' ||
            state.currentEntry.id !== fields.replacesEntryId ||
            state.currentEntry.revision !==
              fields.expectedReplacedEntryRevision)) ||
        (!state.currentEntry && fields.replacesEntryId)
      )
        throw new ConflictException(
          'This AI charge already has a current recognition or pending draft. Review its source chain before preparing another.',
        );
      const evidence = await readFinanceAiEvidence(
        manager,
        workspace.id,
        fields.spendId,
        fields.evidenceEventId,
      );
      if (!evidence)
        throw new BadRequestException(
          'Choose an available exact AI settlement or later evidence amount.',
        );
      await this.lockEntries(
        manager,
        workspace.id,
        [
          fields.month,
          ...(state.currentEntry ? [state.currentEntry.month] : []),
        ],
        [fields.id, ...(state.currentEntry ? [state.currentEntry.id] : [])],
      );
      const allocations = await this.finance.validatedAllocations(
        manager,
        workspace.id,
        fields.allocations,
        evidence.amountMicros,
      );
      const origin: FinanceAiCostOrigin = {
        spendId: state.spend.id,
        spendRevision: state.spend.revision,
        evidenceEventId: evidence.id,
        basis: evidence.basis,
        amountMicros: evidence.amountMicros,
        currency: 'USD',
        modelId: state.source.modelId,
        sourceKind: state.spend.sourceKind,
        sourceRunId: state.spend.sourceRunId,
        clientId: state.spend.clientId,
        taskId: state.spend.taskId,
        recordedAt: evidence.recordedAt,
        projectId: state.spend.projectId,
        projectName: state.source.projectName,
        replacesEntryId: fields.replacesEntryId,
        correctionReason: fields.correctionReason,
        replacedEntryRevision: fields.expectedReplacedEntryRevision,
        requestHash,
        preparedBy: memberId,
      };
      const entry = await repository.save(
        repository.create({
          id: fields.id,
          workspaceId: workspace.id,
          revision: 1,
          month: fields.month,
          kind: 'COST',
          category: 'OS production AI',
          title: fields.title,
          currency: 'USD',
          amountMicros: evidence.amountMicros,
          note: fields.note,
          evidenceUrl: null,
          status: 'DRAFT',
          sourceType: 'AI_SPEND',
          sourcePlan: null,
          planId: null,
          sourceAiSpend: origin,
          dueDate: null,
          createdBy: memberId,
          postedBy: null,
          postedAt: null,
          voidedBy: null,
          voidedAt: null,
          voidReason: null,
        }),
      );
      if (allocations.length)
        await manager.getRepository(DeliveryFinanceAllocationEntity).insert(
          allocations.map((allocation) => ({
            ...allocation,
            workspaceId: workspace.id,
            entryId: entry.id,
            bucket: allocation.projectId ?? 'COMPANY',
          })),
        );
      const claimRepository = manager.getRepository(
        DeliveryFinanceAiClaimEntity,
      );
      const claim =
        state.claim ??
        claimRepository.create({
          workspaceId: workspace.id,
          spendId: fields.spendId,
          revision: 0,
          reviewedSpendRevision: null,
          currentEntryId: null,
          replacementEntryId: null,
          createdBy: memberId,
        });
      if (state.currentEntry) claim.replacementEntryId = entry.id;
      else claim.currentEntryId = entry.id;
      claim.revision++;
      await claimRepository.save(claim);
      const members = await this.access.listActiveMembers(
        workspace.id,
        manager,
      );
      await this.finance.event(
        manager,
        workspace,
        memberId,
        members,
        'ENTRY',
        entry.id,
        entry.revision,
        'FINANCE_AI_COST_PREPARED',
        fields.correctionReason ??
          'Prepared an explicit AI cost draft from selected financial evidence.',
        null,
        this.finance.entrySnapshot(entry, allocations),
      );
      return { entryId: entry.id, status: entry.status, replayed: false };
    });
  }

  async post(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceAiCostResultDTO> {
    const fields = parseDeliveryFinance(financeAiCostPostSchema, input);
    const requestHash = financeReviewToken(fields);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      const repository = manager.getRepository(DeliveryFinanceEntryEntity);
      const entry = await repository.findOneBy({
        workspaceId: workspace.id,
        id: fields.id,
      });
      if (!entry || entry.sourceType !== 'AI_SPEND' || !entry.sourceAiSpend)
        throw new NotFoundException('This imported AI cost is unavailable.');
      const replay = await manager
        .getRepository(DeliveryFinanceEventEntity)
        .findOneBy({
          workspaceId: workspace.id,
          sourceType: 'ENTRY',
          sourceId: entry.id,
          actorId: memberId,
          action: 'FINANCE_AI_COST_POSTED',
          revision: fields.revision + 1,
        });
      if (replay?.after.requestHash === requestHash)
        return { entryId: entry.id, status: entry.status, replayed: true };
      await lockFinanceAiSource(
        manager,
        workspace.id,
        entry.sourceAiSpend.spendId,
      );
      const state = await this.source(
        manager,
        workspace.id,
        entry.sourceAiSpend.spendId,
      );
      if (
        entry.status !== 'DRAFT' ||
        entry.revision !== fields.revision ||
        !state.claim ||
        state.claim.revision !== fields.expectedClaimRevision ||
        state.source.sourceReviewToken !== fields.expectedSourceReviewToken
      )
        throw new ConflictException(
          'This AI draft, source or matching history changed. Refresh and review before posting.',
        );
      const evidence = await readFinanceAiEvidence(
        manager,
        workspace.id,
        state.spend.id,
        entry.sourceAiSpend.evidenceEventId,
      );
      if (
        !state.source.eligible ||
        !evidence ||
        evidence.amountMicros !== entry.sourceAiSpend.amountMicros ||
        evidence.basis !== entry.sourceAiSpend.basis ||
        evidence.recordedAt !== entry.sourceAiSpend.recordedAt
      )
        throw new BadRequestException(
          'This AI source evidence is unavailable. Keep the draft for review.',
        );
      if (
        state.source.sourceWarnings.length &&
        !fields.acknowledgeSourceWarnings
      )
        throw new BadRequestException(
          'Review and acknowledge the current AI source warnings.',
        );
      const replacing = entry.sourceAiSpend.replacesEntryId !== null;
      if (
        replacing
          ? state.claim.replacementEntryId !== entry.id ||
            state.currentEntry?.id !== entry.sourceAiSpend.replacesEntryId ||
            state.currentEntry.status !== 'POSTED' ||
            state.currentEntry.revision !==
              entry.sourceAiSpend.replacedEntryRevision ||
            !fields.acknowledgeReplacement ||
            !entry.sourceAiSpend.correctionReason
          : state.claim.currentEntryId !== entry.id ||
            state.claim.replacementEntryId !== null
      )
        throw new ConflictException(
          'Review the current recognition and explicitly acknowledge replacing its posted cost and reversing its cash matches.',
        );
      await this.lockEntries(
        manager,
        workspace.id,
        [
          entry.month,
          ...(replacing && state.currentEntry
            ? [state.currentEntry.month]
            : []),
        ],
        [
          entry.id,
          ...(replacing && state.currentEntry ? [state.currentEntry.id] : []),
        ],
      );
      const allocations = await this.finance.allocationRows(
        manager,
        workspace.id,
        entry.id,
      );
      await this.finance.validatedAllocations(
        manager,
        workspace.id,
        allocations,
        entry.amountMicros,
      );
      if (
        !allocations.length ||
        financeAllocationTotal(allocations) !== BigInt(entry.amountMicros)
      )
        throw new BadRequestException(
          'Allocate the exact AI cost to a project or company bucket before posting, including an explicit bucket for zero.',
        );
      if (
        entry.currency !== 'USD' ||
        entry.kind !== 'COST' ||
        entry.amountMicros !== entry.sourceAiSpend.amountMicros
      )
        throw new ConflictException(
          'This AI draft no longer matches its immutable source amount.',
        );
      const members = await this.access.listActiveMembers(
        workspace.id,
        manager,
      );
      if (replacing && state.currentEntry) {
        const previous = state.currentEntry;
        const previousAllocations = await this.finance.allocationRows(
          manager,
          workspace.id,
          previous.id,
        );
        const before = this.finance.entrySnapshot(
          previous,
          previousAllocations,
        );
        await reverseFinanceMonthlyMatches(
          manager,
          workspace.id,
          previous.id,
          memberId,
          members.find((member) => member.memberId === memberId)?.name ??
            'Team member',
          entry.sourceAiSpend.correctionReason!,
        );
        previous.status = 'VOID';
        previous.voidedBy = memberId;
        previous.voidedAt = new Date();
        previous.voidReason = entry.sourceAiSpend.correctionReason;
        previous.revision++;
        await repository.save(previous);
        await this.finance.event(
          manager,
          workspace,
          memberId,
          members,
          'ENTRY',
          previous.id,
          previous.revision,
          'FINANCE_ENTRY_VOIDED',
          previous.voidReason!,
          before,
          this.finance.entrySnapshot(previous, previousAllocations),
        );
      }
      const before = this.finance.entrySnapshot(entry, allocations);
      entry.status = 'POSTED';
      entry.postedBy = memberId;
      entry.postedAt = new Date();
      entry.revision++;
      await repository.save(entry);
      state.claim.currentEntryId = entry.id;
      state.claim.replacementEntryId = null;
      state.claim.revision++;
      state.claim.reviewedSpendRevision = state.spend.revision;
      await manager
        .getRepository(DeliveryFinanceAiClaimEntity)
        .save(state.claim);
      await this.finance.event(
        manager,
        workspace,
        memberId,
        members,
        'ENTRY',
        entry.id,
        entry.revision,
        'FINANCE_AI_COST_POSTED',
        entry.sourceAiSpend.correctionReason ??
          'Explicitly posted the selected AI financial evidence.',
        before,
        { ...this.finance.entrySnapshot(entry, allocations), requestHash },
      );
      return { entryId: entry.id, status: entry.status, replayed: false };
    });
  }
}
