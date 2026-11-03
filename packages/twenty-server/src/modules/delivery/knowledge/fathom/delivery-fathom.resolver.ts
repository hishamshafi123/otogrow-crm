import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryFathomService } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.service';
import {
  DeliveryFathomSettingsInput,
  DeliveryFathomMeetingsInput,
  DeliveryFathomPreviewInput,
  DeliveryFathomSettingsDTO,
  DeliveryFathomMeetingsDTO,
  DeliveryFathomPreviewDTO,
} from 'src/modules/delivery/knowledge/fathom/delivery-fathom.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryFathomResolver {
  constructor(private readonly fathom: DeliveryFathomService) {}
  @Query(() => DeliveryFathomSettingsDTO)
  deliveryFathomSettings(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.fathom.settings(workspace, memberId, userWorkspaceId);
  }
  @Mutation(() => DeliveryFathomSettingsDTO)
  saveDeliveryFathomSettings(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFathomSettingsInput,
  ) {
    return this.fathom.saveSettings(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Mutation(() => DeliveryFathomMeetingsDTO)
  findDeliveryFathomMeetings(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFathomMeetingsInput,
  ) {
    return this.fathom.meetings(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryFathomPreviewDTO)
  previewDeliveryFathomTranscript(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryFathomPreviewInput,
  ) {
    return this.fathom.preview(workspace, memberId, userWorkspaceId, input);
  }
}
