import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  advertisingDraftBody,
  advertisingDraftContextFingerprint,
  advertisingDraftPrompt,
  assertAdvertisingDraftFingerprint,
  buildAdvertisingDraftContext,
  validateAdvertisingDraftOutput,
} from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.policy';
import {
  advertisingDraftPreviewSchema,
  type AdvertisingDraftContext,
} from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.types';
import { advertisingActionSchema } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  advertisingDraftFixture,
  MEMBER_ID,
  PROJECT_ID,
  REQUEST_ID,
  RUN_ID,
} from 'src/modules/delivery/advertising/drafts/__tests__/advertising-draft.fixture';

describe('advertising suggestion evidence policy', () => {
  it('preserves the exact prompt and fingerprint across PostgreSQL JSONB key reordering', () => {
    const { input, source, goal, agent, knowledge } = advertisingDraftFixture();
    const context = buildAdvertisingDraftContext(
      input,
      source,
      goal,
      agent,
      knowledge,
    );
    const reorder = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reorder);
      if (value !== null && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, item]) => [key, reorder(item)]),
        );
      return value;
    };
    const storedContext = JSON.parse(
      JSON.stringify(reorder(context)),
    ) as AdvertisingDraftContext;
    expect(Object.keys(storedContext.goal)).not.toEqual(
      Object.keys(context.goal),
    );
    expect(advertisingDraftPrompt(storedContext)).toBe(
      advertisingDraftPrompt(context),
    );
    expect(advertisingDraftContextFingerprint(storedContext, agent)).toBe(
      advertisingDraftContextFingerprint(context, agent),
    );
    const restoredInput = advertisingDraftPreviewSchema.parse(
      JSON.parse(JSON.stringify(reorder(input))),
    );
    const rebuilt = buildAdvertisingDraftContext(
      restoredInput,
      source,
      storedContext.goal,
      agent,
      storedContext.knowledge,
    );
    expect(advertisingDraftPrompt(rebuilt)).toBe(
      advertisingDraftPrompt(context),
    );
    expect(advertisingDraftContextFingerprint(rebuilt, agent)).toBe(
      advertisingDraftContextFingerprint(context, agent),
    );
    expect(
      advertisingDraftContextFingerprint(
        { ...rebuilt, instructions: 'Changed after preview' },
        agent,
      ),
    ).not.toBe(advertisingDraftContextFingerprint(context, agent));
  });
  it('keeps current task and employee routing out of the model prompt while preserving it in the frozen authority context', () => {
    const { input, source, goal, agent, knowledge } = advertisingDraftFixture();
    source.source.legacyTaskId = RUN_ID;
    const context = buildAdvertisingDraftContext(
      input,
      source,
      goal,
      agent,
      knowledge,
    );
    const prompt = advertisingDraftPrompt(context);
    expect(prompt).not.toContain(MEMBER_ID);
    expect(prompt).not.toContain(RUN_ID);
    expect(prompt).not.toContain('managerId');
    expect(prompt).not.toContain('legacyTaskId');
    expect(context.source.routing.managerId).toBe(MEMBER_ID);
    expect(context.source.legacyTaskId).toBe(RUN_ID);
    expect(prompt).toContain('12.25');
    expect(prompt).toContain(agent.configuration.instructions);
  });
  it('rejects individual-ad drafting and preserves the account scope and exact decimal evidence', () => {
    const { input, source, goal, agent, knowledge } = advertisingDraftFixture();
    expect(
      advertisingDraftPreviewSchema.safeParse({
        ...input,
        goal: { ...input.goal, metricAdId: 'ad1' },
      }).success,
    ).toBe(false);
    const context = buildAdvertisingDraftContext(
      input,
      source,
      goal,
      agent,
      knowledge,
    );
    expect(context.coverage).toBe('ACCOUNT_TOTALS_ONLY');
    expect(context.metrics[0].value).toBe('12.25');
    expect(context.goal.kind).toBe('LEADS');
    expect(context.limitations.join(' ')).toContain('No individual ads');
    expect(context).not.toHaveProperty('ads');
  });
  it('binds canonical request text without conflating it with the request UUID', () => {
    const { input } = advertisingDraftFixture();
    const original = advertisingHash(advertisingDraftBody(input));
    expect(
      advertisingHash(
        advertisingDraftBody({
          ...input,
          instructions: ` ${input.instructions} `,
        }),
      ),
    ).toBe(original);
    expect(
      advertisingHash(
        advertisingDraftBody({ ...input, instructions: 'A different test' }),
      ),
    ).not.toBe(original);
    expect(() =>
      assertAdvertisingDraftFingerprint(
        original,
        'd'.repeat(64),
        'The request',
      ),
    ).toThrow(ConflictException);
  });
  it('keeps unknown and explicit zero distinct and cites the exact published knowledge version', () => {
    const { input, source, goal, agent, knowledge } = advertisingDraftFixture();
    source.metrics[0].value = null;
    const context = buildAdvertisingDraftContext(
      input,
      source,
      { ...goal, value: null },
      agent,
      knowledge,
    );
    expect(context.metrics[0].value).toBeNull();
    expect(context.limitations.join(' ')).toContain('outcome is unknown');
    expect(
      context.references.find((item) => item.kind === 'KNOWLEDGE')?.href,
    ).toContain('knowledgeVersion=4');
    source.metrics[0].value = '0';
    expect(
      buildAdvertisingDraftContext(
        input,
        source,
        { ...goal, value: '0' },
        agent,
        knowledge,
      ).metrics[0].value,
    ).toBe('0');
  });
  it('bounds metric evidence while retaining the selected outcome and describing omitted knowledge', () => {
    const { input, source, goal, agent, knowledge } = advertisingDraftFixture();
    source.metrics = Array.from({ length: 105 }, (_, index) => ({
      ...source.metrics[0],
      key: `account:${String(index).padStart(3, '0')}`,
    }));
    goal.metricKey = 'account:104';
    knowledge.omittedSources = 3;
    knowledge.sources[0].truncated = true;
    const context = buildAdvertisingDraftContext(
      input,
      source,
      goal,
      agent,
      knowledge,
    );
    expect(context.metrics).toHaveLength(100);
    expect(
      context.metrics.some((metric) => metric.key === goal.metricKey),
    ).toBe(true);
    expect(context.limitations.join(' ')).toContain(
      '5 account metrics were omitted',
    );
    expect(context.limitations.join(' ')).toContain(
      '3 published knowledge sources',
    );
    expect(context.limitations.join(' ')).toContain('truncated');
  });
  it('makes assistant version, instructions and published evidence part of the immutable preview', () => {
    const { input, source, goal, agent, knowledge } = advertisingDraftFixture();
    const context = buildAdvertisingDraftContext(
      input,
      source,
      goal,
      agent,
      knowledge,
    );
    const fingerprint = advertisingDraftContextFingerprint(context, agent);
    expect(
      advertisingDraftContextFingerprint(context, {
        ...agent,
        version: agent.version + 1,
      }),
    ).not.toBe(fingerprint);
    expect(
      advertisingDraftContextFingerprint(
        { ...context, instructions: 'Changed' },
        agent,
      ),
    ).not.toBe(fingerprint);
    expect(
      advertisingDraftContextFingerprint(
        {
          ...context,
          knowledge: { ...knowledge, fingerprint: 'e'.repeat(32) },
        },
        agent,
      ),
    ).not.toBe(fingerprint);
  });
  it('rejects an oversized context rather than silently losing reviewed evidence', () => {
    const { input, source, goal, agent, knowledge } = advertisingDraftFixture();
    knowledge.sources[0].knowledge = 'x'.repeat(60000);
    expect(() =>
      buildAdvertisingDraftContext(input, source, goal, agent, knowledge),
    ).toThrow(BadRequestException);
  });
  it('accepts only cited structured suggestions with server-owned identities', () => {
    const { input, source, goal, agent, knowledge, output } =
      advertisingDraftFixture();
    const context = buildAdvertisingDraftContext(
      input,
      source,
      goal,
      agent,
      knowledge,
    );
    const result = validateAdvertisingDraftOutput(output, context);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].id).toMatch(/^[a-f0-9-]{36}$/);
    expect(result.limitations).toEqual(
      expect.arrayContaining(context.limitations),
    );
    expect(() =>
      validateAdvertisingDraftOutput(
        { ...output, suggestions: [{ ...output.suggestions[0], id: RUN_ID }] },
        context,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateAdvertisingDraftOutput(
        { ...output, citations: ['knowledge:foreign:1'] },
        context,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateAdvertisingDraftOutput(
        {
          ...output,
          suggestions: [
            { ...output.suggestions[0], citations: ['unseen-metric'] },
          ],
        },
        context,
      ),
    ).toThrow(BadRequestException);
  });
  it('rejects task recipients, too many suggestions and titles the actual task engine cannot accept', () => {
    const { input, source, goal, agent, knowledge, output } =
      advertisingDraftFixture();
    const context = buildAdvertisingDraftContext(
      input,
      source,
      goal,
      agent,
      knowledge,
    );
    for (const suggestions of [
      Array.from({ length: 9 }, () => output.suggestions[0]),
      [{ ...output.suggestions[0], title: 'x'.repeat(201) }],
      [{ ...output.suggestions[0], ownerId: MEMBER_ID }],
      [{ ...output.suggestions[0], citations: ['metric:1', 'metric:1'] }],
    ])
      expect(() =>
        validateAdvertisingDraftOutput({ ...output, suggestions }, context),
      ).toThrow(BadRequestException);
  });
  it('keeps a no-change proposal separate from delivery work', () => {
    const { input, source, goal, agent, knowledge, output } =
      advertisingDraftFixture();
    const context = buildAdvertisingDraftContext(
      input,
      source,
      goal,
      agent,
      knowledge,
    );
    const result = validateAdvertisingDraftOutput(
      {
        ...output,
        suggestions: [],
        noChangeReason:
          'Gather verified lead evidence before changing the campaign.',
      },
      context,
    );
    expect(result.suggestions).toEqual([]);
    expect(result.noChangeReason).toContain('verified lead evidence');
  });
  it('preserves omitted legacy origin and rejects a client-supplied human-edited claim', () => {
    const action = {
      id: REQUEST_ID,
      title: 'Inspect evidence',
      rationale: 'Review actual leads',
      expectedResult: 'Qualification sample',
      evidence: 'Reviewed report',
      ownerId: MEMBER_ID,
      reviewerId: PROJECT_ID,
      dueDate: '2026-11-02',
      assistantId: null,
      adoptTaskId: null,
    };
    expect(advertisingActionSchema.parse(action)).not.toHaveProperty('origin');
    expect(
      advertisingHash(
        advertisingActionSchema.parse({ ...action, origin: null }),
      ),
    ).toBe(advertisingHash(advertisingActionSchema.parse(action)));
    expect(
      advertisingActionSchema.safeParse({
        ...action,
        origin: { runId: RUN_ID, suggestionId: PROJECT_ID, humanEdited: false },
      }).success,
    ).toBe(false);
    expect(
      advertisingActionSchema.parse({
        ...action,
        origin: { runId: RUN_ID, suggestionId: PROJECT_ID },
      }).origin,
    ).toEqual({ runId: RUN_ID, suggestionId: PROJECT_ID });
  });
});
