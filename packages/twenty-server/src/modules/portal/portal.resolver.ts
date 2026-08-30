import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { PortalAccessTokenDTO } from 'src/modules/portal/dtos/portal-access-token.dto';
import { PortalAccessDTO } from 'src/modules/portal/dtos/portal-access.dto';
import { type PortalAccessEntity } from 'src/modules/portal/entities/portal-access.entity';
import { PortalAccessService } from 'src/modules/portal/services/portal-access.service';

// Portal links are workspace data — any authenticated workspace member may
// manage them. Raw tokens are only returned by generate/regenerate.
@CoreResolver()
@UseFilters(AuthGraphqlApiExceptionFilter, PermissionsGraphqlApiExceptionFilter)
@UseGuards(WorkspaceAuthGuard, NoPermissionGuard)
@UsePipes(ResolverValidationPipe)
export class PortalResolver {
  constructor(private readonly portalAccessService: PortalAccessService) {}

  @Query(() => PortalAccessDTO, { nullable: true })
  async portalAccessForCompany(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('companyId', { type: () => UUIDScalarType }) companyId: string,
  ): Promise<PortalAccessDTO | null> {
    const portalAccess = await this.portalAccessService.findByCompany(
      workspace.id,
      companyId,
    );

    return this.toDTO(portalAccess);
  }

  @Mutation(() => PortalAccessTokenDTO)
  async generatePortalAccess(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('companyId', { type: () => UUIDScalarType }) companyId: string,
  ): Promise<PortalAccessTokenDTO> {
    const { portalAccess, token } = await this.portalAccessService.generate({
      workspaceId: workspace.id,
      companyId,
    });

    return { ...this.toDTO(portalAccess), token } as PortalAccessTokenDTO;
  }

  @Mutation(() => PortalAccessDTO)
  async revokePortalAccess(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('id', { type: () => UUIDScalarType }) id: string,
  ): Promise<PortalAccessDTO> {
    const portalAccess = await this.portalAccessService.revoke({
      id,
      workspaceId: workspace.id,
    });

    return this.toDTO(portalAccess) as PortalAccessDTO;
  }

  @Mutation(() => PortalAccessTokenDTO)
  async regeneratePortalAccess(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('id', { type: () => UUIDScalarType }) id: string,
  ): Promise<PortalAccessTokenDTO> {
    const { portalAccess, token } = await this.portalAccessService.regenerate({
      id,
      workspaceId: workspace.id,
    });

    return { ...this.toDTO(portalAccess), token } as PortalAccessTokenDTO;
  }

  private toDTO(
    portalAccess: PortalAccessEntity | null,
  ): PortalAccessDTO | null {
    if (portalAccess === null) {
      return null;
    }

    return {
      id: portalAccess.id,
      companyId: portalAccess.companyId,
      createdAt: portalAccess.createdAt,
      expiresAt: portalAccess.expiresAt,
      revokedAt: portalAccess.revokedAt,
      isActive: this.portalAccessService.isActive(portalAccess),
      workspaceId: portalAccess.workspaceId,
      tokenHash: portalAccess.tokenHash,
    };
  }
}
