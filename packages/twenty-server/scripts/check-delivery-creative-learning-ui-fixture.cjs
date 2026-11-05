const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const {
  closeSync,
  createReadStream,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { dirname, isAbsolute, join, resolve, sep } = require('node:path');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  WORKSPACE_ID,
  additions,
  exactIds,
  fingerprint,
  isAuthenticationLifecycleTable,
  locked,
  noNativeAutomation,
  operations,
  quote,
  readTables,
  syncDirectory,
  withoutHeartbeat,
  writeJournal,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const {
  advertisingServices,
  insight,
  metaReport,
} = require('./check-delivery-advertising-support.cjs');
const {
  insertMetaReport,
} = require('../dist/modules/delivery/advertising/delivery-meta-report-store');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  newCreativeDocument,
} = require('../dist/modules/delivery/creative/delivery-creative.types');
const {
  DeliveryCreativeLearningService,
} = require('../dist/modules/delivery/creative/learning/delivery-creative-learning.service');
const {
  freezeCreativeSubmissionLearning,
} = require('../dist/modules/delivery/creative/learning/freeze-creative-submission-learning');
const {
  creativeAdLinkSaveSchema,
  creativeAdLinkDecisionSchema,
  creativeLessonSaveSchema,
} = require('../dist/modules/delivery/creative/learning/delivery-creative-learning.types');
const {
  creativeAdEditableBody,
  creativeAdPreviewFingerprint,
} = require('../dist/modules/delivery/creative/learning/delivery-creative-learning.policy');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');

const FILE = '/tmp/otogrow-creative-learning-ui-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const WHEN = '2020-03-01T09:00:00.000Z';
const SOURCES = [
  'deliverytask',
  'deliverymetareport',
  'deliverycreativeadlink',
  'deliverycreativeadversion',
  'deliverycreativelearningevent',
  'deliverycreativelesson',
  'otogrowactivityevent',
];
const copy = (value) => JSON.parse(JSON.stringify(value));
const write = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const fault = (stage) => {
  if (process.env.OTOGROW_CREATIVE_LEARNING_UI_TEST_FAILURE === stage)
    throw new Error(`Injected ${stage}; recover through guarded cleanup.`);
};
const parserFor = (method) =>
  ({
    save: creativeAdLinkSaveSchema,
    decide: creativeAdLinkDecisionSchema,
    recordLesson: creativeLessonSaveSchema,
  })[method];
const actionFor = (plan) =>
  plan.method === 'save'
    ? 'SAVE'
    : plan.method === 'recordLesson'
      ? 'LESSON'
      : plan.input.action;
const actorFor = (fixture) => ({
  memberId: fixture.actorId,
  userWorkspaceId: fixture.userWorkspaceId,
});
const actorName = (fixture, memberId) =>
  memberId === fixture.actorId ? fixture.actorName : fixture.employeeName;
const at = (value) =>
  value instanceof Date ? value.getTime() : Date.parse(value);
const duringFixture = (fixture, value) =>
  assert(
    at(value) >= Date.parse(fixture.createdAt) &&
      at(value) <= Date.now() + 1000,
    'Unexpected source creation time.',
  );
const stableBody = (body) => ({ ...body, assetHashCapturedAt: null });
const entries = (fixture) => [
  { schema: fixture.schema, name: 'company', ids: [fixture.companyId] },
  { schema: fixture.schema, name: 'task', ids: [fixture.taskId] },
  { schema: 'core', name: 'deliveryTask', ids: [fixture.deliveryTaskId] },
  { schema: 'core', name: 'deliveryProject', ids: [fixture.projectId] },
  {
    schema: 'core',
    name: 'deliveryMetaReport',
    ids: Object.values(fixture.reportIds),
  },
  { schema: 'core', name: 'user', ids: [fixture.employee.userId] },
  {
    schema: 'core',
    name: 'userWorkspace',
    ids: [fixture.employee.userWorkspaceId],
  },
  {
    schema: fixture.schema,
    name: 'workspaceMember',
    ids: [fixture.employee.memberId],
  },
];

function read() {
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  assert.equal(fixture.marker, `creative-learning-ui:${fixture.nonce}`);
  assert.equal(
    fixture.title,
    `Disposable creative learning ${fixture.nonce.slice(0, 8)}`,
  );
  assert.equal(new Date(fixture.createdAt).toISOString(), fixture.createdAt);
  assert(
    ['CREATING', 'PREPARED', 'READY', 'CLEANUP_PREPARED', 'CLEANED'].includes(
      fixture.status,
    ),
  );
  const ids = [
    fixture.nonce,
    fixture.companyId,
    fixture.projectId,
    fixture.taskId,
    fixture.deliveryTaskId,
    fixture.shotId,
    ...Object.values(fixture.reportIds),
    ...Object.values(fixture.linkIds),
    ...Object.values(fixture.assets),
    ...Object.values(fixture.employee),
  ];
  for (const id of ids) assert.match(id, UUID);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(fixture.adIds.first, '999991001');
  assert.equal(fixture.adIds.second, '999991002');
  assert(Array.isArray(fixture.seedPlans) && fixture.seedPlans.length <= 7);
  assert(Array.isArray(fixture.plans) && fixture.plans.length <= 24);
  assert(
    Array.isArray(fixture.cleanupAttempts) &&
      fixture.cleanupAttempts.length <= 20,
  );
  if (fixture.schema) quote(fixture.schema);
  if (fixture.baseline) {
    for (const value of [
      fixture.actorId,
      fixture.actorUserId,
      fixture.userWorkspaceId,
    ])
      assert.match(value, UUID);
    assert.match(fixture.baseline.operations.id, UUID);
    assert.match(fixture.baseline.operations.hash, HASH);
  }
  for (const plan of [...fixture.seedPlans, ...fixture.plans]) {
    assert(parserFor(plan.method));
    assert.deepEqual(parserFor(plan.method).parse(plan.input), plan.input);
    assert.equal(plan.hash, advertisingHash(plan.input));
    assert.match(plan.memberId, UUID);
    assert.match(plan.userWorkspaceId, UUID);
    if (plan.expectedBody)
      assert.equal(
        creativeAdPreviewFingerprint(plan.expectedBody),
        plan.expectedBody.previewFingerprint,
      );
  }
  return fixture;
}

