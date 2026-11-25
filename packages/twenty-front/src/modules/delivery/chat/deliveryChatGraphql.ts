import { gql } from '@apollo/client';

export const GET_DELIVERY_CHAT = gql`
  query DeliveryChat($input: DeliveryChatInput!) {
    deliveryChat(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      projectId
      before
      olderCursor
      telegramReady
      peerTelegramReady
      peopleTotal
      generalUnread
      generalMessageCount
      totalUnreadWithPeer
      people {
        id
        name
        active
        unread
        lastMessageAt
        lastMessagePreview
        lastMessageProjectName
        projectCount
      }
      peer {
        id
        name
        active
        unread
        lastMessageAt
        lastMessagePreview
        lastMessageProjectName
        projectCount
      }
      projects {
        id
        name
        unread
        messageCount
        lastMessageAt
        isMember
      }
      allWorkspaceProjects {
        id
        name
      }
      messages {
        id
        position
        senderId
        recipientId
        senderName
        text
        projectId
        projectName
        replyTo {
          id
          senderId
          senderName
          text
          hasAttachments
          hasVoice
          deleted
        }
        attachments {
          id
          kind
          name
          mimeType
          size
          durationMs
          waveform
        }
        reactions {
          emoji
          memberId
          memberName
          createdAt
        }
        createdAt
        viewedAt
        editedAt
        deletedAt
        pinnedAt
        pinnedById
        reminderState
      }
      pinnedMessages {
        id
        position
        senderId
        recipientId
        senderName
        text
        projectId
        projectName
        attachments {
          id
          kind
          name
          mimeType
          size
          durationMs
          waveform
        }
        createdAt
        viewedAt
        pinnedAt
        pinnedById
        reminderState
      }
    }
  }
`;

export const SEND_DELIVERY_CHAT = gql`
  mutation SendDeliveryChatMessage($input: DeliveryChatSendInput!) {
    sendDeliveryChatMessage(input: $input)
  }
`;

export const VIEW_DELIVERY_CHAT = gql`
  mutation ViewDeliveryChatMessages($input: DeliveryChatViewedInput!) {
    viewDeliveryChatMessages(input: $input)
  }
`;

export const EDIT_DELIVERY_CHAT = gql`
  mutation EditDeliveryChatMessage($input: DeliveryChatEditInput!) {
    editDeliveryChatMessage(input: $input)
  }
`;

export const DELETE_DELIVERY_CHAT = gql`
  mutation DeleteDeliveryChatMessage($input: DeliveryChatMessageIdInput!) {
    deleteDeliveryChatMessage(input: $input)
  }
`;

export const TOGGLE_DELIVERY_CHAT_REACTION = gql`
  mutation ToggleDeliveryChatReaction($input: DeliveryChatReactionInput!) {
    toggleDeliveryChatReaction(input: $input)
  }
`;

export const TOGGLE_DELIVERY_CHAT_PIN = gql`
  mutation ToggleDeliveryChatPin($input: DeliveryChatMessageIdInput!) {
    toggleDeliveryChatPin(input: $input)
  }
`;
