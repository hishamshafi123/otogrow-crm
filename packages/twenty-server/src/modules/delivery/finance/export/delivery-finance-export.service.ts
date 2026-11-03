import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, MoreThan, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import {
  canManageFinance,
  canReadFinance,
} from 'src/modules/delivery/business/delivery-business.policy';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryFinanceEventEntity } from 'src/modules/delivery/finance/entities/delivery-finance-event.entity';
import { lockFinancePeriods } from 'src/modules/delivery/finance/delivery-finance-period.helpers';
import {
  financeReportingClock,
  readFinanceReportingClocks,
} from 'src/modules/delivery/finance/delivery-finance-reporting-date';
import {
  parseDeliveryFinance,
  DELIVERY_FINANCE_HISTORY_PAGE_SIZE,
} from 'src/modules/delivery/finance/delivery-finance.policy';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryFinanceExportProfileEntity } from 'src/modules/delivery/finance/export/entities/delivery-finance-export-profile.entity';
import { DeliveryFinanceExportBatchEntity } from 'src/modules/delivery/finance/export/entities/delivery-finance-export-batch.entity';
import {
  FINANCE_EXPORT_FIELDS,
  FINANCE_EXPORT_LIMITATIONS,
  FINANCE_EXPORT_LIST_SIZE,
  FINANCE_EXPORT_MAPPING_SCOPES,
  FINANCE_EXPORT_MAX_BYTES,
  FINANCE_EXPORT_PAGE_SIZE,
  financeExportBatchSchema,
  financeExportChecksum,
  financeExportConfigurationSchema,
  financeExportCsv,
  financeExportDownloadSchema,
  financeExportHistorySchema,
  financeExportImportSchema,
  financeExportPreviewSchema,
  financeExportProfileSchema,
  financeExportProfileSnapshotSchema,
  financeExportSelectionSchema,
  financeExportsQuerySchema,
  type FinanceExportConfiguration,
  type FinanceExportSelection,
} from 'src/modules/delivery/finance/export/delivery-finance-export.policy';
import {
  projectFinanceExportProfile,
  renderFinanceExportRow,
} from 'src/modules/delivery/finance/export/render-delivery-finance-export';
import {
  readFinanceExportCash,
  readFinanceExportRecognition,
} from 'src/modules/delivery/finance/export/read-delivery-finance-export';
import {
  financeExportRepeatKey,
  readFinanceExportRepeats,
} from 'src/modules/delivery/finance/export/read-delivery-finance-export-repeats';
import {
  type DeliveryFinanceExportBatchDTO,
  type DeliveryFinanceExportBatchDetailDTO,
  type DeliveryFinanceExportBatchResultDTO,
  type DeliveryFinanceExportDownloadDTO,
  type DeliveryFinanceExportHistoryDTO,
  type DeliveryFinanceExportPreviewDTO,
  type DeliveryFinanceExportProfileDTO,
  type DeliveryFinanceExportProfileResultDTO,
  type DeliveryFinanceExportsDTO,
} from 'src/modules/delivery/finance/export/delivery-finance-export.dto';

