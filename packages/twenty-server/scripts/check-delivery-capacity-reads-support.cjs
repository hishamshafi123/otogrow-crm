const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  NOW,
  DATE,
  TIMEZONE,
  copy,
  hash,
  quote,
  denied,
  buildServices,
  createTaskReadsFixture,
  sourceFingerprint,
} = require('./check-delivery-task-reads-support.cjs');
const DAYS = Array.from({ length: 7 }, (_, index) =>
  new Date(Date.parse(`${DATE}T00:00:00Z`) + index * 86400000)
    .toISOString()
    .slice(0, 10),
);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const date = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.getUTCFullYear() > 0 &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
};
const minutes = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 10080 ? value : null;
const emptyPlan = () => ({
  workMinutes: null,
  revisionMinutes: null,
  waitMinutes: null,
  reviewMinutes: null,
  reviewDate: null,
  complexity: null,
});
const planFor = (index) => {
  const plan = {
    workMinutes: index % 9 === 0 ? null : index % 9 === 1 ? 0 : 35 + index,
    revisionMinutes: index % 11 === 0 ? null : index % 11 === 1 ? 0 : 15,
    waitMinutes: index % 7 === 0 ? null : index % 7 === 1 ? 0 : 480,
    reviewMinutes: index % 8 === 0 ? null : index % 8 === 1 ? 0 : 25,
    reviewDate: [DAYS[0], DAYS[1], DAYS[6], null, '2026-10-28', '2026-11-05'][
      index % 6
    ],
    complexity: ['STANDARD', 'INVOLVED', 'COMPLEX', null][index % 4],
  };
  if (index % 17 === 0) return undefined;
  if (index % 19 === 0)
    return {
      ...plan,
      workMinutes: '100',
      revisionMinutes: -10,
      reviewDate: '2026-02-30',
    };
  if (index % 23 === 0)
    return {
      ...plan,
      waitMinutes: 1.5,
      reviewMinutes: 10081,
      complexity: 'UNKNOWN',
    };
  return plan;
};
async function createCapacityReadsFixture(manager) {
  const fixture = await createTaskReadsFixture(manager);
  fixture.backups = [];
  fixture.availability = [];
  for (let index = 0; index < 56; index++) {
    const person = {
      name: `capacity${String(index).padStart(2, '0')}`,
      displayName: 'Capacity tied teammate',
      memberId: randomUUID(),
      userWorkspaceId: randomUUID(),
      userId: randomUUID(),
    };
    person.email = `${person.userId}+capacity@example.invalid`;
    fixture.people[person.name] = person;
    await manager.query('INSERT INTO core."user" (id,email) VALUES($1,$2)', [
      person.userId,
      person.email,
    ]);
    await manager.query(
      'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES($1,$2,$3)',
      [person.userWorkspaceId, person.userId, fixture.workspaceId],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schemaName)}."workspaceMember" (id,"userId","nameFirstName","nameLastName") VALUES($1,$2,$3,'')`,
      [person.memberId, person.userId, person.displayName],
    );
  }
  await manager.query(
    'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
    [fixture.roles.writer, ['delivery.review']],
  );
  const missingOwnerId = randomUUID();
  fixture.missingOwnerId = missingOwnerId;
  for (const task of fixture.tasks) {
    task.title = `Capacity tied current assignment ${task.index % 3}`;
    task.details.plan = planFor(task.index);
    if (task.index < 100 && task.details.plan && task.index % 19 !== 0)
      task.details.plan.reviewDate = DAYS[0];
    task.details.scheduledDate = [
      DAYS[0],
      DAYS[0],
      DAYS[1],
      DAYS[6],
      null,
      '2026-10-28',
      '2026-11-05',
    ][task.index % 7];
    if (task.scope === 'PRIMARY' && task.index === 4)
      task.details.scheduledDate = DAYS[0];
    task.scheduledDate = task.details.scheduledDate;
    if (task.scope === 'PRIMARY') {
      if (task.index === 4) task.assigneeId = fixture.people.admin.memberId;
      if (task.index % 29 === 0) task.assigneeId = null;
      else if (task.index % 31 === 0) task.assigneeId = missingOwnerId;
      if (task.index % 37 === 0) task.details.reviewerId = missingOwnerId;
      if (task.state === 'IN_REVIEW' && task.index % 3 === 0) {
        task.assigneeId = fixture.people.reader.memberId;
        const backup = {
          id: randomUUID(),
          taskId: task.taskId,
          submissionVersion: 13,
          revision: 1,
          reviewerId: fixture.people.writer.memberId,
        };
        fixture.backups.push(backup);
        await manager.query(
          'INSERT INTO core."deliveryReviewAssignment" (id,"workspaceId","taskId","submissionVersion",revision,mode,"reviewerId","reviewerName",reason,"changedBy","changedByName","changedAt") VALUES($1,$2,$3,$4,1,\'BACKUP\',$5,\'Synthetic capacity backup\',\'Synthetic explicit reservation\',$6,\'Synthetic administrator\',$7)',
          [
            backup.id,
            fixture.workspaceId,
            task.taskId,
            backup.submissionVersion,
            backup.reviewerId,
            fixture.people.admin.memberId,
            NOW,
          ],
        );
      }
    }
    await manager.query(
      `UPDATE ${quote(fixture.schemaName)}.task SET "assigneeId"=$2,title=$3 WHERE id=$1`,
      [task.taskId, task.assigneeId, task.title],
    );
    await manager.query(
      'UPDATE core."deliveryTask" SET details=$3 WHERE "workspaceId"=$1 AND "taskId"=$2',
      [task.workspaceId, task.taskId, task.details],
    );
  }
  for (const [person, day, value] of [
    [fixture.people.reader, DAYS[0], 240],
    [fixture.people.reader, DAYS[1], 0],
    [fixture.people.reader, DAYS[6], null],
    [fixture.people.writer, DAYS[0], 30],
    [fixture.people.admin, DAYS[0], 0],
  ]) {
    const slot = {
      id: randomUUID(),
      memberId: person.memberId,
      date: day,
      minutes: value,
      revision: 1,
    };
    fixture.availability.push(slot);
    await manager.query(
      'INSERT INTO core."deliveryAvailability" (id,"workspaceId","memberId",date,minutes,revision) VALUES($1,$2,$3,$4,$5,1)',
      [slot.id, fixture.workspaceId, slot.memberId, slot.date, slot.minutes],
    );
  }
  return fixture;
}
function expectedAssignments(
  fixture,
  activePeople = Object.values(fixture.people),
) {
  const active = new Map(
    activePeople.map((person) => [person.memberId, person]),
  );
  const rows = [];
  for (const task of fixture.tasks.filter((item) => item.scope !== 'FOREIGN')) {
    if (task.deleted || task.details.state === 'APPROVED') continue;
    const plan = task.details.plan ?? emptyPlan();
    const add = (kind, ownerId, day, work, revision, wait, reviewerState) => {
      rows.push({
        taskId: task.taskId,
        kind,
        ownerId: UUID.test(ownerId ?? '') ? ownerId : null,
        date: date(day),
        workMinutes: minutes(work),
        revisionMinutes: minutes(revision),
        waitMinutes: minutes(wait),
        unknownEffort: minutes(work) === null || minutes(revision) === null,
        unknownWait: minutes(wait) === null,
        reviewerState,
        activeOwner: active.has(ownerId),
      });
    };
    if (task.details.state !== 'IN_REVIEW')
      add(
        'PRODUCTION',
        task.assigneeId,
        task.details.scheduledDate,
        plan.workMinutes,
        plan.revisionMinutes,
        plan.waitMinutes,
        null,
      );
    const latest = task.details.submissions.at(-1);
    const backup =
      task.details.state === 'IN_REVIEW' &&
      fixture.backups.find(
        (item) =>
          item.taskId === task.taskId &&
          item.submissionVersion === latest?.version,
      );
    const ownerId = backup ? backup.reviewerId : task.details.reviewerId;
    const eligible =
      active.has(ownerId) &&
      (backup
        ? fixture.backupEligible !== false
        : ownerId === fixture.people.admin.memberId);
    const reviewerState = !ownerId
      ? 'UNASSIGNED'
      : ownerId === task.assigneeId
        ? 'SELF_REVIEW'
        : eligible
          ? 'ACTIVE'
          : 'UNAVAILABLE';
    add(
      'REVIEW',
      ownerId,
      plan.reviewDate,
      plan.reviewMinutes,
      0,
      0,
      reviewerState,
    );
  }
  return rows;
}
function expectedDay(rows, memberId, day, availability = []) {
  const assignments = rows.filter(
    (row) => row.ownerId === memberId && row.date === day,
  );
  const slot = availability.find(
    (row) => row.memberId === memberId && row.date === day,
  );
  const availabilityInvalid =
    slot?.minutes !== null &&
    slot?.minutes !== undefined &&
    (!Number.isInteger(slot.minutes) ||
      slot.minutes < 0 ||
      slot.minutes > 1440);
  const availableMinutes = availabilityInvalid ? null : (slot?.minutes ?? null);
  const sum = (items, field) =>
    items.reduce((total, item) => total + (item[field] ?? 0), 0);
  const production = assignments.filter((row) => row.kind === 'PRODUCTION');
  const reviews = assignments.filter((row) => row.kind === 'REVIEW');
  const workMinutes =
    sum(assignments, 'workMinutes') + sum(assignments, 'revisionMinutes');
  return {
    date: day,
    availableMinutes,
    availabilityRevision: slot?.revision ?? 0,
    availabilityInvalid,
    assignmentCount: assignments.length,
    workMinutes,
    productionMinutes: sum(production, 'workMinutes'),
    revisionMinutes: sum(assignments, 'revisionMinutes'),
    reviewMinutes: sum(reviews, 'workMinutes'),
    waitMinutes: sum(production, 'waitMinutes'),
    unknownCount: assignments.filter((row) => row.unknownEffort).length,
    unknownWait: assignments.some((row) => row.unknownWait),
    overloadMinutes:
      availableMinutes === null
        ? 0
        : Math.max(0, workMinutes - availableMinutes),
    unavailableReviewCount: reviews.filter(
      (row) => row.reviewerState !== 'ACTIVE',
    ).length,
  };
}
const inBucket = (row, bucket, selectedDate, startDate = DATE) =>
  bucket === 'DAY'
    ? row.date === selectedDate
    : row.date === null || row.date < startDate;
module.exports = {
  NOW,
  DATE,
  DAYS,
  TIMEZONE,
  UUID,
  copy,
  hash,
  quote,
  denied,
  buildServices,
  emptyPlan,
  planFor,
  date,
  minutes,
  createCapacityReadsFixture,
  sourceFingerprint,
  expectedAssignments,
  expectedDay,
  inBucket,
};