async function administrator(manager, fixture) {
  const rows = await manager.query(
    `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId",trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND NOT account.disabled AND role."canUpdateAllSettings"=true ORDER BY member.id`,
    [WORKSPACE_ID],
  );
  assert.equal(
    rows.length,
    1,
    'Use the unchanged actual local native administrator.',
  );
  if (fixture.actorId) {
    assert.equal(rows[0].memberId, fixture.actorId);
    assert.equal(rows[0].userId, fixture.actorUserId);
    assert.equal(rows[0].userWorkspaceId, fixture.userWorkspaceId);
  }
  return rows[0];
}

async function storageRoot(manager) {
  const rows = await manager.query(
    `SELECT key,value FROM core."keyValuePair" WHERE type='CONFIG_VARIABLE' AND "workspaceId" IS NULL AND "userId" IS NULL AND key IN ('STORAGE_TYPE','STORAGE_LOCAL_PATH')`,
  );
  const configuration = Object.fromEntries(
    rows.map((row) => [row.key, row.value]),
  );
  assert.equal(
    (
      configuration.STORAGE_TYPE ??
      process.env.STORAGE_TYPE ??
      'local'
    ).toLowerCase(),
    'local',
    'This fixture only supports the current local storage driver.',
  );
  const path =
    configuration.STORAGE_LOCAL_PATH ??
    process.env.STORAGE_LOCAL_PATH ??
    '.local-storage';
  assert.equal(typeof path, 'string');
  return resolve(__dirname, '..', path);
}
function directory(fixture) {
  assert(isAbsolute(fixture.media.root));
  assert.equal(
    fixture.media.directory,
    join(fixture.media.root, WORKSPACE_ID, 'delivery-creative', fixture.taskId),
  );
  return fixture.media.directory;
}
function verifyMedia(fixture, allowMissing = false) {
  if (!fixture.media) return;
  const path = directory(fixture);
  if (!existsSync(path)) {
    assert(allowMissing);
    return;
  }
  const metadata = lstatSync(path);
  assert(metadata.isDirectory() && !metadata.isSymbolicLink());
  assert(realpathSync(path).startsWith(realpathSync(fixture.media.root) + sep));
  const names = readdirSync(path).sort();
  if (!allowMissing)
    assert.deepEqual(names, Object.keys(fixture.media.files).sort());
  for (const id of names) {
    assert.match(id, UUID);
    const expected = fixture.media.files[id];
    assert(expected, 'Unplanned media must never be adopted or removed.');
    assert.match(expected.hash, HASH);
    const file = join(path, id),
      details = lstatSync(file);
    assert(details.isFile() && !details.isSymbolicLink());
    assert.equal(details.size, expected.size);
    assert.equal(
      createHash('sha256').update(readFileSync(file)).digest('hex'),
      expected.hash,
    );
  }
}
function generateMedia(fixture) {
  const path = directory(fixture);
  assert(!existsSync(path), 'Never overwrite a creative directory.');
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const video = execFileSync(
    'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x180:rate=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=44100',
      '-t',
      '2',
      '-c:v',
      'libx264',
      '-threads',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      'frag_keyframe+empty_moov',
      '-f',
      'mp4',
      'pipe:1',
    ],
    { timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
  );
  const image = execFileSync(
    'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:size=320x180',
      '-frames:v',
      '1',
      '-threads',
      '1',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      'pipe:1',
    ],
    { timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
  );
  for (const [kind, id] of Object.entries(fixture.assets)) {
    const bytes = kind === 'IMAGE' ? image : video;
    assert(bytes.length > 0 && bytes.length < 8 * 1024 * 1024);
    fixture.media.files[id] = {
      size: bytes.length,
      hash: createHash('sha256').update(bytes).digest('hex'),
    };
    write(fixture);
    const descriptor = openSync(join(path, id), 'wx', 0o600);
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    const folder = openSync(path, 'r');
    try {
      fsyncSync(folder);
    } finally {
      closeSync(folder);
    }
  }
  verifyMedia(fixture);
}

