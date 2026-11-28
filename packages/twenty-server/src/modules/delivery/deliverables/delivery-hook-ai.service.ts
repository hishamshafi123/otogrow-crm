import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { generateText, Output } from 'ai';
import { convert } from 'html-to-text';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { v4 } from 'uuid';
import { z } from 'zod';
import {
  AiModelRegistryService,
  type RegisteredAiModel,
} from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import {
  fetchDeliveryPublicPage,
  validateDeliveryPublicUrl,
} from 'src/modules/delivery/agents/delivery-seo-verifier';
import { type DeliverableMediaMeta } from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import {
  type AiHookSuggestion,
  type VideoHookAnalysis,
  type WebsiteProfileSnapshot,
} from 'src/modules/delivery/deliverables/entities/delivery-video-hook-project.entity';
import { DeliveryHookRenderAdapter } from 'src/modules/delivery/deliverables/delivery-hook-render.adapter';
import { type DeliveryKnowledgeContext } from 'src/modules/delivery/knowledge/delivery-knowledge-context';

export const DEFAULT_TEXT_HOOK_MASTER_PROMPT = [
  'Write crisp, scroll-stopping on-screen opening text hooks (5 to 12 words each, readable in 2–4 seconds on mobile) that pair directly with the opening visual of the video.',
  'Vary the angle across hooks (Curiosity Gap, Pain Point, Contrarian, Specific Proof, Direct Offer, Pattern Interrupt, Relatable POV, Mistake Callout).',
  'Match the brand voice and any working example hooks provided. Avoid generic clichés and never invent fake statistics or guarantees.',
].join('\n');

const websiteProfileOutputSchema = z.object({
  brandName: z.string().min(1).max(120),
  summary: z.string().min(1).max(600),
  targetAudience: z.string().min(1).max(300),
  coreOffer: z.string().min(1).max(400),
  painPoints: z.array(z.string().max(160)).max(8),
  proofPoints: z.array(z.string().max(160)).max(8),
  toneOfVoice: z.string().min(1).max(200),
  keyProducts: z.array(z.string().max(120)).max(8),
});

const videoAnalysisOutputSchema = z.object({
  openingVisualSummary: z.string().min(1).max(600),
  spokenTranscript: z.string().max(1500),
  moodAndPacing: z.string().min(1).max(240),
  recommendedPlacement: z.enum(['TOP_SAFE', 'UPPER_CENTER', 'LOWER_THIRD']),
  placementReason: z.string().min(1).max(300),
  suggestedYPct: z.number().min(12).max(78),
});

const hookSuggestionsOutputSchema = z.object({
  hooks: z
    .array(
      z.object({
        hookText: z.string().min(3).max(180),
        angleTag: z.string().min(1).max(60),
        rationale: z.string().min(1).max(300),
        suggestedStartSec: z.number().min(0).max(30),
        suggestedEndSec: z.number().min(1).max(35),
      }),
    )
    .min(3)
    .max(12),
});

export type CreativeHookDirectionInput = {
  platform?: 'TIKTOK' | 'INSTAGRAM_REELS' | 'META_ADS' | 'YOUTUBE_SHORTS' | 'ALL';
  funnelStage?: 'COLD' | 'WARM' | 'RETARGETING' | 'ORGANIC';
  campaignGoal?: string;
  offerAngle?: string;
  toneOverride?: string;
  customDirection?: string;
  masterPrompt?: string;
  exampleHooks?: string[];
  variationCount?: number;
};

export const normalizeWebsiteUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new BadRequestException('Enter a valid public website URL.');
  }
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return validateDeliveryPublicUrl(withScheme).href;
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error
        ? error.message
        : 'Only public HTTP and HTTPS website URLs are allowed.',
    );
  }
};

const extractMetaFromHtml = (
  html: string,
  url: string,
): { title: string; description: string } => {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  );
  const ogDescMatch = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  );
  const hostname = new URL(url).hostname.replace(/^www\./i, '');
  const title = (titleMatch?.[1] ?? hostname)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const description = (metaDescMatch?.[1] ?? ogDescMatch?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
  return { title: title || hostname, description };
};

