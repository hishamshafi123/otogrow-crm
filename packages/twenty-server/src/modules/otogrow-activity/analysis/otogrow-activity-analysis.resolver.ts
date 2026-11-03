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
import { OtogrowActivityAnalysisService } from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.service';
import {
  OtogrowActivityCurrentTaskDTO,
  OtogrowActivityCurrentTaskInput,
} from 'src/modules/otogrow-activity/analysis/current-work/activity-current-work.dto';
import {
  CancelOtogrowActivityAnalysisInput,
  OtogrowActivityAnalysisPreviewDTO,
  OtogrowActivityAnalysisPreviewInput,
  OtogrowActivityAnalysisRequestDTO,
  OtogrowActivityAnalysisRequestInput,
  OtogrowActivityAnalysisRunDetailDTO,
  OtogrowActivityAnalysisRunInput,
  OtogrowActivityAnalysisRunsDTO,
  OtogrowActivityAnalysisRunsInput,
  OtogrowActivityAnalysisRunStateDTO,
  StartOtogrowActivityAnalysisInput,
} from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class OtogrowActivityAnalysisResolver {
  constructor(private readonly analysis: OtogrowActivityAnalysisService) {}
  @Query(() => OtogrowActivityCurrentTaskDTO)
  otogrowActivityCurrentTask(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowActivityCurrentTaskInput,
  ) {
    return this.analysis.currentTask(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Query(() => OtogrowActivityAnalysisPreviewDTO)
  otogrowActivityAnalysisPreview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowActivityAnalysisPreviewInput,
  ) {
    return this.analysis.preview(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => OtogrowActivityAnalysisRunsDTO)
  otogrowActivityAnalysisRuns(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowActivityAnalysisRunsInput,
  ) {
    return this.analysis.runs(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => OtogrowActivityAnalysisRunDetailDTO)
  otogrowActivityAnalysisRun(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowActivityAnalysisRunInput,
  ) {
    return this.analysis.detail(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => OtogrowActivityAnalysisRunStateDTO)
  otogrowActivityAnalysisRunState(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowActivityAnalysisRunInput,
  ) {
    return this.analysis.state(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => OtogrowActivityAnalysisRequestDTO)
  otogrowActivityAnalysisRequest(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: OtogrowActivityAnalysisRequestInput,
  ) {
    return this.analysis.request(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => OtogrowActivityAnalysisRequestDTO)
  startOtogrowActivityAnalysis(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: StartOtogrowActivityAnalysisInput,
  ) {
    return this.analysis.start(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => OtogrowActivityAnalysisRequestDTO)
  cancelOtogrowActivityAnalysis(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: CancelOtogrowActivityAnalysisInput,
  ) {
    return this.analysis.cancel(workspace, memberId, userWorkspaceId, input);
  }
}
