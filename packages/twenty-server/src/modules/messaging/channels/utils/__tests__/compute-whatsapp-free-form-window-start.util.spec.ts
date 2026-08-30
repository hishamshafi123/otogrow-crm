import { WHATSAPP_FREE_FORM_WINDOW_MS } from 'src/modules/messaging/channels/constants/channel-message.constant';
import { computeWhatsappFreeFormWindowStart } from 'src/modules/messaging/channels/utils/compute-whatsapp-free-form-window-start.util';

describe('computeWhatsappFreeFormWindowStart', () => {
  it('should return a date 24 hours before the given date', () => {
    const now = new Date('2026-08-24T12:00:00.000Z');

    expect(computeWhatsappFreeFormWindowStart(now).toISOString()).toBe(
      '2026-08-23T12:00:00.000Z',
    );
    expect(
      now.getTime() - computeWhatsappFreeFormWindowStart(now).getTime(),
    ).toBe(WHATSAPP_FREE_FORM_WINDOW_MS);
  });
});
