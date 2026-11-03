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
import { DeliveryInboxService } from './delivery-inbox.service';
import { DeliveryInboxReplyService } from './delivery-inbox-reply.service';
import {
  DeliveryInboxDraftPreviewInput,
  DeliveryInboxDraftPreviewDTO,
  CancelDeliveryInboxReplyInput,
  ConsentDeliveryInboxThreadInput,
  DeliveryInboxContextDTO,
  DeliveryInboxConversationDTO,
  DeliveryInboxConversationsDTO,
  DeliveryInboxGmailAccountsDTO,
  DeliveryInboxGmailThreadsDTO,
  DeliveryInboxMessagesDTO,
  DeliveryInboxMessagesInput,
  DeliveryInboxPageInput,
  DeliveryInboxRepliesDTO,
  DeliveryInboxReplyDTO,
  DeliveryInboxRequestDTO,
  DeliveryInboxRequestInput,
  DeliveryInboxSelectionInput,
  DeliveryInboxThreadsInput,
  PrepareDeliveryInboxReplyInput,
  RevokeDeliveryInboxThreadInput,
  SendDeliveryInboxReplyInput,
} from './delivery-inbox.dto';

@UseGuards(WorkspaceAuthGuard, RequireAccessTokenGuard, CustomPermissionGuard)
@MetadataResolver()
export class DeliveryInboxResolver {
  constructor(
    private readonly inbox: DeliveryInboxService,
    private readonly replies: DeliveryInboxReplyService,
  ) {}
  @Query(() => DeliveryInboxContextDTO)
  deliveryInboxContext(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ) {
    return this.inbox.context(workspace, memberId, userWorkspaceId);
  }
  @Query(() => DeliveryInboxConversationsDTO)
  deliveryInboxConversations(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryInboxPageInput,
  ) {
    return this.inbox.conversations(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
  }
  @Query(() => DeliveryInboxConversationDTO)
  deliveryInboxConversation(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryInboxSelectionInput,
  ) {
    return this.inbox.conversation(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryInboxGmailAccountsDTO)
  deliveryInboxGmailAccounts(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryInboxPageInput,
  ) {
    return this.inbox.accounts(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryInboxGmailThreadsDTO)
  deliveryInboxGmailThreads(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryInboxThreadsInput,
  ) {
    return this.inbox.threads(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryInboxMessagesDTO)
  deliveryInboxMessages(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryInboxMessagesInput,
  ) {
    return this.inbox.messages(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryInboxReplyDTO)
  deliveryInboxReply(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryInboxSelectionInput,
  ) {
    return this.replies.detail(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryInboxRepliesDTO)
  deliveryInboxReplies(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryInboxMessagesInput,
  ) {
    return this.replies.history(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryInboxRequestDTO)
  deliveryInboxRequest(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryInboxRequestInput,
  ) {
    return this.replies.request(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryInboxRequestDTO)
  consentDeliveryInboxThread(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: ConsentDeliveryInboxThreadInput,
  ) {
    return this.inbox.consent(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryInboxRequestDTO)
  revokeDeliveryInboxThread(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: RevokeDeliveryInboxThreadInput,
  ) {
    return this.inbox.revoke(workspace, memberId, userWorkspaceId, input);
  }
  @Query(() => DeliveryInboxDraftPreviewDTO)
  deliveryInboxDraftPreview(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryInboxDraftPreviewInput,
  ) {
    return this.replies.preview(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryInboxRequestDTO)
  prepareDeliveryInboxReply(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: PrepareDeliveryInboxReplyInput,
  ) {
    return this.replies.prepare(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryInboxRequestDTO)
  sendDeliveryInboxReply(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: SendDeliveryInboxReplyInput,
  ) {
    return this.replies.send(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryInboxRequestDTO)
  cancelDeliveryInboxReply(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: CancelDeliveryInboxReplyInput,
  ) {
    return this.replies.cancel(workspace, memberId, userWorkspaceId, input);
  }
  @Mutation(() => DeliveryInboxReplyDTO)
  reconcileDeliveryInboxReply(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() memberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: DeliveryInboxSelectionInput,
  ) {
    return this.replies.reconcile(workspace, memberId, userWorkspaceId, input);
  }
}
