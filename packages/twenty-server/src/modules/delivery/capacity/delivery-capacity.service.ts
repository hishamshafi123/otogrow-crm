import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource, type EntityManager } from 'typeorm';
import { isDefined } from 'twenty-shared/utils';
import { z } from 'zod';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { DeliveryAvailabilityEntity } from 'src/modules/delivery/capacity/entities/delivery-availability.entity';
import {
  deliveryAvailabilitySchema,
  deliveryCapacityQuerySchema,
} from 'src/modules/delivery/capacity/delivery-capacity.types';
import {
  type DeliveryCapacityDTO,
  type DeliveryAvailabilityDTO,
} from 'src/modules/delivery/capacity/delivery-capacity.dto';

const parse = <TOutput>(
  schema: z.ZodType<TOutput>,
  value: unknown,
): TOutput => {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException(
      'Enter a valid date and whole minutes. Leave availability blank if unknown.',
    );
  return parsed.data;
};

@Injectable()
export class DeliveryCapacityService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
  ) {}

  private async requireManager(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager,
  ) {
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (!actor.isManager)
      throw new ForbiddenException(
        'A delivery manager is required to plan team capacity.',
      );
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryCapacityDTO> {
    const { startDate } = parse(deliveryCapacityQuerySchema, input);
    const end = new Date(`${startDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    if (end.getUTCFullYear() > 9999)
      throw new BadRequestException('Choose an earlier capacity start date.');
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        await this.requireManager(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        const members = new Set(
          (await this.access.listActiveMembers(workspace.id, manager)).map(
            (member) => member.memberId,
          ),
        );
        const availability = (
          await manager.getRepository(DeliveryAvailabilityEntity).findBy({
            workspaceId: workspace.id,
            date: Between(startDate, end.toISOString().slice(0, 10)),
          })
        ).filter((row) => members.has(row.memberId));
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          startDate,
          availability,
        };
      },
    );
  }

  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryAvailabilityDTO> {
    const fields = parse(deliveryAvailabilitySchema, input);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        await this.requireManager(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        if (
          !(await this.access.listActiveMembers(workspace.id, manager)).some(
            (member) => member.memberId === fields.memberId,
          )
        )
          throw new BadRequestException('Choose an active teammate.');
        // Lock the exact slot so independent availability edits can proceed while revocation stays serialized.
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [
            `delivery-availability:${workspace.id}:${fields.memberId}:${fields.date}`,
          ],
        );
        const repository = manager.getRepository(DeliveryAvailabilityEntity);
        const current = await repository.findOneBy({
          workspaceId: workspace.id,
          memberId: fields.memberId,
          date: fields.date,
        });
        if ((current?.revision ?? 0) !== fields.revision)
          throw new ConflictException(
            'Availability changed. Reload the latest version before saving.',
          );
        const saved = await repository.save({
          ...current,
          ...fields,
          workspaceId: workspace.id,
          revision: fields.revision + 1,
        });
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          actorType: 'HUMAN',
          subjectMemberId: fields.memberId,
          category: 'DELIVERY',
          action: 'AVAILABILITY_UPDATED',
          outcome: 'RECORDED',
          summary: 'Updated daily planning availability.',
          sourceType: 'capacity',
          sourceId: saved.id,
          changes: [
            {
              field: 'scheduledDate',
              before: current?.date ?? null,
              after: fields.date,
            },
            {
              field: 'availableMinutes',
              before: isDefined(current?.minutes)
                ? String(current.minutes)
                : null,
              after: isDefined(fields.minutes) ? String(fields.minutes) : null,
            },
            {
              field: 'revision',
              before: current ? String(current.revision) : null,
              after: String(saved.revision),
            },
          ],
        });
        return saved;
      },
    );
  }
}
