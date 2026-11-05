const assert = require('node:assert/strict');
const timestamp = (value) =>
  value === null ? null : new Date(value).toISOString();
function validateContentLedger(fixture, dynamic) {
  const events = dynamic.deliveryContentEvent;
  const versions = dynamic.deliveryContentVersion;
  const variants = dynamic.deliveryContentVariant;
  const plans = dynamic.deliveryContentPlan;
  const accounts = dynamic.deliveryContentAccount;
  const activity = dynamic.otogrowActivityEvent;
  const expectedAction = (command) =>
    ({
      saveAccount: 'SAVE_ACCOUNT',
      savePlan: 'SAVE_PLAN',
      save: 'SAVE',
      decide: command.input.action,
    })[command.method];
  const planned = (event) => {
    const command = fixture.commands.find(
      (item) =>
        item.input.requestId === event.requestId &&
        item.hash === event.inputHash &&
        item.memberId === event.actorId &&
        item.userWorkspaceId === event.userWorkspaceId,
    );
    assert(command, 'An unplanned receipt prevents cleanup.');
    return command;
  };
  for (const event of events) {
    const command = planned(event);
    assert.equal(event.workspaceId, fixture.workspaceId);
    assert.equal(event.targetId, command.input.id);
    assert.equal(event.action, expectedAction(command));
    assert.equal(event.revision, command.input.revision + 1);
    assert.equal(event.note, command.input.note ?? '');
    assert.equal(event.evidenceUrl, command.input.evidenceUrl ?? '');
    assert.equal(
      timestamp(event.publishedAt),
      timestamp(command.input.publishedAt ?? null),
    );
    assert.equal(event.correctsEventId, command.input.correctsEventId ?? null);
    const person = Object.values(fixture.people).find(
      (item) => item.memberId === command.memberId,
    );
    assert.equal(
      event.actorName,
      person.displayName ?? `${person.name} ${fixture.sentinel}`,
    );
    if (event.targetKind === 'ACCOUNT') {
      assert.equal(command.method, 'saveAccount');
      assert.equal(event.accountId, event.targetId);
      assert.equal(event.planId, null);
      assert.equal(event.variantId, null);
      assert.equal(event.version, null);
    } else if (event.targetKind === 'PLAN') {
      assert.equal(command.method, 'savePlan');
      assert.equal(event.planId, event.targetId);
      assert.equal(event.accountId, null);
      assert.equal(event.variantId, null);
      assert.equal(event.version, null);
    } else {
      assert.equal(event.targetKind, 'VARIANT');
      assert(['save', 'decide'].includes(command.method));
      assert.equal(event.variantId, event.targetId);
      assert.equal(event.accountId, null);
      assert(
        variants.some(
          (item) => item.id === event.variantId && item.planId === event.planId,
        ),
      );
    }
  }
  for (const account of accounts) {
    const history = events
      .filter(
        (item) => item.targetKind === 'ACCOUNT' && item.targetId === account.id,
      )
      .sort((a, b) => a.revision - b.revision);
    assert.deepEqual(
      history.map((event) => event.revision),
      Array.from({ length: account.revision }, (_, index) => index + 1),
    );
    const command = planned(history.at(-1));
    assert.equal(account.workspaceId, fixture.workspaceId);
    assert.equal(account.companyId, command.input.expectedCompanyId);
    for (const key of [
      'id',
      'projectId',
      'name',
      'handle',
      'profileUrl',
      'platform',
      'archived',
    ])
      assert.deepEqual(account[key], command.input[key]);
    for (const event of history)
      assert.equal(
        event.status,
        planned(event).input.archived ? 'ARCHIVED' : 'REGISTERED',
      );
  }
  for (const plan of plans) {
    const history = events
      .filter((item) => item.targetKind === 'PLAN' && item.targetId === plan.id)
      .sort((a, b) => a.revision - b.revision);
    assert.deepEqual(
      history.map((event) => event.revision),
      Array.from({ length: plan.revision }, (_, index) => index + 1),
    );
    const command = planned(history.at(-1));
    assert.equal(plan.workspaceId, fixture.workspaceId);
    assert.equal(plan.companyId, command.input.expectedCompanyId);
    assert.equal(plan.createdBy, history[0].actorId);
    for (const key of [
      'id',
      'projectId',
      'title',
      'purpose',
      'engagementId',
      'service',
    ])
      assert.deepEqual(plan[key], command.input[key]);
    assert(history.every((item) => item.status === 'PLANNED'));
  }
  for (const version of versions) {
    const event = events.find(
      (item) =>
        item.variantId === version.variantId &&
        item.version === version.version &&
        item.action === 'SAVE',
    );
    assert(event);
    const command = planned(event);
    assert.equal(version.workspaceId, fixture.workspaceId);
    assert.equal(version.createdBy, event.actorId);
    assert.deepEqual(
      version.body,
      command.body,
      'The saved package must exactly match its predeclared preview.',
    );
  }
  for (const variant of variants) {
    const history = events
      .filter((item) => item.variantId === variant.id)
      .sort((a, b) => a.revision - b.revision);
    assert.deepEqual(
      history.map((event) => event.revision),
      Array.from({ length: variant.revision }, (_, index) => index + 1),
    );
    let status,
      version = 0,
      submittedBy = null,
      approval = null;
    for (const event of history) {
      if (event.action === 'SAVE') {
        status = 'DRAFT';
        version++;
        submittedBy = null;
        approval = null;
      } else if (event.action === 'SUBMIT') {
        assert(['DRAFT', 'CHANGES_REQUESTED'].includes(status));
        status = 'REVIEW';
        submittedBy = event.actorId;
      } else if (event.action === 'APPROVE') {
        assert.equal(status, 'REVIEW');
        status = 'APPROVED';
        approval = event;
      } else if (event.action === 'REQUEST_CHANGES') {
        assert.equal(status, 'REVIEW');
        status = 'CHANGES_REQUESTED';
      } else if (event.action === 'RECORD_PUBLICATION') {
        assert.equal(status, 'APPROVED');
        status = 'PUBLISHED';
      } else if (event.action === 'CANCEL') {
        assert.notEqual(status, 'PUBLISHED');
        status = 'CANCELLED';
        approval = null;
      } else if (event.action === 'CORRECT_PUBLICATION')
        assert.equal(status, 'PUBLISHED');
      else {
        assert(['RECORD_FAILED', 'RECORD_UNCERTAIN'].includes(event.action));
        assert.equal(status, 'APPROVED');
      }
      assert.equal(event.status, status);
      assert.equal(event.version, version);
    }
    const current = versions.find(
      (item) => item.variantId === variant.id && item.version === version,
    );
    assert(current);
    assert.equal(variant.workspaceId, fixture.workspaceId);
    const plan = plans.find((item) => item.id === variant.planId);
    assert(plan);
    assert.equal(variant.projectId, plan.projectId);
    assert.equal(variant.companyId, plan.companyId);
    assert.equal(variant.status, status);
    assert.equal(variant.currentVersion, version);
    assert.equal(variant.createdBy, history[0].actorId);
    assert.equal(variant.submittedBy, submittedBy);
    assert.equal(variant.approvedVersion, approval?.version ?? null);
    assert.equal(variant.reviewedBy, approval?.actorId ?? null);
    assert.equal(Boolean(variant.reviewedAt), Boolean(approval));
    for (const key of ['accountId', 'ownerId', 'reviewerId'])
      assert.equal(variant[key], current.body[key]);
    assert.equal(variant.assetTaskId, current.body.asset?.taskId ?? null);
    assert.equal(
      timestamp(variant.plannedAt),
      timestamp(current.body.plannedAt),
    );
  }
  assert.equal(activity.length, events.length);
  const matched = new Set();
  for (const audit of activity) {
    const event = events.find(
      (item) =>
        item.targetId === audit.sourceId &&
        item.actorId === audit.actorId &&
        audit.action ===
          (item.targetKind === 'VARIANT'
            ? `CONTENT_POST_${item.action}`
            : item.targetKind === 'ACCOUNT'
              ? 'CONTENT_ACCOUNT_SAVE'
              : 'CONTENT_PLAN_SAVE') &&
        audit.changes.some(
          (change) =>
            change.field === 'revision' &&
            change.after === String(item.revision),
        ),
    );
    assert(event && !matched.has(event.id));
    matched.add(event.id);
    assert.equal(audit.workspaceId, fixture.workspaceId);
    assert.equal(audit.category, 'BUSINESS');
    assert.equal(audit.actorType, 'HUMAN');
    assert.equal(
      audit.sourceType,
      event.targetKind === 'VARIANT'
        ? 'content-post'
        : event.targetKind === 'ACCOUNT'
          ? 'content-account'
          : 'content-plan',
    );
    const command = planned(event);
    const plan = event.planId
      ? plans.find((item) => item.id === event.planId)
      : null;
    assert.equal(audit.projectId, plan?.projectId ?? command.input.projectId);
    assert.equal(
      audit.taskId,
      event.targetKind === 'VARIANT'
        ? (versions.find(
            (item) =>
              item.variantId === event.variantId &&
              item.version === event.version,
          ).body.asset?.taskId ?? null)
        : null,
    );
    assert.deepEqual(audit.changes, [
      { field: 'state', before: null, after: event.status },
      { field: 'revision', before: null, after: String(event.revision) },
    ]);
    assert(!JSON.stringify(audit).includes('FIXTURE brand post caption'));
  }
}
module.exports = { validateContentLedger };
