import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, MoreThan, type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { newDeliveryOperations } from 'src/modules/delivery/operations/delivery-operations.types';
import {
  newDeliveryBusiness,
  type BusinessRecord,
} from 'src/modules/delivery/business/delivery-business.types';
import {
  canManageFinance,
  canReadFinance,
} from 'src/modules/delivery/business/delivery-business.policy';
import { DeliveryFinanceSourceEntity } from 'src/modules/delivery/finance/entities/delivery-finance-source.entity';
import { DeliveryFinanceSettlementEntity } from 'src/modules/delivery/finance/entities/delivery-finance-settlement.entity';
import { DeliveryFinanceCashMatchEntity } from 'src/modules/delivery/finance/entities/delivery-finance-cash-match.entity';
import { DeliveryFinanceEntryEntity } from 'src/modules/delivery/finance/entities/delivery-finance-entry.entity';
import { DeliveryFinanceAllocationEntity } from 'src/modules/delivery/finance/entities/delivery-finance-allocation.entity';
import { DeliveryFinanceEventEntity } from 'src/modules/delivery/finance/entities/delivery-finance-event.entity';
import {
  financeReportingClock,
  readFinanceReportingClocks,
  type FinanceReportingClocks,
} from 'src/modules/delivery/finance/delivery-finance-reporting-date';
import {
  DELIVERY_FINANCE_PAGE_SIZE,
  parseDeliveryFinance,
} from 'src/modules/delivery/finance/delivery-finance.policy';
import {
  financePaymentsQuerySchema,
  financePaymentSchema,
  financeSettlementSchema,
  financeCashMatchSchema,
  financeReverseRelationSchema,
  financeReviewToken,
  financeCashSnapshot,
  financeCashSourceMatches,
  type FinanceCashSnapshot,
} from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import {
  financeRelationEvent,
  reverseFinanceRelation,
  financeLegacyReceiptTarget,
} from 'src/modules/delivery/finance/delivery-finance-reconciliation.hooks';
import {
  type DeliveryFinanceCashSourceDTO,
  type DeliveryFinancePaymentsSnapshotDTO,
  type DeliveryFinanceMatchableEntryDTO,
  type DeliveryFinanceCashRelationDTO,
} from 'src/modules/delivery/finance/delivery-finance-reconciliation.dto';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

type CashRecord = Extract<BusinessRecord, { kind: 'FINANCE' }>;
type SettlementTotal = {
  cashId: string;
  receivableId: string;
  amount: string;
  version: string;
};
type MatchTotal = {
  cashId: string;
  entryId: string;
  bucket: string;
  amount: string;
  version: string;
};
type ReconciliationState = {
  operations: DeliveryOperationsEntity | null;
  records: BusinessRecord[];
  sources: FinanceCashSnapshot[];
  rejectedCashCount: number;
  projects: DeliveryProjectEntity[];
  settlements: SettlementTotal[];
  matches: MatchTotal[];
  storedSources: DeliveryFinanceSourceEntity[];
  reportingClocks: FinanceReportingClocks;
};
const ZERO = BigInt(0);
const sumAmounts = (rows: { amount: string }[]) =>
  rows.reduce((sum, row) => sum + BigInt(row.amount), ZERO);
const nonnegative = (value: bigint) => (value > ZERO ? value : ZERO).toString();

