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
import { DeliverySeoResultsService } from './delivery-seo-results.service';
import {
  DeliverySeoChoicesDTO,
  DeliverySeoChoicesInput,
  DeliverySeoDecisionInput,
  DeliverySeoProjectsDTO,
  DeliverySeoProjectsInput,
  DeliverySeoReceiptDTO,
  DeliverySeoReceiptInput,
  DeliverySeoReportDTO,
  DeliverySeoReportStateDTO,
  DeliverySeoReportsDTO,
  DeliverySeoReportsInput,
  DeliverySeoSaveInput,
  DeliverySeoSelectionInput,
} from './delivery-seo-results.dto';
@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliverySeoResultsResolver {
  constructor(private readonly seo: DeliverySeoResultsService) {}
  @Query(() => DeliverySeoProjectsDTO)
  deliverySeoProjects(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliverySeoProjectsInput,
  ) {
    return this.seo.projects(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliverySeoReportsDTO)
  deliverySeoReports(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliverySeoReportsInput,
  ) {
    return this.seo.reports(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliverySeoReportDTO)
  deliverySeoReport(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliverySeoSelectionInput,
  ) {
    return this.seo.detail(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliverySeoReportStateDTO)
  deliverySeoReportState(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliverySeoSelectionInput,
  ) {
    return this.seo.state(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliverySeoChoicesDTO)
  deliverySeoChoices(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliverySeoChoicesInput,
  ) {
    return this.seo.choices(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliverySeoReceiptDTO)
  deliverySeoReceipt(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliverySeoReceiptInput,
  ) {
    return this.seo.receipt(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliverySeoReceiptDTO)
  saveDeliverySeoReport(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliverySeoSaveInput,
  ) {
    return this.seo.save(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliverySeoReceiptDTO)
  decideDeliverySeoReport(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliverySeoDecisionInput,
  ) {
    return this.seo.decide(workspace, memberId, userWorkspaceId, input);
  }
}
