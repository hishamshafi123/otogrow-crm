import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { type Repository } from 'typeorm';

import { type UpsertSetterProfileInput } from 'src/modules/lead-assignment/dtos/upsert-setter-profile.input';
import { SetterProfileEntity } from 'src/modules/lead-assignment/entities/setter-profile.entity';

@Injectable()
export class SetterProfileService {
  constructor(
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository -- every method receives an explicit workspaceId; no ambient workspace context
    @InjectRepository(SetterProfileEntity)
    private readonly setterProfileRepository: Repository<SetterProfileEntity>,
  ) {}

  async findByWorkspaceId(workspaceId: string): Promise<SetterProfileEntity[]> {
    return this.setterProfileRepository.find({ where: { workspaceId } });
  }

  async findByWorkspaceMember(
    workspaceId: string,
    workspaceMemberId: string,
  ): Promise<SetterProfileEntity | null> {
    return this.setterProfileRepository.findOne({
      where: { workspaceId, workspaceMemberId },
    });
  }

  async upsert(
    input: UpsertSetterProfileInput,
    workspaceId: string,
  ): Promise<SetterProfileEntity> {
    const existing = await this.findByWorkspaceMember(
      workspaceId,
      input.workspaceMemberId,
    );

    if (isDefined(existing)) {
      return this.setterProfileRepository.save({
        ...existing,
        isSetter: input.isSetter,
        activeDays: input.activeDays,
        activeStartHour: input.activeStartHour,
        activeEndHour: input.activeEndHour,
        dailyLeadCap: input.dailyLeadCap ?? null,
      });
    }

    return this.setterProfileRepository.save({
      workspaceId,
      workspaceMemberId: input.workspaceMemberId,
      isSetter: input.isSetter,
      activeDays: input.activeDays,
      activeStartHour: input.activeStartHour,
      activeEndHour: input.activeEndHour,
      dailyLeadCap: input.dailyLeadCap ?? null,
    });
  }

  async setTelegramChatId(
    workspaceId: string,
    workspaceMemberId: string,
    telegramChatId: string,
  ): Promise<SetterProfileEntity | null> {
    const existing = await this.findByWorkspaceMember(
      workspaceId,
      workspaceMemberId,
    );

    if (!isDefined(existing)) {
      return null;
    }

    return this.setterProfileRepository.save({
      ...existing,
      telegramChatId,
    });
  }

  async updateLastAssignedAt(id: string, lastAssignedAt: Date): Promise<void> {
    await this.setterProfileRepository.update(id, { lastAssignedAt });
  }
}
