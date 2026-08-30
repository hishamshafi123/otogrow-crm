import { Injectable, NotFoundException } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import {
  TwentyORMException,
  TwentyORMExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { QuoteWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote.workspace-entity';

const QUOTE_NUMBER_PATTERN = /^QT-(\d+)$/;

const QUOTE_NUMBER_MAX_ATTEMPTS = 2;

const isDuplicateEntryError = (error: unknown) =>
  error instanceof TwentyORMException &&
  error.code === TwentyORMExceptionCode.DUPLICATE_ENTRY_DETECTED;

@Injectable()
export class QuoteNumberService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async assignIfMissing({
    workspaceId,
    quoteId,
  }: {
    workspaceId: string;
    quoteId: string;
  }): Promise<string> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const quoteRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            QuoteWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        for (let attempt = 0; attempt < QUOTE_NUMBER_MAX_ATTEMPTS; attempt++) {
          const quote = await quoteRepository.findOne({
            where: { id: quoteId },
          });

          if (!isDefined(quote)) {
            throw new NotFoundException(`Quote ${quoteId} not found`);
          }

          if (isNonEmptyString(quote.quoteNumber)) {
            return quote.quoteNumber;
          }

          // Soft-deleted quotes still hold their number via the unique index,
          // so they must count towards the max.
          const quoteNumbers = await quoteRepository.find({
            select: ['quoteNumber'],
            withDeleted: true,
          });

          const nextQuoteNumber = this.computeNextQuoteNumber(
            quoteNumbers.map((row) => row.quoteNumber),
          );

          try {
            await quoteRepository.update(quoteId, {
              quoteNumber: nextQuoteNumber,
            });

            return nextQuoteNumber;
          } catch (error) {
            // A concurrent quote creation can win the number race; recompute
            // once and let the unique index keep numbers unique either way.
            if (!isDuplicateEntryError(error)) {
              throw error;
            }
          }
        }

        throw new Error(
          `Could not assign a unique quote number to quote ${quoteId}`,
        );
      },
      buildSystemAuthContext(workspaceId),
    );
  }

  private computeNextQuoteNumber(
    existingQuoteNumbers: (string | null)[],
  ): string {
    const maxNumber = existingQuoteNumbers
      .filter(isNonEmptyString)
      .map((quoteNumber) => QUOTE_NUMBER_PATTERN.exec(quoteNumber)?.[1])
      .filter(isDefined)
      .map(Number)
      .reduce((max, value) => Math.max(max, value), 0);

    return `QT-${`${maxNumber + 1}`.padStart(4, '0')}`;
  }
}
