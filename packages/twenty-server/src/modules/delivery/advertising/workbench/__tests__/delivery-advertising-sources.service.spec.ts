import { type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type DeliveryMetaService } from 'src/modules/delivery/advertising/delivery-meta.service';
import { type DeliveryBusinessService } from 'src/modules/delivery/business/delivery-business.service';
import { type MetaReport } from 'src/modules/delivery/advertising/delivery-meta.types';
import {
  readMetaReportPage,
  readMetaReportSummary,
} from 'src/modules/delivery/advertising/delivery-meta-report-store';
import { DeliveryAdvertisingSourcesService } from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.service';

jest.mock('src/modules/delivery/advertising/delivery-meta-report-store', () => {
  const actual = jest.requireActual<
    typeof import('src/modules/delivery/advertising/delivery-meta-report-store')
  >('src/modules/delivery/advertising/delivery-meta-report-store');
  return {
    ...actual,
    readMetaReportSummary: jest.fn(),
    readMetaReportPage: jest.fn(),
  };
});

const WORKSPACE = '312c4a37-5cd6-473a-bab1-f27bc842b739';
const PROJECT = '8d49c8a5-5023-43b1-b258-dba576bd8c1b';
const COMPANY = '657747a6-4b3f-42d9-9f5c-84d9e653a667';
const MEMBER = '7c2ef280-7f39-4b5b-8a25-bfd8dd6787f1';
const OTHER = '9bcb1d76-8b11-43f9-afd3-bb2792613625';
const INDEPENDENT_MEMBER = '7d590f7f-1176-4fbb-a9f9-99dbf2697c67';
const REPORT = '42a4f313-b8b8-4bcb-8315-a97e0253edb3';
const DRAFT = '8b9892d5-7993-4cb1-b73e-23f3d66e96ad';
const ASSIGNED = '83d064db-0933-44db-b9ea-d3ff3a164fd0';
const workspace = {
  id: WORKSPACE,
  databaseSchema: 'source_test',
} as WorkspaceEntity;
const report: MetaReport = {
  id: REPORT,
  accountId: '1234567890',
  projectId: PROJECT,
  managerId: MEMBER,
  marketerId: OTHER,
  date: '2020-02-20',
  currency: 'USD',
  timezone: 'Asia/Qatar',
  fetchedAt: '2020-02-21T06:00:00.000Z',
  account: {
    account_id: '1234567890',
    date_start: '2020-02-20',
    date_stop: '2020-02-20',
    spend: '12.34',
    impressions: '10',
    clicks: '2',
    actions: [{ action_type: 'lead', value: '2' }],
    action_values: [],
  },
  ads: [],
  status: 'APPROVED',
  reviewedBy: MEMBER,
  reviewedAt: '2020-02-21T06:00:00.000Z',
  note: '',
  taskId: null,
};
const metadata = {
  position: '1',
  adCount: 1,
  archivedAt: null,
  lastCheckedAt: report.fetchedAt,
  hasNewerVersion: false,
};
const manual = {
  id: REPORT,
  kind: 'AD_REPORT',
  revision: 1,
  projectId: PROJECT,
  createdBy: MEMBER,
  createdAt: report.fetchedAt,
  updatedAt: report.fetchedAt,
  title: 'Manually reported campaign',
  date: report.date,
  channel: 'META',
  currency: 'USD',
  spend: 1234,
  purchases: 0,
  qualifiedLeads: 2,
  bookedCalls: 0,
  webinarRegistrations: 0,
  attributedRevenue: 0,
  shopifyRevenue: null,
  goal: 'LEADS',
  targetCost: 2500,
  recommendation: 'Inspect qualified lead quality.',
  sourceUrl: 'https://example.invalid/report',
  marketerId: OTHER,
  status: 'REVIEW',
  decisionBy: null,
  evidence: null,
  taskId: null,
};
const fixture = () => {
  const actor = {
    memberId: MEMBER,
    isAdmin: true,
    isManager: true,
    capabilities: ['workspace.admin'],
    roleIds: [],
  };
  const project = {
    id: PROJECT,
    workspaceId: WORKSPACE,
    name: 'Owned campaign',
    companyId: COMPANY,
    revision: 1,
    memberIds: [MEMBER, OTHER],
  };
  const query = jest.fn().mockImplementation(async (sql: string) => {
    if (sql.includes('array_agg(id ORDER BY id)'))
      return [{ ids: [PROJECT], fingerprint: 'current-projects' }];
    if (sql.includes("SELECT item.value-'history'"))
      return [{ record: manual }];
    if (sql.includes('WITH packets AS')) return [];
    if (sql.includes('SELECT member.id'))
      return [
        { id: MEMBER, name: 'Manager' },
        { id: OTHER, name: 'Marketer' },
      ];
    if (sql.includes('SELECT item.value AS row')) {
      if (!report.account) throw new Error('Expected account evidence.');
      return [{ row: { ...report.account, ad_id: '9001' } }];
    }
    throw new Error(`Unexpected source query: ${sql}`);
  });
  const manager = {
    queryRunner: { isTransactionActive: true },
    query,
    getRepository: jest.fn(() => ({
      findOneBy: jest.fn().mockResolvedValue(project),
    })),
  } as unknown as EntityManager;
  const delivery = {
    actor: jest.fn().mockResolvedValue(actor),
    schema: jest.fn().mockReturnValue('"source_test"'),
  };
  const meta = { validateReportRouting: jest.fn().mockResolvedValue({}) };
  const service = new DeliveryAdvertisingSourcesService(
    delivery as unknown as DeliveryService,
    meta as unknown as DeliveryMetaService,
    {} as DeliveryBusinessService,
  );
  return { actor, query, manager, delivery, service };
};

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(readMetaReportSummary)
    .mockImplementation(async (_manager, _scope, _id, metadataOnly) => ({
      ...report,
      ...metadata,
      account: metadataOnly ? null : report.account,
      ads: [],
    }));
  if (!report.account) throw new Error('Expected account evidence.');
  jest.mocked(readMetaReportPage).mockResolvedValue({
    ...report,
    ...metadata,
    ads: [{ ...report.account, ad_id: '9001' }],
    nextOffset: null,
  });
});