function detailsFor(fixture) {
  const creative = newCreativeDocument();
  creative.brief = {
    ...creative.brief,
    concept: `FIXTURE ${fixture.marker}: locally generated test pattern; no real brand or ad.`,
    angle: 'FIXTURE bounded human association',
    hook: 'FIXTURE planned hook, not a proven rendered component.',
    cta: 'FIXTURE planned CTA, not a proven rendered component.',
    duration: 2,
    outputKind: 'VIDEO',
  };
  creative.approvedBriefVersion = creative.briefVersion;
  creative.assets = Object.entries(fixture.assets).map(([kind, id]) => ({
    id,
    name: `FIXTURE ${kind.toLowerCase()} ${fixture.nonce.slice(0, 8)}`,
    kind,
    mimeType: kind === 'IMAGE' ? 'image/png' : 'video/mp4',
    size: fixture.media.files[id].size,
    createdAt: WHEN,
    uploadedBy: fixture.employee.memberId,
    briefVersion: creative.briefVersion,
    productionVersion: creative.productionVersion,
    assemblyVersion: creative.assemblyVersion,
    shotId: kind === 'IMAGE' || kind === 'CLIP' ? fixture.shotId : null,
    shotVersion: kind === 'IMAGE' || kind === 'CLIP' ? 1 : null,
    parentAssetId: kind === 'CLIP' ? fixture.assets.IMAGE : null,
    storageState: 'READY',
    reviews: [
      {
        memberId: fixture.actorId,
        at: WHEN,
        decision: 'APPROVED',
        notes:
          'FIXTURE synthetic approved material, never a live production approval.',
      },
    ],
  }));
  creative.shots = [
    {
      id: fixture.shotId,
      version: 1,
      title: 'FIXTURE local test-pattern shot',
      imagePrompt: '',
      animationPrompt: '',
      duration: 2,
      subject: 'FIXTURE test pattern',
      product: '',
      location: '',
      notes: '',
      referenceId: null,
      history: [],
      imageId: fixture.assets.IMAGE,
      clipId: fixture.assets.CLIP,
    },
  ];
  creative.finalAssetId = fixture.assets.FINAL;
  const submitted = freezeCreativeSubmissionLearning(
    creative,
    'FIXTURE original approved submitted copy.',
    { id: fixture.projectId, companyId: fixture.companyId },
  );
  assert.deepEqual(submitted.components, []);
  return {
    brief: `${fixture.marker}: FIXTURE final media for human association only.`,
    service: 'AI video',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: fixture.actorId,
    state: 'APPROVED',
    blocker: '',
    checklist: [],
    evidence: [],
    events: [],
    creative,
    submissions: [
      {
        version: 1,
        creativeVersion: creative.version,
        finalAssetId: fixture.assets.FINAL,
        description: 'FIXTURE independently approved synthetic final.',
        evidence: [],
        submittedBy: fixture.employee.memberId,
        submittedAt: WHEN,
        decision: 'APPROVED',
        reviewedBy: fixture.actorId,
        reviewedAt: WHEN,
        feedback: 'FIXTURE independently reviewed synthetic media.',
        creativeLearning: submitted,
      },
    ],
  };
}
function reportFor(fixture, key) {
  const second = key === 'second',
    date = second ? '2020-02-20' : '2020-01-20';
  const row = insight({
    date_start: date,
    date_stop: date,
    spend: second ? '20.00' : '10.00',
    actions: [{ action_type: 'purchase', value: second ? '5' : '0' }],
  });
  return metaReport(
    {
      projects: { first: fixture.projectId },
      people: {
        reader: { memberId: fixture.actorId },
        writer: fixture.employee,
      },
    },
    {
      id: fixture.reportIds[key],
      date,
      account: row,
      ads: [
        {
          ...row,
          ad_id: fixture.adIds[key],
          ad_name: `FIXTURE ${fixture.title} ${key} exact ad`,
          campaign_id: '999992001',
          campaign_name: 'FIXTURE synthetic campaign',
        },
      ],
      status: 'APPROVED',
      reviewedBy: fixture.actorId,
      reviewedAt: WHEN,
      fetchedAt: WHEN,
      note: `${fixture.marker}: FIXTURE seeded report, no Meta import or ad action occurred.`,
    },
  );
}
async function servicesFor(manager, fixture) {
  await administrator(manager, fixture);
  const [workspace] = await manager.query(
    'SELECT * FROM core.workspace WHERE id=$1',
    [WORKSPACE_ID],
  );
  const scoped = {
    manager,
    query: (...arguments_) => manager.query(...arguments_),
    getRepository: (entity) => manager.getRepository(entity),
    transaction: (operation) => manager.transaction(operation),
  };
  const services = advertisingServices(scoped, {
    workspaceId: WORKSPACE_ID,
    people: { admin: actorFor(fixture) },
  });
  const storage = {
    getCurrentDriver: () => ({
      readFile: async ({ filePath }) => {
        const expected = Object.values(fixture.assets).find(
          (id) =>
            filePath ===
            `${WORKSPACE_ID}/delivery-creative/${fixture.taskId}/${id}`,
        );
        assert(expected, 'Only exact journalled synthetic media may be read.');
        verifyMedia(fixture);
        return createReadStream(join(directory(fixture), expected));
      },
    }),
  };
  const creative = new DeliveryCreativeService(
    scoped,
    services.delivery,
    storage,
    createIsolatedNativeTaskAccess(),
  );
  const learning = new DeliveryCreativeLearningService(
    scoped,
    services.delivery,
    creative,
    services.sources,
    storage,
  );
  return { ...services, creative, learning, workspace };
}
async function previewInput(manager, fixture, person, sourceKey) {
  const services = await servicesFor(manager, fixture);
  const source = await services.sources.read(
    manager,
    services.workspace,
    person.memberId,
    person.userWorkspaceId,
    { kind: 'META', id: fixture.reportIds[sourceKey] },
    0,
    fixture.adIds[sourceKey],
  );
  assert.equal(source.source.projectId, fixture.projectId);
  assert.equal(source.source.companyId, fixture.companyId);
  const metric = source.metrics.find((item) =>
    item.goalKinds.includes('PURCHASES'),
  );
  assert(metric && metric.value !== null);
  return {
    projectId: fixture.projectId,
    sourceId: fixture.reportIds[sourceKey],
    adId: fixture.adIds[sourceKey],
    taskId: fixture.taskId,
    submissionVersion: 1,
    assetId: fixture.assets.FINAL,
    goal: {
      kind: 'PURCHASES',
      metricKey: metric.key,
      metricAdId: fixture.adIds[sourceKey],
      provenance: 'REPORT',
      value: metric.value,
      evidence: '',
      targetCostMicros: null,
    },
    declaredComponents: [],
    declaredCopy: null,
    associationEvidence: `FIXTURE ${fixture.marker}: human inspected this exact synthetic ad and approved final; provider creative identity is unknown.`,
    evidenceUrl: `https://example.invalid/${fixture.marker}/placement`,
    note: 'FIXTURE human association, not causal evidence.',
    correctsId: null,
  };
}

