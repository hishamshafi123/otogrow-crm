import {
  type StudioPresetConfig,
  type StudioPresetKind,
} from 'src/modules/delivery/studio/entities/delivery-studio-preset.entity';

export type StudioModelKind = 'IMAGE' | 'VIDEO';

export type StudioModelSpec = {
  key: string;
  label: string;
  vendor: string;
  kind: StudioModelKind;
  tier: 'FLAGSHIP' | 'FAST' | 'VALUE' | 'SPECIALIZED';
  description: string;
  wavespeed: {
    endpoint: string;
    imageInputField?: 'images' | 'reference_images' | 'image';
    videoInputField?: 'reference_videos' | 'videos' | 'video';
    omitResolution?: boolean;
    supportsSyncMode?: boolean;
  };
  kie: {
    model: string;
    imageInputField?:
      | 'input_urls'
      | 'image_input'
      | 'image_urls'
      | 'reference_image_urls';
    videoInputField?: 'reference_video_urls' | 'video_urls' | 'video_url';
    audioInputField?: 'generate_audio' | 'audio';
    omniReferenceTaskType?: 'reference' | 'edit';
    resolutionFormat?: 'LOWER' | 'UPPER';
    maxResolution?: '480p' | '720p' | '1080p';
    durationAsNumber?: boolean;
  };
  capabilities: {
    maxReferenceImages: number;
    maxReferenceVideos: number;
    minDurationSec?: number;
    maxDurationSec?: number;
    maxInputVideoSec?: number;
    aspectRatios: string[];
    resolutions: string[];
    defaultResolution: string;
    supportsAudio?: boolean;
    supportsDraftMode?: boolean;
    usesAtMentionTokens?: boolean;
  };
  pricing: {
    unit: 'PER_IMAGE' | 'PER_SECOND';
    // Fallback base USD rate (at default resolution)
    baseRateUsd: number;
    resolutionMultipliers?: Record<string, number>;
    // True when provider bills (inputVideoDurationSec + outputDurationSec) * rate
    billsInputVideoDuration?: boolean;
    // WaveSpeed Seedance floor: billed reference duration >= ceil(outputSec * 2/3)
    minRefVideoRatioOfOutput?: number;
    // Verified exact provider USD rates by resolution
    providerRates?: {
      wavespeed?: {
        perImage?: Record<string, number>;
        perSecWithoutRefVideo?: Record<string, number>;
        perSecWithRefVideo?: Record<string, number>;
      };
      kie?: {
        perImage?: Record<string, number>;
        perSecWithoutRefVideo?: Record<string, number>;
        perSecWithRefVideo?: Record<string, number>;
      };
    };
  };
};

