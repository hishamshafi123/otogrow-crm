import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.34.0', 1792969805124)
export class AddDeliveryTeamChatFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."deliveryChatMessage" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "position" BIGSERIAL NOT NULL, "senderId" uuid NOT NULL, "recipientId" uuid NOT NULL, "requestId" uuid NOT NULL, "senderName" text NOT NULL, "recipientName" text NOT NULL, "text" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "viewedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_41d28a10fba3008f334a65c1ce4" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_03239758f4e2107690e9719a9e" ON "core"."deliveryChatMessage" ("viewedAt", "createdAt") ');
    await queryRunner.query('CREATE INDEX "IDX_deliveryChatMessage_recipient_history" ON "core"."deliveryChatMessage" ("workspaceId", "recipientId", "senderId", "position") ');
    await queryRunner.query('CREATE INDEX "IDX_deliveryChatMessage_sender_history" ON "core"."deliveryChatMessage" ("workspaceId", "senderId", "recipientId", "position") ');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_b78de5deb6ec8223ef9c4de8ad" ON "core"."deliveryChatMessage" ("workspaceId", "senderId", "requestId") ');
    await queryRunner.query('ALTER TABLE "core"."deliveryChatMessage" ADD CONSTRAINT "FK_e6f4cb55a6038eb44020727a17b" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ exists }]: { exists: boolean }[] = await queryRunner.query('SELECT EXISTS (SELECT 1 FROM "core"."deliveryChatMessage") AS exists');
    // Chat history requires an explicit export/restore before removing its storage.
    if (exists) throw new Error('Restore team chat history before removing its table.');
    await queryRunner.query('DROP TABLE "core"."deliveryChatMessage"');
  }
}