it('pins the real Meta account and timezone across evidence, metadata checks and exact ad selection', async () => {
  const state = fixture();
  const reference = { kind: 'META' as const, id: REPORT };
  const evidence = await state.service.read(
    state.manager,
    workspace,
    MEMBER,
    OTHER,
    reference,
  );
  const current = await state.service.read(
    state.manager,
    workspace,
    MEMBER,
    OTHER,
    reference,
    0,
    null,
    true,
  );
  const ad = await state.service.read(
    state.manager,
    workspace,
    MEMBER,
    OTHER,
    reference,
    0,
    '9001',
  );
  for (const source of [evidence, current, ad])
    expect(source.source).toMatchObject({
      accountId: report.accountId,
      timezone: report.timezone,
    });
  expect(current.fingerprint).toBe(evidence.fingerprint);
  expect(ad.fingerprint).toBe(evidence.fingerprint);
  expect(current.metrics).toEqual([]);
  expect(current.evidenceLoaded).toBe(false);
  expect(ad.metrics.some((metric) => metric.key.startsWith('ad:'))).toBe(true);
});

it('keeps a manual source account unknown and preserves its historical target without guessing an account', async () => {
  const state = fixture();
  const result = await state.service.read(
    state.manager,
    workspace,
    MEMBER,
    OTHER,
    { kind: 'MANUAL', id: REPORT },
  );
  expect(result.source).toMatchObject({ accountId: null, timezone: null });
  expect(result).toMatchObject({
    reportedGoalKind: 'LEADS',
    reportedTargetCostMicros: '25000000',
  });
  expect(
    result.metrics.find((metric) => metric.key === 'manual:qualifiedLeads')
      ?.goalKinds,
  ).toEqual(['QUALIFIED_LEADS']);
});