export const STUDIO_MODEL_CATALOG: readonly StudioModelSpec[] = [
  // ===================== IMAGE MODELS (Character Sheets & Stills) =====================
  {
    key: 'nano-banana-2.1',
    label: 'Google Nano Banana 2.1',
    vendor: 'Google',
    kind: 'IMAGE',
    tier: 'FLAGSHIP',
    description:
      'Multi-reference Gemini image model up to 4K — fast, sharp garment & character consistency.',
    wavespeed: {
      endpoint: 'google/nano-banana-2.1/edit',
      imageInputField: 'images',
    },
    kie: {
      model: 'nano-banana-2-1',
      imageInputField: 'image_input',
    },
    capabilities: {
      maxReferenceImages: 10,
      maxReferenceVideos: 0,
      aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2'],
      resolutions: ['1K', '2K', '4K'],
      defaultResolution: '2K',
    },
    pricing: {
      unit: 'PER_IMAGE',
      baseRateUsd: 0.054,
      resolutionMultipliers: { '1K': 0.7, '2K': 1, '4K': 2.25 },
      providerRates: {
        // WaveSpeedAI Edit (-10% standard rate; list 1K=$0.042, 2K=$0.06, 4K=$0.135)
        wavespeed: {
          perImage: { '1K': 0.0378, '2K': 0.054, '4K': 0.1215 },
        },
        // Kie.ai (1 cr = $0.005: 1K=4cr, 2K=6cr, 4K=12cr)
        kie: {
          perImage: { '1K': 0.02, '2K': 0.03, '4K': 0.06 },
        },
      },
    },
  },
  {
    key: 'nano-banana-pro',
    label: 'Google Nano Banana Pro',
    vendor: 'Google',
    kind: 'IMAGE',
    tier: 'FLAGSHIP',
    description:
      'Gemini 3.0 Pro Image — studio-grade lighting and turnaround consistency.',
    wavespeed: {
      endpoint: 'google/nano-banana-pro/edit',
      imageInputField: 'images',
    },
    kie: {
      model: 'nano-banana-pro',
      imageInputField: 'image_input',
    },
    capabilities: {
      maxReferenceImages: 8,
      maxReferenceVideos: 0,
      aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9'],
      resolutions: ['1K', '2K', '4K'],
      defaultResolution: '2K',
    },
    pricing: {
      unit: 'PER_IMAGE',
      baseRateUsd: 0.126,
      resolutionMultipliers: { '1K': 1, '2K': 1, '4K': 1.7143 },
      providerRates: {
        // WaveSpeedAI Edit (-10% standard rate; list 1K/2K=$0.14, 4K=$0.24)
        wavespeed: {
          perImage: { '1K': 0.126, '2K': 0.126, '4K': 0.216 },
        },
        // Kie.ai (1K/2K=18cr=$0.09, 4K=24cr=$0.12)
        kie: {
          perImage: { '1K': 0.09, '2K': 0.09, '4K': 0.12 },
        },
      },
    },
  },
  {
    key: 'gpt-image-2.6-sunburst',
    label: 'OpenAI GPT Image 2.6 Sunburst',
    vendor: 'OpenAI',
    kind: 'IMAGE',
    tier: 'FLAGSHIP',
    description:
      'Highest detail & print/logo fidelity across up to 16 reference images.',
    wavespeed: {
      endpoint: 'openai/gpt-image-2.6-sunburst/edit',
      imageInputField: 'images',
    },
    kie: {
      model: 'gpt-image-2-6/sunburst-image-to-image',
      imageInputField: 'input_urls',
    },
    capabilities: {
      maxReferenceImages: 16,
      maxReferenceVideos: 0,
      aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'],
      resolutions: ['1K', '2K'],
      defaultResolution: '1K',
    },
    pricing: {
      unit: 'PER_IMAGE',
      baseRateUsd: 0.0585,
      resolutionMultipliers: { '1K': 1, '2K': 2 },
      providerRates: {
        // WaveSpeedAI Edit medium (-10%: 1K=$0.0585 list $0.065; 2K=$0.117 list $0.13)
        wavespeed: {
          perImage: { '1K': 0.0585, '2K': 0.117 },
        },
        // Kie.ai token-based typical average with ref images
        kie: {
          perImage: { '1K': 0.05, '2K': 0.095 },
        },
      },
    },
  },
  {
    key: 'gpt-image-2.6-flare',
    label: 'OpenAI GPT Image 2.6 Flare',
    vendor: 'OpenAI',
    kind: 'IMAGE',
    tier: 'FAST',
    description:
      'Fast layout-strong GPT Image 2.6 variant — great for rapid multi-angle turnarounds.',
    wavespeed: {
      endpoint: 'openai/gpt-image-2.6-flare/edit',
      imageInputField: 'images',
    },
    kie: {
      model: 'gpt-image-2-6/flare-image-to-image',
      imageInputField: 'input_urls',
    },
    capabilities: {
      maxReferenceImages: 16,
      maxReferenceVideos: 0,
      aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'],
      resolutions: ['1K', '2K'],
      defaultResolution: '1K',
    },
    pricing: {
      unit: 'PER_IMAGE',
      baseRateUsd: 0.045,
      resolutionMultipliers: { '1K': 1, '2K': 2 },
      providerRates: {
        // WaveSpeedAI medium (-10%: 1K=$0.045 list $0.05; 2K=$0.090 list $0.10)
        wavespeed: {
          perImage: { '1K': 0.045, '2K': 0.09 },
        },
        // Kie.ai token-based typical average
        kie: {
          perImage: { '1K': 0.04, '2K': 0.075 },
        },
      },
    },
  },

  // ===================== VIDEO MODELS (Reference-to-Video & Video Edit) =====================
  {
    key: 'seedance-2.5',
    label: 'Seedance 2.5 Standard',
    vendor: 'ByteDance',
    kind: 'VIDEO',
    tier: 'FLAGSHIP',
    description:
      'Reference-to-Video flagship with @image / @video anchoring, exact cut/action fidelity & native audio.',
    wavespeed: {
      endpoint: 'bytedance/seedance-2.5/reference-to-video',
      imageInputField: 'reference_images',
      videoInputField: 'reference_videos',
    },
    kie: {
      model: 'bytedance/seedance-2-5',
      imageInputField: 'reference_image_urls',
      videoInputField: 'reference_video_urls',
      audioInputField: 'generate_audio',
      omniReferenceTaskType: 'reference',
      durationAsNumber: true,
    },
    capabilities: {
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      minDurationSec: 4,
      maxDurationSec: 30,
      maxInputVideoSec: 30,
      aspectRatios: ['9:16', '16:9', '1:1', '3:4', '4:3'],
      resolutions: ['480p', '720p', '1080p'],
      defaultResolution: '720p',
      supportsAudio: true,
      supportsDraftMode: true,
      usesAtMentionTokens: true,
    },
    pricing: {
      unit: 'PER_SECOND',
      baseRateUsd: 0.198,
      resolutionMultipliers: { '480p': 0.5, '720p': 1, '1080p': 2.5 },
      billsInputVideoDuration: true,
      minRefVideoRatioOfOutput: 2 / 3,
      providerRates: {
        // WaveSpeedAI (-10% standard rate; list with ref: 480p=$0.11, 720p=$0.22, 1080p=$0.55)
        wavespeed: {
          perSecWithoutRefVideo: { '480p': 0.162, '720p': 0.324, '1080p': 0.81 },
          perSecWithRefVideo: { '480p': 0.099, '720p': 0.198, '1080p': 0.495 },
        },
        // Kie.ai (1 cr = $0.005: with ref 480p=17cr, 720p=38cr, 1080p=95cr)
        kie: {
          perSecWithoutRefVideo: { '480p': 0.14, '720p': 0.315, '1080p': 0.79 },
          perSecWithRefVideo: { '480p': 0.085, '720p': 0.19, '1080p': 0.475 },
        },
      },
    },
  },
  {
    key: 'seedance-2.5-flash',
    label: 'Seedance 2.5 Flash (Fast / Draft)',
    vendor: 'ByteDance',
    kind: 'VIDEO',
    tier: 'FAST',
    description:
      'High-speed Seedance 2.5 for rapid motion testing & high-volume batches.',
    wavespeed: {
      endpoint: 'bytedance/seedance-2.5-flash/reference-to-video',
      imageInputField: 'reference_images',
      videoInputField: 'reference_videos',
    },
    kie: {
      model: 'bytedance/seedance-2-5-flash',
      imageInputField: 'reference_image_urls',
      videoInputField: 'reference_video_urls',
      audioInputField: 'generate_audio',
      omniReferenceTaskType: 'reference',
      maxResolution: '720p',
      durationAsNumber: true,
    },
    capabilities: {
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      minDurationSec: 4,
      maxDurationSec: 30,
      maxInputVideoSec: 30,
      aspectRatios: ['9:16', '16:9', '1:1', '3:4', '4:3'],
      resolutions: ['480p', '720p', '1080p'],
      defaultResolution: '720p',
      supportsAudio: true,
      supportsDraftMode: true,
      usesAtMentionTokens: true,
    },
    pricing: {
      unit: 'PER_SECOND',
      baseRateUsd: 0.135,
      resolutionMultipliers: { '480p': 0.5, '720p': 1, '1080p': 2.5 },
      billsInputVideoDuration: true,
      minRefVideoRatioOfOutput: 2 / 3,
      providerRates: {
        // WaveSpeedAI (-10%: with ref 480p=$0.0675, 720p=$0.135, 1080p=$0.3375)
        wavespeed: {
          perSecWithoutRefVideo: { '480p': 0.108, '720p': 0.216, '1080p': 0.54 },
          perSecWithRefVideo: { '480p': 0.0675, '720p': 0.135, '1080p': 0.3375 },
        },
        // Kie.ai (clamps max to 720p: with ref 480p=11.5cr=$0.0575, 720p=25.5cr=$0.1275)
        kie: {
          perSecWithoutRefVideo: { '480p': 0.0925, '720p': 0.205, '1080p': 0.205 },
          perSecWithRefVideo: { '480p': 0.0575, '720p': 0.1275, '1080p': 0.1275 },
        },
      },
    },
  },
  {
    key: 'seedance-2.5-edit',
    label: 'Seedance 2.5 Video Edit',
    vendor: 'ByteDance',
    kind: 'VIDEO',
    tier: 'SPECIALIZED',
    description:
      'Direct video-to-video character, apparel, and environment editing while preserving shots & pacing.',
    wavespeed: {
      endpoint: 'bytedance/seedance-2.5/video-edit',
      imageInputField: 'reference_images',
      videoInputField: 'video',
    },
    kie: {
      model: 'bytedance/seedance-2-5',
      imageInputField: 'reference_image_urls',
      videoInputField: 'reference_video_urls',
      audioInputField: 'generate_audio',
      omniReferenceTaskType: 'edit',
      durationAsNumber: true,
    },
    capabilities: {
      maxReferenceImages: 9,
      maxReferenceVideos: 2,
      minDurationSec: 4,
      maxDurationSec: 30,
      maxInputVideoSec: 30,
      aspectRatios: ['9:16', '16:9', '1:1', '3:4', '4:3'],
      resolutions: ['480p', '720p', '1080p'],
      defaultResolution: '720p',
      supportsAudio: true,
      supportsDraftMode: true,
      usesAtMentionTokens: true,
    },
    pricing: {
      unit: 'PER_SECOND',
      baseRateUsd: 0.198,
      resolutionMultipliers: { '480p': 0.5, '720p': 1, '1080p': 2.5 },
      billsInputVideoDuration: true,
      minRefVideoRatioOfOutput: 2 / 3,
      providerRates: {
        wavespeed: {
          perSecWithoutRefVideo: { '480p': 0.162, '720p': 0.324, '1080p': 0.81 },
          perSecWithRefVideo: { '480p': 0.099, '720p': 0.198, '1080p': 0.495 },
        },
        kie: {
          perSecWithoutRefVideo: { '480p': 0.14, '720p': 0.315, '1080p': 0.79 },
          perSecWithRefVideo: { '480p': 0.085, '720p': 0.19, '1080p': 0.475 },
        },
      },
    },
  },
  {
    key: 'magi-2',
    label: 'MAGI-2 (Sand AI)',
    vendor: 'Sand AI',
    kind: 'VIDEO',
    tier: 'FLAGSHIP',
    description:
      'Native 1080p 25fps + audio, up to 10 images & 5 reference videos — standout value for 120-video batches.',
    wavespeed: {
      endpoint: 'sand-ai/magi-2/reference-to-video',
      imageInputField: 'images',
      videoInputField: 'videos',
      omitResolution: true,
    },
    kie: {
      model: 'magi-2/reference-to-video',
      imageInputField: 'reference_image_urls',
      videoInputField: 'reference_video_urls',
      audioInputField: 'generate_audio',
      durationAsNumber: true,
    },
    capabilities: {
      maxReferenceImages: 10,
      maxReferenceVideos: 5,
      minDurationSec: 4,
      maxDurationSec: 30,
      maxInputVideoSec: 30,
      aspectRatios: ['9:16', '16:9', '1:1'],
      resolutions: ['720p', '1080p'],
      defaultResolution: '1080p',
      supportsAudio: true,
      supportsDraftMode: false,
      usesAtMentionTokens: false,
    },
    pricing: {
      unit: 'PER_SECOND',
      baseRateUsd: 0.08,
      resolutionMultipliers: { '720p': 1, '1080p': 1 },
      billsInputVideoDuration: false,
      providerRates: {
        // WaveSpeedAI flat 1080p with audio included ($0.08/s output only)
        wavespeed: {
          perSecWithoutRefVideo: { '720p': 0.08, '1080p': 0.08 },
          perSecWithRefVideo: { '720p': 0.08, '1080p': 0.08 },
        },
        // Kie.ai flat 1080p (17.6 cr/s = $0.088/s output only)
        kie: {
          perSecWithoutRefVideo: { '720p': 0.088, '1080p': 0.088 },
          perSecWithRefVideo: { '720p': 0.088, '1080p': 0.088 },
        },
      },
    },
  },
  {
    key: 'wan-3.0',
    label: 'Wan 3.0 Reference-to-Video',
    vendor: 'Alibaba',
    kind: 'VIDEO',
    tier: 'VALUE',
    description:
      'Cost-efficient reference-to-video engine (input clips up to 15s) for rapid high-throughput creative.',
    wavespeed: {
      endpoint: 'alibaba/wan-3.0/reference-to-video',
      imageInputField: 'reference_images',
      videoInputField: 'reference_videos',
    },
    kie: {
      model: 'wan/3-0-video',
      imageInputField: 'reference_image_urls',
      videoInputField: 'reference_video_urls',
      audioInputField: 'audio',
      resolutionFormat: 'UPPER',
      durationAsNumber: true,
    },
    capabilities: {
      maxReferenceImages: 6,
      maxReferenceVideos: 1,
      minDurationSec: 4,
      maxDurationSec: 15,
      maxInputVideoSec: 15,
      aspectRatios: ['9:16', '16:9', '1:1'],
      resolutions: ['480p', '720p', '1080p'],
      defaultResolution: '720p',
      supportsAudio: true,
      supportsDraftMode: true,
      usesAtMentionTokens: false,
    },
    pricing: {
      unit: 'PER_SECOND',
      baseRateUsd: 0.09,
      resolutionMultipliers: { '480p': 0.5, '720p': 1, '1080p': 2 },
      billsInputVideoDuration: true,
      providerRates: {
        // WaveSpeedAI (-10%: 480p=$0.045/s, 720p=$0.09/s, 1080p=$0.18/s)
        wavespeed: {
          perSecWithoutRefVideo: { '480p': 0.045, '720p': 0.09, '1080p': 0.18 },
          perSecWithRefVideo: { '480p': 0.045, '720p': 0.09, '1080p': 0.18 },
        },
        // Kie.ai (480p=8cr=$0.040/s, 720p=16cr=$0.080/s, 1080p=32cr=$0.160/s)
        kie: {
          perSecWithoutRefVideo: { '480p': 0.04, '720p': 0.08, '1080p': 0.16 },
          perSecWithRefVideo: { '480p': 0.04, '720p': 0.08, '1080p': 0.16 },
        },
      },
    },
  },
  {
    key: 'wan-3.0-prime',
    label: 'Wan 3.0 Prime (Video Edit)',
    vendor: 'Alibaba',
    kind: 'VIDEO',
    tier: 'VALUE',
    description:
      'Higher-fidelity Wan 3.0 Prime for clean apparel & scene swaps on reference videos up to 15s.',
    wavespeed: {
      endpoint: 'alibaba/wan-3.0-prime/video-edit',
      imageInputField: 'reference_images',
      videoInputField: 'video',
    },
    kie: {
      model: 'wan/3-0-video-prime',
      imageInputField: 'reference_image_urls',
      videoInputField: 'reference_video_urls',
      audioInputField: 'audio',
      resolutionFormat: 'UPPER',
      durationAsNumber: true,
    },
    capabilities: {
      maxReferenceImages: 6,
      maxReferenceVideos: 1,
      minDurationSec: 4,
      maxDurationSec: 15,
      maxInputVideoSec: 15,
      aspectRatios: ['9:16', '16:9', '1:1'],
      resolutions: ['720p', '1080p'],
      defaultResolution: '1080p',
      supportsAudio: true,
      supportsDraftMode: false,
      usesAtMentionTokens: false,
    },
    pricing: {
      unit: 'PER_SECOND',
      baseRateUsd: 0.27,
      resolutionMultipliers: { '480p': 0.25, '720p': 0.5, '1080p': 1 },
      billsInputVideoDuration: true,
      providerRates: {
        // WaveSpeedAI 1.5x Wan 3.0 (-10%: 480p=$0.0675/s, 720p=$0.135/s, 1080p=$0.27/s)
        wavespeed: {
          perSecWithoutRefVideo: { '480p': 0.0675, '720p': 0.135, '1080p': 0.27 },
          perSecWithRefVideo: { '480p': 0.0675, '720p': 0.135, '1080p': 0.27 },
        },
        // Kie.ai (480p=12.2cr=$0.0612/s, 720p=25.2cr=$0.126/s, 1080p=50.4cr=$0.252/s)
        kie: {
          perSecWithoutRefVideo: { '480p': 0.0612, '720p': 0.126, '1080p': 0.252 },
          perSecWithRefVideo: { '480p': 0.0612, '720p': 0.126, '1080p': 0.252 },
        },
      },
    },
  },
];

