import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CreateMetaLeadFormInput } from 'src/engine/metadata-modules/meta-ads-config/dtos/create-meta-lead-form.input';
import {
  MetaLeadFormActivityDTO,
  MetaLeadFormDTO,
  MetaSheetLeadDTO,
} from 'src/engine/metadata-modules/meta-ads-config/dtos/meta-lead-form.dto';
import { MetaLeadFormReadService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-lead-form-read.service';
import { MetaLeadFormService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-lead-form.service';

@UseGuards(
  WorkspaceAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS),
)
@MetadataResolver(() => MetaLeadFormDTO)
export class MetaLeadFormResolver {
  constructor(
    private readonly service: MetaLeadFormService,
    private readonly readService: MetaLeadFormReadService,
  ) {}

  @Query(() => [MetaLeadFormDTO])
  metaLeadForms(@AuthWorkspace() workspace: WorkspaceEntity) {
    return this.service.findAll(workspace.id);
  }

  @Query(() => [MetaSheetLeadDTO])
  async metaSheetLeads(
    @AuthUser() user: UserEntity,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('formId', { type: () => UUIDScalarType }) formId: string,
    @Args('offset', { type: () => Int, defaultValue: 0 }) offset: number,
  ) {
    if (offset < 0)
      throw new BadRequestException('Offset must be nonnegative.');
    const leads = await this.service.findLeads(workspace.id, formId, offset);
    const readIds = await this.readService.getReadLeadIds(
      workspace.id,
      user.id,
      leads.map((lead) => lead.id),
    );
    return leads.map((lead) => ({ ...lead, isUnread: !readIds.has(lead.id) }));
  }

  @Query(() => [MetaLeadFormActivityDTO])
  metaLeadFormActivity(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUser() user: UserEntity,
  ) {
    return this.readService.getActivity(workspace.id, user.id);
  }

  @Mutation(() => Boolean)
  markMetaSheetLeadsRead(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUser() user: UserEntity,
    @Args('formId', { type: () => UUIDScalarType }) formId: string,
    @Args('leadIds', { type: () => [UUIDScalarType] }) leadIds: string[],
  ) {
    return this.readService.markRead(workspace.id, user.id, formId, leadIds);
  }

  @Mutation(() => MetaLeadFormDTO)
  createMetaLeadForm(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('input') input: CreateMetaLeadFormInput,
  ) {
    return this.service.create(workspace.id, input);
  }

  @Mutation(() => MetaLeadFormDTO)
  setMetaLeadFormActive(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('id', { type: () => UUIDScalarType }) id: string,
    @Args('isActive') isActive: boolean,
  ) {
    return this.service.setActive(workspace.id, id, isActive);
  }

  @Mutation(() => MetaLeadFormDTO)
  syncMetaLeadForm(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('id', { type: () => UUIDScalarType }) id: string,
  ) {
    return this.service.sync(workspace.id, id);
  }
}