async function descendants(manager, fixture) {
  const values = [WORKSPACE_ID, fixture.projectId];
  const links = await manager.query(
    'SELECT * FROM core."deliveryCreativeAdLink" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY id',
    values,
  );
  const ids = links.map((row) => row.id);
  return {
    links,
    versions: ids.length
      ? await manager.query(
          'SELECT * FROM core."deliveryCreativeAdVersion" WHERE "workspaceId"=$1 AND "linkId"=ANY($2::uuid[]) ORDER BY "linkId",version',
          [WORKSPACE_ID, ids],
        )
      : [],
    events: ids.length
      ? await manager.query(
          'SELECT * FROM core."deliveryCreativeLearningEvent" WHERE "workspaceId"=$1 AND "linkId"=ANY($2::uuid[]) ORDER BY "linkId",revision,"createdAt",id',
          [WORKSPACE_ID, ids],
        )
      : [],
    lessons: await manager.query(
      'SELECT * FROM core."deliveryCreativeLesson" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY id',
      values,
    ),
    activity: await manager.query(
      'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY "recordedAt",id',
      values,
    ),
  };
}
function validateInput(fixture, method, input) {
  if (method === 'save') {
    assert.equal(input.projectId, fixture.projectId);
    assert.equal(input.taskId, fixture.taskId);
    assert.equal(input.submissionVersion, 1);
    assert.equal(input.assetId, fixture.assets.FINAL);
    const key = Object.keys(fixture.reportIds).find(
      (name) => fixture.reportIds[name] === input.sourceId,
    );
    assert(key);
    assert.equal(input.adId, fixture.adIds[key]);
    assert.equal(input.goal.provenance, 'REPORT');
    assert.equal(input.goal.kind, 'PURCHASES');
    assert.equal(input.goal.metricAdId, input.adId);
    assert.equal(input.declaredCopy, null);
    assert.equal(input.correctsId, null);
    assert(input.associationEvidence.includes('FIXTURE'));
    assert(input.note.includes('FIXTURE'));
    if (input.evidenceUrl)
      assert.equal(new URL(input.evidenceUrl).hostname, 'example.invalid');
    for (const component of input.declaredComponents)
      assert.equal(component.assetId, fixture.assets[component.role]);
  } else if (method === 'recordLesson') {
    assert.equal(input.projectId, fixture.projectId);
    assert.equal(input.correctsId, null);
    assert(input.title.startsWith(fixture.title));
    assert(input.lesson.includes('FIXTURE'));
    assert(input.limitations.includes('FIXTURE'));
  } else {
    assert(
      ['SUBMIT', 'REVIEW', 'REQUEST_CHANGES', 'RETRACT'].includes(input.action),
    );
    assert(input.note.includes('FIXTURE'));
  }
}
async function definition(manager, fixture, method, raw, person) {
  const input = parserFor(method).parse(raw);
  validateInput(fixture, method, input);
  const services = await servicesFor(manager, fixture);
  const rows = await descendants(manager, fixture);
  const link = rows.links.find((row) => row.id === input.id);
  const candidate = {
    method,
    input,
    hash: advertisingHash(input),
    memberId: person.memberId,
    userWorkspaceId: person.userWorkspaceId,
  };
  if (method === 'recordLesson') {
    assert(!rows.lessons.some((row) => row.id === input.id));
    const evidence = [];
    for (const [index, id] of input.linkIds.entries()) {
      const selected = await services.learning.detail(
        services.workspace,
        person.memberId,
        person.userWorkspaceId,
        { id },
        manager,
      );
      assert.equal(selected.link.projectId, fixture.projectId);
      assert.equal(selected.link.state, 'REVIEWED');
      assert.equal(selected.link.fingerprint, input.linkFingerprints[index]);
      assert.equal(selected.sourceCurrent, true);
      evidence.push({
        linkId: id,
        version: selected.selectedVersion,
        fingerprint: selected.link.fingerprint,
        body: selected.body,
      });
    }
    const anchor = rows.links.find((row) => row.id === input.linkIds[0]);
    assert(anchor);
    const {
      id: _id,
      requestId: _requestId,
      projectId: _projectId,
      linkFingerprints: _fingerprints,
      ...text
    } = input;
    return {
      ...candidate,
      expectedVersion: anchor.currentVersion,
      expectedRevision: anchor.revision,
      expectedState: anchor.state,
      expectedLessonBody: { ...text, evidence },
    };
  }
  if (method === 'save') {
    if (link) {
      assert.equal(link.createdBy, person.memberId);
      assert(['DRAFT', 'CHANGES_REQUESTED'].includes(link.state));
      assert.equal(input.revision, link.revision);
    } else {
      assert.equal(input.revision, 0);
      assert(
        !Object.values(fixture.linkIds).includes(input.id) ||
          fixture.seedPlans.length < 7,
      );
    }
    const {
      id: _id,
      requestId: _requestId,
      revision: _revision,
      previewFingerprint: _fingerprint,
      ...body
    } = input;
    const prepared = await services.learning.preview(
      services.workspace,
      person.memberId,
      person.userWorkspaceId,
      body,
      manager,
    );
    assert.equal(prepared.body.previewFingerprint, input.previewFingerprint);
    assert.equal(
      prepared.body.assetSha256,
      fixture.media.files[fixture.assets.FINAL].hash,
    );
    return {
      ...candidate,
      expectedBody: prepared.body,
      expectedVersion: (link?.currentVersion ?? 0) + 1,
      expectedRevision: input.revision + 1,
      expectedState: 'DRAFT',
    };
  }
  assert(link);
  assert.equal(input.revision, link.revision);
  const body = rows.versions.find(
    (row) => row.linkId === link.id && row.version === link.currentVersion,
  ).body;
  assert.equal(input.previewFingerprint, body.previewFingerprint);
  if (input.action === 'SUBMIT')
    assert(['DRAFT', 'CHANGES_REQUESTED'].includes(link.state));
  if (input.action === 'REVIEW' || input.action === 'REQUEST_CHANGES') {
    assert.equal(link.state, 'SUBMITTED');
    assert.notEqual(
      link.createdBy,
      person.memberId,
      'A manager cannot review their own association.',
    );
  }
  if (input.action === 'RETRACT') assert.equal(link.state, 'REVIEWED');
  if (input.action === 'SUBMIT' || input.action === 'REVIEW') {
    const preview = await services.learning.preview(
      services.workspace,
      person.memberId,
      person.userWorkspaceId,
      creativeAdEditableBody(body),
      manager,
    );
    assert.equal(preview.body.previewFingerprint, body.previewFingerprint);
  }
  return {
    ...candidate,
    expectedVersion: link.currentVersion,
    expectedRevision: input.revision + 1,
    expectedState: {
      SUBMIT: 'SUBMITTED',
      REVIEW: 'REVIEWED',
      REQUEST_CHANGES: 'CHANGES_REQUESTED',
      RETRACT: 'RETRACTED',
    }[input.action],
  };
}

