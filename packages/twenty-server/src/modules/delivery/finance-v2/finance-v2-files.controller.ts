import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type Response } from 'express';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryFinanceV2Service } from 'src/modules/delivery/finance-v2/finance-v2.service';

@Controller('portal/delivery-finance-v2-files')
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
export class DeliveryFinanceV2FilesController {
  constructor(private readonly financeV2: DeliveryFinanceV2Service) {}

  @Get('quotes/:quoteId/pdf')
  async quotePdf(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Res() response: Response,
  ) {
    const { buffer, filename } = await this.financeV2.downloadQuotePdf(
      workspace,
      memberId,
      userWorkspaceId,
      quoteId,
    );
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(buffer);
  }

  @Get('invoices/:invoiceId/pdf')
  async invoicePdf(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Res() response: Response,
  ) {
    const { buffer, filename } = await this.financeV2.downloadInvoicePdf(
      workspace,
      memberId,
      userWorkspaceId,
      invoiceId,
    );
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(buffer);
  }
}
