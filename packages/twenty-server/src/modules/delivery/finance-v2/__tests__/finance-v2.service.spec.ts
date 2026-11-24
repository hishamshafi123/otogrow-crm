import { BadRequestException, ForbiddenException } from '@nestjs/common';

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
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM core."deliveryFinanceV2JournalLine"')) {
        const lines = getList(DeliveryFinanceV2JournalLineEntity);
        const journals = new Map(
          getList(DeliveryFinanceV2JournalEntity).map((j) => [j.id, j]),
        );
        const accounts = new Map(
          getList(DeliveryFinanceV2AccountEntity).map((a) => [a.id, a]),
        );
        return lines.map((line) => {
          const journal = journals.get(line.journalId)!;
          const account = accounts.get(line.accountId)!;
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

    return { service, stores, writeFile, sendEmail };
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
    expect(beforePayment.invoices[0]?.overdueDays).toBe(7);
    expect(beforePayment.invoices[0]?.status).toBe('READY');

    // Explicit manual Send Email button emails the PDF
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
});
