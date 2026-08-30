import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CreateFormInput } from 'src/engine/metadata-modules/form/dtos/create-form.input';
import { FormDTO } from 'src/engine/metadata-modules/form/dtos/form.dto';
import { UpdateFormInput } from 'src/engine/metadata-modules/form/dtos/update-form.input';
import { FormService } from 'src/engine/metadata-modules/form/form.service';

@UseGuards(WorkspaceAuthGuard)
@MetadataResolver(() => FormDTO)
export class FormResolver {
  constructor(private readonly formService: FormService) {}

  @Query(() => [FormDTO])
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async forms(@AuthWorkspace() workspace: WorkspaceEntity): Promise<FormDTO[]> {
    return await this.formService.findAll(workspace.id);
  }

  @Query(() => FormDTO, { nullable: true })
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async form(
    @Args('id', { type: () => UUIDScalarType }) id: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<FormDTO | null> {
    return await this.formService.findById(id, workspace.id);
  }

  @Mutation(() => FormDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async createForm(
    @Args('input') input: CreateFormInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<FormDTO> {
    return await this.formService.create(input, workspace.id);
  }

  @Mutation(() => FormDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async updateForm(
    @Args('input') input: UpdateFormInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<FormDTO> {
    return await this.formService.update(input, workspace.id);
  }

  @Mutation(() => FormDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async deleteForm(
    @Args('id', { type: () => UUIDScalarType }) id: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<FormDTO> {
    return await this.formService.delete(id, workspace.id);
  }
}
