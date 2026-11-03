import { UseGuards } from '@nestjs/common';
import { Args, Query } from '@nestjs/graphql';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryCreativeReadsService } from 'src/modules/delivery/creative/reads/delivery-creative-reads.service';
import {
  DeliveryCreativeContextDTO,
  DeliveryCreativeProjectsDTO,
  DeliveryCreativeTasksDTO,
  DeliveryCreativeDetailDTO,
  DeliveryCreativeStateDTO,
  DeliveryCreativeReferencesDTO,
  DeliveryCreativeProjectsInput,
  DeliveryCreativeTasksInput,
  DeliveryCreativeSelectionInput,
  DeliveryCreativeReferencesInput,
} from 'src/modules/delivery/creative/reads/delivery-creative-reads.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryCreativeReadsResolver {
  constructor(private readonly reads: DeliveryCreativeReadsService) {}
  @Query(() => DeliveryCreativeContextDTO)
  deliveryCreativeContext(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.reads.context(workspace, memberId, userWorkspaceId);
  }
  @Query(() => DeliveryCreativeProjectsDTO)
  deliveryCreativeProjects(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeProjectsInput,
  ) {
    return this.reads.projects(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCreativeTasksDTO)
  deliveryCreativeTasks(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeTasksInput,
  ) {
    return this.reads.tasks(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCreativeDetailDTO)
  deliveryCreativeDetail(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeSelectionInput,
  ) {
    return this.reads.detail(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCreativeStateDTO)
  deliveryCreativeState(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeSelectionInput,
  ) {
    return this.reads.state(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryCreativeReferencesDTO)
  deliveryCreativeReferences(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryCreativeReferencesInput,
  ) {
    return this.reads.references(workspace, memberId, userWorkspaceId, input);
  }
}
