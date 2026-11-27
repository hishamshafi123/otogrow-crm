import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

jest.mock('src/modules/delivery/finance-v2/finance-v2-pdf.util', () => ({
  renderFinanceV2PdfBuffer: jest.fn(
    async (payload: { documentNumber: string }) =>
      Buffer.from(`%PDF-1.4 ${payload.documentNumber}`),
  ),
}));
jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn(async () => undefined),
}));
import { type DataSource } from 'typeorm';
import { type EmailService } from 'src/engine/core-modules/email/email.service';
import { type FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
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
import { DeliveryFinanceV2Service } from 'src/modules/delivery/finance-v2/finance-v2.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { OtogrowAiSpendEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity';

type StoreMap = Map<unknown, Record<string, unknown>[]>;

const matchesWhere = (
  row: Record<string, unknown>,
  where: Record<string, unknown> | undefined,
): boolean => {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (
      expected &&
      typeof expected === 'object' &&
      '_type' in expected &&
      (expected as { _type: string })._type === 'in'
    ) {
      const list = (expected as unknown as { _value: unknown[] })._value;
      if (!list.includes(row[key])) return false;
      continue;
    }
    if (row[key] !== expected) return false;
  }
  return true;
};

const createInMemoryManager = (stores: StoreMap) => {
  const getList = (entity: unknown): Record<string, unknown>[] => {
    if (!stores.has(entity)) stores.set(entity, []);
    return stores.get(entity)!;
  };

  return {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM core."deliveryFinanceV2JournalLine"')) {
        const lines = getList(DeliveryFinanceV2JournalLineEntity);
        const journals = new Map(
          getList(DeliveryFinanceV2JournalEntity).map((j) => [j.id, j]),
        );
        const accounts = new Map(
          getList(DeliveryFinanceV2AccountEntity).map((a) => [a.id, a]),
        );

        // 1. queryAccountCarryingTotals
        if (sql.includes('AS "origMicros"')) {
          const [wsId, accountId, asOfDate] = (params ?? []) as [
            string,
            string,
            string,
          ];
          let orig = BigInt('0');
          let aed = BigInt('0');
          for (const line of lines) {
            const journal = journals.get(line.journalId);
            if (
              !journal ||
              line.workspaceId !== wsId ||
              line.accountId !== accountId ||
              journal.status !== 'POSTED' ||
              String(journal.entryDate) > asOfDate
            ) {
              continue;
            }
            orig += BigInt(String(line.originalSignedMicros));
            aed +=
              BigInt(String(line.debitAedMicros)) -
              BigInt(String(line.creditAedMicros));
          }
          return [{ origMicros: orig.toString(), aedMicros: aed.toString() }];
        }

        // 2. queryPersonHasNonZeroBalance (GROUP BY currency)
        if (sql.includes('GROUP BY l."currency"')) {
          const [wsId, accountId] = (params ?? []) as [string, string];
          const byCurrency = new Map<string, { orig: bigint; aed: bigint }>();
          for (const line of lines) {
            const journal = journals.get(line.journalId);
            if (
              !journal ||
              line.workspaceId !== wsId ||
              line.accountId !== accountId ||
              journal.status !== 'POSTED'
            ) {
              continue;
            }
            const cur = String(line.currency);
            const bucket = byCurrency.get(cur) ?? {
              orig: BigInt('0'),
              aed: BigInt('0'),
            };
            const credit = BigInt(String(line.creditAedMicros));
            const debit = BigInt(String(line.debitAedMicros));
            const rawOrig = BigInt(String(line.originalSignedMicros));
            const absOrig = rawOrig < BigInt('0') ? -rawOrig : rawOrig;
            bucket.orig += credit > BigInt('0') ? absOrig : -absOrig;
            bucket.aed += credit - debit;
            byCurrency.set(cur, bucket);
          }
          return [...byCurrency.entries()].map(([currency, bucket]) => ({
            currency,
            owedOrigMicros: bucket.orig.toString(),
            owedAedMicros: bucket.aed.toString(),
          }));
        }

        // 3. queryPersonLiabilityCarryingTotals
        if (sql.includes('AS "owedOrigMicros"')) {
          const [wsId, accountId, currency, asOfDate] = (params ?? []) as [
            string,
            string,
            string,
            string,
          ];
          let owedOrig = BigInt('0');
          let owedAed = BigInt('0');
          for (const line of lines) {
            const journal = journals.get(line.journalId);
            if (
              !journal ||
              line.workspaceId !== wsId ||
              line.accountId !== accountId ||
              line.currency !== currency ||
              journal.status !== 'POSTED' ||
              String(journal.entryDate) > asOfDate
            ) {
              continue;
            }
            const credit = BigInt(String(line.creditAedMicros));
            const debit = BigInt(String(line.debitAedMicros));
            const rawOrig = BigInt(String(line.originalSignedMicros));
            const absOrig = rawOrig < BigInt('0') ? -rawOrig : rawOrig;
            owedOrig += credit > BigInt('0') ? absOrig : -absOrig;
            owedAed += credit - debit;
          }
          return [
            {
              owedOrigMicros: owedOrig.toString(),
              owedAedMicros: owedAed.toString(),
            },
          ];
        }

        // 4. loadLedgerLines (full ledger scan for reports)
        return lines.map((line) => {
          const journal = journals.get(line.journalId)!;
          const account = accounts.get(line.accountId)!;
          const origJournal = journal.reversalOfJournalId
            ? journals.get(journal.reversalOfJournalId)
            : undefined;
          return {
            journalId: line.journalId,
            entryDate: journal.entryDate,
            entryType: journal.entryType,
            category: journal.category,
            accountId: line.accountId,
            accountType: account.accountType,
            accountSubType: account.subType,
            accountName: account.name,
            accountCurrency: account.currency,
            personName: account.personName,
            debitAedMicros: String(line.debitAedMicros),
            creditAedMicros: String(line.creditAedMicros),
            currency: line.currency,
            originalSignedMicros: String(line.originalSignedMicros),
            status: journal.status,
            projectId: (journal.projectId as string | null | undefined) ?? null,
            reversalOfEntryType:
              (origJournal?.entryType as string | undefined) ?? null,
          };
        });
      }
      return [];
    }),
    getRepository: (entity: unknown) => {
      const list = getList(entity);
      return {
        create: (data: Record<string, unknown>) => ({
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
        findOneBy: async (where: Record<string, unknown>) =>
          list.find((row) => matchesWhere(row, where)) ?? null,
        findBy: async (where: Record<string, unknown>) =>
          list.filter((row) => matchesWhere(row, where)),
        find: async (options?: { where?: Record<string, unknown> }) =>
          list.filter((row) => matchesWhere(row, options?.where)),
        save: async (
          item: Record<string, unknown> | Record<string, unknown>[],
        ) => {
          const items = Array.isArray(item) ? item : [item];
          for (const entry of items) {
            const idx = list.findIndex((row) => row.id === entry.id);
            const stamped = {
              createdAt: entry.createdAt ?? new Date(),
              updatedAt: new Date(),
              ...entry,
            };
            if (idx >= 0) list[idx] = stamped;
            else list.push(stamped);
          }
          return item;
        },
        remove: async (item: Record<string, unknown>) => {
          const idx = list.findIndex((row) => row.id === item.id);
          if (idx >= 0) list.splice(idx, 1);
          return item;
        },
      };
    },
  };
};

