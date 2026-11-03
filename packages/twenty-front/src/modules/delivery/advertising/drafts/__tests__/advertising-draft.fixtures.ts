import {
  advertisingContext,
  advertisingSource,
  ADVERTISING_IDENTITY,
  ADVERTISING_REVIEW_ID,
  ADVERTISING_REQUEST_ID,
} from '@/delivery/advertising/workbench/__tests__/advertising-workbench.fixtures';
import {
  type AdvertisingDraftDetail,
  type AdvertisingDraftPreview,
} from '@/delivery/advertising/drafts/advertising-draft-types';
import { type DeliveryAdvertisingGoalInput } from '~/generated-metadata/graphql';
import {
  newAdvertisingAction,
  newAdvertisingReviewDraft,
} from '@/delivery/advertising/workbench/advertising-draft';

export const DRAFT_RUN_ID = '30000000-0000-4000-8000-000000000021';
export const DRAFT_REQUEST_ID = '30000000-0000-4000-8000-000000000022';
export const DRAFT_AGENT_ID = '30000000-0000-4000-8000-000000000023';
export const DRAFT_SUGGESTION_ID = '30000000-0000-4000-8000-000000000024';
export const DRAFT_SECOND_SUGGESTION_ID =
  '30000000-0000-4000-8000-000000000025';
export const draftGoal = (): DeliveryAdvertisingGoalInput => ({
  kind: 'PURCHASES',
  provenance: 'REPORT',
  metricKey: 'account:actions:purchase',
  metricAdId: null,
  value: '2',
  evidence: '',
  targetCostMicros: null,
});
export const advertisingOwnedDraft = (withAction = true) => {
  const source = advertisingSource();
  const draft = newAdvertisingReviewDraft(
    ADVERTISING_REVIEW_ID,
    ADVERTISING_REQUEST_ID,
    source,
  );
  draft.goal = {
    ...draft.goal,
    ...draftGoal(),
    metricLabel: 'Reported purchases',
    metricUnit: 'COUNT',
  };
  draft.note = 'Keep this manager-written summary.';
  if (withAction)
    draft.actions = [
      {
        ...newAdvertisingAction(source),
        title: 'Keep this manually planned work',
        rationale: 'A manager identified this requirement.',
        expectedResult: 'Review the independent submitted evidence.',
        evidence: 'Approved brand requirements.',
        dueDate: '2026-11-03',
      },
    ];
  return draft;
};
export const advertisingDraftPreview = (): AdvertisingDraftPreview => {
  const source = advertisingSource();
  const context = advertisingContext();
  return {
    ...ADVERTISING_IDENTITY,
    actor: context.actor,
    observedAt: context.observedAt,
    bodyFingerprint: 'd'.repeat(64),
    contextFingerprint: 'e'.repeat(64),
    sourceFingerprint: source.fingerprint,
    knowledgeFingerprint: 'f'.repeat(32),
    agent: {
      id: DRAFT_AGENT_ID,
      name: 'Account recommendation assistant',
      version: 2,
      modelId: 'fixture-text',
      maxOutputTokens: 1000,
    },
    budget: {
      maximumCostUsd: '0.05',
      pricingRevision: 3,
      budgetReady: true,
      blockedReason: null,
      boundSource: 'MODEL_CONTEXT',
    },
    context: {
      source: source.source,
      goal: {
        ...draftGoal(),
        metricKey: 'account:actions:purchase',
        metricAdId: null,
        value: '2',
        targetCostMicros: null,
        metricLabel: 'Reported purchases',
        metricProvenance: 'PLATFORM_REPORTED',
        metricReason: null,
        metricUnit: 'COUNT',
        currency: 'USD',
        fromDate: source.source.fromDate,
        throughDate: source.source.throughDate,
        timezone: source.source.timezone,
        sourceFingerprint: source.evidenceFingerprint,
      },
      metrics: source.metrics,
      knowledge: {
        fingerprint: 'f'.repeat(32),
        totalSources: 2,
        omittedSources: 1,
        sources: [
          {
            sourceId: '30000000-0000-4000-8000-000000000026',
            version: 1,
            title: 'Published product rules',
            category: 'BRAND',
            meetingDate: '2026-10-30',
            knowledge: 'Use only supported product claims.',
            truncated: true,
          },
        ],
      },
      references: [
        {
          id: 'metric:1',
          kind: 'REPORT_METRIC',
          label: 'Reported purchases',
          sourceId: source.source.id,
          version: null,
          value: '2',
          unit: 'COUNT',
          href: `/delivery?view=ads&adSource=META&adReport=${source.source.id}`,
        },
      ],
      instructions: '',
      assistantInstructions: null,
      coverage: 'ACCOUNT_TOTALS_ONLY',
      limitations: ['One report does not establish a trend.'],
      promptVersion: 'account-recommendations-1',
      outputVersion: 'recommendations-1',
    },
  };
};
export const advertisingDraftDetail = (): AdvertisingDraftDetail => {
  const preview = advertisingDraftPreview();
  return {
    ...ADVERTISING_IDENTITY,
    actor: preview.actor,
    observedAt: preview.observedAt,
    currentSourceFingerprint: preview.sourceFingerprint,
    canUseResult: true,
    canCancel: false,
    blockingReasons: [],
    run: {
      id: DRAFT_RUN_ID,
      requestId: DRAFT_REQUEST_ID,
      initiatorId: ADVERTISING_IDENTITY.memberId,
      initiatorName: 'Amna',
      sourceKind: 'META',
      sourceId: preview.context.source.id,
      projectId: preview.context.source.projectId ?? '',
      status: 'SUCCEEDED',
      revision: 3,
      agent: preview.agent,
      createdAt: '2026-11-01T01:00:00.000Z',
      startedAt: '2026-11-01T01:00:01.000Z',
      finishedAt: '2026-11-01T01:00:02.000Z',
      error: null,
      bodyFingerprint: preview.bodyFingerprint,
      contextFingerprint: preview.contextFingerprint,
      context: preview.context,
      usage: { inputTokens: 120, outputTokens: null, costUsd: null },
      result: {
        summary: 'Consider one deliberate creative experiment.',
        limitations: [
          'This is a test proposal, not evidence of an improvement.',
        ],
        citations: ['metric:1'],
        noChangeReason:
          'Keep current work while gathering comparable evidence.',
        suggestions: [
          {
            id: DRAFT_SUGGESTION_ID,
            title: 'Test an alternative product opening',
            rationale: 'A clearer benefit is a hypothesis to test.',
            expectedResult: 'Compare a later compatible purchase metric.',
            evidence: 'Review the recorded purchase metric.',
            citations: ['metric:1'],
          },
          {
            id: DRAFT_SECOND_SUGGESTION_ID,
            title: 'Document the next comparable observation',
            rationale: 'One current report cannot show a trend.',
            expectedResult: 'Record a dated result without claiming causation.',
            evidence: 'Use the same reviewed account and outcome.',
            citations: ['metric:1'],
          },
        ],
      },
    },
  };
};
