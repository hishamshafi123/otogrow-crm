import axios from 'axios';
import {
  compileStudioPromptTemplate,
  estimateStudioJobCostUsd,
  getStudioModelSpec,
  STUDIO_MODEL_CATALOG,
} from 'src/modules/delivery/studio/delivery-studio-catalog';
import {
  signStudioMediaToken,
  verifyStudioMediaToken,
} from 'src/modules/delivery/studio/delivery-studio.policy';
import {
  assertSafeHttpsOutputUrl,
  DeliveryStudioProviderRouterService,
  StudioProviderCallError,
  type StudioProviderCredentials,
  type StudioStageableMediaFile,
} from 'src/modules/delivery/studio/delivery-studio-provider-router.service';

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return {
    __esModule: true,
    default: {
      ...actual.default,
      post: jest.fn(),
      get: jest.fn(),
      put: jest.fn(),
      isAxiosError: actual.default.isAxiosError,
    },
    isAxiosError: actual.isAxiosError,
  };
});

const mockedAxios = axios as jest.Mocked<typeof axios>;

const makeImageFile = (
  overrides?: Partial<StudioStageableMediaFile>,
): StudioStageableMediaFile => ({
  sha256: 'abc123',
  fileName: 'tee-front.png',
  mimeType: 'image/png',
  kind: 'IMAGE',
  readBytes: jest.fn(async () => Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  ...overrides,
});

const makeVideoFile = (
  overrides?: Partial<StudioStageableMediaFile>,
): StudioStageableMediaFile => ({
  sha256: 'vid999',
  fileName: 'ref-clip.mp4',
  mimeType: 'video/mp4',
  kind: 'VIDEO',
  readBytes: jest.fn(async () => Buffer.from('mock-mp4-bytes')),
  ...overrides,
});

describe('AI Studio Catalog, Policy & Provider Router (Loop 1)', () => {
  let router: DeliveryStudioProviderRouterService;

  const bothCredentials: StudioProviderCredentials = {
    wavespeedApiKey: 'ws_live_secret_123456',
    wavespeedEnabled: true,
    kieApiKey: 'kie_live_secret_987654',
    kieEnabled: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    router = new DeliveryStudioProviderRouterService();
  });

  describe('Catalog, Cost Estimator & Dynamic Prompt Compiler', () => {
    it('exposes all requested 2026 image and video models with WaveSpeed & Kie parity', () => {
      const keys = STUDIO_MODEL_CATALOG.map((m) => m.key);
      expect(keys).toEqual(
        expect.arrayContaining([
          'nano-banana-2.1',
          'nano-banana-pro',
          'gpt-image-2.6-sunburst',
          'gpt-image-2.6-flare',
          'seedance-2.5',
          'seedance-2.5-flash',
          'seedance-2.5-edit',
          'magi-2',
          'wan-3.0',
          'wan-3.0-prime',
        ]),
      );
      for (const spec of STUDIO_MODEL_CATALOG) {
        expect(spec.wavespeed.endpoint).toBeTruthy();
        expect(spec.kie.model).toBeTruthy();
      }
    });

    it('estimates cost accurately for images and per-second video models', () => {
      expect(
        Number(
          estimateStudioJobCostUsd({
            modelKey: 'nano-banana-2.1',
            resolution: '2K',
            count: 2,
          }),
        ),
      ).toBeCloseTo(0.12, 4);

      expect(
        Number(
          estimateStudioJobCostUsd({
            modelKey: 'magi-2',
            resolution: '1080p',
            durationSec: 10,
          }),
        ),
      ).toBeCloseTo(0.88, 4);
    });

    it('compiles dynamic master prompt templates and appends environment override when missing from template', () => {
      const compiled = compileStudioPromptTemplate(
        'Generate a {{angle_count}}-panel sheet ({{angles}}) for {{product_name}}.',
        {
          angle_count: '2',
          angles: 'Front, Back',
          product_name: 'Hokuro Boxy Tee',
          environment: 'Tokyo concrete alley at dusk',
        },
      );
      expect(compiled).toContain(
        'Generate a 2-panel sheet (Front, Back) for Hokuro Boxy Tee.',
      );
      expect(compiled).toContain(
        'Environment / Setting: Tokyo concrete alley at dusk',
      );
    });
  });

  describe('Signed Media Tokens & SSRF Output URL Validation', () => {
    it('round-trips valid tokens and rejects tampered tokens', () => {
      const token = signStudioMediaToken('top-secret', {
        w: 'ws-1',
        t: 'studio-asset',
        id: 'asset-1',
      });
      const verified = verifyStudioMediaToken('top-secret', token);
      expect(verified?.w).toBe('ws-1');
      expect(verified?.id).toBe('asset-1');

      expect(verifyStudioMediaToken('wrong-secret', token)).toBeNull();
      expect(verifyStudioMediaToken('top-secret', `${token}x`)).toBeNull();
    });

    it('rejects non-HTTPS or credentialed output URLs', () => {
      expect(() =>
        assertSafeHttpsOutputUrl('http://cdn.example.com/a.mp4'),
      ).toThrow();
      expect(() =>
        assertSafeHttpsOutputUrl('https://user:pass@cdn.example.com/a.mp4'),
      ).toThrow();
      expect(
        assertSafeHttpsOutputUrl('https://cdn.example.com/out.mp4').hostname,
      ).toBe('cdn.example.com');
    });
  });

  describe('Provider Routing & Automatic Failover (WaveSpeed -> Kie.ai)', () => {
    it('resolves provider execution order based on routing mode', () => {
      expect(
        router.resolveProviderOrder('AUTO_FAILOVER', bothCredentials),
      ).toEqual(['wavespeed', 'kie']);
      expect(
        router.resolveProviderOrder('WAVESPEED_ONLY', bothCredentials),
      ).toEqual(['wavespeed']);
      expect(router.resolveProviderOrder('KIE_ONLY', bothCredentials)).toEqual([
        'kie',
      ]);
    });

    it('executes on WaveSpeedAI primary and reuses cached staged URLs', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: { id: 'ws-pred-1', status: 'processing' } },
      } as never);
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            id: 'ws-pred-1',
            status: 'completed',
            outputs: ['https://cdn.wavespeed.ai/out-video.mp4'],
          },
        },
      } as never);

      const result = await router.execute(
        {
          modelKey: 'seedance-2.5',
          prompt: 'Swap character @Image 1 into @Video 1',
          routingMode: 'AUTO_FAILOVER',
          aspectRatio: '9:16',
          resolution: '720p',
          durationSec: 8,
          generateAudio: true,
          referenceImages: [
            makeImageFile({
              cachedWavespeedUrl: 'https://cdn.wavespeed.ai/cached-sheet.png',
            }),
          ],
          referenceVideos: [
            makeVideoFile({
              cachedWavespeedUrl: 'https://cdn.wavespeed.ai/cached-ref.mp4',
            }),
          ],
          pollIntervalMs: 0,
          maxPollAttempts: 3,
        },
        bothCredentials,
      );

      expect(result.providerUsed).toBe('wavespeed');
      expect(result.failoverTriggered).toBe(false);
      expect(result.outputUrls).toEqual([
        'https://cdn.wavespeed.ai/out-video.mp4',
      ]);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].status).toBe('SUCCESS');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.wavespeed.ai/api/v3/bytedance/seedance-2.5/reference-to-video',
        expect.objectContaining({
          reference_images: ['https://cdn.wavespeed.ai/cached-sheet.png'],
          reference_videos: ['https://cdn.wavespeed.ai/cached-ref.mp4'],
        }),
        expect.any(Object),
      );
    });

    it('automatically fails over to Kie.ai when WaveSpeedAI returns a retryable 503 outage', async () => {
      const wsOutageError = Object.assign(new Error('Service Unavailable'), {
        isAxiosError: true,
        response: { status: 503, data: { message: 'Upstream GPU overloaded' } },
      });

      // 1) WaveSpeed submit fails with 503 (using cached WS URLs so submit is first POST)
      mockedAxios.post
        .mockRejectedValueOnce(wsOutageError)
        // 2) Kie.ai file-stream-upload for image
        .mockResolvedValueOnce({
          data: {
            code: 200,
            data: { downloadUrl: 'https://tempfile.redpandaai.co/img1.png' },
          },
        } as never)
        // 3) Kie.ai file-stream-upload for video
        .mockResolvedValueOnce({
          data: {
            code: 200,
            data: { downloadUrl: 'https://tempfile.redpandaai.co/vid1.mp4' },
          },
        } as never)
        // 4) Kie.ai createTask succeeds
        .mockResolvedValueOnce({
          data: { code: 200, msg: 'success', data: { taskId: 'kie-task-77' } },
        } as never);

      // 5) Kie.ai recordInfo returns success with stringified resultJson
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            taskId: 'kie-task-77',
            state: 'success',
            resultJson: JSON.stringify({
              resultUrls: ['https://cdn.kie.ai/final-magi2.mp4'],
            }),
          },
        },
      } as never);

      const onStagedUrl = jest.fn(async () => undefined);

      const result = await router.execute(
        {
          modelKey: 'magi-2',
          prompt: 'Swap Hokuro tee onto character',
          routingMode: 'AUTO_FAILOVER',
          aspectRatio: '9:16',
          resolution: '1080p',
          durationSec: 8,
          referenceImages: [
            makeImageFile({
              cachedWavespeedUrl: 'https://cdn.wavespeed.ai/cached-sheet.png',
              onStagedUrl,
            }),
          ],
          referenceVideos: [
            makeVideoFile({
              cachedWavespeedUrl: 'https://cdn.wavespeed.ai/cached-ref.mp4',
              onStagedUrl,
            }),
          ],
          pollIntervalMs: 0,
          maxPollAttempts: 3,
        },
        bothCredentials,
      );

      expect(result.providerUsed).toBe('kie');
      expect(result.failoverTriggered).toBe(true);
      expect(result.externalTaskId).toBe('kie-task-77');
      expect(result.outputUrls).toEqual(['https://cdn.kie.ai/final-magi2.mp4']);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0]).toMatchObject({
        provider: 'wavespeed',
        status: 'FAILED',
        retryable: true,
        errorCode: '503',
      });
      expect(result.attempts[1]).toMatchObject({
        provider: 'kie',
        status: 'SUCCESS',
      });
      expect(onStagedUrl).toHaveBeenCalledWith(
        'kie',
        'https://tempfile.redpandaai.co/img1.png',
        expect.any(String),
      );
    });

    it('does NOT failover to Kie.ai on non-retryable WaveSpeed safety/policy rejections', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { code: 200, data: { id: 'ws-pred-nsfw', status: 'processing' } },
      } as never);
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            id: 'ws-pred-nsfw',
            status: 'completed',
            outputs: ['https://cdn.wavespeed.ai/blocked.png'],
            has_nsfw_contents: [true],
          },
        },
      } as never);

      await expect(
        router.execute(
          {
            modelKey: 'nano-banana-2.1',
            prompt: 'Test sheet',
            routingMode: 'AUTO_FAILOVER',
            referenceImages: [
              makeImageFile({
                cachedWavespeedUrl: 'https://cdn.wavespeed.ai/i.png',
              }),
            ],
            referenceVideos: [],
            pollIntervalMs: 0,
            maxPollAttempts: 3,
          },
          bothCredentials,
        ),
      ).rejects.toThrow(StudioProviderCallError);

      // Only 1 POST (WaveSpeed), zero Kie.ai calls
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('maps GPT Image 2.6 and Nano Banana 2.1 input fields properly for Kie.ai', () => {
      const gptSpec = getStudioModelSpec('gpt-image-2.6-sunburst')!;
      const nanoSpec = getStudioModelSpec('nano-banana-2.1')!;

      const gptPayload = router.buildKiePayload(
        gptSpec,
        {
          modelKey: gptSpec.key,
          prompt: 'Turnaround',
          routingMode: 'KIE_ONLY',
          aspectRatio: '3:4',
          resolution: '1K',
          referenceImages: [],
          referenceVideos: [],
        },
        ['https://tempfile.redpandaai.co/a.png'],
        [],
      );
      expect(gptPayload.model).toBe('gpt-image-2-6/sunburst-image-to-image');
      expect(gptPayload.input.input_urls).toEqual([
        'https://tempfile.redpandaai.co/a.png',
      ]);

      const nanoPayload = router.buildKiePayload(
        nanoSpec,
        {
          modelKey: nanoSpec.key,
          prompt: 'Turnaround',
          routingMode: 'KIE_ONLY',
          aspectRatio: '3:4',
          resolution: '2K',
          referenceImages: [],
          referenceVideos: [],
        },
        ['https://tempfile.redpandaai.co/b.png'],
        [],
      );
      expect(nanoPayload.model).toBe('nano-banana-2-1');
      expect(nanoPayload.input.image_input).toEqual([
        'https://tempfile.redpandaai.co/b.png',
      ]);
    });
  });
});
