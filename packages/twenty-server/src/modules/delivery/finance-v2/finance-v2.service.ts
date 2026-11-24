import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager, In } from 'typeorm';
import { EmailService } from 'src/engine/core-modules/email/email.service';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import {
  canManageFinance,
  canReadFinance,
} from 'src/modules/delivery/business/delivery-business.policy';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { OtogrowAiSpendEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryFinanceV2AccountEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-account.entity';
import { DeliveryFinanceV2InvoiceScheduleEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-invoice-schedule.entity';
import { DeliveryFinanceV2InvoiceEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-invoice.entity';
import { DeliveryFinanceV2JournalLineEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-journal-line.entity';
import { DeliveryFinanceV2JournalEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-journal.entity';
import { DeliveryFinanceV2PayrollEntryEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-payroll-entry.entity';
import { DeliveryFinanceV2PayrollProfileEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-payroll-profile.entity';
import { DeliveryFinanceV2ProfileEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-profile.entity';
import { DeliveryFinanceV2QuoteEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-quote.entity';
import { DeliveryFinanceV2RecurringExpenseEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-recurring-expense.entity';
import { renderFinanceV2PdfBuffer } from 'src/modules/delivery/finance-v2/finance-v2-pdf.util';
import {
  financeV2CommandSchema,
  financeV2SnapshotQuerySchema,
  parseFinanceV2Input,
} from 'src/modules/delivery/finance-v2/finance-v2-schemas';
import {
  assertBalancedJournalLines,
  calculateBalanceSheet,
  calculateDocumentLineTotals,
  calculateMonthlyPayroll,
  calculateOverdueDays,
  calculateProfitAndLoss,
  computeWeightedCarryingAed,
  convertToAedMicros,
  nextYearMonth,
  previousYearMonth,
  resolveRecurringInvoiceDates,
  resolveScheduledDateForMonth,
} from 'src/modules/delivery/finance-v2/finance-v2.policy';
import {
  FINANCE_V2_BASE_CURRENCY,
  FINANCE_V2_CURRENCIES,
  FINANCE_V2_DEFAULT_FX_RATES,
  type FinanceV2Currency,
  type FinanceV2JournalEntryType,
  type FinanceV2JournalLineDraft,
  type FinanceV2LedgerLineRecord,
} from 'src/modules/delivery/finance-v2/finance-v2.types';

const SYSTEM_ACCOUNTS = [
  {
    code: 'EQUITY:OPENING',
    name: 'Opening Accumulated Profits',
    accountType: 'EQUITY',
    subType: 'OPENING_EQUITY',
  },
  {
    code: 'ASSET:EQUIPMENT',
    name: 'Equipment & Assets',
    accountType: 'ASSET',
    subType: 'FIXED_ASSET',
  },
  {
    code: 'REVENUE:SERVICE',
    name: 'Client Service Revenue',
    accountType: 'REVENUE',
    subType: 'SERVICE_REVENUE',
  },
  {
    code: 'EXPENSE:DIRECT',
    name: 'Direct Expenses',
    accountType: 'DIRECT_EXPENSE',
    subType: 'DIRECT_COST',
  },
  {
    code: 'EXPENSE:INDIRECT',
    name: 'Indirect Expenses',
    accountType: 'INDIRECT_EXPENSE',
    subType: 'INDIRECT_COST',
  },
  {
    code: 'FX:GAIN_LOSS',
    name: 'Currency Exchange Gain / Loss',
    accountType: 'REVENUE',
    subType: 'FX_GAIN_LOSS',
  },
] as const;

const PAYROLL_JOURNAL_TYPES = new Set<string>([
  'PAYROLL_BASE',
  'PAYROLL_OVERTIME',
  'PAYROLL_LEAVE_REDUCTION',
  'PAYROLL_BONUS',
]);

const todayIsoDate = (now = new Date()): string =>
  now.toISOString().slice(0, 10);
const monthOfDate = (isoDate: string): string => isoDate.slice(0, 7);
const firstDayOfMonth = (month: string): string => `${month}-01`;

// Preserves pure signed numeric cells (e.g. -500.00) for Excel/Sheets SUM()
// while neutralizing spreadsheet formulas (=, +, @, tabs/newlines, non-numeric -foo).
const csvCell = (value: unknown): string => {
  const text = String(value ?? '');
  const isPureNumber = /^-?\d+(?:\.\d+)?$/.test(text);
  const escaped =
    !isPureNumber && /^(?:\s*[=+@-]|[\t\r\n])/.test(text) ? `'${text}` : text;
  return `"${escaped.replace(/"/g, '""')}"`;
};

const sanitizeDisplayName = (value: string): string => {
  const cleaned = value
    .replace(/[\r\n\0"<>\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Otogrow';
};

// Preserves exact sub-cent precision up to 6 decimals (minimum 2) so accountant CSV totals reconcile cleanly.
const formatMicrosPlain = (micros: string): string => {
  const amount = BigInt(micros);
  const negative = amount < BigInt('0');
  const abs = negative ? -amount : amount;
  const whole = abs / BigInt('1000000');
  const rawFrac = (abs % BigInt('1000000'))
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '');
  const frac = rawFrac.length < 2 ? rawFrac.padEnd(2, '0') : rawFrac;
  return `${negative ? '-' : ''}${whole}.${frac}`;
};

const assertPositiveAed = (aedMicros: bigint, context: string): void => {
  if (aedMicros <= BigInt('0')) {
    throw new BadRequestException(
      `${context}: AED equivalent must be greater than zero.`,
    );
  }
};

@Injectable()
export class DeliveryFinanceV2Service {
  private readonly logger = new Logger(DeliveryFinanceV2Service.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
    private readonly storage: FileStorageDriverFactory,
    private readonly emailService: EmailService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  private async lockWorkspace(
    manager: EntityManager,
    workspaceId: string,
    exclusive: boolean,
  ): Promise<void> {
    await manager.query(
      `SELECT ${exclusive ? 'pg_advisory_xact_lock' : 'pg_advisory_xact_lock_shared'}(hashtextextended($1, 0))`,
      [`finance-v2:${workspaceId}`],
    );
  }

  private async authorize(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manage: boolean,
    requireAdmin = false,
  ) {
    await this.lockWorkspace(manager, workspace.id, manage);
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (requireAdmin) {
      if (!actor.isAdmin) {
        throw new ForbiddenException(
          'Payroll is restricted to workspace administrators.',
        );
      }
      return actor;
    }
    if (manage ? !canManageFinance(actor) : !canReadFinance(actor)) {
      throw new ForbiddenException(
        'Finance access is required for this section.',
      );
    }
    return actor;
  }

  private async insertOrIgnore(
    manager: EntityManager,
    entity: new () => object,
    values: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<void> {
    const repo = manager.getRepository(entity);
    if (typeof repo.createQueryBuilder === 'function') {
      await repo
        .createQueryBuilder()
        .insert()
        .into(entity)
        .values(values)
        .orIgnore()
        .execute();
    } else {
      // Fallback for lightweight unit-test in-memory repositories.
      const rows = Array.isArray(values) ? values : [values];
      for (const row of rows) {
        await repo.save(repo.create(row));
      }
    }
  }

  private async ensureProfile(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<DeliveryFinanceV2ProfileEntity> {
    const repo = manager.getRepository(DeliveryFinanceV2ProfileEntity);
    let profile = await repo.findOneBy({ workspaceId });
    if (!profile) {
      await this.insertOrIgnore(manager, DeliveryFinanceV2ProfileEntity, {
        id: randomUUID(),
        workspaceId,
        companyName: 'Otogrow',
        legalAddress: '',
        email: '',
        phone: '',
        website: '',
        logoDataUrl: null,
        bankDetails: '',
        defaultQuoteTerms:
          'Quote valid for 14 days. Work begins upon confirmation.',
        defaultInvoiceNotes: 'Thank you for working with us.',
        baseCurrency: FINANCE_V2_BASE_CURRENCY,
        quoteSequence: 1,
        invoiceSequence: 1,
        rateCard: [],
        exchangeRates: { ...FINANCE_V2_DEFAULT_FX_RATES },
      });
      profile = await repo.findOneBy({ workspaceId });
    }
    return profile!;
  }

  private async ensureSystemAccounts(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<Map<string, DeliveryFinanceV2AccountEntity>> {
    const repo = manager.getRepository(DeliveryFinanceV2AccountEntity);
    const existing = await repo.findBy({ workspaceId });
    const existingCodes = new Set(existing.map((account) => account.code));
    const missing: Record<string, unknown>[] = [];

    for (const spec of SYSTEM_ACCOUNTS) {
      if (!existingCodes.has(spec.code)) {
        missing.push({
          id: randomUUID(),
          workspaceId,
          code: spec.code,
          name: spec.name,
          accountType: spec.accountType,
          subType: spec.subType,
          currency: null,
          personName: null,
          personEmail: null,
          active: true,
        });
      }
    }

    // Bootstrap Company Cash accounts for all supported currencies so dropdowns never dead-end;
    // unused currencies are automatically omitted from Balance Sheet until posted to.
    for (const currency of FINANCE_V2_CURRENCIES) {
      const code = `CASH:${currency}`;
      if (!existingCodes.has(code)) {
        missing.push({
          id: randomUUID(),
          workspaceId,
          code,
          name: `Company Cash (${currency})`,
          accountType: 'ASSET',
          subType: 'CASH_CURRENCY',
          currency,
          personName: null,
          personEmail: null,
          active: true,
        });
      }
    }

    if (missing.length > 0) {
      await this.insertOrIgnore(
        manager,
        DeliveryFinanceV2AccountEntity,
        missing,
      );
    }

    const all = await repo.findBy({ workspaceId });
    return new Map(all.map((account) => [account.code, account]));
  }

  private async ensureCashAccount(
    manager: EntityManager,
    workspaceId: string,
    currency: FinanceV2Currency,
  ): Promise<DeliveryFinanceV2AccountEntity> {
    const repo = manager.getRepository(DeliveryFinanceV2AccountEntity);
    const code = `CASH:${currency}`;
    let account = await repo.findOneBy({ workspaceId, code });
    if (!account) {
      await this.insertOrIgnore(manager, DeliveryFinanceV2AccountEntity, {
        id: randomUUID(),
        workspaceId,
        code,
        name: `Company Cash (${currency})`,
        accountType: 'ASSET',
        subType: 'CASH_CURRENCY',
        currency,
        personName: null,
        personEmail: null,
        active: true,
      });
      account = await repo.findOneBy({ workspaceId, code });
    }
    return account!;
  }

  private resolveFxRate(
    profile: DeliveryFinanceV2ProfileEntity,
    currency: FinanceV2Currency,
    override?: string,
  ): string {
    if (currency === FINANCE_V2_BASE_CURRENCY) return '1';
    if (override) return override;
    return (
      profile.exchangeRates[currency] ??
      FINANCE_V2_DEFAULT_FX_RATES[currency] ??
      '1'
    );
  }

  private async postJournal(
    manager: EntityManager,
    params: {
      workspaceId: string;
      entryDate: string;
      entryType: FinanceV2JournalEntryType;
      category: string;
      title: string;
      notes?: string;
      currency: FinanceV2Currency;
      amountMicros: bigint;
      fxRateToAed: string;
      aedAmountMicros: bigint;
      fundingAccountId?: string | null;
      targetAccountId?: string | null;
      projectId?: string | null;
      employeeMemberId?: string | null;
      receiptUrl?: string | null;
      sourceRefType?: string | null;
      sourceRefId?: string | null;
      createdBy: string;
      lines: FinanceV2JournalLineDraft[];
    },
  ): Promise<DeliveryFinanceV2JournalEntity> {
    assertBalancedJournalLines(params.lines);

    const journalRepo = manager.getRepository(DeliveryFinanceV2JournalEntity);
    const lineRepo = manager.getRepository(DeliveryFinanceV2JournalLineEntity);

    if (params.sourceRefType && params.sourceRefId) {
      const existing = await journalRepo.findOneBy({
        workspaceId: params.workspaceId,
        sourceRefType: params.sourceRefType,
        sourceRefId: params.sourceRefId,
        status: 'POSTED',
      });
      if (existing) {
        return existing;
      }
    }

    const journal = journalRepo.create({
      id: randomUUID(),
      workspaceId: params.workspaceId,
      entryDate: params.entryDate,
      entryType: params.entryType,
      category: params.category,
      title: params.title,
      notes: params.notes ?? '',
      currency: params.currency,
      amountMicros: params.amountMicros.toString(),
      fxRateToAed: params.fxRateToAed,
      aedAmountMicros: (params.aedAmountMicros < BigInt('0')
        ? -params.aedAmountMicros
        : params.aedAmountMicros
      ).toString(),
      fundingAccountId: params.fundingAccountId ?? null,
      targetAccountId: params.targetAccountId ?? null,
      projectId: params.projectId ?? null,
      employeeMemberId: params.employeeMemberId ?? null,
      receiptUrl: params.receiptUrl ?? null,
      sourceRefType: params.sourceRefType ?? null,
      sourceRefId: params.sourceRefId ?? null,
      status: 'POSTED',
      reversalOfJournalId: null,
      createdBy: params.createdBy,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
    });
    await journalRepo.save(journal);

    const lineEntities = params.lines.map((line) =>
      lineRepo.create({
        id: randomUUID(),
        workspaceId: params.workspaceId,
        journalId: journal.id,
        accountId: line.accountId,
        debitAedMicros: line.debitAedMicros.toString(),
        creditAedMicros: line.creditAedMicros.toString(),
        currency: line.currency,
        originalSignedMicros: line.originalSignedMicros.toString(),
      }),
    );
    await lineRepo.save(lineEntities);
    return journal;
  }

  private async loadLedgerLines(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<FinanceV2LedgerLineRecord[]> {
    return manager.query<FinanceV2LedgerLineRecord[]>(
      `SELECT
        l."journalId",
        to_char(j."entryDate", 'YYYY-MM-DD') AS "entryDate",
        j."entryType",
        j."category",
        l."accountId",
        a."accountType",
        a."subType" AS "accountSubType",
        a."name" AS "accountName",
        a."currency" AS "accountCurrency",
        a."personName",
        l."debitAedMicros"::text AS "debitAedMicros",
        l."creditAedMicros"::text AS "creditAedMicros",
        l."currency",
        l."originalSignedMicros"::text AS "originalSignedMicros",
        j."status"
      FROM core."deliveryFinanceV2JournalLine" l
      JOIN core."deliveryFinanceV2Journal" j
        ON j."workspaceId" = l."workspaceId" AND j.id = l."journalId"
      JOIN core."deliveryFinanceV2Account" a
        ON a."workspaceId" = l."workspaceId" AND a.id = l."accountId"
      WHERE l."workspaceId" = $1
      ORDER BY j."entryDate" ASC, j."createdAt" ASC, l.id ASC`,
      [workspaceId],
    );
  }

  private async assertFundingAccount(
    manager: EntityManager,
    workspaceId: string,
    fundingAccountId: string,
  ): Promise<DeliveryFinanceV2AccountEntity> {
    const account = await manager
      .getRepository(DeliveryFinanceV2AccountEntity)
      .findOneBy({ workspaceId, id: fundingAccountId, active: true });
    if (
      !account ||
      (account.subType !== 'CASH_CURRENCY' &&
        account.subType !== 'PERSON_LIABILITY')
    ) {
      throw new BadRequestException(
        'Choose a valid Company Cash or Person Liability funding source.',
      );
    }
    return account;
  }

  private async assertWorkspaceProject(
    manager: EntityManager,
    workspaceId: string,
    projectId: string | null | undefined,
  ): Promise<void> {
    if (!projectId) return;
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId, id: projectId });
    if (!project) {
      throw new BadRequestException(
        'Selected project was not found in this workspace.',
      );
    }
  }

  private async assertWorkspaceMember(
    manager: EntityManager,
    workspaceId: string,
    employeeMemberId: string | null | undefined,
  ): Promise<void> {
    if (!employeeMemberId) return;
    const activeMembers = await this.access.listActiveMembers(
      workspaceId,
      manager,
    );
    if (!activeMembers.some((member) => member.memberId === employeeMemberId)) {
      throw new BadRequestException(
        'Selected team member was not found in this workspace.',
      );
    }
  }

  // Computes weighted-average AED carrying value for foreign CASH_CURRENCY outflows up to `asOfDate`
  // so emptying a foreign cash balance always leaves exactly 0.00 AED on the Balance Sheet.
  private async resolveCashOutflowCarryingAed(
    manager: EntityManager,
    workspaceId: string,
    account: DeliveryFinanceV2AccountEntity,
    amountMicros: bigint,
    spotAedMicros: bigint,
    asOfDate: string,
  ): Promise<bigint> {
    if (
      account.subType !== 'CASH_CURRENCY' ||
      !account.currency ||
      account.currency === FINANCE_V2_BASE_CURRENCY
    ) {
      return spotAedMicros;
    }
    const currentLines = await this.loadLedgerLines(manager, workspaceId);
    let curOrig = BigInt('0');
    let curAed = BigInt('0');
    for (const line of currentLines) {
      if (
        line.status === 'POSTED' &&
        line.accountId === account.id &&
        line.entryDate <= asOfDate
      ) {
        curOrig += BigInt(line.originalSignedMicros);
        curAed += BigInt(line.debitAedMicros) - BigInt(line.creditAedMicros);
      }
    }
    const carrying = computeWeightedCarryingAed(
      amountMicros,
      curOrig,
      curAed,
      spotAedMicros,
    );
    return carrying > BigInt('0') ? carrying : spotAedMicros;
  }

  private appendFxSpreadLines(
    lines: FinanceV2JournalLineDraft[],
    fxAccountId: string,
    debitAed: bigint,
    creditAed: bigint,
  ): void {
    const spread = debitAed - creditAed;
    if (spread > BigInt('0')) {
      lines.push({
        accountId: fxAccountId,
        debitAedMicros: BigInt('0'),
        creditAedMicros: spread,
        currency: FINANCE_V2_BASE_CURRENCY,
        originalSignedMicros: -spread,
      });
    } else if (spread < BigInt('0')) {
      const loss = -spread;
      lines.push({
        accountId: fxAccountId,
        debitAedMicros: loss,
        creditAedMicros: BigInt('0'),
        currency: FINANCE_V2_BASE_CURRENCY,
        originalSignedMicros: loss,
      });
    }
  }

  private async renderInvoicePdfBuffer(
    profile: DeliveryFinanceV2ProfileEntity,
    invoice: DeliveryFinanceV2InvoiceEntity,
    todayIso: string,
  ): Promise<Buffer> {
    const overdueDays = calculateOverdueDays(
      invoice.dueDate,
      todayIso,
      invoice.status,
      BigInt(invoice.totalMicros),
      BigInt(invoice.paidMicros),
    );
    return renderFinanceV2PdfBuffer({
      kind: 'INVOICE',
      documentNumber: invoice.invoiceNumber,
      statusLabel: invoice.status.replace('_', ' '),
      issueDate: invoice.issueDate,
      dueDateOrValidUntil: invoice.dueDate,
      overdueDays,
      companyName: profile.companyName,
      legalAddress: profile.legalAddress,
      companyEmail: profile.email,
      companyPhone: profile.phone,
      companyWebsite: profile.website,
      logoDataUrl: profile.logoDataUrl,
      bankDetails: profile.bankDetails,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      clientAddress: invoice.clientAddress,
      currency: invoice.currency,
      lineItems: invoice.lineItems,
      subtotalMicros: invoice.subtotalMicros,
      discountTotalMicros: invoice.discountTotalMicros,
      totalMicros: invoice.totalMicros,
      paidMicros: invoice.paidMicros,
      notes: invoice.notes || profile.defaultInvoiceNotes,
      terms: '',
    });
  }

  private async persistInvoicePdf(
    workspaceId: string,
    profile: DeliveryFinanceV2ProfileEntity,
    invoice: DeliveryFinanceV2InvoiceEntity,
    todayIso: string,
  ): Promise<{ buffer: Buffer; storagePath: string | null }> {
    const buffer = await this.renderInvoicePdfBuffer(
      profile,
      invoice,
      todayIso,
    );
    const storagePath = `workspace-${workspaceId}/finance-v2/invoices/${invoice.id}.pdf`;
    try {
      await this.storage.getCurrentDriver().writeFile({
        filePath: storagePath,
        sourceFile: buffer,
        mimeType: 'application/pdf',
      });
      await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(DeliveryFinanceV2InvoiceEntity);
        if (typeof repo.update === 'function') {
          await repo.update(
            { workspaceId, id: invoice.id },
            { pdfStoragePath: storagePath },
          );
        } else {
          const existing = await repo.findOneBy({
            workspaceId,
            id: invoice.id,
          });
          if (existing) {
            existing.pdfStoragePath = storagePath;
            await repo.save(existing);
          }
        }
      });
      return { buffer, storagePath };
    } catch (error) {
      this.logger.warn(
        `Could not persist PDF for invoice ${invoice.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { buffer, storagePath: null };
    }
  }

  private async renderQuotePdf(
    profile: DeliveryFinanceV2ProfileEntity,
    quote: DeliveryFinanceV2QuoteEntity,
  ): Promise<Buffer> {
    return renderFinanceV2PdfBuffer({
      kind: 'QUOTE',
      documentNumber: quote.quoteNumber,
      statusLabel: quote.status,
      issueDate: quote.issueDate,
      dueDateOrValidUntil: quote.validUntil,
      companyName: profile.companyName,
      legalAddress: profile.legalAddress,
      companyEmail: profile.email,
      companyPhone: profile.phone,
      companyWebsite: profile.website,
      logoDataUrl: profile.logoDataUrl,
      bankDetails: '',
      clientName: quote.clientName,
      clientEmail: quote.clientEmail,
      clientAddress: quote.clientAddress,
      currency: quote.currency,
      lineItems: quote.lineItems,
      subtotalMicros: quote.subtotalMicros,
      discountTotalMicros: quote.discountTotalMicros,
      totalMicros: quote.totalMicros,
      notes: quote.notes,
      terms: quote.terms || profile.defaultQuoteTerms,
    });
  }

  private async nextDocumentNumber(
    manager: EntityManager,
    profile: DeliveryFinanceV2ProfileEntity,
    kind: 'QUOTE' | 'INVOICE',
    issueDate: string,
  ): Promise<string> {
    const year = issueDate.slice(0, 4);
    const seq =
      kind === 'QUOTE' ? profile.quoteSequence : profile.invoiceSequence;
    if (kind === 'QUOTE') {
      profile.quoteSequence = seq + 1;
    } else {
      profile.invoiceSequence = seq + 1;
    }
    await manager.getRepository(DeliveryFinanceV2ProfileEntity).save(profile);
    const prefix = kind === 'QUOTE' ? 'QT' : 'INV';
    return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  }

  async downloadQuotePdf(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    quoteId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { profile, quote } = await this.dataSource.transaction(
      async (manager) => {
        await this.authorize(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          false,
        );
        const prof = await this.ensureProfile(manager, workspace.id);
        const found = await manager
          .getRepository(DeliveryFinanceV2QuoteEntity)
          .findOneBy({ workspaceId: workspace.id, id: quoteId });
        if (!found) throw new NotFoundException('Quote not found.');
        return { profile: prof, quote: found };
      },
    );
    // Render PDF strictly outside DB transaction.
    const buffer = await this.renderQuotePdf(profile, quote);
    return { buffer, filename: `${quote.quoteNumber}.pdf` };
  }

  async downloadInvoicePdf(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    invoiceId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { profile, invoice } = await this.dataSource.transaction(
      async (manager) => {
        await this.authorize(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          false,
        );
        const prof = await this.ensureProfile(manager, workspace.id);
        const found = await manager
          .getRepository(DeliveryFinanceV2InvoiceEntity)
          .findOneBy({ workspaceId: workspace.id, id: invoiceId });
        if (!found) throw new NotFoundException('Invoice not found.');
        return { profile: prof, invoice: found };
      },
    );
    // Render read-only PDF strictly outside DB transaction (no write side-effect on GET).
    const buffer = await this.renderInvoicePdfBuffer(
      profile,
      invoice,
      todayIsoDate(),
    );
    return { buffer, filename: `${invoice.invoiceNumber}.pdf` };
  }

  async runDueAutomationForWorkspace(
    workspaceId: string,
    actorMemberId: string,
    asOfDate = todayIsoDate(),
  ): Promise<{
    recurringExpensesPosted: number;
    payrollAdjustmentsPosted: number;
    invoicesCreated: number;
  }> {
    const invoicesToPersist: {
      profile: DeliveryFinanceV2ProfileEntity;
      invoice: DeliveryFinanceV2InvoiceEntity;
    }[] = [];

    const counts = await this.dataSource.transaction(async (manager) => {
      // Skip workspaces that have never initialized Finance V2 so the daily cron does not bootstrap unused workspaces.
      const existingProfile = await manager
        .getRepository(DeliveryFinanceV2ProfileEntity)
        .findOneBy({ workspaceId });
      if (!existingProfile) {
        return {
          recurringExpensesPosted: 0,
          payrollAdjustmentsPosted: 0,
          invoicesCreated: 0,
        };
      }

      await this.lockWorkspace(manager, workspaceId, true);
      const profile = await this.ensureProfile(manager, workspaceId);
      const systemAccounts = await this.ensureSystemAccounts(
        manager,
        workspaceId,
      );
      const allAccounts = await manager
        .getRepository(DeliveryFinanceV2AccountEntity)
        .findBy({ workspaceId });
      const accountById = new Map(allAccounts.map((acc) => [acc.id, acc]));
      const fxAccount = systemAccounts.get('FX:GAIN_LOSS')!;
      const currentMonth = monthOfDate(asOfDate);
      // Bounded 2-month window handles month-boundary catch-up and early-month paydays.
      const candidateMonths = [previousYearMonth(currentMonth), currentMonth];

      let recurringExpensesPosted = 0;
      let payrollAdjustmentsPosted = 0;
      let invoicesCreated = 0;

      const journalRepo = manager.getRepository(DeliveryFinanceV2JournalEntity);
      const payrollProfiles = await manager
        .getRepository(DeliveryFinanceV2PayrollProfileEntity)
        .findBy({ workspaceId, active: true });
      const allPayrollProfiles = await manager
        .getRepository(DeliveryFinanceV2PayrollProfileEntity)
        .findBy({ workspaceId });
      const payrollLinkedRecurringIds = new Set(
        allPayrollProfiles
          .map((p) => p.recurringExpenseId)
          .filter((id): id is string => Boolean(id)),
      );

      // 1. Due recurring expenses (bills & linked payroll base salaries)
      // Payroll-linked salaries with early-month paydays (days 1-10) shift settlementMonth identically
      // to Step 2 so base salary and monthly adjustments land on the same payday and P&L month.
      const recurringRules = await manager
        .getRepository(DeliveryFinanceV2RecurringExpenseEntity)
        .findBy({ workspaceId, status: 'ACTIVE' });

      for (const month of candidateMonths) {
        for (const rule of recurringRules) {
          if (month < rule.startMonth) continue;
          if (rule.endMonth && month > rule.endMonth) continue;
          const isPayrollBase =
            payrollLinkedRecurringIds.has(rule.id) ||
            Boolean(rule.employeeMemberId || rule.employeeName);
          const settlementMonth =
            isPayrollBase && rule.dayOfMonth <= 10
              ? nextYearMonth(month)
              : month;
          const scheduledDate = resolveScheduledDateForMonth(
            settlementMonth,
            rule.dayOfMonth,
          );
          if (scheduledDate > asOfDate) continue;

          const sourceRefType = 'RECURRING_EXPENSE';
          const sourceRefId = `${rule.id}:${month}`;
          // Check ANY status (POSTED or VOID) so admin-voided occurrences are never resurrected by cron.
          const existing = await journalRepo.findOneBy({
            workspaceId,
            sourceRefType,
            sourceRefId,
          });
          if (existing) continue;

          const fxRate = this.resolveFxRate(profile, rule.currency);
          const amount = BigInt(rule.amountMicros);
          const aedAmount = convertToAedMicros(amount, rule.currency, fxRate);
          if (aedAmount <= BigInt('0')) {
            this.logger.warn(
              `Skipping recurring expense ${rule.id} (${month}): AED equivalent rounded to zero.`,
            );
            continue;
          }
          const targetCode =
            rule.expenseType === 'DIRECT_EXPENSE'
              ? 'EXPENSE:DIRECT'
              : 'EXPENSE:INDIRECT';
          const targetAccount = systemAccounts.get(targetCode)!;
          const fundingAccount = accountById.get(rule.fundingAccountId);
          const fundingAed = fundingAccount
            ? await this.resolveCashOutflowCarryingAed(
                manager,
                workspaceId,
                fundingAccount,
                amount,
                aedAmount,
                scheduledDate,
              )
            : aedAmount;
          const lines: FinanceV2JournalLineDraft[] = [
            {
              accountId: targetAccount.id,
              debitAedMicros: aedAmount,
              creditAedMicros: BigInt('0'),
              currency: rule.currency,
              originalSignedMicros: amount,
            },
            {
              accountId: rule.fundingAccountId,
              debitAedMicros: BigInt('0'),
              creditAedMicros: fundingAed,
              currency: rule.currency,
              originalSignedMicros: -amount,
            },
          ];
          this.appendFxSpreadLines(lines, fxAccount.id, aedAmount, fundingAed);

          await this.postJournal(manager, {
            workspaceId,
            entryDate: scheduledDate,
            entryType: isPayrollBase ? 'PAYROLL_BASE' : 'RECURRING_EXPENSE',
            category: rule.category,
            title: `${rule.title} (${month})`,
            notes: rule.notes,
            currency: rule.currency,
            amountMicros: amount,
            fxRateToAed: fxRate,
            aedAmountMicros: aedAmount,
            fundingAccountId: rule.fundingAccountId,
            targetAccountId: targetAccount.id,
            employeeMemberId: rule.employeeMemberId,
            sourceRefType,
            sourceRefId,
            createdBy: actorMemberId,
            lines,
          });
          recurringExpensesPosted += 1;
        }
      }

      // 2. Due payday payroll adjustments (overtime, unpaid leave reduction, bonuses)
      // Early-month paydays (days 1-10) settle the PREVIOUS attendance month on the next month's payday
      // so mid-month entries are never prematurely backdated to day 1.
      for (const month of candidateMonths) {
        for (const payrollProfile of payrollProfiles) {
          const settlementMonth =
            payrollProfile.payDayOfMonth <= 10 ? nextYearMonth(month) : month;
          const paydayDate = resolveScheduledDateForMonth(
            settlementMonth,
            payrollProfile.payDayOfMonth,
          );
          if (paydayDate > asOfDate) continue;

          const postedCount = await this.postPayrollAdjustmentsInTransaction(
            manager,
            workspaceId,
            profile,
            systemAccounts,
            payrollProfile,
            month,
            paydayDate,
            actorMemberId,
            undefined,
            false,
          );
          payrollAdjustmentsPosted += postedCount;
        }
      }

      // 3. Due recurring client invoices (creates & saves PDF inside OS; NEVER auto-emails!)
      const invoiceSchedules = await manager
        .getRepository(DeliveryFinanceV2InvoiceScheduleEntity)
        .findBy({ workspaceId, status: 'ACTIVE' });

      const invoiceRepo = manager.getRepository(DeliveryFinanceV2InvoiceEntity);
      for (const month of candidateMonths) {
        for (const schedule of invoiceSchedules) {
          if (month < schedule.startMonth) continue;
          if (schedule.endMonth && month > schedule.endMonth) continue;
          const { issueDate, dueDate } = resolveRecurringInvoiceDates(
            month,
            schedule.billingDayOfMonth,
            schedule.dueDayOfMonth,
          );
          if (issueDate > asOfDate) continue;

          const existing = await invoiceRepo.findOneBy({
            workspaceId,
            scheduleId: schedule.id,
            scheduleMonth: month,
          });
          if (existing) continue;

          const invoiceNumber = await this.nextDocumentNumber(
            manager,
            profile,
            'INVOICE',
            issueDate,
          );
          const invoice = invoiceRepo.create({
            id: randomUUID(),
            workspaceId,
            invoiceNumber,
            scheduleId: schedule.id,
            scheduleMonth: month,
            sourceQuoteId: schedule.sourceQuoteId,
            clientName: schedule.clientName,
            clientEmail: schedule.clientEmail,
            clientAddress: schedule.clientAddress,
            projectId: schedule.projectId,
            currency: schedule.currency,
            issueDate,
            dueDate,
            lineItems: schedule.lineItems,
            subtotalMicros: schedule.subtotalMicros,
            discountTotalMicros: schedule.discountTotalMicros,
            totalMicros: schedule.totalMicros,
            paidMicros: '0',
            status: 'READY',
            pdfStoragePath: null,
            sentAt: null,
            sentBy: null,
            sentVia: null,
            notes: schedule.notes || profile.defaultInvoiceNotes,
            voidReason: null,
            voidedAt: null,
            createdBy: actorMemberId,
          });
          await invoiceRepo.save(invoice);
          invoicesToPersist.push({ profile: { ...profile }, invoice });
          invoicesCreated += 1;
        }
      }

      return {
        recurringExpensesPosted,
        payrollAdjustmentsPosted,
        invoicesCreated,
      };
    });

    // Generate & store PDFs outside the DB transaction so heavy PDF rendering never holds DB locks.
    for (const item of invoicesToPersist) {
      await this.persistInvoicePdf(
        workspaceId,
        item.profile,
        item.invoice,
        asOfDate,
      );
    }

    return counts;
  }

  private async postPayrollAdjustmentsInTransaction(
    manager: EntityManager,
    workspaceId: string,
    profile: DeliveryFinanceV2ProfileEntity,
    systemAccounts: Map<string, DeliveryFinanceV2AccountEntity>,
    payrollProfile: DeliveryFinanceV2PayrollProfileEntity,
    month: string,
    paydayDate: string,
    actorMemberId: string,
    fxOverride: string | undefined,
    forceResync: boolean,
  ): Promise<number> {
    const entries = await manager
      .getRepository(DeliveryFinanceV2PayrollEntryEntity)
      .findBy({ workspaceId, profileId: payrollProfile.id, month });
    const summary = calculateMonthlyPayroll({
      profileId: payrollProfile.id,
      employeeName: payrollProfile.employeeName,
      month,
      currency: payrollProfile.currency,
      baseSalaryMicros: BigInt(payrollProfile.baseSalaryMicros),
      workingDaysPerMonth: payrollProfile.workingDaysPerMonth,
      paidLeavesPerMonth: payrollProfile.paidLeavesPerMonth,
      entries,
    });

    const fxRate = this.resolveFxRate(
      profile,
      payrollProfile.currency,
      fxOverride,
    );
    const directExpenseAccount = systemAccounts.get('EXPENSE:DIRECT')!;
    const journalRepo = manager.getRepository(DeliveryFinanceV2JournalEntity);

    const specs: {
      refSuffix: string;
      entryType: FinanceV2JournalEntryType;
      category: string;
      title: string;
      note: string;
      amountMicros: bigint;
      isReduction: boolean;
    }[] = [
      {
        refSuffix: 'OVERTIME',
        entryType: 'PAYROLL_OVERTIME',
        category: 'PAYROLL_OVERTIME',
        title: `${payrollProfile.employeeName} — Overtime (${summary.overtimeDays}d, ${month})`,
        note: `Overtime pay: ${summary.overtimeDays} days @ ${formatMicrosPlain(summary.perDayMicros)}/day (${payrollProfile.workingDaysPerMonth} working days).`,
        amountMicros: BigInt(summary.overtimePayMicros),
        isReduction: false,
      },
      {
        refSuffix: 'LEAVE_REDUCTION',
        entryType: 'PAYROLL_LEAVE_REDUCTION',
        category: 'PAYROLL_LEAVE_REDUCTION',
        title: `${payrollProfile.employeeName} — Unpaid Leave Reduction (${summary.unpaidLeaveDays}d, ${month})`,
        note: `Unpaid leave adjustment (${summary.unpaidLeaveDays}d) for ${month}.`,
        amountMicros: BigInt(summary.unpaidLeaveDeductionMicros),
        isReduction: true,
      },
      {
        refSuffix: 'BONUS',
        entryType: 'PAYROLL_BONUS',
        category: 'PAYROLL_BONUS',
        title: `${payrollProfile.employeeName} — Bonus (${month})`,
        note: `Monthly bonus from payroll (${month}).`,
        amountMicros: BigInt(summary.bonusTotalMicros),
        isReduction: false,
      },
    ];

    let posted = 0;
    for (const spec of specs) {
      const sourceRefType = 'PAYROLL_ADJUSTMENT';
      const sourceRefId = `${payrollProfile.id}:${month}:${spec.refSuffix}`;

      if (!forceResync) {
        // In automated runs, check ANY status so admin-voided adjustments are never resurrected.
        const anyExisting = await journalRepo.findOneBy({
          workspaceId,
          sourceRefType,
          sourceRefId,
        });
        if (anyExisting) continue;
      } else {
        const postedExisting = await journalRepo.findOneBy({
          workspaceId,
          sourceRefType,
          sourceRefId,
          status: 'POSTED',
        });
        if (postedExisting) {
          postedExisting.status = 'VOID';
          postedExisting.voidedBy = actorMemberId;
          postedExisting.voidedAt = new Date();
          postedExisting.voidReason = 'Recalculated payroll adjustments';
          await journalRepo.save(postedExisting);
        }
      }

      if (spec.amountMicros <= BigInt('0')) continue;

      const aedAmount = convertToAedMicros(
        spec.amountMicros,
        payrollProfile.currency,
        fxRate,
      );
      if (aedAmount <= BigInt('0')) continue;

      const fxAccount = systemAccounts.get('FX:GAIN_LOSS')!;
      const fundingAccount = await manager
        .getRepository(DeliveryFinanceV2AccountEntity)
        .findOneBy({ workspaceId, id: payrollProfile.fundingAccountId });
      const fundingAed =
        !spec.isReduction && fundingAccount
          ? await this.resolveCashOutflowCarryingAed(
              manager,
              workspaceId,
              fundingAccount,
              spec.amountMicros,
              aedAmount,
              paydayDate,
            )
          : aedAmount;

      const lines: FinanceV2JournalLineDraft[] = spec.isReduction
        ? [
            {
              accountId: payrollProfile.fundingAccountId,
              debitAedMicros: aedAmount,
              creditAedMicros: BigInt('0'),
              currency: payrollProfile.currency,
              originalSignedMicros: spec.amountMicros,
            },
            {
              accountId: directExpenseAccount.id,
              debitAedMicros: BigInt('0'),
              creditAedMicros: aedAmount,
              currency: payrollProfile.currency,
              originalSignedMicros: -spec.amountMicros,
            },
          ]
        : [
            {
              accountId: directExpenseAccount.id,
              debitAedMicros: aedAmount,
              creditAedMicros: BigInt('0'),
              currency: payrollProfile.currency,
              originalSignedMicros: spec.amountMicros,
            },
            {
              accountId: payrollProfile.fundingAccountId,
              debitAedMicros: BigInt('0'),
              creditAedMicros: fundingAed,
              currency: payrollProfile.currency,
              originalSignedMicros: -spec.amountMicros,
            },
          ];
      if (!spec.isReduction) {
        this.appendFxSpreadLines(lines, fxAccount.id, aedAmount, fundingAed);
      }

      await this.postJournal(manager, {
        workspaceId,
        entryDate: paydayDate,
        entryType: spec.entryType,
        category: spec.category,
        title: spec.title,
        notes: spec.note,
        currency: payrollProfile.currency,
        amountMicros: spec.isReduction ? -spec.amountMicros : spec.amountMicros,
        fxRateToAed: fxRate,
        aedAmountMicros: aedAmount,
        fundingAccountId: payrollProfile.fundingAccountId,
        targetAccountId: directExpenseAccount.id,
        employeeMemberId: payrollProfile.employeeMemberId,
        sourceRefType,
        sourceRefId,
        createdBy: actorMemberId,
        lines,
      });
      posted += 1;
    }

    return posted;
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    rawInput: unknown,
    now = new Date(),
  ) {
    const query = parseFinanceV2Input(
      financeV2SnapshotQuerySchema,
      rawInput ?? {},
    );
    const today = todayIsoDate(now);
    const currentMonth = monthOfDate(today);
    const fromDate = query.fromDate ?? firstDayOfMonth(currentMonth);
    const toDate = query.toDate ?? today;
    if (fromDate > toDate) {
      throw new BadRequestException(
        'P&L "From" date cannot be later than "To" date.',
      );
    }
    const asOfDate = query.asOfDate ?? today;
    const payrollMonth = query.payrollMonth ?? currentMonth;

    return this.dataSource.transaction(async (manager) => {
      const actor = await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        false,
      );
      const canViewPayroll = actor.isAdmin;
      const profile = await this.ensureProfile(manager, workspace.id);
      await this.ensureSystemAccounts(manager, workspace.id);

      const accounts = await manager
        .getRepository(DeliveryFinanceV2AccountEntity)
        .find({
          where: { workspaceId: workspace.id },
          order: { accountType: 'ASC', name: 'ASC' },
        });
      const accountById = new Map(accounts.map((item) => [item.id, item]));
      const personEmails = new Map(
        accounts
          .filter((item) => item.subType === 'PERSON_LIABILITY')
          .map((item) => [item.id, item.personEmail]),
      );

      const ledgerLines = await this.loadLedgerLines(manager, workspace.id);
      const profitAndLoss = calculateProfitAndLoss(
        ledgerLines,
        fromDate,
        toDate,
      );
      const balanceSheet = calculateBalanceSheet(
        ledgerLines,
        asOfDate,
        personEmails,
      );

      const allJournals = await manager
        .getRepository(DeliveryFinanceV2JournalEntity)
        .find({
          where: { workspaceId: workspace.id },
          order: { entryDate: 'DESC', createdAt: 'DESC' },
          take: 500,
        });

      const allRecurringExpenses = await manager
        .getRepository(DeliveryFinanceV2RecurringExpenseEntity)
        .find({
          where: { workspaceId: workspace.id },
          order: { status: 'ASC', dayOfMonth: 'ASC', title: 'ASC' },
        });

      const allPayrollProfiles = await manager
        .getRepository(DeliveryFinanceV2PayrollProfileEntity)
        .find({
          where: { workspaceId: workspace.id },
          order: { active: 'DESC', employeeName: 'ASC' },
        });
      const payrollLinkedRecurringIds = new Set(
        allPayrollProfiles
          .map((p) => p.recurringExpenseId)
          .filter((id): id is string => Boolean(id)),
      );

      // G6-ACCESS-PRIVACY: Individual employee salaries, payroll adjustments, and internal paid leave rules
      // are returned strictly to workspace administrators.
      const journals = canViewPayroll
        ? allJournals
        : allJournals.filter(
            (item) => !PAYROLL_JOURNAL_TYPES.has(item.entryType),
          );

      const recurringExpenses = canViewPayroll
        ? allRecurringExpenses
        : allRecurringExpenses.filter(
            (rule) =>
              !payrollLinkedRecurringIds.has(rule.id) &&
              !rule.employeeName &&
              !rule.employeeMemberId,
          );

      const payrollProfiles = canViewPayroll ? allPayrollProfiles : [];

      const payrollEntries = canViewPayroll
        ? await manager
            .getRepository(DeliveryFinanceV2PayrollEntryEntity)
            .find({
              where: { workspaceId: workspace.id, month: payrollMonth },
              order: { eventDate: 'DESC', createdAt: 'DESC' },
            })
        : [];

      const payrollSummaries = payrollProfiles.map((prof) =>
        calculateMonthlyPayroll({
          profileId: prof.id,
          employeeName: prof.employeeName,
          month: payrollMonth,
          currency: prof.currency,
          baseSalaryMicros: BigInt(prof.baseSalaryMicros),
          workingDaysPerMonth: prof.workingDaysPerMonth,
          paidLeavesPerMonth: prof.paidLeavesPerMonth,
          entries: payrollEntries.filter(
            (entry) => entry.profileId === prof.id,
          ),
        }),
      );

      const quotes = await manager
        .getRepository(DeliveryFinanceV2QuoteEntity)
        .find({
          where: { workspaceId: workspace.id },
          order: { issueDate: 'DESC', createdAt: 'DESC' },
          take: 250,
        });

      const invoiceSchedules = await manager
        .getRepository(DeliveryFinanceV2InvoiceScheduleEntity)
        .find({
          where: { workspaceId: workspace.id },
          order: { status: 'ASC', billingDayOfMonth: 'ASC', clientName: 'ASC' },
        });

      // Load ALL invoices for accurate unpaid/overdue totals (no silent truncation).
      const allInvoices = await manager
        .getRepository(DeliveryFinanceV2InvoiceEntity)
        .find({
          where: { workspaceId: workspace.id },
          order: { dueDate: 'DESC', createdAt: 'DESC' },
        });

      const invoicePaymentJournals = await manager
        .getRepository(DeliveryFinanceV2JournalEntity)
        .find({
          where: {
            workspaceId: workspace.id,
            entryType: 'INVOICE_PAYMENT',
            sourceRefType: 'INVOICE_PAYMENT',
          },
          order: { entryDate: 'DESC', createdAt: 'DESC' },
        });
      const paymentsByInvoiceId = new Map<
        string,
        {
          journalId: string;
          paymentDate: string;
          amountMicros: string;
          aedAmountMicros: string;
          currency: FinanceV2Currency;
          status: string;
        }[]
      >();
      for (const journal of invoicePaymentJournals) {
        if (journal.sourceRefId) {
          const [invoiceId] = journal.sourceRefId.split(':');
          const list = paymentsByInvoiceId.get(invoiceId) ?? [];
          list.push({
            journalId: journal.id,
            paymentDate: journal.entryDate,
            amountMicros: journal.amountMicros,
            aedAmountMicros: journal.aedAmountMicros,
            currency: journal.currency,
            status: journal.status,
          });
          paymentsByInvoiceId.set(invoiceId, list);
        }
      }

      let pendingUnpaidAed = BigInt('0');
      let pendingUnpaidCount = 0;
      let overdueAed = BigInt('0');
      let overdueCount = 0;

      const enrichedInvoices = allInvoices.map((invoice) => {
        const total = BigInt(invoice.totalMicros);
        const paid = BigInt(invoice.paidMicros);
        const outstanding = total > paid ? total - paid : BigInt('0');
        const overdueDays = calculateOverdueDays(
          invoice.dueDate,
          today,
          invoice.status,
          total,
          paid,
        );
        if (invoice.status !== 'VOID' && outstanding > BigInt('0')) {
          const fx = this.resolveFxRate(profile, invoice.currency);
          const outstandingAed = convertToAedMicros(
            outstanding,
            invoice.currency,
            fx,
          );
          pendingUnpaidAed += outstandingAed;
          pendingUnpaidCount += 1;
          if (overdueDays > 0) {
            overdueAed += outstandingAed;
            overdueCount += 1;
          }
        }
        return {
          ...invoice,
          outstandingMicros: outstanding.toString(),
          overdueDays,
          payments: paymentsByInvoiceId.get(invoice.id) ?? [],
          sentAt: invoice.sentAt?.toISOString() ?? null,
          voidedAt: invoice.voidedAt?.toISOString() ?? null,
          createdAt: invoice.createdAt.toISOString(),
          updatedAt: invoice.updatedAt.toISOString(),
        };
      });

      // Keep open/unpaid (and most overdue) invoices ahead of paid/voided before slicing for UI display.
      const sortedInvoices = [...enrichedInvoices].sort((left, right) => {
        const leftOpen = left.status !== 'PAID' && left.status !== 'VOID';
        const rightOpen = right.status !== 'PAID' && right.status !== 'VOID';
        if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
        if (leftOpen && left.overdueDays !== right.overdueDays) {
          return right.overdueDays - left.overdueDays;
        }
        return right.dueDate.localeCompare(left.dueDate);
      });

      // Query exact imported AI spend refs without journal slice truncation.
      const settledAiSpends = await manager
        .getRepository(OtogrowAiSpendEntity)
        .find({
          where: { workspaceId: workspace.id, state: 'SETTLED' },
          order: { createdAt: 'DESC' },
          take: 100,
        });
      const candidateSpendIds = settledAiSpends.map((s) => s.id);
      const importedAiRows =
        candidateSpendIds.length > 0
          ? await manager.getRepository(DeliveryFinanceV2JournalEntity).findBy({
              workspaceId: workspace.id,
              sourceRefType: 'AI_SPEND',
              sourceRefId: In(candidateSpendIds),
              status: 'POSTED',
            })
          : [];
      const importedAiRefs = new Set(
        importedAiRows
          .map((item) => item.sourceRefId)
          .filter((value): value is string => Boolean(value)),
      );
      const aiSpendCandidates = settledAiSpends
        .filter(
          (spend) =>
            !importedAiRefs.has(spend.id) &&
            BigInt(spend.actualMicroUsd ?? spend.reservedMicroUsd) >
              BigInt('0'),
        )
        .map((spend) => ({
          id: spend.id,
          sourceKind: spend.sourceKind,
          clientName: spend.clientName,
          taskName: spend.taskName,
          amountMicros: spend.actualMicroUsd ?? spend.reservedMicroUsd,
          currency: 'USD' as FinanceV2Currency,
          occurredAt: (spend.settledAt ?? spend.createdAt)
            .toISOString()
            .slice(0, 10),
        }));

      const projects = await manager.getRepository(DeliveryProjectEntity).find({
        where: { workspaceId: workspace.id },
        order: { name: 'ASC' },
      });
      const activeMembers = await this.access.listActiveMembers(
        workspace.id,
        manager,
      );

      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        canManage: canManageFinance(actor),
        canViewPayroll,
        today,
        fromDate,
        toDate,
        asOfDate,
        payrollMonth,
        profile: {
          ...profile,
          exchangeRates: {
            ...FINANCE_V2_DEFAULT_FX_RATES,
            ...profile.exchangeRates,
          },
        },
        accounts: accounts.map((account) => ({
          id: account.id,
          code: account.code,
          name: account.name,
          accountType: account.accountType,
          subType: account.subType,
          currency: account.currency,
          personName: account.personName,
          personEmail: account.personEmail,
          active: account.active,
        })),
        profitAndLoss,
        balanceSheet,
        pendingReceivables: {
          count: pendingUnpaidCount,
          totalAedMicros: pendingUnpaidAed.toString(),
          overdueCount,
          overdueAedMicros: overdueAed.toString(),
        },
        journals: journals.map((item) => ({
          ...item,
          fundingAccountName: item.fundingAccountId
            ? (accountById.get(item.fundingAccountId)?.name ?? null)
            : null,
          targetAccountName: item.targetAccountId
            ? (accountById.get(item.targetAccountId)?.name ?? null)
            : null,
          voidedAt: item.voidedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        recurringExpenses: recurringExpenses.map((rule) => ({
          ...rule,
          fundingAccountName:
            accountById.get(rule.fundingAccountId)?.name ?? 'Unknown account',
          createdAt: rule.createdAt.toISOString(),
          updatedAt: rule.updatedAt.toISOString(),
        })),
        payrollProfiles: payrollProfiles.map((prof) => ({
          ...prof,
          fundingAccountName:
            accountById.get(prof.fundingAccountId)?.name ?? 'Unknown account',
          createdAt: prof.createdAt.toISOString(),
          updatedAt: prof.updatedAt.toISOString(),
        })),
        payrollSummaries,
        payrollEntries: payrollEntries.map((entry) => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
        })),
        quotes: quotes.map((quote) => ({
          ...quote,
          sentAt: quote.sentAt?.toISOString() ?? null,
          voidedAt: quote.voidedAt?.toISOString() ?? null,
          createdAt: quote.createdAt.toISOString(),
          updatedAt: quote.updatedAt.toISOString(),
        })),
        invoiceSchedules: invoiceSchedules.map((schedule) => ({
          ...schedule,
          createdAt: schedule.createdAt.toISOString(),
          updatedAt: schedule.updatedAt.toISOString(),
        })),
        invoices: sortedInvoices.slice(0, 250),
        aiSpendCandidates,
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
        })),
        members: activeMembers.map((member) => ({
          id: member.memberId,
          name: member.name,
        })),
      };
    });
  }

  async command(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    rawInput: unknown,
    now = new Date(),
  ): Promise<Record<string, unknown>> {
    const input = parseFinanceV2Input(financeV2CommandSchema, rawInput);
    const today = todayIsoDate(now);

    if (input.action === 'runDueAutomation') {
      await this.dataSource.transaction(async (manager) => {
        await this.authorize(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          true,
        );
      });
      return this.runDueAutomationForWorkspace(
        workspace.id,
        memberId,
        input.asOfDate ?? today,
      );
    }

    if (input.action === 'exportCsv') {
      return this.exportCsvDedicated(
        workspace,
        memberId,
        userWorkspaceId,
        input,
        now,
      );
    }

    // Track post-commit side effects (PDF persistence & BullMQ emails) so external I/O
    // NEVER executes inside an open DB transaction or before commit!
    let postCommitInvoicePdf: {
      profile: DeliveryFinanceV2ProfileEntity;
      invoice: DeliveryFinanceV2InvoiceEntity;
    } | null = null;
    let postCommitEmail:
      | {
          kind: 'QUOTE';
          profile: DeliveryFinanceV2ProfileEntity;
          quote: DeliveryFinanceV2QuoteEntity;
          recipient: string;
          message: string;
        }
      | {
          kind: 'INVOICE';
          profile: DeliveryFinanceV2ProfileEntity;
          invoice: DeliveryFinanceV2InvoiceEntity;
          recipient: string;
          message: string;
        }
      | null = null;

    const isPayrollMutation = [
      'savePayrollProfile',
      'addPayrollEntry',
      'deletePayrollEntry',
      'postPayrollAdjustments',
    ].includes(input.action);

    const txResult = await this.dataSource.transaction(async (manager) => {
      const actor = await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        true,
        isPayrollMutation,
      );
      const profile = await this.ensureProfile(manager, workspace.id);
      const systemAccounts = await this.ensureSystemAccounts(
        manager,
        workspace.id,
      );

      switch (input.action) {
        case 'saveCompanyProfile': {
          profile.companyName = input.companyName;
          profile.legalAddress = input.legalAddress;
          profile.email = input.email;
          profile.phone = input.phone;
          profile.website = input.website;
          if (input.logoDataUrl !== undefined) {
            profile.logoDataUrl = input.logoDataUrl;
          }
          profile.bankDetails = input.bankDetails;
          profile.defaultQuoteTerms = input.defaultQuoteTerms;
          profile.defaultInvoiceNotes = input.defaultInvoiceNotes;
          if (input.rateCard !== undefined) {
            profile.rateCard = input.rateCard;
          }
          await manager
            .getRepository(DeliveryFinanceV2ProfileEntity)
            .save(profile);
          return { ok: true, profileId: profile.id };
        }

        case 'saveExchangeRates': {
          profile.exchangeRates = {
            ...FINANCE_V2_DEFAULT_FX_RATES,
            ...profile.exchangeRates,
            ...input.exchangeRates,
            AED: '1',
          };
          await manager
            .getRepository(DeliveryFinanceV2ProfileEntity)
            .save(profile);
          return { ok: true, exchangeRates: profile.exchangeRates };
        }

        case 'savePersonLiability': {
          const repo = manager.getRepository(DeliveryFinanceV2AccountEntity);
          const allPeople = await repo.findBy({
            workspaceId: workspace.id,
            subType: 'PERSON_LIABILITY',
            active: true,
          });
          const normalized = input.personName.trim().toLowerCase();
          const duplicate = allPeople.find(
            (p) =>
              p.id !== input.id &&
              (p.personName ?? p.name).trim().toLowerCase() === normalized,
          );
          if (duplicate) {
            throw new BadRequestException(
              `A person named "${input.personName}" already exists under Liabilities.`,
            );
          }

          let account: DeliveryFinanceV2AccountEntity;
          if (input.id) {
            const existing = await repo.findOneBy({
              workspaceId: workspace.id,
              id: input.id,
              subType: 'PERSON_LIABILITY',
            });
            if (!existing) {
              throw new NotFoundException(
                'Person liability account not found.',
              );
            }
            existing.personName = input.personName;
            existing.name = `Owed to ${input.personName}`;
            existing.personEmail = input.personEmail || null;
            existing.currency = input.currency;
            account = await repo.save(existing);
          } else {
            const id = randomUUID();
            account = repo.create({
              id,
              workspaceId: workspace.id,
              code: `LIABILITY:PERSON:${id}`,
              name: `Owed to ${input.personName}`,
              accountType: 'LIABILITY',
              subType: 'PERSON_LIABILITY',
              currency: input.currency,
              personName: input.personName,
              personEmail: input.personEmail || null,
              active: true,
            });
            await repo.save(account);
          }
          return { ok: true, accountId: account.id };
        }

        case 'recordOpeningBalance': {
          const equityAccount = systemAccounts.get('EQUITY:OPENING')!;
          const fxRate = this.resolveFxRate(
            profile,
            input.currency,
            input.fxRateToAed,
          );
          const amount = BigInt(input.amountMicros);
          const aedAmount = convertToAedMicros(amount, input.currency, fxRate);
          assertPositiveAed(aedAmount, 'Opening balance');

          let lines: FinanceV2JournalLineDraft[];
          let targetAccountId: string;

          if (input.kind === 'CASH') {
            const cashAccount = await this.ensureCashAccount(
              manager,
              workspace.id,
              input.currency,
            );
            targetAccountId = cashAccount.id;
            lines = [
              {
                accountId: cashAccount.id,
                debitAedMicros: aedAmount,
                creditAedMicros: BigInt('0'),
                currency: input.currency,
                originalSignedMicros: amount,
              },
              {
                accountId: equityAccount.id,
                debitAedMicros: BigInt('0'),
                creditAedMicros: aedAmount,
                currency: input.currency,
                originalSignedMicros: -amount,
              },
            ];
          } else if (input.kind === 'FIXED_ASSET') {
            const assetAccount = systemAccounts.get('ASSET:EQUIPMENT')!;
            targetAccountId = assetAccount.id;
            lines = [
              {
                accountId: assetAccount.id,
                debitAedMicros: aedAmount,
                creditAedMicros: BigInt('0'),
                currency: input.currency,
                originalSignedMicros: amount,
              },
              {
                accountId: equityAccount.id,
                debitAedMicros: BigInt('0'),
                creditAedMicros: aedAmount,
                currency: input.currency,
                originalSignedMicros: -amount,
              },
            ];
          } else {
            if (!input.personAccountId) {
              throw new BadRequestException(
                'Choose which person this opening liability is owed to.',
              );
            }
            const personAccount = await manager
              .getRepository(DeliveryFinanceV2AccountEntity)
              .findOneBy({
                workspaceId: workspace.id,
                id: input.personAccountId,
                subType: 'PERSON_LIABILITY',
              });
            if (!personAccount) {
              throw new NotFoundException(
                'Person liability account not found.',
              );
            }
            targetAccountId = personAccount.id;
            lines = [
              {
                accountId: equityAccount.id,
                debitAedMicros: aedAmount,
                creditAedMicros: BigInt('0'),
                currency: input.currency,
                originalSignedMicros: amount,
              },
              {
                accountId: personAccount.id,
                debitAedMicros: BigInt('0'),
                creditAedMicros: aedAmount,
                currency: input.currency,
                originalSignedMicros: -amount,
              },
            ];
          }

          const journal = await this.postJournal(manager, {
            workspaceId: workspace.id,
            entryDate: input.entryDate,
            entryType: 'OPENING_BALANCE',
            category: 'OPENING',
            title: input.title,
            notes: input.notes,
            currency: input.currency,
            amountMicros: amount,
            fxRateToAed: fxRate,
            aedAmountMicros: aedAmount,
            targetAccountId,
            createdBy: memberId,
            lines,
          });
          return { ok: true, journalId: journal.id };
        }

        case 'convertCurrency': {
          if (input.fromCurrency === input.toCurrency) {
            throw new BadRequestException(
              'Choose two different currencies to convert.',
            );
          }
          const fromAccount = await this.ensureCashAccount(
            manager,
            workspace.id,
            input.fromCurrency,
          );
          const toAccount = await this.ensureCashAccount(
            manager,
            workspace.id,
            input.toCurrency,
          );
          const fxAccount = systemAccounts.get('FX:GAIN_LOSS')!;

          const fromRate = this.resolveFxRate(
            profile,
            input.fromCurrency,
            input.fromFxRateToAed,
          );
          const toRate = this.resolveFxRate(
            profile,
            input.toCurrency,
            input.toFxRateToAed,
          );
          const fromAmount = BigInt(input.fromAmountMicros);
          const toAmount = BigInt(input.toAmountMicros);
          const fallbackFromAed = convertToAedMicros(
            fromAmount,
            input.fromCurrency,
            fromRate,
          );
          const toAed = convertToAedMicros(toAmount, input.toCurrency, toRate);

          // Use weighted-average carrying AED cost up to entryDate for foreign cash outflows unless overridden.
          const fromAed = input.fromFxRateToAed
            ? fallbackFromAed
            : await this.resolveCashOutflowCarryingAed(
                manager,
                workspace.id,
                fromAccount,
                fromAmount,
                fallbackFromAed,
                input.entryDate,
              );
          assertPositiveAed(fromAed, 'Source currency amount');
          assertPositiveAed(toAed, 'Target currency amount');

          const lines: FinanceV2JournalLineDraft[] = [
            {
              accountId: toAccount.id,
              debitAedMicros: toAed,
              creditAedMicros: BigInt('0'),
              currency: input.toCurrency,
              originalSignedMicros: toAmount,
            },
            {
              accountId: fromAccount.id,
              debitAedMicros: BigInt('0'),
              creditAedMicros: fromAed,
              currency: input.fromCurrency,
              originalSignedMicros: -fromAmount,
            },
          ];
          this.appendFxSpreadLines(lines, fxAccount.id, toAed, fromAed);

          const journal = await this.postJournal(manager, {
            workspaceId: workspace.id,
            entryDate: input.entryDate,
            entryType: 'FX_CONVERSION',
            category: 'FX',
            title: `Convert ${input.fromCurrency} → ${input.toCurrency}`,
            notes: input.notes,
            currency: input.toCurrency,
            amountMicros: toAmount,
            fxRateToAed: toRate,
            aedAmountMicros: toAed,
            fundingAccountId: fromAccount.id,
            targetAccountId: toAccount.id,
            createdBy: memberId,
            lines,
          });
          return { ok: true, journalId: journal.id };
        }

        case 'recordLoanIn': {
          const personAccount = await manager
            .getRepository(DeliveryFinanceV2AccountEntity)
            .findOneBy({
              workspaceId: workspace.id,
              id: input.personAccountId,
              subType: 'PERSON_LIABILITY',
            });
          if (!personAccount) {
            throw new NotFoundException('Person liability account not found.');
          }
          const cashAccount = await this.ensureCashAccount(
            manager,
            workspace.id,
            input.currency,
          );
          const fxRate = this.resolveFxRate(
            profile,
            input.currency,
            input.fxRateToAed,
          );
          const amount = BigInt(input.amountMicros);
          const aedAmount = convertToAedMicros(amount, input.currency, fxRate);
          assertPositiveAed(aedAmount, 'Loan amount');

          const journal = await this.postJournal(manager, {
            workspaceId: workspace.id,
            entryDate: input.entryDate,
            entryType: 'LOAN_IN',
            category: 'LOAN',
            title:
              input.title ||
              `Cash borrowed from ${personAccount.personName ?? personAccount.name}`,
            notes: input.notes,
            currency: input.currency,
            amountMicros: amount,
            fxRateToAed: fxRate,
            aedAmountMicros: aedAmount,
            fundingAccountId: personAccount.id,
            targetAccountId: cashAccount.id,
            createdBy: memberId,
            lines: [
              {
                accountId: cashAccount.id,
                debitAedMicros: aedAmount,
                creditAedMicros: BigInt('0'),
                currency: input.currency,
                originalSignedMicros: amount,
              },
              {
                accountId: personAccount.id,
                debitAedMicros: BigInt('0'),
                creditAedMicros: aedAmount,
                currency: input.currency,
                originalSignedMicros: -amount,
              },
            ],
          });
          return { ok: true, journalId: journal.id };
        }

        case 'recordLoanRepayment': {
          const personAccount = await manager
            .getRepository(DeliveryFinanceV2AccountEntity)
            .findOneBy({
              workspaceId: workspace.id,
              id: input.personAccountId,
              subType: 'PERSON_LIABILITY',
            });
          if (!personAccount) {
            throw new NotFoundException('Person liability account not found.');
          }
          const cashAccount = await this.ensureCashAccount(
            manager,
            workspace.id,
            input.currency,
          );
          const fxAccount = systemAccounts.get('FX:GAIN_LOSS')!;
          const cashRate = this.resolveFxRate(
            profile,
            input.currency,
            input.fxRateToAed,
          );
          const amount = BigInt(input.amountMicros);
          const cashSpotAed = convertToAedMicros(
            amount,
            input.currency,
            cashRate,
          );
          assertPositiveAed(cashSpotAed, 'Repayment amount');

          // Use weighted-average carrying AED on BOTH the foreign cash outflow and the foreign liability
          // up to entryDate so zeroing either account extinguishes its AED carrying balance cleanly.
          const cashAed = await this.resolveCashOutflowCarryingAed(
            manager,
            workspace.id,
            cashAccount,
            amount,
            cashSpotAed,
            input.entryDate,
          );
          assertPositiveAed(cashAed, 'Cash carrying amount');

          let liabilityAed: bigint;
          if (input.liabilityBookFxRateToAed) {
            liabilityAed = convertToAedMicros(
              amount,
              input.currency,
              input.liabilityBookFxRateToAed,
            );
          } else if (input.currency === 'AED') {
            liabilityAed = cashAed;
          } else {
            const currentLines = await this.loadLedgerLines(
              manager,
              workspace.id,
            );
            let owedOrig = BigInt('0');
            let owedAed = BigInt('0');
            for (const line of currentLines) {
              if (
                line.status === 'POSTED' &&
                line.accountId === personAccount.id &&
                line.currency === input.currency &&
                line.entryDate <= input.entryDate
              ) {
                const debit = BigInt(line.debitAedMicros);
                const credit = BigInt(line.creditAedMicros);
                owedAed += credit - debit;
                const orig = BigInt(line.originalSignedMicros);
                owedOrig +=
                  credit > BigInt('0')
                    ? orig < BigInt('0')
                      ? -orig
                      : orig
                    : -(orig < BigInt('0') ? -orig : orig);
              }
            }
            liabilityAed = computeWeightedCarryingAed(
              amount,
              owedOrig,
              owedAed,
              cashAed,
            );
          }
          assertPositiveAed(liabilityAed, 'Liability carrying amount');

          const lines: FinanceV2JournalLineDraft[] = [
            {
              accountId: personAccount.id,
              debitAedMicros: liabilityAed,
              creditAedMicros: BigInt('0'),
              currency: input.currency,
              originalSignedMicros: amount,
            },
            {
              accountId: cashAccount.id,
              debitAedMicros: BigInt('0'),
              creditAedMicros: cashAed,
              currency: input.currency,
              originalSignedMicros: -amount,
            },
          ];
          this.appendFxSpreadLines(lines, fxAccount.id, liabilityAed, cashAed);

          const journal = await this.postJournal(manager, {
            workspaceId: workspace.id,
            entryDate: input.entryDate,
            entryType: 'LOAN_REPAYMENT',
            category: 'LOAN',
            title:
              input.title ||
              `Repayment to ${personAccount.personName ?? personAccount.name}`,
            notes: input.notes,
            currency: input.currency,
            amountMicros: amount,
            fxRateToAed: cashRate,
            aedAmountMicros: cashAed,
            fundingAccountId: cashAccount.id,
            targetAccountId: personAccount.id,
            createdBy: memberId,
            lines,
          });
          return { ok: true, journalId: journal.id };
        }

        case 'recordExpenseOrAsset': {
          await this.assertWorkspaceProject(
            manager,
            workspace.id,
            input.projectId,
          );
          const funding = await this.assertFundingAccount(
            manager,
            workspace.id,
            input.fundingAccountId,
          );
          if (
            funding.subType === 'CASH_CURRENCY' &&
            funding.currency &&
            funding.currency !== input.currency
          ) {
            throw new BadRequestException(
              `Choose Company Cash (${input.currency}) or a Person Liability account for ${input.currency} entries.`,
            );
          }
          const fxRate = this.resolveFxRate(
            profile,
            input.currency,
            input.fxRateToAed,
          );
          const amount = BigInt(input.amountMicros);
          const aedAmount = convertToAedMicros(amount, input.currency, fxRate);
          assertPositiveAed(aedAmount, 'Expense or asset amount');
          const targetCode =
            input.entryKind === 'ASSET_PURCHASE'
              ? 'ASSET:EQUIPMENT'
              : input.entryKind === 'DIRECT_EXPENSE'
                ? 'EXPENSE:DIRECT'
                : 'EXPENSE:INDIRECT';
          const targetAccount = systemAccounts.get(targetCode)!;
          const fxAccount = systemAccounts.get('FX:GAIN_LOSS')!;
          const fundingAed = await this.resolveCashOutflowCarryingAed(
            manager,
            workspace.id,
            funding,
            amount,
            aedAmount,
            input.entryDate,
          );
          const lines: FinanceV2JournalLineDraft[] = [
            {
              accountId: targetAccount.id,
              debitAedMicros: aedAmount,
              creditAedMicros: BigInt('0'),
              currency: input.currency,
              originalSignedMicros: amount,
            },
            {
              accountId: funding.id,
              debitAedMicros: BigInt('0'),
              creditAedMicros: fundingAed,
              currency: input.currency,
              originalSignedMicros: -amount,
            },
          ];
          this.appendFxSpreadLines(lines, fxAccount.id, aedAmount, fundingAed);

          const journal = await this.postJournal(manager, {
            workspaceId: workspace.id,
            entryDate: input.entryDate,
            entryType:
              input.entryKind === 'ASSET_PURCHASE'
                ? 'ASSET_PURCHASE'
                : 'EXPENSE',
            category: input.category,
            title: input.title,
            notes: input.notes,
            currency: input.currency,
            amountMicros: amount,
            fxRateToAed: fxRate,
            aedAmountMicros: aedAmount,
            fundingAccountId: funding.id,
            targetAccountId: targetAccount.id,
            projectId: input.projectId,
            receiptUrl: input.receiptUrl,
            createdBy: memberId,
            lines,
          });
          await recordOtogrowActivity(manager, {
            workspaceId: workspace.id,
            actorId: memberId,
            category: 'BUSINESS',
            action: input.entryKind,
            outcome: 'RECORDED',
            summary: `${input.title} (${input.currency})`.slice(0, 240),
            projectId: input.projectId,
            sourceType: 'finance',
            sourceId: journal.id,
          });
          return { ok: true, journalId: journal.id };
        }

        case 'voidJournal': {
          const journalRepo = manager.getRepository(
            DeliveryFinanceV2JournalEntity,
          );
          const journal = await journalRepo.findOneBy({
            workspaceId: workspace.id,
            id: input.journalId,
          });
          if (!journal) throw new NotFoundException('Ledger entry not found.');
          if (PAYROLL_JOURNAL_TYPES.has(journal.entryType) && !actor.isAdmin) {
            throw new ForbiddenException(
              'Only workspace administrators can void payroll ledger entries.',
            );
          }
          if (journal.status === 'VOID') {
            throw new BadRequestException('This entry is already voided.');
          }
          journal.status = 'VOID';
          journal.voidedBy = memberId;
          journal.voidedAt = new Date();
          journal.voidReason = input.reason;
          await journalRepo.save(journal);

          if (
            journal.entryType === 'INVOICE_PAYMENT' &&
            journal.sourceRefType === 'INVOICE_PAYMENT' &&
            journal.sourceRefId
          ) {
            const [invoiceId] = journal.sourceRefId.split(':');
            const invoiceRepo = manager.getRepository(
              DeliveryFinanceV2InvoiceEntity,
            );
            const invoice = await invoiceRepo.findOneBy({
              workspaceId: workspace.id,
              id: invoiceId,
            });
            if (invoice && invoice.status !== 'VOID') {
              const currentPaid = BigInt(invoice.paidMicros);
              const paymentAmt = BigInt(journal.amountMicros);
              const nextPaid =
                currentPaid > paymentAmt
                  ? currentPaid - paymentAmt
                  : BigInt('0');
              invoice.paidMicros = nextPaid.toString();
              invoice.status =
                nextPaid === BigInt('0')
                  ? invoice.sentAt
                    ? 'SENT'
                    : 'READY'
                  : 'PARTIALLY_PAID';
              await invoiceRepo.save(invoice);
              postCommitInvoicePdf = { profile: { ...profile }, invoice };
            }
          }
          return { ok: true, journalId: journal.id };
        }

        case 'importAiSpend': {
          const funding = await this.assertFundingAccount(
            manager,
            workspace.id,
            input.fundingAccountId,
          );
          if (
            funding.subType === 'CASH_CURRENCY' &&
            funding.currency !== 'USD'
          ) {
            throw new BadRequestException(
              'AI charges are in USD. Pick Company Cash (USD) or a Person Liability account.',
            );
          }
          const spends = await manager
            .getRepository(OtogrowAiSpendEntity)
            .findBy({
              workspaceId: workspace.id,
              id: In(input.spendIds),
              state: 'SETTLED',
            });
          const directAccount = systemAccounts.get('EXPENSE:DIRECT')!;
          const fxRate = this.resolveFxRate(profile, 'USD', input.fxRateToAed);
          let importedCount = 0;

          for (const spend of spends) {
            const amount = BigInt(
              spend.actualMicroUsd ?? spend.reservedMicroUsd,
            );
            if (amount <= BigInt('0')) continue;
            const aedAmount = convertToAedMicros(amount, 'USD', fxRate);
            if (aedAmount <= BigInt('0')) continue;

            const existing = await manager
              .getRepository(DeliveryFinanceV2JournalEntity)
              .findOneBy({
                workspaceId: workspace.id,
                sourceRefType: 'AI_SPEND',
                sourceRefId: spend.id,
                status: 'POSTED',
              });
            if (existing) continue;

            const entryDate = (spend.settledAt ?? spend.createdAt)
              .toISOString()
              .slice(0, 10);
            const fxAccount = systemAccounts.get('FX:GAIN_LOSS')!;
            const fundingAed = await this.resolveCashOutflowCarryingAed(
              manager,
              workspace.id,
              funding,
              amount,
              aedAmount,
              entryDate,
            );
            const lines: FinanceV2JournalLineDraft[] = [
              {
                accountId: directAccount.id,
                debitAedMicros: aedAmount,
                creditAedMicros: BigInt('0'),
                currency: 'USD',
                originalSignedMicros: amount,
              },
              {
                accountId: funding.id,
                debitAedMicros: BigInt('0'),
                creditAedMicros: fundingAed,
                currency: 'USD',
                originalSignedMicros: -amount,
              },
            ];
            this.appendFxSpreadLines(
              lines,
              fxAccount.id,
              aedAmount,
              fundingAed,
            );

            await this.postJournal(manager, {
              workspaceId: workspace.id,
              entryDate,
              entryType: 'AI_COST',
              category: 'DIRECT_AI',
              title: `AI Production Spend — ${spend.taskName || spend.clientName || spend.sourceKind}`,
              notes: `Imported from AI spend record ${spend.id}`,
              currency: 'USD',
              amountMicros: amount,
              fxRateToAed: fxRate,
              aedAmountMicros: aedAmount,
              fundingAccountId: funding.id,
              targetAccountId: directAccount.id,
              projectId: spend.projectId,
              sourceRefType: 'AI_SPEND',
              sourceRefId: spend.id,
              createdBy: memberId,
              lines,
            });
            importedCount += 1;
          }
          return { ok: true, importedCount };
        }

        case 'saveRecurringExpense': {
          const funding = await this.assertFundingAccount(
            manager,
            workspace.id,
            input.fundingAccountId,
          );
          if (
            funding.subType === 'CASH_CURRENCY' &&
            funding.currency !== input.currency
          ) {
            throw new BadRequestException(
              `Choose Company Cash (${input.currency}) or a Person Liability account.`,
            );
          }
          if (input.endMonth && input.endMonth < input.startMonth) {
            throw new BadRequestException(
              'End month cannot be earlier than start month.',
            );
          }
          const repo = manager.getRepository(
            DeliveryFinanceV2RecurringExpenseEntity,
          );
          let rule: DeliveryFinanceV2RecurringExpenseEntity;
          if (input.id) {
            const existing = await repo.findOneBy({
              workspaceId: workspace.id,
              id: input.id,
            });
            if (!existing) {
              throw new NotFoundException('Recurring expense not found.');
            }
            const linkedProfile = await manager
              .getRepository(DeliveryFinanceV2PayrollProfileEntity)
              .findOneBy({
                workspaceId: workspace.id,
                recurringExpenseId: existing.id,
              });
            if (
              linkedProfile ||
              existing.employeeName ||
              existing.employeeMemberId
            ) {
              throw new ForbiddenException(
                'Employee base salaries are managed from the Payroll tab.',
              );
            }
            existing.title = input.title;
            existing.expenseType = input.expenseType;
            existing.category = input.category;
            existing.currency = input.currency;
            existing.amountMicros = input.amountMicros;
            existing.dayOfMonth = input.dayOfMonth;
            existing.fundingAccountId = input.fundingAccountId;
            existing.startMonth = input.startMonth;
            if (input.endMonth !== undefined) {
              existing.endMonth = input.endMonth;
            }
            if (input.notes !== undefined) {
              existing.notes = input.notes;
            }
            rule = await repo.save(existing);
          } else {
            rule = repo.create({
              id: randomUUID(),
              workspaceId: workspace.id,
              title: input.title,
              expenseType: input.expenseType,
              category: input.category,
              currency: input.currency,
              amountMicros: input.amountMicros,
              dayOfMonth: input.dayOfMonth,
              fundingAccountId: input.fundingAccountId,
              employeeMemberId: null,
              employeeName: null,
              notes: input.notes ?? '',
              startMonth: input.startMonth,
              endMonth: input.endMonth ?? null,
              status: 'ACTIVE',
              createdBy: memberId,
            });
            await repo.save(rule);
          }
          return { ok: true, recurringExpenseId: rule.id };
        }

        case 'setRecurringExpenseStatus': {
          const repo = manager.getRepository(
            DeliveryFinanceV2RecurringExpenseEntity,
          );
          const rule = await repo.findOneBy({
            workspaceId: workspace.id,
            id: input.id,
          });
          if (!rule) {
            throw new NotFoundException('Recurring expense not found.');
          }
          const payrollRepo = manager.getRepository(
            DeliveryFinanceV2PayrollProfileEntity,
          );
          const linkedProfile = await payrollRepo.findOneBy({
            workspaceId: workspace.id,
            recurringExpenseId: rule.id,
          });
          if (
            (linkedProfile || rule.employeeName || rule.employeeMemberId) &&
            !actor.isAdmin
          ) {
            throw new ForbiddenException(
              'Only workspace administrators can pause or stop employee salaries.',
            );
          }
          rule.status = input.status;
          await repo.save(rule);

          // Keep linked payroll profile active flag synchronized with its recurring base salary!
          if (linkedProfile) {
            linkedProfile.active = input.status === 'ACTIVE';
            await payrollRepo.save(linkedProfile);
          }
          return { ok: true, recurringExpenseId: rule.id, status: rule.status };
        }

        case 'savePayrollProfile': {
          await this.assertWorkspaceMember(
            manager,
            workspace.id,
            input.employeeMemberId,
          );
          const funding = await this.assertFundingAccount(
            manager,
            workspace.id,
            input.fundingAccountId,
          );
          if (
            funding.subType === 'CASH_CURRENCY' &&
            funding.currency !== input.currency
          ) {
            throw new BadRequestException(
              `Choose Company Cash (${input.currency}) or a Person Liability account for this salary.`,
            );
          }
          const profileRepo = manager.getRepository(
            DeliveryFinanceV2PayrollProfileEntity,
          );
          const recurringRepo = manager.getRepository(
            DeliveryFinanceV2RecurringExpenseEntity,
          );
          const startMonth = input.startMonth ?? monthOfDate(today);

          let payrollProfile: DeliveryFinanceV2PayrollProfileEntity;
          if (input.id) {
            const existing = await profileRepo.findOneBy({
              workspaceId: workspace.id,
              id: input.id,
            });
            if (!existing) {
              throw new NotFoundException('Payroll profile not found.');
            }
            existing.employeeMemberId = input.employeeMemberId;
            existing.employeeName = input.employeeName;
            existing.roleLabel = input.roleLabel;
            existing.currency = input.currency;
            existing.baseSalaryMicros = input.baseSalaryMicros;
            existing.workingDaysPerMonth = input.workingDaysPerMonth;
            existing.paidLeavesPerMonth = input.paidLeavesPerMonth;
            existing.payDayOfMonth = input.payDayOfMonth;
            existing.fundingAccountId = input.fundingAccountId;
            existing.active = input.active;
            payrollProfile = existing;
          } else {
            payrollProfile = profileRepo.create({
              id: randomUUID(),
              workspaceId: workspace.id,
              employeeMemberId: input.employeeMemberId,
              employeeName: input.employeeName,
              roleLabel: input.roleLabel,
              currency: input.currency,
              baseSalaryMicros: input.baseSalaryMicros,
              workingDaysPerMonth: input.workingDaysPerMonth,
              paidLeavesPerMonth: input.paidLeavesPerMonth,
              payDayOfMonth: input.payDayOfMonth,
              fundingAccountId: input.fundingAccountId,
              recurringExpenseId: null,
              active: input.active,
              createdBy: memberId,
            });
          }

          let linkedRule = payrollProfile.recurringExpenseId
            ? await recurringRepo.findOneBy({
                workspaceId: workspace.id,
                id: payrollProfile.recurringExpenseId,
              })
            : null;

          if (!linkedRule) {
            linkedRule = recurringRepo.create({
              id: randomUUID(),
              workspaceId: workspace.id,
              title: `${input.employeeName} — Base Salary`,
              expenseType: 'DIRECT_EXPENSE',
              category: 'DIRECT_SALARY',
              currency: input.currency,
              amountMicros: input.baseSalaryMicros,
              dayOfMonth: input.payDayOfMonth,
              fundingAccountId: input.fundingAccountId,
              employeeMemberId: input.employeeMemberId,
              employeeName: input.employeeName,
              notes: 'Linked automatically from Payroll.',
              startMonth,
              endMonth: null,
              status: input.active ? 'ACTIVE' : 'PAUSED',
              createdBy: memberId,
            });
          } else {
            linkedRule.title = `${input.employeeName} — Base Salary`;
            linkedRule.currency = input.currency;
            linkedRule.amountMicros = input.baseSalaryMicros;
            linkedRule.dayOfMonth = input.payDayOfMonth;
            linkedRule.fundingAccountId = input.fundingAccountId;
            linkedRule.employeeMemberId = input.employeeMemberId;
            linkedRule.employeeName = input.employeeName;
            linkedRule.status = input.active ? 'ACTIVE' : 'PAUSED';
          }
          await recurringRepo.save(linkedRule);
          payrollProfile.recurringExpenseId = linkedRule.id;
          await profileRepo.save(payrollProfile);

          return {
            ok: true,
            payrollProfileId: payrollProfile.id,
            recurringExpenseId: linkedRule.id,
          };
        }

        case 'addPayrollEntry': {
          const payrollProfile = await manager
            .getRepository(DeliveryFinanceV2PayrollProfileEntity)
            .findOneBy({ workspaceId: workspace.id, id: input.profileId });
          if (!payrollProfile) {
            throw new NotFoundException('Payroll employee profile not found.');
          }
          if (input.eventDate.slice(0, 7) !== input.month) {
            throw new BadRequestException(
              `Event date (${input.eventDate}) must fall inside the selected payroll month (${input.month}).`,
            );
          }
          if (input.entryKind === 'BONUS') {
            if (!input.bonusAmountMicros) {
              throw new BadRequestException('Enter a positive bonus amount.');
            }
          } else if (!input.days) {
            throw new BadRequestException(
              'Enter the number of days (e.g. 1 or 0.5).',
            );
          }

          const entryRepo = manager.getRepository(
            DeliveryFinanceV2PayrollEntryEntity,
          );
          const entry = entryRepo.create({
            id: randomUUID(),
            workspaceId: workspace.id,
            profileId: input.profileId,
            month: input.month,
            entryKind: input.entryKind,
            days: input.entryKind === 'BONUS' ? null : input.days,
            bonusAmountMicros:
              input.entryKind === 'BONUS' ? input.bonusAmountMicros : null,
            eventDate: input.eventDate,
            swappedWorkDate:
              input.entryKind === 'SWAP_COMP_OFF'
                ? input.swappedWorkDate
                : null,
            note: input.note,
            createdBy: memberId,
          });
          await entryRepo.save(entry);
          return { ok: true, payrollEntryId: entry.id };
        }

        case 'deletePayrollEntry': {
          const repo = manager.getRepository(
            DeliveryFinanceV2PayrollEntryEntity,
          );
          const entry = await repo.findOneBy({
            workspaceId: workspace.id,
            id: input.id,
          });
          if (!entry) throw new NotFoundException('Payroll entry not found.');
          await repo.remove(entry);
          return { ok: true };
        }

        case 'postPayrollAdjustments': {
          const payrollProfile = await manager
            .getRepository(DeliveryFinanceV2PayrollProfileEntity)
            .findOneBy({ workspaceId: workspace.id, id: input.profileId });
          if (!payrollProfile) {
            throw new NotFoundException('Payroll profile not found.');
          }
          const settlementMonth =
            payrollProfile.payDayOfMonth <= 10
              ? nextYearMonth(input.month)
              : input.month;
          const paydayDate = resolveScheduledDateForMonth(
            settlementMonth,
            payrollProfile.payDayOfMonth,
          );
          const postedCount = await this.postPayrollAdjustmentsInTransaction(
            manager,
            workspace.id,
            profile,
            systemAccounts,
            payrollProfile,
            input.month,
            paydayDate,
            memberId,
            input.fxRateToAed,
            input.forceResync ?? true,
          );
          return { ok: true, postedCount };
        }

        case 'saveQuote': {
          await this.assertWorkspaceProject(
            manager,
            workspace.id,
            input.projectId,
          );
          if (input.validUntil && input.validUntil < input.issueDate) {
            throw new BadRequestException(
              'Quote "Valid until" date cannot be earlier than the quote date.',
            );
          }
          const totals = calculateDocumentLineTotals(
            input.lineItems.map((item) => ({
              ...item,
              id: item.id ?? randomUUID(),
            })),
          );
          const repo = manager.getRepository(DeliveryFinanceV2QuoteEntity);
          let quote: DeliveryFinanceV2QuoteEntity;
          if (input.id) {
            const existing = await repo.findOneBy({
              workspaceId: workspace.id,
              id: input.id,
            });
            if (!existing) throw new NotFoundException('Quote not found.');
            if (existing.status === 'CONVERTED' || existing.status === 'VOID') {
              throw new BadRequestException(
                'Converted or voided quotes cannot be edited.',
              );
            }
            existing.clientName = input.clientName;
            existing.clientEmail = input.clientEmail;
            existing.clientAddress = input.clientAddress;
            if (input.projectId !== undefined) {
              existing.projectId = input.projectId;
            }
            existing.currency = input.currency;
            existing.issueDate = input.issueDate;
            existing.validUntil = input.validUntil;
            existing.lineItems = totals.lineItems;
            existing.subtotalMicros = totals.subtotalMicros;
            existing.discountTotalMicros = totals.discountTotalMicros;
            existing.totalMicros = totals.totalMicros;
            if (input.notes !== undefined) {
              existing.notes = input.notes;
            }
            if (input.terms !== undefined) {
              existing.terms = input.terms;
            }
            quote = await repo.save(existing);
          } else {
            const quoteNumber = await this.nextDocumentNumber(
              manager,
              profile,
              'QUOTE',
              input.issueDate,
            );
            quote = repo.create({
              id: randomUUID(),
              workspaceId: workspace.id,
              quoteNumber,
              clientName: input.clientName,
              clientEmail: input.clientEmail,
              clientAddress: input.clientAddress,
              projectId: input.projectId ?? null,
              currency: input.currency,
              issueDate: input.issueDate,
              validUntil: input.validUntil,
              lineItems: totals.lineItems,
              subtotalMicros: totals.subtotalMicros,
              discountTotalMicros: totals.discountTotalMicros,
              totalMicros: totals.totalMicros,
              notes: input.notes ?? '',
              terms: input.terms || profile.defaultQuoteTerms,
              status: 'DRAFT',
              sentAt: null,
              convertedInvoiceId: null,
              convertedScheduleId: null,
              voidReason: null,
              voidedAt: null,
              createdBy: memberId,
            });
            await repo.save(quote);
          }
          return {
            ok: true,
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
          };
        }

        case 'markQuoteSent': {
          const repo = manager.getRepository(DeliveryFinanceV2QuoteEntity);
          const quote = await repo.findOneBy({
            workspaceId: workspace.id,
            id: input.quoteId,
          });
          if (!quote) throw new NotFoundException('Quote not found.');
          if (quote.status === 'VOID' || quote.status === 'CONVERTED') {
            throw new BadRequestException(
              'Cannot mark a converted or voided quote as sent.',
            );
          }
          quote.status = 'SENT';
          quote.sentAt = new Date();
          await repo.save(quote);
          return { ok: true, quoteId: quote.id };
        }

        case 'sendQuoteEmail': {
          const repo = manager.getRepository(DeliveryFinanceV2QuoteEntity);
          const quote = await repo.findOneBy({
            workspaceId: workspace.id,
            id: input.quoteId,
          });
          if (!quote) throw new NotFoundException('Quote not found.');
          if (quote.status === 'VOID') {
            throw new BadRequestException('Cannot email a voided quote.');
          }
          const recipient = (input.toEmail || quote.clientEmail).trim();
          if (!recipient) {
            throw new BadRequestException(
              'Add a client email address before sending.',
            );
          }
          // Defer stamping status=SENT until PDF render & email enqueue succeed (MD-3).
          postCommitEmail = {
            kind: 'QUOTE',
            profile: { ...profile },
            quote: { ...quote },
            recipient,
            message: input.message,
          };
          return { ok: true, quoteId: quote.id, sentTo: recipient };
        }

        case 'voidQuote': {
          const repo = manager.getRepository(DeliveryFinanceV2QuoteEntity);
          const quote = await repo.findOneBy({
            workspaceId: workspace.id,
            id: input.quoteId,
          });
          if (!quote) throw new NotFoundException('Quote not found.');
          if (quote.status === 'VOID') {
            throw new BadRequestException('This quote is already voided.');
          }
          if (quote.status === 'CONVERTED') {
            throw new BadRequestException(
              'This quote was already converted to an invoice.',
            );
          }
          quote.status = 'VOID';
          quote.voidReason = input.reason;
          quote.voidedAt = new Date();
          await repo.save(quote);
          return { ok: true, quoteId: quote.id };
        }

        case 'convertQuoteToInvoice': {
          const quoteRepo = manager.getRepository(DeliveryFinanceV2QuoteEntity);
          const quote = await quoteRepo.findOneBy({
            workspaceId: workspace.id,
            id: input.quoteId,
          });
          if (!quote) throw new NotFoundException('Quote not found.');
          if (quote.status === 'VOID' || quote.status === 'CONVERTED') {
            throw new BadRequestException(
              'Only open quotes can be converted into an invoice.',
            );
          }
          if (BigInt(quote.totalMicros) <= BigInt('0')) {
            throw new BadRequestException(
              'Cannot convert a zero-total quote into an invoice.',
            );
          }

          if (input.mode === 'ONE_OFF') {
            const issueDate = input.issueDate ?? today;
            const dueDate = input.dueDate ?? issueDate;
            if (dueDate < issueDate) {
              throw new BadRequestException(
                'Invoice due date cannot be earlier than the issue date.',
              );
            }
            const invoiceNumber = await this.nextDocumentNumber(
              manager,
              profile,
              'INVOICE',
              issueDate,
            );
            const invoiceRepo = manager.getRepository(
              DeliveryFinanceV2InvoiceEntity,
            );
            const invoice = invoiceRepo.create({
              id: randomUUID(),
              workspaceId: workspace.id,
              invoiceNumber,
              scheduleId: null,
              scheduleMonth: null,
              sourceQuoteId: quote.id,
              clientName: quote.clientName,
              clientEmail: quote.clientEmail,
              clientAddress: quote.clientAddress,
              projectId: quote.projectId,
              currency: quote.currency,
              issueDate,
              dueDate,
              lineItems: quote.lineItems,
              subtotalMicros: quote.subtotalMicros,
              discountTotalMicros: quote.discountTotalMicros,
              totalMicros: quote.totalMicros,
              paidMicros: '0',
              status: 'READY',
              pdfStoragePath: null,
              sentAt: null,
              sentBy: null,
              sentVia: null,
              notes: quote.notes || profile.defaultInvoiceNotes,
              voidReason: null,
              voidedAt: null,
              createdBy: memberId,
            });
            await invoiceRepo.save(invoice);
            postCommitInvoicePdf = { profile: { ...profile }, invoice };

            quote.status = 'CONVERTED';
            quote.convertedInvoiceId = invoice.id;
            await quoteRepo.save(quote);

            return {
              ok: true,
              quoteId: quote.id,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
            };
          } else {
            const billingDay = input.billingDayOfMonth ?? 1;
            const dueDay = input.dueDayOfMonth ?? 17;
            const startMonth = input.startMonth ?? monthOfDate(today);
            const scheduleRepo = manager.getRepository(
              DeliveryFinanceV2InvoiceScheduleEntity,
            );
            const schedule = scheduleRepo.create({
              id: randomUUID(),
              workspaceId: workspace.id,
              clientName: quote.clientName,
              clientEmail: quote.clientEmail,
              clientAddress: quote.clientAddress,
              projectId: quote.projectId,
              currency: quote.currency,
              lineItems: quote.lineItems,
              subtotalMicros: quote.subtotalMicros,
              discountTotalMicros: quote.discountTotalMicros,
              totalMicros: quote.totalMicros,
              billingDayOfMonth: billingDay,
              dueDayOfMonth: dueDay,
              notes: quote.notes || profile.defaultInvoiceNotes,
              startMonth,
              endMonth: null,
              status: 'ACTIVE',
              sourceQuoteId: quote.id,
              createdBy: memberId,
            });
            await scheduleRepo.save(schedule);

            quote.status = 'CONVERTED';
            quote.convertedScheduleId = schedule.id;
            await quoteRepo.save(quote);

            return {
              ok: true,
              quoteId: quote.id,
              scheduleId: schedule.id,
            };
          }
        }

        case 'saveInvoice': {
          await this.assertWorkspaceProject(
            manager,
            workspace.id,
            input.projectId,
          );
          if (input.dueDate < input.issueDate) {
            throw new BadRequestException(
              'Invoice due date cannot be earlier than the issue date.',
            );
          }
          const totals = calculateDocumentLineTotals(
            input.lineItems.map((item) => ({
              ...item,
              id: item.id ?? randomUUID(),
            })),
          );
          if (BigInt(totals.totalMicros) <= BigInt('0')) {
            throw new BadRequestException(
              'Invoice total must be greater than zero.',
            );
          }
          const repo = manager.getRepository(DeliveryFinanceV2InvoiceEntity);
          let invoice: DeliveryFinanceV2InvoiceEntity;
          if (input.id) {
            const existing = await repo.findOneBy({
              workspaceId: workspace.id,
              id: input.id,
            });
            if (!existing) throw new NotFoundException('Invoice not found.');
            if (
              BigInt(existing.paidMicros) > BigInt('0') ||
              existing.status === 'VOID'
            ) {
              throw new BadRequestException(
                'Paid or voided invoices cannot be edited.',
              );
            }
            existing.clientName = input.clientName;
            existing.clientEmail = input.clientEmail;
            existing.clientAddress = input.clientAddress;
            if (input.projectId !== undefined) {
              existing.projectId = input.projectId;
            }
            existing.currency = input.currency;
            existing.issueDate = input.issueDate;
            existing.dueDate = input.dueDate;
            existing.lineItems = totals.lineItems;
            existing.subtotalMicros = totals.subtotalMicros;
            existing.discountTotalMicros = totals.discountTotalMicros;
            existing.totalMicros = totals.totalMicros;
            if (input.notes !== undefined) {
              existing.notes = input.notes;
            }
            invoice = existing;
          } else {
            const invoiceNumber = await this.nextDocumentNumber(
              manager,
              profile,
              'INVOICE',
              input.issueDate,
            );
            invoice = repo.create({
              id: randomUUID(),
              workspaceId: workspace.id,
              invoiceNumber,
              scheduleId: null,
              scheduleMonth: null,
              sourceQuoteId: null,
              clientName: input.clientName,
              clientEmail: input.clientEmail,
              clientAddress: input.clientAddress,
              projectId: input.projectId ?? null,
              currency: input.currency,
              issueDate: input.issueDate,
              dueDate: input.dueDate,
              lineItems: totals.lineItems,
              subtotalMicros: totals.subtotalMicros,
              discountTotalMicros: totals.discountTotalMicros,
              totalMicros: totals.totalMicros,
              paidMicros: '0',
              status: 'READY',
              pdfStoragePath: null,
              sentAt: null,
              sentBy: null,
              sentVia: null,
              notes: input.notes || profile.defaultInvoiceNotes,
              voidReason: null,
              voidedAt: null,
              createdBy: memberId,
            });
          }
          await repo.save(invoice);
          postCommitInvoicePdf = { profile: { ...profile }, invoice };
          return {
            ok: true,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
          };
        }

        case 'saveInvoiceSchedule': {
          await this.assertWorkspaceProject(
            manager,
            workspace.id,
            input.projectId,
          );
          if (input.endMonth && input.endMonth < input.startMonth) {
            throw new BadRequestException(
              'End month cannot be earlier than start month.',
            );
          }
          const totals = calculateDocumentLineTotals(
            input.lineItems.map((item) => ({
              ...item,
              id: item.id ?? randomUUID(),
            })),
          );
          if (BigInt(totals.totalMicros) <= BigInt('0')) {
            throw new BadRequestException(
              'Recurring invoice total must be greater than zero.',
            );
          }
          const repo = manager.getRepository(
            DeliveryFinanceV2InvoiceScheduleEntity,
          );
          let schedule: DeliveryFinanceV2InvoiceScheduleEntity;
          if (input.id) {
            const existing = await repo.findOneBy({
              workspaceId: workspace.id,
              id: input.id,
            });
            if (!existing) {
              throw new NotFoundException(
                'Recurring invoice schedule not found.',
              );
            }
            existing.clientName = input.clientName;
            existing.clientEmail = input.clientEmail;
            existing.clientAddress = input.clientAddress;
            if (input.projectId !== undefined) {
              existing.projectId = input.projectId;
            }
            existing.currency = input.currency;
            existing.lineItems = totals.lineItems;
            existing.subtotalMicros = totals.subtotalMicros;
            existing.discountTotalMicros = totals.discountTotalMicros;
            existing.totalMicros = totals.totalMicros;
            existing.billingDayOfMonth = input.billingDayOfMonth;
            existing.dueDayOfMonth = input.dueDayOfMonth;
            existing.startMonth = input.startMonth;
            if (input.endMonth !== undefined) {
              existing.endMonth = input.endMonth;
            }
            if (input.notes !== undefined) {
              existing.notes = input.notes;
            }
            schedule = await repo.save(existing);
          } else {
            schedule = repo.create({
              id: randomUUID(),
              workspaceId: workspace.id,
              clientName: input.clientName,
              clientEmail: input.clientEmail,
              clientAddress: input.clientAddress,
              projectId: input.projectId ?? null,
              currency: input.currency,
              lineItems: totals.lineItems,
              subtotalMicros: totals.subtotalMicros,
              discountTotalMicros: totals.discountTotalMicros,
              totalMicros: totals.totalMicros,
              billingDayOfMonth: input.billingDayOfMonth,
              dueDayOfMonth: input.dueDayOfMonth,
              startMonth: input.startMonth,
              endMonth: input.endMonth ?? null,
              notes: input.notes ?? '',
              status: 'ACTIVE',
              sourceQuoteId: null,
              createdBy: memberId,
            });
            await repo.save(schedule);
          }
          return { ok: true, scheduleId: schedule.id };
        }

        case 'setInvoiceScheduleStatus': {
          const repo = manager.getRepository(
            DeliveryFinanceV2InvoiceScheduleEntity,
          );
          const schedule = await repo.findOneBy({
            workspaceId: workspace.id,
            id: input.id,
          });
          if (!schedule) {
            throw new NotFoundException(
              'Recurring invoice schedule not found.',
            );
          }
          schedule.status = input.status;
          await repo.save(schedule);
          return { ok: true, scheduleId: schedule.id, status: schedule.status };
        }

        case 'markInvoiceSent': {
          const repo = manager.getRepository(DeliveryFinanceV2InvoiceEntity);
          const invoice = await repo.findOneBy({
            workspaceId: workspace.id,
            id: input.invoiceId,
          });
          if (!invoice) throw new NotFoundException('Invoice not found.');
          if (invoice.status === 'VOID') {
            throw new BadRequestException('Cannot send a voided invoice.');
          }
          if (invoice.status === 'READY') {
            invoice.status = 'SENT';
          }
          invoice.sentAt = new Date();
          invoice.sentBy = memberId;
          invoice.sentVia = 'MANUAL';
          await repo.save(invoice);
          return { ok: true, invoiceId: invoice.id };
        }

        case 'sendInvoiceEmail': {
          const repo = manager.getRepository(DeliveryFinanceV2InvoiceEntity);
          const invoice = await repo.findOneBy({
            workspaceId: workspace.id,
            id: input.invoiceId,
          });
          if (!invoice) throw new NotFoundException('Invoice not found.');
          if (invoice.status === 'VOID') {
            throw new BadRequestException('Cannot email a voided invoice.');
          }
          const recipient = (input.toEmail || invoice.clientEmail).trim();
          if (!recipient) {
            throw new BadRequestException(
              'Add a client email address before sending.',
            );
          }
          // Defer stamping status=SENT until PDF render & email enqueue succeed (MD-3).
          postCommitEmail = {
            kind: 'INVOICE',
            profile: { ...profile },
            invoice: { ...invoice },
            recipient,
            message: input.message,
          };
          return { ok: true, invoiceId: invoice.id, sentTo: recipient };
        }

        case 'recordInvoicePayment': {
          const repo = manager.getRepository(DeliveryFinanceV2InvoiceEntity);
          const invoice = await repo.findOneBy({
            workspaceId: workspace.id,
            id: input.invoiceId,
          });
          if (!invoice) throw new NotFoundException('Invoice not found.');
          if (invoice.status === 'VOID' || invoice.status === 'PAID') {
            throw new BadRequestException(
              'This invoice is already paid or voided.',
            );
          }
          const total = BigInt(invoice.totalMicros);
          const alreadyPaid = BigInt(invoice.paidMicros);
          const remaining = total - alreadyPaid;
          const paymentAmount = BigInt(input.amountMicros);
          if (paymentAmount > remaining) {
            throw new BadRequestException(
              'Payment exceeds the remaining invoice balance.',
            );
          }

          const cashAccount = await this.ensureCashAccount(
            manager,
            workspace.id,
            invoice.currency,
          );
          const revenueAccount = systemAccounts.get('REVENUE:SERVICE')!;
          const fxRate = this.resolveFxRate(
            profile,
            invoice.currency,
            input.fxRateToAed,
          );
          const aedAmount = convertToAedMicros(
            paymentAmount,
            invoice.currency,
            fxRate,
          );
          assertPositiveAed(aedAmount, 'Invoice payment');

          const paymentId = randomUUID();
          const journal = await this.postJournal(manager, {
            workspaceId: workspace.id,
            entryDate: input.paymentDate,
            entryType: 'INVOICE_PAYMENT',
            category: 'SERVICE_REVENUE',
            title: `Payment — ${invoice.invoiceNumber} (${invoice.clientName})`,
            notes: input.notes,
            currency: invoice.currency,
            amountMicros: paymentAmount,
            fxRateToAed: fxRate,
            aedAmountMicros: aedAmount,
            fundingAccountId: cashAccount.id,
            targetAccountId: revenueAccount.id,
            projectId: invoice.projectId,
            sourceRefType: 'INVOICE_PAYMENT',
            sourceRefId: `${invoice.id}:${paymentId}`,
            createdBy: memberId,
            lines: [
              {
                accountId: cashAccount.id,
                debitAedMicros: aedAmount,
                creditAedMicros: BigInt('0'),
                currency: invoice.currency,
                originalSignedMicros: paymentAmount,
              },
              {
                accountId: revenueAccount.id,
                debitAedMicros: BigInt('0'),
                creditAedMicros: aedAmount,
                currency: invoice.currency,
                originalSignedMicros: -paymentAmount,
              },
            ],
          });

          const nextPaid = alreadyPaid + paymentAmount;
          invoice.paidMicros = nextPaid.toString();
          invoice.status = nextPaid >= total ? 'PAID' : 'PARTIALLY_PAID';
          await repo.save(invoice);
          postCommitInvoicePdf = { profile: { ...profile }, invoice };

          return {
            ok: true,
            invoiceId: invoice.id,
            journalId: journal.id,
            status: invoice.status,
          };
        }

        case 'voidInvoice': {
          const repo = manager.getRepository(DeliveryFinanceV2InvoiceEntity);
          const invoice = await repo.findOneBy({
            workspaceId: workspace.id,
            id: input.invoiceId,
          });
          if (!invoice) throw new NotFoundException('Invoice not found.');
          if (invoice.status === 'VOID') {
            throw new BadRequestException('This invoice is already voided.');
          }
          if (BigInt(invoice.paidMicros) > BigInt('0')) {
            throw new BadRequestException(
              'Void recorded payments on this invoice before voiding the invoice.',
            );
          }
          invoice.status = 'VOID';
          invoice.voidReason = input.reason;
          invoice.voidedAt = new Date();
          await repo.save(invoice);
          return { ok: true, invoiceId: invoice.id };
        }
      }
    });

    // Execute PDF storage and BullMQ email dispatch strictly AFTER the DB transaction commits.
    if (postCommitInvoicePdf !== null) {
      const target = postCommitInvoicePdf as {
        profile: DeliveryFinanceV2ProfileEntity;
        invoice: DeliveryFinanceV2InvoiceEntity;
      };
      await this.persistInvoicePdf(
        workspace.id,
        target.profile,
        target.invoice,
        today,
      );
    }

    if (postCommitEmail !== null) {
      const configuredFrom =
        this.twentyConfigService.get('EMAIL_FROM_ADDRESS') ||
        'finance@otogrow.com';
      const emailPayload = postCommitEmail as
        | {
            kind: 'QUOTE';
            profile: DeliveryFinanceV2ProfileEntity;
            quote: DeliveryFinanceV2QuoteEntity;
            recipient: string;
            message: string;
          }
        | {
            kind: 'INVOICE';
            profile: DeliveryFinanceV2ProfileEntity;
            invoice: DeliveryFinanceV2InvoiceEntity;
            recipient: string;
            message: string;
          };
      const displayName = sanitizeDisplayName(
        emailPayload.profile.companyName || 'Otogrow',
      );
      const replyTo = emailPayload.profile.email?.trim() || undefined;

      if (emailPayload.kind === 'QUOTE') {
        const pdfBuffer = await this.renderQuotePdf(
          emailPayload.profile,
          emailPayload.quote,
        );
        // Base64-encode attachment so BullMQ Redis JSON serialization preserves exact PDF bytes.
        await this.emailService.send({
          from: `"${displayName}" <${configuredFrom}>`,
          replyTo,
          to: emailPayload.recipient,
          subject: `Quote ${emailPayload.quote.quoteNumber} from ${displayName}`,
          text:
            emailPayload.message ||
            `Hello ${emailPayload.quote.clientName},\n\nPlease find attached quote ${emailPayload.quote.quoteNumber}.\n\nBest regards,\n${displayName}`,
          attachments: [
            {
              filename: `${emailPayload.quote.quoteNumber}.pdf`,
              content: pdfBuffer.toString('base64'),
              encoding: 'base64',
              contentType: 'application/pdf',
            },
          ],
        });
        await this.dataSource.transaction(async (manager) => {
          await this.lockWorkspace(manager, workspace.id, true);
          const repo = manager.getRepository(DeliveryFinanceV2QuoteEntity);
          const latest = await repo.findOneBy({
            workspaceId: workspace.id,
            id: emailPayload.quote.id,
          });
          if (latest && latest.status !== 'VOID') {
            if (latest.status === 'DRAFT') latest.status = 'SENT';
            latest.sentAt = new Date();
            await repo.save(latest);
          }
        });
      } else {
        const { buffer } = await this.persistInvoicePdf(
          workspace.id,
          emailPayload.profile,
          emailPayload.invoice,
          today,
        );
        await this.emailService.send({
          from: `"${displayName}" <${configuredFrom}>`,
          replyTo,
          to: emailPayload.recipient,
          subject: `Invoice ${emailPayload.invoice.invoiceNumber} from ${displayName}`,
          text:
            emailPayload.message ||
            `Hello ${emailPayload.invoice.clientName},\n\nPlease find attached invoice ${emailPayload.invoice.invoiceNumber} (due ${emailPayload.invoice.dueDate}).\n\nBest regards,\n${displayName}`,
          attachments: [
            {
              filename: `${emailPayload.invoice.invoiceNumber}.pdf`,
              content: buffer.toString('base64'),
              encoding: 'base64',
              contentType: 'application/pdf',
            },
          ],
        });
        await this.dataSource.transaction(async (manager) => {
          await this.lockWorkspace(manager, workspace.id, true);
          const repo = manager.getRepository(DeliveryFinanceV2InvoiceEntity);
          const latest = await repo.findOneBy({
            workspaceId: workspace.id,
            id: emailPayload.invoice.id,
          });
          if (latest && latest.status !== 'VOID') {
            if (latest.status === 'READY') latest.status = 'SENT';
            latest.sentAt = new Date();
            latest.sentBy = memberId;
            latest.sentVia = 'EMAIL';
            await repo.save(latest);
          }
        });
      }
    }

    return txResult;
  }

  private async exportCsvDedicated(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: {
      dataset: 'LEDGER' | 'PNL' | 'BALANCE_SHEET' | 'DOCUMENTS' | 'PAYROLL';
      fromDate?: string;
      toDate?: string;
      asOfDate?: string;
      payrollMonth?: string;
    },
    now: Date,
  ): Promise<{ filename: string; csv: string }> {
    const today = todayIsoDate(now);
    const currentMonth = monthOfDate(today);
    const fromDate = input.fromDate ?? firstDayOfMonth(currentMonth);
    const toDate = input.toDate ?? today;
    const asOfDate = input.asOfDate ?? today;
    const payrollMonth = input.payrollMonth ?? currentMonth;

    if (fromDate > toDate) {
      throw new BadRequestException(
        'Export "From" date cannot be later than "To" date.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const actor = await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        false,
        input.dataset === 'PAYROLL',
      );
      const accounts = await manager
        .getRepository(DeliveryFinanceV2AccountEntity)
        .find({ where: { workspaceId: workspace.id } });
      const accountById = new Map(accounts.map((a) => [a.id, a]));

      if (input.dataset === 'PNL') {
        const lines = await this.loadLedgerLines(manager, workspace.id);
        const p = calculateProfitAndLoss(lines, fromDate, toDate);
        const rows = [
          ['Section', 'Line', 'Amount (AED)'],
          ['Period', `${p.fromDate} to ${p.toDate}`, ''],
          [
            'Revenue',
            'Client Service Revenue',
            formatMicrosPlain(p.revenueAedMicros),
          ],
          ...p.directBreakdown.map((item) => [
            'Direct Expense',
            item.category,
            formatMicrosPlain(item.aedMicros),
          ]),
          [
            'Summary',
            'Total Direct Expenses',
            formatMicrosPlain(p.directExpenseAedMicros),
          ],
          [
            'Summary',
            'Gross Profit',
            formatMicrosPlain(p.grossProfitAedMicros),
          ],
          ...p.indirectBreakdown.map((item) => [
            'Indirect Expense',
            item.category,
            formatMicrosPlain(item.aedMicros),
          ]),
          [
            'Summary',
            'Total Indirect Expenses',
            formatMicrosPlain(p.indirectExpenseAedMicros),
          ],
          [
            'Other',
            'Currency Exchange Gain / Loss',
            formatMicrosPlain(p.fxGainLossAedMicros),
          ],
          ['Summary', 'Net Profit', formatMicrosPlain(p.netProfitAedMicros)],
        ];
        return {
          filename: `otogrow-pnl-${p.fromDate}-to-${p.toDate}.csv`,
          csv: rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
        };
      }

      if (input.dataset === 'BALANCE_SHEET') {
        const lines = await this.loadLedgerLines(manager, workspace.id);
        const b = calculateBalanceSheet(lines, asOfDate);
        const rows = [
          ['Section', 'Account', 'Currency', 'Original Amount', 'AED Amount'],
          ...b.cashByCurrency.map((item) => [
            'Assets',
            `Company Cash (${item.currency})`,
            item.currency,
            formatMicrosPlain(item.originalMicros),
            formatMicrosPlain(item.aedMicros),
          ]),
          [
            'Assets',
            'Equipment & Fixed Assets',
            'AED',
            formatMicrosPlain(b.fixedAssetsAedMicros),
            formatMicrosPlain(b.fixedAssetsAedMicros),
          ],
          [
            'Assets Total',
            'Total Assets',
            'AED',
            '',
            formatMicrosPlain(b.totalAssetsAedMicros),
          ],
          ...b.liabilitiesByPerson.map((person) => [
            'Liabilities',
            `Owed to ${person.personName}`,
            'AED',
            '',
            formatMicrosPlain(person.balanceOwedAedMicros),
          ]),
          [
            'Liabilities Total',
            'Total Liabilities',
            'AED',
            '',
            formatMicrosPlain(b.totalLiabilitiesAedMicros),
          ],
          [
            'Equity',
            'Opening Accumulated Profits',
            'AED',
            '',
            formatMicrosPlain(b.openingEquityAedMicros),
          ],
          [
            'Equity',
            'Accumulated Net Profit',
            'AED',
            '',
            formatMicrosPlain(b.accumulatedNetProfitAedMicros),
          ],
          [
            'Equity Total',
            'Total Equity',
            'AED',
            '',
            formatMicrosPlain(b.totalEquityAedMicros),
          ],
        ];
        return {
          filename: `otogrow-balance-sheet-${b.asOfDate}.csv`,
          csv: rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
        };
      }

      if (input.dataset === 'DOCUMENTS') {
        const quotes = await manager
          .getRepository(DeliveryFinanceV2QuoteEntity)
          .find({
            where: { workspaceId: workspace.id },
            order: { issueDate: 'DESC', createdAt: 'DESC' },
          });
        const invoices = await manager
          .getRepository(DeliveryFinanceV2InvoiceEntity)
          .find({
            where: { workspaceId: workspace.id },
            order: { dueDate: 'DESC', createdAt: 'DESC' },
          });
        const rows = [
          [
            'Type',
            'Number',
            'Client',
            'Currency',
            'Issue Date',
            'Due / Valid Until',
            'Total',
            'Paid',
            'Overdue Days',
            'Status',
          ],
          ...quotes.map((quote) => [
            'QUOTE',
            quote.quoteNumber,
            quote.clientName,
            quote.currency,
            quote.issueDate,
            quote.validUntil ?? '',
            formatMicrosPlain(quote.totalMicros),
            '0.00',
            '0',
            quote.status,
          ]),
          ...invoices.map((invoice) => [
            'INVOICE',
            invoice.invoiceNumber,
            invoice.clientName,
            invoice.currency,
            invoice.issueDate,
            invoice.dueDate,
            formatMicrosPlain(invoice.totalMicros),
            formatMicrosPlain(invoice.paidMicros),
            String(
              calculateOverdueDays(
                invoice.dueDate,
                today,
                invoice.status,
                BigInt(invoice.totalMicros),
                BigInt(invoice.paidMicros),
              ),
            ),
            invoice.status,
          ]),
        ];
        return {
          filename: `otogrow-quotes-and-invoices-${today}.csv`,
          csv: rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
        };
      }

      if (input.dataset === 'PAYROLL') {
        const payrollProfiles = await manager
          .getRepository(DeliveryFinanceV2PayrollProfileEntity)
          .find({
            where: { workspaceId: workspace.id },
            order: { employeeName: 'ASC' },
          });
        const payrollEntries = await manager
          .getRepository(DeliveryFinanceV2PayrollEntryEntity)
          .find({
            where: { workspaceId: workspace.id, month: payrollMonth },
          });
        const summaries = payrollProfiles.map((prof) =>
          calculateMonthlyPayroll({
            profileId: prof.id,
            employeeName: prof.employeeName,
            month: payrollMonth,
            currency: prof.currency,
            baseSalaryMicros: BigInt(prof.baseSalaryMicros),
            workingDaysPerMonth: prof.workingDaysPerMonth,
            paidLeavesPerMonth: prof.paidLeavesPerMonth,
            entries: payrollEntries.filter((e) => e.profileId === prof.id),
          }),
        );
        const rows = [
          [
            'Month',
            'Employee',
            'Currency',
            'Base Salary',
            'Working Days',
            'Leaves Taken',
            'Swaps',
            'Unpaid Leaves',
            'Leave Reduction',
            'Overtime Days',
            'Overtime Pay',
            'Bonus',
            'Net Payable',
          ],
          ...summaries.map((item) => [
            item.month,
            item.employeeName,
            item.currency,
            formatMicrosPlain(item.baseSalaryMicros),
            String(item.workingDaysPerMonth),
            item.leavesTakenDays,
            item.swapsDays,
            item.unpaidLeaveDays,
            formatMicrosPlain(item.unpaidLeaveDeductionMicros),
            item.overtimeDays,
            formatMicrosPlain(item.overtimePayMicros),
            formatMicrosPlain(item.bonusTotalMicros),
            formatMicrosPlain(item.netPayableMicros),
          ]),
        ];
        return {
          filename: `otogrow-payroll-${payrollMonth}.csv`,
          csv: rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
        };
      }

      // LEDGER export: un-truncated, filtered to fromDate..toDate, with signed AED for reductions!
      const allJournals = await manager
        .getRepository(DeliveryFinanceV2JournalEntity)
        .find({
          where: { workspaceId: workspace.id },
          order: { entryDate: 'DESC', createdAt: 'DESC' },
        });
      const filtered = allJournals.filter(
        (j) =>
          j.entryDate >= fromDate &&
          j.entryDate <= toDate &&
          (actor.isAdmin || !PAYROLL_JOURNAL_TYPES.has(j.entryType)),
      );
      const rows = [
        [
          'Date',
          'Type',
          'Category',
          'Title',
          'Currency',
          'Amount',
          'FX Rate to AED',
          'AED Amount',
          'Funding Account',
          'Status',
          'Notes',
        ],
        ...filtered.map((item) => {
          const isNegative = BigInt(item.amountMicros) < BigInt('0');
          const signedAed = isNegative
            ? (-BigInt(item.aedAmountMicros)).toString()
            : item.aedAmountMicros;
          return [
            item.entryDate,
            item.entryType,
            item.category,
            item.title,
            item.currency,
            formatMicrosPlain(item.amountMicros),
            item.fxRateToAed,
            formatMicrosPlain(signedAed),
            item.fundingAccountId
              ? (accountById.get(item.fundingAccountId)?.name ?? '')
              : '',
            item.status,
            item.notes,
          ];
        }),
      ];
      return {
        filename: `otogrow-ledger-${fromDate}-to-${toDate}.csv`,
        csv: rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
      };
    });
  }
}
