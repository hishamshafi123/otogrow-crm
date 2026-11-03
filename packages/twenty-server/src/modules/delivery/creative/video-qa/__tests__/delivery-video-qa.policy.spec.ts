import { newCreativeDocument } from 'src/modules/delivery/creative/delivery-creative.types';
import { assertVideoQaPricing } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.policy';
import { videoQaTechnicalFindings } from '../delivery-video-qa.adapter';
import {
  assertVideoQaRequestSize,
  validateVideoQaOutput,
  videoQaHash,
  videoQaPrompt,
} from '../delivery-video-qa.policy';
import {
  type VideoQaInputSnapshot,
  type VideoQaOutput,
  VIDEO_QA_MODEL,
  videoQaPreviewSchema,
} from '../delivery-video-qa.types';

const ASSET_ID = '00000000-0000-4000-8000-000000000001';
const REFERENCE_ID = '00000000-0000-4000-8000-000000000002';
const snapshot = (): VideoQaInputSnapshot => ({
  pipelineVersion: 1,
  projectId: ASSET_ID,
  companyId: null,
  taskId: ASSET_ID,
  creativeVersion: 1,
  productionVersion: 1,
  assemblyVersion: 1,
  briefVersion: 1,
  settingsVersion: 1,
  assigneeId: ASSET_ID,
  brief: newCreativeDocument().brief,
  modelId: VIDEO_QA_MODEL,
  manualTranscript: null,
  asset: {
    id: ASSET_ID,
    name: 'Video',
    mimeType: 'video/mp4',
    size: 10,
    sha256: 'a'.repeat(64),
    briefVersion: 1,
    productionVersion: 1,
    assemblyVersion: 1,
    shotId: null,
    shotVersion: null,
  },
  references: [
    {
      id: REFERENCE_ID,
      name: 'Approved product',
      mimeType: 'image/jpeg',
      size: 10,
      sha256: 'b'.repeat(64),
      briefVersion: 1,
      productionVersion: 1,
      assemblyVersion: 1,
      shotId: null,
      shotVersion: null,
    },
  ],
  sourceFingerprint: 'a'.repeat(64),
  preparationFingerprint: 'b'.repeat(64),
  preparation: {
    pipelineVersion: 1,
    durationMs: 3000,
    width: 720,
    height: 480,
    hasAudio: true,
    audioChannels: 1,
    proxySha256: 'c'.repeat(64),
    proxyBytes: 10,
    frames: [0, 1, 2].map((index) => ({
      index,
      atMs: index * 1000,
      sha256: 'd'.repeat(64),
      size: 10,
    })),
    technicalFindings: [],
    samplingIntervalMs: 1000,
    limitations: ['Fast motion may be missed.'],
  },
});
const result = (): VideoQaOutput => ({
  summary: 'Possible product discrepancy.',
  transcript: [{ startMs: 0, endMs: 1000, text: 'Example speech' }],
  visibleText: [],
  findings: [
    {
      category: 'PRODUCT',
      severity: 'POSSIBLE_ISSUE',
      startMs: 0,
      endMs: 1000,
      frameIndexes: [0],
      referenceAssetIds: [REFERENCE_ID],
      evidence: 'Visible color differs from selected reference.',
      correction: 'Review color.',
      uncertainty: 'Lighting may explain this.',
    },
  ],
  limitations:
    'Sampled video and model-observed transcript require human review.',
});