it('keeps source identity stable when an independent manager reviews an author manager draft', async () => {
  const state = fixture();
  const author = await state.service.read(
    state.manager,
    workspace,
    MEMBER,
    OTHER,
    { kind: 'MANUAL', id: REPORT },
  );
  expect(author.canReview).toBe(false);
  state.delivery.actor.mockResolvedValue({ ...state.actor, memberId: OTHER });
  const independent = await state.service.read(
    state.manager,
    workspace,
    OTHER,
    OTHER,
    { kind: 'MANUAL', id: REPORT },
  );
  state.delivery.actor.mockResolvedValue({
    ...state.actor,
    memberId: INDEPENDENT_MEMBER,
  });
  const manager = await state.service.read(
    state.manager,
    workspace,
    INDEPENDENT_MEMBER,
    OTHER,
    { kind: 'MANUAL', id: REPORT },
  );
  expect(manager.canReview).toBe(true);
  expect(manager.fingerprint).toBe(author.fingerprint);
  expect(independent.fingerprint).toBe(author.fingerprint);
});

it('does not disclose a follow-up draft ID to an approved source reader', async () => {
  const state = fixture();
  state.delivery.actor.mockResolvedValue({
    ...state.actor,
    isAdmin: false,
    isManager: false,
    capabilities: [],
  });
  const originalQuery = state.query.getMockImplementation();
  if (!originalQuery) throw new Error('Expected source query fixture.');
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT item.value-'history'"))
      return [{ record: { ...manual, status: 'APPROVED' } }];
    if (sql.includes('WITH packets AS'))
      return [
        {
          id: DRAFT,
          companyId: COMPANY,
          projectId: PROJECT,
          state: 'DRAFT',
          selection: 'DRAFT',
        },
        {
          id: ASSIGNED,
          companyId: COMPANY,
          projectId: PROJECT,
          state: 'ASSIGNED',
          selection: 'ASSIGNED',
        },
      ];
    return originalQuery(sql);
  });
  const source = await state.service.read(
    state.manager,
    workspace,
    MEMBER,
    OTHER,
    { kind: 'MANUAL', id: REPORT },
  );
  expect(source.currentDraftId).toBeNull();
  expect(source.latestAssignedId).toBe(ASSIGNED);
});

it('pages a mixed source library with explicit account and history markers without per-report reads', async () => {
  const state = fixture();
  const rows = Array.from({ length: 26 }, (_unused, index) => ({
    kind: index === 1 ? 'MANUAL' : 'META',
    id: `6d3de319-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title:
      index === 1 ? 'Manual campaign evidence' : 'Meta report · 2020-02-20',
    projectId: PROJECT,
    projectName: 'Owned campaign',
    channel: 'META',
    currency: 'USD',
    date: '2020-02-20',
    fromDate: '2020-02-20',
    throughDate: '2020-02-20',
    sourceStatus: 'APPROVED',
    sourceRevision: index === 1 ? '2' : null,
    accountId: index === 1 ? null : report.accountId,
    hasNewerVersion: index === 0,
    archived: index === 0,
    recordedAt: report.fetchedAt,
    legacyTaskId: null,
    currentDraftId: null,
    latestAssignedId: null,
  }));
  state.query
    .mockReset()
    .mockResolvedValueOnce([
      { ids: [PROJECT], fingerprint: 'current-projects' },
    ])
    .mockResolvedValueOnce([
      { totalCount: 26, fingerprint: 'visible-source-set' },
    ])
    .mockResolvedValueOnce(rows);
  const page = await state.service.list(
    state.manager,
    workspace,
    MEMBER,
    OTHER,
    {},
  );
  expect(page.totalCount).toBe(26);
  expect(page.items).toHaveLength(25);
  expect(page.nextCursor).not.toBeNull();
  expect(page.items[0]).toMatchObject({
    accountId: report.accountId,
    hasNewerVersion: true,
    archived: true,
  });
  expect(page.items[1]).toMatchObject({
    accountId: null,
    hasNewerVersion: false,
    archived: false,
  });
  expect(state.query).toHaveBeenCalledTimes(3);
  expect(readMetaReportSummary).not.toHaveBeenCalled();
  expect(readMetaReportPage).not.toHaveBeenCalled();
});
