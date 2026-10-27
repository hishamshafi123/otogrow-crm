import { gql } from '@apollo/client';
export const GET_DELIVERY_CHAT = gql`
  query DeliveryChat($input: DeliveryChatInput!) {
    deliveryChat(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      before
      olderCursor
      telegramReady
      peopleTotal
      people {
        id
        name
        active
        unread
        lastMessageAt
      }
      peer {
        id
        name
        active
        unread
        lastMessageAt
      }
      messages {
        id
        position
        senderId
        recipientId
        senderName
        text
        createdAt
        viewedAt
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
