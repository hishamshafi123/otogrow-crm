import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793102132820)
export class AddDeliveryReconciliationFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryFinanceSource" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "kind" text NOT NULL, "currency" text NOT NULL, "amountMicros" bigint NOT NULL, "snapshot" jsonb NOT NULL, "requestHash" text, "createdBy" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_597a37eaf6b3b1fb13f32492f4" CHECK ("amountMicros" > 0 AND "amountMicros" % 10000 = 0), CONSTRAINT "CHK_a2e46b197856c076dafd8e80e4" CHECK (kind IN (\'CASH\',\'RECEIVABLE\')), CONSTRAINT "PK_5694fae5efd6ac694028ee73d24" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_50ff0a82466a87c5317aed7c20" ON "core"."deliveryFinanceSource" ("workspaceId", "id") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryFinanceSettlement" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "cashId" uuid NOT NULL, "cashTitle" text NOT NULL, "targetTitle" text NOT NULL, "currency" text NOT NULL, "amountMicros" bigint NOT NULL, "status" text NOT NULL DEFAULT \'ACTIVE\', "projectId" uuid, "projectName" text, "requestHash" text NOT NULL, "createdBy" uuid NOT NULL, "createdByName" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reversedBy" uuid, "reversedByName" text, "reversedAt" TIMESTAMP WITH TIME ZONE, "reversalReason" text, "receivableId" uuid NOT NULL, CONSTRAINT "CHK_f83737b5ba9cc10351de7e612a" CHECK ("cashId" <> "receivableId"), CONSTRAINT "CHK_667e8a1b063d8f177e484fbbdf" CHECK (status<>\'REVERSED\' OR ("reversedAt" IS NOT NULL AND "reversedBy" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(btrim("reversalReason"))>0)), CONSTRAINT "CHK_032a31eedfca56842162a342cf" CHECK (status IN (\'ACTIVE\',\'REVERSED\')), CONSTRAINT "CHK_7b5e237682adff1ea9eb85c27f" CHECK ("revision" > 0), CONSTRAINT "CHK_9840fa972aaa84abaf473f50ea" CHECK ("amountMicros" > 0 AND "amountMicros" % 10000 = 0), CONSTRAINT "PK_73290769354a4c58bd9e3fbbda0" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_689e2ee2d8952a8c967f68b0c6" ON "core"."deliveryFinanceSettlement" ("workspaceId", "receivableId", "id") ',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_8f780cce30916f5c962fe24951" ON "core"."deliveryFinanceSettlement" ("workspaceId", "cashId", "id") ',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."deliveryFinanceCashMatch" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "cashId" uuid NOT NULL, "cashTitle" text NOT NULL, "targetTitle" text NOT NULL, "currency" text NOT NULL, "amountMicros" bigint NOT NULL, "status" text NOT NULL DEFAULT \'ACTIVE\', "projectId" uuid, "projectName" text, "requestHash" text NOT NULL, "createdBy" uuid NOT NULL, "createdByName" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reversedBy" uuid, "reversedByName" text, "reversedAt" TIMESTAMP WITH TIME ZONE, "reversalReason" text, "entryId" uuid NOT NULL, "month" text NOT NULL, "bucket" text NOT NULL, CONSTRAINT "CHK_7fed72b82863b498a24f4b2781" CHECK (month ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND left(month,4)<>\'0000\'), CONSTRAINT "CHK_d93af6798fadb2958846c71dc9" CHECK (status<>\'REVERSED\' OR ("reversedAt" IS NOT NULL AND "reversedBy" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(btrim("reversalReason"))>0)), CONSTRAINT "CHK_6ce825c26d950d0714e2ce5e3d" CHECK (bucket = COALESCE("projectId"::text, \'COMPANY\')), CONSTRAINT "CHK_ac9c0b0127ea09fc3540a4b7a8" CHECK (status IN (\'ACTIVE\',\'REVERSED\')), CONSTRAINT "CHK_ff45863f7c62af28f4f815096a" CHECK ("revision" > 0), CONSTRAINT "CHK_6e0d844b22c845faabe4a6dbcd" CHECK ("amountMicros" > 0), CONSTRAINT "PK_a97e53b138b0477215c5507d7d0" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_cff5c5814d3fe6d8304580c001" ON "core"."deliveryFinanceCashMatch" ("workspaceId", "entryId", "bucket", "id") ',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_641b3cb354c1e5d6cf67a7a1d6" ON "core"."deliveryFinanceCashMatch" ("workspaceId", "cashId", "id") ',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceSource" ADD CONSTRAINT "FK_a5fce90b2bd96656debeb4de564" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceSettlement" ADD CONSTRAINT "FK_42820e3c2ffcfeb3e553fcf2f68" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceSettlement" ADD CONSTRAINT "FK_33389f67c40129224a08e356933" FOREIGN KEY ("workspaceId", "cashId") REFERENCES "core"."deliveryFinanceSource"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceSettlement" ADD CONSTRAINT "FK_d7c701b1f65c964288929345545" FOREIGN KEY ("workspaceId", "receivableId") REFERENCES "core"."deliveryFinanceSource"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceCashMatch" ADD CONSTRAINT "FK_f396a8878038921a17497ea23ef" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceCashMatch" ADD CONSTRAINT "FK_a3b890c03c7a24f63f1fc174b82" FOREIGN KEY ("workspaceId", "cashId") REFERENCES "core"."deliveryFinanceSource"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceCashMatch" ADD CONSTRAINT "FK_04d78eca3ee910ca689e010fc03" FOREIGN KEY ("workspaceId", "entryId") REFERENCES "core"."deliveryFinanceEntry"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceCashMatch" ADD CONSTRAINT "FK_2c9f06233037cbb11184201ccde" FOREIGN KEY ("workspaceId", "entryId", "bucket") REFERENCES "core"."deliveryFinanceAllocation"("workspaceId","entryId","bucket") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceCashMatch" DROP CONSTRAINT "FK_2c9f06233037cbb11184201ccde"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceCashMatch" DROP CONSTRAINT "FK_04d78eca3ee910ca689e010fc03"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceCashMatch" DROP CONSTRAINT "FK_a3b890c03c7a24f63f1fc174b82"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceCashMatch" DROP CONSTRAINT "FK_f396a8878038921a17497ea23ef"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceSettlement" DROP CONSTRAINT "FK_d7c701b1f65c964288929345545"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceSettlement" DROP CONSTRAINT "FK_33389f67c40129224a08e356933"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceSettlement" DROP CONSTRAINT "FK_42820e3c2ffcfeb3e553fcf2f68"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."deliveryFinanceSource" DROP CONSTRAINT "FK_a5fce90b2bd96656debeb4de564"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_641b3cb354c1e5d6cf67a7a1d6"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_cff5c5814d3fe6d8304580c001"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryFinanceCashMatch"');
    await queryRunner.query(
      'DROP INDEX "core"."IDX_8f780cce30916f5c962fe24951"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_689e2ee2d8952a8c967f68b0c6"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryFinanceSettlement"');
    await queryRunner.query(
      'DROP INDEX "core"."IDX_50ff0a82466a87c5317aed7c20"',
    );
    await queryRunner.query('DROP TABLE "core"."deliveryFinanceSource"');
  }
}
