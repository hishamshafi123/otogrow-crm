import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryFinanceV2Service } from 'src/modules/delivery/finance-v2/finance-v2.service';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryFinanceV2Resolver {
  constructor(private readonly financeV2: DeliveryFinanceV2Service) {}

  @Query(() => GraphQLJSON)
  deliveryFinanceV2(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input', { type: () => GraphQLJSON, nullable: true }) input?: unknown,
  ) {
    return this.financeV2.snapshot(
      workspace,
      memberId,
      userWorkspaceId,
      input ?? {},
    );
  }

  @Mutation(() => GraphQLJSON)
  changeDeliveryFinanceV2(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
  ) {
    return this.financeV2.command(workspace, memberId, userWorkspaceId, input);
  }
}
