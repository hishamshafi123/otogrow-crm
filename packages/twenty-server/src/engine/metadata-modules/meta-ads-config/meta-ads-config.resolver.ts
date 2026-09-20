import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { MetaAdsConfigDTO } from 'src/engine/metadata-modules/meta-ads-config/dtos/meta-ads-config.dto';
import { UpsertMetaAdsConfigInput } from 'src/engine/metadata-modules/meta-ads-config/dtos/upsert-meta-ads-config.input';
import { MetaAdsConfigEntity } from 'src/engine/metadata-modules/meta-ads-config/entities/meta-ads-config.entity';
import { MetaAdsConfigService } from 'src/engine/metadata-modules/meta-ads-config/meta-ads-config.service';
import { MetaGraphApiService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-graph-api.service';

@UseGuards(WorkspaceAuthGuard)
@MetadataResolver(() => MetaAdsConfigDTO)
export class MetaAdsConfigResolver {
  constructor(
    private readonly metaAdsConfigService: MetaAdsConfigService,
    private readonly metaGraphApiService: MetaGraphApiService,
  ) {}

  @Query(() => MetaAdsConfigDTO, { nullable: true })
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async metaAdsConfig(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<MetaAdsConfigDTO | null> {
    const config = await this.metaAdsConfigService.findByWorkspaceId(
      workspace.id,
    );

    return isDefined(config) ? this.toDTO(config) : null;
  }

  @Mutation(() => MetaAdsConfigDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async upsertMetaAdsConfig(
    @Args('input') input: UpsertMetaAdsConfigInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<MetaAdsConfigDTO> {
    const config = await this.metaAdsConfigService.upsert(input, workspace.id);

    return this.toDTO(config);
  }

  @Mutation(() => MetaAdsConfigDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async deleteMetaAdsConfig(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<MetaAdsConfigDTO> {
    const config = await this.metaAdsConfigService.delete(workspace.id);

    return this.toDTO(config);
  }

  @Mutation(() => Boolean)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async testMetaAdsConnection(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<boolean> {
    const config = await this.metaAdsConfigService.findByWorkspaceId(
      workspace.id,
    );

    if (!isDefined(config)) {
      return false;
    }

    const pageAccessToken =
      this.metaAdsConfigService.decryptPageAccessToken(config);
    const result = await this.metaGraphApiService.testConnection({
      pageAccessToken,
    });

    return result.success;
  }

  private toDTO(config: MetaAdsConfigEntity): MetaAdsConfigDTO {
    const appSecret = this.metaAdsConfigService.decryptAppSecret(config);
    const pageAccessToken =
      this.metaAdsConfigService.decryptPageAccessToken(config);

    return {
      id: config.id,
      appId: config.appId,
      hasAppSecret: true,
      appSecretLastFour: appSecret.slice(-4),
      pageId: config.pageId,
      hasPageAccessToken: true,
      pageAccessTokenLastFour: pageAccessToken.slice(-4),
      verifyToken: config.verifyToken,
      formId: config.formId,
      isActive: config.isActive,
      workspaceId: config.workspaceId,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
