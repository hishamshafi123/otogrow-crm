import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, IsNull, type Repository } from 'typeorm';

import {
  KeyValuePairEntity,
  KeyValuePairType,
} from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { KeyValuePairService } from 'src/engine/core-modules/key-value-pair/key-value-pair.service';
import { MetaSheetLeadEntity } from 'src/engine/metadata-modules/meta-ads-config/entities/meta-sheet-lead.entity';

const READ_RECEIPT_PREFIX = 'metaSheetLeadRead:';

@Injectable()
export class MetaLeadFormReadService {
  constructor(
    // oxlint-disable-next-line twenty/prefer-workspace-scoped-repository -- every query explicitly scopes workspace and authenticated user
    @InjectRepository(KeyValuePairEntity)
    private readonly keyValuePairRepository: Repository<KeyValuePairEntity>,
    // oxlint-disable-next-line twenty/prefer-workspace-scoped-repository -- every query explicitly scopes workspace
    @InjectRepository(MetaSheetLeadEntity)
    private readonly leadRepository: Repository<MetaSheetLeadEntity>,
    private readonly keyValuePairService: KeyValuePairService<
      Record<string, boolean>
    >,
  ) {}

  getActivity(workspaceId: string, userId: string) {
    return this.leadRepository
      .createQueryBuilder('lead')
      .leftJoin(
        KeyValuePairEntity,
        'receipt',
        'receipt.key = :prefix || CAST(lead.id AS text) AND receipt.workspaceId = :workspaceId AND receipt.userId = :userId AND receipt.applicationId IS NULL AND receipt.type = :type',
        {
          prefix: READ_RECEIPT_PREFIX,
          workspaceId,
          userId,
          type: KeyValuePairType.USER_VARIABLE,
        },
      )
      .select('lead.formId', 'formId')
      .addSelect('COUNT(*)::int', 'totalCount')
      .addSelect(
        'COUNT(*) FILTER (WHERE receipt.id IS NULL)::int',
        'unreadCount',
      )
      .where('lead.workspaceId = :workspaceId AND lead.skipped = false', {
        workspaceId,
      })
      .groupBy('lead.formId')
      .getRawMany<{
        formId: string;
        totalCount: number;
        unreadCount: number;
      }>();
  }

  async getReadLeadIds(workspaceId: string, userId: string, leadIds: string[]) {
    if (leadIds.length === 0) return new Set<string>();
    const receipts = await this.keyValuePairRepository.find({
      where: {
        workspaceId,
        userId,
        applicationId: IsNull(),
        type: KeyValuePairType.USER_VARIABLE,
        key: In(leadIds.map((id) => `${READ_RECEIPT_PREFIX}${id}`)),
      },
      select: { key: true },
    });
    return new Set(
      receipts.map((receipt) => receipt.key.slice(READ_RECEIPT_PREFIX.length)),
    );
  }

  async markRead(
    workspaceId: string,
    userId: string,
    formId: string,
    leadIds: string[],
  ) {
    if (leadIds.length === 0 || leadIds.length > 50)
      throw new BadRequestException('Choose between 1 and 50 displayed leads.');
    const uniqueLeadIds = [...new Set(leadIds)];
    const leads = await this.leadRepository.find({
      where: { workspaceId, formId, skipped: false, id: In(uniqueLeadIds) },
      select: { id: true },
    });

    if (leads.length !== uniqueLeadIds.length)
      throw new BadRequestException('Some leads do not belong to this form.');
    // Exact IDs keep concurrently arriving leads unread, even within the same sync batch.
    await Promise.all(
      leads.map((lead) =>
        this.keyValuePairService.setIfNotExists({
          workspaceId,
          userId,
          key: `${READ_RECEIPT_PREFIX}${lead.id}`,
          value: true,
          type: KeyValuePairType.USER_VARIABLE,
        }),
      ),
    );
    return true;
  }
}