async function validate(manager, fixture) {
  await noNativeAutomation(manager, fixture, SOURCES);
  await administrator(manager, fixture);
  const current = await operations(manager);
  assert.equal(current.id, fixture.baseline.operations.id);
  assert.equal(
    fingerprint(withoutHeartbeat(current.state)),
    fixture.baseline.operations.hash,
  );
  const tables = await readTables(manager, fixture),
    extra = additions(tables, fixture);
  const rows = await descendants(manager, fixture);
  const hasSeed = extra
    .find(
      (table) => table.schema === 'core' && table.name === 'deliveryProject',
    )
    .rows.some((row) => row.id === fixture.projectId);
  verifyMedia(fixture, !hasSeed);
  const expected = hasSeed ? entries(fixture) : [];
  const plans = [...fixture.seedPlans, ...fixture.plans];
  if (hasSeed) {
    for (const event of rows.events) {
      const plan = plans.find(
        (item) => item.input.requestId === event.requestId,
      );
      assert(
        plan,
        'Only an exact request journalled before the browser action is owned.',
      );
      assert.equal(event.inputHash, plan.hash);
      assert.equal(
        event.linkId,
        plan.method === 'recordLesson' ? plan.input.linkIds[0] : plan.input.id,
      );
      assert.equal(event.actorId, plan.memberId);
      assert.equal(event.userWorkspaceId, plan.userWorkspaceId);
      assert.equal(event.actorName, actorName(fixture, plan.memberId));
      assert.equal(event.action, actionFor(plan));
      assert.equal(event.revision, plan.expectedRevision);
      assert.equal(event.version, plan.expectedVersion);
      assert.equal(event.state, plan.expectedState);
      assert.equal(
        event.note,
        plan.method === 'recordLesson' ? plan.input.title : plan.input.note,
      );
      assert.equal(
        event.lessonId,
        plan.method === 'recordLesson' ? plan.input.id : null,
      );
      duringFixture(fixture, event.createdAt);
    }
    for (const version of rows.versions) {
      const event = rows.events.find(
        (row) =>
          row.linkId === version.linkId &&
          row.version === version.version &&
          row.action === 'SAVE',
      );
      assert(event);
      const plan = plans.find(
        (item) => item.input.requestId === event.requestId,
      );
      assert.equal(version.createdBy, plan.memberId);
      assert.equal(version.createdByName, actorName(fixture, plan.memberId));
      assert.deepEqual(stableBody(version.body), stableBody(plan.expectedBody));
      assert.equal(
        creativeAdPreviewFingerprint(version.body),
        version.body.previewFingerprint,
      );
      assert.equal(
        version.body.assetSha256,
        fixture.media.files[fixture.assets.FINAL].hash,
      );
      duringFixture(fixture, version.createdAt);
      duringFixture(fixture, version.body.assetHashCapturedAt);
    }
    for (const link of rows.links) {
      const history = rows.events
        .filter((row) => row.linkId === link.id && row.action !== 'LESSON')
        .sort((left, right) => left.revision - right.revision);
      assert(history.length);
      assert.deepEqual(
        history.map((row) => row.revision),
        history.map((_row, index) => index + 1),
      );
      assert.equal(history[0].action, 'SAVE');
      const first = history[0],
        last = history[history.length - 1];
      const body = rows.versions.find(
        (row) => row.linkId === link.id && row.version === link.currentVersion,
      )?.body;
      assert(body);
      assert.equal(link.createdBy, first.actorId);
      assert.equal(link.createdByName, actorName(fixture, first.actorId));
      assert.equal(link.projectId, fixture.projectId);
      assert.equal(link.sourceProjectId, fixture.projectId);
      assert.equal(link.companyId, fixture.companyId);
      assert.equal(link.taskId, fixture.taskId);
      assert.equal(link.assetId, fixture.assets.FINAL);
      assert.equal(link.sourceId, body.sourceId);
      assert.equal(link.adId, body.adId);
      assert.equal(link.correctsId, null);
      assert.equal(link.state, last.state);
      assert.equal(link.revision, last.revision);
      assert.equal(link.currentVersion, last.version);
      assert.equal(
        rows.versions.filter((row) => row.linkId === link.id).length,
        history.filter((row) => row.action === 'SAVE').length,
      );
      const reviewed = history.find((row) => row.action === 'REVIEW');
      assert.equal(link.reviewedVersion, reviewed ? reviewed.version : null);
      assert.equal(link.reviewedBy, reviewed?.actorId ?? null);
      assert.equal(
        link.reviewedByName,
        reviewed ? actorName(fixture, reviewed.actorId) : null,
      );
      if (reviewed) {
        duringFixture(fixture, link.reviewedAt);
        assert.notEqual(link.reviewedBy, link.createdBy);
      } else assert.equal(link.reviewedAt, null);
      duringFixture(fixture, link.createdAt);
    }
    for (const lesson of rows.lessons) {
      const event = rows.events.find((row) => row.lessonId === lesson.id);
      assert(event && event.action === 'LESSON');
      const plan = plans.find(
        (item) => item.input.requestId === event.requestId,
      );
      assert.equal(lesson.anchorLinkId, plan.input.linkIds[0]);
      assert.deepEqual(lesson.linkIds, plan.input.linkIds);
      assert.deepEqual(lesson.body, plan.expectedLessonBody);
      assert.equal(lesson.projectId, fixture.projectId);
      assert.equal(lesson.companyId, fixture.companyId);
      assert.equal(lesson.createdBy, plan.memberId);
      assert.equal(lesson.createdByName, actorName(fixture, plan.memberId));
      assert.equal(lesson.correctsId, null);
      duringFixture(fixture, lesson.createdAt);
    }
    assert.equal(rows.activity.length, rows.events.length);
    const paired = new Set();
    for (const audit of rows.activity) {
      const candidates = rows.events.filter(
        (event) =>
          event.linkId === audit.sourceId &&
          audit.action === `CREATIVE_LEARNING_${event.action}` &&
          event.actorId === audit.actorId &&
          String(event.revision) ===
            audit.changes.find((change) => change.field === 'revision')
              ?.after &&
          !paired.has(event.id),
      );
      assert(
        candidates.length > 0,
        'Each planned learning event has one exact structural activity.',
      );
      const event = candidates[0];
      paired.add(event.id);
      assert.equal(audit.sourceType, 'creative-learning');
      assert.equal(audit.category, 'CREATIVE');
      assert.equal(audit.actorType, 'HUMAN');
      assert.equal(audit.actorName, actorName(fixture, event.actorId));
      assert.equal(audit.projectId, fixture.projectId);
      assert.equal(audit.clientId, fixture.companyId);
      assert.equal(audit.taskId, fixture.taskId);
      assert.equal(
        audit.outcome,
        event.action === 'REVIEW' ? 'APPROVED' : 'RECORDED',
      );
      assert.deepEqual(audit.changes, [
        { field: 'state', before: null, after: event.state },
        { field: 'revision', before: null, after: String(event.revision) },
        { field: 'assetId', before: null, after: fixture.assets.FINAL },
      ]);
      duringFixture(fixture, audit.recordedAt);
    }
    for (const [name, key] of [
      ['deliveryCreativeAdLink', 'links'],
      ['deliveryCreativeAdVersion', 'versions'],
      ['deliveryCreativeLearningEvent', 'events'],
      ['deliveryCreativeLesson', 'lessons'],
      ['otogrowActivityEvent', 'activity'],
    ])
      expected.push({
        schema: 'core',
        name,
        ids: rows[key].map((row) => row.id),
      });
    assert.equal(
      rows.links.filter((row) =>
        Object.values(fixture.linkIds).includes(row.id),
      ).length,
      3,
    );
  } else assert(Object.values(rows).every((list) => list.length === 0));
  for (const table of extra) {
    const entry = expected.find(
      (item) => item.schema === table.schema && item.name === table.name,
    );
    exactIds(
      table.rows,
      entry?.ids ?? [],
      `Unexpected ${table.schema}.${table.name}; preserve the journal.`,
    );
    for (const row of table.rows) {
      const seed = fixture.seed[`${table.schema}.${table.name}:${row.id}`];
      if (seed && table.name !== 'deliveryCreativeAdLink')
        assert.equal(
          row.hash,
          seed,
          'An immutable fixture source, history or original task changed.',
        );
    }
  }
  if (hasSeed)
    for (const entry of entries(fixture))
      for (const id of entry.ids)
        assert(fixture.seed[`${entry.schema}.${entry.name}:${id}`]);
  return { tables, extra, rows, hasSeed };
}

