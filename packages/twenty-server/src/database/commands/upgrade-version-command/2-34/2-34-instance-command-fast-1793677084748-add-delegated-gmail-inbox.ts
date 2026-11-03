import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1793677084748)
export class AddDelegatedGmailInboxFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryInboxBinding" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "conversationId" uuid NOT NULL, "accountId" uuid NOT NULL, "channelId" uuid NOT NULL, "threadExternalId" character varying(300) NOT NULL, "ownerMemberId" uuid NOT NULL, "ownerUserWorkspaceId" uuid NOT NULL, "projectId" uuid NOT NULL, "companyId" uuid, "revision" integer NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "consent" jsonb NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CHK_deliveryInboxBinding_consent" CHECK (CASE WHEN jsonb_typeof(consent)=\'object\' AND jsonb_typeof(consent->\'grants\')=\'array\' THEN jsonb_array_length(consent->\'grants\')<=100 ELSE false END), CONSTRAINT "CHK_deliveryInboxBinding_revision" CHECK (revision > 0), CONSTRAINT "PK_b2091e8f52d4b1a9f6b31892419" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_f135997b18c8c3d56ac692f6b0" ON "core"."deliveryInboxBinding" ("workspaceId", "accountId", "channelId", "threadExternalId") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_e0075670839d2c34272f797a48" ON "core"."deliveryInboxBinding" ("workspaceId", "conversationId") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_9672ab7b251ffb1cec6db11019" ON "core"."deliveryInboxBinding" ("workspaceId", "id") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryInboxConsent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "bindingId" uuid NOT NULL, "revision" integer NOT NULL, "inputHash" character varying(64) NOT NULL, "snapshot" jsonb NOT NULL, "receipt" jsonb NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CHK_deliveryInboxConsent_hash" CHECK ("inputHash" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "CHK_deliveryInboxConsent_revision" CHECK (revision > 0), CONSTRAINT "PK_6a529981544f33b537cf040ffba" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_0bfa039d90f1e90baa03e15c02" ON "core"."deliveryInboxConsent" ("workspaceId", "bindingId", "revision") ');
    await queryRunner.query('CREATE TABLE "core"."deliveryInboxReply" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "requestId" uuid NOT NULL, "bindingId" uuid NOT NULL, "conversationId" uuid NOT NULL, "actorId" uuid NOT NULL, "userWorkspaceId" uuid NOT NULL, "inputHash" character varying(64) NOT NULL, "input" jsonb NOT NULL, "body" jsonb, "bodyFingerprint" character varying(64), "status" character varying NOT NULL, "headerMessageId" character varying NOT NULL, "preparationReceipt" jsonb NOT NULL, "sendRequestId" uuid, "sendInputHash" character varying(64), "sendReceipt" jsonb, "cancelRequestId" uuid, "cancelReceipt" jsonb, "providerMessageId" character varying, "problem" character varying, "attemptedAt" TIMESTAMP WITH TIME ZONE, "finishedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CHK_deliveryInboxReply_dispatch" CHECK (status NOT IN (\'QUEUED\',\'SENDING\',\'SENT\',\'UNCERTAIN\') OR (body IS NOT NULL AND "sendRequestId" IS NOT NULL)), CONSTRAINT "CHK_deliveryInboxReply_cancel_receipt" CHECK (("cancelRequestId" IS NULL)=("cancelReceipt" IS NULL)), CONSTRAINT "CHK_deliveryInboxReply_send_receipt" CHECK (("sendRequestId" IS NULL AND "sendReceipt" IS NULL AND "sendInputHash" IS NULL) OR ("sendRequestId" IS NOT NULL AND "sendReceipt" IS NOT NULL AND "sendInputHash" IS NOT NULL AND "sendInputHash" ~ \'^[a-f0-9]{64}$\')), CONSTRAINT "CHK_deliveryInboxReply_body" CHECK ((body IS NULL AND "bodyFingerprint" IS NULL) OR COALESCE(body IS NOT NULL AND "bodyFingerprint" IS NOT NULL AND jsonb_typeof(body->\'text\')=\'string\' AND length(body->>\'text\') BETWEEN 1 AND 12000,false)), CONSTRAINT "CHK_deliveryInboxReply_hashes" CHECK ("inputHash" ~ \'^[a-f0-9]{64}$\' AND ("bodyFingerprint" IS NULL OR "bodyFingerprint" ~ \'^[a-f0-9]{64}$\')), CONSTRAINT "CHK_deliveryInboxReply_status" CHECK (status IN (\'GENERATING\',\'DRAFT\',\'QUEUED\',\'SENDING\',\'SENT\',\'FAILED\',\'UNCERTAIN\',\'CANCELLED\')), CONSTRAINT "PK_a766d414ba797ad3063698c8a9d" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_dc673397d202b158e69efd8088" ON "core"."deliveryInboxReply" ("status", "updatedAt") ');
    await queryRunner.query('CREATE INDEX "IDX_0dfeacdd651047fcb9f95c31a1" ON "core"."deliveryInboxReply" ("workspaceId", "bindingId", "createdAt", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_549bdd2c982ff4d2a4e6625b58" ON "core"."deliveryInboxReply" ("workspaceId", "cancelRequestId") WHERE "cancelRequestId" IS NOT NULL');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_e7c231a4f4ff89eac1c7db966e" ON "core"."deliveryInboxReply" ("workspaceId", "sendRequestId") WHERE "sendRequestId" IS NOT NULL');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_8ed01bc15693fc14da37b796f3" ON "core"."deliveryInboxReply" ("workspaceId", "requestId") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_5bfa520b01b627b6b586fa0536" ON "core"."deliveryInboxReply" ("workspaceId", "id") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryInboxBinding" ADD CONSTRAINT "FK_5d90538e546184197b54bab9ea5" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryInboxBinding" ADD CONSTRAINT "FK_72d1f47a161f0c7ee704ce0380b" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "core"."deliveryProject"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryInboxConsent" ADD CONSTRAINT "FK_4f81af42162f431c7f294a228d3" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryInboxConsent" ADD CONSTRAINT "FK_e8bb0de0b1a3a80b41e3765d42c" FOREIGN KEY ("workspaceId", "bindingId") REFERENCES "core"."deliveryInboxBinding"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryInboxReply" ADD CONSTRAINT "FK_760b730f1c17157d0f68138a6a5" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."deliveryInboxReply" ADD CONSTRAINT "FK_b9b379e3f8244f25ec2f67a8b5b" FOREIGN KEY ("workspaceId", "bindingId") REFERENCES "core"."deliveryInboxBinding"("workspaceId","id") ON DELETE RESTRICT ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ retained }]: { retained: boolean }[] = await queryRunner.query(`
      SELECT EXISTS(SELECT 1 FROM core."deliveryInboxBinding")
        OR EXISTS(SELECT 1 FROM core."deliveryInboxConsent")
        OR EXISTS(SELECT 1 FROM core."deliveryInboxReply")
        OR EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE left(action, 6) = 'INBOX_') AS retained
    `);

    if (retained) {
      throw new Error('Cannot remove retained Gmail inbox history.');
    }

    await queryRunner.query('ALTER TABLE "core"."deliveryInboxReply" DROP CONSTRAINT "FK_b9b379e3f8244f25ec2f67a8b5b"');
    await queryRunner.query('ALTER TABLE "core"."deliveryInboxReply" DROP CONSTRAINT "FK_760b730f1c17157d0f68138a6a5"');
    await queryRunner.query('ALTER TABLE "core"."deliveryInboxConsent" DROP CONSTRAINT "FK_e8bb0de0b1a3a80b41e3765d42c"');
    await queryRunner.query('ALTER TABLE "core"."deliveryInboxConsent" DROP CONSTRAINT "FK_4f81af42162f431c7f294a228d3"');
    await queryRunner.query('ALTER TABLE "core"."deliveryInboxBinding" DROP CONSTRAINT "FK_72d1f47a161f0c7ee704ce0380b"');
    await queryRunner.query('ALTER TABLE "core"."deliveryInboxBinding" DROP CONSTRAINT "FK_5d90538e546184197b54bab9ea5"');
    await queryRunner.query('DROP INDEX "core"."IDX_5bfa520b01b627b6b586fa0536"');
    await queryRunner.query('DROP INDEX "core"."IDX_8ed01bc15693fc14da37b796f3"');
    await queryRunner.query('DROP INDEX "core"."IDX_e7c231a4f4ff89eac1c7db966e"');
    await queryRunner.query('DROP INDEX "core"."IDX_549bdd2c982ff4d2a4e6625b58"');
    await queryRunner.query('DROP INDEX "core"."IDX_0dfeacdd651047fcb9f95c31a1"');
    await queryRunner.query('DROP INDEX "core"."IDX_dc673397d202b158e69efd8088"');
    await queryRunner.query('DROP TABLE "core"."deliveryInboxReply"');
    await queryRunner.query('DROP INDEX "core"."IDX_0bfa039d90f1e90baa03e15c02"');
    await queryRunner.query('DROP TABLE "core"."deliveryInboxConsent"');
    await queryRunner.query('DROP INDEX "core"."IDX_9672ab7b251ffb1cec6db11019"');
    await queryRunner.query('DROP INDEX "core"."IDX_e0075670839d2c34272f797a48"');
    await queryRunner.query('DROP INDEX "core"."IDX_f135997b18c8c3d56ac692f6b0"');
    await queryRunner.query('DROP TABLE "core"."deliveryInboxBinding"');
  }
}
