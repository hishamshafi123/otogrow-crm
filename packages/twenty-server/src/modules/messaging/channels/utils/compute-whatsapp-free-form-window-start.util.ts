import { WHATSAPP_FREE_FORM_WINDOW_MS } from 'src/modules/messaging/channels/constants/channel-message.constant';

// Meta only allows free-form WhatsApp replies within 24h of the person's last
// inbound message; outside the window an approved template is required.
export const computeWhatsappFreeFormWindowStart = (from: Date): Date =>
  new Date(from.getTime() - WHATSAPP_FREE_FORM_WINDOW_MS);