async function seedCommand(manager, fixture, method, input, person) {
  const plan = await definition(manager, fixture, method, input, person);
  fixture.seedPlans.push(plan);
  write(fixture);
  const services = await servicesFor(manager, fixture);
  return services.learning[method](
    services.workspace,
    person.memberId,
    person.userWorkspaceId,
    plan.input,
    manager,
  );
}
async function create() {
  assert(!existsSync(FILE), 'Recover the active Learning fixture first.');
  const nonce = randomUUID();
  const fixture = {
    version: 1,
    workspaceId: WORKSPACE_ID,
    nonce,
    createdAt: new Date().toISOString(),
    marker: `creative-learning-ui:${nonce}`,
    title: `Disposable creative learning ${nonce.slice(0, 8)}`,
    status: 'CREATING',
    companyId: randomUUID(),
    projectId: randomUUID(),
    taskId: randomUUID(),
    deliveryTaskId: randomUUID(),
    shotId: randomUUID(),
    employee: {
      userId: randomUUID(),
      memberId: randomUUID(),
      userWorkspaceId: randomUUID(),
    },
    reportIds: { first: randomUUID(), second: randomUUID() },
    adIds: { first: '999991001', second: '999991002' },
    linkIds: {
      baseline: randomUUID(),
      approve: randomUUID(),
      return: randomUUID(),
    },
    assets: Object.fromEntries(
      ['FINAL', 'BASE', 'HOOK', 'CTA', 'IMAGE', 'CLIP'].map((kind) => [
        kind,
        randomUUID(),
      ]),
    ),
    seedPlans: [],
    plans: [],
    seed: {},
    cleanupAttempts: [],
  };
  write(fixture, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const [workspace] = await manager.query(
      'SELECT * FROM core.workspace WHERE id=$1',
      [WORKSPACE_ID],
    );
    assert.equal(workspace.activationStatus, 'ACTIVE');
    fixture.schema = workspace.databaseSchema;
    quote(fixture.schema);
    const actor = await administrator(manager, fixture);
    fixture.actorId = actor.memberId;
    fixture.actorUserId = actor.userId;
    fixture.userWorkspaceId = actor.userWorkspaceId;
    fixture.actorName = actor.name;
    fixture.employeeName = `Learning fixture editor ${nonce.slice(0, 8)}`;
    await noNativeAutomation(manager, fixture, SOURCES);
    const original = await operations(manager);
    fixture.baseline = {
      tables: await readTables(manager, fixture),
      operations: {
        id: original.id,
        hash: fingerprint(withoutHeartbeat(original.state)),
      },
    };
    assert(
      fixture.baseline.tables.length >= 180,
      'Protect the full current scoped table inventory.',
    );
    const root = await storageRoot(manager);
    fixture.media = {
      root,
      directory: join(root, WORKSPACE_ID, 'delivery-creative', fixture.taskId),
      files: {},
    };
    fixture.status = 'PREPARED';
    write(fixture);
    generateMedia(fixture);
    const email = `${fixture.employee.userId}+learning-ui@example.invalid`;
    await manager.query(
      'INSERT INTO core."user" (id,email,disabled) VALUES($1,$2,false)',
      [fixture.employee.userId, email],
    );
    await manager.query(
      'INSERT INTO core."userWorkspace" (id,"workspaceId","userId") VALUES($1,$2,$3)',
      [fixture.employee.userWorkspaceId, WORKSPACE_ID, fixture.employee.userId],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES($1,$2,$3,'Learning fixture editor',$4)`,
      [
        fixture.employee.memberId,
        fixture.employee.userId,
        email,
        nonce.slice(0, 8),
      ],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}.company (id,name) VALUES($1,$2)`,
      [fixture.companyId, fixture.title],
    );
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,$4,$5)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.title,
        fixture.companyId,
        JSON.stringify([fixture.employee.memberId, fixture.actorId]),
      ],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}.task (id,title,"assigneeId",status,"dueAt") VALUES($1,$2,$3,'DONE',NULL)`,
      [
        fixture.taskId,
        `${fixture.title} exact approved video`,
        fixture.employee.memberId,
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryTask" (id,"workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,$5,1)',
      [
        fixture.deliveryTaskId,
        WORKSPACE_ID,
        fixture.taskId,
        fixture.projectId,
        detailsFor(fixture),
      ],
    );
    for (const key of Object.keys(fixture.reportIds))
      await insertMetaReport(manager, WORKSPACE_ID, reportFor(fixture, key));
    const services = await servicesFor(manager, fixture);
    for (const [name, sourceKey] of [
      ['baseline', 'first'],
      ['approve', 'second'],
      ['return', 'second'],
    ]) {
      const input = await previewInput(
        manager,
        fixture,
        fixture.employee,
        sourceKey,
      );
      const preview = await services.learning.preview(
        workspace,
        fixture.employee.memberId,
        fixture.employee.userWorkspaceId,
        input,
        manager,
      );
      await seedCommand(
        manager,
        fixture,
        'save',
        {
          ...input,
          id: fixture.linkIds[name],
          requestId: randomUUID(),
          revision: 0,
          previewFingerprint: preview.body.previewFingerprint,
        },
        fixture.employee,
      );
      await seedCommand(
        manager,
        fixture,
        'decide',
        {
          id: fixture.linkIds[name],
          requestId: randomUUID(),
          revision: 1,
          action: 'SUBMIT',
          previewFingerprint: preview.body.previewFingerprint,
          note: 'FIXTURE employee submitted exact human association.',
        },
        fixture.employee,
      );
      if (name === 'baseline')
        await seedCommand(
          manager,
          fixture,
          'decide',
          {
            id: fixture.linkIds[name],
            requestId: randomUUID(),
            revision: 2,
            action: 'REVIEW',
            previewFingerprint: preview.body.previewFingerprint,
            note: 'FIXTURE independent manager reviewed exact baseline association.',
          },
          actor,
        );
    }
    const tables = await readTables(manager, fixture),
      extra = additions(tables, fixture);
    fixture.seedRows = extra.filter((table) => table.rows.length);
    for (const table of extra)
      for (const row of table.rows)
        fixture.seed[`${table.schema}.${table.name}:${row.id}`] = row.hash;
    write(fixture);
    await validate(manager, fixture);
    fault('create-before-commit');
  });
  fault('create-after-commit');
  fixture.status = 'READY';
  write(fixture);
  print(fixture);
}

async function plan(fixture, path) {
  assert(isAbsolute(path));
  const metadata = lstatSync(path);
  assert(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      (metadata.mode & 0o077) === 0 &&
      metadata.size <= 500000,
    'Use a bounded private JSON input file.',
  );
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(Object.keys(raw).sort(), ['input', 'method']);
  assert(parserFor(raw.method));
  const input = parserFor(raw.method).parse(raw.input);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const observation = await validate(manager, fixture);
    assert(observation.hasSeed);
    const existing = [...fixture.seedPlans, ...fixture.plans].find(
      (item) => item.input.requestId === input.requestId,
    );
    if (existing) {
      assert.equal(existing.method, raw.method);
      assert.deepEqual(existing.input, input);
      assert.equal(existing.memberId, fixture.actorId);
      assert.equal(existing.userWorkspaceId, fixture.userWorkspaceId);
      return;
    }
    assert(fixture.plans.length < 24);
    const candidate = await definition(
      manager,
      fixture,
      raw.method,
      input,
      actorFor(fixture),
    );
    fixture.plans.push(candidate);
    write(fixture);
  });
  console.log(
    JSON.stringify(
      {
        journal: FILE,
        method: raw.method,
        requestId: input.requestId,
        id: input.id,
        hash: advertisingHash(input),
        allowed:
          'Execute only this exact planned Learning UI command. No creative task approval, provider, settings, message, publishing or access action.',
      },
      null,
      2,
    ),
  );
}
function print(fixture) {
  const base = `http://apple.localhost:3001/delivery?view=creative&creativeView=learning&learningProject=${fixture.projectId}`;
  console.log(
    JSON.stringify(
      {
        journal: FILE,
        status: fixture.status,
        title: fixture.title,
        projectId: fixture.projectId,
        companyId: fixture.companyId,
        taskId: fixture.taskId,
        actorId: fixture.actorId,
        employeeId: fixture.employee.memberId,
        reportIds: fixture.reportIds,
        adIds: fixture.adIds,
        linkIds: fixture.linkIds,
        assets: fixture.assets,
        urls: {
          library: base,
          baseline: `${base}&learningLink=${fixture.linkIds.baseline}`,
          approve: `${base}&learningLink=${fixture.linkIds.approve}`,
          return: `${base}&learningLink=${fixture.linkIds.return}`,
          source: `${base}&learningSource=${fixture.reportIds.second}&learningAd=${fixture.adIds.second}`,
        },
        seededCounts: {
          company: 1,
          project: 1,
          activeInvalidEmailEmployee: 1,
          approvedTask: 1,
          metaReports: 2,
          associations: 3,
          associationVersions: 3,
          learningEvents: 7,
          activityEvents: 7,
          localMedia: 6,
          lessons: 0,
        },
        instructions:
          'All sources are clearly synthetic. Root may independently Review one employee proposal, Request changes on the other, inspect the baseline and exact media, save/submit a separate own draft (self-review remains blocked), explicitly select offered BASE/HOOK/CTA human declarations, and save a lesson with two reviewed windows without aggregation/causation. Before EVERY Save/Submit/Review/Request changes/Retract/Lesson click, write {method:save|decide|recordLesson,input:exact GraphQL input} to a private chmod600 JSON file and run plan <absolute path>. Inputs must use only this owned project/task/report/ad/assets, FIXTURE notes/evidence and example.invalid placement links; lesson title starts with the disposable title. No original data, creative task approval, provider/agent calls, native task creation, settings, access, publication, send or deployment. Schedules and transports remain unchanged.',
      },
      null,
      2,
    ),
  );
}

