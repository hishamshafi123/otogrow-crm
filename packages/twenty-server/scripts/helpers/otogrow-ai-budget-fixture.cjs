const assert = require('node:assert/strict');
const {
  OtogrowAiBudgetService,
} = require('../../dist/modules/otogrow-ai-budget/otogrow-ai-budget.service');
const {
  OtogrowAiBudgetEntity,
} = require('../../dist/modules/otogrow-ai-budget/entities/otogrow-ai-budget.entity');
const {
  OtogrowAiPriceEntity,
} = require('../../dist/modules/otogrow-ai-budget/entities/otogrow-ai-price.entity');

// Synthetic pricing belongs only to a rollback transaction with mocked providers.
const makeBudgetFixture = async (scoped, access, workspace, models) => {
  assert(scoped.manager.queryRunner?.isTransactionActive);
  assert(
    !process.argv.includes('--live') &&
      !process.argv.includes('--browser-fixture'),
    'Synthetic AI budgets must never fund provider calls or persisted fixtures.',
  );
  const budgetRepository = scoped.manager.getRepository(OtogrowAiBudgetEntity);
  assert.equal(
    await budgetRepository.countBy({ workspaceId: workspace.id }),
    0,
    'Run against a fresh test workspace; never replace real budget policies.',
  );
  await budgetRepository.save({
    workspaceId: workspace.id,
    scope: 'WORKSPACE',
    scopeId: workspace.id,
    scopeName: 'Rollback fixture',
    revision: 1,
    enabled: true,
    capMicroUsd: '100000000',
    openingSpentMicroUsd: '0',
  });
  for (const { modelId, kind } of models)
    await scoped.manager
      .getRepository(OtogrowAiPriceEntity)
      .save({
        workspaceId: workspace.id,
        modelId,
        kind,
        enabled: true,
        revision: 1,
        source: 'Synthetic regression fixture; no provider price claim',
        verifiedAt: new Date(),
        pricing: {
          inputUsdPerMillionTokens: '1',
          outputUsdPerMillionTokens: '1',
          reasoningUsdPerMillionTokens: '1',
          cacheReadUsdPerMillionTokens: '1',
          cacheWriteUsdPerMillionTokens: '1',
          maxInputTokens: 1_000_000,
          maxOutputTokens: 60_000,
          maxReasoningTokens: 0,
          outputIncludesReasoning: true,
          longContextThresholdTokens: null,
          longInputUsdPerMillionTokens: null,
          longOutputUsdPerMillionTokens: null,
          longReasoningUsdPerMillionTokens: null,
          longCacheReadUsdPerMillionTokens: null,
          longCacheWriteUsdPerMillionTokens: null,
        },
      });
  return new OtogrowAiBudgetService(scoped, access);
};
module.exports = { makeBudgetFixture };
