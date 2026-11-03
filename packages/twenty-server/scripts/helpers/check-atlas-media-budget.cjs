const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const checkAtlasMediaBudget = async ({
  service,
  runner,
  workspace,
  actor,
  project,
  taskId,
  allRows,
  denied,
}) => {
  const baseline = await allRows();
  await runner.query('SAVEPOINT atlas_media_budget');
  try {
    await runner.query(
      'UPDATE core."otogrowAiBudget" SET enabled=true,"capMicroUsd"=$2 WHERE "workspaceId"=$1',
      [workspace.id, '100000000'],
    );
    const limit = {
      id: randomUUID(),
      revision: 7,
      maximumCostUsd: '0.250000',
      source: 'Synthetic verified media limit; no real provider price claim.',
      verifiedAt: new Date().toISOString(),
    };
    const input = {
      workspaceId: workspace.id,
      actorId: actor.id,
      projectId: project.id,
      taskId,
      sourceRunId: randomUUID(),
      modelId: 'atlascloud/google/nano-banana-pro/text-to-image',
      kind: 'IMAGE',
      limit,
      quotedCostUsd: '0.100001',
      quoteEstimated: false,
      quotedAt: new Date().toISOString(),
      requestHash: 'a'.repeat(64),
      catalogSchemaRevision: 'synthetic-atlas-profile-v1',
    };
    const source = {
      workspaceId: workspace.id,
      sourceKind: 'MEDIA',
      sourceRunId: input.sourceRunId,
    };
    const run = (operation) => runner.manager.transaction(operation);
    const readBeforeQuote = await allRows();
    const quote = await run((manager) => service.quoteMedia(manager, input));
    assert.equal(quote.budgetReady, true);
    assert.equal(quote.maximumCostUsd, '0.250000');
    assert.equal(quote.boundSource, 'ADMIN_MEDIA_LIMIT');
    assert.deepEqual(await allRows(), readBeforeQuote);
    const estimated = await run((manager) =>
      service.quoteMedia(manager, { ...input, quoteEstimated: true }),
    );
    assert.equal(estimated.budgetReady, false);
    assert(estimated.blockedReason.includes('estimated'));
    assert.deepEqual(await allRows(), readBeforeQuote);
    const spend = await run((manager) => service.reserveMedia(manager, input));
    assert.equal(spend.state, 'RESERVED');
    assert.equal(spend.reservedMicroUsd, '250000');
    assert.equal(spend.actualMicroUsd, null);
    assert.equal(spend.usage, null);
    assert.equal(spend.price.billingType, 'ATLAS_MEDIA');
    assert.equal(spend.price.quotedCostUsd, '0.100001');
    assert.equal(Object.hasOwn(spend.price, 'pricing'), false);
    const reserved = await allRows();
    const replay = await run((manager) => service.reserveMedia(manager, input));
    assert.equal(replay.id, spend.id);
    assert.deepEqual(await allRows(), reserved);
    for (const change of [
      { requestHash: 'b'.repeat(64) },
      { quotedCostUsd: '0.100002' },
      { limit: { ...limit, revision: 8 } },
      { modelId: 'atlascloud/google/nano-banana-pro/edit' },
    ])
      await denied(() =>
        run((manager) =>
          service.reserveMedia(manager, { ...input, ...change }),
        ),
      );
    await denied(() =>
      run((manager) =>
        service.authorizeMediaDispatch(manager, source, actor.id, async () => {
          throw new Error('Synthetic current source revocation');
        }),
      ),
    );
    await runner.query('SAVEPOINT atlas_expired_dispatch');
    try {
      await runner.query(
        'UPDATE core."otogrowAiSpend" SET price=jsonb_set(price,\'{quotedAt}\',to_jsonb($2::text)) WHERE id=$1',
        [spend.id, new Date(Date.now() - 6 * 60 * 1000).toISOString()],
      );
      let authorized = false;
      await denied(() =>
        run((manager) =>
          service.authorizeMediaDispatch(
            manager,
            source,
            actor.id,
            async () => {
              authorized = true;
            },
          ),
        ),
      );
      assert.equal(
        authorized,
        false,
        'An expired queued quote cannot authorize a provider POST.',
      );
    } finally {
      await runner.query('ROLLBACK TO SAVEPOINT atlas_expired_dispatch');
      await runner.query('RELEASE SAVEPOINT atlas_expired_dispatch');
    }
    const dispatched = await run((manager) =>
      service.authorizeMediaDispatch(
        manager,
        source,
        actor.id,
        async () => undefined,
      ),
    );
    assert.equal(dispatched.state, 'DISPATCHED');
    assert(dispatched.dispatchedAt);
    await denied(() =>
      run((manager) =>
        service.authorizeMediaDispatch(
          manager,
          source,
          actor.id,
          async () => undefined,
        ),
      ),
    );
    const uncertain = await run((manager) =>
      service.markMediaUncertain(
        manager,
        source,
        'Synthetic accepted output; invoice charge unconfirmed.',
      ),
    );
    assert.equal(uncertain.state, 'UNCERTAIN');
    assert.equal(uncertain.actualMicroUsd, null);
    assert.equal(uncertain.reservedMicroUsd, '250000');
    const ignoredTokens = await service.settle(source, {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    assert.equal(ignoredTokens.state, 'UNCERTAIN');
    assert.equal(ignoredTokens.actualMicroUsd, null);
    await denied(() =>
      run((manager) =>
        service.confirmMediaFailure(manager, source, 'unrelated_prediction'),
      ),
    );
    const accepted = await run((manager) =>
      service.recordMediaPrediction(manager, source, 'synthetic_prediction_1'),
    );
    const acceptedRows = await allRows();
    await run((manager) =>
      service.recordMediaPrediction(manager, source, 'synthetic_prediction_1'),
    );
    assert.deepEqual(await allRows(), acceptedRows);
    await denied(() =>
      run((manager) =>
        service.recordMediaPrediction(
          manager,
          source,
          'synthetic_prediction_2',
        ),
      ),
    );
    await denied(() =>
      run((manager) =>
        service.confirmMediaFailure(manager, source, 'synthetic_prediction_2'),
      ),
    );
    const failed = await run((manager) =>
      service.confirmMediaFailure(manager, source, 'synthetic_prediction_1'),
    );
    assert.equal(failed.id, accepted.id);
    assert.equal(failed.state, 'SETTLED');
    assert.equal(failed.actualMicroUsd, '0');
    assert.equal(failed.usage, null);
    const failedRows = await allRows();
    await run((manager) =>
      service.confirmMediaFailure(manager, source, 'synthetic_prediction_1'),
    );
    assert.deepEqual(await allRows(), failedRows);
    const canceledInput = { ...input, sourceRunId: randomUUID() };
    await run((manager) => service.reserveMedia(manager, canceledInput));
    const canceledSource = {
      ...source,
      sourceRunId: canceledInput.sourceRunId,
    };
    await run((manager) => service.stop(manager, canceledSource, true));
    const canceled = (await allRows()).spend.find(
      (row) => row.sourceRunId === canceledInput.sourceRunId,
    );
    assert.equal(canceled.state, 'RELEASED');
    assert.equal(canceled.actualMicroUsd, null);
    await denied(() =>
      run((manager) =>
        service.authorizeMediaDispatch(
          manager,
          canceledSource,
          actor.id,
          async () => undefined,
        ),
      ),
    );
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT atlas_media_budget');
    await runner.query('RELEASE SAVEPOINT atlas_media_budget');
  }
  assert.deepEqual(
    await allRows(),
    baseline,
    'Media budget acceptance must restore the entire native budget baseline.',
  );
};

module.exports = { checkAtlasMediaBudget };