type ImportState = {
  revision: number;
  status: 'NOT_CONFIRMED' | 'CONFIRMED' | 'REVERSED';
  reference: string | null;
  evidenceUrl: string | null;
  changedAt: string | null;
  changedByName: string | null;
};
const page = <TRow extends { key: string }>(
  rows: TRow[],
  cursor: string | null,
) => {
  const index = cursor ? rows.findIndex((row) => row.key === cursor) : -1;
  if (cursor && index < 0)
    throw new BadRequestException(
      'This export row cursor is no longer valid. Return to the first review page.',
    );
  const remaining = rows.slice(index + 1);
  return {
    rows: remaining.slice(0, FINANCE_EXPORT_PAGE_SIZE),
    next:
      remaining.length > FINANCE_EXPORT_PAGE_SIZE
        ? remaining[FINANCE_EXPORT_PAGE_SIZE - 1].key
        : null,
  };
};
@Injectable()
export class DeliveryFinanceExportService {
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
    write = false,
  ) {
    // Reader-created batches still need exclusive access to snapshot one complete source selection.
    await manager.query(
      `SELECT pg_advisory_xact_lock${write ? '' : '_shared'}(hashtextextended($1,0))`,
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
        'Your current roles do not allow this finance export action.',
      );
    return actor;
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
  private async command(
    manager: EntityManager,
    workspaceId: string,
    id: string,
    actorId: string,
    requestHash: string,
  ) {
    const [event]: DeliveryFinanceEventEntity[] = await manager.query(
      'SELECT * FROM core."deliveryFinanceEvent" WHERE "workspaceId"=$1 AND "sourceType" IN (\'EXPORT_PROFILE\',\'EXPORT_BATCH\') AND "after"->>\'commandId\'=$2 ORDER BY id LIMIT 1',
      [workspaceId, id],
    );
    if (
      event &&
      (event.actorId !== actorId || event.after.requestHash !== requestHash)
    )
      throw new ConflictException(
        'This export command identity was already used for another action.',
      );
    return event ?? null;
  }
  private async event(
    manager: EntityManager,
    workspaceId: string,
    actorId: string,
    sourceType: 'EXPORT_PROFILE' | 'EXPORT_BATCH',
    sourceId: string,
    revision: number,
    action: string,
    reason: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
  ) {
    const actorName = await this.actorName(manager, workspaceId, actorId);
    await manager.getRepository(DeliveryFinanceEventEntity).save({
      workspaceId,
      actorId,
      actorName,
      sourceType,
      sourceId,
      revision,
      action,
      reason,
      before,
      after,
    });
    await recordOtogrowActivity(manager, {
      workspaceId,
      actorId,
      category: 'BUSINESS',
      sourceType: 'finance-export',
      sourceId,
      action,
      outcome: 'RECORDED',
      summary:
        sourceType === 'EXPORT_PROFILE'
          ? 'Updated a reviewed accountant export profile.'
          : 'Recorded an accountant handoff or its manual import status.',
      changes: [
        {
          field: 'revision',
          before:
            before && typeof before.revision === 'number'
              ? String(before.revision)
              : null,
          after: String(revision),
        },
      ],
    });
  }
  private async profile(
    manager: EntityManager,
    workspaceId: string,
    id: string,
    requireActive = false,
  ) {
    const profile = await manager
      .getRepository(DeliveryFinanceExportProfileEntity)
      .findOneBy({ workspaceId, id });
    if (!profile)
      throw new NotFoundException('This export profile is not available.');
    if (requireActive && !profile.active)
      throw new BadRequestException(
        'This export profile is disabled. Its retained batches remain available.',
      );
    if (
      !financeExportConfigurationSchema.safeParse(profile.configuration).success
    )
      throw new ConflictException(
        'This export profile requires a valid mapping configuration before it can be used.',
      );
    return profile;
  }
  private async importState(
    manager: EntityManager,
    workspaceId: string,
    batchId: string,
  ): Promise<ImportState> {
    const [event]: DeliveryFinanceEventEntity[] = await manager.query(
      'SELECT * FROM core."deliveryFinanceEvent" WHERE "workspaceId"=$1 AND "sourceType"=\'EXPORT_BATCH\' AND "sourceId"=$2 ORDER BY revision DESC,"createdAt" DESC,id DESC LIMIT 1',
      [workspaceId, batchId],
    );
    return {
      revision: event?.revision ?? 1,
      status:
        event?.after.importStatus === 'CONFIRMED'
          ? 'CONFIRMED'
          : event?.after.importStatus === 'REVERSED'
            ? 'REVERSED'
            : 'NOT_CONFIRMED',
      reference:
        typeof event?.after.reference === 'string'
          ? event.after.reference
          : null,
      evidenceUrl:
        typeof event?.after.evidenceUrl === 'string'
          ? event.after.evidenceUrl
          : null,
      changedAt:
        event && event.action !== 'FINANCE_EXPORT_BATCH_CREATED'
          ? event.createdAt.toISOString()
          : null,
      changedByName:
        event && event.action !== 'FINANCE_EXPORT_BATCH_CREATED'
          ? event.actorName
          : null,
    };
  }
  private async batchDTO(
    manager: EntityManager,
    row: DeliveryFinanceExportBatchEntity,
  ): Promise<DeliveryFinanceExportBatchDTO> {
    const state = await this.importState(manager, row.workspaceId, row.id);
    return {
      ...row.selection,
      id: row.id,
      profileId: row.profileId,
      profileRevision: row.profileRevision,
      profileName: row.profileSnapshot.name,
      basis: row.basis,
      currency: row.currency,
      checksum: row.checksum,
      byteLength: row.byteLength,
      totals: row.totals,
      revision: state.revision,
      importStatus: state.status,
      importReference: state.reference,
      importEvidenceUrl: state.evidenceUrl,
      importChangedAt: state.changedAt,
      importChangedByName: state.changedByName,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdByName,
      reexportReason: row.reexportReason,
    };
  }
  private async sourceRead(
    manager: EntityManager,
    workspaceId: string,
    profile: DeliveryFinanceExportProfileDTO,
    selection: FinanceExportSelection,
  ) {
    if ((profile.basis === 'CASH') !== (selection.dateFrom !== null))
      throw new BadRequestException(
        'Choose a source period that matches the profile basis.',
      );
    if (profile.basis === 'RECOGNITION')
      await lockFinancePeriods(
        manager,
        workspaceId,
        [selection.serviceMonth as string],
        true,
      );
    const clock = financeReportingClock(
      await readFinanceReportingClocks(manager, workspaceId),
      selection.currency,
    );
    const source =
      profile.basis === 'CASH'
        ? await readFinanceExportCash(
            manager,
            workspaceId,
            selection,
            clock.businessDate,
          )
        : await readFinanceExportRecognition(manager, workspaceId, selection);
    return { ...source, clock };
  }
  private async review(
    manager: EntityManager,
    workspaceId: string,
    profile: DeliveryFinanceExportProfileDTO,
    selection: FinanceExportSelection,
  ) {
    const source = await this.sourceRead(
      manager,
      workspaceId,
      profile,
      selection,
    );
    const configuration = parseDeliveryFinance(
      financeExportConfigurationSchema,
      {
        columns: profile.columns,
        mappings: profile.mappings,
        delimiter: profile.delimiter,
        precision: profile.precision,
        dateFormat: profile.dateFormat,
        includeBom: profile.includeBom,
      },
    );
    const rows = source.rows.map((row) =>
      renderFinanceExportRow(
        row,
        configuration,
        profile.basis === 'CASH' ? 'CASH' : 'RECOGNITION',
      ),
    );
    const previous = await readFinanceExportRepeats(
      manager,
      workspaceId,
      profile.basis === 'CASH' ? 'CASH' : 'RECOGNITION',
      selection.currency,
      [
        ...rows.map((row) => ({
          sourceId: row.sourceId,
          identityKey: row.identityKey,
        })),
        ...source.exclusions.flatMap((row) =>
          row.sourceId ? [{ sourceId: row.sourceId, identityKey: null }] : [],
        ),
      ],
    );
    const previousBySource = new Map(
      previous.map((summary) => [financeExportRepeatKey(summary), summary]),
    );
    for (const row of rows) {
      const summary = previousBySource.get(financeExportRepeatKey(row));
      row.previousBatchCount = summary?.previousBatchCount ?? 0;
      row.latestBatchId = summary?.latestBatchId ?? null;
      if (row.previousBatchCount > 0) row.warnings.push('PREVIOUSLY_EXPORTED');
    }
    for (const row of source.exclusions)
      row.previousBatchCount = row.sourceId
        ? (previousBySource.get(
            financeExportRepeatKey({
              sourceId: row.sourceId,
              identityKey: null,
            }),
          )?.previousBatchCount ?? 0)
        : 0;
    const repeatedSourceCount = new Set([
      ...rows
        .filter((row) => row.previousBatchCount > 0)
        .map((row) => row.identityKey),
      ...source.exclusions
        .filter((row) => row.previousBatchCount > 0)
        .map((row) => `EXCLUDED:${row.sourceId}`),
    ]).size;
    let incoming = BigInt(0),
      outgoing = BigInt(0);
    for (const row of rows) {
      if (row.kind === 'INCOME' || row.kind === 'REVENUE')
        incoming += BigInt(row.amountMicros);
      else outgoing += BigInt(row.amountMicros);
    }
    const csv = financeExportCsv(
      configuration,
      rows.map((row) => row.cells),
    );
    const byteLength = Buffer.byteLength(csv, 'utf8');
    const errors = [
      ...new Set([
        ...rows.flatMap((row) => row.errors),
        ...source.exclusions
          .filter((row) => row.blocking)
          .map((row) => row.code),
        ...(!rows.length ? ['EMPTY_SELECTION'] : []),
        ...(byteLength > FINANCE_EXPORT_MAX_BYTES ? ['CSV_TOO_LARGE'] : []),
      ]),
    ];
    const warnings = [
      ...new Set([
        ...rows.flatMap((row) => row.warnings),
        ...(source.exclusions.some((row) => row.previousBatchCount > 0)
          ? ['PREVIOUS_EXPORT_NOW_EXCLUDED']
          : []),
        ...(!source.clock.confirmed ? ['UTC_CALENDAR_FALLBACK'] : []),
      ]),
    ];
    const totals = {
      incomingMicros: incoming.toString(),
      outgoingMicros: outgoing.toString(),
      netMicros: (incoming - outgoing).toString(),
      sourceCount: new Set(rows.map((row) => row.sourceId)).size,
      rowCount: rows.length,
      exclusionCount: source.exclusions.length,
      errorCount:
        rows.reduce((count, row) => count + row.errors.length, 0) +
        source.exclusions.filter((row) => row.blocking).length +
        (!rows.length ? 1 : 0) +
        (byteLength > FINANCE_EXPORT_MAX_BYTES ? 1 : 0),
      repeatedSourceCount,
    };
    const previewToken = financeReviewToken({
      profile,
      selection,
      source: source.signature,
      rows,
      exclusions: source.exclusions,
      previous,
      clock: source.clock,
    });
    return {
      rows,
      exclusions: source.exclusions,
      clock: source.clock,
      csv,
      byteLength,
      checksum: financeExportChecksum(csv),
      totals,
      previewToken,
      errors,
      warnings,
      canCreate: errors.length === 0,
    };
  }
  async preview(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceExportPreviewDTO> {
    const fields = parseDeliveryFinance(financeExportPreviewSchema, input);
    const selection = parseDeliveryFinance(financeExportSelectionSchema, {
      profileId: fields.profileId,
      currency: fields.currency,
      dateFrom: fields.dateFrom,
      dateTo: fields.dateTo,
      serviceMonth: fields.serviceMonth,
      accountingDate: fields.accountingDate,
    });
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
      );
      const profile = projectFinanceExportProfile(
        await this.profile(manager, workspace.id, fields.profileId, true),
      );
      const review = await this.review(
        manager,
        workspace.id,
        profile,
        selection,
      );
      const rows = page(review.rows, fields.afterRowKey),
        exclusions = page(review.exclusions, fields.afterExclusionKey);
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        canManage: canManageFinance(actor),
        profile,
        basis: profile.basis,
        currency: selection.currency,
        businessDate: review.clock.businessDate,
        timezone: review.clock.timezone,
        clockConfirmed: review.clock.confirmed,
        previewToken: review.previewToken,
        canCreate: review.canCreate,
        totals: review.totals,
        rows: rows.rows,
        nextRowKey: rows.next,
        exclusions: exclusions.rows,
        nextExclusionKey: exclusions.next,
        errors: review.errors,
        warnings: review.warnings,
        limitations: [...FINANCE_EXPORT_LIMITATIONS],
      };
    });
  }
  async saveProfile(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceExportProfileResultDTO> {
    const fields = parseDeliveryFinance(financeExportProfileSchema, input),
      requestHash = financeReviewToken(fields);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        true,
        true,
      );
      const prior = await this.command(
        manager,
        workspace.id,
        fields.commandId,
        memberId,
        requestHash,
      );
      const repository = manager.getRepository(
        DeliveryFinanceExportProfileEntity,
      );
      const old = await repository.findOneBy({ id: fields.id });
      if (old && old.workspaceId !== workspace.id)
        throw new ConflictException(
          'This export profile identity is unavailable.',
        );
      if (prior && old)
        return { profile: projectFinanceExportProfile(old), replayed: true };
      if (prior || (old?.revision ?? 0) !== fields.revision)
        throw new ConflictException(
          'This profile changed. Refresh its current configuration before saving.',
        );
      const configuration: FinanceExportConfiguration = {
        columns: fields.columns,
        mappings: fields.mappings,
        delimiter: fields.delimiter,
        precision: fields.precision,
        dateFormat: fields.dateFormat,
        includeBom: fields.includeBom,
      };
      const saved = await repository.save(
        repository.create({
          id: fields.id,
          workspaceId: workspace.id,
          revision: fields.revision + 1,
          name: fields.name,
          basis: fields.basis,
          active: fields.active,
          configuration,
          changedBy: memberId,
          changedByName: await this.actorName(manager, workspace.id, memberId),
        }),
      );
      const profile = projectFinanceExportProfile(saved);
      await this.event(
        manager,
        workspace.id,
        memberId,
        'EXPORT_PROFILE',
        saved.id,
        saved.revision,
        'FINANCE_EXPORT_PROFILE_SAVED',
        fields.reason,
        old ? { ...projectFinanceExportProfile(old) } : null,
        { ...profile, commandId: fields.commandId, requestHash },
      );
      return { profile, replayed: false };
    });
  }
  async createBatch(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceExportBatchResultDTO> {
    const fields = parseDeliveryFinance(financeExportBatchSchema, input),
      requestHash = financeReviewToken(fields);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        false,
        true,
      );
      const repository = manager.getRepository(
        DeliveryFinanceExportBatchEntity,
      );
      const existing = await repository.findOneBy({ id: fields.id });
      if (existing) {
        if (
          existing.workspaceId !== workspace.id ||
          existing.createdBy !== memberId ||
          existing.requestHash !== requestHash
        )
          throw new ConflictException(
            'This export request identity already belongs to another batch.',
          );
        return {
          batch: await this.batchDTO(manager, existing),
          replayed: true,
        };
      }
      if (
        await this.command(
          manager,
          workspace.id,
          fields.id,
          memberId,
          requestHash,
        )
      )
        throw new ConflictException(
          'This export command cannot create another batch.',
        );
      const profile = projectFinanceExportProfile(
        await this.profile(manager, workspace.id, fields.profileId, true),
      );
      const selection = parseDeliveryFinance(financeExportSelectionSchema, {
        profileId: fields.profileId,
        currency: fields.currency,
        dateFrom: fields.dateFrom,
        dateTo: fields.dateTo,
        serviceMonth: fields.serviceMonth,
        accountingDate: fields.accountingDate,
      });
      const review = await this.review(
        manager,
        workspace.id,
        profile,
        selection,
      );
      if (review.previewToken !== fields.expectedPreviewToken)
        throw new ConflictException(
          'The export profile, source selection or previous export/import state changed. Review the complete preview again.',
        );
      if (!review.canCreate)
        throw new BadRequestException(
          'Resolve every blocking source, mapping or precision error before creating the export batch.',
        );
      if (
        review.totals.repeatedSourceCount > 0 &&
        (!fields.acknowledgeRepeatedSources || !fields.reexportReason)
      )
        throw new BadRequestException(
          'Acknowledge the previous exports and explain this deliberate re-export before creating another handoff.',
        );
      const saved = await repository.save(
        repository.create({
          id: fields.id,
          workspaceId: workspace.id,
          profileId: profile.id,
          profileRevision: profile.revision,
          basis: profile.basis as 'CASH' | 'RECOGNITION',
          currency: selection.currency,
          selection,
          profileSnapshot: profile,
          rows: review.rows,
          sourceIds: [...new Set(review.rows.map((row) => row.sourceId))],
          identityKeys: [...new Set(review.rows.map((row) => row.identityKey))],
          exclusions: review.exclusions,
          totals: review.totals,
          rowCount: review.rows.length,
          csv: review.csv,
          checksum: review.checksum,
          byteLength: review.byteLength,
          previewToken: review.previewToken,
          requestHash,
          reexportReason:
            review.totals.repeatedSourceCount > 0
              ? fields.reexportReason
              : null,
          createdBy: memberId,
          createdByName: await this.actorName(manager, workspace.id, memberId),
        }),
      );
      await this.event(
        manager,
        workspace.id,
        memberId,
        'EXPORT_BATCH',
        saved.id,
        1,
        'FINANCE_EXPORT_BATCH_CREATED',
        fields.reexportReason ??
          'Created a reviewed accountant handoff; external import is unconfirmed.',
        null,
        {
          commandId: fields.id,
          requestHash,
          revision: 1,
          importStatus: 'NOT_CONFIRMED',
          checksum: saved.checksum,
          profileId: saved.profileId,
          profileRevision: saved.profileRevision,
          currency: saved.currency,
          basis: saved.basis,
          totals: saved.totals,
        },
      );
      return { batch: await this.batchDTO(manager, saved), replayed: false };
    });
  }
  private async detail(
    manager: EntityManager,
    workspaceId: string,
    batch: DeliveryFinanceExportBatchEntity,
    afterRowKey: string | null,
  ): Promise<DeliveryFinanceExportBatchDetailDTO> {
    const rows = batch.rows.map((row) => ({ ...row }));
    const currentWarnings: string[] = [];
    try {
      const current = await this.sourceRead(
        manager,
        workspaceId,
        batch.profileSnapshot,
        batch.selection,
      );
      const currentRows = new Map(current.rows.map((row) => [row.key, row]));
      for (const row of rows) {
        const currentRow = currentRows.get(row.key),
          excluded = current.exclusions.find(
            (source) => source.sourceId === row.sourceId,
          );
        row.currentStatus =
          currentRow?.sourceStatus ?? excluded?.sourceStatus ?? 'UNAVAILABLE';
        row.sourceChanged =
          !currentRow || currentRow.sourceToken !== row.sourceToken;
        if (row.sourceChanged)
          row.warnings = [
            ...new Set([...row.warnings, 'SOURCE_CHANGED_SINCE_EXPORT']),
          ];
      }
      if (rows.some((row) => row.sourceChanged))
        currentWarnings.push('SOURCE_CHANGED_SINCE_EXPORT');
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      currentWarnings.push('CURRENT_SOURCE_REVIEW_UNAVAILABLE');
      for (const row of rows) {
        row.currentStatus = 'UNAVAILABLE';
        row.sourceChanged = true;
      }
    }
    const currentProfile = await manager
      .getRepository(DeliveryFinanceExportProfileEntity)
      .findOneBy({ workspaceId, id: batch.profileId });
    if (
      !currentProfile ||
      !currentProfile.active ||
      currentProfile.revision !== batch.profileRevision
    )
      currentWarnings.push('PROFILE_CHANGED_SINCE_EXPORT');
    const [{ repeated }] = await manager.query(
      'SELECT EXISTS(SELECT 1 FROM core."deliveryFinanceExportBatch" WHERE "workspaceId"=$1 AND basis=$2 AND currency=$3 AND id<>$4 AND ("sourceIds" && $5::uuid[] OR "identityKeys" && $6::text[])) AS repeated',
      [
        workspaceId,
        batch.basis,
        batch.currency,
        batch.id,
        batch.sourceIds,
        batch.identityKeys,
      ],
    );
    if (repeated) currentWarnings.push('REPEATED_SOURCE_EXPORTS');
    const selected = page(rows, afterRowKey);
    return {
      batch: await this.batchDTO(manager, batch),
      profile: batch.profileSnapshot,
      rows: selected.rows,
      nextRowKey: selected.next,
      exclusions: batch.exclusions,
      currentWarnings,
    };
  }
  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceExportsDTO> {
    const fields = parseDeliveryFinance(financeExportsQuerySchema, input);
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
      );
      const profiles = manager.getRepository(
          DeliveryFinanceExportProfileEntity,
        ),
        batches = manager.getRepository(DeliveryFinanceExportBatchEntity);
      for (const [repository, id] of [
        [profiles, fields.afterProfileId],
        [batches, fields.afterBatchId],
      ] as const)
        if (
          id &&
          !(await repository.existsBy({ workspaceId: workspace.id, id }))
        )
          throw new BadRequestException(
            'This export list cursor is not valid for the current workspace.',
          );
      const profileRows = await profiles.find({
        where: {
          workspaceId: workspace.id,
          ...(fields.afterProfileId
            ? { id: MoreThan(fields.afterProfileId) }
            : {}),
        },
        order: { id: 'ASC' },
        take: FINANCE_EXPORT_LIST_SIZE + 1,
      });
      const batchRows = await batches.find({
        select: {
          id: true,
          workspaceId: true,
          profileId: true,
          profileRevision: true,
          basis: true,
          currency: true,
          selection: true,
          profileSnapshot: true,
          totals: true,
          checksum: true,
          byteLength: true,
          reexportReason: true,
          createdAt: true,
          createdByName: true,
        },
        where: {
          workspaceId: workspace.id,
          ...(fields.afterBatchId ? { id: MoreThan(fields.afterBatchId) } : {}),
        },
        order: { id: 'ASC' },
        take: FINANCE_EXPORT_LIST_SIZE + 1,
      });
      const selectedProfile = fields.selectedProfileId
        ? projectFinanceExportProfile(
            await this.profile(manager, workspace.id, fields.selectedProfileId),
          )
        : null;
      const selectedBatch = fields.selectedBatchId
        ? await batches.findOneBy({
            workspaceId: workspace.id,
            id: fields.selectedBatchId,
          })
        : null;
      if (fields.selectedBatchId && !selectedBatch)
        throw new NotFoundException('This export batch is not available.');
      if (fields.afterBatchRowKey && !selectedBatch)
        throw new BadRequestException(
          'Choose a batch before paging its immutable rows.',
        );
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        canManage: canManageFinance(actor),
        profiles: profileRows
          .slice(0, FINANCE_EXPORT_LIST_SIZE)
          .map(projectFinanceExportProfile),
        nextProfileId:
          profileRows.length > FINANCE_EXPORT_LIST_SIZE
            ? profileRows[FINANCE_EXPORT_LIST_SIZE - 1].id
            : null,
        selectedProfile,
        batches: await Promise.all(
          batchRows
            .slice(0, FINANCE_EXPORT_LIST_SIZE)
            .map((batch) => this.batchDTO(manager, batch)),
        ),
        nextBatchId:
          batchRows.length > FINANCE_EXPORT_LIST_SIZE
            ? batchRows[FINANCE_EXPORT_LIST_SIZE - 1].id
            : null,
        selectedBatch: selectedBatch
          ? await this.detail(
              manager,
              workspace.id,
              selectedBatch,
              fields.afterBatchRowKey,
            )
          : null,
        projects: await manager.getRepository(DeliveryProjectEntity).find({
          select: { id: true, name: true },
          where: { workspaceId: workspace.id },
          order: { name: 'ASC', id: 'ASC' },
        }),
        allowedFields: [...FINANCE_EXPORT_FIELDS],
        mappingScopes: [...FINANCE_EXPORT_MAPPING_SCOPES],
        limitations: [...FINANCE_EXPORT_LIMITATIONS],
      };
    });
  }
  async download(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceExportDownloadDTO> {
    const fields = parseDeliveryFinance(financeExportDownloadSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId);
      const batch = await manager
        .getRepository(DeliveryFinanceExportBatchEntity)
        .findOneBy({ workspaceId: workspace.id, id: fields.batchId });
      if (!batch)
        throw new NotFoundException(
          'This retained export batch is not available.',
        );
      if (
        financeExportChecksum(batch.csv) !== batch.checksum ||
        Buffer.byteLength(batch.csv, 'utf8') !== batch.byteLength
      )
        throw new ConflictException(
          'This stored CSV does not match its immutable checksum. Preserve the batch for review.',
        );
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        batchId: batch.id,
        fileName: `finance-${batch.basis.toLowerCase()}-${batch.currency}-${batch.selection.serviceMonth ?? `${batch.selection.dateFrom}-${batch.selection.dateTo}`}-${batch.id}.csv`,
        mimeType: 'text/csv;charset=utf-8',
        encoding: 'UTF-8',
        csv: batch.csv,
        checksum: batch.checksum,
        byteLength: batch.byteLength,
      };
    });
  }
  async changeImportStatus(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceExportBatchResultDTO> {
    const fields = parseDeliveryFinance(financeExportImportSchema, input),
      requestHash = financeReviewToken(fields);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        true,
        true,
      );
      const prior = await this.command(
        manager,
        workspace.id,
        fields.commandId,
        memberId,
        requestHash,
      );
      const batch = await manager
        .getRepository(DeliveryFinanceExportBatchEntity)
        .findOneBy({ workspaceId: workspace.id, id: fields.batchId });
      if (!batch)
        throw new NotFoundException('This export batch is not available.');
      if (prior)
        return { batch: await this.batchDTO(manager, batch), replayed: true };
      const state = await this.importState(manager, workspace.id, batch.id);
      if (
        state.revision !== fields.revision ||
        state.status === fields.status ||
        (fields.status === 'REVERSED' && state.status !== 'CONFIRMED')
      )
        throw new ConflictException(
          'This manual import status changed. Refresh its current history before continuing.',
        );
      await this.event(
        manager,
        workspace.id,
        memberId,
        'EXPORT_BATCH',
        batch.id,
        state.revision + 1,
        fields.status === 'CONFIRMED'
          ? 'FINANCE_EXPORT_IMPORT_CONFIRMED'
          : 'FINANCE_EXPORT_IMPORT_REVERSED',
        fields.reason,
        { ...state },
        {
          revision: state.revision + 1,
          commandId: fields.commandId,
          requestHash,
          importStatus: fields.status,
          reference:
            fields.status === 'CONFIRMED' ? fields.reference : state.reference,
          evidenceUrl:
            fields.status === 'CONFIRMED'
              ? fields.evidenceUrl
              : state.evidenceUrl,
          checksum: batch.checksum,
        },
      );
      return { batch: await this.batchDTO(manager, batch), replayed: false };
    });
  }
  async history(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryFinanceExportHistoryDTO> {
    const fields = parseDeliveryFinance(financeExportHistorySchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.authorize(manager, workspace, memberId, userWorkspaceId);
      const sourceType =
        fields.sourceType === 'PROFILE' ? 'EXPORT_PROFILE' : 'EXPORT_BATCH';
      if (
        fields.beforeId &&
        !(await manager.getRepository(DeliveryFinanceEventEntity).existsBy({
          workspaceId: workspace.id,
          sourceType,
          sourceId: fields.sourceId,
          id: fields.beforeId,
        }))
      )
        throw new BadRequestException(
          'This export history cursor is not valid for the selected source.',
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
      const historicProfile = (row: DeliveryFinanceEventEntity) => {
        if (row.sourceType !== 'EXPORT_PROFILE') return null;
        const after = row.after;
        const parsed = financeExportProfileSnapshotSchema.safeParse({
          id: after.id,
          revision: after.revision,
          name: after.name,
          basis: after.basis,
          active: after.active,
          columns: after.columns,
          mappings: after.mappings,
          delimiter: after.delimiter,
          precision: after.precision,
          dateFormat: after.dateFormat,
          includeBom: after.includeBom,
          changedAt: after.changedAt,
          changedByName: after.changedByName,
        });
        return parsed.success ? parsed.data : null;
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
            importStatus: text(row.after.importStatus),
            reference: text(row.after.reference),
            evidenceUrl: text(row.after.evidenceUrl),
            checksum: text(row.after.checksum),
            profile: historicProfile(row),
          })),
        nextBeforeId:
          rows.length > DELIVERY_FINANCE_HISTORY_PAGE_SIZE
            ? rows[DELIVERY_FINANCE_HISTORY_PAGE_SIZE - 1].id
            : null,
      };
    });
  }
}
