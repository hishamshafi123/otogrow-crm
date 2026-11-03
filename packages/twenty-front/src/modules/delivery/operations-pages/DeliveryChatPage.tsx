import { DeliveryChat } from '@/delivery/chat/DeliveryChat';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';

export const DeliveryChatPage = () => (
  <DeliveryOperationalPage view="chat">
    <DeliveryChat />
  </DeliveryOperationalPage>
);