export const getStudioModelSpec = (modelKey: string): StudioModelSpec | null =>
  STUDIO_MODEL_CATALOG.find((item) => item.key === modelKey) ?? null;

export const computeBilledVideoSeconds = (params: {
  spec: StudioModelSpec;
  outputDurationSec: number;
  referenceVideoDurationSec?: number | null;
}): {
  outputSec: number;
  billedRefSec: number;
  totalBilledSec: number;
  hasRefVideo: boolean;
} => {
  const outputSec = Math.max(
    params.spec.capabilities.minDurationSec ?? 4,
    Math.min(
      params.spec.capabilities.maxDurationSec ?? 30,
      Math.round(params.outputDurationSec),
    ),
  );
  const rawRefSec =
    typeof params.referenceVideoDurationSec === 'number' &&
    Number.isFinite(params.referenceVideoDurationSec) &&
    params.referenceVideoDurationSec > 0
      ? params.referenceVideoDurationSec
      : 0;
  const hasRefVideo = rawRefSec > 0;
  if (!hasRefVideo || !params.spec.pricing.billsInputVideoDuration) {
    return {
      outputSec,
      billedRefSec: 0,
      totalBilledSec: outputSec,
      hasRefVideo,
    };
  }

  const maxIn = params.spec.capabilities.maxInputVideoSec ?? 30;
  const normalizedRef = Math.ceil(Math.max(2, Math.min(maxIn, rawRefSec)));
  const minFloor = params.spec.pricing.minRefVideoRatioOfOutput
    ? Math.ceil(outputSec * params.spec.pricing.minRefVideoRatioOfOutput)
    : 0;
  const billedRefSec = Math.max(normalizedRef, minFloor);

  return {
    outputSec,
    billedRefSec,
    totalBilledSec: outputSec + billedRefSec,
    hasRefVideo: true,
  };
};

