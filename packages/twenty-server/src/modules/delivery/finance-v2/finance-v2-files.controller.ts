import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
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

const PDF_RATE_WINDOW_MS = 60_000;
const PDF_RATE_LIMIT = 60;

@Controller('portal/delivery-finance-v2-files')
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
export class DeliveryFinanceV2FilesController {
  private readonly downloadRateLog = new Map<string, number[]>();

  constructor(private readonly financeV2: DeliveryFinanceV2Service) {}

  private assertPdfRateLimit(workspaceId: string, memberId: string): void {
    const key = `${workspaceId}:${memberId}`;
    const now = Date.now();
    if (this.downloadRateLog.size > 200) {
      for (const [entryKey, timestamps] of this.downloadRateLog.entries()) {
        const active = timestamps.filter(
          (timestamp) => now - timestamp < PDF_RATE_WINDOW_MS,
        );
        if (active.length === 0) {
          this.downloadRateLog.delete(entryKey);
        } else {
          this.downloadRateLog.set(entryKey, active);
        }
      }
    }
    const recent = (this.downloadRateLog.get(key) ?? []).filter(
      (timestamp) => now - timestamp < PDF_RATE_WINDOW_MS,
    );
    if (recent.length >= PDF_RATE_LIMIT) {
      this.downloadRateLog.set(key, recent);
      throw new HttpException(
        'Too many PDF downloads. Please wait a minute and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.downloadRateLog.set(key, recent);
  }

  @Get('quotes/:quoteId/pdf')
  async quotePdf(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Res() response: Response,
  ) {
    this.assertPdfRateLimit(workspace.id, memberId);
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
    this.assertPdfRateLimit(workspace.id, memberId);
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

  @Get('profile/logo')
  async companyLogo(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ) {
    const { buffer, mimeType, etag } = await this.financeV2.downloadCompanyLogo(
      workspace,
      memberId,
      userWorkspaceId,
    );
    const matchesEtag =
      typeof ifNoneMatch === 'string' &&
      ifNoneMatch
        .split(',')
        .map((tag) => tag.trim())
        .some((tag) => {
          if (tag === '*') return true;
          const normalized = tag.startsWith('W/') ? tag.slice(2).trim() : tag;
          return normalized === etag;
        });
    if (matchesEtag) {
      response.set({
        ETag: etag,
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      response.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }
    response.set({
      'Content-Type': mimeType,
      ETag: etag,
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(buffer);
  }
}