@Injectable()
export class DeliveryFinanceReconciliationService {
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
    // Cash lives in a shared legacy document: take its exclusive lock before any monthly-period lock.
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
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
  private async state(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<ReconciliationState> {
    const operations = await manager
      .getRepository(DeliveryOperationsEntity)
      .findOneBy({ workspaceId });
    const records = operations?.state.business?.records ?? [];
    const projects = await manager
      .getRepository(DeliveryProjectEntity)
      .findBy({ workspaceId });
    const sources = records
      .map((record) => financeCashSnapshot(record, projects))
      .filter((source) => source !== null);
    const rejectedCashCount =
      records.filter(
        (record) =>
          record.kind === 'FINANCE' && record.category !== 'OPENING_BALANCE',
      ).length - sources.length;
    const settlements: SettlementTotal[] = await manager.query(
      'SELECT "cashId","receivableId",SUM(CASE WHEN status=\'ACTIVE\' THEN "amountMicros" ELSE 0 END)::text AS amount, md5(string_agg(id::text||\':\'||revision::text,\',\' ORDER BY id)) AS version FROM core."deliveryFinanceSettlement" WHERE "workspaceId"=$1 GROUP BY "cashId","receivableId" ORDER BY "cashId","receivableId"',
      [workspaceId],
    );
    const matches: MatchTotal[] = await manager.query(
      'SELECT "cashId","entryId",bucket,SUM(CASE WHEN status=\'ACTIVE\' THEN "amountMicros" ELSE 0 END)::text AS amount, md5(string_agg(id::text||\':\'||revision::text,\',\' ORDER BY id)) AS version FROM core."deliveryFinanceCashMatch" WHERE "workspaceId"=$1 GROUP BY "cashId","entryId",bucket ORDER BY "cashId","entryId",bucket',
      [workspaceId],
    );
    const storedSources = sources.length
      ? await manager
          .getRepository(DeliveryFinanceSourceEntity)
          .findBy({ workspaceId, id: In(sources.map((source) => source.id)) })
      : [];
    const reportingClocks = await readFinanceReportingClocks(
      manager,
      workspaceId,
    );
    return {
      operations,
      records,
      sources,
      projects,
      rejectedCashCount,
      settlements,
      matches,
      storedSources,
      reportingClocks,
    };
  }
  private legacyReceipts(state: ReconciliationState, receivableId?: string) {
    return state.sources.filter((source) => {
      const record = state.records.find(
        (candidate) => candidate.id === source.id,
      );
      return (
        source.category === 'INCOME' &&
        source.status !== 'VOID' &&
        record?.kind === 'FINANCE' &&
        record.externalReference?.startsWith('receivable:') &&
        (!receivableId ||
          record.externalReference === `receivable:${receivableId}`)
      );
    });
  }
  private sourceDTO(
    source: FinanceCashSnapshot,
    state: ReconciliationState,
  ): DeliveryFinanceCashSourceDTO {
    const cashSettlements = state.settlements.filter(
      (row) => row.cashId === source.id,
    );
    const invoiceSettlements = state.settlements.filter(
      (row) => row.receivableId === source.id,
    );
    const matches = state.matches.filter((row) => row.cashId === source.id);
    const legacyCandidates = this.legacyReceipts(
      state,
      source.category === 'RECEIVABLE' ? source.id : undefined,
    ).filter(
      (receipt) => source.category === 'RECEIVABLE' || receipt.id === source.id,
    );
    const mismatchedLegacy = legacyCandidates.some((receipt) => {
      const record = state.records.find(
        (candidate) => candidate.id === receipt.id,
      );
      return !record || !financeLegacyReceiptTarget(state.records, record);
    });
    const legacy =
      source.category === 'RECEIVABLE'
        ? legacyCandidates.filter((receipt) => {
            const record = state.records.find(
              (candidate) => candidate.id === receipt.id,
            );
            return (
              record &&
              financeLegacyReceiptTarget(state.records, record)?.id ===
                source.id
            );
          })
        : legacyCandidates;
    const legacyAmount = legacy.reduce(
      (sum, receipt) => sum + BigInt(receipt.amountMicros),
      ZERO,
    );
    const unknownLegacyPaid =
      source.category === 'RECEIVABLE' &&
      source.status === 'PAID' &&
      !legacy.length;
    const settled =
      (source.category === 'RECEIVABLE'
        ? sumAmounts(invoiceSettlements)
        : sumAmounts(cashSettlements)) +
      (unknownLegacyPaid ? BigInt(source.amountMicros) : legacyAmount);
    const matched = sumAmounts(matches);
    const stored = state.storedSources.find((row) => row.id === source.id);
    const changed =
      stored && !financeCashSourceMatches(stored.snapshot, source);
    const sourceWarnings = [
      ...(source.projectId ? [] : ['UNASSIGNED_CASH']),
      ...(source.status === 'VOID' ? ['SOURCE_VOID'] : []),
      ...(source.date >
      financeReportingClock(state.reportingClocks, source.currency).businessDate
        ? ['FUTURE_CASH_DATE']
        : []),
      ...(changed ? ['SOURCE_CHANGED'] : []),
      ...(source.projectId &&
      !state.projects.some((project) => project.id === source.projectId)
        ? ['SOURCE_PROJECT_UNAVAILABLE']
        : []),
      ...(unknownLegacyPaid ? ['LEGACY_PAID_WITHOUT_RECEIPT'] : []),
      ...(mismatchedLegacy ? ['LEGACY_RECEIPT_MISMATCH'] : []),
      ...(settled > BigInt(source.amountMicros) ? ['OVER_SETTLED'] : []),
      ...(matched > BigInt(source.amountMicros) ? ['OVER_MATCHED'] : []),
    ];
    return {
      ...source,
      sourceWarnings,
      sourceReviewToken: financeReviewToken([
        source,
        cashSettlements,
        invoiceSettlements,
        matches,
        legacy,
        legacyCandidates,
        unknownLegacyPaid,
        sourceWarnings,
      ]),
      settledMicros: settled.toString(),
      remainingSettlementMicros:
        source.category === 'INCOME'
          ? nonnegative(BigInt(source.amountMicros) - settled)
          : '0',
      matchedMicros: matched.toString(),
      remainingMatchMicros:
        source.category !== 'RECEIVABLE'
          ? nonnegative(BigInt(source.amountMicros) - matched)
          : '0',
      outstandingMicros:
        source.category === 'RECEIVABLE'
          ? nonnegative(BigInt(source.amountMicros) - settled)
          : '0',
    };
  }
  private async entryDTO(
    manager: EntityManager,
    workspaceId: string,
    entry: DeliveryFinanceEntryEntity,
    state: ReconciliationState,
  ): Promise<DeliveryFinanceMatchableEntryDTO> {
    const allocations = await manager
      .getRepository(DeliveryFinanceAllocationEntity)
      .find({
        where: { workspaceId, entryId: entry.id },
        order: { bucket: 'ASC' },
      });
    const matches = state.matches.filter((row) => row.entryId === entry.id);
    return {
      id: entry.id,
      revision: entry.revision,
      month: entry.month,
      title: entry.title,
      kind: entry.kind,
      currency: entry.currency,
      status: entry.status,
      sourceReviewToken: financeReviewToken([
        entry.id,
        entry.revision,
        entry.month,
        entry.kind,
        entry.currency,
        entry.status,
        allocations.map(({ bucket, amountMicros }) => ({
          bucket,
          amountMicros,
        })),
        matches,
      ]),
      allocations: allocations.map((allocation) => {
        const matched = sumAmounts(
          matches.filter((row) => row.bucket === allocation.bucket),
        );
        return {
          projectId: allocation.projectId,
          projectName: allocation.projectName,
          amountMicros: allocation.amountMicros,
          matchedMicros: matched.toString(),
          remainingMatchMicros: nonnegative(
            BigInt(allocation.amountMicros) - matched,
          ),
        };
      }),
    };
  }
  private relationDTO(
    relation: DeliveryFinanceSettlementEntity | DeliveryFinanceCashMatchEntity,
    canManage: boolean,
  ): DeliveryFinanceCashRelationDTO {
    return {
      ...relation,
      kind: 'receivableId' in relation ? 'SETTLEMENT' : 'MATCH',
      receivableId: 'receivableId' in relation ? relation.receivableId : null,
      entryId: 'entryId' in relation ? relation.entryId : null,
      month: 'month' in relation ? relation.month : null,
      legacy: false,
      canReverse: canManage && relation.status === 'ACTIVE',
      createdAt: relation.createdAt.toISOString(),
      reversedAt: relation.reversedAt?.toISOString() ?? null,
    };
  }
  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinancePaymentsSnapshotDTO> {
    const query = parseDeliveryFinance(financePaymentsQuerySchema, input);
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
      );
      const state = await this.state(manager, workspace.id);
      const canManage = canManageFinance(actor);
      const cashRows = state.sources
        .filter(
          (source) =>
            source.category !== 'RECEIVABLE' &&
            (!query.currency || source.currency === query.currency),
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      const receivableRows = state.sources
        .filter(
          (source) =>
            source.category === 'RECEIVABLE' &&
            (!query.currency || source.currency === query.currency),
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      const page = (rows: FinanceCashSnapshot[], cursor: string | null) => {
        if (cursor && !rows.some((row) => row.id === cursor))
          throw new BadRequestException(
            'This payment page cursor is not valid for the current filters.',
          );
        const remaining = rows.filter((row) => !cursor || row.id > cursor);
        const selected = remaining.slice(0, DELIVERY_FINANCE_PAGE_SIZE);
        return {
          rows: selected.map((row) => this.sourceDTO(row, state)),
          next:
            remaining.length > DELIVERY_FINANCE_PAGE_SIZE
              ? (selected[selected.length - 1]?.id ?? null)
              : null,
        };
      };
      const cash = page(cashRows, query.afterCashId);
      const receivables = page(receivableRows, query.afterReceivableId);
      const entriesRepository = manager.getRepository(
        DeliveryFinanceEntryEntity,
      );
      const entryWhere = {
        workspaceId: workspace.id,
        status: 'POSTED' as const,
        ...(query.currency ? { currency: query.currency } : {}),
      };
      if (
        query.afterEntryId &&
        !(await entriesRepository.existsBy({
          ...entryWhere,
          id: query.afterEntryId,
        }))
      )
        throw new BadRequestException(
          'This monthly page cursor is not valid for the current filters.',
        );
      const entryRows = await entriesRepository.find({
        where: {
          ...entryWhere,
          ...(query.afterEntryId ? { id: MoreThan(query.afterEntryId) } : {}),
        },
        order: { id: 'ASC' },
        take: DELIVERY_FINANCE_PAGE_SIZE + 1,
      });
      const selectedEntry = query.selectedEntryId
        ? await entriesRepository.findOneBy({
            workspaceId: workspace.id,
            id: query.selectedEntryId,
          })
        : null;
      const selectedCashSource = state.sources.find(
        (source) =>
          source.id === query.selectedCashId &&
          source.category !== 'RECEIVABLE',
      );
      const selectedReceivableSource = state.sources.find(
        (source) =>
          source.id === query.selectedReceivableId &&
          source.category === 'RECEIVABLE',
      );
      const settlementWhere = query.selectedCashId
        ? { workspaceId: workspace.id, cashId: query.selectedCashId }
        : query.selectedReceivableId
          ? {
              workspaceId: workspace.id,
              receivableId: query.selectedReceivableId,
            }
          : null;
      const matchWhere = query.selectedCashId
        ? { workspaceId: workspace.id, cashId: query.selectedCashId }
        : query.selectedEntryId
          ? { workspaceId: workspace.id, entryId: query.selectedEntryId }
          : null;
      const settlementRepository = manager.getRepository(
        DeliveryFinanceSettlementEntity,
      );
      const matchRepository = manager.getRepository(
        DeliveryFinanceCashMatchEntity,
      );
      const settlements = settlementWhere
        ? (
            await settlementRepository.find({
              where: {
                ...settlementWhere,
                ...(query.afterSettlementId
                  ? { id: MoreThan(query.afterSettlementId) }
                  : {}),
              },
              order: { id: 'ASC' },
              take: DELIVERY_FINANCE_PAGE_SIZE + 1,
            })
          ).map((row) => this.relationDTO(row, canManage))
        : [];
      const matches = matchWhere
        ? (
            await matchRepository.find({
              where: {
                ...matchWhere,
                ...(query.afterMatchId
                  ? { id: MoreThan(query.afterMatchId) }
                  : {}),
              },
              order: { id: 'ASC' },
              take: DELIVERY_FINANCE_PAGE_SIZE + 1,
            })
          ).map((row) => this.relationDTO(row, canManage))
        : [];
      const legacySettlements: DeliveryFinanceCashRelationDTO[] = [];
      const members = await this.access.listActiveMembers(
        workspace.id,
        manager,
      );
      for (const record of state.records) {
        if (
          record.kind !== 'FINANCE' ||
          record.category !== 'INCOME' ||
          typeof record.externalReference !== 'string' ||
          !record.externalReference.startsWith('receivable:') ||
          !(query.selectedCashId
            ? record.id === query.selectedCashId
            : query.selectedReceivableId &&
              record.externalReference ===
                `receivable:${query.selectedReceivableId}`)
        )
          continue;
        const source = state.sources.find(
          (candidate) => candidate.id === record.id,
        );
        if (!source) continue;
        const receivableId = record.externalReference.slice(
          'receivable:'.length,
        );
        legacySettlements.push({
          id: record.id,
          kind: 'SETTLEMENT',
          revision: record.revision,
          cashId: record.id,
          cashTitle: record.title,
          receivableId,
          entryId: null,
          targetTitle:
            state.sources.find((candidate) => candidate.id === receivableId)
              ?.title ?? 'Unavailable legacy receivable',
          month: null,
          projectId: record.projectId,
          projectName: source.projectName,
          currency: record.currency,
          amountMicros: source.amountMicros,
          status: record.status === 'VOID' ? 'REVERSED' : 'ACTIVE',
          legacy: true,
          canReverse: false,
          createdBy: record.createdBy,
          createdByName:
            members.find((member) => member.memberId === record.createdBy)
              ?.name ?? 'Former team member',
          createdAt: record.createdAt,
          reversedBy: record.status === 'VOID' ? record.decisionBy : null,
          reversedByName:
            record.status === 'VOID'
              ? (members.find((member) => member.memberId === record.decisionBy)
                  ?.name ?? 'Former team member')
              : null,
          reversedAt: record.status === 'VOID' ? record.updatedAt : null,
          reversalReason:
            record.status === 'VOID'
              ? (record.history[record.history.length - 1]?.note ??
                'Legacy receipt voided')
              : null,
        });
      }
      if (
        query.afterSettlementId &&
        !legacySettlements.some((row) => row.id === query.afterSettlementId) &&
        !(
          settlementWhere &&
          (await settlementRepository.existsBy({
            ...settlementWhere,
            id: query.afterSettlementId,
          }))
        )
      )
        throw new BadRequestException(
          'This settlement cursor is not valid for the selected source.',
        );
      if (
        query.afterMatchId &&
        !(
          matchWhere &&
          (await matchRepository.existsBy({
            ...matchWhere,
            id: query.afterMatchId,
          }))
        )
      )
        throw new BadRequestException(
          'This match cursor is not valid for the selected source.',
        );
      settlements.push(...legacySettlements);
      const relationPage = (
        rows: DeliveryFinanceCashRelationDTO[],
        cursor: string | null,
      ) => {
        rows.sort((left, right) => left.id.localeCompare(right.id));
        const remaining = rows.filter((row) => !cursor || row.id > cursor);
        return {
          rows: remaining.slice(0, DELIVERY_FINANCE_PAGE_SIZE),
          next:
            remaining.length > DELIVERY_FINANCE_PAGE_SIZE
              ? remaining[DELIVERY_FINANCE_PAGE_SIZE - 1].id
              : null,
        };
      };
      const settlementPage = relationPage(settlements, query.afterSettlementId);
      const matchPage = relationPage(matches, query.afterMatchId);
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        currency: query.currency,
        canManage,
        cash: cash.rows,
        receivables: receivables.rows,
        entries: await Promise.all(
          entryRows
            .slice(0, DELIVERY_FINANCE_PAGE_SIZE)
            .map((entry) => this.entryDTO(manager, workspace.id, entry, state)),
        ),
        selectedCash: selectedCashSource
          ? this.sourceDTO(selectedCashSource, state)
          : null,
        selectedReceivable: selectedReceivableSource
          ? this.sourceDTO(selectedReceivableSource, state)
          : null,
        selectedEntry: selectedEntry
          ? await this.entryDTO(manager, workspace.id, selectedEntry, state)
          : null,
        cashTotal: cashRows.length,
        receivableTotal: receivableRows.length,
        entryTotal: await entriesRepository.countBy(entryWhere),
        nextCashId: cash.next,
        nextReceivableId: receivables.next,
        nextEntryId:
          entryRows.length > DELIVERY_FINANCE_PAGE_SIZE
            ? entryRows[DELIVERY_FINANCE_PAGE_SIZE - 1].id
            : null,
        settlements: settlementPage.rows,
        matches: matchPage.rows,
        settlementTotal:
          (settlementWhere
            ? await settlementRepository.countBy(settlementWhere)
            : 0) + legacySettlements.length,
        matchTotal: matchWhere ? await matchRepository.countBy(matchWhere) : 0,
        nextSettlementId: settlementPage.next,
        nextMatchId: matchPage.next,
        projects: state.projects.map(({ id, name }) => ({ id, name })),
        rejectedCashCount: state.rejectedCashCount,
      };
    });
  }
  private source(state: ReconciliationState, id: string) {
    const source = state.sources.find((candidate) => candidate.id === id);
    if (!source)
      throw new NotFoundException(
        'This payment or receivable source is unavailable.',
      );
    return this.sourceDTO(source, state);
  }
  private assertUsable(source: DeliveryFinanceCashSourceDTO) {
    if (
      source.sourceWarnings.some((warning) =>
        [
          'SOURCE_VOID',
          'SOURCE_CHANGED',
          'SOURCE_PROJECT_UNAVAILABLE',
          'FUTURE_CASH_DATE',
          'OVER_SETTLED',
          'OVER_MATCHED',
          'LEGACY_RECEIPT_MISMATCH',
        ].includes(warning),
      )
    )
      throw new ConflictException(
        'This source needs correction before it can be used. Review its current warnings.',
      );
  }
  private assertClient(
    cash: DeliveryFinanceCashSourceDTO,
    projectId: string | null,
    acknowledge: boolean,
  ) {
    if (cash.projectId && cash.projectId !== projectId)
      throw new BadRequestException(
        'The payment and target must belong to the same client project.',
      );
    if (!cash.projectId && projectId && !acknowledge)
      throw new BadRequestException(
        'Explicitly acknowledge assigning this unassigned payment to the selected client project.',
      );
  }
  private async storeSource(
    manager: EntityManager,
    workspaceId: string,
    source: DeliveryFinanceCashSourceDTO,
    memberId: string,
  ) {
    const repository = manager.getRepository(DeliveryFinanceSourceEntity);
    const existing = await repository.findOneBy({ id: source.id });
    if (existing) {
      if (existing.workspaceId !== workspaceId)
        throw new ConflictException('This source identity is unavailable.');
      return;
    }
    const snapshot: FinanceCashSnapshot = {
      id: source.id,
      revision: source.revision,
      title: source.title,
      category: source.category,
      currency: source.currency,
      amountMicros: source.amountMicros,
      date: source.date,
      dueDate: source.dueDate,
      projectId: source.projectId,
      projectName: source.projectName,
      status: source.status,
      evidenceUrl: source.evidenceUrl,
      note: source.note,
    };
    await repository.save(
      repository.create({
        id: source.id,
        workspaceId,
        kind: source.category === 'RECEIVABLE' ? 'RECEIVABLE' : 'CASH',
        currency: source.currency,
        amountMicros: source.amountMicros,
        snapshot,
        requestHash: null,
        createdBy: memberId,
      }),
    );
  }
  private async actorName(
    manager: EntityManager,
    workspaceId: string,
    memberId: string,
  ) {
    const members = await this.access.listActiveMembers(workspaceId, manager);
    return (
      members.find((member) => member.memberId === memberId)?.name ??
      'Team member'
    );
  }
  private async assertNewIdentity(
    manager: EntityManager,
    state: ReconciliationState,
    id: string,
  ) {
    if (
      state.records.some((record) => record.id === id) ||
      (await manager
        .getRepository(DeliveryFinanceSourceEntity)
        .existsBy({ id })) ||
      (await manager
        .getRepository(DeliveryFinanceSettlementEntity)
        .existsBy({ id })) ||
      (await manager
        .getRepository(DeliveryFinanceCashMatchEntity)
        .existsBy({ id }))
    )
      throw new ConflictException(
        'This finance request identity is already in use.',
      );
  }
  private retry(
    existing: {
      workspaceId: string;
      createdBy: string;
      requestHash: string | null;
      id: string;
    } | null,
    workspaceId: string,
    memberId: string,
    requestHash: string,
  ) {
    if (!existing) return null;
    if (
      existing.workspaceId === workspaceId &&
      existing.createdBy === memberId &&
      existing.requestHash === requestHash
    )
      return existing.id;
    throw new ConflictException(
      'This request identity was already used for another finance change.',
    );
  }
  async recordPayment(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const fields = parseDeliveryFinance(financePaymentSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      const repository = manager.getRepository(DeliveryFinanceSourceEntity);
      const requestHash = financeReviewToken(fields);
      const retry = this.retry(
        await repository.findOneBy({ id: fields.id }),
        workspace.id,
        memberId,
        requestHash,
      );
      if (retry) return retry;
      const state = await this.state(manager, workspace.id);
      await this.assertNewIdentity(manager, state, fields.id);
      if (
        fields.date >
        financeReportingClock(state.reportingClocks, fields.currency)
          .businessDate
      )
        throw new BadRequestException(
          `Record an actual payment date through today in ${financeReportingClock(state.reportingClocks, fields.currency).confirmed ? financeReportingClock(state.reportingClocks, fields.currency).timezone : 'UTC (until a forecast reporting timezone is confirmed)'}, not a future expected payment.`,
        );
      if (
        fields.projectId &&
        !state.projects.some((project) => project.id === fields.projectId)
      )
        throw new BadRequestException('This client project is unavailable.');
      const now = new Date().toISOString();
      const record: CashRecord = {
        id: fields.id,
        revision: 1,
        kind: 'FINANCE',
        projectId: fields.projectId,
        title: fields.title,
        category: fields.category,
        currency: fields.currency,
        amount: Number(BigInt(fields.amountMicros) / BigInt(10000)),
        date: fields.date,
        dueDate: null,
        externalReference: '',
        evidenceUrl: fields.evidenceUrl,
        notes: fields.note,
        status: 'POSTED',
        createdBy: memberId,
        createdAt: now,
        updatedAt: now,
        decisionBy: null,
        evidence: null,
        taskId: null,
        history: [
          {
            at: now,
            actorId: memberId,
            action: 'PAYMENT_RECORDED',
            note: fields.note,
          },
        ],
      };
      const operations =
        state.operations ??
        manager.getRepository(DeliveryOperationsEntity).create({
          workspaceId: workspace.id,
          state: newDeliveryOperations(),
        });
      operations.state.business ??= newDeliveryBusiness();
      operations.state.business.records.push(record);
      if (JSON.stringify(operations.state).length > 10000000)
        throw new BadRequestException(
          'Operational history needs archival before another payment can be added.',
        );
      await manager.getRepository(DeliveryOperationsEntity).save(operations);
      const snapshot = financeCashSnapshot(record, state.projects);
      if (!snapshot)
        throw new BadRequestException('This payment source is invalid.');
      await repository.save(
        repository.create({
          id: fields.id,
          workspaceId: workspace.id,
          kind: 'CASH',
          currency: fields.currency,
          amountMicros: fields.amountMicros,
          snapshot,
          requestHash,
          createdBy: memberId,
        }),
      );
      const actorName = await this.actorName(manager, workspace.id, memberId);
      await manager.getRepository(DeliveryFinanceEventEntity).save({
        workspaceId: workspace.id,
        sourceType: 'PAYMENT',
        sourceId: fields.id,
        actorId: memberId,
        actorName,
        action: 'FINANCE_PAYMENT_RECORDED',
        revision: 1,
        reason: fields.note,
        before: null,
        after: { ...snapshot },
      });
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'BUSINESS',
        sourceType: 'finance-payment',
        sourceId: fields.id,
        projectId: fields.projectId,
        action: 'FINANCE_PAYMENT_RECORDED',
        summary:
          'Recorded an actual payment with its source date and evidence.',
        outcome: 'RECORDED',
        changes: [
          { field: 'financeCategory', before: null, after: fields.category },
          { field: 'state', before: null, after: 'POSTED' },
        ],
      });
      return fields.id;
    });
  }
  async settleReceivable(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const fields = parseDeliveryFinance(financeSettlementSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      const repository = manager.getRepository(DeliveryFinanceSettlementEntity);
      const requestHash = financeReviewToken(fields);
      const retry = this.retry(
        await repository.findOneBy({ id: fields.id }),
        workspace.id,
        memberId,
        requestHash,
      );
      if (retry) return retry;
      const state = await this.state(manager, workspace.id);
      await this.assertNewIdentity(manager, state, fields.id);
      const cash = this.source(state, fields.cashId);
      const receivable = this.source(state, fields.receivableId);
      this.assertUsable(cash);
      this.assertUsable(receivable);
      if (cash.category !== 'INCOME' || receivable.category !== 'RECEIVABLE')
        throw new BadRequestException(
          'Select an incoming payment and a receivable to settle.',
        );
      if (cash.currency !== receivable.currency)
        throw new BadRequestException(
          'The payment and receivable currencies must match.',
        );
      this.assertClient(
        cash,
        receivable.projectId,
        fields.acknowledgeUnassignedCash,
      );
      if (
        cash.sourceReviewToken !== fields.expectedCashToken ||
        receivable.sourceReviewToken !== fields.expectedReceivableToken
      )
        throw new ConflictException(
          'These payment sources changed. Reload and review the latest balances before settling.',
        );
      if (
        BigInt(fields.amountMicros) > BigInt(cash.remainingSettlementMicros) ||
        BigInt(fields.amountMicros) > BigInt(receivable.outstandingMicros)
      )
        throw new BadRequestException(
          'The settlement exceeds the available payment or outstanding receivable.',
        );
      await this.storeSource(manager, workspace.id, cash, memberId);
      await this.storeSource(manager, workspace.id, receivable, memberId);
      const relation = repository.create({
        id: fields.id,
        workspaceId: workspace.id,
        revision: 1,
        cashId: cash.id,
        receivableId: receivable.id,
        cashTitle: cash.title,
        targetTitle: receivable.title,
        currency: cash.currency,
        amountMicros: fields.amountMicros,
        status: 'ACTIVE',
        projectId: receivable.projectId,
        projectName: receivable.projectName,
        requestHash,
        createdBy: memberId,
        createdByName: await this.actorName(manager, workspace.id, memberId),
        reversedBy: null,
        reversedByName: null,
        reversedAt: null,
        reversalReason: null,
      });
      await repository.save(relation);
      await financeRelationEvent(
        manager,
        workspace.id,
        memberId,
        relation.createdByName,
        'SETTLEMENT',
        relation,
        'Explicit same-currency payment settlement.',
        null,
      );
      return relation.id;
    });
  }
  async matchCash(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const fields = parseDeliveryFinance(financeCashMatchSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      const repository = manager.getRepository(DeliveryFinanceCashMatchEntity);
      const requestHash = financeReviewToken(fields);
      const retry = this.retry(
        await repository.findOneBy({ id: fields.id }),
        workspace.id,
        memberId,
        requestHash,
      );
      if (retry) return retry;
      const state = await this.state(manager, workspace.id);
      await this.assertNewIdentity(manager, state, fields.id);
      const cash = this.source(state, fields.cashId);
      this.assertUsable(cash);
      if (cash.category === 'RECEIVABLE')
        throw new BadRequestException(
          'Select an actual payment rather than an unpaid receivable.',
        );
      const entry = await manager
        .getRepository(DeliveryFinanceEntryEntity)
        .findOneBy({ workspaceId: workspace.id, id: fields.entryId });
      if (!entry || entry.status !== 'POSTED')
        throw new BadRequestException(
          'Only a posted monthly entry can be matched.',
        );
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`finance-period:${workspace.id}:${entry.month}`],
      );
      if (entry.currency !== cash.currency)
        throw new BadRequestException(
          'The payment and monthly entry currencies must match.',
        );
      if ((cash.category === 'INCOME' ? 'REVENUE' : 'COST') !== entry.kind)
        throw new BadRequestException(
          'Incoming payments match revenue; outgoing payments match costs.',
        );
      this.assertClient(
        cash,
        fields.projectId,
        fields.acknowledgeUnassignedCash,
      );
      const target = await this.entryDTO(manager, workspace.id, entry, state);
      if (
        cash.sourceReviewToken !== fields.expectedCashToken ||
        target.sourceReviewToken !== fields.expectedEntryToken
      )
        throw new ConflictException(
          'These matching sources changed. Reload and review the latest balances.',
        );
      const allocation = target.allocations.find(
        (candidate) => candidate.projectId === fields.projectId,
      );
      if (!allocation)
        throw new BadRequestException(
          'Choose an allocation that exists on this posted monthly entry.',
        );
      if (
        BigInt(fields.amountMicros) > BigInt(cash.remainingMatchMicros) ||
        BigInt(fields.amountMicros) > BigInt(allocation.remainingMatchMicros)
      )
        throw new BadRequestException(
          'The match exceeds the payment or monthly allocation remainder.',
        );
      await this.storeSource(manager, workspace.id, cash, memberId);
      const relation = repository.create({
        id: fields.id,
        workspaceId: workspace.id,
        revision: 1,
        cashId: cash.id,
        entryId: entry.id,
        month: entry.month,
        bucket: fields.projectId ?? 'COMPANY',
        cashTitle: cash.title,
        targetTitle: entry.title,
        currency: cash.currency,
        amountMicros: fields.amountMicros,
        status: 'ACTIVE',
        projectId: fields.projectId,
        projectName: allocation.projectName,
        requestHash,
        createdBy: memberId,
        createdByName: await this.actorName(manager, workspace.id, memberId),
        reversedBy: null,
        reversedByName: null,
        reversedAt: null,
        reversalReason: null,
      });
      await repository.save(relation);
      await financeRelationEvent(
        manager,
        workspace.id,
        memberId,
        relation.createdByName,
        'MATCH',
        relation,
        'Explicit match to an existing posted monthly allocation.',
        null,
      );
      return relation.id;
    });
  }
  async reverseRelation(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const fields = parseDeliveryFinance(financeReverseRelationSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId, true);
      const relation =
        fields.kind === 'SETTLEMENT'
          ? await manager
              .getRepository(DeliveryFinanceSettlementEntity)
              .findOneBy({ workspaceId: workspace.id, id: fields.id })
          : await manager
              .getRepository(DeliveryFinanceCashMatchEntity)
              .findOneBy({ workspaceId: workspace.id, id: fields.id });
      if (!relation)
        throw new NotFoundException(
          'This relation is unavailable. Legacy settlements are reversed by voiding their original receipt.',
        );
      if (
        relation.status === 'REVERSED' &&
        relation.revision === fields.revision + 1 &&
        relation.reversedBy === memberId &&
        relation.reversalReason === fields.reason
      )
        return relation.id;
      if (relation.revision !== fields.revision || relation.status !== 'ACTIVE')
        throw new ConflictException(
          'This relation changed. Refresh its history before reversing.',
        );
      if ('month' in relation)
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`finance-period:${workspace.id}:${relation.month}`],
        );
      await reverseFinanceRelation(
        manager,
        workspace.id,
        memberId,
        await this.actorName(manager, workspace.id, memberId),
        relation,
        fields.reason,
      );
      return relation.id;
    });
  }
}
