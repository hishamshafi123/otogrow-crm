import { Injectable, NotFoundException } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { STANDARD_OBJECT_FIELDS } from 'twenty-shared/metadata';
import { FileFolder } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { FileStorageService } from 'src/engine/core-modules/file-storage/services/file-storage.service';
import { FileUrlService } from 'src/engine/core-modules/file/file-url/file-url.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { AttachmentWorkspaceEntity } from 'src/modules/attachment/standard-objects/attachment.workspace-entity';
import { CompanyWorkspaceEntity } from 'src/modules/company/standard-objects/company.workspace-entity';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import { renderQuoteToPdfBuffer } from 'src/modules/quoting/pdf/render-quote-to-pdf.util';
import { QuoteNumberService } from 'src/modules/quoting/services/quote-number.service';
import { QuoteTotalsService } from 'src/modules/quoting/services/quote-totals.service';
import { QuoteLineItemWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote-line-item.workspace-entity';
import { QuoteWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote.workspace-entity';
import { type ResolvedQuote } from 'src/modules/quoting/types/quote.types';
import {
  createQuoteNote,
  QUOTING_ACTOR,
} from 'src/modules/quoting/utils/create-quote-note.util';

const formatDateLabel = (date: Date): string =>
  new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);

@Injectable()
export class QuotePdfService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly quoteTotalsService: QuoteTotalsService,
    private readonly quoteNumberService: QuoteNumberService,
    private readonly fileStorageService: FileStorageService,
    private readonly fileUrlService: FileUrlService,
    private readonly applicationService: ApplicationService,
  ) {}

  async generatePdf({
    workspaceId,
    quoteId,
  }: {
    workspaceId: string;
    quoteId: string;
  }): Promise<string> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const { pdfBuffer, quoteNumber, quote } =
          await this.resolveAndRenderQuotePdf({ workspaceId, quoteId });

        const fileId = v4();

        const { workspaceCustomFlatApplication } =
          await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
            { workspaceId },
          );

        await this.fileStorageService.writeFile({
          sourceFile: pdfBuffer,
          // Files-field validation only accepts files stored under the target
          // field's universal identifier.
          resourcePath: `${STANDARD_OBJECT_FIELDS.attachment.file.universalIdentifier}/${fileId}.pdf`,
          fileFolder: FileFolder.FilesField,
          applicationUniversalIdentifier:
            workspaceCustomFlatApplication.universalIdentifier,
          workspaceId,
          fileId,
          settings: {
            // The attachment insert below promotes the file from temporary to
            // permanent; writing it permanent here would be rejected.
            isTemporaryFile: true,
            toDelete: false,
          },
        });

        const attachmentRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            AttachmentWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        await attachmentRepository.insert({
          id: v4(),
          name: `${quoteNumber}.pdf`,
          file: [{ fileId, label: `${quoteNumber}.pdf`, extension: 'pdf' }],
          fileCategory: 'TEXT_DOCUMENT',
          createdBy: QUOTING_ACTOR,
          targetCompanyId: quote.companyId,
          targetPersonId: quote.personId,
          targetOpportunityId: quote.opportunityId,
        });

        await createQuoteNote({
          globalWorkspaceOrmManager: this.globalWorkspaceOrmManager,
          workspaceId,
          quote,
          title: `Quote ${quoteNumber} generated`,
          markdown: `Quote **${quoteNumber}** PDF generated.`,
        });

        if (quote.status === 'DRAFT') {
          const quoteRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              QuoteWorkspaceEntity,
              { shouldBypassPermissionChecks: true },
            );

          await quoteRepository.update(quote.id, { status: 'SENT' });

          await createQuoteNote({
            globalWorkspaceOrmManager: this.globalWorkspaceOrmManager,
            workspaceId,
            quote,
            title: `Quote ${quoteNumber} status changed`,
            markdown: `Quote status changed from **DRAFT** to **SENT**.`,
          });
        }

        return this.fileUrlService.signFileByIdUrl({
          fileId,
          workspaceId,
          fileFolder: FileFolder.FilesField,
        });
      },
      buildSystemAuthContext(workspaceId),
    );
  }

  // Renders a fresh PDF without storing it: used by the client portal, which
  // streams the buffer straight to the response. `companyId` scopes the quote
  // lookup so a portal only ever renders its own company's quotes.
  async renderQuotePdfBuffer({
    workspaceId,
    quoteId,
    companyId,
  }: {
    workspaceId: string;
    quoteId: string;
    companyId?: string;
  }): Promise<{ pdfBuffer: Buffer; quoteNumber: string }> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const { pdfBuffer, quoteNumber } = await this.resolveAndRenderQuotePdf({
          workspaceId,
          quoteId,
          companyId,
        });

        return { pdfBuffer, quoteNumber };
      },
      buildSystemAuthContext(workspaceId),
    );
  }

  private async resolveAndRenderQuotePdf({
    workspaceId,
    quoteId,
    companyId,
  }: {
    workspaceId: string;
    quoteId: string;
    companyId?: string;
  }): Promise<{
    pdfBuffer: Buffer;
    quoteNumber: string;
    quote: QuoteWorkspaceEntity;
  }> {
    // Totals are always recomputed before rendering so the PDF never shows
    // stale numbers.
    await this.quoteTotalsService.recalculate({ workspaceId, quoteId });

    const quoteNumber = await this.quoteNumberService.assignIfMissing({
      workspaceId,
      quoteId,
    });

    const quoteRepository = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      QuoteWorkspaceEntity,
      { shouldBypassPermissionChecks: true },
    );
    const lineItemRepository =
      await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        QuoteLineItemWorkspaceEntity,
        { shouldBypassPermissionChecks: true },
      );

    const quote = await quoteRepository.findOne({
      where: { id: quoteId, ...(isDefined(companyId) ? { companyId } : {}) },
    });

    if (!isDefined(quote)) {
      throw new NotFoundException(`Quote ${quoteId} not found`);
    }

    const lineItems = await lineItemRepository.find({
      where: { quoteId },
      order: { position: 'ASC' },
    });

    const customerName = await this.resolveCustomerName(workspaceId, quote);

    const currencyCode = quote.total?.currencyCode ?? 'USD';

    const resolved: ResolvedQuote = {
      quoteNumber,
      status: quote.status,
      issuedAtLabel: formatDateLabel(new Date()),
      validUntilLabel: isNonEmptyString(quote.validUntil)
        ? formatDateLabel(new Date(quote.validUntil))
        : null,
      customerName,
      taxPercent: quote.taxPercent,
      subtotalAmountMicros: quote.subtotal?.amountMicros ?? 0,
      taxAmountMicros: quote.taxAmount?.amountMicros ?? 0,
      totalAmountMicros: quote.total?.amountMicros ?? 0,
      currencyCode,
      terms: quote.terms,
      lineItems: lineItems.map((lineItem) => ({
        label: lineItem.label,
        description: lineItem.description,
        quantity: lineItem.quantity,
        unitPriceAmountMicros: lineItem.unitPrice?.amountMicros ?? 0,
        discountPercent: lineItem.discountPercent,
        lineTotalAmountMicros: lineItem.lineTotal?.amountMicros ?? 0,
      })),
    };

    const pdfBuffer = await renderQuoteToPdfBuffer(resolved);

    return { pdfBuffer, quoteNumber, quote };
  }

  private async resolveCustomerName(
    workspaceId: string,
    quote: Pick<QuoteWorkspaceEntity, 'companyId' | 'personId'>,
  ): Promise<string | null> {
    if (isDefined(quote.companyId)) {
      const companyRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          CompanyWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      const company = await companyRepository.findOne({
        where: { id: quote.companyId },
      });

      if (isDefined(company) && isNonEmptyString(company.name)) {
        return company.name;
      }
    }

    if (isDefined(quote.personId)) {
      const personRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          PersonWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      const person = await personRepository.findOne({
        where: { id: quote.personId },
      });

      if (isDefined(person)) {
        const fullName = [person.name?.firstName, person.name?.lastName]
          .filter(isNonEmptyString)
          .join(' ');

        if (isNonEmptyString(fullName)) {
          return fullName;
        }
      }
    }

    return null;
  }
}
