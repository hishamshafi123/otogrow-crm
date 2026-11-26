import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DeliveryMetaReportEntity } from 'src/modules/delivery/advertising/entities/delivery-meta-report.entity';
import { DeliveryCommitmentAllocationEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-allocation.entity';
import { DeliveryCommitmentLineEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-line.entity';
import { DeliveryCommitmentPeriodEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-period.entity';
import { DeliveryContentAccountEntity } from 'src/modules/delivery/content/entities/delivery-content-account.entity';
import { DeliveryContentPlanEntity } from 'src/modules/delivery/content/entities/delivery-content-plan.entity';
import { DeliveryContentVariantEntity } from 'src/modules/delivery/content/entities/delivery-content-variant.entity';
import { DeliveryContentVersionEntity } from 'src/modules/delivery/content/entities/delivery-content-version.entity';
import { DeliveryClientPortalV2Service } from 'src/modules/delivery/deliverables/delivery-client-portal-v2.service';
import { signClientPortalV2Session } from 'src/modules/delivery/deliverables/delivery-deliverables.policy';
import { DeliveryClientDriveMappingEntity } from 'src/modules/delivery/deliverables/entities/delivery-client-drive-mapping.entity';
import { DeliveryClientPortalAccessEntity } from 'src/modules/delivery/deliverables/entities/delivery-client-portal-access.entity';
import { DeliveryContentMetricSnapshotEntity } from 'src/modules/delivery/deliverables/entities/delivery-content-metric-snapshot.entity';
import { DeliveryDeliverableEntity } from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import { DeliveryDeliverableReviewEntity } from 'src/modules/delivery/deliverables/entities/delivery-deliverable-review.entity';
import { DeliveryVideoHookVariationEntity } from 'src/modules/delivery/deliverables/entities/delivery-video-hook-variation.entity';
import { DeliveryReleaseEntity } from 'src/modules/delivery/development/entities/delivery-release.entity';
import { DeliveryReleaseVersionEntity } from 'src/modules/delivery/development/entities/delivery-release-version.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryKnowledgeSourceEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-source.entity';
import { DeliveryKnowledgeVersionEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-version.entity';
import { DeliveryClientSetupEntity } from 'src/modules/delivery/onboarding/entities/delivery-client-setup.entity';
import { DeliverySeoReportEntity } from 'src/modules/delivery/seo-results/entities/delivery-seo-report.entity';
import { DeliverySeoVersionEntity } from 'src/modules/delivery/seo-results/entities/delivery-seo-version.entity';

describe('DeliveryClientPortalV2Service', () => {
  const secret = 'test-app-secret-for-portal-v2-1234567890';
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const otherCompanyId = '33333333-3333-4333-8333-333333333333';
  const accessId = '44444444-4444-4444-8444-444444444444';
  const projectId = '55555555-5555-4555-8555-555555555555';
  const deliverableId = '66666666-6666-4666-8666-666666666666';
  const variationId = '77777777-7777-4777-8777-777777777777';

  const makeAccess = (
    overrides: Partial<DeliveryClientPortalAccessEntity> = {},
  ): DeliveryClientPortalAccessEntity =>
    ({
      id: accessId,
      workspaceId,
      companyId,
      slug: 'acme-dental',
      codeHash: 'hash',
      encryptedCode: 'enc',
      codeSetAt: new Date('2026-11-25T10:00:00.000Z'),
      expiresAt: null,
      revokedAt: null,
      lastAccessedAt: null,
      brandLogoAssetId: null,
      brandAccentColor: '#2563EB',
      welcomeNote: 'Welcome to Acme Dental Portal',
      showDriveLinks: true,
      visibleServiceOverrides: {},
      ...overrides,
    }) as DeliveryClientPortalAccessEntity;

  const createHarness = (opts: {
    accessRow?: DeliveryClientPortalAccessEntity | null;
    deliverables?: Partial<DeliveryDeliverableEntity>[];
    variations?: Partial<DeliveryVideoHookVariationEntity>[];
    reviews?: Partial<DeliveryDeliverableReviewEntity>[];
    metaReports?: Partial<DeliveryMetaReportEntity>[];
    engagements?: Array<Record<string, unknown>>;
    metricSnapshots?: Partial<DeliveryContentMetricSnapshotEntity>[];
    knowledgeSources?: Partial<DeliveryKnowledgeSourceEntity>[];
    knowledgeVersions?: Partial<DeliveryKnowledgeVersionEntity>[];
  }) => {
    const savedReviews: Array<Record<string, unknown>> = [];
    const savedDeliverables: Array<Record<string, unknown>> = [];
    const savedVariations: Array<Record<string, unknown>> = [];

    const repoMap = new Map<unknown, Record<string, jest.Mock>>();
    const emptyRepo = () => ({
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async (x) => x),
      create: jest.fn().mockImplementation((x) => x),
    });

    repoMap.set(DeliveryClientPortalAccessEntity, {
      ...emptyRepo(),
      findOne: jest.fn().mockResolvedValue(opts.accessRow ?? null),
    });
    repoMap.set(DeliveryClientSetupEntity, {
      ...emptyRepo(),
      findOne: jest.fn().mockResolvedValue({
        source: { companyName: 'Acme Dental' },
      }),
    });
    repoMap.set(DeliveryProjectEntity, {
      ...emptyRepo(),
      find: jest.fn().mockResolvedValue([{ id: projectId, name: 'Acme Dental', companyId }]),
      findOne: jest.fn().mockResolvedValue({ id: projectId, name: 'Acme Dental', companyId }),
    });
    repoMap.set(DeliveryOperationsEntity, {
      ...emptyRepo(),
      findOne: jest.fn().mockResolvedValue({
        state: {
          clients: {
            engagements: opts.engagements ?? [
              {
                id: '88888888-8888-4888-8888-888888888888',
                companyId,
                name: 'Acme Dental',
                services: ['AI Videos', 'Meta Ads'],
                advertising: { currency: 'USD', channel: 'META' },
              },
            ],
          },
        },
      }),
    });
    repoMap.set(DeliveryClientDriveMappingEntity, {
      ...emptyRepo(),
      findOne: jest.fn().mockResolvedValue({ rootFolderId: 'drive-root-123' }),
    });
    repoMap.set(DeliveryDeliverableEntity, {
      ...emptyRepo(),
      find: jest.fn().mockResolvedValue(opts.deliverables ?? []),
      findOne: jest.fn().mockImplementation(async ({ where }) => {
        const list = opts.deliverables ?? [];
        return (
          list.find(
            (d) =>
              d.id === where.id &&
              d.workspaceId === where.workspaceId &&
              d.companyId === where.companyId &&
              d.clientVisibility === 'PUBLISHED' &&
              (!where.status || d.status === where.status),
          ) ?? null
        );
      }),
      save: jest.fn().mockImplementation(async (row) => {
        savedDeliverables.push(row);
        return row;
      }),
    });
    repoMap.set(DeliveryVideoHookVariationEntity, {
      ...emptyRepo(),
      find: jest.fn().mockResolvedValue(opts.variations ?? []),
      findOne: jest.fn().mockImplementation(async ({ where }) => {
        const list = opts.variations ?? [];
        return (
          list.find(
            (v) =>
              v.id === where.id &&
              v.workspaceId === where.workspaceId &&
              (!where.deliverableId || v.deliverableId === where.deliverableId) &&
              v.clientVisibility === 'PUBLISHED' &&
              (!where.renderStatus || v.renderStatus === where.renderStatus),
          ) ?? null
        );
      }),
      save: jest.fn().mockImplementation(async (row) => {
        savedVariations.push(row);
        return row;
      }),
    });
    repoMap.set(DeliveryDeliverableReviewEntity, {
      ...emptyRepo(),
      find: jest.fn().mockImplementation(async ({ where }) =>
        (opts.reviews ?? []).filter(
          (r) => !where.authorType || r.authorType === where.authorType,
        ),
      ),
      create: jest.fn().mockImplementation((x) => ({
        id: '99999999-9999-4999-8999-999999999999',
        createdAt: new Date('2026-11-26T12:00:00.000Z'),
        ...x,
      })),
      save: jest.fn().mockImplementation(async (row) => {
        savedReviews.push(row);
        return row;
      }),
    });
    repoMap.set(DeliveryContentMetricSnapshotEntity, {
      ...emptyRepo(),
      find: jest.fn().mockResolvedValue(opts.metricSnapshots ?? []),
    });
    repoMap.set(DeliveryMetaReportEntity, {
      ...emptyRepo(),
      find: jest.fn().mockResolvedValue(opts.metaReports ?? []),
    });
    repoMap.set(DeliveryKnowledgeSourceEntity, {
      ...emptyRepo(),
      find: jest.fn().mockResolvedValue(opts.knowledgeSources ?? []),
    });
    repoMap.set(DeliveryKnowledgeVersionEntity, {
      ...emptyRepo(),
      find: jest.fn().mockResolvedValue(opts.knowledgeVersions ?? []),
    });

    for (const entity of [
      DeliveryCommitmentPeriodEntity,
      DeliveryCommitmentLineEntity,
      DeliveryCommitmentAllocationEntity,
      DeliveryContentVariantEntity,
      DeliveryContentVersionEntity,
      DeliveryContentAccountEntity,
      DeliveryContentPlanEntity,
      DeliverySeoReportEntity,
      DeliverySeoVersionEntity,
      DeliveryReleaseEntity,
      DeliveryReleaseVersionEntity,
    ]) {
      repoMap.set(entity, emptyRepo());
    }

    const dataSource = {
      getRepository: jest.fn().mockImplementation((entity) => {
        return repoMap.get(entity) ?? emptyRepo();
      }),
      transaction: jest.fn().mockImplementation(async (fn) =>
        fn({
          queryRunner: { isTransactionActive: true },
          query: jest.fn().mockResolvedValue([]),
          getRepository: jest.fn().mockImplementation((entity) => {
            return repoMap.get(entity) ?? {
              ...emptyRepo(),
              findOneByOrFail: jest.fn().mockResolvedValue({
                id: workspaceId,
                databaseSchema: 'workspace_test',
              }),
              insert: jest.fn().mockResolvedValue({}),
            };
          }),
        }),
      ),
    };

    const portalAccess = {
      verifyPortalLogin: jest.fn(),
      verifyByAccessCodeOnly: jest.fn(),
    };
    const config = {
      get: jest.fn().mockReturnValue(secret),
    };

    const service = new DeliveryClientPortalV2Service(
      dataSource as never,
      portalAccess as never,
      config as never,
    );

    return {
      service,
      savedReviews,
      savedDeliverables,
      savedVariations,
    };
  };

  it('immediately invalidates session cookies when access code is rotated or revoked', async () => {
    const originalDate = new Date('2026-11-25T10:00:00.000Z');
    const cookie = signClientPortalV2Session(secret, {
      aid: accessId,
      cid: companyId,
      wid: workspaceId,
      rot: originalDate.toISOString(),
    });

    // Valid before rotation
    const validHarness = createHarness({
      accessRow: makeAccess({ codeSetAt: originalDate }),
    });
    const verified = await validHarness.service.verifySessionCookie(cookie);
    expect(verified.access.companyId).toBe(companyId);

    // Invalid immediately after code rotation
    const rotatedHarness = createHarness({
      accessRow: makeAccess({
        codeSetAt: new Date('2026-11-26T09:00:00.000Z'),
      }),
    });
    await expect(
      rotatedHarness.service.verifySessionCookie(cookie),
    ).rejects.toThrow(UnauthorizedException);

    // Invalid immediately after revocation
    const revokedHarness = createHarness({
      accessRow: makeAccess({
        codeSetAt: originalDate,
        revokedAt: new Date('2026-11-26T10:00:00.000Z'),
      }),
    });
    await expect(
      revokedHarness.service.verifySessionCookie(cookie),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('builds dynamic service tabs only for active services and strips internal agency fields and Drive links when disabled', async () => {
    const access = makeAccess({
      showDriveLinks: false,
      visibleServiceOverrides: { seo: false },
    });
    const { service } = createHarness({
      accessRow: access,
      deliverables: [
        {
          id: deliverableId,
          workspaceId,
          companyId,
          serviceKey: 'ai_videos',
          monthKey: '2026-11',
          sequenceNumber: 1,
          title: 'UGC Ad #1',
          description: 'Primary hook test',
          assetKind: 'VIDEO',
          mimeType: 'video/mp4',
          sizeBytes: '123456',
          mediaMeta: { width: 1080, height: 1920, durationSec: 20 },
          storageKey: 'ws/video1.mp4',
          thumbnailKey: 'ws/video1.thumb.jpg',
          driveFileId: 'drive-v1',
          driveWebUrl: 'https://drive.google.com/file/d/drive-v1/view',
          driveFolderId: 'folder-1',
          storageState: 'LOCAL',
          status: 'APPROVED',
          clientVisibility: 'PUBLISHED',
          clientApprovalStatus: 'PENDING',
          hasVariations: true,
          publishedAt: new Date('2026-11-25T12:00:00.000Z'),
          createdAt: new Date('2026-11-25T11:00:00.000Z'),
        },
      ],
      variations: [
        {
          id: variationId,
          workspaceId,
          deliverableId,
          variationNumber: 1,
          hookText: 'Stop scrolling right now',
          angleTag: 'Curiosity',
          outputSizeBytes: '99999',
          thumbnailKey: 'ws/v1.thumb.jpg',
          driveWebUrl: 'https://drive.google.com/file/d/var-1/view',
          storageState: 'LOCAL',
          renderStatus: 'READY',
          clientVisibility: 'PUBLISHED',
          clientApprovalStatus: 'PENDING',
        },
      ],
      reviews: [
        {
          id: 'r1',
          deliverableId,
          variationId: null,
          authorName: 'Internal PM',
          authorType: 'STAFF',
          decision: 'COMMENT',
          comment: 'SECRET INTERNAL AGENCY MARGIN NOTE',
          timestampSec: null,
          createdAt: new Date('2026-11-25T12:05:00.000Z'),
        },
        {
          id: 'r2',
          deliverableId,
          variationId: null,
          authorName: 'Sarah',
          authorType: 'CLIENT',
          decision: 'COMMENT',
          comment: 'Looks great so far!',
          timestampSec: 3.5,
          createdAt: new Date('2026-11-25T12:10:00.000Z'),
        },
      ],
      metaReports: [
        {
          id: 'meta-1',
          workspaceId,
          projectId,
          date: '2026-11-25',
          status: 'APPROVED',
          archivedAt: null,
          report: {
            id: 'meta-1',
            accountId: '123456',
            projectId,
            managerId: 'secret-manager-id',
            marketerId: 'secret-marketer-id',
            date: '2026-11-25',
            currency: 'USD',
            timezone: 'UTC',
            fetchedAt: '2026-11-25T00:00:00Z',
            status: 'APPROVED',
            reviewedBy: 'secret-reviewer',
            reviewedAt: '2026-11-25T01:00:00Z',
            note: 'INTERNAL AGENCY NOTE DO NOT SHARE',
            taskId: 'secret-task',
            account: {
              date_start: '2026-11-25',
              date_stop: '2026-11-25',
              account_id: '123456',
              spend: '250.00',
              impressions: '12000',
              clicks: '360',
              actions: [{ action_type: 'lead', value: '18' }],
              action_values: [{ action_type: 'purchase', value: '1000.00' }],
            },
            ads: [],
          },
        },
      ],
    });

    const dash = await service.getDashboard(
      access,
      {
        v: 1,
        aid: accessId,
        cid: companyId,
        wid: workspaceId,
        rot: access.codeSetAt.toISOString(),
        exp: Date.now() + 60_000,
      },
      '2026-11',
    );

    const tabKeys = dash.tabs.map((t) => t.key);
    expect(tabKeys).toEqual(['overview', 'ai_videos', 'paid_ads']);
    expect(dash.client.driveRootFolderUrl).toBeNull();
    expect(dash.aiVideos[0]?.driveWebUrl).toBeNull();
    expect(dash.aiVideos[0]?.variations[0]?.driveWebUrl).toBeNull();

    // Zero internal agency note leaks
    const serialized = JSON.stringify(dash);
    expect(serialized).not.toContain('SECRET INTERNAL AGENCY MARGIN NOTE');
    expect(serialized).not.toContain('INTERNAL AGENCY NOTE DO NOT SHARE');
    expect(serialized).not.toContain('secret-manager-id');
    expect(dash.aiVideos[0]?.reviews).toHaveLength(1);
    expect(dash.paidAds.summary.spend).toBe(250);
    expect(dash.paidAds.summary.leads).toBe(18);
    expect(dash.paidAds.summary.roas).toBe(4);
  });

  it('blocks cross-company IDOR and unpublished media access on client media & review endpoints', async () => {
    const access = makeAccess();
    const { service, savedReviews, savedDeliverables } = createHarness({
      accessRow: access,
      deliverables: [
        {
          id: deliverableId,
          workspaceId,
          companyId: otherCompanyId, // Different client!
          clientVisibility: 'PUBLISHED',
          status: 'APPROVED',
          clientApprovalStatus: 'PENDING',
        },
      ],
    });

    await expect(
      service.authorizeClientDeliverableMedia(access, deliverableId),
    ).rejects.toThrow(NotFoundException);

    await expect(
      service.submitClientReview(
        access,
        {
          v: 1,
          aid: accessId,
          cid: companyId,
          wid: workspaceId,
          rot: access.codeSetAt.toISOString(),
          exp: Date.now() + 60_000,
        },
        deliverableId,
        { decision: 'APPROVED', comment: 'Nice!' },
      ),
    ).rejects.toThrow(NotFoundException);

    expect(savedReviews).toHaveLength(0);
    expect(savedDeliverables).toHaveLength(0);
  });

  it('persists client reviews with real recordOtogrowActivity and rolls up variation approval onto parent deliverable', async () => {
    const access = makeAccess();
    const deliverable: Partial<DeliveryDeliverableEntity> = {
      id: deliverableId,
      workspaceId,
      companyId,
      serviceKey: 'ai_videos',
      monthKey: '2026-11',
      sequenceNumber: 1,
      title: 'UGC Ad #1',
      assetKind: 'VIDEO',
      status: 'APPROVED',
      clientVisibility: 'PUBLISHED',
      clientApprovalStatus: 'PENDING',
    };
    const variation: Partial<DeliveryVideoHookVariationEntity> = {
      id: variationId,
      workspaceId,
      deliverableId,
      variationNumber: 1,
      hookText: 'Hook v1',
      renderStatus: 'READY',
      clientVisibility: 'PUBLISHED',
      clientApprovalStatus: 'PENDING',
    };

    const { service, savedReviews, savedDeliverables, savedVariations } =
      createHarness({
        accessRow: access,
        deliverables: [deliverable],
        variations: [variation],
      });

    const result = await service.submitClientReview(
      access,
      {
        v: 1,
        aid: accessId,
        cid: companyId,
        wid: workspaceId,
        rot: access.codeSetAt.toISOString(),
        exp: Date.now() + 60_000,
        name: 'Sarah',
      },
      deliverableId,
      {
        decision: 'APPROVED',
        comment: 'Ship v1!',
        variationId,
        timestampSec: 2.5,
      },
    );

    expect(result.review.decision).toBe('APPROVED');
    expect(savedReviews).toHaveLength(1);
    expect(savedVariations).toHaveLength(1);
    expect(savedVariations[0]?.clientApprovalStatus).toBe('APPROVED');
    // Parent deliverable rolled up to APPROVED once all published variations are APPROVED
    expect(savedDeliverables).toHaveLength(1);
    expect(savedDeliverables[0]?.clientApprovalStatus).toBe('APPROVED');
  });

  it('strips disabled service section payloads when visibleServiceOverrides sets a service to false', async () => {
    const access = makeAccess({
      visibleServiceOverrides: { paid_ads: false },
    });
    const { service } = createHarness({
      accessRow: access,
      metaReports: [
        {
          id: 'meta-disabled-1',
          workspaceId,
          projectId,
          date: '2026-11-25',
          status: 'APPROVED',
          archivedAt: null,
          report: {
            id: 'meta-disabled-1',
            accountId: '999',
            projectId,
            managerId: 'mgr-1',
            marketerId: 'mkt-1',
            date: '2026-11-25',
            currency: 'USD',
            timezone: 'UTC',
            fetchedAt: '2026-11-25T00:00:00Z',
            status: 'APPROVED',
            reviewedBy: 'rev-1',
            reviewedAt: '2026-11-25T01:00:00Z',
            note: '',
            taskId: 'task-1',
            account: {
              date_start: '2026-11-25',
              date_stop: '2026-11-25',
              account_id: '999',
              spend: '500.00',
              impressions: '20000',
              clicks: '400',
              actions: [{ action_type: 'lead', value: '25' }],
              action_values: [{ action_type: 'purchase', value: '2500.00' }],
            },
            ads: [],
          },
        },
      ],
    });

    const dash = await service.getDashboard(
      access,
      {
        v: 1,
        aid: accessId,
        cid: companyId,
        wid: workspaceId,
        rot: access.codeSetAt.toISOString(),
        exp: Date.now() + 60_000,
      },
      '2026-11',
    );

    expect(dash.tabs.map((t) => t.key)).not.toContain('paid_ads');
    expect(dash.paidAds.summary.spend).toBe(0);
    expect(dash.paidAds.dailyReports).toHaveLength(0);
    expect(dash.paidAds.campaigns).toHaveLength(0);
  });

  it('returns uniform non-identifying info for revoked or expired portals on getPublicPortalInfo', async () => {
    const revokedAccess = makeAccess({
      revokedAt: new Date('2026-11-26T00:00:00.000Z'),
    });
    const { service } = createHarness({ accessRow: revokedAccess });

    const info = await service.getPublicPortalInfo('acme-dental');
    expect(info.exists).toBe(false);
    expect(info.active).toBe(false);
    expect(info.displayName).toBe('Client Dashboard');
    expect(info.welcomeNote).toBe('');
  });

  it('requires explicit opt-in for Brand Vault and excludes internal PROMPT and MEETING categories', async () => {
    const knowledgeSources: Partial<DeliveryKnowledgeSourceEntity>[] = [
      {
        id: 'ks-brand',
        workspaceId,
        projectId,
        publishedVersion: 1,
        publishedAt: new Date('2026-11-20T00:00:00.000Z'),
      },
      {
        id: 'ks-prompt',
        workspaceId,
        projectId,
        publishedVersion: 1,
        publishedAt: new Date('2026-11-20T00:00:00.000Z'),
      },
      {
        id: 'ks-meeting',
        workspaceId,
        projectId,
        publishedVersion: 1,
        publishedAt: new Date('2026-11-20T00:00:00.000Z'),
      },
    ];
    const knowledgeVersions: Partial<DeliveryKnowledgeVersionEntity>[] = [
      {
        id: 'kv-brand',
        workspaceId,
        sourceId: 'ks-brand',
        version: 1,
        title: 'Brand Voice Guide',
        category: 'BRAND_FACTS',
        meetingDate: '2026-11-19',
        knowledge: 'Warm, confident clinical voice.',
      },
      {
        id: 'kv-prompt',
        workspaceId,
        sourceId: 'ks-prompt',
        version: 1,
        title: 'Internal AI Prompt Engineering',
        category: 'PROMPT',
        meetingDate: '2026-11-19',
        knowledge: 'SECRET PROMPT',
      },
      {
        id: 'kv-meeting',
        workspaceId,
        sourceId: 'ks-meeting',
        version: 1,
        title: 'Internal Margin Review Notes',
        category: 'MEETING',
        meetingDate: '2026-11-19',
        knowledge: 'SECRET MEETING',
      },
    ];

    // Default (no opt-in): Brand Vault is hidden and empty
    const defaultAccess = makeAccess({ visibleServiceOverrides: {} });
    const defaultHarness = createHarness({
      accessRow: defaultAccess,
      knowledgeSources,
      knowledgeVersions,
    });
    const defaultDash = await defaultHarness.service.getDashboard(
      defaultAccess,
      {
        v: 1,
        aid: accessId,
        cid: companyId,
        wid: workspaceId,
        rot: defaultAccess.codeSetAt.toISOString(),
        exp: Date.now() + 60_000,
      },
      '2026-11',
    );
    expect(defaultDash.tabs.map((t) => t.key)).not.toContain('brand_vault');
    expect(defaultDash.brandVault).toHaveLength(0);

    // Explicit opt-in: Brand Vault shows BRAND doc only, never PROMPT or MEETING
    const optInAccess = makeAccess({
      visibleServiceOverrides: { brand_vault: true },
    });
    const optInHarness = createHarness({
      accessRow: optInAccess,
      knowledgeSources,
      knowledgeVersions,
    });
    const optInDash = await optInHarness.service.getDashboard(
      optInAccess,
      {
        v: 1,
        aid: accessId,
        cid: companyId,
        wid: workspaceId,
        rot: optInAccess.codeSetAt.toISOString(),
        exp: Date.now() + 60_000,
      },
      '2026-11',
    );
    expect(optInDash.tabs.map((t) => t.key)).toContain('brand_vault');
    expect(optInDash.brandVault).toHaveLength(1);
    expect(optInDash.brandVault[0]?.title).toBe('Brand Voice Guide');
    const serialized = JSON.stringify(optInDash);
    expect(serialized).not.toContain('SECRET PROMPT');
    expect(serialized).not.toContain('SECRET MEETING');
  });
});
