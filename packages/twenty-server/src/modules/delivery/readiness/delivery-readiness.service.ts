import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { readDeliveryOperations } from 'src/modules/delivery/read-delivery-snapshot';
import { DeliveryMetaService } from 'src/modules/delivery/advertising/delivery-meta.service';
import { resolveMetaClientRouting } from 'src/modules/delivery/advertising/delivery-meta-client-routing';
import { TelegramConfigEntity } from 'src/modules/lead-assignment/entities/telegram-config.entity';
import {
  manualReadiness,
  metaReadiness,
} from 'src/modules/delivery/readiness/delivery-readiness.policy';
import {
  type DeliveryReadinessItemDTO,
  type DeliveryReadinessSnapshotDTO,
} from 'src/modules/delivery/readiness/delivery-readiness.dto';

@Injectable()
export class DeliveryReadinessService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly meta: DeliveryMetaService,
    private readonly roleAccess: OtogrowAccessService,
  ) {}

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    now = new Date(),
  ): Promise<DeliveryReadinessSnapshotDTO> {
    return readDeliveryOperations(
      this.dataSource,
      workspace.id,
      async (state, manager) => {
        const actor = await this.delivery.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        if (!actor.isAdmin) throw new ForbiddenException();
        const items = manualReadiness();
        const connections = state.metaReporting?.connections ?? [];
        if (!connections.length)
          items.unshift({
            id: 'META',
            capability: 'META',
            accountName: null,
            status: 'NEEDS_SETUP',
            reason: 'META_SETUP',
            destination: 'ads',
            lastSuccessAt: null,
          });
        for (const connection of connections) {
          let mappingValid = false;
          try {
            await this.meta.validateReportRouting(
              workspace,
              resolveMetaClientRouting(state, connection),
              manager,
            );
            mappingValid = true;
          } catch {
            mappingValid = false;
          }
          let ownerValid = false;
          try {
            ownerValid = (
              await this.delivery.actor(
                workspace,
                connection.ownerId,
                connection.userWorkspaceId,
                manager,
              )
            ).isAdmin;
          } catch {
            ownerValid = false;
          }
          items.unshift(
            metaReadiness(
              connection,
              mappingValid,
              state.metaReporting?.workerSeenAt ?? null,
              now,
              ownerValid,
            ),
          );
        }
        const bot = await manager
          .getRepository(TelegramConfigEntity)
          .findOneBy({ workspaceId: workspace.id });
        const activeMembers = await this.roleAccess.listActiveMembers(
          workspace.id,
          manager,
        );
        const activeIds = new Set(
          activeMembers.map((member) => member.memberId),
        );
        const linked = Object.keys(state.connections).some((id) =>
          activeIds.has(id),
        );
        const telegram: DeliveryReadinessItemDTO = {
          id: 'TELEGRAM_CHAT',
          capability: 'TELEGRAM_CHAT',
          accountName: null,
          status: 'AVAILABLE',
          reason: 'TELEGRAM_CONFIGURED',
          destination: 'operations',
          lastSuccessAt: null,
        };
        if (!bot?.isActive || !bot.botUsername) {
          telegram.status = 'NEEDS_SETUP';
          telegram.reason = 'TELEGRAM_BOT';
        } else if (!state.telegramEnabled) {
          telegram.status = 'PAUSED';
          telegram.reason = 'TELEGRAM_PAUSED';
        } else if (!linked) {
          telegram.status = 'NEEDS_SETUP';
          telegram.reason = 'TELEGRAM_RECIPIENTS';
        }
        const deliveryTelegram = {
          ...telegram,
          id: 'TELEGRAM_DELIVERY',
          capability: 'TELEGRAM_DELIVERY',
        };
        if (!state.enabled && telegram.status === 'AVAILABLE') {
          deliveryTelegram.status = 'PAUSED';
          deliveryTelegram.reason = 'DELIVERY_REMINDERS_PAUSED';
        }
        items.unshift(telegram, deliveryTelegram);
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          observedAt: now.toISOString(),
          items,
        };
      },
    );
  }
}