const estimateReadSeconds = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // ~3 words/sec for crisp on-screen video hooks, bounded [2.2s, 6.5s]
  return Number(Math.min(6.5, Math.max(2.2, words / 2.8 + 0.8)).toFixed(1));
};

@Injectable()
export class DeliveryHookAiService {
  private readonly logger = new Logger(DeliveryHookAiService.name);

  constructor(
    private readonly modelRegistry: AiModelRegistryService,
    private readonly renderAdapter: DeliveryHookRenderAdapter,
  ) {}

  private buildDirectGeminiModel(
    apiKey: string,
  ): Pick<RegisteredAiModel, 'model' | 'modelId'> {
    const google = createGoogleGenerativeAI({ apiKey });
    const modelId = 'gemini-2.5-flash';
    return { model: google(modelId), modelId };
  }

  private resolveEnvGeminiKey(): string | null {
    return (
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      null
    );
  }

  private pickTextModel(
    overrideGeminiApiKey?: string | null,
  ): Pick<RegisteredAiModel, 'model' | 'modelId'> | null {
    const cleanOverride = overrideGeminiApiKey?.trim();
    if (cleanOverride) {
      return this.buildDirectGeminiModel(cleanOverride);
    }
    try {
      const models = this.modelRegistry.getAdminFilteredModels();
      if (models.length) {
        const preferred =
          models.find((m) => /flash|mini|haiku|sonnet|gpt-4o/i.test(m.modelId)) ??
          models[0];
        if (preferred) return preferred;
      }
    } catch {
      // Fall through to env key check
    }
    const envKey = this.resolveEnvGeminiKey();
    return envKey ? this.buildDirectGeminiModel(envKey) : null;
  }

  private pickGeminiVideoModel(
    overrideGeminiApiKey?: string | null,
  ): Pick<RegisteredAiModel, 'model' | 'modelId'> | null {
    const cleanOverride = overrideGeminiApiKey?.trim();
    if (cleanOverride) {
      return this.buildDirectGeminiModel(cleanOverride);
    }
    try {
      const models = this.modelRegistry.getAdminFilteredModels();
      const googleModels = models.filter(
        (m) => m.sdkPackage === '@ai-sdk/google',
      );
      if (googleModels.length) {
        return (
          googleModels.find((m) => /flash/i.test(m.modelId)) ??
          googleModels[0] ??
          null
        );
      }
    } catch {
      // Fall through to env key check
    }
    const envKey = this.resolveEnvGeminiKey();
    return envKey ? this.buildDirectGeminiModel(envKey) : null;
  }

  async analyzeWebsite(
    rawUrl: string,
    overrideGeminiApiKey?: string | null,
  ): Promise<WebsiteProfileSnapshot> {
    const normalizedUrl = normalizeWebsiteUrl(rawUrl);
    let page: { url: string; body: string; contentType: string };
    try {
      page = await fetchDeliveryPublicPage(
        normalizedUrl,
        AbortSignal.timeout(12_000),
      );
    } catch (error) {
      throw new BadRequestException(
        `Could not fetch website (${error instanceof Error ? error.message : 'unreachable'}).`,
      );
    }

    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(page.contentType)) {
      throw new BadRequestException(
        'Website URL did not return a readable HTML page.',
      );
    }

