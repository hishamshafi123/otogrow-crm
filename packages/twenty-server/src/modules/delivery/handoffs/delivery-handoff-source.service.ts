import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ILike, In } from 'typeorm';
import { escapeForIlike, isDefined } from 'twenty-shared/utils';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { OpportunityWorkspaceEntity } from 'src/modules/opportunity/standard-objects/opportunity.workspace-entity';
import { QuoteWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote.workspace-entity';
import { QuoteLineItemWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote-line-item.workspace-entity';
import { CompanyWorkspaceEntity } from 'src/modules/company/standard-objects/company.workspace-entity';

export type DeliveryHandoffSource = {
  opportunityId: string;
  opportunityName: string;
  companyId: string;
  companyName: string;
  quoteId: string;
  quoteNumber: string;
  scope: string;
  fingerprint: string;
  totalAmountMicros: string | null;
  currency: string | null;
};
@Injectable()
export class DeliveryHandoffSourceService {
  constructor(private readonly orm: GlobalWorkspaceOrmManager) {}
  private permissions() {
    const context = getWorkspaceContext();
    if (context.authContext.type !== 'user')
      throw new ForbiddenException('Sign in to review a sales handoff.');
    const permissions = resolveRolePermissionConfig(context);
    if (!permissions)
      throw new ForbiddenException('Your CRM role is unavailable.');
    return permissions;
  }
  async list(auth: WorkspaceAuthContext, search: string) {
    return this.orm.executeInWorkspaceContext(async () => {
      const permissions = this.permissions();
      const opportunities = await this.orm.getRepository(
        auth.workspace.id,
        OpportunityWorkspaceEntity,
        permissions,
      );
      const rows = await opportunities.find({
        where: {
          stage: 'CUSTOMER',
          ...(search ? { name: ILike(`%${escapeForIlike(search)}%`) } : {}),
        },
        select: { id: true, name: true, companyId: true },
        order: { updatedAt: 'DESC', id: 'ASC' },
        take: 26,
      });
      const visible = rows.slice(0, 25);
      const quotes = await this.orm.getRepository(
        auth.workspace.id,
        QuoteWorkspaceEntity,
        permissions,
      );
      const accepted = visible.length
        ? await quotes.find({
            where: {
              status: 'ACCEPTED',
              opportunityId: In(visible.map((row) => row.id)),
            },
            select: { id: true, quoteNumber: true, opportunityId: true },
            order: { updatedAt: 'DESC', id: 'ASC' },
            take: 101,
          })
        : [];
      return {
        hasMore: rows.length > 25 || accepted.length > 100,
        opportunities: visible.map((row) => ({
          id: row.id,
          name: row.name,
          hasCompany: isDefined(row.companyId),
          quotes: accepted
            .slice(0, 100)
            .filter((quote) => quote.opportunityId === row.id)
            .map((quote) => ({
              id: quote.id,
              name: quote.quoteNumber ?? quote.id,
            })),
        })),
      };
    }, auth);
  }
  async read(
    auth: WorkspaceAuthContext,
    opportunityId: string,
    quoteId: string,
  ): Promise<DeliveryHandoffSource> {
    return this.orm.executeInWorkspaceContext(async () => {
      const permissions = this.permissions();
      const opportunityRepository = await this.orm.getRepository(
        auth.workspace.id,
        OpportunityWorkspaceEntity,
        permissions,
      );
      const opportunity = await opportunityRepository.findOne({
        where: { id: opportunityId },
        select: {
          id: true,
          name: true,
          companyId: true,
          stage: true,
          updatedAt: true,
        },
      });
      if (!isDefined(opportunity))
        throw new NotFoundException(
          'Deal is not available with your current CRM permissions.',
        );
      if (opportunity.stage !== 'CUSTOMER')
        throw new BadRequestException(
          'Only won deals can be handed into delivery.',
        );
      if (!isDefined(opportunity.companyId))
        throw new BadRequestException(
          'Link this deal to a client company first.',
        );
      const companyRepository = await this.orm.getRepository(
        auth.workspace.id,
        CompanyWorkspaceEntity,
        permissions,
      );
      const company = await companyRepository.findOne({
        where: { id: opportunity.companyId },
        select: { id: true, name: true },
      });
      if (!isDefined(company))
        throw new NotFoundException('Client company is not available.');
      const quoteRepository = await this.orm.getRepository(
        auth.workspace.id,
        QuoteWorkspaceEntity,
        permissions,
      );
      // Native composite currencies use flattened database columns in select clauses.
      const quote = await quoteRepository
        .createQueryBuilder('quote')
        .select([
          'quote.id',
          'quote.status',
          'quote.companyId',
          'quote.quoteNumber',
          'quote.terms',
          'quote.totalAmountMicros',
          'quote.totalCurrencyCode',
          'quote.updatedAt',
        ])
        .where('quote.id = :quoteId', { quoteId })
        .andWhere('quote.opportunityId = :opportunityId', { opportunityId })
        .getOne();
      if (!isDefined(quote) || quote.status !== 'ACCEPTED')
        throw new BadRequestException(
          'Select an accepted quote for this deal.',
        );
      if (quote.companyId !== company.id)
        throw new BadRequestException(
          'The accepted quote and deal must belong to the same client company.',
        );
      const lineRepository = await this.orm.getRepository(
        auth.workspace.id,
        QuoteLineItemWorkspaceEntity,
        permissions,
      );
      const lines = await lineRepository.find({
        where: { quoteId },
        select: {
          id: true,
          label: true,
          description: true,
          quantity: true,
          updatedAt: true,
        },
        order: { position: 'ASC', id: 'ASC' },
        take: 101,
      });
      if (!lines.length || lines.length > 100)
        throw new BadRequestException(
          'An accepted quote needs between 1 and 100 scope lines for this handoff.',
        );
      const scope =
        lines
          .map(
            (line) =>
              `${line.quantity} × ${line.label}${line.description ? '\n' + line.description : ''}`,
          )
          .join('\n\n') +
        (quote.terms ? '\n\nAgreed terms\n' + quote.terms : '');
      if (scope.length > 6000)
        throw new BadRequestException(
          'This quote is too long for automatic scope import. Create a reviewed delivery summary through the engagement form and retain the quote as its source.',
        );
      const source = {
        opportunityId,
        opportunityName: opportunity.name,
        companyId: company.id,
        companyName: company.name ?? 'Unnamed client',
        quoteId,
        quoteNumber: quote.quoteNumber ?? quote.id,
        scope,
        totalAmountMicros: isDefined(quote.total?.amountMicros)
          ? String(quote.total.amountMicros)
          : null,
        currency: quote.total?.currencyCode ?? null,
      };
      return {
        ...source,
        fingerprint: createHash('sha256')
          .update(
            JSON.stringify({
              source,
              opportunityUpdatedAt: opportunity.updatedAt,
              quoteUpdatedAt: quote.updatedAt,
              lines,
            }),
          )
          .digest('hex'),
      };
    }, auth);
  }
}
