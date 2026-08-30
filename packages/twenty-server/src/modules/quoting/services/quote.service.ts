import { Injectable } from '@nestjs/common';

import { v4 } from 'uuid';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type CreateQuoteInput } from 'src/modules/quoting/dtos/create-quote.input';
import { QuoteNumberService } from 'src/modules/quoting/services/quote-number.service';
import { QuoteWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote.workspace-entity';
import { QUOTING_ACTOR } from 'src/modules/quoting/utils/create-quote-note.util';

@Injectable()
export class QuoteService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly quoteNumberService: QuoteNumberService,
  ) {}

  async create({
    workspaceId,
    input,
  }: {
    workspaceId: string;
    input: CreateQuoteInput;
  }): Promise<string> {
    const quoteId =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const quoteRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              QuoteWorkspaceEntity,
              { shouldBypassPermissionChecks: true },
            );

          const lastQuotePosition =
            (await quoteRepository.maximum('position', undefined)) ?? 0;
          const id = v4();

          await quoteRepository.insert({
            id,
            quoteNumber: null,
            status: 'DRAFT',
            taxPercent: input.taxPercent ?? 0,
            validUntil: input.validUntil ?? null,
            terms: input.terms ?? null,
            companyId: input.companyId ?? null,
            personId: input.personId ?? null,
            opportunityId: input.opportunityId ?? null,
            createdBy: QUOTING_ACTOR,
            position: lastQuotePosition + 1,
          });

          return id;
        },
        buildSystemAuthContext(workspaceId),
      );

    await this.quoteNumberService.assignIfMissing({ workspaceId, quoteId });

    return quoteId;
  }
}