describe('DeliveryFinanceV2Service End-to-End Accounting, Payroll, Quotes & Automation', () => {
  const workspace = {
    id: '11111111-1111-4111-8111-111111111111',
  } as WorkspaceEntity;
  const adminMemberId = '22222222-2222-4222-8222-222222222222';
  const staffMemberId = '33333333-3333-4333-8333-333333333333';
  const userWorkspaceId = '44444444-4444-4444-8444-444444444444';

  const setup = (actorOverrides?: {
    isAdmin?: boolean;
    capabilities?: string[];
  }) => {
    const stores: StoreMap = new Map<unknown, Record<string, unknown>[]>([
      [DeliveryProjectEntity, []],
      [OtogrowAiSpendEntity, []],
      [DeliveryFinanceV2ProfileEntity, []],
      [DeliveryFinanceV2AccountEntity, []],
      [DeliveryFinanceV2JournalEntity, []],
      [DeliveryFinanceV2JournalLineEntity, []],
      [DeliveryFinanceV2RecurringExpenseEntity, []],
      [DeliveryFinanceV2PayrollProfileEntity, []],
      [DeliveryFinanceV2PayrollEntryEntity, []],
      [DeliveryFinanceV2QuoteEntity, []],
      [DeliveryFinanceV2InvoiceScheduleEntity, []],
      [DeliveryFinanceV2InvoiceEntity, []],
    ]);
    const manager = createInMemoryManager(stores);
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    } as unknown as DataSource;
    const delivery = {
      actor: jest.fn(async () => ({
        memberId:
          actorOverrides?.isAdmin === false ? staffMemberId : adminMemberId,
        isAdmin: actorOverrides?.isAdmin ?? true,
        isManager: actorOverrides?.isAdmin ?? true,
        capabilities: actorOverrides?.capabilities ?? [],
      })),
    } as unknown as DeliveryService;
    const access = {
      listActiveMembers: jest.fn(async () => [
        { memberId: adminMemberId, name: 'Amna' },
        { memberId: staffMemberId, name: 'Arjun' },
      ]),
    } as unknown as OtogrowAccessService;
    const writeFile = jest.fn(async () => undefined);
    const storage = {
      getCurrentDriver: () => ({ writeFile }),
    } as unknown as FileStorageDriverFactory;
    const sendEmail = jest.fn(
      async (_mail: Record<string, unknown>) => undefined,
    );
    const emailService = { send: sendEmail } as unknown as EmailService;
    const configService = {
      get: jest.fn(() => 'finance@otogrow.com'),
    } as unknown as TwentyConfigService;

    const service = new DeliveryFinanceV2Service(
      dataSource,
      delivery,
      access,
      storage,
      emailService,
      configService,
    );

    return { service, stores, manager, writeFile, sendEmail };
  };

  it('G6-ACCESS-PRIVACY: blocks non-finance employees from reading, mutating, or downloading PDFs', async () => {
    const { service } = setup({ isAdmin: false, capabilities: [] });
    await expect(
      service.snapshot(workspace, staffMemberId, userWorkspaceId, {}),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.command(workspace, staffMemberId, userWorkspaceId, {
        action: 'savePersonLiability',
        personName: 'Unauthorized',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.downloadQuotePdf(
        workspace,
        staffMemberId,
        userWorkspaceId,
        '55555555-5555-4555-8555-555555555555',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('G1-G5 full lifecycle: opening profits, quote -> invoice -> manual send -> cash-basis payment, recurring bill from person liability, payroll base + leave/swap/OT on payday, idempotent automation', async () => {
    const { service, writeFile, sendEmail } = setup();
    const nov24 = new Date('2026-11-24T09:00:00Z');

    // Initial snapshot bootstraps accounts & profile
    const initial = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
        asOfDate: '2026-11-30',
        payrollMonth: '2026-11',
      },
      nov24,
    );
    const cashUsd = initial.accounts.find((a) => a.code === 'CASH:USD')!;
    const cashInr = initial.accounts.find((a) => a.code === 'CASH:INR')!;
    const cashAed = initial.accounts.find((a) => a.code === 'CASH:AED')!;
    expect(initial.balanceSheet.isBalanced).toBe(true);

    // 1. Opening accumulated profit in USD ($10,000) & INR (₹100,000)
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordOpeningBalance',
        kind: 'CASH',
        title: 'Existing USD profits',
        entryDate: '2026-11-01',
        currency: 'USD',
        amountMicros: '10000000000',
      },
      nov24,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordOpeningBalance',
        kind: 'CASH',
        title: 'Existing INR balance',
        entryDate: '2026-11-01',
        currency: 'INR',
        amountMicros: '100000000000',
      },
      nov24,
    );

    // 2. Add Person Liability (Hisham) & recurring software bill charged to Hisham on day 5
    const personRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePersonLiability',
        personName: 'Hisham',
        personEmail: 'hisham@otogrow.com',
        currency: 'USD',
      },
      nov24,
    );
    const hishamId = String(personRes.accountId);

    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveRecurringExpense',
        title: 'Figma Team Plan',
        expenseType: 'DIRECT_EXPENSE',
        category: 'DIRECT_SUBSCRIPTION',
        currency: 'USD',
        amountMicros: '100000000',
        dayOfMonth: 5,
        fundingAccountId: hishamId,
        startMonth: '2026-11',
      },
      nov24,
    );

    // 3. Create Quote, download/email manually, convert to One-Off Invoice due Nov 17 (7 days overdue on Nov 24!)
    const quoteRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveQuote',
        clientName: 'Global Brand Co',
        clientEmail: 'ap@globalbrand.com',
        currency: 'USD',
        issueDate: '2026-11-01',
        validUntil: '2026-11-15',
        lineItems: [
          {
            label: 'Creative + Paid Ads Retainer',
            quantity: '1',
            unitPriceMicros: '5000000000',
            discountPercent: '0',
          },
        ],
      },
      nov24,
    );
    const quoteId = String(quoteRes.quoteId);

    const converted = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'convertQuoteToInvoice',
        quoteId,
        mode: 'ONE_OFF',
        issueDate: '2026-11-01',
        dueDate: '2026-11-17',
      },
      nov24,
    );
    const invoiceId = String(converted.invoiceId);
    // PDF was generated and stored inside the OS immediately, WITHOUT emailing!
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();

    // Cash-basis check: Revenue is STILL 0 before payment, and invoice shows 7 days overdue!
    const beforePayment = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
        asOfDate: '2026-11-30',
        payrollMonth: '2026-11',
      },
      nov24,
    );
    expect(beforePayment.profitAndLoss.revenueAedMicros).toBe('0');
    expect(beforePayment.invoices[0]?.overdueDays).toBe(0);
    expect(beforePayment.invoices[0]?.status).toBe('READY');

    // Explicit manual Send Email button emails the PDF and activates overdue tracking
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'sendInvoiceEmail',
        invoiceId,
      },
      nov24,
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const afterSend = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
        asOfDate: '2026-11-30',
        payrollMonth: '2026-11',
      },
      nov24,
    );
    expect(afterSend.invoices[0]?.status).toBe('SENT');
    expect(afterSend.invoices[0]?.overdueDays).toBe(7);

    // Record full payment -> Revenue now appears on P&L and overdueDays drops to 0!
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordInvoicePayment',
        invoiceId,
        paymentDate: '2026-11-24',
        amountMicros: '5000000000',
      },
      nov24,
    );

    // 4. Payroll: Arjun base salary ₹15,000 INR (payday 20th), 3 leaves + 0 swaps => 1 unpaid leave deduction, + 1 overtime day!
    const payrollRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePayrollProfile',
        employeeMemberId: staffMemberId,
        employeeName: 'Arjun',
        roleLabel: 'Video Editor',
        currency: 'INR',
        baseSalaryMicros: '15000000000',
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 2,
        payDayOfMonth: 20,
        fundingAccountId: cashInr.id,
        startMonth: '2026-11',
        active: true,
      },
      nov24,
    );
    const profileId = String(payrollRes.payrollProfileId);

    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'addPayrollEntry',
        profileId,
        month: '2026-11',
        entryKind: 'LEAVE',
        days: '3',
        eventDate: '2026-11-10',
        note: '3 days off (2 internal paid + 1 unpaid)',
      },
      nov24,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'addPayrollEntry',
        profileId,
        month: '2026-11',
        entryKind: 'OVERTIME',
        days: '1',
        eventDate: '2026-11-15',
        note: 'Worked Sunday shoot',
      },
      nov24,
    );

    // 5. Also add a recurring invoice schedule (billing day 1, due day 17)
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveInvoiceSchedule',
        clientName: 'Retainer Client',
        clientEmail: 'billing@retainer.com',
        currency: 'USD',
        billingDayOfMonth: 1,
        dueDayOfMonth: 17,
        startMonth: '2026-11',
        lineItems: [
          {
            label: 'Monthly SEO',
            quantity: '1',
            unitPriceMicros: '2000000000',
            discountPercent: '0',
          },
        ],
      },
      nov24,
    );

    // 6. Run due automation TWICE -> G5-IDEMPOTENCY guarantees zero duplicates & zero auto-emails!
    const run1 = await service.runDueAutomationForWorkspace(
      workspace.id,
      adminMemberId,
      '2026-11-24',
    );
    expect(run1.recurringExpensesPosted).toBe(2); // Figma + Arjun base salary
    expect(run1.payrollAdjustmentsPosted).toBe(2); // Overtime + Leave Reduction
    expect(run1.invoicesCreated).toBe(1); // Retainer Client PDF stored in OS
    expect(sendEmail).toHaveBeenCalledTimes(1); // Still ONLY the manual send!

    const run2 = await service.runDueAutomationForWorkspace(
      workspace.id,
      adminMemberId,
      '2026-11-24',
    );
    expect(run2).toEqual({
      recurringExpensesPosted: 0,
      payrollAdjustmentsPosted: 0,
      invoicesCreated: 0,
    });

    // 7. Buy a Laptop as Asset (does NOT hit P&L) + convert $1,000 USD -> 3,660 AED
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordExpenseOrAsset',
        entryKind: 'ASSET_PURCHASE',
        category: 'ASSET_EQUIPMENT',
        title: 'MacBook Pro M4',
        entryDate: '2026-11-24',
        currency: 'USD',
        amountMicros: '2000000000',
        fundingAccountId: cashUsd.id,
      },
      nov24,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'convertCurrency',
        entryDate: '2026-11-24',
        fromCurrency: 'USD',
        fromAmountMicros: '1000000000',
        toCurrency: 'AED',
        toAmountMicros: '3660000000',
      },
      nov24,
    );

    // Final Balance Sheet & P&L verification (G2-BALANCE-SHEET)
    const finalSnap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
        asOfDate: '2026-11-30',
        payrollMonth: '2026-11',
      },
      nov24,
    );
    expect(finalSnap.balanceSheet.isBalanced).toBe(true);
    expect(finalSnap.balanceSheet.imbalanceAedMicros).toBe('0');
    expect(finalSnap.profitAndLoss.revenueAedMicros).toBe('18362500000'); // $5,000 paid invoice only!
    expect(finalSnap.balanceSheet.fixedAssetsAedMicros).toBe('7345000000'); // $2,000 laptop @ 3.6725
    expect(
      finalSnap.balanceSheet.liabilitiesByPerson[0]?.balanceOwedAedMicros,
    ).toBe('367250000'); // $100 Figma owed to Hisham
    expect(
      finalSnap.balanceSheet.cashByCurrency.find(
        (c) => c.accountId === cashAed.id,
      )?.originalMicros,
    ).toBe('3660000000');
    expect(
      finalSnap.invoices.find((i) => i.id === invoiceId)?.overdueDays,
    ).toBe(0);
    expect(finalSnap.invoices.find((i) => i.id === invoiceId)?.status).toBe(
      'PAID',
    );

    // CSV exports work cleanly
    const csvRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'exportCsv',
        dataset: 'BALANCE_SHEET',
        asOfDate: '2026-11-30',
      },
      nov24,
    );
    expect(String(csvRes.csv)).toContain('Total Assets');
    expect(String(csvRes.csv)).toContain('Owed to Hisham');
  });

  it('C1, C3, C6: emails base64 PDFs with safe From/replyTo, never resurrects voided cron expenses, and restores invoice status on payment void', async () => {
    const { service, sendEmail, writeFile } = setup();
    const nov24 = new Date('2026-11-24T09:00:00Z');

    // Configure company profile with potentially dangerous characters in name + reply email
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveCompanyProfile',
        companyName: 'Otogrow "Dubai"\r\nMedia',
        legalAddress: 'Dubai, UAE',
        email: 'billing@otogrow.com',
        phone: '',
        website: '',
        bankDetails: '',
        defaultQuoteTerms: '',
        defaultInvoiceNotes: '',
      },
      nov24,
    );

    const init = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {},
      nov24,
    );
    // H7: all 9 currencies have Cash accounts bootstrapped
    expect(
      init.accounts.filter((a) => a.subType === 'CASH_CURRENCY').length,
    ).toBe(9);
    const cashUsd = init.accounts.find((a) => a.code === 'CASH:USD')!;

    // Create invoice, email it, verify C1 base64 attachment & safe From + replyTo
    const invRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveInvoice',
        clientName: 'Alpha Co',
        clientEmail: 'ap@alpha.co',
        currency: 'USD',
        issueDate: '2026-11-01',
        dueDate: '2026-11-17',
        lineItems: [
          {
            label: 'Growth Retainer',
            quantity: '1',
            unitPriceMicros: '1000000000',
            discountPercent: '0',
          },
        ],
      },
      nov24,
    );
    const invoiceId = String(invRes.invoiceId);

    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'sendInvoiceEmail',
        invoiceId,
      },
      nov24,
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mailArg = sendEmail.mock.calls[0]?.[0] as unknown as {
      from: string;
      replyTo: string;
      attachments: { encoding: string; content: unknown }[];
    };
    expect(mailArg.from).toBe('"Otogrow Dubai Media" <finance@otogrow.com>');
    expect(mailArg.replyTo).toBe('billing@otogrow.com');
    expect(mailArg.attachments[0]?.encoding).toBe('base64');
    expect(typeof mailArg.attachments[0]?.content).toBe('string');

    // C6: Pay invoice, then void the payment journal -> invoice returns to SENT with 0 paid & PDF refreshed
    const payRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordInvoicePayment',
        invoiceId,
        paymentDate: '2026-11-24',
        amountMicros: '1000000000',
      },
      nov24,
    );
    const writeCountBeforeVoid = writeFile.mock.calls.length;
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'voidJournal',
        journalId: String(payRes.journalId),
        reason: 'Bank transfer bounced',
      },
      nov24,
    );
    expect(writeFile.mock.calls.length).toBeGreaterThan(writeCountBeforeVoid);
    const afterVoid = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {},
      nov24,
    );
    const inv = afterVoid.invoices.find((i) => i.id === invoiceId)!;
    expect(inv.status).toBe('SENT');
    expect(inv.paidMicros).toBe('0');
    expect(inv.overdueDays).toBe(7);

    // C3: Recurring expense posted by cron, voided by admin, must NOT be resurrected by next cron run
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveRecurringExpense',
        title: 'Adobe CC',
        expenseType: 'DIRECT_EXPENSE',
        category: 'DIRECT_SUBSCRIPTION',
        currency: 'USD',
        amountMicros: '50000000',
        dayOfMonth: 5,
        fundingAccountId: cashUsd.id,
        startMonth: '2026-11',
      },
      nov24,
    );
    const firstRun = await service.runDueAutomationForWorkspace(
      workspace.id,
      adminMemberId,
      '2026-11-24',
    );
    expect(firstRun.recurringExpensesPosted).toBe(1);
    const snapAfterRun = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {},
      nov24,
    );
    const recurringJournal = snapAfterRun.journals.find(
      (j) => j.sourceRefType === 'RECURRING_EXPENSE',
    )!;
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'voidJournal',
        journalId: recurringJournal.id,
        reason: 'Skipped this month',
      },
      nov24,
    );
    const secondRun = await service.runDueAutomationForWorkspace(
      workspace.id,
      adminMemberId,
      '2026-11-24',
    );
    expect(secondRun.recurringExpensesPosted).toBe(0);
  });

  it('C4: restricts payroll roster, commands, and payroll CSV to workspace admins even when user has finance.read', async () => {
    const { service } = setup({
      isAdmin: false,
      capabilities: ['finance.read'],
    });
    const snap = await service.snapshot(
      workspace,
      staffMemberId,
      userWorkspaceId,
      {},
      new Date('2026-11-24T09:00:00Z'),
    );
    expect(snap.canViewPayroll).toBe(false);
    expect(snap.payrollProfiles).toEqual([]);
    expect(snap.payrollSummaries).toEqual([]);
    expect(snap.payrollEntries).toEqual([]);

    await expect(
      service.command(workspace, staffMemberId, userWorkspaceId, {
        action: 'exportCsv',
        dataset: 'PAYROLL',
        payrollMonth: '2026-11',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('HI-1, HI-2, H10 & M17: weighted carrying AED zeroes foreign cash & liability cleanly, real FX spread books P&L, CSV preserves negatives & escapes formulas, and early-month payday aligns base salary + adjustments', async () => {
    const { service } = setup();
    const nov24 = new Date('2026-11-24T09:00:00Z');

    // 1. Natural USD/USD hedge: borrow $1,000 @ 3.6725 into USD cash, repay $1,000 from that same USD cash @ 3.70
    // Both USD cash and Hisham liability must reach $0.00 AND 0.00 AED with ZERO phantom FX loss!
    const pRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePersonLiability',
        personName: 'Hisham',
        currency: 'USD',
      },
      nov24,
    );
    const hishamId = String(pRes.accountId);

    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordLoanIn',
        personAccountId: hishamId,
        entryDate: '2026-11-01',
        currency: 'USD',
        amountMicros: '1000000000',
        fxRateToAed: '3.6725',
      },
      nov24,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordLoanRepayment',
        personAccountId: hishamId,
        entryDate: '2026-11-05',
        currency: 'USD',
        amountMicros: '1000000000',
        fxRateToAed: '3.70',
      },
      nov24,
    );

    const afterHedge = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov24,
    );
    expect(afterHedge.balanceSheet.isBalanced).toBe(true);
    expect(
      afterHedge.balanceSheet.liabilitiesByPerson[0]?.balanceOwedAedMicros,
    ).toBe('0');
    expect(afterHedge.balanceSheet.totalCashAedMicros).toBe('0');
    expect(afterHedge.profitAndLoss.fxGainLossAedMicros).toBe('0');

    // 2. Real FX carrying-rate spread: USD cash acquired @ 3.70 repays Hisham expense booked @ 3.6725 -> -27.50 AED FX loss,
    // and BOTH Cash USD and Hisham Liability end at exact 0.00 AED!
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordOpeningBalance',
        kind: 'CASH',
        title: 'USD cash @ 3.70',
        entryDate: '2026-11-10',
        currency: 'USD',
        amountMicros: '1000000000',
        fxRateToAed: '3.70',
      },
      nov24,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordExpenseOrAsset',
        entryKind: 'DIRECT_EXPENSE',
        category: 'DIRECT_SUBSCRIPTION',
        title: 'Cloud bill paid by Hisham @ 3.6725',
        entryDate: '2026-11-12',
        currency: 'USD',
        amountMicros: '1000000000',
        fxRateToAed: '3.6725',
        fundingAccountId: hishamId,
      },
      nov24,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordLoanRepayment',
        personAccountId: hishamId,
        entryDate: '2026-11-20',
        currency: 'USD',
        amountMicros: '1000000000',
        fxRateToAed: '3.70',
      },
      nov24,
    );

    const snap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov24,
    );
    expect(snap.balanceSheet.isBalanced).toBe(true);
    expect(snap.balanceSheet.imbalanceAedMicros).toBe('0');
    expect(snap.balanceSheet.totalCashAedMicros).toBe('0');
    expect(snap.balanceSheet.liabilitiesByPerson[0]?.balanceOwedAedMicros).toBe(
      '0',
    );
    expect(snap.profitAndLoss.fxGainLossAedMicros).toBe('-27500000'); // Real -27.50 AED FX loss

    // H10: P&L CSV keeps pure numeric -27.50 unprefixed (no leading apostrophe) while neutralizing formulas
    const pnlCsv = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'exportCsv',
        dataset: 'PNL',
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
      },
      nov24,
    );
    expect(String(pnlCsv.csv)).toContain('"-27.50"');
    expect(String(pnlCsv.csv)).not.toContain('"\'-27.50"');

    // Formula neutralization in Ledger CSV
    const cashUsd = snap.accounts.find((a) => a.code === 'CASH:USD')!;
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordExpenseOrAsset',
        entryKind: 'INDIRECT_EXPENSE',
        category: 'INDIRECT_OTHER',
        title: '=SUM(A1:A5)',
        entryDate: '2026-11-22',
        currency: 'USD',
        amountMicros: '10000000',
        fundingAccountId: cashUsd.id,
      },
      nov24,
    );
    const ledgerCsv = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'exportCsv',
        dataset: 'LEDGER',
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
      },
      nov24,
    );
    expect(String(ledgerCsv.csv)).toContain('"\'=SUM(A1:A5)"');

    // M17: Reject dueDate < issueDate, zero-total invoice, and out-of-month payroll entry
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'saveInvoice',
          clientName: 'Bad Date Co',
          currency: 'USD',
          issueDate: '2026-11-20',
          dueDate: '2026-11-10',
          lineItems: [
            {
              label: 'Work',
              quantity: '1',
              unitPriceMicros: '100000000',
              discountPercent: '0',
            },
          ],
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'saveInvoice',
          clientName: 'Zero Co',
          currency: 'USD',
          issueDate: '2026-11-20',
          dueDate: '2026-11-25',
          lineItems: [
            {
              label: 'Free',
              quantity: '1',
              unitPriceMicros: '100000000',
              discountPercent: '100',
            },
          ],
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);

    const payProfile = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePayrollProfile',
        employeeName: 'Arjun',
        currency: 'USD',
        baseSalaryMicros: '1000000000',
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 0, // H11: 0 paid leaves allowed
        payDayOfMonth: 5, // C2/HI-2: early-month payday settles BOTH base salary and adjustments next month on day 5
        fundingAccountId: cashUsd.id,
        active: true,
      },
      nov24,
    );
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'addPayrollEntry',
          profileId: String(payProfile.payrollProfileId),
          month: '2026-11',
          entryKind: 'LEAVE',
          days: '1',
          eventDate: '2026-10-15',
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);

    // HI-2: Early-month payday (day 5) must NOT settle 2026-11 base salary OR overtime on 2026-11-24;
    // BOTH must settle together on 2026-12-05!
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'addPayrollEntry',
        profileId: String(payProfile.payrollProfileId),
        month: '2026-11',
        entryKind: 'OVERTIME',
        days: '1',
        eventDate: '2026-11-18',
      },
      nov24,
    );
    const earlyRun = await service.runDueAutomationForWorkspace(
      workspace.id,
      adminMemberId,
      '2026-11-24',
    );
    expect(earlyRun.recurringExpensesPosted).toBe(0);
    expect(earlyRun.payrollAdjustmentsPosted).toBe(0);
    const dec5Run = await service.runDueAutomationForWorkspace(
      workspace.id,
      adminMemberId,
      '2026-12-05',
    );
    expect(dec5Run.recurringExpensesPosted).toBe(1);
    expect(dec5Run.payrollAdjustmentsPosted).toBe(1);
  });

  it('CR-3, HI-3, MD-3, MD-4, MD-5: enforces non-admin payroll isolation on ledger/recurring/mutations, preserves CSV sub-cent precision, guards SENT on email failure, validates tenant IDs, and skips uninitialized cron workspaces', async () => {
    const nov24 = new Date('2026-11-24T09:00:00Z');
    let actorIsAdmin = true;
    let actorCapabilities: string[] = [];

    const stores: StoreMap = new Map<unknown, Record<string, unknown>[]>([
      [DeliveryProjectEntity, []],
      [OtogrowAiSpendEntity, []],
      [DeliveryFinanceV2ProfileEntity, []],
      [DeliveryFinanceV2AccountEntity, []],
      [DeliveryFinanceV2JournalEntity, []],
      [DeliveryFinanceV2JournalLineEntity, []],
      [DeliveryFinanceV2RecurringExpenseEntity, []],
      [DeliveryFinanceV2PayrollProfileEntity, []],
      [DeliveryFinanceV2PayrollEntryEntity, []],
      [DeliveryFinanceV2QuoteEntity, []],
      [DeliveryFinanceV2InvoiceScheduleEntity, []],
      [DeliveryFinanceV2InvoiceEntity, []],
    ]);
    const manager = createInMemoryManager(stores);
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    } as unknown as DataSource;
    const delivery = {
      actor: jest.fn(async () => ({
        memberId: actorIsAdmin ? adminMemberId : staffMemberId,
        isAdmin: actorIsAdmin,
        isManager: actorIsAdmin,
        capabilities: actorCapabilities,
      })),
    } as unknown as DeliveryService;
    const access = {
      listActiveMembers: jest.fn(async () => [
        { memberId: adminMemberId, name: 'Amna' },
        { memberId: staffMemberId, name: 'Arjun' },
      ]),
    } as unknown as OtogrowAccessService;
    const storage = {
      getCurrentDriver: () => ({ writeFile: jest.fn(async () => undefined) }),
    } as unknown as FileStorageDriverFactory;
    const sendEmail = jest.fn(
      async (_mail: Record<string, unknown>) => undefined,
    );
    const service = new DeliveryFinanceV2Service(
      dataSource,
      delivery,
      access,
      storage,
      { send: sendEmail } as unknown as EmailService,
      {
        get: jest.fn(() => 'finance@otogrow.com'),
      } as unknown as TwentyConfigService,
    );

    // MD-5: Cron on an uninitialized workspace returns 0s and inserts ZERO profile/account rows
    const emptyCron = await service.runDueAutomationForWorkspace(
      workspace.id,
      adminMemberId,
      '2026-11-24',
    );
    expect(emptyCron).toEqual({
      recurringExpensesPosted: 0,
      payrollAdjustmentsPosted: 0,
      invoicesCreated: 0,
    });
    expect(stores.get(DeliveryFinanceV2ProfileEntity)?.length).toBe(0);
    expect(stores.get(DeliveryFinanceV2AccountEntity)?.length).toBe(0);

    // Admin initializes workspace & creates Arjun salary + 3 leaves (1 unpaid => 576.923077 deduction)
    const init = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {},
      nov24,
    );
    const cashInr = init.accounts.find((a) => a.code === 'CASH:INR')!;
    const payRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePayrollProfile',
        employeeMemberId: staffMemberId,
        employeeName: 'Arjun',
        currency: 'INR',
        baseSalaryMicros: '15000000000',
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 2,
        payDayOfMonth: 20,
        fundingAccountId: cashInr.id,
        startMonth: '2026-11',
        active: true,
      },
      nov24,
    );
    const recurringSalaryId = String(payRes.recurringExpenseId);
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'addPayrollEntry',
        profileId: String(payRes.payrollProfileId),
        month: '2026-11',
        entryKind: 'LEAVE',
        days: '3',
        eventDate: '2026-11-10',
      },
      nov24,
    );
    await service.runDueAutomationForWorkspace(
      workspace.id,
      adminMemberId,
      '2026-11-24',
    );

    // HI-3: Admin Payroll CSV preserves exact sub-cent precision so 15000.00 - 576.923077 = 14423.076923
    const payrollCsv = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'exportCsv', dataset: 'PAYROLL', payrollMonth: '2026-11' },
      nov24,
    );
    expect(String(payrollCsv.csv)).toContain('"576.923077"');
    expect(String(payrollCsv.csv)).toContain('"14423.076923"');

    // MD-4: Unknown projectId and unknown employeeMemberId rejected
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'saveQuote',
          clientName: 'Client',
          projectId: '99999999-9999-4999-8999-999999999999',
          currency: 'USD',
          issueDate: '2026-11-24',
          lineItems: [
            {
              label: 'Work',
              quantity: '1',
              unitPriceMicros: '100000000',
              discountPercent: '0',
            },
          ],
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'savePayrollProfile',
          employeeMemberId: '99999999-9999-4999-8999-999999999999',
          employeeName: 'Foreign Member',
          currency: 'INR',
          baseSalaryMicros: '10000000000',
          workingDaysPerMonth: 26,
          paidLeavesPerMonth: 2,
          payDayOfMonth: 28,
          fundingAccountId: cashInr.id,
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);

    // MD-3: If email dispatch fails, invoice must stay READY (never falsely stamped SENT)
    const invRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveInvoice',
        clientName: 'Mail Fail Co',
        clientEmail: 'ap@mailfail.co',
        currency: 'USD',
        issueDate: '2026-11-24',
        dueDate: '2026-11-30',
        lineItems: [
          {
            label: 'Retainer',
            quantity: '1',
            unitPriceMicros: '1000000000',
            discountPercent: '0',
          },
        ],
      },
      nov24,
    );
    sendEmail.mockRejectedValueOnce(new Error('SMTP offline'));
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        { action: 'sendInvoiceEmail', invoiceId: String(invRes.invoiceId) },
        nov24,
      ),
    ).rejects.toThrow('SMTP offline');
    const afterEmailFail = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {},
      nov24,
    );
    expect(
      afterEmailFail.invoices.find((i) => i.id === String(invRes.invoiceId))
        ?.status,
    ).toBe('READY');

    const payrollJournalId = afterEmailFail.journals.find(
      (j) => j.entryType === 'PAYROLL_BASE',
    )!.id;

    // CR-3: Switch to non-admin with BOTH finance.read & finance.manage ->
    // ZERO payroll salaries in recurringExpenses/journals/LEDGER CSV, and mutations on payroll blocked!
    actorIsAdmin = false;
    actorCapabilities = ['finance.read', 'finance.manage'];

    const nonAdminSnap = await service.snapshot(
      workspace,
      staffMemberId,
      userWorkspaceId,
      {},
      nov24,
    );
    expect(nonAdminSnap.canViewPayroll).toBe(false);
    expect(nonAdminSnap.recurringExpenses).toEqual([]);
    expect(nonAdminSnap.journals).toEqual([]);
    // M6: Admin analytics exposes payroll commitments & revenue; non-admin redacts payroll from commitments, P&L breakdown, PNL CSV, and payrollMonthRevenueAedMicros
    expect(
      afterEmailFail.analytics.upcomingCommitments30d.payrollAedMicros,
    ).not.toBeNull();
    expect(afterEmailFail.analytics.upcomingCommitments30d.windowEnd).toBe(
      '2026-12-23',
    ); // 30 inclusive days starting 2026-11-24
    expect(afterEmailFail.analytics.monthlyTrend).toHaveLength(6);
    expect(
      nonAdminSnap.analytics.upcomingCommitments30d.payrollAedMicros,
    ).toBeNull();
    expect(
      nonAdminSnap.analytics.upcomingCommitments30d.payrollCount,
    ).toBeNull();
    expect(nonAdminSnap.analytics.payrollMonthRevenueAedMicros).toBeNull();
    expect(
      nonAdminSnap.profitAndLoss.directBreakdown.some(
        (b) =>
          b.category === 'DIRECT_SALARY' || b.category.startsWith('PAYROLL_'),
      ),
    ).toBe(false);

    const nonAdminPnlCsv = await service.command(
      workspace,
      staffMemberId,
      userWorkspaceId,
      {
        action: 'exportCsv',
        dataset: 'PNL',
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
      },
      nov24,
    );
    expect(String(nonAdminPnlCsv.csv)).not.toContain('DIRECT_SALARY');

    const nonAdminLedgerCsv = await service.command(
      workspace,
      staffMemberId,
      userWorkspaceId,
      {
        action: 'exportCsv',
        dataset: 'LEDGER',
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
      },
      nov24,
    );
    expect(String(nonAdminLedgerCsv.csv)).not.toContain('Arjun');

    await expect(
      service.command(
        workspace,
        staffMemberId,
        userWorkspaceId,
        {
          action: 'setRecurringExpenseStatus',
          id: recurringSalaryId,
          status: 'PAUSED',
        },
        nov24,
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.command(
        workspace,
        staffMemberId,
        userWorkspaceId,
        {
          action: 'voidJournal',
          journalId: payrollJournalId,
          reason: 'Unauthorized void',
        },
        nov24,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('M7: preserves logo on profile patch, clears on empty string, rejects spoofed logos, enforces FX carrying-cost & overdraft extinguishment, RBAC locks, clientRequestId idempotency, and email race protection', async () => {
    const { service, stores, sendEmail } = setup();
    const nov24 = new Date('2026-11-24T09:00:00Z');

    const initial = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov24,
    );
    const cashUsd = initial.accounts.find((a) => a.code === 'CASH:USD')!;
    const cashAed = initial.accounts.find((a) => a.code === 'CASH:AED')!;

    // 1. Logo preservation vs explicit wipe vs spoofed rejection
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(25);
    ihdr.writeUInt32BE(13, 0);
    ihdr.write('IHDR', 4, 'ascii');
    ihdr.writeUInt32BE(120, 8);
    ihdr.writeUInt32BE(40, 12);
    const idat = Buffer.alloc(16);
    idat.writeUInt32BE(4, 0);
    idat.write('IDAT', 4, 'ascii');
    const iend = Buffer.alloc(12);
    iend.writeUInt32BE(0, 0);
    iend.write('IEND', 4, 'ascii');
    const validLogoUrl = `data:image/png;base64,${Buffer.concat([sig, ihdr, idat, iend]).toString('base64')}`;

    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveCompanyProfile',
        companyName: 'Otogrow LLC',
        logoDataUrl: validLogoUrl,
      },
      nov24,
    );
    // Saving profile without logoDataUrl must preserve existing logo
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveCompanyProfile',
        companyName: 'Otogrow Holdings LLC',
      },
      nov24,
    );
    let snap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov24,
    );
    expect(snap.profile.logoDataUrl).toBeNull();
    expect(snap.profile.hasLogo).toBe(true);
    expect(snap.profile.logoUpdatedAt).toBeTruthy();

    const downloadedLogo = await service.downloadCompanyLogo(
      workspace,
      adminMemberId,
      userWorkspaceId,
    );
    expect(downloadedLogo.mimeType).toBe('image/png');
    expect(
      downloadedLogo.buffer.equals(Buffer.concat([sig, ihdr, idat, iend])),
    ).toBe(true);
    expect(downloadedLogo.etag).toMatch(/^"[a-f0-9]{24}"$/);

    // Passing empty string clears logo
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveCompanyProfile',
        companyName: 'Otogrow Holdings LLC',
        logoDataUrl: '',
      },
      nov24,
    );
    snap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov24,
    );
    expect(snap.profile.logoDataUrl).toBeNull();
    expect(snap.profile.hasLogo).toBe(false);
    await expect(
      service.downloadCompanyLogo(workspace, adminMemberId, userWorkspaceId),
    ).rejects.toThrow(NotFoundException);

    // Spoofed logo rejected
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'saveCompanyProfile',
          companyName: 'Otogrow Holdings LLC',
          logoDataUrl: `data:image/png;base64,${Buffer.from('not-a-real-png-binary-payload-1234').toString('base64')}`,
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);

    // 2. FX convertCurrency ignores client fromFxRateToAed bypass & leaves exact 0 AED on full liquidation
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordOpeningBalance',
        kind: 'CASH',
        title: 'Opening USD',
        entryDate: '2026-11-01',
        currency: 'USD',
        amountMicros: '100000000', // $100 @ 3.60 = 360 AED
        fxRateToAed: '3.60',
      },
      nov24,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'convertCurrency',
        entryDate: '2026-11-02',
        fromCurrency: 'USD',
        fromAmountMicros: '100000000',
        fromFxRateToAed: '9.99', // must be ignored in favor of 3.60 carrying cost
        toCurrency: 'AED',
        toAmountMicros: '370000000', // 370 AED -> +10 AED FX gain
      },
      nov24,
    );
    snap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov24,
    );
    const usdBal = snap.balanceSheet.cashByCurrency.find(
      (c) => c.currency === 'USD',
    )!;
    expect(usdBal.originalMicros).toBe('0');
    expect(usdBal.aedMicros).toBe('0');
    expect(snap.balanceSheet.isBalanced).toBe(true);

    // Overdraw USD by $50 @ 3.70 (carries -$50 / -185 AED), then receive $50 via convertCurrency at 3.60 -> must extinguish exact -185 AED
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordExpenseOrAsset',
        entryKind: 'DIRECT_EXPENSE',
        entryDate: '2026-11-03',
        title: 'USD Overdraft Spend',
        category: 'DIRECT_SUBSCRIPTION',
        currency: 'USD',
        amountMicros: '50000000',
        fxRateToAed: '3.70',
        fundingAccountId: cashUsd.id,
      },
      nov24,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'convertCurrency',
        entryDate: '2026-11-04',
        fromCurrency: 'AED',
        fromAmountMicros: '180000000', // 180 AED
        toCurrency: 'USD',
        toAmountMicros: '50000000', // $50 -> extinguishes 185 AED overdraft (+5 AED FX gain)
        toFxRateToAed: '3.60',
      },
      nov24,
    );
    snap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov24,
    );
    const usdAfterOverdraftClear = snap.balanceSheet.cashByCurrency.find(
      (c) => c.currency === 'USD',
    )!;
    expect(usdAfterOverdraftClear.originalMicros).toBe('0');
    expect(usdAfterOverdraftClear.aedMicros).toBe('0');
    expect(snap.balanceSheet.isBalanced).toBe(true);

    // 3. clientRequestId idempotency on recordExpenseOrAsset & recordInvoicePayment (including final-payment retry)
    const expReqId = 'req-expense-idemp-001';
    const firstExp = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordExpenseOrAsset',
        entryKind: 'DIRECT_EXPENSE',
        entryDate: '2026-11-05',
        title: 'Idempotent Hosting Bill',
        category: 'DIRECT_SUBSCRIPTION',
        currency: 'AED',
        amountMicros: '100000000',
        fundingAccountId: cashAed.id,
        clientRequestId: expReqId,
      },
      nov24,
    );
    const retryExp = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordExpenseOrAsset',
        entryKind: 'DIRECT_EXPENSE',
        entryDate: '2026-11-05',
        title: 'Idempotent Hosting Bill',
        category: 'DIRECT_SUBSCRIPTION',
        currency: 'AED',
        amountMicros: '100000000',
        fundingAccountId: cashAed.id,
        clientRequestId: expReqId,
      },
      nov24,
    );
    expect(retryExp.idempotent).toBe(true);
    expect(retryExp.journalId).toBe(firstExp.journalId);

    const invRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveInvoice',
        clientName: 'Idemp Client',
        clientEmail: 'billing@idemp.example',
        currency: 'AED',
        issueDate: '2026-11-05',
        dueDate: '2026-11-20',
        lineItems: [
          {
            id: 'l1',
            label: 'Retainer',
            quantity: '1',
            unitPriceMicros: '500000000',
          },
        ],
      },
      nov24,
    );
    const invId = String(invRes.invoiceId);
    const payReqId = 'req-invoice-pay-001';
    const firstPay = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordInvoicePayment',
        invoiceId: invId,
        paymentDate: '2026-11-06',
        amountMicros: '500000000',
        clientRequestId: payReqId,
      },
      nov24,
    );
    // Retry after invoice is already PAID must succeed idempotently
    const retryPay = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordInvoicePayment',
        invoiceId: invId,
        paymentDate: '2026-11-06',
        amountMicros: '500000000',
        clientRequestId: payReqId,
      },
      nov24,
    );
    expect(retryPay.idempotent).toBe(true);
    expect(retryPay.journalId).toBe(firstPay.journalId);

    // 4. Non-admin RBAC blocks DIRECT_SALARY expense/recurring and runDueAutomation; future asOfDate rejected
    const nonAdminHarness = setup({
      isAdmin: false,
      capabilities: ['finance.read', 'finance.manage'],
    });
    const naSnap = await nonAdminHarness.service.snapshot(
      workspace,
      staffMemberId,
      userWorkspaceId,
      {},
      nov24,
    );
    const naCashAed = naSnap.accounts.find((a) => a.code === 'CASH:AED')!;
    await expect(
      nonAdminHarness.service.command(
        workspace,
        staffMemberId,
        userWorkspaceId,
        {
          action: 'recordExpenseOrAsset',
          entryKind: 'DIRECT_EXPENSE',
          entryDate: '2026-11-06',
          title: 'Sneaky Salary',
          category: 'DIRECT_SALARY',
          currency: 'AED',
          amountMicros: '100000000',
          fundingAccountId: naCashAed.id,
        },
        nov24,
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      nonAdminHarness.service.command(
        workspace,
        staffMemberId,
        userWorkspaceId,
        {
          action: 'saveRecurringExpense',
          expenseType: 'DIRECT_EXPENSE',
          title: 'Recurring Salary',
          category: 'DIRECT_SALARY',
          currency: 'AED',
          amountMicros: '100000000',
          fundingAccountId: naCashAed.id,
          dayOfMonth: 28,
          startMonth: '2026-11',
        },
        nov24,
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      nonAdminHarness.service.command(
        workspace,
        staffMemberId,
        userWorkspaceId,
        {
          action: 'runDueAutomation',
          asOfDate: '2026-11-24',
        },
        nov24,
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'runDueAutomation',
          asOfDate: '2026-12-31',
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);

    // 5. Concurrent email lock throws ConflictException & voided-before-send check aborts dispatch
    const inv2Res = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveInvoice',
        clientName: 'Race Client',
        clientEmail: 'race@client.example',
        currency: 'AED',
        issueDate: '2026-11-10',
        dueDate: '2026-11-25',
        lineItems: [
          {
            id: 'l2',
            label: 'Sprint',
            quantity: '1',
            unitPriceMicros: '250000000',
          },
        ],
      },
      nov24,
    );
    const inv2Id = String(inv2Res.invoiceId);
    let releaseFirstSend!: () => void;
    const sendStarted = new Promise<void>((resolve) => {
      sendEmail.mockImplementationOnce(async () => {
        resolve();
        await new Promise<void>((done) => {
          releaseFirstSend = done;
        });
      });
    });
    const firstSendPromise = service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'sendInvoiceEmail', invoiceId: inv2Id },
      nov24,
    );
    await sendStarted;
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        { action: 'sendInvoiceEmail', invoiceId: inv2Id },
        nov24,
      ),
    ).rejects.toThrow(ConflictException);
    releaseFirstSend();
    await firstSendPromise;

    // Voiding invoice prevents subsequent send
    const invoicesStore = stores.get(DeliveryFinanceV2InvoiceEntity) ?? [];
    const targetInv = invoicesStore.find((r) => r.id === inv2Id)!;
    targetInv.status = 'VOID';
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        { action: 'sendInvoiceEmail', invoiceId: inv2Id },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('M7 rework: extinguishes overdraft AED on PAYROLL_LEAVE_REDUCTION (H1), blocks PAYROLL_* category bypass (H2), rejects cumulative payroll overflow before bricking snapshot (H3), and prevents voided clientRequestId resurrection (M1)', async () => {
    const { service } = setup();
    const nov28 = new Date('2026-11-28T12:00:00Z');
    const initial = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov28,
    );
    const cashInr = initial.accounts.find((a) => a.code === 'CASH:INR')!;
    const cashAed = initial.accounts.find((a) => a.code === 'CASH:AED')!;

    // H1: Overdraw CASH:INR via payday base salary @ 0.044, then post 26-day unpaid leave reduction @ 0.045 -> exact 0 INR & 0 AED
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveExchangeRates',
        exchangeRates: { ...initial.profile.exchangeRates, INR: '0.044' },
      },
      nov28,
    );
    const ppRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePayrollProfile',
        employeeMemberId: staffMemberId,
        employeeName: 'Arjun',
        roleLabel: 'Engineer',
        currency: 'INR',
        baseSalaryMicros: '100000000000', // 100,000 INR
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 0,
        payDayOfMonth: 28,
        fundingAccountId: cashInr.id,
        startMonth: '2026-11',
      },
      nov28,
    );
    const profileId = String(ppRes.payrollProfileId);
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'runDueAutomation', asOfDate: '2026-11-28' },
      nov28,
    );
    // Add 26 unpaid leave days and post reduction at a different FX rate (0.045)
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'addPayrollEntry',
        profileId,
        month: '2026-11',
        entryKind: 'LEAVE',
        days: '26',
        eventDate: '2026-11-15',
        note: 'Full unpaid month',
      },
      nov28,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'postPayrollAdjustments',
        month: '2026-11',
        profileId,
        fxRateToAed: '0.045',
      },
      nov28,
    );
    const afterLeave = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov28,
    );
    const inrBal = afterLeave.balanceSheet.cashByCurrency.find(
      (c) => c.currency === 'INR',
    )!;
    expect(inrBal.originalMicros).toBe('0');
    expect(inrBal.aedMicros).toBe('0');
    expect(afterLeave.balanceSheet.isBalanced).toBe(true);

    // H3: Cumulative bonus overflow rejected on write without bricking snapshot
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'addPayrollEntry',
        profileId,
        month: '2026-12',
        entryKind: 'BONUS',
        bonusAmountMicros: '5000000000000000000', // 5e18
        eventDate: '2026-12-10',
        note: 'Bonus 1',
      },
      nov28,
    );
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'addPayrollEntry',
          profileId,
          month: '2026-12',
          entryKind: 'BONUS',
          bonusAmountMicros: '5000000000000000000', // +5e18 = 1e19 > 9e18
          eventDate: '2026-12-11',
          note: 'Bonus 2 overflow',
        },
        nov28,
      ),
    ).rejects.toThrow(BadRequestException);
    // Snapshot for 2026-12 remains healthy!
    const decSnap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { payrollMonth: '2026-12' },
      nov28,
    );
    expect(decSnap.payrollSummaries).toHaveLength(1);

    // M1: Voided journal is NOT resurrected when clientRequestId is retried
    const voidableReq = 'req-void-no-resurrect-01';
    const created = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordExpenseOrAsset',
        entryKind: 'DIRECT_EXPENSE',
        entryDate: '2026-11-20',
        title: 'Accidental Expense',
        category: 'DIRECT_SUBSCRIPTION',
        currency: 'AED',
        amountMicros: '100000000',
        fundingAccountId: cashAed.id,
        clientRequestId: voidableReq,
      },
      nov28,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'voidJournal',
        journalId: String(created.journalId),
        reason: 'Entered by mistake',
      },
      nov28,
    );
    const retryAfterVoid = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordExpenseOrAsset',
        entryKind: 'DIRECT_EXPENSE',
        entryDate: '2026-11-20',
        title: 'Accidental Expense',
        category: 'DIRECT_SUBSCRIPTION',
        currency: 'AED',
        amountMicros: '100000000',
        fundingAccountId: cashAed.id,
        clientRequestId: voidableReq,
      },
      nov28,
    );
    expect(retryAfterVoid.idempotent).toBe(true);
    expect(retryAfterVoid.journalId).toBe(created.journalId);

    // H2: Non-admin blocked from PAYROLL_BONUS & lowercase direct_salary variants
    const nonAdmin = setup({
      isAdmin: false,
      capabilities: ['finance.read', 'finance.manage'],
    });
    const naSnap = await nonAdmin.service.snapshot(
      workspace,
      staffMemberId,
      userWorkspaceId,
      {},
      nov28,
    );
    const naCashAed = naSnap.accounts.find((a) => a.code === 'CASH:AED')!;
    await expect(
      nonAdmin.service.command(
        workspace,
        staffMemberId,
        userWorkspaceId,
        {
          action: 'recordExpenseOrAsset',
          entryKind: 'DIRECT_EXPENSE',
          entryDate: '2026-11-20',
          title: 'Sneaky Bonus',
          category: 'PAYROLL_BONUS',
          currency: 'AED',
          amountMicros: '100000000',
          fundingAccountId: naCashAed.id,
        },
        nov28,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      nonAdmin.service.command(
        workspace,
        staffMemberId,
        userWorkspaceId,
        {
          action: 'recordExpenseOrAsset',
          entryKind: 'DIRECT_EXPENSE',
          entryDate: '2026-11-20',
          title: 'Sneaky Lowercase Salary',
          category: 'direct_salary',
          currency: 'AED',
          amountMicros: '100000000',
          fundingAccountId: naCashAed.id,
        },
        nov28,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('M8: blocks archiving a person liability with non-zero balance or active recurring expense and succeeds when settled', async () => {
    const { service } = setup();
    const nov24 = new Date('2026-11-24T10:00:00Z');

    await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov24,
    );

    const personRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePersonLiability',
        personName: 'Zara',
        personEmail: 'zara@otogrow.com',
        currency: 'USD',
      },
      nov24,
    );
    const zaraId = String(personRes.accountId);

    // Record $500 loan in from Zara
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordLoanIn',
        personAccountId: zaraId,
        entryDate: '2026-11-10',
        title: 'Seed advance from Zara',
        currency: 'USD',
        amountMicros: '500000000',
        fxRateToAed: '3.6725',
      },
      nov24,
    );

    // Archiving while $500 is still owed must fail
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'savePersonLiability',
          id: zaraId,
          personName: 'Zara',
          personEmail: 'zara@otogrow.com',
          currency: 'USD',
          active: false,
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);

    // Repay full $500 from Company Cash (USD)
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordLoanRepayment',
        personAccountId: zaraId,
        entryDate: '2026-11-12',
        title: 'Full repayment to Zara',
        currency: 'USD',
        amountMicros: '500000000',
        fxRateToAed: '3.6725',
      },
      nov24,
    );

    // Add an active recurring expense funded by Zara -> archiving must still fail
    const recRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveRecurringExpense',
        title: 'Zara card tool',
        expenseType: 'DIRECT_EXPENSE',
        category: 'DIRECT_SUBSCRIPTION',
        currency: 'USD',
        amountMicros: '25000000',
        dayOfMonth: 28,
        fundingAccountId: zaraId,
        startMonth: '2026-11',
      },
      nov24,
    );
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'savePersonLiability',
          id: zaraId,
          personName: 'Zara',
          personEmail: 'zara@otogrow.com',
          currency: 'USD',
          active: false,
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);

    // M8 rework High #1: editing name/email without currency preserves stored currency
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePersonLiability',
        id: zaraId,
        personName: 'Zara K',
        personEmail: 'zara.k@otogrow.com',
      },
      nov24,
    );
    const afterRename = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov24,
    );
    expect(afterRename.accounts.find((a) => a.id === zaraId)?.currency).toBe(
      'USD',
    );

    // M8 rework High #2: PAUSED recurring expense still blocks archiving
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'setRecurringExpenseStatus',
        id: String(recRes.recurringExpenseId),
        status: 'PAUSED',
      },
      nov24,
    );
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'savePersonLiability',
          id: zaraId,
          personName: 'Zara K',
          personEmail: 'zara.k@otogrow.com',
          active: false,
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);

    // Stop the recurring expense -> archiving succeeds
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'setRecurringExpenseStatus',
        id: String(recRes.recurringExpenseId),
        status: 'STOPPED',
      },
      nov24,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePersonLiability',
        id: zaraId,
        personName: 'Zara K',
        personEmail: 'zara.k@otogrow.com',
        active: false,
      },
      nov24,
    );

    const afterArchive = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov24,
    );
    expect(afterArchive.accounts.find((a) => a.id === zaraId)?.active).toBe(
      false,
    );

    // M8 rework High #2: archived person cannot receive new loans, opening liabilities, or resumed recurring expenses
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'recordLoanIn',
          personAccountId: zaraId,
          entryDate: '2026-11-15',
          currency: 'USD',
          amountMicros: '100000000',
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'recordOpeningBalance',
          kind: 'PERSON_LIABILITY',
          title: 'Archived person opening',
          entryDate: '2026-11-15',
          currency: 'USD',
          amountMicros: '100000000',
          personAccountId: zaraId,
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'setRecurringExpenseStatus',
          id: String(recRes.recurringExpenseId),
          status: 'ACTIVE',
        },
        nov24,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('M9: enforces payroll days 29-31 delta catch-up, base-salary-before-leave-reduction guard, explicit payTiming/startMonth, and duplicate/paidLeaves guards', async () => {
    const { service } = setup();
    const nov28 = new Date('2026-11-28T12:00:00Z');
    const initial = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov28,
    );
    const cashAed = initial.accounts.find((a) => a.code === 'CASH:AED')!;

    // 1. paidLeavesPerMonth > workingDaysPerMonth rejected
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'savePayrollProfile',
          employeeMemberId: staffMemberId,
          employeeName: 'Arjun',
          roleLabel: 'Editor',
          currency: 'AED',
          baseSalaryMicros: '10000000000',
          workingDaysPerMonth: 20,
          paidLeavesPerMonth: 21,
          payDayOfMonth: 28,
          fundingAccountId: cashAed.id,
          startMonth: '2026-11',
        },
        nov28,
      ),
    ).rejects.toThrow(BadRequestException);

    // 2. Create profile with explicit payTiming = SAME_MONTH even on day 5
    const profRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePayrollProfile',
        employeeMemberId: staffMemberId,
        employeeName: 'Arjun',
        roleLabel: 'Editor',
        currency: 'AED',
        baseSalaryMicros: '26000000000', // 26,000 AED => 1,000 AED/day
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 0,
        payDayOfMonth: 28,
        payTiming: 'SAME_MONTH',
        fundingAccountId: cashAed.id,
        startMonth: '2026-11',
      },
      nov28,
    );
    const profileId = String(profRes.payrollProfileId);

    // 3. Duplicate active profile for same employeeMemberId rejected
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'savePayrollProfile',
          employeeMemberId: staffMemberId,
          employeeName: 'Arjun Duplicate',
          roleLabel: 'Editor',
          currency: 'AED',
          baseSalaryMicros: '10000000000',
          workingDaysPerMonth: 26,
          paidLeavesPerMonth: 0,
          payDayOfMonth: 28,
          fundingAccountId: cashAed.id,
          startMonth: '2026-11',
        },
        nov28,
      ),
    ).rejects.toThrow(BadRequestException);

    // 4. Editing profile preserves startMonth when omitted and updates when provided
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePayrollProfile',
        id: profileId,
        employeeMemberId: staffMemberId,
        employeeName: 'Arjun',
        roleLabel: 'Senior Editor',
        currency: 'AED',
        baseSalaryMicros: '26000000000',
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 0,
        payDayOfMonth: 28,
        fundingAccountId: cashAed.id,
      },
      nov28,
    );
    let snap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      nov28,
    );
    expect(snap.payrollProfiles[0].startMonth).toBe('2026-11');
    expect(snap.payrollProfiles[0].payTiming).toBe('SAME_MONTH');

    // 5. Log 1 unpaid leave day BEFORE base salary is posted -> manual postPayrollAdjustments rejects
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'addPayrollEntry',
        profileId,
        month: '2026-11',
        entryKind: 'LEAVE',
        days: '1',
        eventDate: '2026-11-10',
        note: 'Unpaid day 1',
      },
      nov28,
    );
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'postPayrollAdjustments',
          profileId,
          month: '2026-11',
        },
        nov28,
      ),
    ).rejects.toThrow(BadRequestException);

    // 6. Run automation on payday (Nov 28): posts base salary (26,000) + leave reduction (1,000)
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'runDueAutomation', asOfDate: '2026-11-28' },
      nov28,
    );

    // 7. Log late overtime on Nov 29 + additional leave on Nov 30 AFTER payday
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'addPayrollEntry',
        profileId,
        month: '2026-11',
        entryKind: 'LEAVE',
        days: '1',
        eventDate: '2026-11-30',
        note: 'Late month leave',
      },
      new Date('2026-11-30T12:00:00Z'),
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'addPayrollEntry',
        profileId,
        month: '2026-11',
        entryKind: 'OVERTIME',
        days: '1',
        eventDate: '2026-11-29',
        note: 'Late month overtime',
      },
      new Date('2026-11-30T12:00:00Z'),
    );

    // Automation run on Nov 30 posts ONLY the catch-up deltas (+1,000 leave reduction, +1,000 overtime)
    const catchup = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'runDueAutomation', asOfDate: '2026-11-30' },
      new Date('2026-11-30T12:00:00Z'),
    );
    expect(catchup.payrollAdjustmentsPosted).toBe(2);

    // Re-running automation is idempotent (0 new postings)
    const noop = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'runDueAutomation', asOfDate: '2026-11-30' },
      new Date('2026-11-30T12:00:00Z'),
    );
    expect(noop.payrollAdjustmentsPosted).toBe(0);

    snap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      new Date('2026-11-30T12:00:00Z'),
    );
    // Net Direct Expense = 26,000 base - 1,000 leave - 1,000 delta leave + 1,000 overtime = 25,000 AED
    expect(snap.profitAndLoss.directExpenseAedMicros).toBe('25000000000');
    expect(snap.balanceSheet.isBalanced).toBe(true);
  });

  it('M9: supports multi-month automation catch-up, timezone today boundary, period lock + reverseJournal (with invoice reopen), and non-admin pagination', async () => {
    const { service, stores } = setup();
    // 2026-11-30T21:00:00Z is 2026-12-01 in Asia/Dubai (+04:00)
    const lateNovUtc = new Date('2026-11-30T21:00:00Z');
    const dubaiSnap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {},
      lateNovUtc,
    );
    expect(dubaiSnap.profile.timezone).toBe('Asia/Dubai');
    expect(dubaiSnap.today).toBe('2026-12-01');

    // Switch workspace timezone to UTC -> today becomes 2026-11-30
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveCompanyProfile',
        companyName: 'Otogrow Global',
        timezone: 'UTC',
      },
      lateNovUtc,
    );
    const utcSnap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {},
      lateNovUtc,
    );
    expect(utcSnap.profile.timezone).toBe('UTC');
    expect(utcSnap.today).toBe('2026-11-30');

    const cashAed = utcSnap.accounts.find((a) => a.code === 'CASH:AED')!;

    // 1. Multi-month catch-up (3 months: Aug, Sep, Oct, Nov)
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveRecurringExpense',
        title: 'Cloud Hosting',
        expenseType: 'INDIRECT_EXPENSE',
        category: 'INDIRECT_SOFTWARE',
        currency: 'AED',
        amountMicros: '100000000', // 100 AED
        dayOfMonth: 10,
        fundingAccountId: cashAed.id,
        startMonth: '2026-08',
      },
      lateNovUtc,
    );
    const autoRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'runDueAutomation', asOfDate: '2026-11-30' },
      lateNovUtc,
    );
    expect(autoRes.recurringExpensesPosted).toBe(4);

    // 2. Invoice payment -> Period lock blocks void & backdated post -> reverseJournal reopens invoice & balances books
    const invRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveInvoice',
        clientName: 'Acme Corp',
        clientEmail: 'billing@acme.com',
        currency: 'AED',
        issueDate: '2026-11-01',
        dueDate: '2026-11-15',
        lineItems: [
          {
            label: 'Retainer',
            quantity: '1',
            unitPriceMicros: '5000000000',
            discountPercent: '0',
          },
        ],
      },
      lateNovUtc,
    );
    const invoiceId = String(invRes.invoiceId);
    const payRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordInvoicePayment',
        invoiceId,
        paymentDate: '2026-11-10',
        amountMicros: '5000000000',
      },
      lateNovUtc,
    );
    const payJournalId = String(payRes.journalId);

    // Lock books through 2026-11-15
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'setPeriodLock',
        lockedThroughDate: '2026-11-15',
      },
      lateNovUtc,
    );

    // Backdated expense on 2026-11-15 rejected
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'recordExpenseOrAsset',
          entryKind: 'INDIRECT_EXPENSE',
          category: 'INDIRECT_OFFICE',
          title: 'Backdated expense',
          entryDate: '2026-11-15',
          currency: 'AED',
          amountMicros: '50000000',
          fundingAccountId: cashAed.id,
        },
        lateNovUtc,
      ),
    ).rejects.toThrow(BadRequestException);

    // Voiding payment inside locked period rejected
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'voidJournal',
          journalId: payJournalId,
          reason: 'Bounced',
        },
        lateNovUtc,
      ),
    ).rejects.toThrow(BadRequestException);

    // Reversing in an open date (2026-11-20) succeeds, reopens invoice, and blocks double-reversal
    const revRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'reverseJournal',
        journalId: payJournalId,
        reversalDate: '2026-11-20',
        reason: 'Payment recalled by bank',
      },
      lateNovUtc,
    );
    const revJournalId = String(revRes.journalId);
    expect(revRes.reversalOfJournalId).toBe(payJournalId);

    // Voiding a REVERSAL journal is permanently blocked
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'voidJournal',
          journalId: revJournalId,
          reason: 'Try voiding reversal',
        },
        lateNovUtc,
      ),
    ).rejects.toThrow(BadRequestException);

    // Double-reversal is blocked
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'reverseJournal',
          journalId: payJournalId,
          reversalDate: '2026-11-21',
          reason: 'Duplicate reversal attempt',
        },
        lateNovUtc,
      ),
    ).rejects.toThrow(BadRequestException);

    const afterRev = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      lateNovUtc,
    );
    expect(afterRev.balanceSheet.isBalanced).toBe(true);
    expect(afterRev.profitAndLoss.revenueAedMicros).toBe('0');
    const reopenedInv = afterRev.invoices.find((i) => i.id === invoiceId)!;
    expect(reopenedInv.paidMicros).toBe('0');
    expect(reopenedInv.status).toBe('READY');
    expect(reopenedInv.payments?.[0]?.reversed).toBe(true);
    expect(
      afterRev.journals.find((j) => j.id === payJournalId)?.isReversed,
    ).toBe(true);

    // Even after unlocking the period, voiding an already-reversed journal is blocked
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'setPeriodLock', lockedThroughDate: null },
      lateNovUtc,
    );
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'voidJournal',
          journalId: payJournalId,
          reason: 'Try voiding already-reversed journal',
        },
        lateNovUtc,
      ),
    ).rejects.toThrow(BadRequestException);

    // Locked-period payroll entry mutations and duplicate payroll reactivation via recurring status are blocked
    const payProf1 = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePayrollProfile',
        employeeMemberId: staffMemberId,
        employeeName: 'Arjun',
        roleLabel: 'Editor',
        currency: 'AED',
        baseSalaryMicros: '5000000000',
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 2,
        payDayOfMonth: 10,
        payTiming: 'SAME_MONTH',
        fundingAccountId: cashAed.id,
        startMonth: '2026-10',
      },
      lateNovUtc,
    );
    const prof1Id = String(payProf1.payrollProfileId);
    const rec1Id = String(payProf1.recurringExpenseId);

    // Lock through 2026-11-15 -> 2026-11 SAME_MONTH payday (2026-11-10) is locked -> addPayrollEntry rejected
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'setPeriodLock', lockedThroughDate: '2026-11-15' },
      lateNovUtc,
    );
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'addPayrollEntry',
          profileId: prof1Id,
          month: '2026-11',
          entryKind: 'OVERTIME',
          days: '1',
          eventDate: '2026-11-05',
          note: 'Late entry into closed payroll period',
        },
        lateNovUtc,
      ),
    ).rejects.toThrow(BadRequestException);

    // Pause prof1 -> create prof2 for same member -> reactivating prof1 via setRecurringExpenseStatus must fail
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'setRecurringExpenseStatus',
        id: rec1Id,
        status: 'PAUSED',
      },
      lateNovUtc,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePayrollProfile',
        employeeMemberId: staffMemberId,
        employeeName: 'Arjun V2',
        roleLabel: 'Senior Editor',
        currency: 'AED',
        baseSalaryMicros: '6000000000',
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 2,
        payDayOfMonth: 28,
        payTiming: 'SAME_MONTH',
        fundingAccountId: cashAed.id,
        startMonth: '2026-11',
      },
      lateNovUtc,
    );
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'setRecurringExpenseStatus',
          id: rec1Id,
          status: 'ACTIVE',
        },
        lateNovUtc,
      ),
    ).rejects.toThrow(BadRequestException);

    // 3. Non-admin SQL pagination: 510 payroll journals must not hide non-payroll journals
    const journalList = stores.get(DeliveryFinanceV2JournalEntity)!;
    for (let i = 0; i < 510; i++) {
      journalList.push({
        id: `payroll-pad-${i}`,
        workspaceId: workspace.id,
        entryDate: '2026-11-29',
        entryType: 'PAYROLL_BONUS',
        category: 'PAYROLL_BONUS',
        title: `Bonus ${i}`,
        notes: '',
        currency: 'AED',
        amountMicros: '1000000',
        fxRateToAed: '1',
        aedAmountMicros: '1000000',
        fundingAccountId: cashAed.id,
        targetAccountId: null,
        projectId: null,
        employeeMemberId: staffMemberId,
        receiptUrl: null,
        sourceRefType: null,
        sourceRefId: null,
        status: 'POSTED',
        reversalOfJournalId: null,
        createdBy: adminMemberId,
        voidedBy: null,
        voidedAt: null,
        voidReason: null,
        createdAt: new Date('2026-11-29T00:00:00Z'),
        updatedAt: new Date('2026-11-29T00:00:00Z'),
      });
    }
    const nonAdminSetup = setup({
      isAdmin: false,
      capabilities: ['finance.read', 'finance.manage'],
    });
    // Share the populated stores with the non-admin service instance
    for (const [key, value] of stores.entries()) {
      nonAdminSetup.stores.set(key, value);
    }
    const nonAdminSnap = await nonAdminSetup.service.snapshot(
      workspace,
      staffMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-30' },
      lateNovUtc,
    );
    expect(nonAdminSnap.canViewPayroll).toBe(false);
    expect(
      nonAdminSnap.journals.some((j) => j.title.includes('Cloud Hosting')),
    ).toBe(true);
    expect(
      nonAdminSnap.journals.some((j) => j.entryType === 'PAYROLL_BONUS'),
    ).toBe(false);
  });

  it('Recurring bills current-month expensing: manual post, create+expense, cron deduplication, void/reverse repost & privacy guards', async () => {
    const { service, stores } = setup({ isAdmin: true });
    const nov26Utc = new Date('2026-11-26T10:00:00Z');
    const initialSnap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nov26Utc,
    );
    const cashUsd = initialSnap.accounts.find((a) => a.code === 'CASH:USD')!;
    const cashAed = initialSnap.accounts.find((a) => a.code === 'CASH:AED')!;

    // Seed opening cash balances so carrying AED outflow is deterministic
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordOpeningBalance',
        kind: 'CASH',
        title: 'Opening USD Cash',
        entryDate: '2026-11-01',
        currency: 'USD',
        amountMicros: '10000000000',
        fxRateToAed: '3.6725',
      },
      nov26Utc,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordOpeningBalance',
        kind: 'CASH',
        title: 'Opening AED Cash',
        entryDate: '2026-11-01',
        currency: 'AED',
        amountMicros: '20000000000',
      },
      nov26Utc,
    );

    // 1. Add recurring bill scheduled later this month (day 28 > Nov 26)
    const createdBill = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveRecurringExpense',
        title: 'Adobe Creative Cloud',
        expenseType: 'DIRECT_EXPENSE',
        category: 'DIRECT_SUBSCRIPTION',
        currency: 'USD',
        amountMicros: '100000000',
        dayOfMonth: 28,
        fundingAccountId: cashUsd.id,
        startMonth: '2026-11',
        notes: 'Team design suite',
      },
      nov26Utc,
    );
    const adobeId = String(createdBill.recurringExpenseId);

    const beforeExpenseSnap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nov26Utc,
    );
    const adobeBefore = beforeExpenseSnap.recurringExpenses.find(
      (r) => r.id === adobeId,
    )!;
    expect(adobeBefore.currentMonthStatus).toBe('NOT_POSTED');
    expect(adobeBefore.currentMonthEntryDate).toBeNull();
    expect(
      beforeExpenseSnap.analytics.upcomingCommitments30d.recurringExpenseCount,
    ).toBe(1);

    // 2. Expense it for the current month right now (default date clamps Nov 28 -> today Nov 26)
    const expensed = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'expenseRecurringForMonth',
        id: adobeId,
      },
      nov26Utc,
    );
    expect(expensed.ok).toBe(true);
    expect(expensed.month).toBe('2026-11');
    expect(expensed.entryDate).toBe('2026-11-26');
    const firstJournalId = String(expensed.journalId);

    const afterExpenseSnap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nov26Utc,
    );
    const adobeAfter = afterExpenseSnap.recurringExpenses.find(
      (r) => r.id === adobeId,
    )!;
    expect(adobeAfter.currentMonthStatus).toBe('POSTED');
    expect(adobeAfter.currentMonthEntryDate).toBe('2026-11-26');
    expect(adobeAfter.currentMonthJournalId).toBe(firstJournalId);
    expect(afterExpenseSnap.balanceSheet.isBalanced).toBe(true);
    expect(afterExpenseSnap.profitAndLoss.directExpenseAedMicros).toBe(
      '367250000',
    );
    expect(
      afterExpenseSnap.analytics.upcomingCommitments30d.recurringExpenseCount,
    ).toBe(0);

    // 3. Running due automation on Nov 30 must NOT double-post Adobe for 2026-11
    const autoAfter = await service.runDueAutomationForWorkspace(
      workspace.id,
      adminMemberId,
      '2026-11-30',
    );
    expect(autoAfter.recurringExpensesPosted).toBe(0);

    // 4. Duplicate manual expenseRecurringForMonth must throw ConflictException
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        { action: 'expenseRecurringForMonth', id: adobeId },
        nov26Utc,
      ),
    ).rejects.toThrow(ConflictException);

    // 5. Voiding the posted entry marks currentMonthStatus = VOID; cron skips it; manual re-expense works
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'voidJournal',
        journalId: firstJournalId,
        reason: 'Adjusting amount',
      },
      nov26Utc,
    );
    const afterVoidSnap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nov26Utc,
    );
    expect(
      afterVoidSnap.recurringExpenses.find((r) => r.id === adobeId)
        ?.currentMonthStatus,
    ).toBe('VOID');
    const autoAfterVoid = await service.runDueAutomationForWorkspace(
      workspace.id,
      adminMemberId,
      '2026-11-30',
    );
    expect(autoAfterVoid.recurringExpensesPosted).toBe(0);

    const reExpensed = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'expenseRecurringForMonth',
        id: adobeId,
        entryDate: '2026-11-25',
      },
      nov26Utc,
    );
    expect(reExpensed.entryDate).toBe('2026-11-25');

    // 6. saveRecurringExpense with expenseCurrentMonth: true atomically creates & posts current month
    const createAndExpense = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveRecurringExpense',
        title: 'Office Rent',
        expenseType: 'INDIRECT_EXPENSE',
        category: 'INDIRECT_OFFICE',
        currency: 'AED',
        amountMicros: '5000000000',
        dayOfMonth: 5,
        fundingAccountId: cashAed.id,
        startMonth: '2026-11',
        expenseCurrentMonth: true,
        entryDate: '2026-11-05',
      },
      nov26Utc,
    );
    const rentId = String(createAndExpense.recurringExpenseId);
    const rentJournalId = String(createAndExpense.journalId);
    expect(createAndExpense.expensedMonth).toBe('2026-11');
    expect(createAndExpense.entryDate).toBe('2026-11-05');

    // Reject expenseCurrentMonth on edit
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'saveRecurringExpense',
          id: rentId,
          title: 'Office Rent',
          expenseType: 'INDIRECT_EXPENSE',
          category: 'INDIRECT_OFFICE',
          currency: 'AED',
          amountMicros: '5000000000',
          dayOfMonth: 5,
          fundingAccountId: cashAed.id,
          startMonth: '2026-11',
          expenseCurrentMonth: true,
        },
        nov26Utc,
      ),
    ).rejects.toThrow(BadRequestException);

    // 7. Period lock + reversal -> currentMonthStatus = REVERSED -> manual repost uses :REPOST: safely
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'setPeriodLock', lockedThroughDate: '2026-11-15' },
      nov26Utc,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'reverseJournal',
        journalId: rentJournalId,
        reversalDate: '2026-11-20',
        reason: 'Wrong amount in locked period',
      },
      nov26Utc,
    );
    const afterReverseSnap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nov26Utc,
    );
    expect(
      afterReverseSnap.recurringExpenses.find((r) => r.id === rentId)
        ?.currentMonthStatus,
    ).toBe('REVERSED');

    // Locked entryDate is rejected; default entryDate shifts safely to today (2026-11-26)
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'expenseRecurringForMonth',
          id: rentId,
          entryDate: '2026-11-10',
        },
        nov26Utc,
      ),
    ).rejects.toThrow(BadRequestException);

    const repostedRent = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'expenseRecurringForMonth',
        id: rentId,
      },
      nov26Utc,
    );
    expect(repostedRent.entryDate).toBe('2026-11-26');
    const repostedJournal = stores
      .get(DeliveryFinanceV2JournalEntity)!
      .find((j) => j.id === repostedRent.journalId);
    expect(String(repostedJournal?.sourceRefId)).toContain(
      `${rentId}:2026-11:REPOST:`,
    );

    // 8. Guards: paused rule, future startMonth, future entryDate, and non-admin payroll privacy
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'setRecurringExpenseStatus', id: adobeId, status: 'PAUSED' },
      nov26Utc,
    );
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        { action: 'expenseRecurringForMonth', id: adobeId },
        nov26Utc,
      ),
    ).rejects.toThrow(BadRequestException);

    const futureRule = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveRecurringExpense',
        title: 'Next Month Tool',
        expenseType: 'DIRECT_EXPENSE',
        category: 'DIRECT_SUBSCRIPTION',
        currency: 'AED',
        amountMicros: '100000000',
        dayOfMonth: 1,
        fundingAccountId: cashAed.id,
        startMonth: '2026-12',
      },
      nov26Utc,
    );
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'expenseRecurringForMonth',
          id: String(futureRule.recurringExpenseId),
        },
        nov26Utc,
      ),
    ).rejects.toThrow(BadRequestException);

    // Payroll privacy: non-admin finance.manage cannot expense a payroll-linked salary rule
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePayrollProfile',
        employeeMemberId: staffMemberId,
        employeeName: 'Arjun',
        roleLabel: 'Editor',
        currency: 'AED',
        baseSalaryMicros: '5000000000',
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 2,
        payDayOfMonth: 28,
        payTiming: 'SAME_MONTH',
        fundingAccountId: cashAed.id,
        startMonth: '2026-11',
      },
      nov26Utc,
    );
    const salaryRule = stores
      .get(DeliveryFinanceV2RecurringExpenseEntity)!
      .find((r) => r.employeeMemberId === staffMemberId)!;
    const nonAdminSetup = setup({
      isAdmin: false,
      capabilities: ['finance.read', 'finance.manage'],
    });
    for (const [key, value] of stores.entries()) {
      nonAdminSetup.stores.set(key, value);
    }
    await expect(
      nonAdminSetup.service.command(
        workspace,
        staffMemberId,
        userWorkspaceId,
        {
          action: 'expenseRecurringForMonth',
          id: String(salaryRule.id),
        },
        nov26Utc,
      ),
    ).rejects.toThrow(ForbiddenException);

    const finalSnap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nov26Utc,
    );
    expect(finalSnap.balanceSheet.isBalanced).toBe(true);
  });

  it('Recurring bills hardening: FOLLOWING_MONTH payroll, clientRequestId idempotency, FX spread, activity privacy, fully-locked month & multi-repost cycle', async () => {
    const activityMock = recordOtogrowActivity as jest.Mock;
    activityMock.mockClear();

    const { service, stores } = setup({ isAdmin: true });
    const dec03Utc = new Date('2026-12-03T10:00:00Z');
    const dec10Utc = new Date('2026-12-10T10:00:00Z');
    const baseSnap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-12-01', toDate: '2026-12-31', asOfDate: '2026-12-03' },
      dec03Utc,
    );
    const cashUsd = baseSnap.accounts.find((a) => a.code === 'CASH:USD')!;
    const cashAed = baseSnap.accounts.find((a) => a.code === 'CASH:AED')!;

    // Seed USD cash at book carrying rate 3.6000 AED/USD
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordOpeningBalance',
        kind: 'CASH',
        title: 'Opening USD',
        entryDate: '2026-11-01',
        currency: 'USD',
        amountMicros: '10000000000',
        fxRateToAed: '3.6000',
      },
      dec03Utc,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordOpeningBalance',
        kind: 'CASH',
        title: 'Opening AED',
        entryDate: '2026-11-01',
        currency: 'AED',
        amountMicros: '50000000000',
      },
      dec03Utc,
    );

    // 1. FOLLOWING_MONTH payroll rule (startMonth 2026-10, payDay 5) on Dec 3 targets service month 2026-11
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePayrollProfile',
        employeeMemberId: staffMemberId,
        employeeName: 'Arjun',
        roleLabel: 'Editor',
        currency: 'AED',
        baseSalaryMicros: '5000000000',
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 2,
        payDayOfMonth: 5,
        payTiming: 'FOLLOWING_MONTH',
        fundingAccountId: cashAed.id,
        startMonth: '2026-10',
      },
      dec03Utc,
    );
    const arjunRule = stores
      .get(DeliveryFinanceV2RecurringExpenseEntity)!
      .find((r) => r.employeeMemberId === staffMemberId)!;
    const arjunRuleId = String(arjunRule.id);

    const dec03Snap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-12-01', toDate: '2026-12-31', asOfDate: '2026-12-03' },
      dec03Utc,
    );
    const arjunSnapBefore = dec03Snap.recurringExpenses.find(
      (r) => r.id === arjunRuleId,
    )!;
    expect(arjunSnapBefore.payTiming).toBe('FOLLOWING_MONTH');
    expect(arjunSnapBefore.currentMonthTargetMonth).toBe('2026-11');
    expect(arjunSnapBefore.currentMonthStatus).toBe('NOT_POSTED');

    // Explicitly passing month='2026-12' on Dec 3 (settles 2027-01) must fail to avoid cross-month split
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'expenseRecurringForMonth',
          id: arjunRuleId,
          month: '2026-12',
          entryDate: '2026-12-03',
        },
        dec03Utc,
      ),
    ).rejects.toThrow(BadRequestException);

    // Default expenseRecurringForMonth on Dec 3 posts service month 2026-11 on 2026-12-03 and suppresses activity log
    activityMock.mockClear();
    const arjunPosted = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'expenseRecurringForMonth',
        id: arjunRuleId,
      },
      dec03Utc,
    );
    expect(arjunPosted.month).toBe('2026-11');
    expect(arjunPosted.entryDate).toBe('2026-12-03');
    expect(activityMock).not.toHaveBeenCalled();

    // Seed Oct salary so cron on Dec 5 only checks Nov (already posted -> 0 new recurring expenses)
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'expenseRecurringForMonth',
        id: arjunRuleId,
        month: '2026-10',
        entryDate: '2026-11-05',
      },
      dec03Utc,
    );
    const dec05Cron = await service.runDueAutomationForWorkspace(
      workspace.id,
      adminMemberId,
      '2026-12-05',
    );
    expect(dec05Cron.recurringExpensesPosted).toBe(0);

    // On Dec 10, snapshot still shows Arjun as POSTED (2026-12-03), never false NOT_POSTED
    const dec10Snap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-12-01', toDate: '2026-12-31', asOfDate: '2026-12-10' },
      dec10Utc,
    );
    const arjunSnapAfter = dec10Snap.recurringExpenses.find(
      (r) => r.id === arjunRuleId,
    )!;
    expect(arjunSnapAfter.currentMonthTargetMonth).toBe('2026-11');
    expect(arjunSnapAfter.currentMonthStatus).toBe('POSTED');
    expect(arjunSnapAfter.currentMonthEntryDate).toBe('2026-12-03');

    // New FOLLOWING_MONTH salary starting 2026-12 has targetMonth 2026-11 < startMonth -> rejected on Dec 3
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'savePayrollProfile',
        employeeName: 'Future Starter',
        roleLabel: 'Designer',
        currency: 'AED',
        baseSalaryMicros: '3000000000',
        workingDaysPerMonth: 26,
        paidLeavesPerMonth: 2,
        payDayOfMonth: 5,
        payTiming: 'FOLLOWING_MONTH',
        fundingAccountId: cashAed.id,
        startMonth: '2026-12',
      },
      dec03Utc,
    );
    const starterRule = stores
      .get(DeliveryFinanceV2RecurringExpenseEntity)!
      .find((r) => r.employeeName === 'Future Starter')!;
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        { action: 'expenseRecurringForMonth', id: String(starterRule.id) },
        dec03Utc,
      ),
    ).rejects.toThrow(BadRequestException);

    // 2. saveRecurringExpense clientRequestId idempotency + FX carrying-cost spread + activity log
    activityMock.mockClear();
    const createPayload = {
      action: 'saveRecurringExpense' as const,
      title: 'AWS Cloud',
      expenseType: 'DIRECT_EXPENSE' as const,
      category: 'DIRECT_SUBSCRIPTION',
      currency: 'USD' as const,
      amountMicros: '100000000', // $100
      dayOfMonth: 1,
      fundingAccountId: cashUsd.id,
      startMonth: '2026-12',
      expenseCurrentMonth: true,
      entryDate: '2026-12-03',
      fxRateToAed: '3.8000', // book carrying rate is 3.6000 -> 20 AED FX spread
      clientRequestId: 'rec-req-aws-2026-12-001',
    };
    const awsFirst = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      createPayload,
      dec03Utc,
    );
    expect(awsFirst.expensedMonth).toBe('2026-12');
    expect(activityMock).toHaveBeenCalledTimes(1);

    // Retry with identical clientRequestId returns idempotent: true without duplicating rule or journal
    const awsRetry = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      createPayload,
      dec03Utc,
    );
    expect(awsRetry.idempotent).toBe(true);
    expect(awsRetry.recurringExpenseId).toBe(awsFirst.recurringExpenseId);
    expect(awsRetry.journalId).toBe(awsFirst.journalId);
    const awsRulesCount = stores
      .get(DeliveryFinanceV2RecurringExpenseEntity)!
      .filter((r) => r.title === 'AWS Cloud').length;
    expect(awsRulesCount).toBe(1);

    // Verify FX carrying-cost spread (380 AED expense, 360 AED cash outflow, 20 AED FX gain)
    const awsLines = stores
      .get(DeliveryFinanceV2JournalLineEntity)!
      .filter((l) => l.journalId === awsFirst.journalId);
    expect(awsLines.length).toBe(3);
    const totalDebits = awsLines.reduce(
      (sum, l) => sum + BigInt(String(l.debitAedMicros)),
      BigInt('0'),
    );
    const totalCredits = awsLines.reduce(
      (sum, l) => sum + BigInt(String(l.creditAedMicros)),
      BigInt('0'),
    );
    expect(totalDebits).toBe(BigInt('380000000'));
    expect(totalCredits).toBe(BigInt('380000000'));

    // Voiding AWS journal then retrying original clientRequestId must NOT resurrect the voided journal
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'voidJournal',
        journalId: String(awsFirst.journalId),
        reason: 'Void test',
      },
      dec03Utc,
    );
    const awsRetryAfterVoid = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      createPayload,
      dec03Utc,
    );
    expect(awsRetryAfterVoid.idempotent).toBe(true);
    expect(awsRetryAfterVoid.journalId).toBeUndefined();

    // 3. Non-linked DIRECT_SALARY rule: activity suppressed for admin, blocked for non-admin finance.manage
    activityMock.mockClear();
    const directSalRule = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveRecurringExpense',
        title: 'Contractor Retainer Salary',
        expenseType: 'DIRECT_EXPENSE',
        category: 'DIRECT_SALARY',
        currency: 'AED',
        amountMicros: '2000000000',
        dayOfMonth: 2,
        fundingAccountId: cashAed.id,
        startMonth: '2026-12',
        expenseCurrentMonth: true,
        entryDate: '2026-12-02',
      },
      dec03Utc,
    );
    expect(activityMock).not.toHaveBeenCalled();

    const nonAdminSetup = setup({
      isAdmin: false,
      capabilities: ['finance.read', 'finance.manage'],
    });
    for (const [key, value] of stores.entries()) {
      nonAdminSetup.stores.set(key, value);
    }
    await expect(
      nonAdminSetup.service.command(
        workspace,
        staffMemberId,
        userWorkspaceId,
        {
          action: 'saveRecurringExpense',
          title: 'Sneaky Salary',
          expenseType: 'DIRECT_EXPENSE',
          category: 'DIRECT_SALARY',
          currency: 'AED',
          amountMicros: '1000000000',
          dayOfMonth: 1,
          fundingAccountId: cashAed.id,
          startMonth: '2026-12',
          expenseCurrentMonth: true,
        },
        dec03Utc,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      nonAdminSetup.service.command(
        workspace,
        staffMemberId,
        userWorkspaceId,
        {
          action: 'expenseRecurringForMonth',
          id: String(directSalRule.recurringExpenseId),
        },
        dec03Utc,
      ),
    ).rejects.toThrow(ForbiddenException);

    // 4. Repeated reverse -> :REPOST:2 -> void -> :REPOST:3 cycle + fully locked month rejection
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'setPeriodLock', lockedThroughDate: '2026-12-02' },
      dec03Utc,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'reverseJournal',
        journalId: String(directSalRule.journalId),
        reversalDate: '2026-12-03',
        reason: 'Locked correction',
      },
      dec03Utc,
    );
    const repost1 = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'expenseRecurringForMonth',
        id: String(directSalRule.recurringExpenseId),
        entryDate: '2026-12-03',
      },
      dec03Utc,
    );
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'voidJournal',
        journalId: String(repost1.journalId),
        reason: 'Void repost 1',
      },
      dec03Utc,
    );
    const repost2 = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'expenseRecurringForMonth',
        id: String(directSalRule.recurringExpenseId),
        entryDate: '2026-12-03',
      },
      dec03Utc,
    );
    expect(repost2.journalId).not.toBe(repost1.journalId);

    // Fully locked through today (2026-12-03): expensing AWS (currently VOID) must fail cleanly
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'setPeriodLock', lockedThroughDate: '2026-12-03' },
      dec03Utc,
    );
    await expect(
      service.command(
        workspace,
        adminMemberId,
        userWorkspaceId,
        {
          action: 'expenseRecurringForMonth',
          id: String(awsFirst.recurringExpenseId),
        },
        dec03Utc,
      ),
    ).rejects.toThrow(BadRequestException);

    const balancedSnap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-12-01', toDate: '2026-12-31', asOfDate: '2026-12-03' },
      dec03Utc,
    );
    expect(balancedSnap.balanceSheet.isBalanced).toBe(true);
  });

  it('CLIENT-BILLING-BRIDGE: syncs client cash collected, receivables, settlements, voids, and backfills pre-existing client billing idempotently', async () => {
    const { service, stores, manager } = setup();
    const nowUtc = new Date('2026-11-26T10:00:00.000Z');
    const companyId = '44444444-4444-4444-8444-444444444441';
    const paymentId = '44444444-4444-4444-8444-444444444442';
    const receivableId = '44444444-4444-4444-8444-444444444443';
    const receiptId = '44444444-4444-4444-8444-444444444444';
    const legacyIncomeId = '44444444-4444-4444-8444-444444444445';

    // 1. Pre-existing client cash collected stored only in DeliveryOperationsEntity before bridge existed
    stores.set(DeliveryOperationsEntity, [
      {
        workspaceId: workspace.id,
        state: {
          business: {
            records: [
              {
                id: legacyIncomeId,
                revision: 1,
                kind: 'FINANCE',
                projectId: null,
                companyId,
                title: 'Legacy Client Retainer',
                currency: 'AED',
                amount: 100000, // 1,000.00 AED
                date: '2026-11-05',
                category: 'INCOME',
                dueDate: null,
                externalReference: 'LEG-001',
                evidenceUrl: null,
                notes: 'Bank transfer',
                status: 'POSTED',
                createdBy: adminMemberId,
                createdAt: nowUtc.toISOString(),
                updatedAt: nowUtc.toISOString(),
                history: [],
              },
            ],
          },
        },
      },
    ]);

    // First snapshot automatically backfills the pre-existing client cash collected record
    const afterBackfill = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nowUtc,
    );
    expect(afterBackfill.balanceSheet.isBalanced).toBe(true);
    expect(afterBackfill.profitAndLoss.revenueAedMicros).toBe('1000000000');

    // Second snapshot must be 100% idempotent (no double-counting!)
    const afterSecondSnapshot = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nowUtc,
    );
    expect(afterSecondSnapshot.profitAndLoss.revenueAedMicros).toBe(
      '1000000000',
    );

    // 2. Direct client cash collected syncs into Finance V2 cash & revenue
    await service.syncClientBusinessFinanceEntryInTransaction(
      manager as never,
      {
        workspaceId: workspace.id,
        memberId: adminMemberId,
        recordId: paymentId,
        category: 'INCOME',
        title: 'Acme Retainer Payment',
        clientName: 'Acme Studio',
        currency: 'AED',
        amountMinor: 250000, // 2,500.00 AED
        date: '2026-11-12',
        dueDate: null,
        projectId: null,
        externalReference: 'PAY-101',
        evidenceUrl: null,
        notes: 'Stripe payout',
      },
    );

    // 3. Client receivable creates linked Finance V2 invoice, then marking paid settles it
    await service.syncClientBusinessFinanceEntryInTransaction(
      manager as never,
      {
        workspaceId: workspace.id,
        memberId: adminMemberId,
        recordId: receivableId,
        category: 'RECEIVABLE',
        title: 'Acme November Invoice',
        clientName: 'Acme Studio',
        currency: 'AED',
        amountMinor: 150000, // 1,500.00 AED
        date: '2026-11-15',
        dueDate: '2026-11-29',
        projectId: null,
        externalReference: 'INV-ACME-11',
        evidenceUrl: null,
        notes: 'Monthly retainer',
      },
    );

    const beforeSettle = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nowUtc,
    );
    // Revenue so far: 1,000 + 2,500 = 3,500 AED; invoice is SENT with 0 paid
    expect(beforeSettle.profitAndLoss.revenueAedMicros).toBe('3500000000');
    const syncedInv = beforeSettle.invoices.find(
      (i) => i.invoiceNumber === 'INV-ACME-11',
    );
    expect(syncedInv).toBeDefined();
    expect(syncedInv?.status).toBe('SENT');
    expect(syncedInv?.paidMicros).toBe('0');

    // Settle receivable -> marks invoice PAID and posts 1,500 AED cash/revenue
    await service.settleClientBusinessReceivableInTransaction(
      manager as never,
      {
        workspaceId: workspace.id,
        memberId: adminMemberId,
        receivableId,
        receiptId,
        title: 'Payment receipt: Acme November Invoice',
        clientName: 'Acme Studio',
        currency: 'AED',
        amountMinor: 150000,
        paymentDate: '2026-11-20',
        projectId: null,
        evidenceUrl: 'https://receipts.example/acme-nov',
        notes: 'Paid in full',
      },
    );

    const afterSettle = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nowUtc,
    );
    // Revenue now: 1,000 + 2,500 + 1,500 = 5,000 AED
    expect(afterSettle.profitAndLoss.revenueAedMicros).toBe('5000000000');
    expect(afterSettle.balanceSheet.isBalanced).toBe(true);
    const paidInv = afterSettle.invoices.find(
      (i) => i.invoiceNumber === 'INV-ACME-11',
    );
    expect(paidInv?.status).toBe('PAID');
    expect(paidInv?.paidMicros).toBe('1500000000');

    // 4. Voiding direct client cash payment removes its 2,500 AED revenue impact cleanly
    await service.voidClientBusinessFinanceEntryInTransaction(
      manager as never,
      {
        workspaceId: workspace.id,
        memberId: adminMemberId,
        recordId: paymentId,
        category: 'INCOME',
        externalReference: 'PAY-101',
        reason: 'Entered in error',
      },
    );

    const afterVoid = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nowUtc,
    );
    expect(afterVoid.profitAndLoss.revenueAedMicros).toBe('2500000000');
    expect(afterVoid.balanceSheet.isBalanced).toBe(true);
  });

  it('computes current-month Projected MRR in snapshot analytics from clientFees and Finance V2 collections', async () => {
    const { service, stores, manager } = setup();
    const nowUtc = new Date('2026-11-26T09:00:00Z');
    const alphaCompanyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const betaCompanyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const gammaCompanyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const paymentRecordId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    // Bootstrap accounts and profile
    await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nowUtc,
    );

    // Seed active roster, agreed fees (minor units), and matching client payment business record
    stores.set(DeliveryOperationsEntity, [
      {
        workspaceId: workspace.id,
        state: {
          clientRoster: {
            includedIds: [alphaCompanyId, betaCompanyId, gammaCompanyId],
            excludedIds: [],
          },
          clientFees: {
            [alphaCompanyId]: {
              amount: 1000000, // 10,000.00 AED
              currency: 'AED',
              cadence: 'MONTHLY',
              notes: '',
              updatedAt: '2026-11-01T00:00:00Z',
              updatedBy: adminMemberId,
            },
            [betaCompanyId]: {
              amount: 300000, // 3,000.00 USD / 3 = 1,000 USD/mo
              currency: 'USD',
              cadence: 'QUARTERLY',
              notes: '',
              updatedAt: '2026-11-01T00:00:00Z',
              updatedBy: adminMemberId,
            },
            [gammaCompanyId]: {
              amount: 500000, // 5,000.00 AED one-time
              currency: 'AED',
              cadence: 'ONE_TIME',
              notes: '',
              updatedAt: '2026-11-01T00:00:00Z',
              updatedBy: adminMemberId,
            },
          },
          business: {
            records: [
              {
                id: paymentRecordId,
                revision: 1,
                kind: 'FINANCE',
                category: 'INCOME',
                companyId: alphaCompanyId,
                projectId: null,
                title: 'Alpha Retainer Part 1',
                currency: 'AED',
                amount: 600000,
                date: '2026-11-12',
                dueDate: null,
                externalReference: 'PAY-ALPHA-1',
                evidenceUrl: null,
                notes: 'Partial monthly retainer',
                status: 'POSTED',
                createdBy: adminMemberId,
                createdAt: '2026-11-12T00:00:00Z',
                updatedAt: '2026-11-12T00:00:00Z',
              },
            ],
          },
        },
      },
    ]);

    // Sync the direct client payment of 6,000 AED into Finance V2 ledger
    await service.syncClientBusinessFinanceEntryInTransaction(
      manager as never,
      {
        workspaceId: workspace.id,
        memberId: adminMemberId,
        recordId: paymentRecordId,
        category: 'INCOME',
        title: 'Alpha Retainer Part 1',
        clientName: 'Alpha Studio',
        currency: 'AED',
        amountMinor: 600000, // 6,000 AED
        date: '2026-11-12',
        dueDate: null,
        projectId: null,
        externalReference: 'PAY-ALPHA-1',
        evidenceUrl: null,
        notes: 'Partial monthly retainer',
      },
    );

    const snap = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nowUtc,
    );

    const projectedMrr = snap.analytics.projectedMrr;
    expect(projectedMrr).toBeDefined();

    // 10,000 AED + (3,000 USD / 3 = 1,000 USD * 3.6725 = 3,672.5 AED) = 13,672.5 AED
    expect(projectedMrr?.month).toBe('2026-11');
    expect(projectedMrr?.projectedMrrAedMicros).toBe('13672500000');
    expect(projectedMrr?.collectedTowardMrrAedMicros).toBe('6000000000');
    expect(projectedMrr?.remainingAedMicros).toBe('7672500000');
    expect(projectedMrr?.mrrClientCount).toBe(2);
    expect(projectedMrr?.oneTime.clientCount).toBe(1);
    expect(projectedMrr?.oneTime.totalAedMicros).toBe('5000000000');
    expect(projectedMrr?.paidClientCount).toBe(0);
    expect(projectedMrr?.partialClientCount).toBe(1);
    expect(projectedMrr?.unpaidClientCount).toBe(1);
    const alphaRow = projectedMrr?.clients.find(
      (c) => c.companyId === alphaCompanyId,
    );
    expect(alphaRow).toMatchObject({
      status: 'PARTIAL',
      collectedTowardMrrAedMicros: '6000000000',
      remainingAedMicros: '4000000000',
      collectionPercent: 60,
    });
  });

  it('updates client payment dates across BusinessRecord-synced and native Finance V2 journals while enforcing period locks', async () => {
    const { service, stores, manager } = setup();
    const nowUtc = new Date('2026-11-26T09:00:00Z');
    const alphaCompanyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const paymentRecordId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nowUtc,
    );

    stores.set(DeliveryOperationsEntity, [
      {
        workspaceId: workspace.id,
        state: {
          clientRoster: { includedIds: [alphaCompanyId], excludedIds: [] },
          clientFees: {
            [alphaCompanyId]: {
              amount: 600000,
              currency: 'AED',
              cadence: 'MONTHLY',
              notes: '',
              updatedAt: '2026-11-01T00:00:00Z',
              updatedBy: adminMemberId,
            },
          },
          business: {
            records: [
              {
                id: paymentRecordId,
                revision: 1,
                kind: 'FINANCE',
                category: 'INCOME',
                companyId: alphaCompanyId,
                projectId: null,
                title: 'Alpha November Retainer',
                currency: 'AED',
                amount: 600000,
                date: '2026-11-12',
                dueDate: null,
                externalReference: 'PAY-ALPHA-DATE-1',
                evidenceUrl: null,
                notes: '',
                status: 'POSTED',
                createdBy: adminMemberId,
                createdAt: '2026-11-12T00:00:00Z',
                updatedAt: '2026-11-12T00:00:00Z',
              },
            ],
          },
        },
      },
    ]);

    await service.syncClientBusinessFinanceEntryInTransaction(
      manager as never,
      {
        workspaceId: workspace.id,
        memberId: adminMemberId,
        recordId: paymentRecordId,
        category: 'INCOME',
        title: 'Alpha November Retainer',
        clientName: 'Alpha Studio',
        currency: 'AED',
        amountMinor: 600000,
        date: '2026-11-12',
        dueDate: null,
        projectId: null,
        externalReference: 'PAY-ALPHA-DATE-1',
        evidenceUrl: null,
        notes: '',
      },
    );

    const beforeEdit = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nowUtc,
    );
    expect(beforeEdit.profitAndLoss.revenueAedMicros).toBe('6000000000');
    expect(beforeEdit.analytics.projectedMrr?.collectedTowardMrrAedMicros).toBe(
      '6000000000',
    );

    // Move payment from November to October -> November P&L and November MRR immediately update
    const moved = await service.updateClientPaymentDateInTransaction(
      manager as never,
      {
        workspaceId: workspace.id,
        memberId: adminMemberId,
        newDate: '2026-10-28',
        businessRecord: {
          id: paymentRecordId,
          category: 'INCOME',
          externalReference: 'PAY-ALPHA-DATE-1',
          currentDate: '2026-11-12',
        },
      },
    );
    expect(moved).toMatchObject({
      oldDate: '2026-11-12',
      newDate: '2026-10-28',
    });

    const afterEdit = await service.snapshot(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { fromDate: '2026-11-01', toDate: '2026-11-30', asOfDate: '2026-11-26' },
      nowUtc,
    );
    expect(afterEdit.profitAndLoss.revenueAedMicros).toBe('0');
    expect(afterEdit.analytics.projectedMrr?.collectedTowardMrrAedMicros).toBe(
      '0',
    );
    expect(afterEdit.analytics.projectedMrr?.clients[0]?.status).toBe('UNPAID');

    // Create and pay a native Finance V2 invoice, then edit its payment journal date by journalId
    const invRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'saveInvoice',
        clientName: 'Alpha Studio',
        currency: 'AED',
        issueDate: '2026-11-01',
        dueDate: '2026-11-15',
        lineItems: [
          {
            label: 'Sprint',
            quantity: '1',
            unitPriceMicros: '2000000000',
            discountPercent: '0',
          },
        ],
      },
      nowUtc,
    );
    const payRes = await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      {
        action: 'recordInvoicePayment',
        invoiceId: String(invRes.invoiceId),
        paymentDate: '2026-11-20',
        amountMicros: '2000000000',
      },
      nowUtc,
    );
    const nativeJournalId = String(payRes.journalId);

    const movedNative = await service.updateClientPaymentDateInTransaction(
      manager as never,
      {
        workspaceId: workspace.id,
        memberId: adminMemberId,
        journalId: nativeJournalId,
        newDate: '2026-11-09',
      },
    );
    expect(movedNative).toMatchObject({
      journalId: nativeJournalId,
      oldDate: '2026-11-20',
      newDate: '2026-11-09',
    });

    // Lock October 2026 -> cannot move November payment into October OR move October payment out of October
    await service.command(
      workspace,
      adminMemberId,
      userWorkspaceId,
      { action: 'setPeriodLock', lockedThroughDate: '2026-10-31' },
      nowUtc,
    );

    await expect(
      service.updateClientPaymentDateInTransaction(manager as never, {
        workspaceId: workspace.id,
        memberId: adminMemberId,
        journalId: nativeJournalId,
        newDate: '2026-10-15',
      }),
    ).rejects.toThrow(/locked/i);

    await expect(
      service.updateClientPaymentDateInTransaction(manager as never, {
        workspaceId: workspace.id,
        memberId: adminMemberId,
        newDate: '2026-11-05',
        businessRecord: {
          id: paymentRecordId,
          category: 'INCOME',
          externalReference: 'PAY-ALPHA-DATE-1',
          currentDate: '2026-10-28',
        },
      }),
    ).rejects.toThrow(/locked/i);
  });
});

