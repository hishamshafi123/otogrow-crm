import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { QuoteWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote.workspace-entity';
import {
  QUOTE_STATUSES,
  type QuoteStatus,
} from 'src/modules/quoting/types/quote.types';
import { createQuoteNote } from 'src/modules/quoting/utils/create-quote-note.util';

@Injectable()
export class QuoteStatusService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async updateStatus({
    workspaceId,
    quoteId,
    status,
  }: {
    workspaceId: string;
    quoteId: string;
    status: string;
  }): Promise<void> {
    if (!QUOTE_STATUSES.includes(status as QuoteStatus)) {
      throw new BadRequestException(
        `Invalid quote status "${status}" (expected one of ${QUOTE_STATUSES.join(', ')})`,
      );
    }

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const quoteRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            QuoteWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        const quote = await quoteRepository.findOne({
          where: { id: quoteId },
        });

        if (!isDefined(quote)) {
          throw new NotFoundException(`Quote ${quoteId} not found`);
        }

        if (quote.status === status) {
          return;
        }

        const previousStatus = quote.status;

        await quoteRepository.update(quote.id, { status });

        await createQuoteNote({
          globalWorkspaceOrmManager: this.globalWorkspaceOrmManager,
          workspaceId,
          quote,
          title: `Quote ${quote.quoteNumber ?? ''} status changed`.trim(),
          markdown: `Quote status changed from **${previousStatus}** to **${status}**.`,
        });
      },
      buildSystemAuthContext(workspaceId),
    );
  }
}
