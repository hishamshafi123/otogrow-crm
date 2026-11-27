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
    videoInputField?: 'reference_videos' | 'video';
    supportsSyncMode?: boolean;
  };
  kie: {
    model: string;
    imageInputField?: 'input_urls' | 'image_input' | 'image_urls' | 'reference_images';
    videoInputField?: 'video_urls' | 'reference_videos' | 'video_url';
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
    // Indicative USD rates used for upfront batch cost estimation
    baseRateUsd: number;
    resolutionMultipliers?: Record<string, number>;
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
      baseRateUsd: 0.06,
      resolutionMultipliers: { '1K': 0.75, '2K': 1, '4K': 1.7 },
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
      baseRateUsd: 0.09,
      resolutionMultipliers: { '1K': 0.8, '2K': 1, '4K': 1.8 },
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
      baseRateUsd: 0.08,
      resolutionMultipliers: { '1K': 1, '2K': 1.6 },
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
      resolutionMultipliers: { '1K': 1, '2K': 1.5 },
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
      'Reference-to-Video flagship with @Image / @Video anchoring, exact cut/action fidelity & native audio.',
    wavespeed: {
      endpoint: 'bytedance/seedance-2.5/reference-to-video',
      imageInputField: 'reference_images',
      videoInputField: 'reference_videos',
    },
    kie: {
      model: 'bytedance/seedance-2-5',
      imageInputField: 'reference_images',
      videoInputField: 'reference_videos',
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
      baseRateUsd: 0.19,
      resolutionMultipliers: { '480p': 0.45, '720p': 1, '1080p': 2.5 },
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
      imageInputField: 'reference_images',
      videoInputField: 'reference_videos',
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
      baseRateUsd: 0.085,
      resolutionMultipliers: { '480p': 0.75, '720p': 1, '1080p': 1.8 },
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
      videoInputField: 'reference_videos',
    },
    kie: {
      model: 'bytedance/seedance-2-5',
      imageInputField: 'reference_images',
      videoInputField: 'reference_videos',
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
      baseRateUsd: 0.19,
      resolutionMultipliers: { '480p': 0.45, '720p': 1, '1080p': 2.5 },
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
      imageInputField: 'reference_images',
      videoInputField: 'reference_videos',
    },
    kie: {
      model: 'magi-2/reference-to-video',
      imageInputField: 'reference_images',
      videoInputField: 'reference_videos',
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
      baseRateUsd: 0.088,
      resolutionMultipliers: { '720p': 0.85, '1080p': 1 },
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
      model: 'wan-3-0',
      imageInputField: 'reference_images',
      videoInputField: 'reference_videos',
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
      baseRateUsd: 0.045,
      resolutionMultipliers: { '480p': 0.75, '720p': 1, '1080p': 1.5 },
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
      videoInputField: 'reference_videos',
    },
    kie: {
      model: 'wan-3-0-prime',
      imageInputField: 'reference_images',
      videoInputField: 'reference_videos',
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
      baseRateUsd: 0.062,
      resolutionMultipliers: { '720p': 0.9, '1080p': 1 },
    },
  },
];

export const getStudioModelSpec = (modelKey: string): StudioModelSpec | null =>
  STUDIO_MODEL_CATALOG.find((item) => item.key === modelKey) ?? null;

