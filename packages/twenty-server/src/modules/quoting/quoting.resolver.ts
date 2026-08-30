import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { CreateQuoteInput } from 'src/modules/quoting/dtos/create-quote.input';
import { QuotePdfService } from 'src/modules/quoting/services/quote-pdf.service';
import { QuoteStatusService } from 'src/modules/quoting/services/quote-status.service';
import { QuoteTotalsService } from 'src/modules/quoting/services/quote-totals.service';
import { QuoteService } from 'src/modules/quoting/services/quote.service';

// Quotes are workspace data — any authenticated workspace member may manage them.
@CoreResolver()
@UseFilters(AuthGraphqlApiExceptionFilter, PermissionsGraphqlApiExceptionFilter)
@UseGuards(WorkspaceAuthGuard, NoPermissionGuard)
@UsePipes(ResolverValidationPipe)
export class QuotingResolver {
  constructor(
    private readonly quoteService: QuoteService,
    private readonly quoteTotalsService: QuoteTotalsService,
    private readonly quotePdfService: QuotePdfService,
    private readonly quoteStatusService: QuoteStatusService,
  ) {}

  @Mutation(() => String)
  async createQuote(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('input') input: CreateQuoteInput,
  ): Promise<string> {
    return this.quoteService.create({ workspaceId: workspace.id, input });
  }

  @Mutation(() => Boolean)
  async recalculateQuoteTotals(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('quoteId', { type: () => UUIDScalarType }) quoteId: string,
  ): Promise<boolean> {
    await this.quoteTotalsService.recalculate({
      workspaceId: workspace.id,
      quoteId,
    });

    return true;
  }

  @Mutation(() => String)
  async generateQuotePdf(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('quoteId', { type: () => UUIDScalarType }) quoteId: string,
  ): Promise<string> {
    return this.quotePdfService.generatePdf({
      workspaceId: workspace.id,
      quoteId,
    });
  }

  @Mutation(() => Boolean)
  async updateQuoteStatus(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('quoteId', { type: () => UUIDScalarType }) quoteId: string,
    @Args('status') status: string,
  ): Promise<boolean> {
    await this.quoteStatusService.updateStatus({
      workspaceId: workspace.id,
      quoteId,
      status,
    });

    return true;
  }
}