export const estimateStudioJobCostUsd = (params: {
  modelKey: string;
  resolution?: string;
  durationSec?: number;
  referenceVideoDurationSec?: number | null;
  count?: number;
  provider?: 'wavespeed' | 'kie';
}): string => {
  const spec = getStudioModelSpec(params.modelKey);
  if (!spec) return '0.0000';
  const res = params.resolution || spec.capabilities.defaultResolution;
  const qty = Math.max(1, params.count ?? 1);
  const providerKey = params.provider ?? 'wavespeed';
  const providerTable =
    spec.pricing.providerRates?.[providerKey] ??
    spec.pricing.providerRates?.wavespeed ??
    spec.pricing.providerRates?.kie;

  if (spec.pricing.unit === 'PER_IMAGE') {
    const exactRate =
      providerTable?.perImage?.[res] ??
      providerTable?.perImage?.[res.toUpperCase()] ??
      spec.pricing.baseRateUsd *
        (spec.pricing.resolutionMultipliers?.[res] ?? 1);
    return (exactRate * qty).toFixed(4);
  }

  const billed = computeBilledVideoSeconds({
    spec,
    outputDurationSec: params.durationSec ?? 8,
    referenceVideoDurationSec: params.referenceVideoDurationSec,
  });

  const rateMap = billed.hasRefVideo
    ? (providerTable?.perSecWithRefVideo ??
      providerTable?.perSecWithoutRefVideo)
    : (providerTable?.perSecWithoutRefVideo ??
      providerTable?.perSecWithRefVideo);

  const perSecRate =
    rateMap?.[res] ??
    rateMap?.[res.toLowerCase()] ??
    spec.pricing.baseRateUsd *
      (spec.pricing.resolutionMultipliers?.[res] ?? 1);

  return (perSecRate * billed.totalBilledSec * qty).toFixed(4);
};