export const estimateStudioJobCostUsd = (params: {
  modelKey: string;
  resolution?: string;
  durationSec?: number;
  count?: number;
}): string => {
  const spec = getStudioModelSpec(params.modelKey);
  if (!spec) return '0.0000';
  const res = params.resolution || spec.capabilities.defaultResolution;
  const mult = spec.pricing.resolutionMultipliers?.[res] ?? 1;
  const qty = Math.max(1, params.count ?? 1);
  if (spec.pricing.unit === 'PER_IMAGE') {
    return (spec.pricing.baseRateUsd * mult * qty).toFixed(4);
  }
  const sec = Math.max(
    spec.capabilities.minDurationSec ?? 5,
    Math.min(spec.capabilities.maxDurationSec ?? 30, params.durationSec ?? 8),
  );
  return (spec.pricing.baseRateUsd * mult * sec * qty).toFixed(4);
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
      'Clean 2x2 studio turnaround (Front, Back, 3/4 Profile, Chest/Print Close-up) preserving exact garment graphics, drape, and fit.',
    masterPrompt:
      'Create a crisp, photorealistic {{angle_count}}-panel fashion character turnaround sheet ({{angles}}) on a clean neutral studio backdrop. The model ({{talent}}) is wearing the exact {{product_name}} shown in the reference images. Preserve every graphic, logo placement, typography, seam, wash texture, and boxy oversized drape with 100% accuracy. {{product_notes}} {{brand_notes}} Natural editorial lighting, consistent face and body proportions across all panels, zero distortion. {{custom_notes}}',
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
      candidateCount: 2,
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
      'Create a clean 2-panel side-by-side fashion model reference sheet ({{angles}}) on a neutral light gray studio background. The model ({{talent}}) wears the exact {{product_name}} from the reference photos. Maintain exact front and back graphic alignment, neckline, sleeve fit, and fabric weight. {{product_notes}} {{brand_notes}} Sharp focus, natural skin texture, zero extra text overlays. {{custom_notes}}',
    configJson: {
      angleCount: 2,
      angleLayout: 'GRID_SHEET',
      angles: ['Full-body Front View', 'Full-body Back View'],
      modelKey: 'gpt-image-2.6-sunburst',
      aspectRatio: '4:3',
      resolution: '1K',
      candidateCount: 2,
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
      candidateCount: 2,
    },
    examplesJson: [],
    tagsJson: ['hero', '1-angle', 'editorial'],
    isDefault: false,
  },
  {
    kind: 'VIDEO_GENERATION',
    name: 'Reference-Video Apparel Swap (Keep Reference Setting)',
    description:
      'Replaces the subject & outfit in @Video 1 with the locked Character Sheet (@Image 1) & garment refs while preserving exact camera shots, cuts, pacing, and actions.',
    masterPrompt:
      'Recreate the exact camera angles, shot transitions, editing rhythm, pacing, lighting continuity, and subject actions from @Video 1. Replace the main subject and outfit with the model and exact {{product_name}} shown in @Image 1 (using additional reference images for exact front/back print and fabric fidelity). Keep the original setting and movement natural and seamless, with realistic cloth physics and zero logo morphing. {{brand_notes}} {{custom_notes}}',
    configJson: {
      modelKey: 'seedance-2.5',
      aspectRatio: '9:16',
      resolution: '720p',
      durationSec: 8,
      generateAudio: true,
      preserveReferenceSetting: true,
    },
    examplesJson: [],
    tagsJson: ['apparel-swap', 'reference-to-video'],
    isDefault: true,
  },
  {
    kind: 'VIDEO_GENERATION',
    name: 'Reference-Video Apparel Swap (Custom Environment)',
    description:
      'Keeps the exact shots, cuts, and actions of @Video 1 while transporting the character & garment into a custom environment.',
    masterPrompt:
      'Preserve the exact shot composition, camera movement, jump cuts, timing, and subject performance from @Video 1. Replace the subject with the character wearing the exact {{product_name}} from @Image 1. Transport the entire scene into this environment: {{environment}}. Match lighting and shadows naturally onto the fabric and skin while keeping prints and garment silhouette 100% locked. {{brand_notes}} {{custom_notes}}',
    configJson: {
      modelKey: 'magi-2',
      aspectRatio: '9:16',
      resolution: '1080p',
      durationSec: 8,
      generateAudio: true,
      preserveReferenceSetting: false,
      defaultEnvironment:
        'Minimal sunlit urban concrete street at golden hour with soft natural shadows',
    },
    examplesJson: [],
    tagsJson: ['apparel-swap', 'environment-override'],
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
  {
    kind: 'CASTING_PERSONA',
    name: 'Modern Streetwear Model (Neutral Editorial)',
    description:
      'Clean, realistic streetwear casting persona with relaxed posture and natural skin texture.',
    masterPrompt:
      'Young adult streetwear model (early 20s), relaxed confident posture, natural unretouched skin texture, clean modern hairstyle, minimal accessories, authentic lookbook presence.',
    configJson: {},
    examplesJson: [],
    tagsJson: ['casting', 'streetwear'],
    isDefault: true,
  },
];
