import axios from 'axios';
import { DeliveryGoogleMediaAdapter } from 'src/modules/delivery/creative/delivery-google-media.adapter';

jest.mock('axios');
const post = jest.mocked(axios.post);
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQXkAAAAASUVORK5CYII=';
const adapter = new DeliveryGoogleMediaAdapter();
const input = {
  apiKey: 'test-only',
  model: 'gemini-3.1-flash-image',
  kind: 'IMAGE' as const,
  prompt: 'Blue shirt',
  references: [{ mimeType: 'image/png', data: png }],
};

describe('Google media transport', () => {
  it('sends the selected inline reference and returns validated image bytes', async () => {
    post.mockResolvedValue({
      data: {
        responseId: 'provider-id',
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: png, mimeType: 'image/png' } }],
            },
          },
        ],
      },
    });
    const result = await adapter.generate(input);
    expect(result.mimeType).toBe('image/png');
    expect(result.providerJobId).toBe('provider-id');
    expect(post).toHaveBeenCalledWith(
      expect.stringMatching(/models\/gemini-3.1-flash-image:generateContent$/),
      expect.objectContaining({
        contents: [
          {
            parts: [
              { text: 'Blue shirt' },
              { inlineData: input.references[0] },
            ],
          },
        ],
      }),
      expect.objectContaining({
        maxRedirects: 0,
        proxy: false,
        timeout: 180000,
      }),
    );
  });
  it('does not turn a safety refusal into a successful asset', async () => {
    post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: 'Blocked' }] } }] },
    });
    await expect(adapter.generate(input)).rejects.toThrow(
      'did not return an image',
    );
  });
  it('rejects an active document disguised as image output', async () => {
    post.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: Buffer.from('<script>bad</script>').toString(
                      'base64',
                    ),
                    mimeType: 'image/png',
                  },
                },
              ],
            },
          },
        ],
      },
    });
    await expect(adapter.generate(input)).rejects.toThrow(
      'Unsupported provider output',
    );
  });
  it('uses Interactions for video and rejects non-video bytes', async () => {
    post.mockResolvedValue({
      data: {
        id: 'interaction-id',
        status: 'completed',
        steps: [
          { type: 'model_output', content: [{ type: 'video', data: png }] },
        ],
      },
    });
    await expect(
      adapter.generate({
        ...input,
        kind: 'CLIP',
        model: 'gemini-omni-1.1-flash',
      }),
    ).rejects.toThrow('Unsupported provider output');
    expect(post).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      expect.objectContaining({
        model: 'gemini-omni-1.1-flash',
        response_format: { type: 'video', resolution: '720p' },
        input: [
          { type: 'image', mime_type: 'image/png', data: png },
          { type: 'text', text: 'Blue shirt' },
        ],
      }),
      expect.any(Object),
    );
  });
  it('reads completed REST video steps and retains the interaction id', async () => {
    const mp4 = Buffer.from(
      '000000206674797069736f6d0000020069736f6d69736f32617663316d703431',
      'hex',
    );
    post.mockResolvedValue({
      data: {
        id: 'completed-video',
        status: 'completed',
        steps: [
          { type: 'user_input', content: [{ type: 'text', text: 'ignored' }] },
          {
            type: 'model_output',
            content: [{ type: 'video', data: mp4.toString('base64') }],
          },
        ],
      },
    });
    const result = await adapter.generate({
      ...input,
      kind: 'CLIP',
      model: 'gemini-omni-1.1-flash',
    });
    expect(result.mimeType).toBe('video/mp4');
    expect(result.providerJobId).toBe('completed-video');
    expect(result.bytes).toEqual(mp4);
  });
  it('does not accept an incomplete interaction as a completed video', async () => {
    post.mockResolvedValue({
      data: { id: 'truncated-video', status: 'incomplete', steps: [] },
    });
    await expect(
      adapter.generate({
        ...input,
        kind: 'CLIP',
        model: 'gemini-omni-1.1-flash',
      }),
    ).rejects.toThrow();
  });
  it('accepts a completed unstored video without an interaction id', async () => {
    const mp4 = Buffer.from(
      '000000206674797069736f6d0000020069736f6d69736f32617663316d703431',
      'hex',
    );
    post.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', data: mp4.toString('base64') }],
          },
        ],
      },
    });
    const result = await adapter.generate({
      ...input,
      kind: 'CLIP',
      model: 'gemini-omni-1.1-flash',
    });
    expect(result.providerJobId).toBeNull();
    expect(result.bytes).toEqual(mp4);
  });
});
