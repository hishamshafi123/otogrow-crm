import { toMailComposerOptions } from '../to-mail-composer-options.util';

describe('internal stable outbound Message-ID', () => {
  const input = {
    to: 'client@example.invalid',
    subject: 'Reviewed reply',
    body: 'Hello',
    html: '',
    inReplyTo: '<original@example.invalid>',
    threadExternalId: 'gmail-thread',
  };
  it('preserves the ordinary native sender behavior when no internal identity is supplied', () => {
    const options = toMailComposerOptions('founder@example.invalid', input);
    expect(options).not.toHaveProperty('messageId');
    expect(options.inReplyTo).toBe(input.inReplyTo);
    expect(options.references).toBe(input.inReplyTo);
  });
  it('keeps one server-owned Message-ID and exact thread reference for sent-mail reconciliation', () => {
    const options = toMailComposerOptions('founder@example.invalid', {
      ...input,
      headerMessageId: '<otogrow-private-reply@otogrow.invalid>',
    });
    expect(options.messageId).toBe('<otogrow-private-reply@otogrow.invalid>');
    expect(options.to).toBe(input.to);
    expect(options.from).toBe('founder@example.invalid');
    expect(options.text).toBe('Hello');
  });
});
