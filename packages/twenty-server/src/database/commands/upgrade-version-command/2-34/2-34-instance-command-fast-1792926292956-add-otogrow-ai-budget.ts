import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792926292956)
export class AddOtogrowAiBudgetFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."otogrowAiBudget" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "scope" text NOT NULL, "scopeId" uuid NOT NULL, "scopeName" text NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "enabled" boolean NOT NULL, "capMicroUsd" bigint NOT NULL, "openingSpentMicroUsd" bigint NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8716581dded64eae4d3e0722493" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_c19d0b534cc40cff4108a0fd0c" ON "core"."otogrowAiBudget" ("workspaceId", "scope", "scopeId") ');
    await queryRunner.query('CREATE TABLE "core"."otogrowAiPrice" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "modelId" text NOT NULL, "kind" text NOT NULL, "revision" integer NOT NULL DEFAULT \'1\', "enabled" boolean NOT NULL, "source" text NOT NULL, "verifiedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "pricing" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ad07ccd2eb815faaddf64135f38" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_bb2548e4d6d56607c8a606ad71" ON "core"."otogrowAiPrice" ("workspaceId", "modelId", "kind") ');
    await queryRunner.query('CREATE TABLE "core"."otogrowAiSpend" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "revision" integer NOT NULL DEFAULT \'1\', "sourceKind" text NOT NULL, "sourceRunId" uuid NOT NULL, "actorId" uuid NOT NULL, "projectId" uuid, "clientId" uuid, "clientName" text, "taskId" uuid, "taskName" text, "state" text NOT NULL, "reservedMicroUsd" bigint NOT NULL, "actualMicroUsd" bigint, "price" jsonb NOT NULL, "usage" jsonb, "attentionReason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "dispatchedAt" TIMESTAMP WITH TIME ZONE, "settledAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ee42ebe94faf24722725da28d31" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_ba12fb4357da7885d4bea3635d" ON "core"."otogrowAiSpend" ("workspaceId", "taskId") ');
    await queryRunner.query('CREATE INDEX "IDX_fb9bd3097e37d969b623d20346" ON "core"."otogrowAiSpend" ("workspaceId", "clientId") ');
    await queryRunner.query('CREATE INDEX "IDX_0c351c6aef3962d6d9f53a75bf" ON "core"."otogrowAiSpend" ("workspaceId", "createdAt", "id") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_c36308b5d3cb37500f991c8e29" ON "core"."otogrowAiSpend" ("workspaceId", "sourceKind", "sourceRunId") ');
    await queryRunner.query('CREATE TABLE "core"."otogrowAiSpendEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorId" uuid, "spendId" uuid, "action" text NOT NULL, "before" jsonb NOT NULL, "after" jsonb NOT NULL, "evidenceReference" text, "reason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f7be332aeb779bb274a898f6fc3" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_ee27104d886ffd77b1dadab17e" ON "core"."otogrowAiSpendEvent" ("workspaceId", "createdAt", "id") ');
    await queryRunner.query('ALTER TABLE "core"."otogrowAiBudget" ADD CONSTRAINT "FK_b40ecd1dfda7324134c059d31c0" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."otogrowAiPrice" ADD CONSTRAINT "FK_d5cdb54be4efbe30b9895101fc5" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."otogrowAiSpend" ADD CONSTRAINT "FK_565f7faa87fc2d066afc6039a58" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."otogrowAiSpendEvent" ADD CONSTRAINT "FK_4823eb64b8ac4a99f8efac74a85" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."otogrowAiSpendEvent" DROP CONSTRAINT "FK_4823eb64b8ac4a99f8efac74a85"');
    await queryRunner.query('ALTER TABLE "core"."otogrowAiSpend" DROP CONSTRAINT "FK_565f7faa87fc2d066afc6039a58"');
    await queryRunner.query('ALTER TABLE "core"."otogrowAiPrice" DROP CONSTRAINT "FK_d5cdb54be4efbe30b9895101fc5"');
    await queryRunner.query('ALTER TABLE "core"."otogrowAiBudget" DROP CONSTRAINT "FK_b40ecd1dfda7324134c059d31c0"');
    await queryRunner.query('DROP INDEX "core"."IDX_ee27104d886ffd77b1dadab17e"');
    await queryRunner.query('DROP TABLE "core"."otogrowAiSpendEvent"');
    await queryRunner.query('DROP INDEX "core"."IDX_c36308b5d3cb37500f991c8e29"');
    await queryRunner.query('DROP INDEX "core"."IDX_0c351c6aef3962d6d9f53a75bf"');
    await queryRunner.query('DROP INDEX "core"."IDX_fb9bd3097e37d969b623d20346"');
    await queryRunner.query('DROP INDEX "core"."IDX_ba12fb4357da7885d4bea3635d"');
    await queryRunner.query('DROP TABLE "core"."otogrowAiSpend"');
    await queryRunner.query('DROP INDEX "core"."IDX_bb2548e4d6d56607c8a606ad71"');
    await queryRunner.query('DROP TABLE "core"."otogrowAiPrice"');
    await queryRunner.query('DROP INDEX "core"."IDX_c19d0b534cc40cff4108a0fd0c"');
    await queryRunner.query('DROP TABLE "core"."otogrowAiBudget"');
  }
}
