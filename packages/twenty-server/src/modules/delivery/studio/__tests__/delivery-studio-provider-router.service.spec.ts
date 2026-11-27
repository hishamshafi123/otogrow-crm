import axios from 'axios';
import { parseMp4DurationSecFromBuffer } from 'src/modules/delivery/deliverables/delivery-media-probe.service';
import {
  compileStudioPromptTemplate,
  estimateStudioJobCostUsd,
  getStudioModelSpec,
  STUDIO_MODEL_CATALOG,
} from 'src/modules/delivery/studio/delivery-studio-catalog';
import { buildStructuredFallbackVideoPrompt } from 'src/modules/delivery/studio/delivery-studio-prompt-ai.service';
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

    it('estimates cost accurately for images and per-second video models across WaveSpeedAI and Kie.ai', () => {
      // Nano Banana 2.1 2K: $0.054/image on WaveSpeed, $0.03/image (6 cr) on Kie.ai
      expect(
        Number(
          estimateStudioJobCostUsd({
            modelKey: 'nano-banana-2.1',
            resolution: '2K',
            count: 2,
            provider: 'wavespeed',
          }),
        ),
      ).toBeCloseTo(0.108, 4);

      expect(
        Number(
          estimateStudioJobCostUsd({
            modelKey: 'nano-banana-2.1',
            resolution: '2K',
            count: 2,
            provider: 'kie',
          }),
        ),
      ).toBeCloseTo(0.06, 4);

      // MAGI-2 1080p: $0.08/s on WaveSpeed ($0.80), $0.088/s on Kie.ai ($0.88)
      expect(
        Number(
          estimateStudioJobCostUsd({
            modelKey: 'magi-2',
            resolution: '1080p',
            durationSec: 10,
            provider: 'wavespeed',
          }),
        ),
      ).toBeCloseTo(0.8, 4);

      expect(
        Number(
          estimateStudioJobCostUsd({
            modelKey: 'magi-2',
            resolution: '1080p',
            durationSec: 10,
            provider: 'kie',
          }),
        ),
      ).toBeCloseTo(0.88, 4);

      // Seedance 2.5 720p with 7s reference video + 7s output -> bills (7 + 7) = 14s
      // WaveSpeedAI: $0.198/s × 14s = $2.772; Kie.ai: $0.19/s × 14s = $2.66
      expect(
        Number(
          estimateStudioJobCostUsd({
            modelKey: 'seedance-2.5',
            resolution: '720p',
            durationSec: 7,
            referenceVideoDurationSec: 7,
            provider: 'wavespeed',
          }),
        ),
      ).toBeCloseTo(2.772, 4);

      expect(
        Number(
          estimateStudioJobCostUsd({
            modelKey: 'seedance-2.5',
            resolution: '720p',
            durationSec: 7,
            referenceVideoDurationSec: 7,
            provider: 'kie',
          }),
        ),
      ).toBeCloseTo(2.66, 4);
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

    it('maps Kie.ai Seedance 2.5, Seedance Flash, Seedance Edit, MAGI-2, and Wan 3.0 video fields accurately', () => {
      const seedanceSpec = getStudioModelSpec('seedance-2.5')!;
      const seedanceFlashSpec = getStudioModelSpec('seedance-2.5-flash')!;
      const seedanceEditSpec = getStudioModelSpec('seedance-2.5-edit')!;
      const magiSpec = getStudioModelSpec('magi-2')!;
      const wanSpec = getStudioModelSpec('wan-3.0')!;

      const seedancePayload = router.buildKiePayload(
        seedanceSpec,
        {
          modelKey: seedanceSpec.key,
          prompt: 'Swap @Image 1 into @Video 1',
          routingMode: 'KIE_ONLY',
          aspectRatio: '9:16',
          resolution: '1080p',
          durationSec: 8,
          generateAudio: true,
          referenceImages: [],
          referenceVideos: [],
        },
        ['https://tempfile.redpandaai.co/sheet.png', 'https://tempfile.redpandaai.co/tee.png'],
        ['https://tempfile.redpandaai.co/ref.mp4'],
      );
      expect(seedancePayload.model).toBe('bytedance/seedance-2-5');
      expect(seedancePayload.input).toMatchObject({
        reference_image_urls: [
          'https://tempfile.redpandaai.co/sheet.png',
          'https://tempfile.redpandaai.co/tee.png',
        ],
        reference_video_urls: ['https://tempfile.redpandaai.co/ref.mp4'],
        omni_reference_task_type: 'reference',
        duration: 8,
        resolution: '1080p',
        generate_audio: true,
      });
      expect(seedancePayload.input).not.toHaveProperty('reference_images');
      expect(seedancePayload.input).not.toHaveProperty('reference_videos');

      const flashPayload = router.buildKiePayload(
        seedanceFlashSpec,
        {
          modelKey: seedanceFlashSpec.key,
          prompt: 'Fast swap',
          routingMode: 'KIE_ONLY',
          aspectRatio: '9:16',
          resolution: '1080p',
          durationSec: 6,
          generateAudio: true,
          referenceImages: [],
          referenceVideos: [],
        },
        ['https://tempfile.redpandaai.co/sheet.png'],
        ['https://tempfile.redpandaai.co/ref.mp4'],
      );
      expect(flashPayload.input.resolution).toBe('720p');
      expect(flashPayload.input.omni_reference_task_type).toBe('reference');

      const editPayload = router.buildKiePayload(
        seedanceEditSpec,
        {
          modelKey: seedanceEditSpec.key,
          prompt: 'Edit outfit',
          routingMode: 'KIE_ONLY',
          aspectRatio: '9:16',
          resolution: '720p',
          durationSec: 8,
          referenceImages: [],
          referenceVideos: [],
        },
        ['https://tempfile.redpandaai.co/sheet.png'],
        ['https://tempfile.redpandaai.co/ref.mp4'],
      );
      expect(editPayload.input).toMatchObject({
        omni_reference_task_type: 'edit',
        aspect_ratio: 'adaptive',
        duration: -1,
        reference_image_urls: ['https://tempfile.redpandaai.co/sheet.png'],
        reference_video_urls: ['https://tempfile.redpandaai.co/ref.mp4'],
      });

      const magiPayload = router.buildKiePayload(
        magiSpec,
        {
          modelKey: magiSpec.key,
          prompt: 'Use Image 1 and Video 1',
          routingMode: 'KIE_ONLY',
          aspectRatio: '9:16',
          resolution: '720p',
          durationSec: 10,
          generateAudio: true,
          referenceImages: [],
          referenceVideos: [],
        },
        ['https://tempfile.redpandaai.co/sheet.png'],
        ['https://tempfile.redpandaai.co/ref.mp4'],
      );
      expect(magiPayload.model).toBe('magi-2/reference-to-video');
      expect(magiPayload.input).toMatchObject({
        reference_image_urls: ['https://tempfile.redpandaai.co/sheet.png'],
        reference_video_urls: ['https://tempfile.redpandaai.co/ref.mp4'],
        resolution: '1080p',
        duration: 10,
        generate_audio: true,
      });

      const wanPayload = router.buildKiePayload(
        wanSpec,
        {
          modelKey: wanSpec.key,
          prompt: 'Use Image 1 and Video 1',
          routingMode: 'KIE_ONLY',
          aspectRatio: '9:16',
          resolution: '720p',
          durationSec: 8,
          generateAudio: true,
          referenceImages: [],
          referenceVideos: [],
        },
        ['https://tempfile.redpandaai.co/sheet.png'],
        ['https://tempfile.redpandaai.co/ref.mp4'],
      );
      expect(wanPayload.model).toBe('wan/3-0-video');
      expect(wanPayload.input).toMatchObject({
        reference_image_urls: ['https://tempfile.redpandaai.co/sheet.png'],
        reference_video_urls: ['https://tempfile.redpandaai.co/ref.mp4'],
        resolution: '720P',
        duration: 8,
        audio: true,
      });
      expect(wanPayload.input).not.toHaveProperty('generate_audio');
    });

    it('maps WaveSpeedAI MAGI-2 (images/videos, no resolution) and Video Edit (singular video) fields accurately', () => {
      const magiSpec = getStudioModelSpec('magi-2')!;
      const seedanceEditSpec = getStudioModelSpec('seedance-2.5-edit')!;
      const wanPrimeSpec = getStudioModelSpec('wan-3.0-prime')!;

      const magiPayload = router.buildWaveSpeedPayload(
        magiSpec,
        {
          modelKey: magiSpec.key,
          prompt: 'Swap garment',
          routingMode: 'WAVESPEED_ONLY',
          aspectRatio: '9:16',
          resolution: '1080p',
          durationSec: 8,
          generateAudio: true,
          referenceImages: [],
          referenceVideos: [],
        },
        ['https://cdn.wavespeed.ai/sheet.png'],
        ['https://cdn.wavespeed.ai/ref.mp4'],
      );
      expect(magiPayload).toMatchObject({
        images: ['https://cdn.wavespeed.ai/sheet.png'],
        videos: ['https://cdn.wavespeed.ai/ref.mp4'],
        duration: 8,
        generate_audio: true,
      });
      expect(magiPayload).not.toHaveProperty('resolution');
      expect(magiPayload).not.toHaveProperty('reference_images');
      expect(magiPayload).not.toHaveProperty('reference_videos');

      const seedanceEditPayload = router.buildWaveSpeedPayload(
        seedanceEditSpec,
        {
          modelKey: seedanceEditSpec.key,
          prompt: 'Edit video',
          routingMode: 'WAVESPEED_ONLY',
          aspectRatio: '9:16',
          resolution: '720p',
          durationSec: 8,
          referenceImages: [],
          referenceVideos: [],
        },
        ['https://cdn.wavespeed.ai/sheet.png'],
        ['https://cdn.wavespeed.ai/ref.mp4'],
      );
      expect(seedanceEditPayload.video).toBe('https://cdn.wavespeed.ai/ref.mp4');
      expect(seedanceEditPayload.reference_images).toEqual([
        'https://cdn.wavespeed.ai/sheet.png',
      ]);

      const wanPrimePayload = router.buildWaveSpeedPayload(
        wanPrimeSpec,
        {
          modelKey: wanPrimeSpec.key,
          prompt: 'Edit video',
          routingMode: 'WAVESPEED_ONLY',
          aspectRatio: '9:16',
          resolution: '1080p',
          durationSec: 8,
          referenceImages: [],
          referenceVideos: [],
        },
        ['https://cdn.wavespeed.ai/sheet.png'],
        ['https://cdn.wavespeed.ai/ref.mp4'],
      );
      expect(wanPrimePayload.video).toBe('https://cdn.wavespeed.ai/ref.mp4');
    });

    it('survives transient 502 errors during polling and captures actual WaveSpeed billing cost', async () => {
      const transient502 = Object.assign(new Error('Bad Gateway'), {
        isAxiosError: true,
        response: { status: 502, data: { message: 'Temporary edge error' } },
      });

      mockedAxios.post
        // 1) Submit prediction
        .mockResolvedValueOnce({
          data: { code: 200, data: { id: 'ws-pred-resilient', status: 'processing' } },
        } as never)
        // 2) Billing lookup after completion
        .mockResolvedValueOnce({
          data: {
            code: 200,
            data: {
              items: [{ prediction_uuid: 'ws-pred-resilient', price: 2.576 }],
            },
          },
        } as never);

      mockedAxios.get
        // Poll 1: transient 502
        .mockRejectedValueOnce(transient502)
        // Poll 2: still processing
        .mockResolvedValueOnce({
          data: { code: 200, data: { id: 'ws-pred-resilient', status: 'processing' } },
        } as never)
        // Poll 3: completed!
        .mockResolvedValueOnce({
          data: {
            code: 200,
            data: {
              id: 'ws-pred-resilient',
              status: 'completed',
              outputs: ['https://cdn.wavespeed.ai/resilient-out.mp4'],
            },
          },
        } as never);

      const result = await router.execute(
        {
          modelKey: 'seedance-2.5',
          prompt: 'Recreate @video1 with @image1',
          routingMode: 'WAVESPEED_ONLY',
          aspectRatio: '9:16',
          resolution: '720p',
          durationSec: 7,
          referenceImages: [
            makeImageFile({
              cachedWavespeedUrl: 'https://cdn.wavespeed.ai/sheet.png',
            }),
          ],
          referenceVideos: [
            makeVideoFile({
              cachedWavespeedUrl: 'https://cdn.wavespeed.ai/ref.mp4',
            }),
          ],
          pollIntervalMs: 0,
          maxPollAttempts: 6,
        },
        bothCredentials,
      );

      expect(result.outputUrls).toEqual([
        'https://cdn.wavespeed.ai/resilient-out.mp4',
      ]);
      expect(Number(result.actualCostUsd)).toBeCloseTo(2.576, 4);
    });

    it('resumes an in-flight Kie.ai task without resubmitting and computes actual USD from creditsConsumed', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 200,
          data: {
            taskId: 'kie-task-resume-1',
            state: 'success',
            creditsConsumed: 336,
            resultJson: JSON.stringify({
              resultUrls: ['https://cdn.kie.ai/resumed-video.mp4'],
            }),
          },
        },
      } as never);

      const resumed = await router.resumeExistingTask({
        provider: 'kie',
        modelKey: 'seedance-2.5',
        externalTaskId: 'kie-task-resume-1',
        credentials: bothCredentials,
        pollIntervalMs: 0,
        maxPollAttempts: 3,
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(resumed.outputUrls).toEqual(['https://cdn.kie.ai/resumed-video.mp4']);
      expect(Number(resumed.actualCostUsd)).toBeCloseTo(1.68, 4);
    });
  });

  describe('Reference Video Duration Fallback & Structured Prompt Builder', () => {
    it('parses duration from a minimal MP4 moov->mvhd atom without ffprobe', () => {
      // Build a minimal ISO-BMFF buffer: ftyp (16 bytes) + moov (40 bytes) containing mvhd v0 (32 bytes)
      // timescale = 1000, duration = 7400 -> 7.4s
      const mvhd = Buffer.alloc(32);
      mvhd.writeUInt32BE(32, 0);
      mvhd.write('mvhd', 4, 'ascii');
      mvhd.writeUInt8(0, 8); // version 0
      mvhd.writeUInt32BE(1000, 20); // timescale
      mvhd.writeUInt32BE(7400, 24); // duration

      const moovHeader = Buffer.alloc(8);
      moovHeader.writeUInt32BE(8 + mvhd.length, 0);
      moovHeader.write('moov', 4, 'ascii');

      const ftyp = Buffer.alloc(16);
      ftyp.writeUInt32BE(16, 0);
      ftyp.write('ftyp', 4, 'ascii');

      const mp4 = Buffer.concat([ftyp, moovHeader, mvhd]);
      expect(parseMp4DurationSecFromBuffer(mp4)).toBeCloseTo(7.4, 2);
    });

    it('builds a structured anti-leakage recreation prompt with lowercase @image/@video tokens', () => {
      const prompt = buildStructuredFallbackVideoPrompt({
        usesAtMentionTokens: true,
        characterToken: '@image1',
        productTokens: [{ token: '@image2', label: 'front flatlay' }],
        videoToken: '@video1',
        productName: 'Belfort Boxy Graphic Tee',
        environmentPrompt: 'Clean minimalist rooftop at golden hour',
      });

      expect(prompt).toContain('@image1 is the character sheet');
      expect(prompt).toContain('@image2 is the front flatlay');
      expect(prompt).toContain('@video1 is the reference video');
      expect(prompt).toContain('keep the back of the garment plain and blank');
      expect(prompt).toContain('Do not show the original garment design');
    });

    it('builds a direct product-swap prompt without mentioning a Character Sheet when characterToken is null', () => {
      const prompt = buildStructuredFallbackVideoPrompt({
        usesAtMentionTokens: true,
        characterToken: null,
        productTokens: [
          { token: '@image1', label: 'front flatlay' },
          { token: '@image2', label: 'back graphic' },
        ],
        videoToken: '@video1',
        productName: 'Belfort Heavyweight Hoodie',
      });

      expect(prompt).not.toMatch(/character sheet/i);
      expect(prompt).toContain('@image1 is the front flatlay');
      expect(prompt).toContain('@image2 is the back graphic');
      expect(prompt).toContain('@video1 is the reference video');
      expect(prompt).toContain('Keep the person, framing, and natural motion from @video1');
      expect(prompt).toContain('Keep the exact environment, background, camera lighting, and color grade from @video1');
      expect(prompt).not.toContain('No back print is shown');
    });
  });
});
