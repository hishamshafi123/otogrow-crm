import { gql } from '@apollo/client';
const INBOX_ACTOR = gql`
  fragment InboxActor on DeliveryInboxActor {
    memberId
    isAdmin
    isManager
    roleIds
    capabilities
  }
`;
const INBOX_CONVERSATION = gql`
  fragment InboxConversationSummary on DeliveryInboxConversationSummary {
    id
    revision
    title
    channel
    projectId
    projectName
    ownerId
    private
    connected
  }
`;
const INBOX_BINDING = gql`
  fragment InboxBinding on DeliveryInboxBinding {
    id
    revision
    enabled
    accountId
    channelId
    threadExternalId
    accountHandle
    ownerMemberId
    canConsent
    canRead
    canDraft
    canSend
    problem
    syncedAt
    syncStatus
    grants {
      kind
      id
      name
      read
      draft
      send
    }
  }
`;
const INBOX_REPLY = gql`
  fragment InboxReply on DeliveryInboxReply {
    workspaceId
    memberId
    userWorkspaceId
    scope
    observedAt
    actor {
      ...InboxActor
    }
    id
    conversationId
    status
    body {
      to
      subject
      text
      replyToMessageId
      sourceIds
      agentId
    }
    bodyFingerprint
    sourceFingerprint
    canSend
    canCancel
    problem
    createdAt
    attemptedAt
    finishedAt
  }
  ${INBOX_ACTOR}
`;
const INBOX_RECEIPT = gql`
  fragment InboxReceipt on DeliveryInboxReceipt {
    requestId
    action
    actorId
    userWorkspaceId
    conversationId
    bindingId
    replyId
    bodyFingerprint
    createdAt
  }
`;
const INBOX_REQUEST = gql`
  fragment InboxRequest on DeliveryInboxRequest {
    workspaceId
    memberId
    userWorkspaceId
    scope
    observedAt
    actor {
      ...InboxActor
    }
    receipt {
      ...InboxReceipt
    }
    reply {
      ...InboxReply
    }
  }
  ${INBOX_ACTOR}
  ${INBOX_RECEIPT}
  ${INBOX_REPLY}
`;
export const GET_INBOX_CONTEXT = gql`
  query DeliveryInboxContext {
    deliveryInboxContext {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        ...InboxActor
      }
      canManageConversations
    }
  }
  ${INBOX_ACTOR}
`;
export const GET_INBOX_CONVERSATIONS = gql`
  query DeliveryInboxConversations($input: DeliveryInboxPageInput!) {
    deliveryInboxConversations(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        ...InboxActor
      }
      items {
        ...InboxConversationSummary
      }
      totalCount
      nextCursor
    }
  }
  ${INBOX_ACTOR}
  ${INBOX_CONVERSATION}
`;
export const GET_INBOX_CONVERSATION = gql`
  query DeliveryInboxConversation($input: DeliveryInboxSelectionInput!) {
    deliveryInboxConversation(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        ...InboxActor
      }
      conversation {
        ...InboxConversationSummary
      }
      binding {
        ...InboxBinding
      }
      availableGrants {
        kind
        id
        name
        read
        draft
        send
      }
    }
  }
  ${INBOX_ACTOR}
  ${INBOX_CONVERSATION}
  ${INBOX_BINDING}
`;
export const GET_INBOX_ACCOUNTS = gql`
  query DeliveryInboxGmailAccounts($input: DeliveryInboxPageInput!) {
    deliveryInboxGmailAccounts(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        ...InboxActor
      }
      items {
        id
        handle
        needsReconnect
        canSend
        syncEnabled
        syncedAt
      }
      totalCount
      nextCursor
    }
  }
  ${INBOX_ACTOR}
`;
export const GET_INBOX_THREADS = gql`
  query DeliveryInboxGmailThreads($input: DeliveryInboxThreadsInput!) {
    deliveryInboxGmailThreads(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        ...InboxActor
      }
      items {
        accountId
        accountHandle
        channelId
        threadExternalId
        subject
        messageCount
        sourceFingerprint
        latestAt
      }
      selected {
        accountId
        accountHandle
        channelId
        threadExternalId
        subject
        messageCount
        sourceFingerprint
        latestAt
      }
      totalCount
      nextCursor
    }
  }
  ${INBOX_ACTOR}
`;
export const GET_INBOX_MESSAGES = gql`
  query DeliveryInboxMessages($input: DeliveryInboxMessagesInput!) {
    deliveryInboxMessages(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        ...InboxActor
      }
      conversationId
      sourceFingerprint
      items {
        id
        receivedAt
        subject
        text
        textTruncated
        participantsTruncated
        direction
        participants {
          role
          handle
          displayName
        }
      }
      totalCount
      nextCursor
    }
  }
  ${INBOX_ACTOR}
`;
export const GET_INBOX_REPLIES = gql`
  query DeliveryInboxReplies($input: DeliveryInboxMessagesInput!) {
    deliveryInboxReplies(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        ...InboxActor
      }
      items {
        id
        requestId
        actorId
        actorName
        status
        createdAt
        problem
      }
      totalCount
      nextCursor
    }
  }
  ${INBOX_ACTOR}
`;
export const GET_INBOX_REPLY = gql`
  query DeliveryInboxReply($input: DeliveryInboxSelectionInput!) {
    deliveryInboxReply(input: $input) {
      ...InboxReply
    }
  }
  ${INBOX_REPLY}
`;
export const GET_INBOX_REPLY_STATE = gql`
  query DeliveryInboxReplyState($input: DeliveryInboxSelectionInput!) {
    deliveryInboxReply(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        ...InboxActor
      }
      id
      conversationId
      status
      sourceFingerprint
      bodyFingerprint
      canSend
      canCancel
      problem
      createdAt
      attemptedAt
      finishedAt
    }
  }
  ${INBOX_ACTOR}
`;
export const GET_INBOX_REQUEST = gql`
  query DeliveryInboxRequest($input: DeliveryInboxRequestInput!) {
    deliveryInboxRequest(input: $input) {
      ...InboxRequest
    }
  }
  ${INBOX_REQUEST}
`;
export const CONSENT_INBOX_THREAD = gql`
  mutation ConsentDeliveryInboxThread(
    $input: ConsentDeliveryInboxThreadInput!
  ) {
    consentDeliveryInboxThread(input: $input) {
      ...InboxRequest
    }
  }
  ${INBOX_REQUEST}
`;
export const REVOKE_INBOX_THREAD = gql`
  mutation RevokeDeliveryInboxThread($input: RevokeDeliveryInboxThreadInput!) {
    revokeDeliveryInboxThread(input: $input) {
      ...InboxRequest
    }
  }
  ${INBOX_REQUEST}
`;
export const PREPARE_INBOX_REPLY = gql`
  mutation PrepareDeliveryInboxReply($input: PrepareDeliveryInboxReplyInput!) {
    prepareDeliveryInboxReply(input: $input) {
      ...InboxRequest
    }
  }
  ${INBOX_REQUEST}
`;
export const SEND_INBOX_REPLY = gql`
  mutation SendDeliveryInboxReply($input: SendDeliveryInboxReplyInput!) {
    sendDeliveryInboxReply(input: $input) {
      ...InboxRequest
    }
  }
  ${INBOX_REQUEST}
`;
export const CANCEL_INBOX_REPLY = gql`
  mutation CancelDeliveryInboxReply($input: CancelDeliveryInboxReplyInput!) {
    cancelDeliveryInboxReply(input: $input) {
      ...InboxRequest
    }
  }
  ${INBOX_REQUEST}
`;
export const RECONCILE_INBOX_REPLY = gql`
  mutation ReconcileDeliveryInboxReply($input: DeliveryInboxSelectionInput!) {
    reconcileDeliveryInboxReply(input: $input) {
      ...InboxReply
    }
  }
  ${INBOX_REPLY}
`;

export const GET_INBOX_DRAFT_PREVIEW = gql`
  query DeliveryInboxDraftPreview($input: DeliveryInboxDraftPreviewInput!) {
    deliveryInboxDraftPreview(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      scope
      observedAt
      actor {
        ...InboxActor
      }
      bodyFingerprint
      previewFingerprint
      agentId
      agentName
      agentVersion
      modelId
      sourceCount
      to
      subject
      sources {
        id
        receivedAt
        subject
        text
        textTruncated
        participantsTruncated
        direction
        participants {
          role
          handle
          displayName
        }
      }
      budget {
        maximumCostUsd
        pricingRevision
        budgetReady
        blockedReason
        boundSource
      }
    }
  }
  ${INBOX_ACTOR}
`;
