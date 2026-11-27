import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, type EntityManager, In } from 'typeorm';
import { EmailService } from 'src/engine/core-modules/email/email.service';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import {
  CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX,
  CLIENT_BUSINESS_PAYMENT_REF_TYPE,
  deterministicClientReceivableInvoiceId,
  minorUnitsToMicros,
} from 'src/modules/delivery/finance-v2/finance-v2-client-sync.util';
import { computeProjectedMrrSnapshot } from 'src/modules/delivery/finance-v2/finance-v2-mrr.util';
import {
  normalizeClientRoster,
  resolveEffectiveClientCompanyIds,
} from 'src/modules/delivery/clients/delivery-client-hub.policy';
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
import {
  financeV2CommandSchema,
  financeV2SnapshotQuerySchema,
  parseFinanceV2Input,
} from 'src/modules/delivery/finance-v2/finance-v2-schemas';
import {
  addDaysToIsoDate,
  assertBalancedJournalLines,
  buildAutomationCandidateMonths,
  calculateBalanceSheet,
  calculateBurnAndRunway,
  calculateDocumentLineTotals,
  calculateMonthlyPayroll,
  calculateMonthlyTrend,
  calculateOverdueDays,
  calculatePreviousPeriodRange,
  calculateProfitAndLoss,
  calculateProjectProfitability,
  computeWeightedCarryingAed,
  computeWeightedInflowAed,
  convertToAedMicros,
  isPayrollSensitiveCategory,
  nextYearMonth,
  previousYearMonth,
  resolveMonthLastDate,
  resolvePayrollSettlementMonth,
  resolveRecurringInvoiceDates,
  resolveScheduledDateForMonth,
  todayIsoDateInTimezone,
} from 'src/modules/delivery/finance-v2/finance-v2.policy';
import {
  FINANCE_V2_BASE_CURRENCY,
  FINANCE_V2_CURRENCIES,
  FINANCE_V2_DEFAULT_FX_RATES,
  FINANCE_V2_DEFAULT_TIMEZONE,
  type FinanceV2Analytics,
  type FinanceV2Currency,
  type FinanceV2InvoiceAgingBucket,
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

const PAYROLL_JOURNAL_TYPE_LIST = [...PAYROLL_JOURNAL_TYPES];

const isPayrollSensitiveJournal = (item: {
  entryType: string;
  category: string;
}): boolean =>
  PAYROLL_JOURNAL_TYPES.has(item.entryType) ||
  isPayrollSensitiveCategory(item.category);

const isPayrollSensitiveRecurring = (
  rule: {
    id: string;
    category: string;
    employeeName: string | null;
    employeeMemberId: string | null;
  },
  payrollLinkedRecurringIds?: Set<string>,
): boolean =>
  Boolean(payrollLinkedRecurringIds?.has(rule.id)) ||
  Boolean(rule.employeeName) ||
  Boolean(rule.employeeMemberId) ||
  isPayrollSensitiveCategory(rule.category);

const resolveRecurringPayTiming = (
  rule: {
    dayOfMonth: number;
    employeeMemberId: string | null;
    employeeName: string | null;
  },
  linkedPayrollProfile?: {
    payDayOfMonth: number;
    payTiming?: 'SAME_MONTH' | 'FOLLOWING_MONTH' | null;
  } | null,
): 'SAME_MONTH' | 'FOLLOWING_MONTH' | null => {
  if (linkedPayrollProfile) {
    return (
      linkedPayrollProfile.payTiming ??
      (linkedPayrollProfile.payDayOfMonth <= 10
        ? 'FOLLOWING_MONTH'
        : 'SAME_MONTH')
    );
  }
  if (rule.employeeMemberId || rule.employeeName) {
    return rule.dayOfMonth <= 10 ? 'FOLLOWING_MONTH' : 'SAME_MONTH';
  }
  return null;
};

const resolveCurrentMonthTargetForRecurringRule = (
  rule: {
    dayOfMonth: number;
    employeeMemberId: string | null;
    employeeName: string | null;
  },
  linkedPayrollProfile:
    | {
        payDayOfMonth: number;
        payTiming?: 'SAME_MONTH' | 'FOLLOWING_MONTH' | null;
      }
    | null
    | undefined,
  currentMonth: string,
): string => {
  const payTiming = resolveRecurringPayTiming(rule, linkedPayrollProfile);
  return payTiming === 'FOLLOWING_MONTH'
    ? previousYearMonth(currentMonth)
    : currentMonth;
};

// Derives a stable RFC 4122 UUID so create-level clientRequestId retries hit the primary key safely.
const deterministicUuidFromSeed = (seed: string): string => {
  const bytes = createHash('sha256').update(seed).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const EMAIL_RATE_WINDOW_MS = 60_000;
const EMAIL_RATE_LIMIT = 20;

const todayIsoDate = (
  now = new Date(),
  timeZone: string = FINANCE_V2_DEFAULT_TIMEZONE,
): string => todayIsoDateInTimezone(now, timeZone);
const monthOfDate = (isoDate: string): string => isoDate.slice(0, 7);
const firstDayOfMonth = (month: string): string => `${month}-01`;

const assertDateNotLocked = (
  lockedThroughDate: string | null | undefined,
  entryDate: string,
  actionLabel = 'post or modify entries',
): void => {
  if (lockedThroughDate && entryDate <= lockedThroughDate) {
    throw new BadRequestException(
      `Accounting period through ${lockedThroughDate} is locked. Cannot ${actionLabel} on ${entryDate}. Post a reversing entry after ${lockedThroughDate} or unlock the period first.`,
    );
  }
};

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
  private readonly inFlightEmailKeys = new Set<string>();
  private readonly emailRateLog = new Map<string, number[]>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
    private readonly storage: FileStorageDriverFactory,
    private readonly emailService: EmailService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  private assertEmailRateLimit(workspaceId: string, memberId: string): void {
    const key = `${workspaceId}:${memberId}`;
    const now = Date.now();
    if (this.emailRateLog.size > 200) {
      for (const [entryKey, timestamps] of this.emailRateLog.entries()) {
        const active = timestamps.filter(
          (timestamp) => now - timestamp < EMAIL_RATE_WINDOW_MS,
        );
        if (active.length === 0) {
          this.emailRateLog.delete(entryKey);
        } else {
          this.emailRateLog.set(entryKey, active);
        }
      }
    }
    const recent = (this.emailRateLog.get(key) ?? []).filter(
      (timestamp) => now - timestamp < EMAIL_RATE_WINDOW_MS,
    );
    if (recent.length >= EMAIL_RATE_LIMIT) {
      this.emailRateLog.set(key, recent);
      throw new HttpException(
        'Too many finance emails sent in a short time. Wait a minute and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.emailRateLog.set(key, recent);
  }

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
          'This finance action is restricted to workspace administrators.',
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
        timezone: FINANCE_V2_DEFAULT_TIMEZONE,
        lockedThroughDate: null,
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
      reversalOfJournalId?: string | null;
      createdBy: string;
      lines: FinanceV2JournalLineDraft[];
    },
  ): Promise<DeliveryFinanceV2JournalEntity> {
    assertBalancedJournalLines(params.lines);

    const profile = await manager
      .getRepository(DeliveryFinanceV2ProfileEntity)
      .findOneBy({ workspaceId: params.workspaceId });
    assertDateNotLocked(
      profile?.lockedThroughDate,
      params.entryDate,
      'post entries',
    );

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
      reversalOfJournalId: params.reversalOfJournalId ?? null,
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
        j."status",
        j."projectId",
        orig."entryType" AS "reversalOfEntryType"
      FROM core."deliveryFinanceV2JournalLine" l
      JOIN core."deliveryFinanceV2Journal" j
        ON j."workspaceId" = l."workspaceId" AND j.id = l."journalId"
      LEFT JOIN core."deliveryFinanceV2Journal" orig
        ON orig."workspaceId" = j."workspaceId" AND orig.id = j."reversalOfJournalId"
      JOIN core."deliveryFinanceV2Account" a
        ON a."workspaceId" = l."workspaceId" AND a.id = l."accountId"
      WHERE l."workspaceId" = $1
      ORDER BY j."entryDate" ASC, j."createdAt" ASC, l.id ASC`,
      [workspaceId],
    );
  }

  // Targeted indexed SQL aggregation for a single cash account's carrying balance up to `asOfDate`.
  private async queryAccountCarryingTotals(
    manager: EntityManager,
    workspaceId: string,
    accountId: string,
    asOfDate: string,
  ): Promise<{ curOrig: bigint; curAed: bigint }> {
    const rows = await manager.query<
      { origMicros: string; aedMicros: string }[]
    >(
      `SELECT
        COALESCE(SUM(l."originalSignedMicros"), 0)::text AS "origMicros",
        COALESCE(SUM(l."debitAedMicros" - l."creditAedMicros"), 0)::text AS "aedMicros"
      FROM core."deliveryFinanceV2JournalLine" l
      JOIN core."deliveryFinanceV2Journal" j
        ON j."workspaceId" = l."workspaceId" AND j.id = l."journalId"
      WHERE l."workspaceId" = $1
        AND l."accountId" = $2
        AND j."status" = 'POSTED'
        AND j."entryDate" <= $3`,
      [workspaceId, accountId, asOfDate],
    );
    const row = rows[0];
    return {
      curOrig: BigInt(row?.origMicros ?? '0'),
      curAed: BigInt(row?.aedMicros ?? '0'),
    };
  }

  // Targeted indexed SQL aggregation for a person liability account in one currency up to `asOfDate`.
  private async queryPersonLiabilityCarryingTotals(
    manager: EntityManager,
    workspaceId: string,
    accountId: string,
    currency: FinanceV2Currency,
    asOfDate: string,
  ): Promise<{ owedOrig: bigint; owedAed: bigint }> {
    const rows = await manager.query<
      { owedOrigMicros: string; owedAedMicros: string }[]
    >(
      `SELECT
        COALESCE(SUM(
          CASE WHEN l."creditAedMicros" > 0
            THEN ABS(l."originalSignedMicros")
            ELSE -ABS(l."originalSignedMicros")
          END
        ), 0)::text AS "owedOrigMicros",
        COALESCE(SUM(l."creditAedMicros" - l."debitAedMicros"), 0)::text AS "owedAedMicros"
      FROM core."deliveryFinanceV2JournalLine" l
      JOIN core."deliveryFinanceV2Journal" j
        ON j."workspaceId" = l."workspaceId" AND j.id = l."journalId"
      WHERE l."workspaceId" = $1
        AND l."accountId" = $2
        AND l."currency" = $3
        AND j."status" = 'POSTED'
        AND j."entryDate" <= $4`,
      [workspaceId, accountId, currency, asOfDate],
    );
    const row = rows[0];
    return {
      owedOrig: BigInt(row?.owedOrigMicros ?? '0'),
      owedAed: BigInt(row?.owedAedMicros ?? '0'),
    };
  }

  // Targeted SQL check for archiving a person liability account without scanning the whole workspace ledger.
  private async queryPersonHasNonZeroBalance(
    manager: EntityManager,
    workspaceId: string,
    accountId: string,
  ): Promise<boolean> {
    const rows = await manager.query<
      { currency: string; owedOrigMicros: string; owedAedMicros: string }[]
    >(
      `SELECT
        l."currency" AS "currency",
        COALESCE(SUM(
          CASE WHEN l."creditAedMicros" > 0
            THEN ABS(l."originalSignedMicros")
            ELSE -ABS(l."originalSignedMicros")
          END
        ), 0)::text AS "owedOrigMicros",
        COALESCE(SUM(l."creditAedMicros" - l."debitAedMicros"), 0)::text AS "owedAedMicros"
      FROM core."deliveryFinanceV2JournalLine" l
      JOIN core."deliveryFinanceV2Journal" j
        ON j."workspaceId" = l."workspaceId" AND j.id = l."journalId"
      WHERE l."workspaceId" = $1
        AND l."accountId" = $2
        AND j."status" = 'POSTED'
      GROUP BY l."currency"`,
      [workspaceId, accountId],
    );
    let totalAed = BigInt('0');
    for (const row of rows) {
      const orig = BigInt(row.owedOrigMicros ?? '0');
      const aed = BigInt(row.owedAedMicros ?? '0');
      if (orig !== BigInt('0') || aed !== BigInt('0')) {
        return true;
      }
      totalAed += aed;
    }
    return totalAed !== BigInt('0');
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
    const { curOrig, curAed } = await this.queryAccountCarryingTotals(
      manager,
      workspaceId,
      account.id,
      asOfDate,
    );
    const carrying = computeWeightedCarryingAed(
      amountMicros,
      curOrig,
      curAed,
      spotAedMicros,
    );
    return carrying > BigInt('0') ? carrying : spotAedMicros;
  }

  // When inflows arrive into an overdrawn foreign CASH_CURRENCY account (negative balance),
  // extinguish the negative carrying AED proportionally so returning to 0.00 leaves 0.00 AED.
  private async resolveCashInflowCarryingAed(
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
    const { curOrig, curAed } = await this.queryAccountCarryingTotals(
      manager,
      workspaceId,
      account.id,
      asOfDate,
    );
    const carrying = computeWeightedInflowAed(
      amountMicros,
      curOrig,
      curAed,
      spotAedMicros,
    );
    return carrying > BigInt('0') ? carrying : spotAedMicros;
  }

  private async findExistingClientRequestJournal(
    manager: EntityManager,
    workspaceId: string,
    action: string,
    clientRequestId?: string,
  ): Promise<DeliveryFinanceV2JournalEntity | null> {
    if (!clientRequestId) return null;
    return manager.getRepository(DeliveryFinanceV2JournalEntity).findOneBy({
      workspaceId,
      sourceRefType: 'CLIENT_REQUEST',
      sourceRefId: `${action}:${clientRequestId}`,
    });
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
    const { renderFinanceV2PdfBuffer } = await import(
      'src/modules/delivery/finance-v2/finance-v2-pdf.util'
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
    const { renderFinanceV2PdfBuffer } = await import(
      'src/modules/delivery/finance-v2/finance-v2-pdf.util'
    );
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
      todayIsoDate(new Date(), profile.timezone),
    );
    return { buffer, filename: `${invoice.invoiceNumber}.pdf` };
  }

  async downloadCompanyLogo(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; etag: string }> {
    const profile = await this.dataSource.transaction(async (manager) => {
      await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        false,
      );
      return this.ensureProfile(manager, workspace.id);
    });
    if (!profile.logoDataUrl) {
      throw new NotFoundException('Company logo is not configured.');
    }
    const match =
      /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/.exec(
        profile.logoDataUrl.trim(),
      );
    if (!match) {
      throw new NotFoundException('Company logo is not valid.');
    }
    const mimeType = match[1] === 'png' ? 'image/png' : 'image/jpeg';
    const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    const etag = `"${createHash('sha256').update(buffer).digest('hex').slice(0, 24)}"`;
    return { buffer, mimeType, etag };
  }

  async runDueAutomationForWorkspace(
    workspaceId: string,
    actorMemberId: string,
    asOfDate?: string,
  ): Promise<{
    recurringExpensesPosted: number;
    payrollAdjustmentsPosted: number;
    invoicesCreated: number;
  }> {
    const invoicesToPersist: {
      profile: DeliveryFinanceV2ProfileEntity;
      invoice: DeliveryFinanceV2InvoiceEntity;
    }[] = [];

    let resolvedAsOfDate = asOfDate ?? todayIsoDate();

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
      const effectiveAsOfDate =
        asOfDate ?? todayIsoDate(new Date(), profile.timezone);
      resolvedAsOfDate = effectiveAsOfDate;

      const systemAccounts = await this.ensureSystemAccounts(
        manager,
        workspaceId,
      );
      const allAccounts = await manager
        .getRepository(DeliveryFinanceV2AccountEntity)
        .findBy({ workspaceId });
      const accountById = new Map(allAccounts.map((acc) => [acc.id, acc]));
      const fxAccount = systemAccounts.get('FX:GAIN_LOSS')!;
      const currentMonth = monthOfDate(effectiveAsOfDate);

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
      const payrollProfileByRecurringId = new Map<
        string,
        DeliveryFinanceV2PayrollProfileEntity
      >();
      for (const prof of allPayrollProfiles) {
        if (prof.recurringExpenseId) {
          payrollProfileByRecurringId.set(prof.recurringExpenseId, prof);
        }
      }
      const payrollLinkedRecurringIds = new Set(
        payrollProfileByRecurringId.keys(),
      );

      const recurringRules = await manager
        .getRepository(DeliveryFinanceV2RecurringExpenseEntity)
        .findBy({ workspaceId, status: 'ACTIVE' });
      const invoiceSchedules = await manager
        .getRepository(DeliveryFinanceV2InvoiceScheduleEntity)
        .findBy({ workspaceId, status: 'ACTIVE' });

      // Bounded catch-up window across active rules & schedules (up to 12 months back) so multi-month outages catch up cleanly.
      let earliestStartMonth: string | null = null;
      for (const rule of recurringRules) {
        if (!earliestStartMonth || rule.startMonth < earliestStartMonth) {
          earliestStartMonth = rule.startMonth;
        }
      }
      for (const schedule of invoiceSchedules) {
        if (!earliestStartMonth || schedule.startMonth < earliestStartMonth) {
          earliestStartMonth = schedule.startMonth;
        }
      }
      const candidateMonths = buildAutomationCandidateMonths(
        earliestStartMonth,
        currentMonth,
        12,
      );

      // 1. Due recurring expenses (bills & linked payroll base salaries)
      for (const month of candidateMonths) {
        for (const rule of recurringRules) {
          if (month < rule.startMonth) continue;
          if (rule.endMonth && month > rule.endMonth) continue;
          const linkedPayroll = payrollProfileByRecurringId.get(rule.id);
          const isPayrollBase =
            payrollLinkedRecurringIds.has(rule.id) ||
            Boolean(rule.employeeMemberId || rule.employeeName);
          const settlementMonth = isPayrollBase
            ? resolvePayrollSettlementMonth(
                month,
                rule.dayOfMonth,
                linkedPayroll?.payTiming,
              )
            : month;
          const scheduledDate = resolveScheduledDateForMonth(
            settlementMonth,
            rule.dayOfMonth,
          );
          if (scheduledDate > effectiveAsOfDate) continue;

          const sourceRefType = 'RECURRING_EXPENSE';
          const sourceRefId = `${rule.id}:${month}`;
          // Check ANY status (POSTED or VOID) so admin-voided occurrences are never resurrected by cron.
          const existing = await journalRepo.findOneBy({
            workspaceId,
            sourceRefType,
            sourceRefId,
          });
          if (existing) continue;

          if (
            profile.lockedThroughDate &&
            scheduledDate <= profile.lockedThroughDate
          ) {
            this.logger.warn(
              `Skipping recurring expense ${rule.id} (${month}): scheduled date ${scheduledDate} is inside locked period through ${profile.lockedThroughDate}.`,
            );
            continue;
          }

          const fundingAccount = accountById.get(rule.fundingAccountId);
          if (!fundingAccount || !fundingAccount.active) {
            this.logger.warn(
              `Skipping recurring expense ${rule.id} (${month}): funding account ${rule.fundingAccountId} is inactive or missing.`,
            );
            continue;
          }

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
          const fundingAed = await this.resolveCashOutflowCarryingAed(
            manager,
            workspaceId,
            fundingAccount,
            amount,
            aedAmount,
            scheduledDate,
          );
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

      // 2. Due payday payroll adjustments (overtime, unpaid leave reduction, bonuses, and days 29-31 delta catch-up)
      const recurringRuleById = new Map(
        recurringRules.map((rule) => [rule.id, rule]),
      );
      for (const month of candidateMonths) {
        for (const payrollProfile of payrollProfiles) {
          const linkedRule = payrollProfile.recurringExpenseId
            ? recurringRuleById.get(payrollProfile.recurringExpenseId)
            : undefined;
          if (linkedRule) {
            if (month < linkedRule.startMonth) continue;
            if (linkedRule.endMonth && month > linkedRule.endMonth) continue;
          }
          const settlementMonth = resolvePayrollSettlementMonth(
            month,
            payrollProfile.payDayOfMonth,
            payrollProfile.payTiming,
          );
          const paydayDate = resolveScheduledDateForMonth(
            settlementMonth,
            payrollProfile.payDayOfMonth,
          );
          if (paydayDate > effectiveAsOfDate) continue;

          const postedCount = await this.postPayrollAdjustmentsInTransaction(
            manager,
            workspaceId,
            profile,
            systemAccounts,
            payrollProfile,
            month,
            settlementMonth,
            paydayDate,
            effectiveAsOfDate,
            actorMemberId,
            undefined,
            false,
          );
          payrollAdjustmentsPosted += postedCount;
        }
      }

      // 3. Due recurring client invoices (creates & saves PDF inside OS; NEVER auto-emails!)
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
          if (issueDate > effectiveAsOfDate) continue;

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
        resolvedAsOfDate,
      );
    }

    return counts;
  }

  private async postSingleRecurringExpenseInTransaction(
    manager: EntityManager,
    params: {
      workspaceId: string;
      profile: DeliveryFinanceV2ProfileEntity;
      systemAccounts: Map<string, DeliveryFinanceV2AccountEntity>;
      rule: DeliveryFinanceV2RecurringExpenseEntity;
      linkedPayrollProfile?: DeliveryFinanceV2PayrollProfileEntity | null;
      month: string;
      today: string;
      entryDateOverride?: string;
      fxRateOverride?: string;
      actorMemberId: string;
    },
  ): Promise<DeliveryFinanceV2JournalEntity> {
    const {
      workspaceId,
      profile,
      systemAccounts,
      rule,
      linkedPayrollProfile,
      month,
      today,
      entryDateOverride,
      fxRateOverride,
      actorMemberId,
    } = params;

    if (rule.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Resume this recurring bill before expensing it.',
      );
    }

    const currentMonth = monthOfDate(today);
    if (month > currentMonth) {
      throw new BadRequestException(
        'Cannot expense a recurring bill for a future month.',
      );
    }
    if (month < rule.startMonth) {
      throw new BadRequestException(
        `This recurring bill starts in ${rule.startMonth} and cannot be expensed for ${month}.`,
      );
    }
    if (rule.endMonth && month > rule.endMonth) {
      throw new BadRequestException(
        `This recurring bill ended in ${rule.endMonth} and cannot be expensed for ${month}.`,
      );
    }

    const isPayrollBase = Boolean(
      linkedPayrollProfile || rule.employeeMemberId || rule.employeeName,
    );
    const effectivePayTiming = resolveRecurringPayTiming(
      rule,
      linkedPayrollProfile,
    );
    const settlementMonth = isPayrollBase
      ? resolvePayrollSettlementMonth(
          month,
          rule.dayOfMonth,
          effectivePayTiming ?? undefined,
        )
      : month;
    if (settlementMonth > currentMonth) {
      throw new BadRequestException(
        `This salary for ${month} settles in ${settlementMonth} and cannot be expensed before ${settlementMonth}.`,
      );
    }
    const scheduledDate = resolveScheduledDateForMonth(
      settlementMonth,
      rule.dayOfMonth,
    );

    let entryDate = entryDateOverride;
    if (entryDate) {
      if (entryDate > today) {
        throw new BadRequestException(
          `Expense date cannot be in the future (after ${today}).`,
        );
      }
      if (entryDate.slice(0, 7) !== settlementMonth) {
        throw new BadRequestException(
          `Expense date must fall within ${settlementMonth}.`,
        );
      }
    } else {
      entryDate = scheduledDate <= today ? scheduledDate : today;
      if (
        profile.lockedThroughDate &&
        entryDate <= profile.lockedThroughDate &&
        today > profile.lockedThroughDate &&
        today.slice(0, 7) === settlementMonth
      ) {
        entryDate = today;
      }
    }

    assertDateNotLocked(profile.lockedThroughDate, entryDate, 'post entries');

    const fundingAccount = await this.assertFundingAccount(
      manager,
      workspaceId,
      rule.fundingAccountId,
    );
    if (
      fundingAccount.subType === 'CASH_CURRENCY' &&
      fundingAccount.currency !== rule.currency
    ) {
      throw new BadRequestException(
        `Choose Company Cash (${rule.currency}) or a Person Liability account.`,
      );
    }

    const journalRepo = manager.getRepository(DeliveryFinanceV2JournalEntity);
    const sourceRefType = 'RECURRING_EXPENSE';
    const baseRefId = `${rule.id}:${month}`;
    const allRecurringJournals = await journalRepo.findBy({
      workspaceId,
      sourceRefType,
    });
    const matching = allRecurringJournals.filter(
      (item) =>
        item.sourceRefId === baseRefId ||
        Boolean(item.sourceRefId?.startsWith(`${baseRefId}:REPOST:`)),
    );

    const postedReversals = await journalRepo.findBy({
      workspaceId,
      entryType: 'REVERSAL',
      status: 'POSTED',
    });
    const reversedJournalIds = new Set(
      postedReversals
        .map((rev) => rev.reversalOfJournalId)
        .filter((id): id is string => Boolean(id)),
    );

    const activePosted = matching.find(
      (item) => item.status === 'POSTED' && !reversedJournalIds.has(item.id),
    );
    if (activePosted) {
      throw new ConflictException(
        `"${rule.title}" has already been expensed for ${month} (${activePosted.entryDate}).`,
      );
    }

    // Reuse the canonical `${rule.id}:${month}` key unless a locked-period reversed POSTED row still
    // occupies the partial unique index (status = 'POSTED'), in which case allocate a `:REPOST:` key.
    let sourceRefId = baseRefId;
    const usedPostedRefs = new Set(
      matching
        .filter((item) => item.status === 'POSTED')
        .map((item) => item.sourceRefId)
        .filter((ref): ref is string => Boolean(ref)),
    );
    if (usedPostedRefs.has(baseRefId)) {
      let repostIndex = matching.length + 1;
      while (usedPostedRefs.has(`${baseRefId}:REPOST:${repostIndex}`)) {
        repostIndex += 1;
      }
      sourceRefId = `${baseRefId}:REPOST:${repostIndex}`;
    }

    const fxRate = this.resolveFxRate(profile, rule.currency, fxRateOverride);
    const amount = BigInt(rule.amountMicros);
    const aedAmount = convertToAedMicros(amount, rule.currency, fxRate);
    assertPositiveAed(aedAmount, 'Recurring expense amount');

    const targetCode =
      rule.expenseType === 'DIRECT_EXPENSE'
        ? 'EXPENSE:DIRECT'
        : 'EXPENSE:INDIRECT';
    const targetAccount = systemAccounts.get(targetCode)!;
    const fxAccount = systemAccounts.get('FX:GAIN_LOSS')!;
    const fundingAed = await this.resolveCashOutflowCarryingAed(
      manager,
      workspaceId,
      fundingAccount,
      amount,
      aedAmount,
      entryDate,
    );
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

    const journal = await this.postJournal(manager, {
      workspaceId,
      entryDate,
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

    // Never leak employee salary details into the shared workspace activity feed.
    if (!isPayrollBase && !isPayrollSensitiveCategory(rule.category)) {
      await recordOtogrowActivity(manager, {
        workspaceId,
        actorId: actorMemberId,
        category: 'BUSINESS',
        action: rule.expenseType,
        outcome: 'RECORDED',
        summary: `${rule.title} (${month}, ${rule.currency})`.slice(0, 240),
        sourceType: 'finance',
        sourceId: journal.id,
      });
    }

    return journal;
  }

  private async postPayrollAdjustmentsInTransaction(
    manager: EntityManager,
    workspaceId: string,
    profile: DeliveryFinanceV2ProfileEntity,
    systemAccounts: Map<string, DeliveryFinanceV2AccountEntity>,
    payrollProfile: DeliveryFinanceV2PayrollProfileEntity,
    month: string,
    settlementMonth: string,
    paydayDate: string,
    asOfDate: string,
    actorMemberId: string,
    fxOverride: string | undefined,
    forceResync: boolean,
  ): Promise<number> {
    const fundingAccount = await manager
      .getRepository(DeliveryFinanceV2AccountEntity)
      .findOneBy({ workspaceId, id: payrollProfile.fundingAccountId });
    if (!fundingAccount || !fundingAccount.active) {
      if (forceResync) {
        throw new BadRequestException(
          `Funding account for ${payrollProfile.employeeName} is inactive or missing. Update the payroll profile funding source first.`,
        );
      }
      this.logger.warn(
        `Skipping payroll adjustments for ${payrollProfile.id} (${month}): funding account ${payrollProfile.fundingAccountId} is inactive or missing.`,
      );
      return 0;
    }

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
    const fxAccount = systemAccounts.get('FX:GAIN_LOSS')!;
    const journalRepo = manager.getRepository(DeliveryFinanceV2JournalEntity);

    const postedReversals = await journalRepo.findBy({
      workspaceId,
      entryType: 'REVERSAL',
      status: 'POSTED',
    });
    const reversedJournalIds = new Set(
      postedReversals
        .map((rev) => rev.reversalOfJournalId)
        .filter((id): id is string => Boolean(id)),
    );

    // Prevent posting PAYROLL_LEAVE_REDUCTION when no unreversed base salary was posted for this employee/month.
    const baseSalaryRefPrefix = payrollProfile.recurringExpenseId
      ? `${payrollProfile.recurringExpenseId}:${month}`
      : null;
    const allRecurringBaseJournals = baseSalaryRefPrefix
      ? await journalRepo.findBy({
          workspaceId,
          sourceRefType: 'RECURRING_EXPENSE',
          status: 'POSTED',
        })
      : [];
    const baseSalaryPosted = baseSalaryRefPrefix
      ? allRecurringBaseJournals.some(
          (item) =>
            (item.sourceRefId === baseSalaryRefPrefix ||
              Boolean(
                item.sourceRefId?.startsWith(`${baseSalaryRefPrefix}:REPOST:`),
              )) &&
            !reversedJournalIds.has(item.id),
        )
      : false;

    const allPayrollAdjJournals = await journalRepo.findBy({
      workspaceId,
      sourceRefType: 'PAYROLL_ADJUSTMENT',
    });

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
    const settlementMonthEnd = resolveMonthLastDate(settlementMonth);

    for (const spec of specs) {
      const sourceRefType = 'PAYROLL_ADJUSTMENT';
      const baseRefId = `${payrollProfile.id}:${month}:${spec.refSuffix}`;
      const matching = allPayrollAdjJournals.filter(
        (item) =>
          item.sourceRefId === baseRefId ||
          Boolean(item.sourceRefId?.startsWith(`${baseRefId}:DELTA:`)),
      );

      let amountToPost = spec.amountMicros;
      let postingRefId = baseRefId;
      let postingDate = paydayDate;
      let postingTitle = spec.title;

      if (spec.isReduction && !baseSalaryPosted) {
        if (forceResync && spec.amountMicros > BigInt('0')) {
          throw new BadRequestException(
            `Cannot post unpaid leave deduction for ${payrollProfile.employeeName} (${month}) before base salary is posted. Run due automation first.`,
          );
        }
        continue;
      }

      if (!forceResync) {
        // Respect manual admin voids: never resurrect an adjustment explicitly voided by an admin.
        const manuallyVoided = matching.some(
          (item) =>
            item.status === 'VOID' &&
            item.voidReason !== 'Recalculated payroll adjustments',
        );
        if (manuallyVoided) continue;

        let alreadyPostedMicros = BigInt('0');
        for (const item of matching) {
          if (item.status !== 'POSTED' || reversedJournalIds.has(item.id)) {
            continue;
          }
          const raw = BigInt(item.amountMicros);
          alreadyPostedMicros += raw < BigInt('0') ? -raw : raw;
        }
        const deltaMicros = spec.amountMicros - alreadyPostedMicros;
        if (deltaMicros <= BigInt('0')) continue;

        amountToPost = deltaMicros;
        if (
          alreadyPostedMicros > BigInt('0') ||
          matching.some((item) => item.status === 'POSTED')
        ) {
          postingRefId = `${baseRefId}:DELTA:${matching.length + 1}`;
          postingTitle = `${spec.title} (catch-up)`;
          if (asOfDate > paydayDate) {
            postingDate =
              asOfDate <= settlementMonthEnd ? asOfDate : settlementMonthEnd;
          }
        }
        if (
          profile.lockedThroughDate &&
          postingDate <= profile.lockedThroughDate
        ) {
          this.logger.warn(
            `Skipping payroll adjustment ${postingRefId}: date ${postingDate} is inside locked period through ${profile.lockedThroughDate}.`,
          );
          continue;
        }
      } else {
        for (const item of matching) {
          if (item.status !== 'POSTED') continue;
          assertDateNotLocked(
            profile.lockedThroughDate,
            item.entryDate,
            'recalculate payroll adjustments',
          );
          item.status = 'VOID';
          item.voidedBy = actorMemberId;
          item.voidedAt = new Date();
          item.voidReason = 'Recalculated payroll adjustments';
          await journalRepo.save(item);
        }
      }

      if (amountToPost <= BigInt('0')) continue;

      const aedAmount = convertToAedMicros(
        amountToPost,
        payrollProfile.currency,
        fxRate,
      );
      if (aedAmount <= BigInt('0')) continue;

      const fundingAed = spec.isReduction
        ? await this.resolveCashInflowCarryingAed(
            manager,
            workspaceId,
            fundingAccount,
            amountToPost,
            aedAmount,
            postingDate,
          )
        : await this.resolveCashOutflowCarryingAed(
            manager,
            workspaceId,
            fundingAccount,
            amountToPost,
            aedAmount,
            postingDate,
          );

      const lines: FinanceV2JournalLineDraft[] = spec.isReduction
        ? [
            {
              accountId: payrollProfile.fundingAccountId,
              debitAedMicros: fundingAed,
              creditAedMicros: BigInt('0'),
              currency: payrollProfile.currency,
              originalSignedMicros: amountToPost,
            },
            {
              accountId: directExpenseAccount.id,
              debitAedMicros: BigInt('0'),
              creditAedMicros: aedAmount,
              currency: payrollProfile.currency,
              originalSignedMicros: -amountToPost,
            },
          ]
        : [
            {
              accountId: directExpenseAccount.id,
              debitAedMicros: aedAmount,
              creditAedMicros: BigInt('0'),
              currency: payrollProfile.currency,
              originalSignedMicros: amountToPost,
            },
            {
              accountId: payrollProfile.fundingAccountId,
              debitAedMicros: BigInt('0'),
              creditAedMicros: fundingAed,
              currency: payrollProfile.currency,
              originalSignedMicros: -amountToPost,
            },
          ];
      if (spec.isReduction) {
        this.appendFxSpreadLines(lines, fxAccount.id, fundingAed, aedAmount);
      } else {
        this.appendFxSpreadLines(lines, fxAccount.id, aedAmount, fundingAed);
      }

      await this.postJournal(manager, {
        workspaceId,
        entryDate: postingDate,
        entryType: spec.entryType,
        category: spec.category,
        title: postingTitle,
        notes: spec.note,
        currency: payrollProfile.currency,
        amountMicros: spec.isReduction ? -amountToPost : amountToPost,
        fxRateToAed: fxRate,
        aedAmountMicros: aedAmount,
        fundingAccountId: payrollProfile.fundingAccountId,
        targetAccountId: directExpenseAccount.id,
        employeeMemberId: payrollProfile.employeeMemberId,
        sourceRefType,
        sourceRefId: postingRefId,
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

    const readOnce = (allowBackfillCheck: boolean) =>
      this.dataSource.transaction(async (manager) => {
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

        if (
          allowBackfillCheck &&
          (await this.hasUnsyncedClientBusinessBilling(
            manager,
            workspace.id,
            profile.lockedThroughDate,
          ))
        ) {
          return { __needsClientBillingBackfill: true as const };
        }

        const today = todayIsoDate(now, profile.timezone);
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
        { redactPayrollBreakdown: !canViewPayroll },
      );
      const balanceSheet = calculateBalanceSheet(
        ledgerLines,
        asOfDate,
        personEmails,
      );

      // G6-ACCESS-PRIVACY + M9 SQL pagination: exclude payroll-sensitive journals in SQL *before* LIMIT 500
      // so high-volume payroll rows never crowd out non-payroll ledger entries for non-admin finance managers.
      const journalRepo = manager.getRepository(DeliveryFinanceV2JournalEntity);
      let journals: DeliveryFinanceV2JournalEntity[];
      if (typeof journalRepo.createQueryBuilder === 'function') {
        const qb = journalRepo
          .createQueryBuilder('journal')
          .where('journal."workspaceId" = :workspaceId', {
            workspaceId: workspace.id,
          });
        if (!canViewPayroll) {
          qb.andWhere('journal."entryType" NOT IN (:...payrollTypes)', {
            payrollTypes: PAYROLL_JOURNAL_TYPE_LIST,
          }).andWhere(
            "UPPER(journal.\"category\") <> 'DIRECT_SALARY' AND UPPER(journal.\"category\") NOT LIKE 'PAYROLL\\_%' ESCAPE '\\'",
          );
        }
        journals = await qb
          .orderBy('journal.entryDate', 'DESC')
          .addOrderBy('journal.createdAt', 'DESC')
          .take(500)
          .getMany();
        if (!canViewPayroll) {
          journals = journals.filter(
            (item) => !isPayrollSensitiveJournal(item),
          );
        }
      } else {
        const fetched = await journalRepo.find({
          where: { workspaceId: workspace.id },
          order: { entryDate: 'DESC', createdAt: 'DESC' },
        });
        journals = (
          canViewPayroll
            ? fetched
            : fetched.filter((item) => !isPayrollSensitiveJournal(item))
        ).slice(0, 500);
      }

      const postedReversalJournals = await journalRepo.findBy({
        workspaceId: workspace.id,
        entryType: 'REVERSAL',
        status: 'POSTED',
      });
      const reversedJournalIds = new Set(
        postedReversalJournals
          .map((rev) => rev.reversalOfJournalId)
          .filter((id): id is string => Boolean(id)),
      );

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
      const recurringExpenses = canViewPayroll
        ? allRecurringExpenses
        : allRecurringExpenses.filter(
            (rule) =>
              !isPayrollSensitiveRecurring(rule, payrollLinkedRecurringIds),
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
          reversed: boolean;
        }[]
      >();
      for (const journal of invoicePaymentJournals) {
        if (
          journal.sourceRefType === 'INVOICE_PAYMENT' &&
          journal.sourceRefId
        ) {
          const [invoiceId] = journal.sourceRefId.split(':');
          const list = paymentsByInvoiceId.get(invoiceId) ?? [];
          list.push({
            journalId: journal.id,
            paymentDate: journal.entryDate,
            amountMicros: journal.amountMicros,
            aedAmountMicros: journal.aedAmountMicros,
            currency: journal.currency,
            status: journal.status,
            reversed: reversedJournalIds.has(journal.id),
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
          occurredAt: todayIsoDate(
            spend.settledAt ?? spend.createdAt,
            profile.timezone,
          ),
        }));

      const projects = await manager.getRepository(DeliveryProjectEntity).find({
        where: { workspaceId: workspace.id },
        order: { name: 'ASC' },
      });
      const activeMembers = await this.access.listActiveMembers(
        workspace.id,
        manager,
      );

      const previousRange = calculatePreviousPeriodRange(fromDate, toDate);
      const previousPnl = calculateProfitAndLoss(
        ledgerLines,
        previousRange.fromDate,
        previousRange.toDate,
      );
      const monthlyTrend = calculateMonthlyTrend(
        ledgerLines,
        toDate.slice(0, 7),
        6,
      );
      const burnAndRunway = calculateBurnAndRunway(
        ledgerLines,
        fromDate,
        toDate,
        asOfDate,
        BigInt(balanceSheet.totalCashAedMicros),
      );

      const agingTotals: Record<
        FinanceV2InvoiceAgingBucket['key'],
        { count: number; aed: bigint }
      > = {
        NOT_DUE: { count: 0, aed: BigInt('0') },
        DAYS_1_15: { count: 0, aed: BigInt('0') },
        DAYS_16_30: { count: 0, aed: BigInt('0') },
        DAYS_31_PLUS: { count: 0, aed: BigInt('0') },
      };
      for (const invoice of enrichedInvoices) {
        const outstanding = BigInt(invoice.outstandingMicros);
        if (invoice.status === 'VOID' || outstanding <= BigInt('0')) continue;
        const fx = this.resolveFxRate(profile, invoice.currency);
        const outstandingAed = convertToAedMicros(
          outstanding,
          invoice.currency,
          fx,
        );
        const bucketKey: FinanceV2InvoiceAgingBucket['key'] =
          invoice.overdueDays === 0
            ? 'NOT_DUE'
            : invoice.overdueDays <= 15
              ? 'DAYS_1_15'
              : invoice.overdueDays <= 30
                ? 'DAYS_16_30'
                : 'DAYS_31_PLUS';
        agingTotals[bucketKey].count += 1;
        agingTotals[bucketKey].aed += outstandingAed;
      }
      const invoiceAging: FinanceV2InvoiceAgingBucket[] = (
        ['NOT_DUE', 'DAYS_1_15', 'DAYS_16_30', 'DAYS_31_PLUS'] as const
      ).map((key) => ({
        key,
        count: agingTotals[key].count,
        aedMicros: agingTotals[key].aed.toString(),
      }));

      const windowStart = today;
      const windowEnd = addDaysToIsoDate(today, 29);
      const startMonth = windowStart.slice(0, 7);
      const endMonth = windowEnd.slice(0, 7);
      const windowMonths = [
        ...new Set([
          previousYearMonth(startMonth),
          startMonth,
          nextYearMonth(startMonth),
          endMonth,
        ]),
      ];

      // Exclude recurring bills & payroll base occurrences that were already posted or voided.
      const existingRecurringJournals = await manager
        .getRepository(DeliveryFinanceV2JournalEntity)
        .find({
          where: {
            workspaceId: workspace.id,
            sourceRefType: 'RECURRING_EXPENSE',
          },
        });
      const existingRecurringRefs = new Set(
        existingRecurringJournals
          .map((item) => item.sourceRefId)
          .filter((value): value is string => Boolean(value)),
      );

      let upcomingRecurringAed = BigInt('0');
      let upcomingRecurringCount = 0;
      const recurringById = new Map(
        allRecurringExpenses.map((rule) => [rule.id, rule]),
      );
      for (const rule of recurringExpenses) {
        if (
          rule.status !== 'ACTIVE' ||
          isPayrollSensitiveRecurring(rule, payrollLinkedRecurringIds)
        ) {
          continue;
        }
        for (const month of windowMonths) {
          if (month < rule.startMonth) continue;
          if (rule.endMonth && month > rule.endMonth) continue;
          if (existingRecurringRefs.has(`${rule.id}:${month}`)) continue;
          const scheduledDate = resolveScheduledDateForMonth(
            month,
            rule.dayOfMonth,
          );
          if (scheduledDate >= windowStart && scheduledDate <= windowEnd) {
            upcomingRecurringAed += convertToAedMicros(
              BigInt(rule.amountMicros),
              rule.currency,
              this.resolveFxRate(profile, rule.currency),
            );
            upcomingRecurringCount += 1;
          }
        }
      }

      let upcomingPayrollAed: bigint | null = canViewPayroll
        ? BigInt('0')
        : null;
      let upcomingPayrollCount: number | null = canViewPayroll ? 0 : null;
      if (canViewPayroll) {
        for (const prof of payrollProfiles) {
          if (!prof.active) continue;
          const linkedRule = prof.recurringExpenseId
            ? recurringById.get(prof.recurringExpenseId)
            : undefined;
          if (linkedRule && linkedRule.status !== 'ACTIVE') continue;
          for (const serviceMonth of windowMonths) {
            if (linkedRule && serviceMonth < linkedRule.startMonth) continue;
            if (linkedRule?.endMonth && serviceMonth > linkedRule.endMonth) {
              continue;
            }
            if (
              linkedRule &&
              existingRecurringRefs.has(`${linkedRule.id}:${serviceMonth}`)
            ) {
              continue;
            }
            const settlementMonth = resolvePayrollSettlementMonth(
              serviceMonth,
              prof.payDayOfMonth,
              prof.payTiming,
            );
            const scheduledDate = resolveScheduledDateForMonth(
              settlementMonth,
              prof.payDayOfMonth,
            );
            if (scheduledDate >= windowStart && scheduledDate <= windowEnd) {
              upcomingPayrollAed =
                (upcomingPayrollAed ?? BigInt('0')) +
                convertToAedMicros(
                  BigInt(prof.baseSalaryMicros),
                  prof.currency,
                  this.resolveFxRate(profile, prof.currency),
                );
              upcomingPayrollCount = (upcomingPayrollCount ?? 0) + 1;
            }
          }
        }
      }

      let expectedReceivablesAed = BigInt('0');
      let expectedReceivableCount = 0;
      const generatedScheduleMonths = new Set<string>();
      for (const invoice of enrichedInvoices) {
        // Include VOID invoices too so voided scheduled invoices are never re-counted as upcoming.
        if (invoice.scheduleId && invoice.scheduleMonth) {
          generatedScheduleMonths.add(
            `${invoice.scheduleId}:${invoice.scheduleMonth}`,
          );
        }
        const outstanding = BigInt(invoice.outstandingMicros);
        if (
          invoice.status !== 'VOID' &&
          outstanding > BigInt('0') &&
          invoice.dueDate >= windowStart &&
          invoice.dueDate <= windowEnd
        ) {
          expectedReceivablesAed += convertToAedMicros(
            outstanding,
            invoice.currency,
            this.resolveFxRate(profile, invoice.currency),
          );
          expectedReceivableCount += 1;
        }
      }
      for (const schedule of invoiceSchedules) {
        if (schedule.status !== 'ACTIVE') continue;
        for (const month of windowMonths) {
          if (month < schedule.startMonth) continue;
          if (schedule.endMonth && month > schedule.endMonth) continue;
          if (generatedScheduleMonths.has(`${schedule.id}:${month}`)) continue;
          const { dueDate } = resolveRecurringInvoiceDates(
            month,
            schedule.billingDayOfMonth,
            schedule.dueDayOfMonth,
          );
          if (dueDate >= windowStart && dueDate <= windowEnd) {
            expectedReceivablesAed += convertToAedMicros(
              BigInt(schedule.totalMicros),
              schedule.currency,
              this.resolveFxRate(profile, schedule.currency),
            );
            expectedReceivableCount += 1;
          }
        }
      }

      const payrollMonthRevenueAedMicros = canViewPayroll
        ? calculateProfitAndLoss(
            ledgerLines,
            `${payrollMonth}-01`,
            resolveMonthLastDate(payrollMonth),
          ).revenueAedMicros
        : null;
      const projectNamesById = new Map(
        projects.map((project) => [project.id, project.name]),
      );
      const projectProfitability = calculateProjectProfitability(
        ledgerLines,
        fromDate,
        toDate,
        projectNamesById,
        canViewPayroll,
      );

      const operations = await manager
        .getRepository(DeliveryOperationsEntity)
        .findOneBy({ workspaceId: workspace.id });
      const clientRoster = normalizeClientRoster(operations?.state.clientRoster);
      const clientFees = operations?.state.clientFees ?? {};
      const engagements = operations?.state.clients?.engagements ?? [];
      const effectiveClientIds = resolveEffectiveClientCompanyIds(
        clientRoster,
        projects.map((project) => project.companyId),
        engagements.map((engagement) => engagement.companyId),
      );
      let activeClientsForMrr: { id: string; name: string }[] = [];
      if (effectiveClientIds.length > 0) {
        let companyRows:
          | { id: string; name: string; deletedAt?: Date | string | null }[]
          | null = null;
        try {
          const queried = await manager.query(
            `SELECT id, name, "deletedAt" FROM ${this.delivery.schema(workspace)}."company" WHERE id = ANY($1::uuid[])`,
            [effectiveClientIds],
          );
          if (Array.isArray(queried)) {
            companyRows = queried as {
              id: string;
              name: string;
              deletedAt?: Date | string | null;
            }[];
          }
        } catch {
          companyRows = null;
        }
        if (companyRows && companyRows.length > 0) {
          activeClientsForMrr = companyRows
            .filter((row) => !row.deletedAt)
            .map((row) => ({
              id: row.id,
              name: row.name?.trim() || 'Client',
            }));
        } else {
          const projectNameByCompanyId = new Map<string, string>();
          for (const project of projects) {
            if (project.companyId && !projectNameByCompanyId.has(project.companyId)) {
              projectNameByCompanyId.set(project.companyId, project.name);
            }
          }
          activeClientsForMrr = effectiveClientIds.map((companyId) => ({
            id: companyId,
            name: projectNameByCompanyId.get(companyId) ?? 'Client',
          }));
        }
      }

      const projectedMrr = computeProjectedMrrSnapshot({
        workspaceId: workspace.id,
        activeClients: activeClientsForMrr,
        clientFees,
        projects: projects.map((project) => ({
          id: project.id,
          companyId: project.companyId,
        })),
        businessRecords: operations?.state.business?.records ?? [],
        financeV2Invoices: allInvoices.map((invoice) => ({
          id: invoice.id,
          clientName: invoice.clientName,
          projectId: invoice.projectId,
          currency: invoice.currency,
          status: invoice.status,
        })),
        financeV2PaymentJournals: invoicePaymentJournals.map((journal) => ({
          id: journal.id,
          entryDate: journal.entryDate,
          currency: journal.currency,
          amountMicros: journal.amountMicros,
          aedAmountMicros: journal.aedAmountMicros,
          projectId: journal.projectId,
          sourceRefType: journal.sourceRefType,
          sourceRefId: journal.sourceRefId,
          status: journal.status,
          reversed: reversedJournalIds.has(journal.id),
        })),
        exchangeRates: profile.exchangeRates,
        timeZone: profile.timezone,
        month: currentMonth,
      });

      const analytics: FinanceV2Analytics = {
        previousPeriod: {
          fromDate: previousRange.fromDate,
          toDate: previousRange.toDate,
          revenueAedMicros: previousPnl.revenueAedMicros,
          totalExpenseAedMicros: previousPnl.totalExpenseAedMicros,
          grossProfitAedMicros: previousPnl.grossProfitAedMicros,
          netProfitAedMicros: previousPnl.netProfitAedMicros,
        },
        monthlyTrend,
        burnAndRunway,
        invoiceAging,
        upcomingCommitments30d: {
          windowStart,
          windowEnd,
          recurringExpensesAedMicros: upcomingRecurringAed.toString(),
          recurringExpenseCount: upcomingRecurringCount,
          payrollAedMicros:
            upcomingPayrollAed !== null ? upcomingPayrollAed.toString() : null,
          payrollCount: upcomingPayrollCount,
          expectedReceivablesAedMicros: expectedReceivablesAed.toString(),
          expectedReceivableCount,
        },
        payrollMonthRevenueAedMicros,
        projectProfitability,
        projectedMrr,
      };

      const payrollProfileByRecurringId = new Map<
        string,
        DeliveryFinanceV2PayrollProfileEntity
      >();
      for (const prof of allPayrollProfiles) {
        if (prof.recurringExpenseId) {
          payrollProfileByRecurringId.set(prof.recurringExpenseId, prof);
        }
      }
      const recurringCurrentMonthStatusByRuleId = new Map<
        string,
        {
          payTiming: 'SAME_MONTH' | 'FOLLOWING_MONTH' | null;
          currentMonthTargetMonth: string;
          currentMonthStatus: 'POSTED' | 'VOID' | 'REVERSED' | 'NOT_POSTED';
          currentMonthEntryDate: string | null;
          currentMonthJournalId: string | null;
        }
      >();
      const timestampOf = (value: Date | string | undefined): number => {
        if (!value) return 0;
        const ms = value instanceof Date ? value.getTime() : Date.parse(value);
        return Number.isFinite(ms) ? ms : 0;
      };
      for (const rule of recurringExpenses) {
        const linkedPayroll = payrollProfileByRecurringId.get(rule.id);
        const payTiming = resolveRecurringPayTiming(rule, linkedPayroll);
        const targetMonth = resolveCurrentMonthTargetForRecurringRule(
          rule,
          linkedPayroll,
          currentMonth,
        );
        const baseRefId = `${rule.id}:${targetMonth}`;
        const matching = existingRecurringJournals
          .filter(
            (item) =>
              item.sourceRefId === baseRefId ||
              Boolean(item.sourceRefId?.startsWith(`${baseRefId}:REPOST:`)),
          )
          .sort(
            (left, right) =>
              timestampOf(right.createdAt) - timestampOf(left.createdAt) ||
              right.id.localeCompare(left.id),
          );
        const activePosted = matching.find(
          (item) =>
            item.status === 'POSTED' && !reversedJournalIds.has(item.id),
        );
        if (activePosted) {
          recurringCurrentMonthStatusByRuleId.set(rule.id, {
            payTiming,
            currentMonthTargetMonth: targetMonth,
            currentMonthStatus: 'POSTED',
            currentMonthEntryDate: activePosted.entryDate,
            currentMonthJournalId: activePosted.id,
          });
        } else if (matching.length > 0) {
          const latest = matching[0];
          const latestIsReversed =
            latest.status === 'POSTED' && reversedJournalIds.has(latest.id);
          recurringCurrentMonthStatusByRuleId.set(rule.id, {
            payTiming,
            currentMonthTargetMonth: targetMonth,
            currentMonthStatus: latestIsReversed ? 'REVERSED' : 'VOID',
            currentMonthEntryDate: null,
            currentMonthJournalId: null,
          });
        } else {
          recurringCurrentMonthStatusByRuleId.set(rule.id, {
            payTiming,
            currentMonthTargetMonth: targetMonth,
            currentMonthStatus: 'NOT_POSTED',
            currentMonthEntryDate: null,
            currentMonthJournalId: null,
          });
        }
      }

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
          // Served via cached REST endpoint /portal/delivery-finance-v2-files/profile/logo
          // instead of shipping up to 1.5 MB base64 on every 30-second snapshot poll.
          logoDataUrl: null,
          hasLogo: Boolean(profile.logoDataUrl),
          logoUpdatedAt: profile.logoDataUrl
            ? createHash('sha256')
                .update(profile.logoDataUrl)
                .digest('hex')
                .slice(0, 16)
            : null,
          timezone: profile.timezone || FINANCE_V2_DEFAULT_TIMEZONE,
          lockedThroughDate: profile.lockedThroughDate ?? null,
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
        analytics,
        pendingReceivables: {
          count: pendingUnpaidCount,
          totalAedMicros: pendingUnpaidAed.toString(),
          overdueCount,
          overdueAedMicros: overdueAed.toString(),
        },
        journals: journals.map((item) => ({
          ...item,
          isReversed: reversedJournalIds.has(item.id),
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
        recurringExpenses: recurringExpenses.map((rule) => {
          const monthState = recurringCurrentMonthStatusByRuleId.get(rule.id);
          return {
            ...rule,
            fundingAccountName:
              accountById.get(rule.fundingAccountId)?.name ?? 'Unknown account',
            payTiming: monthState?.payTiming ?? null,
            currentMonthTargetMonth:
              monthState?.currentMonthTargetMonth ?? currentMonth,
            currentMonthStatus: monthState?.currentMonthStatus ?? 'NOT_POSTED',
            currentMonthEntryDate: monthState?.currentMonthEntryDate ?? null,
            currentMonthJournalId: monthState?.currentMonthJournalId ?? null,
            createdAt: rule.createdAt.toISOString(),
            updatedAt: rule.updatedAt.toISOString(),
          };
        }),
        payrollProfiles: payrollProfiles.map((prof) => {
          const linkedRule = prof.recurringExpenseId
            ? recurringById.get(prof.recurringExpenseId)
            : undefined;
          return {
            ...prof,
            payTiming:
              prof.payTiming ??
              (prof.payDayOfMonth <= 10 ? 'FOLLOWING_MONTH' : 'SAME_MONTH'),
            startMonth: linkedRule?.startMonth ?? null,
            fundingAccountName:
              accountById.get(prof.fundingAccountId)?.name ?? 'Unknown account',
            createdAt: prof.createdAt.toISOString(),
            updatedAt: prof.updatedAt.toISOString(),
          };
        }),
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

    const firstPass = await readOnce(true);
    if ('__needsClientBillingBackfill' in firstPass) {
      await this.backfillUnsyncedClientBusinessBilling(workspace, memberId);
      const secondPass = await readOnce(false);
      if ('__needsClientBillingBackfill' in secondPass) {
        throw new Error('Unexpected Finance V2 backfill state.');
      }
      return secondPass;
    }
    return firstPass;
  }

  async command(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    rawInput: unknown,
    now = new Date(),
  ): Promise<Record<string, unknown>> {
    const input = parseFinanceV2Input(financeV2CommandSchema, rawInput);

    if (input.action === 'runDueAutomation') {
      const workspaceToday = await this.dataSource.transaction(
        async (manager) => {
          await this.authorize(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            true,
            true,
          );
          const profile = await this.ensureProfile(manager, workspace.id);
          return todayIsoDate(now, profile.timezone);
        },
      );
      const targetAsOfDate = input.asOfDate ?? workspaceToday;
      if (targetAsOfDate > workspaceToday) {
        throw new BadRequestException(
          'Scheduled automation cannot run for a future date.',
        );
      }
      return this.runDueAutomationForWorkspace(
        workspace.id,
        memberId,
        targetAsOfDate,
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
    let acquiredEmailLockKey: string | null = null;
    let today = todayIsoDate(now);

    const isAdminOnlyMutation = [
      'setPeriodLock',
      'savePayrollProfile',
      'addPayrollEntry',
      'deletePayrollEntry',
      'postPayrollAdjustments',
    ].includes(input.action);

    try {
      const txResult = await this.dataSource.transaction(async (manager) => {
        const actor = await this.authorize(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          true,
          isAdminOnlyMutation,
        );
        const profile = await this.ensureProfile(manager, workspace.id);
        today = todayIsoDate(now, profile.timezone);
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
              profile.logoDataUrl =
                input.logoDataUrl?.replace(
                  /^data:image\/jpg;base64,/i,
                  'data:image/jpeg;base64,',
                ) ?? null;
            }
            profile.bankDetails = input.bankDetails;
            profile.defaultQuoteTerms = input.defaultQuoteTerms;
            profile.defaultInvoiceNotes = input.defaultInvoiceNotes;
            if (input.timezone !== undefined) {
              profile.timezone = input.timezone;
            }
            if (input.rateCard !== undefined) {
              profile.rateCard = input.rateCard;
            }
            await manager
              .getRepository(DeliveryFinanceV2ProfileEntity)
              .save(profile);
            return { ok: true, profileId: profile.id };
          }

          case 'setPeriodLock': {
            profile.lockedThroughDate = input.lockedThroughDate;
            await manager
              .getRepository(DeliveryFinanceV2ProfileEntity)
              .save(profile);
            return {
              ok: true,
              lockedThroughDate: profile.lockedThroughDate,
            };
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
              if (input.active === false) {
                const hasNonZeroBalance =
                  await this.queryPersonHasNonZeroBalance(
                    manager,
                    workspace.id,
                    existing.id,
                  );
                if (hasNonZeroBalance) {
                  throw new BadRequestException(
                    'Cannot archive a person while a non-zero balance is still owed. Repay or clear the balance first.',
                  );
                }
                const linkedRecurring = (
                  await manager
                    .getRepository(DeliveryFinanceV2RecurringExpenseEntity)
                    .find({
                      where: {
                        workspaceId: workspace.id,
                        fundingAccountId: existing.id,
                      },
                    })
                ).find(
                  (rule) =>
                    rule.status === 'ACTIVE' || rule.status === 'PAUSED',
                );
                if (linkedRecurring) {
                  throw new BadRequestException(
                    `Cannot archive "${existing.personName ?? existing.name}" while recurring expense "${linkedRecurring.title}" (${linkedRecurring.status}) is funded by them. Stop or reassign it first.`,
                  );
                }
                const activePayroll = await manager
                  .getRepository(DeliveryFinanceV2PayrollProfileEntity)
                  .findOneBy({
                    workspaceId: workspace.id,
                    fundingAccountId: existing.id,
                    active: true,
                  });
                if (activePayroll) {
                  throw new BadRequestException(
                    `Cannot archive "${existing.personName ?? existing.name}" while active payroll profile "${activePayroll.employeeName}" is funded by them.`,
                  );
                }
              }
              existing.personName = input.personName;
              existing.name = `Owed to ${input.personName}`;
              existing.personEmail = input.personEmail || null;
              if (input.currency !== undefined) {
                existing.currency = input.currency;
              }
              if (input.active !== undefined) {
                existing.active = input.active;
              }
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
                currency: input.currency ?? null,
                personName: input.personName,
                personEmail: input.personEmail || null,
                active: input.active ?? true,
              });
              await repo.save(account);
            }
            return { ok: true, accountId: account.id };
          }

          case 'recordOpeningBalance': {
            const existingIdempotent =
              await this.findExistingClientRequestJournal(
                manager,
                workspace.id,
                input.action,
                input.clientRequestId,
              );
            if (existingIdempotent) {
              return {
                ok: true,
                journalId: existingIdempotent.id,
                idempotent: true,
              };
            }
            const equityAccount = systemAccounts.get('EQUITY:OPENING')!;
            const fxRate = this.resolveFxRate(
              profile,
              input.currency,
              input.fxRateToAed,
            );
            const amount = BigInt(input.amountMicros);
            const aedAmount = convertToAedMicros(
              amount,
              input.currency,
              fxRate,
            );
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
              if (!personAccount.active) {
                throw new BadRequestException(
                  'Cannot record an opening liability on an archived person account.',
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
              sourceRefType: input.clientRequestId ? 'CLIENT_REQUEST' : null,
              sourceRefId: input.clientRequestId
                ? `${input.action}:${input.clientRequestId}`
                : null,
              createdBy: memberId,
              lines,
            });
            return { ok: true, journalId: journal.id };
          }

          case 'convertCurrency': {
            const existingIdempotent =
              await this.findExistingClientRequestJournal(
                manager,
                workspace.id,
                input.action,
                input.clientRequestId,
              );
            if (existingIdempotent) {
              return {
                ok: true,
                journalId: existingIdempotent.id,
                idempotent: true,
              };
            }
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
            const spotToAed = convertToAedMicros(
              toAmount,
              input.toCurrency,
              toRate,
            );

            // Always enforce weighted-average carrying AED cost on foreign cash outflows so full liquidations
            // never leave ghost AED balances, while using spot rate for zero/overdraft portions.
            const fromAed = await this.resolveCashOutflowCarryingAed(
              manager,
              workspace.id,
              fromAccount,
              fromAmount,
              fallbackFromAed,
              input.entryDate,
            );
            // Extinguish negative carrying AED if converting into an overdrawn foreign cash account.
            const toAed = await this.resolveCashInflowCarryingAed(
              manager,
              workspace.id,
              toAccount,
              toAmount,
              spotToAed,
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
              sourceRefType: input.clientRequestId ? 'CLIENT_REQUEST' : null,
              sourceRefId: input.clientRequestId
                ? `${input.action}:${input.clientRequestId}`
                : null,
              createdBy: memberId,
              lines,
            });
            return { ok: true, journalId: journal.id };
          }

          case 'recordLoanIn': {
            const existingIdempotent =
              await this.findExistingClientRequestJournal(
                manager,
                workspace.id,
                input.action,
                input.clientRequestId,
              );
            if (existingIdempotent) {
              return {
                ok: true,
                journalId: existingIdempotent.id,
                idempotent: true,
              };
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
            if (!personAccount.active) {
              throw new BadRequestException(
                'Cannot record a loan on an archived person account.',
              );
            }
            const cashAccount = await this.ensureCashAccount(
              manager,
              workspace.id,
              input.currency,
            );
            const fxAccount = systemAccounts.get('FX:GAIN_LOSS')!;
            const fxRate = this.resolveFxRate(
              profile,
              input.currency,
              input.fxRateToAed,
            );
            const amount = BigInt(input.amountMicros);
            const aedAmount = convertToAedMicros(
              amount,
              input.currency,
              fxRate,
            );
            assertPositiveAed(aedAmount, 'Loan amount');

            const cashAed = await this.resolveCashInflowCarryingAed(
              manager,
              workspace.id,
              cashAccount,
              amount,
              aedAmount,
              input.entryDate,
            );
            assertPositiveAed(cashAed, 'Loan cash carrying amount');

            const lines: FinanceV2JournalLineDraft[] = [
              {
                accountId: cashAccount.id,
                debitAedMicros: cashAed,
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
            this.appendFxSpreadLines(lines, fxAccount.id, cashAed, aedAmount);

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
              sourceRefType: input.clientRequestId ? 'CLIENT_REQUEST' : null,
              sourceRefId: input.clientRequestId
                ? `${input.action}:${input.clientRequestId}`
                : null,
              createdBy: memberId,
              lines,
            });
            return { ok: true, journalId: journal.id };
          }

          case 'recordLoanRepayment': {
            const existingIdempotent =
              await this.findExistingClientRequestJournal(
                manager,
                workspace.id,
                input.action,
                input.clientRequestId,
              );
            if (existingIdempotent) {
              return {
                ok: true,
                journalId: existingIdempotent.id,
                idempotent: true,
              };
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
              const { owedOrig, owedAed } =
                await this.queryPersonLiabilityCarryingTotals(
                  manager,
                  workspace.id,
                  personAccount.id,
                  input.currency,
                  input.entryDate,
                );
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
            this.appendFxSpreadLines(
              lines,
              fxAccount.id,
              liabilityAed,
              cashAed,
            );

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
              sourceRefType: input.clientRequestId ? 'CLIENT_REQUEST' : null,
              sourceRefId: input.clientRequestId
                ? `${input.action}:${input.clientRequestId}`
                : null,
              createdBy: memberId,
              lines,
            });
            return { ok: true, journalId: journal.id };
          }

          case 'recordExpenseOrAsset': {
            if (isPayrollSensitiveCategory(input.category) && !actor.isAdmin) {
              throw new ForbiddenException(
                'Only workspace administrators can record salary entries.',
              );
            }
            const existingIdempotent =
              await this.findExistingClientRequestJournal(
                manager,
                workspace.id,
                input.action,
                input.clientRequestId,
              );
            if (existingIdempotent) {
              return {
                ok: true,
                journalId: existingIdempotent.id,
                idempotent: true,
              };
            }
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
            const aedAmount = convertToAedMicros(
              amount,
              input.currency,
              fxRate,
            );
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
            this.appendFxSpreadLines(
              lines,
              fxAccount.id,
              aedAmount,
              fundingAed,
            );

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
              sourceRefType: input.clientRequestId ? 'CLIENT_REQUEST' : null,
              sourceRefId: input.clientRequestId
                ? `${input.action}:${input.clientRequestId}`
                : null,
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
            if (!journal)
              throw new NotFoundException('Ledger entry not found.');
            if (isPayrollSensitiveJournal(journal) && !actor.isAdmin) {
              throw new ForbiddenException(
                'Only workspace administrators can void payroll ledger entries.',
              );
            }
            if (journal.status === 'VOID') {
              throw new BadRequestException('This entry is already voided.');
            }
            if (journal.entryType === 'REVERSAL') {
              throw new BadRequestException(
                'Reversal entries are permanent audit records and cannot be voided. Record a new transaction instead.',
              );
            }
            const existingReversal = await journalRepo.findOneBy({
              workspaceId: workspace.id,
              reversalOfJournalId: journal.id,
              status: 'POSTED',
            });
            if (existingReversal) {
              throw new BadRequestException(
                'This entry has already been reversed and cannot be voided.',
              );
            }
            assertDateNotLocked(
              profile.lockedThroughDate,
              journal.entryDate,
              'void entries',
            );
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

          case 'reverseJournal': {
            const journalRepo = manager.getRepository(
              DeliveryFinanceV2JournalEntity,
            );
            const original = await journalRepo.findOneBy({
              workspaceId: workspace.id,
              id: input.journalId,
            });
            if (!original) {
              throw new NotFoundException('Ledger entry not found.');
            }
            if (isPayrollSensitiveJournal(original) && !actor.isAdmin) {
              throw new ForbiddenException(
                'Only workspace administrators can reverse payroll ledger entries.',
              );
            }
            if (original.status !== 'POSTED') {
              throw new BadRequestException(
                'Only posted ledger entries can be reversed.',
              );
            }
            if (original.entryType === 'REVERSAL') {
              throw new BadRequestException(
                'Reversal entries cannot be reversed again; record a new entry instead.',
              );
            }
            const existingReversal = await journalRepo.findOneBy({
              workspaceId: workspace.id,
              reversalOfJournalId: original.id,
              status: 'POSTED',
            });
            if (existingReversal) {
              throw new BadRequestException(
                'This ledger entry has already been reversed.',
              );
            }
            if (input.reversalDate < original.entryDate) {
              throw new BadRequestException(
                'Reversal date cannot be earlier than the original entry date.',
              );
            }
            assertDateNotLocked(
              profile.lockedThroughDate,
              input.reversalDate,
              'post reversing entries',
            );

            const origLines = await manager
              .getRepository(DeliveryFinanceV2JournalLineEntity)
              .findBy({
                workspaceId: workspace.id,
                journalId: original.id,
              });
            if (origLines.length === 0) {
              throw new BadRequestException(
                'Original ledger entry has no lines to reverse.',
              );
            }
            const reversedLines: FinanceV2JournalLineDraft[] = origLines.map(
              (line) => ({
                accountId: line.accountId,
                debitAedMicros: BigInt(line.creditAedMicros),
                creditAedMicros: BigInt(line.debitAedMicros),
                currency: line.currency,
                originalSignedMicros: -BigInt(line.originalSignedMicros),
              }),
            );
            const reversal = await this.postJournal(manager, {
              workspaceId: workspace.id,
              entryDate: input.reversalDate,
              entryType: 'REVERSAL',
              category: original.category,
              title: `Reversal: ${original.title}`.slice(0, 180),
              notes: `Reversal of entry ${original.id} (${original.entryDate}): ${input.reason}`,
              currency: original.currency,
              amountMicros: -BigInt(original.amountMicros),
              fxRateToAed: original.fxRateToAed,
              aedAmountMicros: BigInt(original.aedAmountMicros),
              fundingAccountId: original.fundingAccountId,
              targetAccountId: original.targetAccountId,
              projectId: original.projectId,
              employeeMemberId: original.employeeMemberId,
              reversalOfJournalId: original.id,
              createdBy: memberId,
              lines: reversedLines,
            });

            if (
              original.entryType === 'INVOICE_PAYMENT' &&
              original.sourceRefType === 'INVOICE_PAYMENT' &&
              original.sourceRefId
            ) {
              const [invoiceId] = original.sourceRefId.split(':');
              const invoiceRepo = manager.getRepository(
                DeliveryFinanceV2InvoiceEntity,
              );
              const invoice = await invoiceRepo.findOneBy({
                workspaceId: workspace.id,
                id: invoiceId,
              });
              if (invoice && invoice.status !== 'VOID') {
                const currentPaid = BigInt(invoice.paidMicros);
                const paymentAmt = BigInt(original.amountMicros);
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
            return {
              ok: true,
              journalId: reversal.id,
              reversalOfJournalId: original.id,
            };
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
            const fxRate = this.resolveFxRate(
              profile,
              'USD',
              input.fxRateToAed,
            );
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

              const entryDate = todayIsoDate(
                spend.settledAt ?? spend.createdAt,
                profile.timezone,
              );
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
            if (isPayrollSensitiveCategory(input.category) && !actor.isAdmin) {
              throw new ForbiddenException(
                'Only workspace administrators can manage salary schedules.',
              );
            }
            if (input.id && input.expenseCurrentMonth) {
              throw new BadRequestException(
                'Use Expense This Month on an existing recurring bill.',
              );
            }
            if (
              !input.expenseCurrentMonth &&
              (input.entryDate !== undefined || input.fxRateToAed !== undefined)
            ) {
              throw new BadRequestException(
                'Expense date and FX rate apply only when expensing for the current month.',
              );
            }
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
              if (
                isPayrollSensitiveCategory(existing.category) &&
                !actor.isAdmin
              ) {
                throw new ForbiddenException(
                  'Only workspace administrators can manage salary schedules.',
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
              const deterministicId = input.clientRequestId
                ? deterministicUuidFromSeed(
                    `finance-v2:saveRecurringExpense:${workspace.id}:${input.clientRequestId}`,
                  )
                : null;
              if (deterministicId) {
                const existingIdempotentRule = await repo.findOneBy({
                  workspaceId: workspace.id,
                  id: deterministicId,
                });
                if (existingIdempotentRule) {
                  if (input.expenseCurrentMonth) {
                    const currentMonth = monthOfDate(today);
                    const existingJournal = await manager
                      .getRepository(DeliveryFinanceV2JournalEntity)
                      .findOneBy({
                        workspaceId: workspace.id,
                        sourceRefType: 'RECURRING_EXPENSE',
                        sourceRefId: `${existingIdempotentRule.id}:${currentMonth}`,
                        status: 'POSTED',
                      });
                    return {
                      ok: true,
                      recurringExpenseId: existingIdempotentRule.id,
                      ...(existingJournal
                        ? {
                            journalId: existingJournal.id,
                            expensedMonth: currentMonth,
                            entryDate: existingJournal.entryDate,
                          }
                        : {}),
                      idempotent: true,
                    };
                  }
                  return {
                    ok: true,
                    recurringExpenseId: existingIdempotentRule.id,
                    idempotent: true,
                  };
                }
              }
              rule = repo.create({
                id: deterministicId ?? randomUUID(),
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
            if (input.expenseCurrentMonth) {
              const currentMonth = monthOfDate(today);
              const posted = await this.postSingleRecurringExpenseInTransaction(
                manager,
                {
                  workspaceId: workspace.id,
                  profile,
                  systemAccounts,
                  rule,
                  linkedPayrollProfile: null,
                  month: currentMonth,
                  today,
                  entryDateOverride: input.entryDate,
                  fxRateOverride: input.fxRateToAed,
                  actorMemberId: memberId,
                },
              );
              return {
                ok: true,
                recurringExpenseId: rule.id,
                journalId: posted.id,
                expensedMonth: currentMonth,
                entryDate: posted.entryDate,
              };
            }
            return { ok: true, recurringExpenseId: rule.id };
          }

          case 'expenseRecurringForMonth': {
            const rule = await manager
              .getRepository(DeliveryFinanceV2RecurringExpenseEntity)
              .findOneBy({
                workspaceId: workspace.id,
                id: input.id,
              });
            if (!rule) {
              throw new NotFoundException('Recurring expense not found.');
            }
            const linkedProfile = await manager
              .getRepository(DeliveryFinanceV2PayrollProfileEntity)
              .findOneBy({
                workspaceId: workspace.id,
                recurringExpenseId: rule.id,
              });
            if (
              (linkedProfile || isPayrollSensitiveRecurring(rule)) &&
              !actor.isAdmin
            ) {
              throw new ForbiddenException(
                'Only workspace administrators can expense salary schedules.',
              );
            }
            const targetMonth =
              input.month ??
              resolveCurrentMonthTargetForRecurringRule(
                rule,
                linkedProfile,
                monthOfDate(today),
              );
            const posted = await this.postSingleRecurringExpenseInTransaction(
              manager,
              {
                workspaceId: workspace.id,
                profile,
                systemAccounts,
                rule,
                linkedPayrollProfile: linkedProfile,
                month: targetMonth,
                today,
                entryDateOverride: input.entryDate,
                fxRateOverride: input.fxRateToAed,
                actorMemberId: memberId,
              },
            );
            return {
              ok: true,
              recurringExpenseId: rule.id,
              journalId: posted.id,
              month: targetMonth,
              entryDate: posted.entryDate,
            };
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
              (linkedProfile || isPayrollSensitiveRecurring(rule)) &&
              !actor.isAdmin
            ) {
              throw new ForbiddenException(
                'Only workspace administrators can pause or stop employee salaries.',
              );
            }
            if (input.status === 'ACTIVE') {
              await this.assertFundingAccount(
                manager,
                workspace.id,
                rule.fundingAccountId,
              );
              if (linkedProfile?.employeeMemberId) {
                const duplicateActive = await payrollRepo.findOneBy({
                  workspaceId: workspace.id,
                  employeeMemberId: linkedProfile.employeeMemberId,
                  active: true,
                });
                if (
                  duplicateActive &&
                  duplicateActive.id !== linkedProfile.id
                ) {
                  throw new BadRequestException(
                    `Another active payroll profile ("${duplicateActive.employeeName}") already exists for this team member. Deactivate it before reactivating this salary.`,
                  );
                }
              }
            }
            rule.status = input.status;
            await repo.save(rule);

            // Keep linked payroll profile active flag synchronized with its recurring base salary!
            if (linkedProfile) {
              linkedProfile.active = input.status === 'ACTIVE';
              await payrollRepo.save(linkedProfile);
            }
            return {
              ok: true,
              recurringExpenseId: rule.id,
              status: rule.status,
            };
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
            if (input.active && input.employeeMemberId) {
              const duplicateProfiles = await profileRepo.findBy({
                workspaceId: workspace.id,
                employeeMemberId: input.employeeMemberId,
                active: true,
              });
              const conflict = duplicateProfiles.find(
                (item) => item.id !== input.id,
              );
              if (conflict) {
                throw new BadRequestException(
                  `An active payroll profile already exists for this workspace member (${conflict.employeeName}). Edit or deactivate the existing profile instead.`,
                );
              }
            }
            const defaultPayTiming =
              input.payDayOfMonth <= 10 ? 'FOLLOWING_MONTH' : 'SAME_MONTH';
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
              if (input.payTiming !== undefined) {
                existing.payTiming = input.payTiming;
              }
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
                payTiming: input.payTiming ?? defaultPayTiming,
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
              if (input.startMonth !== undefined) {
                linkedRule.startMonth = input.startMonth;
              }
              linkedRule.status = input.active ? 'ACTIVE' : 'PAUSED';
            }
            await recurringRepo.save(linkedRule);
            payrollProfile.recurringExpenseId = linkedRule.id;
            if (input.id) {
              const existingEntries = await manager
                .getRepository(DeliveryFinanceV2PayrollEntryEntity)
                .find({
                  where: {
                    workspaceId: workspace.id,
                    profileId: payrollProfile.id,
                  },
                });
              const months = new Set(existingEntries.map((item) => item.month));
              for (const entryMonth of months) {
                calculateMonthlyPayroll({
                  profileId: payrollProfile.id,
                  employeeName: payrollProfile.employeeName,
                  month: entryMonth,
                  currency: payrollProfile.currency as FinanceV2Currency,
                  baseSalaryMicros: BigInt(payrollProfile.baseSalaryMicros),
                  workingDaysPerMonth: payrollProfile.workingDaysPerMonth,
                  paidLeavesPerMonth: payrollProfile.paidLeavesPerMonth,
                  entries: existingEntries
                    .filter((item) => item.month === entryMonth)
                    .map((item) => ({
                      entryKind: item.entryKind,
                      days: item.days,
                      bonusAmountMicros: item.bonusAmountMicros,
                    })),
                });
              }
            }
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
              throw new NotFoundException(
                'Payroll employee profile not found.',
              );
            }
            if (input.eventDate.slice(0, 7) !== input.month) {
              throw new BadRequestException(
                `Event date (${input.eventDate}) must fall inside the selected payroll month (${input.month}).`,
              );
            }
            const settlementMonth = resolvePayrollSettlementMonth(
              input.month,
              payrollProfile.payDayOfMonth,
              payrollProfile.payTiming,
            );
            const paydayDate = resolveScheduledDateForMonth(
              settlementMonth,
              payrollProfile.payDayOfMonth,
            );
            assertDateNotLocked(
              profile.lockedThroughDate,
              paydayDate,
              'modify payroll entries',
            );
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
            const existingMonthEntries = await entryRepo.find({
              where: {
                workspaceId: workspace.id,
                profileId: input.profileId,
                month: input.month,
              },
            });
            calculateMonthlyPayroll({
              profileId: payrollProfile.id,
              employeeName: payrollProfile.employeeName,
              month: input.month,
              currency: payrollProfile.currency as FinanceV2Currency,
              baseSalaryMicros: BigInt(payrollProfile.baseSalaryMicros),
              workingDaysPerMonth: payrollProfile.workingDaysPerMonth,
              paidLeavesPerMonth: payrollProfile.paidLeavesPerMonth,
              entries: [
                ...existingMonthEntries.map((item) => ({
                  entryKind: item.entryKind,
                  days: item.days,
                  bonusAmountMicros: item.bonusAmountMicros,
                })),
                {
                  entryKind: input.entryKind,
                  days: input.entryKind === 'BONUS' ? null : input.days,
                  bonusAmountMicros:
                    input.entryKind === 'BONUS'
                      ? input.bonusAmountMicros
                      : null,
                },
              ],
            });
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
            const payrollProfile = await manager
              .getRepository(DeliveryFinanceV2PayrollProfileEntity)
              .findOneBy({ workspaceId: workspace.id, id: entry.profileId });
            if (payrollProfile) {
              const settlementMonth = resolvePayrollSettlementMonth(
                entry.month,
                payrollProfile.payDayOfMonth,
                payrollProfile.payTiming,
              );
              const paydayDate = resolveScheduledDateForMonth(
                settlementMonth,
                payrollProfile.payDayOfMonth,
              );
              assertDateNotLocked(
                profile.lockedThroughDate,
                paydayDate,
                'modify payroll entries',
              );
            }
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
            const settlementMonth = resolvePayrollSettlementMonth(
              input.month,
              payrollProfile.payDayOfMonth,
              payrollProfile.payTiming,
            );
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
              settlementMonth,
              paydayDate,
              today,
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
              if (
                existing.status === 'CONVERTED' ||
                existing.status === 'VOID'
              ) {
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
            if (quote.status === 'VOID' || quote.status === 'CONVERTED') {
              throw new BadRequestException(
                'Cannot email a voided or converted quote.',
              );
            }
            const recipient = (input.toEmail || quote.clientEmail).trim();
            if (!recipient) {
              throw new BadRequestException(
                'Add a client email address before sending.',
              );
            }
            const lockKey = `${workspace.id}:QUOTE:${quote.id}`;
            if (this.inFlightEmailKeys.has(lockKey)) {
              throw new ConflictException(
                'This quote email is already being sent. Please wait a moment.',
              );
            }
            this.assertEmailRateLimit(workspace.id, memberId);
            this.inFlightEmailKeys.add(lockKey);
            acquiredEmailLockKey = lockKey;
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
            const quoteRepo = manager.getRepository(
              DeliveryFinanceV2QuoteEntity,
            );
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
            return {
              ok: true,
              scheduleId: schedule.id,
              status: schedule.status,
            };
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
            const lockKey = `${workspace.id}:INVOICE:${invoice.id}`;
            if (this.inFlightEmailKeys.has(lockKey)) {
              throw new ConflictException(
                'This invoice email is already being sent. Please wait a moment.',
              );
            }
            this.assertEmailRateLimit(workspace.id, memberId);
            this.inFlightEmailKeys.add(lockKey);
            acquiredEmailLockKey = lockKey;
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
            if (input.clientRequestId) {
              const existingPayment = await manager
                .getRepository(DeliveryFinanceV2JournalEntity)
                .findOneBy({
                  workspaceId: workspace.id,
                  sourceRefType: 'INVOICE_PAYMENT',
                  sourceRefId: `${invoice.id}:${input.clientRequestId}`,
                });
              if (existingPayment) {
                return {
                  ok: true,
                  invoiceId: invoice.id,
                  journalId: existingPayment.id,
                  status: invoice.status,
                  idempotent: true,
                  voided: existingPayment.status === 'VOID',
                };
              }
            }
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
            const fxAccount = systemAccounts.get('FX:GAIN_LOSS')!;
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

            const cashAed = await this.resolveCashInflowCarryingAed(
              manager,
              workspace.id,
              cashAccount,
              paymentAmount,
              aedAmount,
              input.paymentDate,
            );
            assertPositiveAed(cashAed, 'Invoice payment cash carrying amount');

            const lines: FinanceV2JournalLineDraft[] = [
              {
                accountId: cashAccount.id,
                debitAedMicros: cashAed,
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
            ];
            this.appendFxSpreadLines(lines, fxAccount.id, cashAed, aedAmount);

            const paymentRefSuffix = input.clientRequestId ?? randomUUID();
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
              sourceRefId: `${invoice.id}:${paymentRefSuffix}`,
              createdBy: memberId,
              lines,
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
          const freshQuote = await this.dataSource.transaction(
            async (manager) =>
              manager.getRepository(DeliveryFinanceV2QuoteEntity).findOneBy({
                workspaceId: workspace.id,
                id: emailPayload.quote.id,
              }),
          );
          if (
            !freshQuote ||
            freshQuote.status === 'VOID' ||
            freshQuote.status === 'CONVERTED'
          ) {
            throw new BadRequestException(
              'Quote was voided or converted before email dispatch.',
            );
          }
          const pdfBuffer = await this.renderQuotePdf(
            emailPayload.profile,
            freshQuote,
          );
          // Re-verify right before email dispatch so concurrent void/edit during PDF rendering cannot mail a stale PDF.
          const preSendQuote = await this.dataSource.transaction(
            async (manager) =>
              manager.getRepository(DeliveryFinanceV2QuoteEntity).findOneBy({
                workspaceId: workspace.id,
                id: freshQuote.id,
              }),
          );
          if (
            !preSendQuote ||
            preSendQuote.status === 'VOID' ||
            preSendQuote.status === 'CONVERTED'
          ) {
            throw new BadRequestException(
              'Quote was voided or converted before email dispatch.',
            );
          }
          if (
            preSendQuote.updatedAt &&
            freshQuote.updatedAt &&
            new Date(preSendQuote.updatedAt).getTime() !==
              new Date(freshQuote.updatedAt).getTime()
          ) {
            throw new ConflictException(
              'Quote was modified while generating PDF. Please send again.',
            );
          }
          // Base64-encode attachment so BullMQ Redis JSON serialization preserves exact PDF bytes.
          await this.emailService.send({
            from: `"${displayName}" <${configuredFrom}>`,
            replyTo,
            to: emailPayload.recipient,
            subject: `Quote ${freshQuote.quoteNumber} from ${displayName}`,
            text:
              emailPayload.message ||
              `Hello ${freshQuote.clientName},\n\nPlease find attached quote ${freshQuote.quoteNumber}.\n\nBest regards,\n${displayName}`,
            attachments: [
              {
                filename: `${freshQuote.quoteNumber}.pdf`,
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
              id: freshQuote.id,
            });
            if (
              latest &&
              latest.status !== 'VOID' &&
              latest.status !== 'CONVERTED'
            ) {
              if (latest.status === 'DRAFT') latest.status = 'SENT';
              latest.sentAt = new Date();
              await repo.save(latest);
              await recordOtogrowActivity(manager, {
                workspaceId: workspace.id,
                actorId: memberId,
                category: 'BUSINESS',
                action: 'QUOTE_EMAILED',
                outcome: 'SUCCEEDED',
                summary:
                  `Sent ${freshQuote.quoteNumber} to ${emailPayload.recipient}${emailPayload.message ? ` — ${emailPayload.message}` : ''}`.slice(
                    0,
                    240,
                  ),
                projectId: freshQuote.projectId,
                sourceType: 'finance',
                sourceId: freshQuote.id,
              });
            }
          });
        } else {
          const freshInvoice = await this.dataSource.transaction(
            async (manager) =>
              manager.getRepository(DeliveryFinanceV2InvoiceEntity).findOneBy({
                workspaceId: workspace.id,
                id: emailPayload.invoice.id,
              }),
          );
          if (!freshInvoice || freshInvoice.status === 'VOID') {
            throw new BadRequestException(
              'Invoice was voided before email dispatch.',
            );
          }
          const { buffer } = await this.persistInvoicePdf(
            workspace.id,
            emailPayload.profile,
            freshInvoice,
            today,
          );
          // Re-verify right before email dispatch so concurrent void/edit during PDF rendering cannot mail a stale PDF.
          const preSendInvoice = await this.dataSource.transaction(
            async (manager) =>
              manager.getRepository(DeliveryFinanceV2InvoiceEntity).findOneBy({
                workspaceId: workspace.id,
                id: freshInvoice.id,
              }),
          );
          if (!preSendInvoice || preSendInvoice.status === 'VOID') {
            throw new BadRequestException(
              'Invoice was voided before email dispatch.',
            );
          }
          if (
            preSendInvoice.updatedAt &&
            freshInvoice.updatedAt &&
            new Date(preSendInvoice.updatedAt).getTime() !==
              new Date(freshInvoice.updatedAt).getTime()
          ) {
            throw new ConflictException(
              'Invoice was modified while generating PDF. Please send again.',
            );
          }
          await this.emailService.send({
            from: `"${displayName}" <${configuredFrom}>`,
            replyTo,
            to: emailPayload.recipient,
            subject: `Invoice ${freshInvoice.invoiceNumber} from ${displayName}`,
            text:
              emailPayload.message ||
              `Hello ${freshInvoice.clientName},\n\nPlease find attached invoice ${freshInvoice.invoiceNumber} (due ${freshInvoice.dueDate}).\n\nBest regards,\n${displayName}`,
            attachments: [
              {
                filename: `${freshInvoice.invoiceNumber}.pdf`,
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
              id: freshInvoice.id,
            });
            if (latest && latest.status !== 'VOID') {
              if (latest.status === 'READY') latest.status = 'SENT';
              latest.sentAt = new Date();
              latest.sentBy = memberId;
              latest.sentVia = 'EMAIL';
              await repo.save(latest);
              await recordOtogrowActivity(manager, {
                workspaceId: workspace.id,
                actorId: memberId,
                category: 'BUSINESS',
                action: 'INVOICE_EMAILED',
                outcome: 'SUCCEEDED',
                summary:
                  `Sent ${freshInvoice.invoiceNumber} to ${emailPayload.recipient}${emailPayload.message ? ` — ${emailPayload.message}` : ''}`.slice(
                    0,
                    240,
                  ),
                projectId: freshInvoice.projectId,
                sourceType: 'finance',
                sourceId: freshInvoice.id,
              });
            }
          });
        }
      }

      return txResult;
    } finally {
      if (acquiredEmailLockKey) {
        this.inFlightEmailKeys.delete(acquiredEmailLockKey);
      }
    }
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
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.authorize(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        false,
        input.dataset === 'PAYROLL',
      );
      const profile = await manager
        .getRepository(DeliveryFinanceV2ProfileEntity)
        .findOneBy({ workspaceId: workspace.id });
      const today = todayIsoDate(now, profile?.timezone);
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

      const accounts = await manager
        .getRepository(DeliveryFinanceV2AccountEntity)
        .find({ where: { workspaceId: workspace.id } });
      const accountById = new Map(accounts.map((a) => [a.id, a]));

      if (input.dataset === 'PNL') {
        const lines = await this.loadLedgerLines(manager, workspace.id);
        const p = calculateProfitAndLoss(lines, fromDate, toDate, {
          redactPayrollBreakdown: !actor.isAdmin,
        });
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
          (actor.isAdmin || !isPayrollSensitiveJournal(j)),
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

  private async postClientCashPaymentInTransaction(
    manager: EntityManager,
    params: {
      workspaceId: string;
      profile: DeliveryFinanceV2ProfileEntity;
      systemAccounts: Map<string, DeliveryFinanceV2AccountEntity>;
      currency: FinanceV2Currency;
      amountMicros: bigint;
      entryDate: string;
      title: string;
      notes: string;
      projectId: string | null;
      receiptUrl: string | null;
      sourceRefType: string;
      sourceRefId: string;
      memberId: string;
    },
  ): Promise<DeliveryFinanceV2JournalEntity> {
    const cashAccount = await this.ensureCashAccount(
      manager,
      params.workspaceId,
      params.currency,
    );
    const revenueAccount = params.systemAccounts.get('REVENUE:SERVICE')!;
    const fxAccount = params.systemAccounts.get('FX:GAIN_LOSS')!;
    const fxRate = this.resolveFxRate(params.profile, params.currency);
    const aedAmount = convertToAedMicros(
      params.amountMicros,
      params.currency,
      fxRate,
    );
    assertPositiveAed(aedAmount, 'Client payment');

    const cashAed = await this.resolveCashInflowCarryingAed(
      manager,
      params.workspaceId,
      cashAccount,
      params.amountMicros,
      aedAmount,
      params.entryDate,
    );
    assertPositiveAed(cashAed, 'Client payment cash carrying amount');

    const lines: FinanceV2JournalLineDraft[] = [
      {
        accountId: cashAccount.id,
        debitAedMicros: cashAed,
        creditAedMicros: BigInt('0'),
        currency: params.currency,
        originalSignedMicros: params.amountMicros,
      },
      {
        accountId: revenueAccount.id,
        debitAedMicros: BigInt('0'),
        creditAedMicros: aedAmount,
        currency: params.currency,
        originalSignedMicros: -params.amountMicros,
      },
    ];
    this.appendFxSpreadLines(lines, fxAccount.id, cashAed, aedAmount);

    return this.postJournal(manager, {
      workspaceId: params.workspaceId,
      entryDate: params.entryDate,
      entryType: 'INVOICE_PAYMENT',
      category: 'SERVICE_REVENUE',
      title: params.title,
      notes: params.notes,
      currency: params.currency,
      amountMicros: params.amountMicros,
      fxRateToAed: fxRate,
      aedAmountMicros: aedAmount,
      fundingAccountId: cashAccount.id,
      targetAccountId: revenueAccount.id,
      projectId: params.projectId,
      receiptUrl: params.receiptUrl,
      sourceRefType: params.sourceRefType,
      sourceRefId: params.sourceRefId,
      createdBy: params.memberId,
      lines,
    });
  }

  async syncClientBusinessFinanceEntryInTransaction(
    manager: EntityManager,
    params: {
      workspaceId: string;
      memberId: string;
      recordId: string;
      category: 'INCOME' | 'RECEIVABLE';
      title: string;
      clientName: string;
      currency: FinanceV2Currency;
      amountMinor: number;
      date: string;
      dueDate: string | null;
      projectId: string | null;
      externalReference: string;
      evidenceUrl: string | null;
      notes: string;
    },
  ): Promise<void> {
    if (params.amountMinor <= 0) return;
    await this.lockWorkspace(manager, params.workspaceId, true);
    const profile = await this.ensureProfile(manager, params.workspaceId);
    const systemAccounts = await this.ensureSystemAccounts(
      manager,
      params.workspaceId,
    );
    const amountMicros = minorUnitsToMicros(params.amountMinor);

    if (params.category === 'INCOME') {
      const noteParts = [
        params.externalReference ? `Ref: ${params.externalReference}` : '',
        params.notes.trim(),
      ].filter(Boolean);
      await this.postClientCashPaymentInTransaction(manager, {
        workspaceId: params.workspaceId,
        profile,
        systemAccounts,
        currency: params.currency,
        amountMicros,
        entryDate: params.date,
        title: params.title,
        notes: noteParts.join(' · '),
        projectId: params.projectId,
        receiptUrl: params.evidenceUrl,
        sourceRefType: CLIENT_BUSINESS_PAYMENT_REF_TYPE,
        sourceRefId: params.recordId,
        memberId: params.memberId,
      });
      return;
    }

    const invoiceRepo = manager.getRepository(DeliveryFinanceV2InvoiceEntity);
    const invoiceId = deterministicClientReceivableInvoiceId(
      params.workspaceId,
      params.recordId,
    );
    const existing = await invoiceRepo.findOneBy({
      workspaceId: params.workspaceId,
      id: invoiceId,
    });
    if (existing) return;

    const trimmedRef = params.externalReference.trim();
    let invoiceNumber: string;
    if (
      trimmedRef &&
      !(await invoiceRepo.findOneBy({
        workspaceId: params.workspaceId,
        invoiceNumber: trimmedRef,
      }))
    ) {
      invoiceNumber = trimmedRef;
    } else {
      invoiceNumber = await this.nextDocumentNumber(
        manager,
        profile,
        'INVOICE',
        params.date,
      );
    }

    const dueDate =
      params.dueDate && params.dueDate >= params.date
        ? params.dueDate
        : params.date;
    const invoice = invoiceRepo.create({
      id: invoiceId,
      workspaceId: params.workspaceId,
      invoiceNumber,
      scheduleId: null,
      scheduleMonth: null,
      sourceQuoteId: null,
      clientName: params.clientName.trim() || params.title,
      clientEmail: '',
      clientAddress: '',
      projectId: params.projectId,
      currency: params.currency,
      issueDate: params.date,
      dueDate,
      lineItems: [
        {
          id: randomUUID(),
          label: params.title,
          description: params.notes.trim(),
          quantity: '1',
          unitPriceMicros: amountMicros.toString(),
          discountPercent: '0',
          lineTotalMicros: amountMicros.toString(),
        },
      ],
      subtotalMicros: amountMicros.toString(),
      discountTotalMicros: '0',
      totalMicros: amountMicros.toString(),
      paidMicros: '0',
      status: 'SENT',
      pdfStoragePath: null,
      sentAt: new Date(),
      sentBy: params.memberId,
      sentVia: 'MANUAL',
      notes: params.notes.trim() || profile.defaultInvoiceNotes,
      voidReason: null,
      voidedAt: null,
      createdBy: params.memberId,
    });
    await invoiceRepo.save(invoice);
  }

  async settleClientBusinessReceivableInTransaction(
    manager: EntityManager,
    params: {
      workspaceId: string;
      memberId: string;
      receivableId: string;
      receiptId: string;
      title: string;
      clientName: string;
      currency: FinanceV2Currency;
      amountMinor: number;
      paymentDate: string;
      projectId: string | null;
      evidenceUrl: string | null;
      notes: string;
    },
  ): Promise<void> {
    if (params.amountMinor <= 0) return;
    await this.lockWorkspace(manager, params.workspaceId, true);
    const profile = await this.ensureProfile(manager, params.workspaceId);
    const systemAccounts = await this.ensureSystemAccounts(
      manager,
      params.workspaceId,
    );
    const invoiceRepo = manager.getRepository(DeliveryFinanceV2InvoiceEntity);
    const invoiceId = deterministicClientReceivableInvoiceId(
      params.workspaceId,
      params.receivableId,
    );
    const invoice = await invoiceRepo.findOneBy({
      workspaceId: params.workspaceId,
      id: invoiceId,
    });

    if (invoice) {
      if (invoice.status === 'VOID' || invoice.status === 'PAID') return;
      const total = BigInt(invoice.totalMicros);
      const alreadyPaid = BigInt(invoice.paidMicros);
      const remaining = total > alreadyPaid ? total - alreadyPaid : BigInt('0');
      if (remaining <= BigInt('0')) return;

      const requestedMicros = minorUnitsToMicros(params.amountMinor);
      const paymentMicros =
        requestedMicros > remaining ? remaining : requestedMicros;
      await this.postClientCashPaymentInTransaction(manager, {
        workspaceId: params.workspaceId,
        profile,
        systemAccounts,
        currency: invoice.currency,
        amountMicros: paymentMicros,
        entryDate: params.paymentDate,
        title: `Payment — ${invoice.invoiceNumber} (${invoice.clientName})`,
        notes: params.notes,
        projectId: invoice.projectId ?? params.projectId,
        receiptUrl: params.evidenceUrl,
        sourceRefType: 'INVOICE_PAYMENT',
        sourceRefId: `${invoice.id}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${params.receiptId}`,
        memberId: params.memberId,
      });

      const nextPaid = alreadyPaid + paymentMicros;
      invoice.paidMicros = nextPaid.toString();
      invoice.status = nextPaid >= total ? 'PAID' : 'PARTIALLY_PAID';
      await invoiceRepo.save(invoice);
      return;
    }

    await this.postClientCashPaymentInTransaction(manager, {
      workspaceId: params.workspaceId,
      profile,
      systemAccounts,
      currency: params.currency,
      amountMicros: minorUnitsToMicros(params.amountMinor),
      entryDate: params.paymentDate,
      title: params.title,
      notes: params.notes,
      projectId: params.projectId,
      receiptUrl: params.evidenceUrl,
      sourceRefType: CLIENT_BUSINESS_PAYMENT_REF_TYPE,
      sourceRefId: params.receiptId,
      memberId: params.memberId,
    });
  }

  async voidClientBusinessFinanceEntryInTransaction(
    manager: EntityManager,
    params: {
      workspaceId: string;
      memberId: string;
      recordId: string;
      category: 'INCOME' | 'RECEIVABLE';
      externalReference: string;
      reason: string;
    },
  ): Promise<void> {
    await this.lockWorkspace(manager, params.workspaceId, true);
    const profile = await this.ensureProfile(manager, params.workspaceId);
    const journalRepo = manager.getRepository(DeliveryFinanceV2JournalEntity);
    const invoiceRepo = manager.getRepository(DeliveryFinanceV2InvoiceEntity);

    if (params.category === 'RECEIVABLE') {
      const invoiceId = deterministicClientReceivableInvoiceId(
        params.workspaceId,
        params.recordId,
      );
      const invoice = await invoiceRepo.findOneBy({
        workspaceId: params.workspaceId,
        id: invoiceId,
      });
      if (
        invoice &&
        invoice.status !== 'VOID' &&
        BigInt(invoice.paidMicros) === BigInt('0')
      ) {
        invoice.status = 'VOID';
        invoice.voidReason = params.reason;
        invoice.voidedAt = new Date();
        await invoiceRepo.save(invoice);
      }
      return;
    }

    let journal = await journalRepo.findOneBy({
      workspaceId: params.workspaceId,
      sourceRefType: CLIENT_BUSINESS_PAYMENT_REF_TYPE,
      sourceRefId: params.recordId,
      status: 'POSTED',
    });
    let linkedInvoiceId: string | null = null;
    if (!journal && params.externalReference.startsWith('receivable:')) {
      const receivableId = params.externalReference.slice('receivable:'.length);
      linkedInvoiceId = deterministicClientReceivableInvoiceId(
        params.workspaceId,
        receivableId,
      );
      journal = await journalRepo.findOneBy({
        workspaceId: params.workspaceId,
        sourceRefType: 'INVOICE_PAYMENT',
        sourceRefId: `${linkedInvoiceId}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${params.recordId}`,
        status: 'POSTED',
      });
    }
    if (!journal) return;

    assertDateNotLocked(
      profile.lockedThroughDate,
      journal.entryDate,
      'void entries',
    );
    journal.status = 'VOID';
    journal.voidedBy = params.memberId;
    journal.voidedAt = new Date();
    journal.voidReason = params.reason;
    await journalRepo.save(journal);

    if (linkedInvoiceId) {
      const invoice = await invoiceRepo.findOneBy({
        workspaceId: params.workspaceId,
        id: linkedInvoiceId,
      });
      if (invoice && invoice.status !== 'VOID') {
        const currentPaid = BigInt(invoice.paidMicros);
        const paymentAmt = BigInt(journal.amountMicros);
        const nextPaid =
          currentPaid > paymentAmt ? currentPaid - paymentAmt : BigInt('0');
        invoice.paidMicros = nextPaid.toString();
        invoice.status =
          nextPaid === BigInt('0')
            ? invoice.sentAt
              ? 'SENT'
              : 'READY'
            : 'PARTIALLY_PAID';
        await invoiceRepo.save(invoice);
      }
    }
  }

  async updateClientPaymentDateInTransaction(
    manager: EntityManager,
    params: {
      workspaceId: string;
      memberId: string;
      newDate: string;
      journalId?: string;
      businessRecord?: {
        id: string;
        category: 'INCOME' | 'RECEIVABLE';
        externalReference: string;
        currentDate: string;
      };
    },
  ): Promise<{
    journalId: string;
    oldDate: string;
    newDate: string;
    title: string;
    projectId: string | null;
    sourceRefType: string | null;
    sourceRefId: string | null;
  } | null> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.newDate)) {
      throw new BadRequestException(
        'Enter a valid payment date in YYYY-MM-DD format.',
      );
    }
    await this.lockWorkspace(manager, params.workspaceId, true);
    const profile = await this.ensureProfile(manager, params.workspaceId);
    const journalRepo = manager.getRepository(DeliveryFinanceV2JournalEntity);

    assertDateNotLocked(
      profile.lockedThroughDate,
      params.newDate,
      'move payment dates',
    );

    let journal: DeliveryFinanceV2JournalEntity | null = null;
    if (params.journalId) {
      journal = await journalRepo.findOneBy({
        workspaceId: params.workspaceId,
        id: params.journalId,
      });
      if (!journal) {
        throw new NotFoundException('Payment entry not found in Finance.');
      }
      if (
        journal.status !== 'POSTED' ||
        journal.entryType !== 'INVOICE_PAYMENT'
      ) {
        throw new BadRequestException(
          'Only posted client payment entries can have their payment date edited.',
        );
      }
    } else if (params.businessRecord) {
      const { id, category, externalReference } = params.businessRecord;
      if (category === 'INCOME' && externalReference.startsWith('receivable:')) {
        const receivableId = externalReference.slice('receivable:'.length);
        const linkedInvoiceId = deterministicClientReceivableInvoiceId(
          params.workspaceId,
          receivableId,
        );
        journal =
          (await journalRepo.findOneBy({
            workspaceId: params.workspaceId,
            sourceRefType: 'INVOICE_PAYMENT',
            sourceRefId: `${linkedInvoiceId}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${id}`,
            status: 'POSTED',
          })) ??
          (await journalRepo.findOneBy({
            workspaceId: params.workspaceId,
            sourceRefType: CLIENT_BUSINESS_PAYMENT_REF_TYPE,
            sourceRefId: id,
            status: 'POSTED',
          }));
      } else if (category === 'INCOME') {
        journal = await journalRepo.findOneBy({
          workspaceId: params.workspaceId,
          sourceRefType: CLIENT_BUSINESS_PAYMENT_REF_TYPE,
          sourceRefId: id,
          status: 'POSTED',
        });
      } else if (category === 'RECEIVABLE') {
        const linkedInvoiceId = deterministicClientReceivableInvoiceId(
          params.workspaceId,
          id,
        );
        journal = await journalRepo.findOneBy({
          workspaceId: params.workspaceId,
          sourceRefType: 'INVOICE_PAYMENT',
          sourceRefId: `${linkedInvoiceId}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${id}`,
          status: 'POSTED',
        });
      }
    }

    if (!journal) {
      if (params.businessRecord?.currentDate) {
        assertDateNotLocked(
          profile.lockedThroughDate,
          params.businessRecord.currentDate,
          'edit payment dates',
        );
      }
      return null;
    }

    const reversal = await journalRepo.findOneBy({
      workspaceId: params.workspaceId,
      entryType: 'REVERSAL',
      reversalOfJournalId: journal.id,
      status: 'POSTED',
    });
    if (reversal) {
      throw new BadRequestException(
        'Cannot edit the date of a reversed payment entry.',
      );
    }

    const oldDate = String(journal.entryDate).slice(0, 10);
    assertDateNotLocked(
      profile.lockedThroughDate,
      oldDate,
      'edit payment dates',
    );

    if (oldDate !== params.newDate) {
      journal.entryDate = params.newDate;
      await journalRepo.save(journal);
    }

    return {
      journalId: journal.id,
      oldDate,
      newDate: params.newDate,
      title: journal.title,
      projectId: journal.projectId,
      sourceRefType: journal.sourceRefType,
      sourceRefId: journal.sourceRefId,
    };
  }

  private async hasUnsyncedClientBusinessBilling(
    manager: EntityManager,
    workspaceId: string,
    lockedThroughDate: string | null,
  ): Promise<boolean> {
    const operations = await manager
      .getRepository(DeliveryOperationsEntity)
      .findOneBy({ workspaceId });
    const records = operations?.state.business?.records ?? [];
    const clientFinanceRecords = records.filter(
      (
        record,
      ): record is Extract<
        (typeof records)[number],
        { kind: 'FINANCE' }
      > =>
        record.kind === 'FINANCE' &&
        Boolean(record.companyId) &&
        record.status !== 'VOID' &&
        record.amount > 0 &&
        (record.category === 'INCOME' || record.category === 'RECEIVABLE'),
    );
    if (clientFinanceRecords.length === 0) return false;

    const existingInvoices = await manager
      .getRepository(DeliveryFinanceV2InvoiceEntity)
      .findBy({ workspaceId });
    const invoiceById = new Map(
      existingInvoices.map((invoice) => [invoice.id, invoice]),
    );
    const existingJournals = await manager
      .getRepository(DeliveryFinanceV2JournalEntity)
      .findBy({ workspaceId });
    const journalKeys = new Set(
      existingJournals
        .filter((journal) => journal.sourceRefType && journal.sourceRefId)
        .map((journal) => `${journal.sourceRefType}::${journal.sourceRefId}`),
    );
    const receiptReceivableIds = new Set(
      clientFinanceRecords
        .filter(
          (record) =>
            record.category === 'INCOME' &&
            record.externalReference.startsWith('receivable:'),
        )
        .map((record) =>
          record.externalReference.slice('receivable:'.length),
        ),
    );

    for (const record of clientFinanceRecords) {
      if (record.category === 'RECEIVABLE') {
        const invoiceId = deterministicClientReceivableInvoiceId(
          workspaceId,
          record.id,
        );
        const invoice = invoiceById.get(invoiceId);
        if (!invoice) return true;
        if (
          record.status === 'PAID' &&
          !receiptReceivableIds.has(record.id) &&
          invoice.status !== 'PAID' &&
          invoice.status !== 'VOID' &&
          (!lockedThroughDate || record.date > lockedThroughDate) &&
          !journalKeys.has(
            `INVOICE_PAYMENT::${invoiceId}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${record.id}`,
          )
        ) {
          return true;
        }
        continue;
      }

      if (lockedThroughDate && record.date <= lockedThroughDate) continue;

      if (record.externalReference.startsWith('receivable:')) {
        const receivableId = record.externalReference.slice(
          'receivable:'.length,
        );
        const invoiceId = deterministicClientReceivableInvoiceId(
          workspaceId,
          receivableId,
        );
        const invoice = invoiceById.get(invoiceId);
        if (invoice && (invoice.status === 'PAID' || invoice.status === 'VOID')) {
          continue;
        }
        const alreadyRecorded =
          journalKeys.has(
            `INVOICE_PAYMENT::${invoiceId}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${record.id}`,
          ) ||
          journalKeys.has(`${CLIENT_BUSINESS_PAYMENT_REF_TYPE}::${record.id}`);
        if (!alreadyRecorded) return true;
      } else if (
        !journalKeys.has(`${CLIENT_BUSINESS_PAYMENT_REF_TYPE}::${record.id}`)
      ) {
        return true;
      }
    }

    return false;
  }

  private async backfillUnsyncedClientBusinessBilling(
    workspace: WorkspaceEntity,
    memberId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockWorkspace(manager, workspace.id, true);
      const profile = await this.ensureProfile(manager, workspace.id);
      await this.ensureSystemAccounts(manager, workspace.id);

      const operations = await manager
        .getRepository(DeliveryOperationsEntity)
        .findOneBy({ workspaceId: workspace.id });
      const records = operations?.state.business?.records ?? [];
      const clientFinanceRecords = records.filter(
        (
          record,
        ): record is Extract<
          (typeof records)[number],
          { kind: 'FINANCE' }
        > =>
          record.kind === 'FINANCE' &&
          Boolean(record.companyId) &&
          record.status !== 'VOID' &&
          record.amount > 0 &&
          (record.category === 'INCOME' || record.category === 'RECEIVABLE'),
      );
      if (clientFinanceRecords.length === 0) return;

      const companyNamesById = new Map<string, string>();
      const companyIds = [
        ...new Set(
          clientFinanceRecords
            .map((record) => record.companyId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (companyIds.length > 0) {
        try {
          const rows: { id: string; name: string }[] = await manager.query(
            `SELECT id, name FROM ${this.delivery.schema(workspace)}."company" WHERE id = ANY($1::uuid[]) AND "deletedAt" IS NULL`,
            [companyIds],
          );
          for (const row of rows) {
            if (row.id && row.name) companyNamesById.set(row.id, row.name);
          }
        } catch {
          // Non-fatal fallback when workspace company schema is unavailable in isolated tests.
        }
      }

      const existingJournals = await manager
        .getRepository(DeliveryFinanceV2JournalEntity)
        .findBy({ workspaceId: workspace.id });
      const journalKeys = new Set(
        existingJournals
          .filter((journal) => journal.sourceRefType && journal.sourceRefId)
          .map((journal) => `${journal.sourceRefType}::${journal.sourceRefId}`),
      );
      const receiptReceivableIds = new Set(
        clientFinanceRecords
          .filter(
            (record) =>
              record.category === 'INCOME' &&
              record.externalReference.startsWith('receivable:'),
          )
          .map((record) =>
            record.externalReference.slice('receivable:'.length),
          ),
      );

      // 1. Sync receivables first so linked payment receipts can settle their invoices.
      for (const record of clientFinanceRecords) {
        if (record.category !== 'RECEIVABLE') continue;
        const clientName =
          (record.companyId ? companyNamesById.get(record.companyId) : null) ??
          record.title;
        await this.syncClientBusinessFinanceEntryInTransaction(manager, {
          workspaceId: workspace.id,
          memberId: record.createdBy || memberId,
          recordId: record.id,
          category: 'RECEIVABLE',
          title: record.title,
          clientName,
          currency: record.currency,
          amountMinor: record.amount,
          date: record.date,
          dueDate: record.dueDate,
          projectId: record.projectId,
          externalReference: record.externalReference,
          evidenceUrl: record.evidenceUrl,
          notes: record.notes,
        });

        if (
          record.status === 'PAID' &&
          !receiptReceivableIds.has(record.id) &&
          (!profile.lockedThroughDate ||
            record.date > profile.lockedThroughDate)
        ) {
          const invoiceId = deterministicClientReceivableInvoiceId(
            workspace.id,
            record.id,
          );
          if (
            !journalKeys.has(
              `INVOICE_PAYMENT::${invoiceId}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${record.id}`,
            )
          ) {
            await this.settleClientBusinessReceivableInTransaction(manager, {
              workspaceId: workspace.id,
              memberId: record.decisionBy || record.createdBy || memberId,
              receivableId: record.id,
              receiptId: record.id,
              title: `Payment: ${record.title}`,
              clientName,
              currency: record.currency,
              amountMinor: record.amount,
              paymentDate: record.date,
              projectId: record.projectId,
              evidenceUrl: record.evidence ?? record.evidenceUrl,
              notes: record.notes,
            });
          }
        }
      }

      // 2. Sync payment receipts & direct cash collected.
      for (const record of clientFinanceRecords) {
        if (record.category !== 'INCOME') continue;
        if (
          profile.lockedThroughDate &&
          record.date <= profile.lockedThroughDate
        ) {
          continue;
        }
        const clientName =
          (record.companyId ? companyNamesById.get(record.companyId) : null) ??
          record.title;
        if (record.externalReference.startsWith('receivable:')) {
          const receivableId = record.externalReference.slice(
            'receivable:'.length,
          );
          const invoiceId = deterministicClientReceivableInvoiceId(
            workspace.id,
            receivableId,
          );
          if (
            journalKeys.has(
              `INVOICE_PAYMENT::${invoiceId}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${record.id}`,
            ) ||
            journalKeys.has(`${CLIENT_BUSINESS_PAYMENT_REF_TYPE}::${record.id}`)
          ) {
            continue;
          }
          await this.settleClientBusinessReceivableInTransaction(manager, {
            workspaceId: workspace.id,
            memberId: record.createdBy || memberId,
            receivableId,
            receiptId: record.id,
            title: record.title,
            clientName,
            currency: record.currency,
            amountMinor: record.amount,
            paymentDate: record.date,
            projectId: record.projectId,
            evidenceUrl: record.evidenceUrl,
            notes: record.notes,
          });
        } else {
          if (
            journalKeys.has(`${CLIENT_BUSINESS_PAYMENT_REF_TYPE}::${record.id}`)
          ) {
            continue;
          }
          await this.syncClientBusinessFinanceEntryInTransaction(manager, {
            workspaceId: workspace.id,
            memberId: record.createdBy || memberId,
            recordId: record.id,
            category: 'INCOME',
            title: record.title,
            clientName,
            currency: record.currency,
            amountMinor: record.amount,
            date: record.date,
            dueDate: null,
            projectId: record.projectId,
            externalReference: record.externalReference,
            evidenceUrl: record.evidenceUrl,
            notes: record.notes,
          });
        }
      }
    });
  }
}
