import axios from 'axios';
import {
  DeliveryAtlasAdapter,
  atlasPublicUrl,
  atlasQuoteAmount,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.adapter';
import {
  ATLAS_PROFILES,
  atlasProfile,
  normalizeAtlasParameters,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.catalog';

jest.mock('axios');
const adapter = new DeliveryAtlasAdapter();
const post = jest.mocked(axios.post);
const get = jest.mocked(axios.get);
const image = atlasProfile('google/nano-banana-pro/text-to-image');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQXkAAAAASUVORK5CYII=',
  'base64',
);

beforeEach(() => jest.clearAllMocks());
describe('Atlas exact profile transport', () => {
  it.each(ATLAS_PROFILES.map((profile) => [profile.id, profile] as const))(
    'maps only supported wire parameters for %s',
    (_id, profile) => {
      const parameters = normalizeAtlasParameters(profile, {});
      const references = profile.minimumReferences
        ? ['https://cdn.example.com/approved.png']
        : [];
      const body = adapter.body(
        profile,
        'Explicit approved brief',
        parameters,
        references,
      );
      expect(body.model).toBe(profile.id);
      for (const [name, value] of Object.entries(parameters)) {
        expect(body[profile.remoteKeys[name as keyof typeof parameters]!]).toBe(
          value,
        );
      }
      expect(body).not.toHaveProperty('resolutionPreset');
      if (profile.operation === 'IMAGE_EDIT')
        expect(body.images).toEqual(references);
      if (profile.operation === 'IMAGE_TO_VIDEO')
        expect(body.image).toBe(references[0]);
      if (profile.operation === 'TEXT_TO_IMAGE')
        expect(body).not.toHaveProperty('images');
    },
  );
  it.each([
    ['0', '0.000000'],
    ['0.1', '0.100000'],
    [0.10000000000000002, '0.100001'],
    ['0.1000000000000000001', '0.100001'],
    [1e-9, '0.000001'],
    [5e-324, '0.000001'],
    ['1.000001', '1.000001'],
    ['1e-7', '0.000001'],
  ])(
    'rounds %s upward without erasing a positive decimal tail',
    (input, expected) => {
      expect(atlasQuoteAmount(input)).toBe(expected);
    },
  );
  it.each([-1, Infinity, NaN, '-0.1', 'abc', '1e999', '10000000000'])(
    'rejects invalid quote %s',
    (value) => {
      expect(() => atlasQuoteAmount(value)).toThrow('unsupported quote');
    },
  );
  it('calculates the exact generation body without generating', async () => {
    post.mockResolvedValue({
      data: '{"code":200,"data":{"price":0.10000000000000000001,"estimated":false}}',
    });
    const body = adapter.body(
      image,
      'Explicit brief',
      normalizeAtlasParameters(image, {}),
      [],
    );
    await expect(adapter.calculate('private-key', body)).resolves.toEqual({
      costUsd: '0.100001',
      estimated: false,
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      'https://api.atlascloud.ai/api/v1/model/calculate',
      body,
      expect.objectContaining({ maxRedirects: 0, proxy: false }),
    );
  });
  it('never retries an ambiguous submission or exposes transport credentials', async () => {
    post.mockRejectedValue({
      message: 'private-key',
      config: { headers: { Authorization: 'Bearer private-key' } },
    });
    await expect(
      adapter.submit('private-key', image, {
        model: image.id,
        prompt: 'private-prompt',
      }),
    ).rejects.toThrow('Atlas could not verify this request.');
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('polls only the saved prediction and rejects changed identity or model', async () => {
    get.mockResolvedValueOnce({
      data: { data: { id: 'other', model: image.id, status: 'processing' } },
    });
    await expect(
      adapter.poll('private-key', 'known/id', image.id),
    ).rejects.toThrow('identity changed');
    expect(get).toHaveBeenCalledWith(
      'https://api.atlascloud.ai/api/v1/model/prediction/known%2Fid',
      expect.any(Object),
    );
    get.mockResolvedValueOnce({
      data: { id: 'known', model: 'different', status: 'processing' },
    });
    await expect(
      adapter.poll('private-key', 'known', image.id),
    ).rejects.toThrow('model changed');
  });
  it('uploads only matching image bytes and validates the temporary location', async () => {
    await expect(
      adapter.upload('private-key', Buffer.from('<script>'), 'image/png'),
    ).rejects.toThrow('Unsupported Atlas reference');
    expect(post).not.toHaveBeenCalled();
    post.mockResolvedValue({
      data: { data: { url: 'https://cdn.example.com/reference.png' } },
    });
    await expect(adapter.upload('private-key', png, 'image/png')).resolves.toBe(
      'https://cdn.example.com/reference.png',
    );
    expect(post).toHaveBeenCalledTimes(1);
  });
  it.each([
    'http://cdn.example.com/a.png',
    'https://user:secret@cdn.example.com/a.png',
    'https://cdn.example.com:444/a.png',
  ])('rejects unsafe output locations %s', (value) => {
    expect(() => atlasPublicUrl(value)).toThrow('unsupported media location');
  });
  it('downloads without forwarding the API key and rejects wrong media magic', async () => {
    get.mockResolvedValue({ data: png });
    await expect(
      adapter.download('https://cdn.example.com/a.png', 'IMAGE'),
    ).resolves.toEqual(expect.objectContaining({ mimeType: 'image/png' }));
    const configuration = get.mock.calls[0][1];
    expect(configuration).not.toHaveProperty('headers');
    expect(configuration).toEqual(
      expect.objectContaining({
        maxRedirects: 0,
        proxy: false,
        maxContentLength: 100000000,
      }),
    );
    await expect(
      adapter.download('https://cdn.example.com/not-video.mp4', 'CLIP'),
    ).rejects.toThrow('unsupported media file');
  });
});