export type StudioPromptVariables = {
  product_name?: string;
  product_notes?: string;
  brand_notes?: string;
  angles?: string;
  angle_count?: string;
  layout_style?: string;
  talent?: string;
  environment?: string;
  reference_notes?: string;
  custom_notes?: string;
};

/**
 * Dynamic Master Prompt compiler. Replaces `{{variable}}` tokens cleanly and
 * strips empty clauses so saved presets work seamlessly across any brand/style.
 */
export const compileStudioPromptTemplate = (
  masterPrompt: string,
  variables: StudioPromptVariables,
): string => {
  const normalized: Record<string, string> = {
    product_name: (variables.product_name ?? '').trim(),
    product_notes: (variables.product_notes ?? '').trim(),
    brand_notes: (variables.brand_notes ?? '').trim(),
    angles: (variables.angles ?? '').trim(),
    angle_count: (variables.angle_count ?? '').trim(),
    layout_style: (variables.layout_style ?? '').trim(),
    talent: (variables.talent ?? '').trim(),
    environment: (variables.environment ?? '').trim(),
    reference_notes: (variables.reference_notes ?? '').trim(),
    custom_notes: (variables.custom_notes ?? '').trim(),
  };

  let output = masterPrompt.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_match, key: string) => normalized[key] ?? '',
  );

  // Append non-empty environment or custom notes if the master prompt didn't explicitly include those tokens
  if (
    normalized.environment &&
    !/\{\{\s*environment\s*\}\}/.test(masterPrompt)
  ) {
    output = `${output.trim()}\nEnvironment / Setting: ${normalized.environment}`;
  }
  if (
    normalized.custom_notes &&
    !/\{\{\s*custom_notes\s*\}\}/.test(masterPrompt)
  ) {
    output = `${output.trim()}\nAdditional Direction: ${normalized.custom_notes}`;
  }

  return output
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export type StarterStudioPresetSeed = {
  kind: StudioPresetKind;
  name: string;
  description: string;
  masterPrompt: string;
  configJson: StudioPresetConfig;
  examplesJson: string[];
  tagsJson: string[];
  isDefault: boolean;
};