    const { title, description } = extractMetaFromHtml(page.body, page.url);
    const visibleText = convert(page.body, {
      limits: { maxInputLength: 500_000, maxDepth: 50, maxChildNodes: 10_000 },
      wordwrap: false,
      selectors: [
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'noscript', format: 'skip' },
        { selector: 'svg', format: 'skip' },
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
      ],
    })
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 14_000);

    const model = this.pickTextModel(overrideGeminiApiKey);
    const fetchedAt = new Date().toISOString();

    if (model && visibleText.length >= 40) {
      try {
        const response = await generateText({
          model: model.model,
          system:
            'You are a senior performance creative strategist. Extract a concise, factual brand and offer profile strictly from the provided website content. Do not invent claims, discounts, or metrics not present on the page.',
          prompt: `URL: ${page.url}\nPage Title: ${title}\nMeta Description: ${description}\n\nWebsite Content:\n${visibleText}`,
          output: Output.object({ schema: websiteProfileOutputSchema }),
          maxOutputTokens: 1200,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(35_000),
        });
        return {
          url: page.url,
          requestedUrl: normalizedUrl,
          fetchedAt,
          ...response.output,
          source: 'AI',
        };
      } catch (error) {
        this.logger.warn(
          `LLM website extraction failed for ${page.url}; using deterministic fallback: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const hostBrand = new URL(page.url).hostname
      .replace(/^www\./i, '')
      .split('.')[0];
    const cleanBrand =
      title.split(/[|\-–—:]/)[0]?.trim() ||
      hostBrand.charAt(0).toUpperCase() + hostBrand.slice(1);

    return {
      url: page.url,
      requestedUrl: normalizedUrl,
      fetchedAt,
      brandName: cleanBrand.slice(0, 120),
      summary: (description || visibleText.slice(0, 320) || cleanBrand).slice(
        0,
        600,
      ),
      targetAudience: 'Prospective customers visiting the website',
      coreOffer: (description || title).slice(0, 400),
      painPoints: [],
      proofPoints: [],
      toneOfVoice: 'Direct, modern, benefit-focused',
      keyProducts: [],
      source: 'FALLBACK',
    };
  }

  async analyzeVideo(
    localVideoPath: string,
    mediaMeta: DeliverableMediaMeta,
    overrideGeminiApiKey?: string | null,
  ): Promise<VideoHookAnalysis> {
    const analyzedAt = new Date().toISOString();
    const isVertical = (mediaMeta.height ?? 1920) >= (mediaMeta.width ?? 1080);
    const defaultPlacement: VideoHookAnalysis = {
      analyzedAt,
      openingVisualSummary: isVertical
        ? 'Vertical short-form video ready for opening 0–3s hook overlay.'
        : 'Landscape video ready for opening 0–3s hook overlay.',
      spokenTranscript: '',
      moodAndPacing: 'Standard social pacing',
      recommendedPlacement: isVertical ? 'TOP_SAFE' : 'UPPER_CENTER',
      placementReason: isVertical
        ? 'Placed in the upper safe zone (22% from top) to clear faces, center action, and bottom platform captions.'
        : 'Placed in the upper-center safe band (18% from top) to keep center visuals unobstructed.',
      suggestedYPct: isVertical ? 22 : 18,
      source: 'FALLBACK',
    };

    const geminiModel = this.pickGeminiVideoModel(overrideGeminiApiKey);
    if (!geminiModel) {
      return defaultPlacement;
    }

    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'otogrow-hook-ai-'),
    );
    try {
      const proxyPath = path.join(tempDir, 'proxy.mp4');
      const proxyBuffer =
        await this.renderAdapter.prepareLightweightAnalysisProxy(
          localVideoPath,
          proxyPath,
        );

      const response = await generateText({
        model: geminiModel.model,
        system:
          'You are a performance video editor and creative strategist analyzing a raw video to place a high-converting opening text hook overlay (first 0–4 seconds). Describe the exact opening visuals, transcribe any spoken words accurately, note pacing/mood, and recommend a safe vertical Y placement percentage (12-78) that avoids covering faces, key products, or existing burned-in captions.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: proxyBuffer,
                mediaType: 'video/mp4',
              },
              {
                type: 'text',
                text: `Video dimensions: ${mediaMeta.width ?? 'unknown'}x${mediaMeta.height ?? 'unknown'}, duration: ${mediaMeta.durationSec ? `${mediaMeta.durationSec.toFixed(1)}s` : 'unknown'}. Analyze the opening hook moment and best text overlay placement.`,
              },
            ],
          },
        ],
        output: Output.object({ schema: videoAnalysisOutputSchema }),
        maxOutputTokens: 1200,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(90_000),
      });

      return {
        analyzedAt,
        ...response.output,
        source: 'GEMINI',
      };
    } catch (error) {
      this.logger.warn(
        `Gemini video hook analysis failed; using aspect-ratio fallback: ${error instanceof Error ? error.message : String(error)}`,
      );
      return defaultPlacement;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async generateHooks(params: {
    companyName: string;
    deliverableTitle: string;
    websiteProfile: WebsiteProfileSnapshot | null;
    brandKnowledge: DeliveryKnowledgeContext | null;
    videoAnalysis: VideoHookAnalysis | null;
    creativeInput: CreativeHookDirectionInput;
    videoDurationSec?: number;
    overrideGeminiApiKey?: string | null;
  }): Promise<AiHookSuggestion[]> {
    const targetCount = Math.min(
      12,
      Math.max(6, params.creativeInput.variationCount ?? 10),
    );
    const maxSec =
      params.videoDurationSec && params.videoDurationSec > 1
        ? params.videoDurationSec
        : 15;

    const model = this.pickTextModel(params.overrideGeminiApiKey);

    if (model) {
      const knowledgeSnippet =
        params.brandKnowledge && params.brandKnowledge.sources.length > 0
          ? params.brandKnowledge.sources
              .slice(0, 6)
              .map(
                (src) =>
                  `[${src.category || 'BRAND'} — ${src.title}]\n${src.knowledge.slice(0, 1500)}`,
              )
              .join('\n\n')
          : 'No brand knowledge documents uploaded yet.';

      const websiteSnippet = params.websiteProfile
        ? JSON.stringify(
            {
              brandName: params.websiteProfile.brandName,
              summary: params.websiteProfile.summary,
              targetAudience: params.websiteProfile.targetAudience,
              coreOffer: params.websiteProfile.coreOffer,
              painPoints: params.websiteProfile.painPoints,
              proofPoints: params.websiteProfile.proofPoints,
              toneOfVoice: params.websiteProfile.toneOfVoice,
              keyProducts: params.websiteProfile.keyProducts,
            },
            null,
            2,
          )
        : 'No website analyzed yet.';

      const videoSnippet = params.videoAnalysis
        ? JSON.stringify(
            {
              openingVisualSummary: params.videoAnalysis.openingVisualSummary,
              spokenTranscript: params.videoAnalysis.spokenTranscript,
              moodAndPacing: params.videoAnalysis.moodAndPacing,
              recommendedPlacement: params.videoAnalysis.recommendedPlacement,
            },
            null,
            2,
          )
        : 'Video analysis not yet run.';

      const exampleHooks = (params.creativeInput.exampleHooks ?? [])
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20);
      const examplesBlock =
        exampleHooks.length > 0
          ? [
              '',
              '--- PROVEN WORKING EXAMPLE HOOKS FOR THIS BRAND (MATCH THIS STYLE, RHYTHM & ENERGY) ---',
              ...exampleHooks.map((ex, i) => `${i + 1}. "${ex}"`),
            ]
          : [];
      const activeMasterPrompt =
        params.creativeInput.masterPrompt?.trim() ||
        DEFAULT_TEXT_HOOK_MASTER_PROMPT;

      const prompt = [
        `Client / Brand: ${params.websiteProfile?.brandName || params.companyName}`,
        `Deliverable Title: ${params.deliverableTitle}`,
        `Video Duration: ${maxSec.toFixed(1)}s`,
        '',
        '--- WEBSITE PROFILE ---',
        websiteSnippet,
        '',
        '--- APPROVED BRAND KNOWLEDGE VAULT ---',
        knowledgeSnippet,
        '',
        '--- VIDEO CONTENT ANALYSIS ---',
        videoSnippet,
        '',
        '--- TEAM CREATIVE DIRECTION ---',
        `Platform: ${params.creativeInput.platform ?? 'ALL'}`,
        `Funnel Stage: ${params.creativeInput.funnelStage ?? 'COLD'}`,
        `Campaign Goal: ${params.creativeInput.campaignGoal || 'Scroll-stop & drive qualified conversions'}`,
        `Offer / Angle: ${params.creativeInput.offerAngle || 'Use the strongest offer from the brand profile'}`,
        `Tone Override: ${params.creativeInput.toneOverride || params.websiteProfile?.toneOfVoice || 'Authentic, punchy, scroll-stopping'}`,
        `Custom Notes: ${params.creativeInput.customDirection || 'None'}`,
        '',
        '--- BRAND TEXT-HOOK MASTER PROMPT (HIGH PRIORITY INSTRUCTIONS) ---',
        activeMasterPrompt,
        ...examplesBlock,
        '',
        `Generate exactly ${targetCount} distinct, high-performing on-screen opening text hooks.`,
        'Rank them from strongest scroll-stopper (#1) down.',
      ].join('\n');

      try {
        const response = await generateText({
          model: model.model,
          system:
            'You are a world-class paid social & short-form creative director specializing in TikTok, Instagram Reels, and Meta Ads opening text hooks. Follow the Brand Text-Hook Master Prompt and working examples closely, and pair each hook directly with the opening visual of the video.',
          prompt,
          output: Output.object({ schema: hookSuggestionsOutputSchema }),
          maxOutputTokens: 2000,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(45_000),
        });

        return response.output.hooks.map((hook) => {
          const readSec = estimateReadSeconds(hook.hookText);
          const start = Math.max(
            0,
            Math.min(hook.suggestedStartSec, Math.max(0, maxSec - 1)),
          );
          const end = Math.min(
            maxSec,
            Math.max(start + 1.5, hook.suggestedEndSec || start + readSec),
          );
          return {
            id: v4(),
            hookText: hook.hookText.trim(),
            angleTag: hook.angleTag.trim(),
            rationale: hook.rationale.trim(),
            suggestedStartSec: Number(start.toFixed(1)),
            suggestedEndSec: Number(end.toFixed(1)),
            estimatedReadSec: readSec,
            source: 'AI' as const,
          };
        });
      } catch (error) {
        this.logger.warn(
          `LLM hook generation failed; returning structured fallback hooks: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Deterministic brand-aware fallback so operators can always test variations immediately
    const brand = params.websiteProfile?.brandName || params.companyName || 'this';
    const offer =
      params.creativeInput.offerAngle ||
      params.websiteProfile?.coreOffer ||
      'a smarter way to get results';
    const firstPain =
      params.websiteProfile?.painPoints?.[0] || 'wasting hours every week';

    const templates: Array<{ hookText: string; angleTag: string; rationale: string }> =
      [
        {
          hookText: `Stop scrolling if you're still ${firstPain.toLowerCase()}`,
          angleTag: 'Pain Callout',
          rationale: 'Calls out the core frustration within the first second.',
        },
        {
          hookText: `Why everyone is switching to ${brand} right now`,
          angleTag: 'Social Proof',
          rationale: 'Creates immediate curiosity and momentum around the brand.',
        },
        {
          hookText: `The 3-second fix nobody told you about`,
          angleTag: 'Curiosity Gap',
          rationale: 'Open-loop framing that maximizes 3-second hold rate.',
        },
        {
          hookText: `POV: You finally solved ${firstPain.toLowerCase()}`,
          angleTag: 'Relatable POV',
          rationale: 'Native TikTok/Reels POV framing that feels organic in-feed.',
        },
        {
          hookText: `Don't buy another option until you see this`,
          angleTag: 'Pattern Interrupt',
          rationale: 'Interrupts active shoppers comparing alternatives.',
        },
        {
          hookText: `${brand}: ${offer.slice(0, 68)}`,
          angleTag: 'Direct Offer',
          rationale: 'Clear value proposition for high-intent and retargeting audiences.',
        },
        {
          hookText: `I tested ${brand} for 7 days — here's the honest result`,
          angleTag: 'UGC Story',
          rationale: 'Authentic creator-style opener with low ad fatigue.',
        },
        {
          hookText: `Most people get this completely wrong`,
          angleTag: 'Contrarian',
          rationale: 'Challenges assumptions to earn attention past second 3.',
        },
      ];

    return templates.slice(0, targetCount).map((item) => {
      const readSec = estimateReadSeconds(item.hookText);
      const end = Math.min(maxSec, Number(readSec.toFixed(1)));
      return {
        id: v4(),
        hookText: item.hookText,
        angleTag: item.angleTag,
        rationale: item.rationale,
        suggestedStartSec: 0,
        suggestedEndSec: Math.max(1.5, end),
        estimatedReadSec: readSec,
        source: 'FALLBACK' as const,
      };
    });
  }
}
