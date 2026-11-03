import { DeliveryKnowledgeReadsService } from 'src/modules/delivery/knowledge/reads/delivery-knowledge-reads.service';
import {
  DeliveryKnowledgeContextInput,
  DeliveryKnowledgeContextDTO,
  DeliveryKnowledgeProjectsInput,
  DeliveryKnowledgeProjectsDTO,
  DeliveryKnowledgeListInput,
  DeliveryKnowledgeListDTO,
  DeliveryKnowledgeSelectionInput,
  DeliveryKnowledgeStateDTO,
  DeliveryKnowledgeExactDetailDTO,
  DeliveryKnowledgeWriteResultDTO,
} from 'src/modules/delivery/knowledge/reads/delivery-knowledge-reads.dto';
import { ConflictException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { DeliveryKnowledgeService } from 'src/modules/delivery/knowledge/delivery-knowledge.service';
import {
  DeliveryKnowledgeInput,
  DeliveryKnowledgePublishInput,
  DeliveryKnowledgeSaveInput,
  DeliveryKnowledgeSnapshotDTO,
} from 'src/modules/delivery/knowledge/delivery-knowledge.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryKnowledgeResolver {
  constructor(
    private readonly knowledge: DeliveryKnowledgeService,
    private readonly reads: DeliveryKnowledgeReadsService,
  ) {}
  @Query(() => DeliveryKnowledgeContextDTO)
  deliveryKnowledgeContext(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeContextInput,
  ) {
    return this.reads.context(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryKnowledgeProjectsDTO)
  deliveryKnowledgeProjects(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeProjectsInput,
  ) {
    return this.reads.projects(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryKnowledgeListDTO)
  deliveryKnowledgeList(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeListInput,
  ) {
    return this.reads.list(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryKnowledgeStateDTO)
  deliveryKnowledgeState(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeSelectionInput,
  ) {
    return this.reads.state(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryKnowledgeExactDetailDTO)
  deliveryKnowledgeDetail(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeSelectionInput,
  ) {
    return this.reads.detail(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryKnowledgeWriteResultDTO)
  async saveDeliveryKnowledgeSource(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeSaveInput,
  ): Promise<DeliveryKnowledgeWriteResultDTO> {
    await this.knowledge.save(workspace, memberId, userWorkspaceId, input);
    const current = await this.reads.state(
      workspace,
      memberId,
      userWorkspaceId,
      { projectId: input.projectId, sourceId: input.id },
    );
    if (!current.source)
      throw new ConflictException(
        'The change was saved, but current knowledge could not be verified. Check the exact source before continuing.',
      );
    return { ...current, source: current.source };
  }
  @Mutation(() => DeliveryKnowledgeWriteResultDTO)
  async publishDeliveryKnowledgeSource(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgePublishInput,
  ): Promise<DeliveryKnowledgeWriteResultDTO> {
    await this.knowledge.publish(workspace, memberId, userWorkspaceId, input);
    const current = await this.reads.state(
      workspace,
      memberId,
      userWorkspaceId,
      { projectId: input.projectId, sourceId: input.id },
    );
    if (!current.source)
      throw new ConflictException(
        'The change was saved, but current knowledge could not be verified. Check the exact source before continuing.',
      );
    return { ...current, source: current.source };
  }
  @Query(() => DeliveryKnowledgeSnapshotDTO)
  deliveryKnowledge(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeInput,
  ) {
    return this.knowledge.snapshot(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => String)
  saveDeliveryKnowledge(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgeSaveInput,
  ) {
    return this.knowledge.save(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => Boolean)
  publishDeliveryKnowledge(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryKnowledgePublishInput,
  ) {
    return this.knowledge.publish(workspace, memberId, userWorkspaceId, input);
  }
}