describe('video QA evidence policy', () => {
  it('retains explicit uncertainty and exact source/frame/product citations', () =>
    expect(validateVideoQaOutput(result(), snapshot())).toEqual(result()));
  it('does not turn an empty findings array into approval', () => {
    const output = { ...result(), findings: [] };
    expect(validateVideoQaOutput(output, snapshot())).toEqual(output);
    expect(output).not.toHaveProperty('approved');
  });
  it.each([
    'outside',
    'unknown-frame',
    'unknown-reference',
    'duplicate-frame',
    'no-reference',
    'no-frame',
  ] as const)('rejects %s evidence', (kind) => {
    const output = result();
    const finding = output.findings[0];
    if (kind === 'outside') finding.endMs = 3001;
    if (kind === 'unknown-frame') finding.frameIndexes = [50];
    if (kind === 'unknown-reference') finding.referenceAssetIds = [ASSET_ID];
    if (kind === 'duplicate-frame') finding.frameIndexes = [0, 0];
    if (kind === 'no-reference') finding.referenceAssetIds = [];
    if (kind === 'no-frame') finding.frameIndexes = [];
    expect(() => validateVideoQaOutput(output, snapshot())).toThrow();
  });
  it('requires multiple frames for a continuity claim', () => {
    const output = result();
    output.findings[0].category = 'CONTINUITY';
    expect(() => validateVideoQaOutput(output, snapshot())).toThrow(
      'at least two',
    );
    output.findings[0].frameIndexes = [0, 1];
    expect(() => validateVideoQaOutput(output, snapshot())).not.toThrow();
  });
  it('rejects transcript and audio claims when no actual audio stream exists', () => {
    const input = snapshot();
    input.preparation.hasAudio = false;
    input.manualTranscript = 'Manual notes do not establish speech.';
    expect(() => validateVideoQaOutput(result(), input)).toThrow(
      'actual audio',
    );
    const output = result();
    output.transcript = [];
    output.findings[0].category = 'AUDIO';
    expect(() => validateVideoQaOutput(output, input)).toThrow('actual audio');
  });
  it('requires observed speech or frames for copy findings', () => {
    const output = result();
    output.findings[0].category = 'COPY';
    output.findings[0].frameIndexes = [];
    output.transcript = [];
    expect(() => validateVideoQaOutput(output, snapshot())).toThrow(
      'observed transcript',
    );
  });
  it('keeps manual notes labelled separately from actual audio observations', () => {
    const input = snapshot();
    input.manualTranscript = 'Unverified supplied notes';
    expect(videoQaPrompt(input)).toContain('MANUAL_UNVERIFIED');
    expect(videoQaPrompt(input)).toContain('Unverified supplied notes');
  });
  it('survives JSONB key ordering without weakening source hashes', () => {
    expect(
      videoQaHash({ source: { audio: true, time: 1000 }, frames: [1, 2] }),
    ).toBe(
      videoQaHash({ frames: [1, 2], source: { time: 1000, audio: true } }),
    );
    expect(videoQaHash({ frames: [1, 2] })).not.toBe(
      videoQaHash({ frames: [2, 1] }),
    );
  });
  it('blocks unsupported model substitutions and duplicate references', () => {
    const input = {
      taskId: ASSET_ID,
      revision: 1,
      assetId: ASSET_ID,
      referenceAssetIds: [REFERENCE_ID],
      modelId: VIDEO_QA_MODEL,
    };
    expect(videoQaPreviewSchema.safeParse(input).success).toBe(true);
    expect(
      videoQaPreviewSchema.safeParse({
        ...input,
        modelId: 'google/gemini-flash-latest',
      }).success,
    ).toBe(false);
    expect(
      videoQaPreviewSchema.safeParse({
        ...input,
        referenceAssetIds: [REFERENCE_ID, REFERENCE_ID],
      }).success,
    ).toBe(false);
  });
  it('bounds the actual base64 request instead of trusting file metadata', () => {
    expect(() =>
      assertVideoQaRequestSize(Buffer.alloc(15000000), [], ''),
    ).toThrow('inline request limit');
    expect(() =>
      assertVideoQaRequestSize(Buffer.from('small'), [], 'brief'),
    ).not.toThrow();
  });
  it('reports actual technical intervals as candidates and distinguishes missing audio', () => {
    const findings = videoQaTechnicalFindings(
      'black_start:0 black_end:0.5 black_duration:0.5\nfreeze_start: 1\nfreeze_end: 2\nsilence_start: 2.5\nPeak level dB: -0.01',
      3000,
      true,
    );
    expect(
      findings.map(({ code, startMs, endMs }) => ({ code, startMs, endMs })),
    ).toEqual([
      { code: 'BLACK_INTERVAL', startMs: 0, endMs: 500 },
      { code: 'FROZEN_INTERVAL', startMs: 1000, endMs: 2000 },
      { code: 'SILENT_INTERVAL', startMs: 2500, endMs: 3000 },
      { code: 'PEAK_LEVEL', startMs: 0, endMs: 3000 },
    ]);
    expect(videoQaTechnicalFindings('', 3000, false)[0].code).toBe('NO_AUDIO');
  });
});
describe('video QA pricing boundary', () => {
  const profile = () => ({
    modelId: VIDEO_QA_MODEL,
    source: 'https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite',
    pricing: {
      inputUsdPerMillionTokens: '0.30',
      outputUsdPerMillionTokens: '2.50',
      reasoningUsdPerMillionTokens: '2.50',
      cacheReadUsdPerMillionTokens: '0.03',
      cacheWriteUsdPerMillionTokens: '0.30',
      maxInputTokens: 1048576,
      maxOutputTokens: 8192,
      maxReasoningTokens: 8192,
      outputIncludesReasoning: true,
      longContextThresholdTokens: null,
      longInputUsdPerMillionTokens: null,
      longOutputUsdPerMillionTokens: null,
      longReasoningUsdPerMillionTokens: null,
      longCacheReadUsdPerMillionTokens: null,
      longCacheWriteUsdPerMillionTokens: null,
    },
  });
  it('accepts the explicitly supported equal-modality tariff and full context bound', () =>
    expect(() => assertVideoQaPricing(profile())).not.toThrow());
  it.each([
    'short-bound',
    'no-thought-bound',
    'different-model',
    'unverified-source',
    'different-thinking-rate',
  ] as const)('rejects %s', (kind) => {
    const input = profile();
    if (kind === 'short-bound') input.pricing.maxInputTokens = 10000;
    if (kind === 'no-thought-bound') input.pricing.maxReasoningTokens = 0;
    if (kind === 'different-model') input.modelId = 'google/another-model';
    if (kind === 'unverified-source')
      input.source = 'https://example.invalid/pricing';
    if (kind === 'different-thinking-rate')
      input.pricing.reasoningUsdPerMillionTokens = '0.1';
    expect(() => assertVideoQaPricing(input)).toThrow();
  });
});
