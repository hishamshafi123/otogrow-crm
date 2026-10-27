import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, MoreThan, type EntityManager } from 'typeorm';
import { z } from 'zod';
import { isValidUuid } from 'twenty-shared/utils';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import {
  canManageFinance,
  canReadFinance,
} from 'src/modules/delivery/business/delivery-business.policy';
import { DeliveryFinanceForecastAnchorEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-anchor.entity';
import { DeliveryFinanceForecastItemEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-item.entity';
import { DeliveryFinanceForecastRealizationEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-realization.entity';
import { DeliveryFinancePlanEntity } from 'src/modules/delivery/finance/entities/delivery-finance-plan.entity';
import { DeliveryFinanceSourceEntity } from 'src/modules/delivery/finance/entities/delivery-finance-source.entity';
import { DeliveryFinanceEventEntity } from 'src/modules/delivery/finance/entities/delivery-finance-event.entity';
import {
  DELIVERY_FINANCE_HISTORY_PAGE_SIZE,
  DELIVERY_FINANCE_PAGE_SIZE,
  deliveryFinanceAmountSchema,
  deliveryFinanceMonthSchema,
  parseDeliveryFinance,
} from 'src/modules/delivery/finance/delivery-finance.policy';
import {
  financeCashSourceMatches,
  financeReviewToken,
  type FinanceCashSnapshot,
} from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import {
  financeForecastAnchorSchema,
  financeForecastBusinessDate,
  financeForecastHistorySchema,
  financeForecastItemSchema,
  financeForecastQuerySchema,
  financeForecastRealizeSchema,
  financeForecastReverseSchema,
  financeForecastSourcesSchema,
} from 'src/modules/delivery/finance/delivery-finance-forecast.policy';
import { calculateFinanceForecast } from 'src/modules/delivery/finance/delivery-finance-forecast.projection';
import {
  financeForecastEvent,
  reverseFinanceForecastRealization,
} from 'src/modules/delivery/finance/delivery-finance-forecast.hooks';
import {
  forecastAmountTotal,
  forecastAnchorDTO,
  forecastCashSource,
  forecastItemDTO,
  forecastPlanSnapshot,
  forecastPlanSource,
  forecastRealizationDTO,
  forecastReceivableSource,
  readFinanceForecastState,
} from 'src/modules/delivery/finance/read-delivery-finance-forecast';
import {
  type DeliveryFinanceForecastAnchorResultDTO,
  type DeliveryFinanceForecastExceptionDTO,
  type DeliveryFinanceForecastHistoryDTO,
  type DeliveryFinanceForecastItemResultDTO,
  type DeliveryFinanceForecastOwnerDTO,
  type DeliveryFinanceForecastRealizationResultDTO,
  type DeliveryFinanceForecastSnapshotDTO,
  type DeliveryFinanceForecastSourceDTO,
  type DeliveryFinanceForecastSourcesDTO,
} from 'src/modules/delivery/finance/delivery-finance-forecast.dto';

@Injectable()
export class DeliveryFinanceForecastService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
  ) {}

  private async authorize(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manage = false,
  ) {
    // Actual cash shares the legacy Operations document; acquire its lock before source and forecast locks.
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
  private async owners(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<DeliveryFinanceForecastOwnerDTO[]> {
    const members = await this.access.listActiveMembers(workspaceId, manager);
    const access = await this.access.listAccess(workspaceId, manager);
    return members
      .filter((member) => {
        const current = access.find(
          (candidate) => candidate.memberId === member.memberId,
        );
        return (
          current &&
          (current.nativeAdministrator ||
            current.capabilities.some((capability) =>
              ['workspace.admin', 'finance.read', 'finance.manage'].includes(
                capability,
              ),
            ))
        );
      })
      .map((member) => ({ id: member.memberId, name: member.name }));
  }
  private async actorName(
    manager: EntityManager,
    workspaceId: string,
    memberId: string,
  ) {
    return (
      (await this.access.listActiveMembers(workspaceId, manager)).find(
        (member) => member.memberId === memberId,
      )?.name ?? 'Team member'
    );
  }
  private async state(
    manager: EntityManager,
    workspaceId: string,
    currency: string,
  ) {
    return readFinanceForecastState(
      manager,
      workspaceId,
      currency,
      await this.owners(manager, workspaceId),
    );
  }
  private async lock(
    manager: EntityManager,
    workspaceId: string,
    sourceIds: string[],
    itemIds: string[],
  ) {
    for (const key of [...new Set(sourceIds)].sort())
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery-finance-source:${workspaceId}:${key}`],
      );
    for (const key of [...new Set(itemIds)].sort())
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery-finance-forecast-item:${workspaceId}:${key}`],
      );
  }
  private async previousCommand(
    manager: EntityManager,
    workspaceId: string,
    commandId: string,
    memberId: string,
    requestHash: string,
  ) {
    const [event]: DeliveryFinanceEventEntity[] = await manager.query(
      'SELECT * FROM core."deliveryFinanceEvent" WHERE "workspaceId"=$1 AND "sourceType" IN (\'FORECAST_ANCHOR\',\'FORECAST_ITEM\',\'FORECAST_REALIZATION\') AND "after"->>\'commandId\'=$2 ORDER BY id LIMIT 1',
      [workspaceId, commandId],
    );
    if (
      event &&
      (event.actorId !== memberId || event.after.requestHash !== requestHash)
    )
      throw new ConflictException(
        'This forecast command identity was already used for another change.',
      );
    return event ?? null;
  }
  private async storeSource(
    manager: EntityManager,
    workspaceId: string,
    actorId: string,
    snapshot: FinanceCashSnapshot,
    kind: 'CASH' | 'RECEIVABLE',
  ) {
    const repository = manager.getRepository(DeliveryFinanceSourceEntity);
    const existing = await repository.findOneBy({ id: snapshot.id });
    if (existing) {
      if (
        existing.workspaceId !== workspaceId ||
        existing.kind !== kind ||
        (kind === 'CASH' &&
          !financeCashSourceMatches(existing.snapshot, snapshot))
      )
        throw new ConflictException(
          'This cash source changed or is not available in this workspace.',
        );
      return;
    }
    await repository.save(
      repository.create({
        id: snapshot.id,
        workspaceId,
        kind,
        currency: snapshot.currency,
        amountMicros: snapshot.amountMicros,
        snapshot,
        requestHash: null,
        createdBy: actorId,
      }),
    );
  }
  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceForecastSnapshotDTO> {
    const fields = parseDeliveryFinance(financeForecastQuerySchema, input);
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
      );
      const state = await this.state(manager, workspace.id, fields.currency);
      const items = state.items.map((item) => forecastItemDTO(item, state));
      if (
        fields.afterItemId &&
        !items.some((item) => item.id === fields.afterItemId)
      )
        throw new BadRequestException(
          'This forecast page cursor is not valid for the selected currency.',
        );
      const selectedItem = fields.selectedItemId
        ? (items.find((item) => item.id === fields.selectedItemId) ?? null)
        : null;
      if (fields.selectedItemId && !selectedItem)
        throw new NotFoundException(
          'This forecast item is not available for the selected currency.',
        );
      const paged = items.filter(
        (item) => !fields.afterItemId || item.id > fields.afterItemId,
      );
      const exceptions: DeliveryFinanceForecastExceptionDTO[] = [];
      const addException = (
        code: string,
        sourceId: string | null,
        title: string | null,
        date: string | null,
        amountMicros: string | null,
        itemId: string | null = null,
        sourceType: string | null = null,
      ) =>
        exceptions.push({
          key: `${code}:${itemId ?? sourceId ?? 'UNKNOWN'}`,
          code,
          sourceType:
            sourceType ??
            (state.cashData.receivables.some(
              (source) => source.snapshot.id === sourceId,
            )
              ? 'RECEIVABLE'
              : state.cashData.cash.some(
                    (source) => source.snapshot.id === sourceId,
                  )
                ? 'CASH'
                : null),
          sourceId,
          title,
          date,
          amountMicros,
          itemId,
        });
      for (const anomaly of state.cashData.anomalies)
        addException(
          anomaly.code,
          anomaly.id,
          anomaly.title,
          anomaly.date,
          anomaly.amountMicros,
          null,
          anomaly.sourceType,
        );
      let knownUnscheduledInflow = BigInt(0);
      let knownUnscheduledOutflow = BigInt(0);
      let unknownCollectionCount = 0;
      for (const source of state.cashData.receivables) {
        if (source.snapshot.status === 'VOID') continue;
        const active = items.find(
          (item) =>
            item.status === 'ACTIVE' &&
            item.sourceType === 'RECEIVABLE' &&
            item.sourceId === source.snapshot.id,
        );
        if (active) continue;
        if (source.outstandingMicros === null) {
          unknownCollectionCount++;
          addException(
            'UNKNOWN_COLLECTION',
            source.snapshot.id,
            source.snapshot.title,
            source.snapshot.dueDate,
            null,
          );
        } else if (
          BigInt(source.outstandingMicros) > BigInt(0) &&
          source.snapshot.status !== 'VOID'
        ) {
          knownUnscheduledInflow += BigInt(source.outstandingMicros);
          addException(
            'UNSCHEDULED_COLLECTION',
            source.snapshot.id,
            source.snapshot.title,
            source.snapshot.dueDate,
            source.outstandingMicros,
          );
        }
      }
      for (const item of items.filter(
        (candidate) => candidate.status === 'ACTIVE',
      )) {
        for (const warning of item.warnings)
          addException(
            warning,
            item.sourceId,
            item.title,
            item.expectedDate,
            item.remainingMicros,
            item.id,
          );
        if (!item.eligible && item.remainingMicros !== null) {
          if (item.kind === 'COLLECTION')
            knownUnscheduledInflow += BigInt(item.remainingMicros);
          else knownUnscheduledOutflow += BigInt(item.remainingMicros);
        }
        if (item.kind === 'COLLECTION' && item.remainingMicros === null)
          unknownCollectionCount++;
      }
      let unappliedActualOutflow = BigInt(0);
      for (const cash of state.cashData.cash) {
        const source = cash.snapshot;
        if (
          source.status !== 'VOID' &&
          state.anchor &&
          source.date <= state.anchor.closingDate &&
          cash.createdAt &&
          cash.createdAt > state.anchor.changedAt.toISOString()
        )
          addException(
            'BACKDATED_CASH_COVERED_BY_ANCHOR',
            source.id,
            source.title,
            source.date,
            source.amountMicros,
          );
        if (
          !cash.eligible ||
          !['EXPENSE', 'SALARY'].includes(source.category) ||
          !state.businessDate ||
          source.date > state.businessDate ||
          (state.anchor && source.date <= state.anchor.closingDate)
        )
          continue;
        const unapplied =
          BigInt(source.amountMicros) -
          forecastAmountTotal(
            state.totals.filter((row) => row.cashId === source.id),
          );
        if (unapplied > BigInt(0)) {
          unappliedActualOutflow += unapplied;
          addException(
            'UNAPPLIED_ACTUAL_OUTFLOW',
            source.id,
            source.title,
            source.date,
            unapplied.toString(),
          );
        }
      }
      exceptions.sort((left, right) =>
        left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
      );
      const uniqueExceptions = [
        ...new Map(
          exceptions.map((exception) => [exception.key, exception]),
        ).values(),
      ];
      if (
        fields.afterExceptionKey &&
        !uniqueExceptions.some(
          (exception) => exception.key === fields.afterExceptionKey,
        )
      )
        throw new BadRequestException(
          'This exception page changed. Return to the first page.',
        );
      const exceptionPage = uniqueExceptions.filter(
        (exception) =>
          !fields.afterExceptionKey || exception.key > fields.afterExceptionKey,
      );
      const projection =
        state.anchor && state.businessDate
          ? calculateFinanceForecast({
              anchorMicros: state.anchor.amountMicros,
              anchorClosingDate: state.anchor.closingDate,
              businessDate: state.businessDate,
              horizonDays: fields.horizonDays,
              actualMovements: state.cashData.cash
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
              expectedMovements: items
                .filter(
                  (item) =>
                    item.eligible &&
                    item.expectedDate !== null &&
                    item.remainingMicros !== null,
                )
                .map((item) => ({
                  id: item.id,
                  date: item.expectedDate as string,
                  kind: item.kind === 'COLLECTION' ? 'INFLOW' : 'OUTFLOW',
                  amountMicros: item.remainingMicros as string,
                })),
            })
          : null;
      const realizations = await this.realizations(
        manager,
        workspace.id,
        selectedItem?.id ?? null,
        fields.afterRealizationId,
      );
      const warnings = [
        ...new Set([
          ...(state.anchor ? [] : ['ANCHOR_NOT_SET']),
          ...uniqueExceptions.map((exception) => exception.code),
        ]),
      ];
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        canManage: canManageFinance(actor),
        currency: fields.currency,
        horizonDays: fields.horizonDays,
        businessDate: state.businessDate,
        timezone: state.anchor?.timezone ?? null,
        anchor: state.anchor ? forecastAnchorDTO(state.anchor) : null,
        actualInflowMicros: projection?.actualInflowMicros ?? null,
        actualOutflowMicros: projection?.actualOutflowMicros ?? null,
        currentCashMicros: projection?.currentCashMicros ?? null,
        expectedInflowMicros: projection?.expectedInflowMicros ?? null,
        expectedOutflowMicros: projection?.expectedOutflowMicros ?? null,
        endingCashMicros: projection?.endingCashMicros ?? null,
        firstNegativeDate: projection?.firstNegativeDate ?? null,
        timeline: projection?.timeline ?? [],
        knownUnscheduledInflowMicros: knownUnscheduledInflow.toString(),
        knownUnscheduledOutflowMicros: knownUnscheduledOutflow.toString(),
        unknownCollectionCount,
        unappliedActualOutflowMicros: unappliedActualOutflow.toString(),
        projectionComplete:
          state.anchor !== null &&
          uniqueExceptions.every(
            (exception) =>
              exception.code === 'BACKDATED_CASH_COVERED_BY_ANCHOR' ||
              (['PLAN_INACTIVE', 'PLAN_OUTSIDE_MONTH'].includes(
                exception.code,
              ) &&
                items.some(
                  (item) => item.id === exception.itemId && item.eligible,
                )),
          ),
        warnings,
        owners: state.owners,
        items: paged.slice(0, DELIVERY_FINANCE_PAGE_SIZE),
        itemCount: items.length,
        nextItemId:
          paged.length > DELIVERY_FINANCE_PAGE_SIZE
            ? paged[DELIVERY_FINANCE_PAGE_SIZE - 1].id
            : null,
        selectedItem,
        ...realizations,
        exceptions: exceptionPage.slice(0, DELIVERY_FINANCE_PAGE_SIZE),
        exceptionCount: uniqueExceptions.length,
        nextExceptionKey:
          exceptionPage.length > DELIVERY_FINANCE_PAGE_SIZE
            ? exceptionPage[DELIVERY_FINANCE_PAGE_SIZE - 1].key
            : null,
      };
    });
  }
  private async realizations(
    manager: EntityManager,
    workspaceId: string,
    itemId: string | null,
    afterId: string | null,
  ) {
    const repository = manager.getRepository(
      DeliveryFinanceForecastRealizationEntity,
    );
    if (
      afterId &&
      (!itemId ||
        !(await repository.existsBy({ workspaceId, itemId, id: afterId })))
    )
      throw new BadRequestException(
        'This realization cursor is not valid for the selected forecast item.',
      );
    const rows = itemId
      ? await repository.find({
          where: {
            workspaceId,
            itemId,
            ...(afterId ? { id: MoreThan(afterId) } : {}),
          },
          order: { id: 'ASC' },
          take: DELIVERY_FINANCE_PAGE_SIZE + 1,
        })
      : [];
    return {
      realizations: rows
        .slice(0, DELIVERY_FINANCE_PAGE_SIZE)
        .map(forecastRealizationDTO),
      nextRealizationId:
        rows.length > DELIVERY_FINANCE_PAGE_SIZE
          ? rows[DELIVERY_FINANCE_PAGE_SIZE - 1].id
          : null,
    };
  }
  async sources(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceForecastSourcesDTO> {
    const fields = parseDeliveryFinance(financeForecastSourcesSchema, input);
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
      );
      const state = await this.state(manager, workspace.id, fields.currency);
      let sources: DeliveryFinanceForecastSourceDTO[];
      let selectedSource: DeliveryFinanceForecastSourceDTO | null;
      if (fields.kind === 'PLAN') {
        const repository = manager.getRepository(DeliveryFinancePlanEntity);
        if (
          fields.afterId &&
          !(await repository.existsBy({
            workspaceId: workspace.id,
            currency: fields.currency,
            id: fields.afterId,
          }))
        )
          throw new BadRequestException(
            'This plan source cursor is not valid.',
          );
        const plans = await repository.find({
          where: {
            workspaceId: workspace.id,
            currency: fields.currency,
            ...(fields.afterId ? { id: MoreThan(fields.afterId) } : {}),
          },
          order: { id: 'ASC' },
          take: DELIVERY_FINANCE_PAGE_SIZE + 1,
        });
        const project = (plan: DeliveryFinancePlanEntity) =>
          forecastPlanSource(
            plan,
            fields.month as string,
            state.items.find(
              (item) =>
                item.planId === plan.id && item.planMonth === fields.month,
            )?.id ?? null,
          );
        sources = plans.map(project);
        const selected = fields.selectedId
          ? await repository.findOneBy({
              workspaceId: workspace.id,
              currency: fields.currency,
              id: fields.selectedId,
            })
          : null;
        selectedSource = selected ? project(selected) : null;
      } else {
        const sourceIds =
          fields.kind === 'CASH'
            ? state.cashData.cash
                .filter((cash) =>
                  ['EXPENSE', 'SALARY'].includes(cash.snapshot.category),
                )
                .map((cash) => cash.snapshot.id)
            : state.cashData.receivables.map((source) => source.snapshot.id);
        const project =
          fields.kind === 'CASH'
            ? forecastCashSource
            : forecastReceivableSource;
        if (fields.afterId && !sourceIds.includes(fields.afterId))
          throw new BadRequestException(
            'This financial source cursor is not valid.',
          );
        sources = sourceIds
          .sort()
          .filter((id) => !fields.afterId || id > fields.afterId)
          .slice(0, DELIVERY_FINANCE_PAGE_SIZE + 1)
          .flatMap((id) => {
            const source = project(state, id);
            return source ? [source] : [];
          });
        selectedSource = fields.selectedId
          ? project(state, fields.selectedId)
          : null;
      }
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        canManage: canManageFinance(actor),
        currency: fields.currency,
        kind: fields.kind,
        sources: sources.slice(0, DELIVERY_FINANCE_PAGE_SIZE),
        nextId:
          sources.length > DELIVERY_FINANCE_PAGE_SIZE
            ? sources[DELIVERY_FINANCE_PAGE_SIZE - 1].id
            : null,
        selectedSource,
      };
    });
  }
  async saveAnchor(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceForecastAnchorResultDTO> {
    const fields = parseDeliveryFinance(financeForecastAnchorSchema, input);
    const requestHash = financeReviewToken(fields);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      const previous = await this.previousCommand(
        manager,
        workspace.id,
        fields.id,
        memberId,
        requestHash,
      );
      const repository = manager.getRepository(
        DeliveryFinanceForecastAnchorEntity,
      );
      const existing = await repository.findOneBy({
        workspaceId: workspace.id,
        currency: fields.currency,
      });
      if (previous && existing)
        return { anchor: forecastAnchorDTO(existing), replayed: true };
      if (previous)
        throw new ConflictException(
          'This reviewed starting cash is no longer available. Its original command cannot recreate it.',
        );
      if (fields.closingDate >= financeForecastBusinessDate(fields.timezone))
        throw new BadRequestException(
          'Starting cash must close through a completed date before today in the reporting timezone.',
        );
      if ((existing?.revision ?? 0) !== fields.revision)
        throw new ConflictException(
          'This starting cash changed. Refresh it before reviewing another balance.',
        );
      const actorName = await this.actorName(manager, workspace.id, memberId);
      const saved = await repository.save(
        repository.create({
          ...(existing ? { id: existing.id } : {}),
          workspaceId: workspace.id,
          currency: fields.currency,
          amountMicros: fields.amountMicros,
          closingDate: fields.closingDate,
          timezone: fields.timezone,
          revision: fields.revision + 1,
          note: fields.note,
          evidenceUrl: fields.evidenceUrl,
          changedBy: memberId,
          changedByName: actorName,
        }),
      );
      await financeForecastEvent(
        manager,
        workspace.id,
        memberId,
        actorName,
        'FORECAST_ANCHOR',
        saved.id,
        saved.revision,
        'FINANCE_FORECAST_ANCHOR_REVIEWED',
        fields.reason,
        existing ? { ...forecastAnchorDTO(existing) } : null,
        {
          ...forecastAnchorDTO(saved),
          commandId: fields.id,
          requestHash,
          acknowledgeCoverage: true,
        },
      );
      return { anchor: forecastAnchorDTO(saved), replayed: false };
    });
  }
  async saveItem(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceForecastItemResultDTO> {
    const fields = parseDeliveryFinance(financeForecastItemSchema, input);
    const requestHash = financeReviewToken(fields);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      await this.lock(
        manager,
        workspace.id,
        fields.sourceId ? [fields.sourceId] : [],
        [fields.id],
      );
      const previous = await this.previousCommand(
        manager,
        workspace.id,
        fields.commandId,
        memberId,
        requestHash,
      );
      const repository = manager.getRepository(
        DeliveryFinanceForecastItemEntity,
      );
      const existing = await repository.findOneBy({ id: fields.id });
      if (existing && existing.workspaceId !== workspace.id)
        throw new ConflictException('This forecast identity is not available.');
      const state = await this.state(manager, workspace.id, fields.currency);
      if (previous && existing)
        return { item: forecastItemDTO(existing, state), replayed: true };
      if (previous)
        throw new ConflictException(
          'This expectation is no longer available. Its original command cannot recreate it.',
        );
      if ((existing?.revision ?? 0) !== fields.revision)
        throw new ConflictException(
          'This expectation changed. Refresh it before saving.',
        );
      if (
        existing &&
        (existing.currency !== fields.currency ||
          existing.sourceType !== fields.sourceType ||
          (existing.receivableId ?? existing.planId) !== fields.sourceId ||
          existing.planMonth !== fields.planMonth)
      )
        throw new BadRequestException(
          'An expectation keeps its original currency and invoice or plan-month identity. Cancel it and review the corrected source as a separate expectation.',
        );
      if (!existing && fields.status === 'CANCELLED')
        throw new BadRequestException(
          'Save an expectation before cancelling it.',
        );
      const actorName = await this.actorName(manager, workspace.id, memberId);
      let sourceToken: string | null = null;
      let sourceSnapshot: Record<string, unknown> | null = null;
      if (fields.status === 'ACTIVE') {
        if (!state.owners.some((owner) => owner.id === fields.ownerId))
          throw new BadRequestException(
            'Choose an active owner who can currently read finance.',
          );
        if (fields.sourceType === 'RECEIVABLE') {
          const source = forecastReceivableSource(
            state,
            fields.sourceId as string,
          );
          if (!source || !source.eligible || source.remainingMicros === null)
            throw new BadRequestException(
              'This invoice does not currently have a reliable dated remaining balance. Resolve its source warnings first.',
            );
          if (source.sourceReviewToken !== fields.expectedSourceReviewToken)
            throw new ConflictException(
              'This invoice changed. Review its current financial source before saving the schedule.',
            );
          if (source.remainingMicros !== fields.amountMicros)
            throw new ConflictException(
              'The outstanding balance changed. Refresh it and schedule the full current remaining amount.',
            );
          if (source.occurrenceItemId && source.occurrenceItemId !== fields.id)
            throw new ConflictException(
              'This invoice already has a forecast schedule. Open its existing expectation.',
            );
          sourceToken = source.sourceReviewToken;
          const snapshot = state.cashData.receivables.find(
            (row) => row.snapshot.id === fields.sourceId,
          )?.snapshot;
          if (!snapshot)
            throw new BadRequestException(
              'This invoice is no longer available.',
            );
          sourceSnapshot = { ...snapshot };
          await this.storeSource(
            manager,
            workspace.id,
            memberId,
            snapshot,
            'RECEIVABLE',
          );
        } else if (fields.sourceType === 'PLAN') {
          const plan = await manager
            .getRepository(DeliveryFinancePlanEntity)
            .findOneBy({
              workspaceId: workspace.id,
              id: fields.sourceId as string,
              currency: fields.currency,
            });
          if (!plan || !fields.planMonth)
            throw new BadRequestException(
              'This plan is not available for the selected currency and month.',
            );
          const source = forecastPlanSource(plan, fields.planMonth, null);
          if (!source.eligible && !existing)
            throw new BadRequestException(
              'Choose an active plan within its service months.',
            );
          if (source.warnings.length > 0 && !fields.acknowledgeSourceWarnings)
            throw new BadRequestException(
              'Acknowledge the current plan warnings before explicitly retaining this existing payable.',
            );
          if (source.sourceReviewToken !== fields.expectedSourceReviewToken)
            throw new ConflictException(
              'This plan changed. Review its current terms before confirming the occurrence.',
            );
          const occurrence = await repository.findOneBy({
            workspaceId: workspace.id,
            planId: plan.id,
            planMonth: fields.planMonth,
          });
          if (occurrence && occurrence.id !== fields.id)
            throw new ConflictException(
              'This plan-month already has a forecast occurrence. Open the existing expectation.',
            );
          sourceToken = source.sourceReviewToken;
          sourceSnapshot = {
            ...forecastPlanSnapshot(plan, fields.planMonth),
            acknowledgedWarnings: source.warnings,
          };
          if (!state.plans.some((candidate) => candidate.id === plan.id))
            state.plans.push(plan);
        }
        const applied = forecastAmountTotal(
          state.totals.filter((row) => row.itemId === fields.id),
        );
        if (BigInt(fields.amountMicros) < applied)
          throw new BadRequestException(
            'An expectation cannot be reduced below its active applied payments. Reverse an incorrect application first.',
          );
      }
      const saved = await repository.save(
        repository.create(
          existing && fields.status === 'CANCELLED'
            ? {
                ...existing,
                revision: existing.revision + 1,
                status: 'CANCELLED',
                changedBy: memberId,
                changedByName: actorName,
              }
            : {
                id: fields.id,
                workspaceId: workspace.id,
                revision: fields.revision + 1,
                status: fields.status,
                kind:
                  fields.sourceType === 'RECEIVABLE' ? 'COLLECTION' : 'OUTFLOW',
                sourceType: fields.sourceType,
                receivableId:
                  fields.sourceType === 'RECEIVABLE' ? fields.sourceId : null,
                planId: fields.sourceType === 'PLAN' ? fields.sourceId : null,
                planMonth: fields.planMonth,
                currency: fields.currency,
                title: fields.title,
                amountMicros: fields.amountMicros,
                expectedDate: fields.expectedDate,
                ownerId: fields.ownerId,
                ownerName:
                  state.owners.find((owner) => owner.id === fields.ownerId)
                    ?.name ?? '',
                nextActionDate: fields.nextActionDate,
                note: fields.note,
                sourceToken,
                sourceSnapshot,
                createdBy: existing?.createdBy ?? memberId,
                changedBy: memberId,
                changedByName: actorName,
              },
        ),
      );
      await financeForecastEvent(
        manager,
        workspace.id,
        memberId,
        actorName,
        'FORECAST_ITEM',
        saved.id,
        saved.revision,
        saved.status === 'CANCELLED'
          ? 'FINANCE_FORECAST_ITEM_CANCELLED'
          : 'FINANCE_FORECAST_ITEM_REVIEWED',
        fields.reason,
        existing ? { ...existing } : null,
        { ...saved, commandId: fields.commandId, requestHash },
      );
      return { item: forecastItemDTO(saved, state), replayed: false };
    });
  }
  async realize(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceForecastRealizationResultDTO> {
    const fields = parseDeliveryFinance(financeForecastRealizeSchema, input);
    const requestHash = financeReviewToken(fields);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      await this.lock(manager, workspace.id, [fields.cashId], [fields.itemId]);
      const previous = await this.previousCommand(
        manager,
        workspace.id,
        fields.id,
        memberId,
        requestHash,
      );
      const repository = manager.getRepository(
        DeliveryFinanceForecastRealizationEntity,
      );
      const existing = await repository.findOneBy({ id: fields.id });
      if (existing) {
        if (
          existing.workspaceId !== workspace.id ||
          existing.createdBy !== memberId ||
          existing.requestHash !== requestHash
        )
          throw new ConflictException(
            'This payment application identity was already used for another action.',
          );
        return {
          realization: forecastRealizationDTO(existing),
          replayed: true,
        };
      }
      if (previous)
        throw new ConflictException(
          'This command identity belongs to another reviewed forecast action.',
        );
      const item = await manager
        .getRepository(DeliveryFinanceForecastItemEntity)
        .findOneBy({ workspaceId: workspace.id, id: fields.itemId });
      if (!item || item.kind !== 'OUTFLOW' || item.status !== 'ACTIVE')
        throw new BadRequestException('Choose an active outgoing expectation.');
      const state = await this.state(manager, workspace.id, item.currency);
      const itemReview = forecastItemDTO(item, state);
      const cash = forecastCashSource(state, fields.cashId);
      if (!itemReview.ownerEligible)
        throw new BadRequestException(
          'Reassign this expectation to a current finance reader before applying a payment.',
        );
      if (
        !cash ||
        !cash.eligible ||
        cash.remainingMicros === null ||
        !state.businessDate
      )
        throw new BadRequestException(
          'Choose a valid actual expense or salary payment dated through today in this forecast currency.',
        );
      if (
        itemReview.reviewToken !== fields.expectedItemReviewToken ||
        cash.sourceReviewToken !== fields.expectedCashReviewToken
      )
        throw new ConflictException(
          'This expectation or payment application balance changed. Review both before continuing.',
        );
      if (
        item.sourceType !== 'MANUAL' &&
        item.sourceToken !== itemReview.sourceReviewToken
      )
        throw new ConflictException(
          'Review the changed plan source before applying a payment.',
        );
      if (
        itemReview.remainingMicros === null ||
        BigInt(fields.amountMicros) > BigInt(itemReview.remainingMicros) ||
        BigInt(fields.amountMicros) > BigInt(cash.remainingMicros)
      )
        throw new BadRequestException(
          'Apply no more than the available actual payment and remaining expected outflow.',
        );
      const source = state.cashData.cash.find(
        (row) => row.snapshot.id === fields.cashId,
      )?.snapshot;
      if (!source)
        throw new BadRequestException(
          'This actual payment is no longer available.',
        );
      await this.storeSource(manager, workspace.id, memberId, source, 'CASH');
      const actorName = await this.actorName(manager, workspace.id, memberId);
      const saved = await repository.save(
        repository.create({
          id: fields.id,
          workspaceId: workspace.id,
          revision: 1,
          cashId: source.id,
          cashTitle: source.title,
          targetTitle: item.title,
          itemId: item.id,
          currency: item.currency,
          amountMicros: fields.amountMicros,
          status: 'ACTIVE',
          projectId: source.projectId,
          projectName: source.projectName,
          requestHash,
          createdBy: memberId,
          createdByName: actorName,
          note: fields.note,
          reversedBy: null,
          reversedByName: null,
          reversedAt: null,
          reversalReason: null,
        }),
      );
      await financeForecastEvent(
        manager,
        workspace.id,
        memberId,
        actorName,
        'FORECAST_REALIZATION',
        saved.id,
        1,
        'FINANCE_FORECAST_REALIZATION_CREATED',
        fields.note,
        null,
        { ...saved, commandId: fields.id, requestHash, cashDate: source.date },
      );
      return { realization: forecastRealizationDTO(saved), replayed: false };
    });
  }
  async reverseRealization(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceForecastRealizationResultDTO> {
    const fields = parseDeliveryFinance(financeForecastReverseSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      const repository = manager.getRepository(
        DeliveryFinanceForecastRealizationEntity,
      );
      const row = await repository.findOneBy({
        workspaceId: workspace.id,
        id: fields.id,
      });
      if (!row)
        throw new NotFoundException(
          'This forecast payment application is not available.',
        );
      await this.lock(manager, workspace.id, [row.cashId], [row.itemId]);
      if (row.status === 'REVERSED') {
        if (
          row.revision === fields.revision + 1 &&
          row.reversedBy === memberId &&
          row.reversalReason === fields.reason
        )
          return { realization: forecastRealizationDTO(row), replayed: true };
        throw new ConflictException(
          'This application was already reversed. Refresh its current history.',
        );
      }
      if (row.revision !== fields.revision)
        throw new ConflictException(
          'This payment application changed. Refresh before reversing it.',
        );
      await reverseFinanceForecastRealization(
        manager,
        workspace.id,
        memberId,
        await this.actorName(manager, workspace.id, memberId),
        row,
        fields.reason,
      );
      return { realization: forecastRealizationDTO(row), replayed: false };
    });
  }
  async history(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceForecastHistoryDTO> {
    const fields = parseDeliveryFinance(financeForecastHistorySchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId);
      const sourceType = `FORECAST_${fields.sourceType}` as const;
      const repository = manager.getRepository(DeliveryFinanceEventEntity);
      if (
        fields.beforeId &&
        !(await repository.existsBy({
          workspaceId: workspace.id,
          sourceType,
          sourceId: fields.sourceId,
          id: fields.beforeId,
        }))
      )
        throw new BadRequestException(
          'This forecast history cursor is not valid for the selected source.',
        );
      const rows: DeliveryFinanceEventEntity[] = await manager.query(
        'SELECT * FROM core."deliveryFinanceEvent" event WHERE event."workspaceId"=$1 AND event."sourceType"=$2 AND event."sourceId"=$3 AND ($4::uuid IS NULL OR (event."createdAt",event.id)<(SELECT cursor."createdAt",cursor.id FROM core."deliveryFinanceEvent" cursor WHERE cursor."workspaceId"=$1 AND cursor."sourceType"=$2 AND cursor."sourceId"=$3 AND cursor.id=$4)) ORDER BY event."createdAt" DESC,event.id DESC LIMIT $5',
        [
          workspace.id,
          sourceType,
          fields.sourceId,
          fields.beforeId,
          DELIVERY_FINANCE_HISTORY_PAGE_SIZE + 1,
        ],
      );
      const text = (value: unknown) =>
        typeof value === 'string' ? value : null;
      const sourceContext = (row: DeliveryFinanceEventEntity) => {
        const realization = row.sourceType === 'FORECAST_REALIZATION';
        const sourceType =
          row.sourceType === 'FORECAST_ITEM' &&
          (row.after.sourceType === 'PLAN' ||
            row.after.sourceType === 'RECEIVABLE' ||
            row.after.sourceType === 'MANUAL')
            ? row.after.sourceType
            : realization
              ? 'CASH'
              : null;
        const identifier = (value: unknown) =>
          typeof value === 'string' && isValidUuid(value) ? value : null;
        const originSourceId =
          sourceType === 'PLAN'
            ? identifier(row.after.planId)
            : sourceType === 'RECEIVABLE'
              ? identifier(row.after.receivableId)
              : sourceType === 'CASH'
                ? identifier(row.after.cashId)
                : null;
        const snapshot = z
          .record(z.string(), z.unknown())
          .safeParse(row.after.sourceSnapshot);
        const sourceRevision = z
          .number()
          .int()
          .positive()
          .safeParse(snapshot.success ? snapshot.data.revision : null);
        const sourceAmount = deliveryFinanceAmountSchema.safeParse(
          snapshot.success ? snapshot.data.amountMicros : null,
        );
        const planMonth = deliveryFinanceMonthSchema.safeParse(
          row.after.planMonth,
        );
        const cashDate = z.iso.date().safeParse(row.after.cashDate);
        const reversedAt = z.iso
          .datetime({ offset: true })
          .safeParse(row.after.reversedAt);
        return {
          originSourceType: sourceType,
          originSourceId,
          planMonth:
            sourceType === 'PLAN' && planMonth.success ? planMonth.data : null,
          sourceRevision:
            (sourceType === 'PLAN' || sourceType === 'RECEIVABLE') &&
            sourceRevision.success
              ? sourceRevision.data
              : null,
          sourceAmountMicros:
            (sourceType === 'PLAN' || sourceType === 'RECEIVABLE') &&
            sourceAmount.success
              ? sourceAmount.data
              : null,
          cashId: realization ? identifier(row.after.cashId) : null,
          itemId: realization ? identifier(row.after.itemId) : null,
          cashDate: realization && cashDate.success ? cashDate.data : null,
          reversedAt:
            realization && reversedAt.success ? reversedAt.data : null,
        };
      };
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        events: rows
          .slice(0, DELIVERY_FINANCE_HISTORY_PAGE_SIZE)
          .map((row) => ({
            id: row.id,
            sourceType: fields.sourceType,
            sourceId: row.sourceId,
            action: row.action,
            revision: row.revision,
            actorId: row.actorId,
            actorName: row.actorName,
            createdAt: row.createdAt.toISOString(),
            reason: row.reason,
            beforeStatus: text(row.before?.status),
            afterStatus: text(row.after.status),
            currency: text(row.after.currency),
            amountMicros: text(row.after.amountMicros),
            date: text(row.after.closingDate ?? row.after.expectedDate),
            title: text(row.after.title ?? row.after.targetTitle),
            ownerName: text(row.after.ownerName),
            note: text(row.after.note),
            timezone: text(row.after.timezone),
            evidenceUrl: text(row.after.evidenceUrl),
            ...sourceContext(row),
          })),
        nextBeforeId:
          rows.length > DELIVERY_FINANCE_HISTORY_PAGE_SIZE
            ? rows[DELIVERY_FINANCE_HISTORY_PAGE_SIZE - 1].id
            : null,
      };
    });
  }
}
