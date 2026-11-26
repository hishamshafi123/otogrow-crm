import { ForbiddenException, Injectable } from '@nestjs/common';
import { type FindOptionsSelect, ILike, In } from 'typeorm';
import { escapeForIlike } from 'twenty-shared/utils';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { CompanyWorkspaceEntity } from 'src/modules/company/standard-objects/company.workspace-entity';
import {
  clientSetupHash,
  type ClientSetupCompany,
} from 'src/modules/delivery/onboarding/delivery-client-setup.policy';

export type ClientDirectoryCompany = ClientSetupCompany & {
  domainName: string | null;
};

// CompanyWorkspaceEntity.domainName is a composite LINKS field whose persisted
// columns are flattened via computeCompositeColumnName; selecting "domainName"
// throws EntityPropertyNotFoundError / UNKNOWN_COLUMN in Twenty ORM v1 and v2.
const DIRECTORY_COMPANY_SELECT = {
  id: true,
  name: true,
  domainNamePrimaryLinkUrl: true,
  domainNamePrimaryLinkLabel: true,
  updatedAt: true,
} as unknown as FindOptionsSelect<CompanyWorkspaceEntity>;

type DirectoryCompanyRow = Pick<
  CompanyWorkspaceEntity,
  'id' | 'name' | 'updatedAt'
> & {
  domainName?: CompanyWorkspaceEntity['domainName'] | null;
  domainNamePrimaryLinkUrl?: string | null;
  domainNamePrimaryLinkLabel?: string | null;
};

const companyView = (
  company: Pick<CompanyWorkspaceEntity, 'id' | 'name' | 'updatedAt'>,
): ClientSetupCompany => {
  const updatedAt = new Date(company.updatedAt).toISOString();
  return {
    id: company.id,
    name: company.name ?? '',
    updatedAt,
    sourceToken: clientSetupHash({
      id: company.id,
      name: company.name ?? '',
      updatedAt,
    }),
  };
};

const directoryCompanyView = (
  company: DirectoryCompanyRow,
): ClientDirectoryCompany => ({
  ...companyView(company),
  domainName:
    company.domainName?.primaryLinkUrl?.trim() ||
    company.domainName?.primaryLinkLabel?.trim() ||
    company.domainNamePrimaryLinkUrl?.trim() ||
    company.domainNamePrimaryLinkLabel?.trim() ||
    null,
});

@Injectable()
export class DeliveryClientSetupSourceService {
  constructor(private readonly orm: GlobalWorkspaceOrmManager) {}
  private permissions() {
    const context = getWorkspaceContext();
    if (context.authContext.type !== 'user')
      throw new ForbiddenException('Sign in to set up client work.');
    const permissions = resolveRolePermissionConfig(context);
    if (!permissions)
      throw new ForbiddenException('Your CRM permissions are unavailable.');
    return permissions;
  }
  async list(auth: WorkspaceAuthContext, search: string) {
    return this.orm.executeInWorkspaceContext(async () => {
      const repository = await this.orm.getRepository(
        auth.workspace.id,
        CompanyWorkspaceEntity,
        this.permissions(),
      );
      const rows = await repository.find({
        where: search ? { name: ILike(`%${escapeForIlike(search)}%`) } : {},
        select: { id: true, name: true, updatedAt: true },
        order: { name: 'ASC', id: 'ASC' },
        take: 51,
      });
      return {
        companies: rows.slice(0, 50).map(companyView),
        companiesHasMore: rows.length > 50,
      };
    }, auth);
  }
  async listByIds(
    auth: WorkspaceAuthContext,
    ids: string[],
  ): Promise<ClientDirectoryCompany[]> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return [];
    return this.orm.executeInWorkspaceContext(async () => {
      const repository = await this.orm.getRepository(
        auth.workspace.id,
        CompanyWorkspaceEntity,
        this.permissions(),
      );
      const rows = await repository.find({
        where: { id: In(uniqueIds) },
        select: DIRECTORY_COMPANY_SELECT,
        order: { name: 'ASC', id: 'ASC' },
      });
      return rows.map(directoryCompanyView);
    }, auth);
  }
  async searchDirectory(
    auth: WorkspaceAuthContext,
    search: string,
    limit = 100,
  ): Promise<{ companies: ClientDirectoryCompany[]; hasMore: boolean }> {
    const trimmed = search.trim();
    const boundedLimit = Math.min(Math.max(limit, 1), 200);
    return this.orm.executeInWorkspaceContext(async () => {
      const repository = await this.orm.getRepository(
        auth.workspace.id,
        CompanyWorkspaceEntity,
        this.permissions(),
      );
      const rows = await repository.find({
        where: trimmed ? { name: ILike(`%${escapeForIlike(trimmed)}%`) } : {},
        select: DIRECTORY_COMPANY_SELECT,
        order: { name: 'ASC', id: 'ASC' },
        take: boundedLimit + 1,
      });
      return {
        companies: rows.slice(0, boundedLimit).map(directoryCompanyView),
        hasMore: rows.length > boundedLimit,
      };
    }, auth);
  }
  async read(
    auth: WorkspaceAuthContext,
    companyId: string,
  ): Promise<ClientSetupCompany | null> {
    return this.orm.executeInWorkspaceContext(async () => {
      const repository = await this.orm.getRepository(
        auth.workspace.id,
        CompanyWorkspaceEntity,
        this.permissions(),
      );
      const company = await repository.findOne({
        where: { id: companyId },
        select: { id: true, name: true, updatedAt: true },
      });
      return company ? companyView(company) : null;
    }, auth);
  }
}