export const STARTER_STUDIO_PRESETS: readonly StarterStudioPresetSeed[] = [
  {
    kind: 'CHARACTER_SHEET',
    name: '4-Angle Apparel Turnaround Sheet',
    description:
      'Clean 2x2 turnaround (Front, Back, 3/4 Profile, Detail Close-up) showing the chosen Avatar wearing the Cloth inside the chosen Environment.',
    masterPrompt:
      'Create a crisp, photorealistic {{angle_count}}-panel fashion character turnaround sheet ({{angles}}) set inside this environment: {{environment}}. The model ({{talent}}) is wearing the exact {{product_name}} shown in the reference garment images (Image 1, Image 2, etc.). Preserve every graphic, logo placement, typography, seam, wash texture, and boxy drape with 100% accuracy. {{product_notes}} {{brand_notes}} Consistent face, body proportions, lighting, and environment across every panel, zero distortion, no text labels. {{custom_notes}}',
    configJson: {
      angleCount: 4,
      angleLayout: 'GRID_SHEET',
      angles: [
        'Full-body Front View',
        'Full-body Back View showing back print',
        '3/4 Side Profile',
        'Upper Torso Close-up showing fabric & print detail',
      ],
      modelKey: 'nano-banana-2.1',
      aspectRatio: '3:4',
      resolution: '2K',
      candidateCount: 1,
    },
    examplesJson: [],
    tagsJson: ['apparel', '4-angle', 'turnaround'],
    isDefault: true,
  },
  {
    kind: 'CHARACTER_SHEET',
    name: '2-Angle Front & Back Fit Sheet',
    description:
      'Side-by-side Front & Back full-body sheet — ideal for rapid T-shirt / hoodie batches.',
    masterPrompt:
      'Create a clean 2-panel side-by-side fashion model reference sheet ({{angles}}) set in {{environment}}. The model ({{talent}}) wears the exact {{product_name}} from the reference photos. Maintain exact front and back graphic alignment, neckline, sleeve fit, and fabric weight. {{product_notes}} {{brand_notes}} Sharp focus, natural skin texture, zero extra text overlays. {{custom_notes}}',
    configJson: {
      angleCount: 2,
      angleLayout: 'GRID_SHEET',
      angles: ['Full-body Front View', 'Full-body Back View'],
      modelKey: 'gpt-image-2.6-sunburst',
      aspectRatio: '4:3',
      resolution: '1K',
      candidateCount: 1,
    },
    examplesJson: [],
    tagsJson: ['apparel', '2-angle', 'fast'],
    isDefault: false,
  },
  {
    kind: 'CHARACTER_SHEET',
    name: 'Single Editorial Hero Frame',
    description:
      'One full-frame lifestyle/editorial hero image of the talent wearing the garment.',
    masterPrompt:
      'Photorealistic editorial full-frame portrait of {{talent}} wearing the exact {{product_name}} from the reference images. Preserve exact garment silhouette, print graphics, and fabric wash. Setting: {{environment}}. {{product_notes}} {{brand_notes}} Shot on 35mm lens, natural skin texture, authentic social-native lighting. {{custom_notes}}',
    configJson: {
      angleCount: 1,
      angleLayout: 'SINGLE_HERO',
      angles: ['Single Full-Frame Hero Shot'],
      modelKey: 'nano-banana-2.1',
      aspectRatio: '9:16',
      resolution: '2K',
      candidateCount: 1,
    },
    examplesJson: [],
    tagsJson: ['hero', '1-angle', 'editorial'],
    isDefault: false,
  },
  {
    kind: 'VIDEO_GENERATION',
    name: 'Reference-Video Apparel Swap (Keep Character Sheet Environment)',
    description:
      'Remakes @video1 shot-for-shot with the exact model, outfit, garment graphic fidelity, and environment from your Character Sheet & product photos.',
    masterPrompt: [
      'Recreate @video1 exactly: the same shots, the same cuts and timing, the same camera moves, the same transitions, and the same poses.',
      'Replace the original subject in @video1 with the model from @image1. Match their face, hair, skin tone, and build exactly across every shot.',
      'They wear the exact outfit from @image1 in every shot, featuring the exact {{product_name}} from the product reference images. Keep the garment color, fabric drape, neckline, and graphic placement 100% identical to the product images. Do not center, shrink, mirror, redraw, move, or resize any print or logo. If no back print is shown, keep the back plain and blank.',
      'Change the environment from the original setting in @video1 to: {{environment}}. Keep the background sharp and cohesive across every cut.',
      'Match the color tone and lighting to the Character Sheet and target environment while keeping the garment and print in their true colors. {{product_notes}} {{brand_notes}} {{custom_notes}}',
      'No captions or on-screen text in any frame. Do not show the original design or the original person from @video1 in the output video. Remake the exact same reference video with the inputted model, garment, environment, and color tone while keeping the edit, shots, timing, and poses identical.',
    ].join('\n\n'),
    configJson: {
      modelKey: 'seedance-2.5',
      aspectRatio: '9:16',
      resolution: '720p',
      durationSec: 8,
      generateAudio: true,
      preserveReferenceSetting: false,
    },
    examplesJson: [],
    tagsJson: ['apparel-swap', 'environment-override', 'reference-to-video'],
    isDefault: true,
  },
  {
    kind: 'VIDEO_GENERATION',
    name: 'Reference-Video Apparel Swap (Keep Reference Video Setting)',
    description:
      'Replaces the subject & outfit in @video1 while keeping the original reference video background.',
    masterPrompt: [
      'Recreate @video1 exactly: the same shots, the same cuts and timing, the same camera moves, the same transitions, and the same poses.',
      'Replace the original subject in @video1 with the model from @image1. Match their face, hair, skin tone, and build exactly across every shot.',
      'They wear the exact outfit from @image1 in every shot, featuring the exact {{product_name}} from the product reference images. Keep the garment color, fabric drape, and graphic placement 100% identical to the product images. Do not center, shrink, mirror, redraw, move, or resize any print or logo.',
      'Keep the original reference video environment and lighting continuity seamless and natural. {{product_notes}} {{brand_notes}} {{custom_notes}}',
      'No captions or on-screen text in any frame. Do not show the original garment design or the original person from @video1 in the output video.',
    ].join('\n\n'),
    configJson: {
      modelKey: 'seedance-2.5',
      aspectRatio: '9:16',
      resolution: '720p',
      durationSec: 8,
      generateAudio: true,
      preserveReferenceSetting: true,
    },
    examplesJson: [],
    tagsJson: ['apparel-swap', 'reference-setting'],
    isDefault: false,
  },
  {
    kind: 'TEXT_HOOK',
    name: 'Streetwear & Apparel Scroll-Stop Hooks',
    description:
      'Punchy, organic-feeling 5–10 word opening text hooks tailored for fashion drops, fit checks, and paid social Reels/TikToks.',
    masterPrompt:
      'Write ultra-natural, high-converting opening text hooks for a short-form fashion/apparel video. Match the exact visual energy seen in the video assessment, lean into fabric weight, boxy fit, graphic story, or drop scarcity without sounding like a cheesy ad. Keep every hook between 4 and 11 words so it reads effortlessly in 2 seconds on mobile. Vary angles across POV/Relatable, Pattern Interrupt, Craft/Quality Callout, Social Proof, and Drop Urgency.',
    configJson: {
      defaultVariationCount: 3,
      platform: 'ALL',
      funnelStage: 'COLD',
      hookStylePreset: 'TIKTOK_PILL',
    },
    examplesJson: [
      'POV: You finally found a heavyweight tee that actually drapes right',
      'Why everyone is asking where this washed boxy tee is from',
      'Heavyweight cotton + zero collar bacon. That’s the whole drop.',
      'Not another thin graphic tee — feel the weight on this one',
    ],
    tagsJson: ['apparel', 'hooks', 'tiktok', 'reels'],
    isDefault: true,
  },
  // ===================== STARTER AVATARS (CASTING_PERSONA) =====================
  {
    kind: 'CASTING_PERSONA',
    name: 'Streetwear Male · Early 20s',
    description: 'Relaxed confident streetwear model with natural skin texture and clean modern styling.',
    masterPrompt:
      'Young adult male streetwear model (early 20s), athletic lean build, relaxed confident posture, natural unretouched skin texture, modern textured short hair, subtle silver chain, authentic lookbook presence.',
    configJson: { category: 'Men', visualAccent: 'slate' },
    examplesJson: [],
    tagsJson: ['avatar', 'men', 'streetwear'],
    isDefault: true,
  },
  {
    kind: 'CASTING_PERSONA',
    name: 'Editorial Female · Minimalist',
    description: 'Clean fashion-editorial female model with effortless high-fashion silhouette.',
    masterPrompt:
      'Young adult female fashion editorial model (mid 20s), effortless confident posture, natural glowing skin texture, sleek slicked-back hair, minimal gold earrings, high-fashion contemporary lookbook presence.',
    configJson: { category: 'Women', visualAccent: 'iris' },
    examplesJson: [],
    tagsJson: ['avatar', 'women', 'editorial'],
    isDefault: false,
  },
  {
    kind: 'CASTING_PERSONA',
    name: 'UGC Natural Creator · Female',
    description: 'Approachable authentic TikTok/Reels creator energy — ideal for organic fit checks.',
    masterPrompt:
      'Relatable young female lifestyle creator (early 20s), warm approachable expression, natural wavy hair, light everyday makeup, authentic mirror-selfie and handheld social video energy.',
    configJson: { category: 'Women', visualAccent: 'amber' },
    examplesJson: [],
    tagsJson: ['avatar', 'women', 'ugc'],
    isDefault: false,
  },
  {
    kind: 'CASTING_PERSONA',
    name: 'Luxury Menswear · Late 20s',
    description: 'Sharp tailored-casual male model suited for quiet luxury & elevated basics.',
    masterPrompt:
      'Male fashion model (late 20s), tall structured frame, neat short beard, calm poised expression, clean minimalist grooming, elevated quiet-luxury campaign energy.',
    configJson: { category: 'Men', visualAccent: 'blue' },
    examplesJson: [],
    tagsJson: ['avatar', 'men', 'luxury'],
    isDefault: false,
  },
  {
    kind: 'CASTING_PERSONA',
    name: 'Athletic Street · Unisex',
    description: 'Dynamic athletic build suited for hoodies, activewear, and boxy outerwear.',
    masterPrompt:
      'Fit athletic young adult model (mid 20s), strong relaxed shoulders that drape heavyweight garments well, natural candid expression, clean modern sneakers and minimal styling.',
    configJson: { category: 'Unisex', visualAccent: 'green' },
    examplesJson: [],
    tagsJson: ['avatar', 'athletic', 'streetwear'],
    isDefault: false,
  },
  // ===================== STARTER ENVIRONMENTS (ENVIRONMENT) =====================
  {
    kind: 'ENVIRONMENT',
    name: 'Sunlit Minimalist Loft',
    description: 'Warm white plaster walls, oak flooring, soft afternoon window shadows.',
    masterPrompt:
      'Sunlit minimalist architectural loft apartment with warm off-white plaster walls, pale oak wood floors, subtle linen curtains, and soft golden afternoon window light casting clean diagonal shadows.',
    configJson: { category: 'Indoor', visualAccent: 'amber' },
    examplesJson: [],
    tagsJson: ['environment', 'indoor', 'loft'],
    isDefault: true,
  },
  {
    kind: 'ENVIRONMENT',
    name: 'Urban Concrete Street',
    description: 'Raw modern city sidewalk, architectural concrete facade, crisp daylight.',
    masterPrompt:
      'Minimal urban architectural concrete street with clean stone steps, brushed steel storefront detail, soft overcast natural daylight, shallow depth of field, contemporary streetwear campaign mood.',
    configJson: { category: 'Outdoor', visualAccent: 'slate' },
    examplesJson: [],
    tagsJson: ['environment', 'outdoor', 'streetwear'],
    isDefault: false,
  },
  {
    kind: 'ENVIRONMENT',
    name: 'Boutique Mirror Fit-Check',
    description: 'Designer showroom interior with full-length arched mirror & warm spotlights.',
    masterPrompt:
      'Minimalist luxury fashion boutique interior with travertine stone floor, curated clothing rack softly blurred in background, warm architectural recessed lighting, authentic upscale fit-check atmosphere.',
    configJson: { category: 'Indoor', visualAccent: 'iris' },
    examplesJson: [],
    tagsJson: ['environment', 'indoor', 'boutique'],
    isDefault: false,
  },
  {
    kind: 'ENVIRONMENT',
    name: 'Golden Hour Rooftop',
    description: 'Warm sunset skyline terrace with cinematic rim light and open sky.',
    masterPrompt:
      'Modern minimalist city rooftop terrace at golden hour sunset, warm amber sunlight wrapping the silhouette, clean concrete parapet, softly blurred city skyline horizon, cinematic editorial contrast.',
    configJson: { category: 'Outdoor', visualAccent: 'amber' },
    examplesJson: [],
    tagsJson: ['environment', 'outdoor', 'golden-hour'],
    isDefault: false,
  },
  {
    kind: 'ENVIRONMENT',
    name: 'Clean Cyclorama Studio',
    description: 'Crisp seamless neutral light-gray studio backdrop with softbox fashion lighting.',
    masterPrompt:
      'Clean professional seamless neutral light-gray photography cyclorama studio, diffused softbox fashion lighting, crisp natural ground shadow, zero clutter, pure lookbook focus on the garment.',
    configJson: { category: 'Studio', visualAccent: 'blue' },
    examplesJson: [],
    tagsJson: ['environment', 'studio', 'minimal'],
    isDefault: false,
  },
  {
    kind: 'ENVIRONMENT',
    name: 'European Cafe Corner',
    description: 'Limestone building facade, bistro chairs, natural sunlit street vibe.',
    masterPrompt:
      'Sunlit European city street corner outside a minimalist cafe, warm cream limestone facade, understated bistro table subtly blurred in background, crisp morning daylight, editorial lifestyle aesthetic.',
    configJson: { category: 'Outdoor', visualAccent: 'green' },
    examplesJson: [],
    tagsJson: ['environment', 'outdoor', 'lifestyle'],
    isDefault: false,
  },
];