async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) {
      const [workspace] = await manager.query(
        'SELECT "databaseSchema" FROM core.workspace WHERE id=$1',
        [WORKSPACE_ID],
      );
      fixture.schema = workspace.databaseSchema;
      for (const entry of entries(fixture))
        assert.equal(
          (
            await manager.query(
              `SELECT id FROM ${quote(entry.schema)}.${quote(entry.name)} WHERE id=ANY($1::uuid[])`,
              [entry.ids],
            )
          ).length,
          0,
        );
      assert(
        Object.values(await descendants(manager, fixture)).every(
          (rows) => rows.length === 0,
        ),
      );
      verifyMedia(fixture, true);
      return;
    }
    const observation = await validate(manager, fixture);
    const authentication = observation.tables.filter(
      isAuthenticationLifecycleTable,
    );
    if (observation.hasSeed) {
      fixture.status = 'CLEANUP_PREPARED';
      fixture.cleanupAttempts.push({
        at: new Date().toISOString(),
        rows: observation.extra.filter((table) => table.rows.length),
      });
      write(fixture);
      const order = [
        ['core', 'otogrowActivityEvent'],
        ['core', 'deliveryCreativeLearningEvent'],
        ['core', 'deliveryCreativeLesson'],
        ['core', 'deliveryCreativeAdVersion'],
        ['core', 'deliveryCreativeAdLink'],
        ['core', 'deliveryMetaReport'],
        ['core', 'deliveryTask'],
        [fixture.schema, 'task'],
        ['core', 'deliveryProject'],
        [fixture.schema, 'workspaceMember'],
        ['core', 'userWorkspace'],
        ['core', 'user'],
        [fixture.schema, 'company'],
      ];
      for (const [schema, name] of order) {
        const table = observation.extra.find(
          (item) => item.schema === schema && item.name === name,
        );
        assert(table);
        const ids = table.rows.map((row) => row.id);
        const removed = await manager.query(
          `WITH removed AS(DELETE FROM ${quote(schema)}.${quote(name)} WHERE id=ANY($1::uuid[]) RETURNING id)SELECT id FROM removed`,
          [ids],
        );
        exactIds(removed, ids);
      }
    }
    const after = await readTables(manager, fixture);
    for (const [index, table] of after.entries())
      assert.equal(
        table.hash,
        isAuthenticationLifecycleTable(table)
          ? authentication.find((item) => item.name === table.name).hash
          : fixture.baseline.tables[index].hash,
        `Original ${table.schema}.${table.name} changed.`,
      );
    assert.equal(
      fingerprint(withoutHeartbeat((await operations(manager)).state)),
      fixture.baseline.operations.hash,
    );
    write(fixture);
    fault('cleanup-before-commit');
  });
  fault('cleanup-after-commit');
  verifyMedia(fixture, true);
  if (fixture.media && existsSync(directory(fixture))) {
    for (const id of readdirSync(directory(fixture)))
      unlinkSync(join(directory(fixture), id));
    rmdirSync(directory(fixture));
  }
  fixture.status = 'CLEANED';
  write(fixture);
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  if (existsSync(receipt))
    assert.equal(
      fingerprint(JSON.parse(readFileSync(receipt, 'utf8'))),
      fingerprint(fixture),
    );
  else writeJournal(fixture, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
  console.log(
    `PASS exact Creative-learning UI cleanup: ${fixture.baseline?.tables.length ?? 0} original scoped tables, Operations and current authentication preserved; only journalled synthetic sources, planned learning descendants and hashed local media removed. Receipt: ${receipt}`,
  );
}
async function main() {
  const mode = process.argv[2];
  assert(['create', 'inspect', 'plan', 'cleanup'].includes(mode));
  assert.equal(process.argv.length, mode === 'plan' ? 4 : 3);
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error(
      'The Learning UI fixture forbids all network/provider calls.',
    );
  };
  try {
    await connectionSource.initialize();
    if (mode === 'create') await create();
    else {
      const fixture = read();
      if (mode === 'cleanup') await cleanup(fixture);
      else if (mode === 'plan') await plan(fixture, process.argv[3]);
      else {
        await connectionSource.transaction(async (manager) => {
          await locked(manager);
          await validate(manager, fixture);
        });
        print(fixture);
      }
    }
  } finally {
    if (connectionSource.isInitialized) await connectionSource.destroy();
    global.fetch = originalFetch;
  }
}
module.exports = { servicesFor };
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`Preserve ${FILE}; use guarded cleanup only.`);
    process.exitCode = 1;
  });
