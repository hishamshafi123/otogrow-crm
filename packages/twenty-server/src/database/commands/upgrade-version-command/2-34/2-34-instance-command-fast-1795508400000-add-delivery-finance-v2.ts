import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1795508400000)
export class AddDeliveryFinanceV2FastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "core"."deliveryFinanceV2Profile" (
        "workspaceId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "companyName" text NOT NULL DEFAULT 'Otogrow',
        "legalAddress" text NOT NULL DEFAULT '',
        "email" text NOT NULL DEFAULT '',
        "phone" text NOT NULL DEFAULT '',
        "website" text NOT NULL DEFAULT '',
        "logoDataUrl" text,
        "bankDetails" text NOT NULL DEFAULT '',
        "defaultQuoteTerms" text NOT NULL DEFAULT '',
        "defaultInvoiceNotes" text NOT NULL DEFAULT '',
        "baseCurrency" text NOT NULL DEFAULT 'AED',
        "quoteSequence" integer NOT NULL DEFAULT 1,
        "invoiceSequence" integer NOT NULL DEFAULT 1,
        "rateCard" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "exchangeRates" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryFinanceV2Profile" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deliveryFinanceV2Profile_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2Profile_workspace" ON "core"."deliveryFinanceV2Profile" ("workspaceId")',
    );

    await queryRunner.query(`
      CREATE TABLE "core"."deliveryFinanceV2Account" (
        "workspaceId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "code" text NOT NULL,
        "name" text NOT NULL,
        "accountType" text NOT NULL,
        "subType" text NOT NULL,
        "currency" text,
        "personName" text,
        "personEmail" text,
        "active" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryFinanceV2Account" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryFinanceV2Account_type" CHECK ("accountType" IN ('ASSET','LIABILITY','EQUITY','REVENUE','DIRECT_EXPENSE','INDIRECT_EXPENSE')),
        CONSTRAINT "CHK_deliveryFinanceV2Account_subType" CHECK ("subType" IN ('CASH_CURRENCY','FIXED_ASSET','PERSON_LIABILITY','OPENING_EQUITY','SERVICE_REVENUE','DIRECT_COST','INDIRECT_COST','FX_GAIN_LOSS')),
        CONSTRAINT "FK_deliveryFinanceV2Account_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2Account_ws_id" ON "core"."deliveryFinanceV2Account" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2Account_ws_code" ON "core"."deliveryFinanceV2Account" ("workspaceId", "code")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_deliveryFinanceV2Account_ws_types" ON "core"."deliveryFinanceV2Account" ("workspaceId", "accountType", "subType")',
    );

    await queryRunner.query(`
      CREATE TABLE "core"."deliveryFinanceV2Journal" (
        "workspaceId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "entryDate" date NOT NULL,
        "entryType" text NOT NULL,
        "category" text NOT NULL,
        "title" text NOT NULL,
        "notes" text NOT NULL DEFAULT '',
        "currency" text NOT NULL,
        "amountMicros" bigint NOT NULL,
        "fxRateToAed" text NOT NULL,
        "aedAmountMicros" bigint NOT NULL,
        "fundingAccountId" uuid,
        "targetAccountId" uuid,
        "projectId" uuid,
        "employeeMemberId" uuid,
        "receiptUrl" text,
        "sourceRefType" text,
        "sourceRefId" text,
        "status" text NOT NULL DEFAULT 'POSTED',
        "reversalOfJournalId" uuid,
        "createdBy" uuid NOT NULL,
        "voidedBy" uuid,
        "voidedAt" TIMESTAMP WITH TIME ZONE,
        "voidReason" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryFinanceV2Journal" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryFinanceV2Journal_status" CHECK ("status" IN ('POSTED','VOID')),
        CONSTRAINT "CHK_deliveryFinanceV2Journal_aed" CHECK ("aedAmountMicros" >= 0),
        CONSTRAINT "FK_deliveryFinanceV2Journal_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2Journal_ws_id" ON "core"."deliveryFinanceV2Journal" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_deliveryFinanceV2Journal_ws_date" ON "core"."deliveryFinanceV2Journal" ("workspaceId", "entryDate", "id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_deliveryFinanceV2Journal_ws_type" ON "core"."deliveryFinanceV2Journal" ("workspaceId", "entryType", "entryDate")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2Journal_idempotency" ON "core"."deliveryFinanceV2Journal" ("workspaceId", "sourceRefType", "sourceRefId") WHERE "sourceRefType" IS NOT NULL AND "sourceRefId" IS NOT NULL AND status = \'POSTED\'',
    );

    await queryRunner.query(`
      CREATE TABLE "core"."deliveryFinanceV2JournalLine" (
        "workspaceId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "journalId" uuid NOT NULL,
        "accountId" uuid NOT NULL,
        "debitAedMicros" bigint NOT NULL DEFAULT 0,
        "creditAedMicros" bigint NOT NULL DEFAULT 0,
        "currency" text NOT NULL,
        "originalSignedMicros" bigint NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryFinanceV2JournalLine" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryFinanceV2JournalLine_nonneg" CHECK ("debitAedMicros" >= 0 AND "creditAedMicros" >= 0),
        CONSTRAINT "CHK_deliveryFinanceV2JournalLine_single_side" CHECK (("debitAedMicros" = 0 OR "creditAedMicros" = 0) AND ("debitAedMicros" > 0 OR "creditAedMicros" > 0)),
        CONSTRAINT "FK_deliveryFinanceV2JournalLine_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deliveryFinanceV2JournalLine_journal" FOREIGN KEY ("workspaceId", "journalId") REFERENCES "core"."deliveryFinanceV2Journal"("workspaceId", "id") ON DELETE CASCADE,
        CONSTRAINT "FK_deliveryFinanceV2JournalLine_account" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "core"."deliveryFinanceV2Account"("workspaceId", "id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_deliveryFinanceV2JournalLine_ws_journal" ON "core"."deliveryFinanceV2JournalLine" ("workspaceId", "journalId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_deliveryFinanceV2JournalLine_ws_account" ON "core"."deliveryFinanceV2JournalLine" ("workspaceId", "accountId")',
    );

    await queryRunner.query(`
      CREATE TABLE "core"."deliveryFinanceV2RecurringExpense" (
        "workspaceId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "title" text NOT NULL,
        "expenseType" text NOT NULL DEFAULT 'DIRECT_EXPENSE',
        "category" text NOT NULL,
        "currency" text NOT NULL,
        "amountMicros" bigint NOT NULL,
        "dayOfMonth" integer NOT NULL,
        "fundingAccountId" uuid NOT NULL,
        "employeeMemberId" uuid,
        "employeeName" text,
        "notes" text NOT NULL DEFAULT '',
        "startMonth" text NOT NULL,
        "endMonth" text,
        "status" text NOT NULL DEFAULT 'ACTIVE',
        "createdBy" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryFinanceV2RecurringExpense" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryFinanceV2RecurringExpense_amt" CHECK ("amountMicros" > 0),
        CONSTRAINT "CHK_deliveryFinanceV2RecurringExpense_day" CHECK ("dayOfMonth" >= 1 AND "dayOfMonth" <= 31),
        CONSTRAINT "CHK_deliveryFinanceV2RecurringExpense_type" CHECK ("expenseType" IN ('DIRECT_EXPENSE','INDIRECT_EXPENSE')),
        CONSTRAINT "CHK_deliveryFinanceV2RecurringExpense_status" CHECK ("status" IN ('ACTIVE','PAUSED','STOPPED')),
        CONSTRAINT "FK_deliveryFinanceV2RecurringExpense_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deliveryFinanceV2RecurringExpense_funding" FOREIGN KEY ("workspaceId", "fundingAccountId") REFERENCES "core"."deliveryFinanceV2Account"("workspaceId", "id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2RecurringExpense_ws_id" ON "core"."deliveryFinanceV2RecurringExpense" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_deliveryFinanceV2RecurringExpense_ws_status" ON "core"."deliveryFinanceV2RecurringExpense" ("workspaceId", "status", "dayOfMonth")',
    );

    await queryRunner.query(`
      CREATE TABLE "core"."deliveryFinanceV2PayrollProfile" (
        "workspaceId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "employeeMemberId" uuid,
        "employeeName" text NOT NULL,
        "roleLabel" text NOT NULL DEFAULT '',
        "currency" text NOT NULL DEFAULT 'INR',
        "baseSalaryMicros" bigint NOT NULL,
        "workingDaysPerMonth" integer NOT NULL DEFAULT 26,
        "paidLeavesPerMonth" integer NOT NULL DEFAULT 2,
        "payDayOfMonth" integer NOT NULL DEFAULT 28,
        "fundingAccountId" uuid NOT NULL,
        "recurringExpenseId" uuid,
        "active" boolean NOT NULL DEFAULT true,
        "createdBy" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryFinanceV2PayrollProfile" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryFinanceV2PayrollProfile_salary" CHECK ("baseSalaryMicros" > 0),
        CONSTRAINT "CHK_deliveryFinanceV2PayrollProfile_wdays" CHECK ("workingDaysPerMonth" >= 1 AND "workingDaysPerMonth" <= 31),
        CONSTRAINT "CHK_deliveryFinanceV2PayrollProfile_leaves" CHECK ("paidLeavesPerMonth" >= 0 AND "paidLeavesPerMonth" <= 31),
        CONSTRAINT "CHK_deliveryFinanceV2PayrollProfile_payday" CHECK ("payDayOfMonth" >= 1 AND "payDayOfMonth" <= 31),
        CONSTRAINT "FK_deliveryFinanceV2PayrollProfile_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deliveryFinanceV2PayrollProfile_funding" FOREIGN KEY ("workspaceId", "fundingAccountId") REFERENCES "core"."deliveryFinanceV2Account"("workspaceId", "id") ON DELETE NO ACTION,
        CONSTRAINT "FK_deliveryFinanceV2PayrollProfile_recurring" FOREIGN KEY ("workspaceId", "recurringExpenseId") REFERENCES "core"."deliveryFinanceV2RecurringExpense"("workspaceId", "id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2PayrollProfile_ws_id" ON "core"."deliveryFinanceV2PayrollProfile" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_deliveryFinanceV2PayrollProfile_ws_active" ON "core"."deliveryFinanceV2PayrollProfile" ("workspaceId", "active")',
    );

    await queryRunner.query(`
      CREATE TABLE "core"."deliveryFinanceV2PayrollEntry" (
        "workspaceId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "profileId" uuid NOT NULL,
        "month" text NOT NULL,
        "entryKind" text NOT NULL,
        "days" text,
        "bonusAmountMicros" bigint,
        "eventDate" date NOT NULL,
        "swappedWorkDate" date,
        "note" text NOT NULL DEFAULT '',
        "createdBy" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryFinanceV2PayrollEntry" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryFinanceV2PayrollEntry_kind" CHECK ("entryKind" IN ('LEAVE','SWAP_COMP_OFF','OVERTIME','BONUS')),
        CONSTRAINT "CHK_deliveryFinanceV2PayrollEntry_month" CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left(month,4)<>'0000'),
        CONSTRAINT "FK_deliveryFinanceV2PayrollEntry_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_deliveryFinanceV2PayrollEntry_profile" FOREIGN KEY ("workspaceId", "profileId") REFERENCES "core"."deliveryFinanceV2PayrollProfile"("workspaceId", "id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_deliveryFinanceV2PayrollEntry_ws_prof_month" ON "core"."deliveryFinanceV2PayrollEntry" ("workspaceId", "profileId", "month")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_deliveryFinanceV2PayrollEntry_ws_month" ON "core"."deliveryFinanceV2PayrollEntry" ("workspaceId", "month")',
    );

    await queryRunner.query(`
      CREATE TABLE "core"."deliveryFinanceV2Quote" (
        "workspaceId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "quoteNumber" text NOT NULL,
        "clientName" text NOT NULL,
        "clientEmail" text NOT NULL DEFAULT '',
        "clientAddress" text NOT NULL DEFAULT '',
        "projectId" uuid,
        "currency" text NOT NULL DEFAULT 'USD',
        "issueDate" date NOT NULL,
        "validUntil" date,
        "lineItems" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "subtotalMicros" bigint NOT NULL DEFAULT 0,
        "discountTotalMicros" bigint NOT NULL DEFAULT 0,
        "totalMicros" bigint NOT NULL DEFAULT 0,
        "notes" text NOT NULL DEFAULT '',
        "terms" text NOT NULL DEFAULT '',
        "status" text NOT NULL DEFAULT 'DRAFT',
        "sentAt" TIMESTAMP WITH TIME ZONE,
        "convertedInvoiceId" uuid,
        "convertedScheduleId" uuid,
        "voidReason" text,
        "voidedAt" TIMESTAMP WITH TIME ZONE,
        "createdBy" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryFinanceV2Quote" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryFinanceV2Quote_status" CHECK ("status" IN ('DRAFT','SENT','CONVERTED','VOID')),
        CONSTRAINT "CHK_deliveryFinanceV2Quote_total" CHECK ("totalMicros" >= 0),
        CONSTRAINT "FK_deliveryFinanceV2Quote_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2Quote_ws_id" ON "core"."deliveryFinanceV2Quote" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2Quote_ws_num" ON "core"."deliveryFinanceV2Quote" ("workspaceId", "quoteNumber")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_deliveryFinanceV2Quote_ws_status" ON "core"."deliveryFinanceV2Quote" ("workspaceId", "status", "issueDate")',
    );

    await queryRunner.query(`
      CREATE TABLE "core"."deliveryFinanceV2InvoiceSchedule" (
        "workspaceId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "clientName" text NOT NULL,
        "clientEmail" text NOT NULL DEFAULT '',
        "clientAddress" text NOT NULL DEFAULT '',
        "projectId" uuid,
        "currency" text NOT NULL DEFAULT 'USD',
        "lineItems" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "subtotalMicros" bigint NOT NULL DEFAULT 0,
        "discountTotalMicros" bigint NOT NULL DEFAULT 0,
        "totalMicros" bigint NOT NULL DEFAULT 0,
        "billingDayOfMonth" integer NOT NULL,
        "dueDayOfMonth" integer NOT NULL,
        "notes" text NOT NULL DEFAULT '',
        "startMonth" text NOT NULL,
        "endMonth" text,
        "status" text NOT NULL DEFAULT 'ACTIVE',
        "sourceQuoteId" uuid,
        "createdBy" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryFinanceV2InvoiceSchedule" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryFinanceV2InvoiceSchedule_bday" CHECK ("billingDayOfMonth" >= 1 AND "billingDayOfMonth" <= 31),
        CONSTRAINT "CHK_deliveryFinanceV2InvoiceSchedule_dday" CHECK ("dueDayOfMonth" >= 1 AND "dueDayOfMonth" <= 31),
        CONSTRAINT "CHK_deliveryFinanceV2InvoiceSchedule_status" CHECK ("status" IN ('ACTIVE','PAUSED','STOPPED')),
        CONSTRAINT "CHK_deliveryFinanceV2InvoiceSchedule_total" CHECK ("totalMicros" >= 0),
        CONSTRAINT "FK_deliveryFinanceV2InvoiceSchedule_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2InvoiceSchedule_ws_id" ON "core"."deliveryFinanceV2InvoiceSchedule" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_deliveryFinanceV2InvoiceSchedule_ws_status" ON "core"."deliveryFinanceV2InvoiceSchedule" ("workspaceId", "status", "billingDayOfMonth")',
    );

    await queryRunner.query(`
      CREATE TABLE "core"."deliveryFinanceV2Invoice" (
        "workspaceId" uuid NOT NULL,
        "id" uuid NOT NULL,
        "invoiceNumber" text NOT NULL,
        "scheduleId" uuid,
        "scheduleMonth" text,
        "sourceQuoteId" uuid,
        "clientName" text NOT NULL,
        "clientEmail" text NOT NULL DEFAULT '',
        "clientAddress" text NOT NULL DEFAULT '',
        "projectId" uuid,
        "currency" text NOT NULL DEFAULT 'USD',
        "issueDate" date NOT NULL,
        "dueDate" date NOT NULL,
        "lineItems" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "subtotalMicros" bigint NOT NULL DEFAULT 0,
        "discountTotalMicros" bigint NOT NULL DEFAULT 0,
        "totalMicros" bigint NOT NULL DEFAULT 0,
        "paidMicros" bigint NOT NULL DEFAULT 0,
        "status" text NOT NULL DEFAULT 'READY',
        "pdfStoragePath" text,
        "sentAt" TIMESTAMP WITH TIME ZONE,
        "sentBy" uuid,
        "sentVia" text,
        "notes" text NOT NULL DEFAULT '',
        "voidReason" text,
        "voidedAt" TIMESTAMP WITH TIME ZONE,
        "createdBy" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveryFinanceV2Invoice" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deliveryFinanceV2Invoice_status" CHECK ("status" IN ('READY','SENT','PARTIALLY_PAID','PAID','VOID')),
        CONSTRAINT "CHK_deliveryFinanceV2Invoice_paid" CHECK ("totalMicros" >= 0 AND "paidMicros" >= 0 AND "paidMicros" <= "totalMicros"),
        CONSTRAINT "FK_deliveryFinanceV2Invoice_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2Invoice_ws_id" ON "core"."deliveryFinanceV2Invoice" ("workspaceId", "id")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2Invoice_ws_num" ON "core"."deliveryFinanceV2Invoice" ("workspaceId", "invoiceNumber")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_deliveryFinanceV2Invoice_schedule_month" ON "core"."deliveryFinanceV2Invoice" ("workspaceId", "scheduleId", "scheduleMonth") WHERE "scheduleId" IS NOT NULL AND "scheduleMonth" IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_deliveryFinanceV2Invoice_ws_status_due" ON "core"."deliveryFinanceV2Invoice" ("workspaceId", "status", "dueDate")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$
      DECLARE
        tbl text;
        has_rows boolean;
      BEGIN
        FOREACH tbl IN ARRAY ARRAY[
          'deliveryFinanceV2Journal',
          'deliveryFinanceV2JournalLine',
          'deliveryFinanceV2Invoice',
          'deliveryFinanceV2InvoiceSchedule',
          'deliveryFinanceV2Quote',
          'deliveryFinanceV2PayrollEntry',
          'deliveryFinanceV2PayrollProfile',
          'deliveryFinanceV2RecurringExpense',
          'deliveryFinanceV2Account',
          'deliveryFinanceV2Profile'
        ] LOOP
          IF to_regclass('core."' || tbl || '"') IS NOT NULL THEN
            EXECUTE format('SELECT EXISTS (SELECT 1 FROM core.%I)', tbl) INTO has_rows;
            IF has_rows THEN
              RAISE EXCEPTION 'Finance V2 table % contains data; preserve it before rolling back this schema.', tbl;
            END IF;
          END IF;
        END LOOP;
      END $$`);
    await queryRunner.query('DROP TABLE IF EXISTS "core"."deliveryFinanceV2Invoice"');
    await queryRunner.query('DROP TABLE IF EXISTS "core"."deliveryFinanceV2InvoiceSchedule"');
    await queryRunner.query('DROP TABLE IF EXISTS "core"."deliveryFinanceV2Quote"');
    await queryRunner.query('DROP TABLE IF EXISTS "core"."deliveryFinanceV2PayrollEntry"');
    await queryRunner.query('DROP TABLE IF EXISTS "core"."deliveryFinanceV2PayrollProfile"');
    await queryRunner.query('DROP TABLE IF EXISTS "core"."deliveryFinanceV2RecurringExpense"');
    await queryRunner.query('DROP TABLE IF EXISTS "core"."deliveryFinanceV2JournalLine"');
    await queryRunner.query('DROP TABLE IF EXISTS "core"."deliveryFinanceV2Journal"');
    await queryRunner.query('DROP TABLE IF EXISTS "core"."deliveryFinanceV2Account"');
    await queryRunner.query('DROP TABLE IF EXISTS "core"."deliveryFinanceV2Profile"');
  }
}
