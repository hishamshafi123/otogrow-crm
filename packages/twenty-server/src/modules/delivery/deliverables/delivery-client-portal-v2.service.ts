import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not } from 'typeorm';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { DeliveryMetaReportEntity } from 'src/modules/delivery/advertising/entities/delivery-meta-report.entity';
import { type MetaInsightRow } from 'src/modules/delivery/advertising/delivery-meta.types';
import { DeliveryCommitmentAllocationEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-allocation.entity';
import { DeliveryCommitmentLineEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-line.entity';
import { DeliveryCommitmentPeriodEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-period.entity';
import { DeliveryContentAccountEntity } from 'src/modules/delivery/content/entities/delivery-content-account.entity';
import { DeliveryContentPlanEntity } from 'src/modules/delivery/content/entities/delivery-content-plan.entity';
import { DeliveryContentVariantEntity } from 'src/modules/delivery/content/entities/delivery-content-variant.entity';
import { DeliveryContentVersionEntity } from 'src/modules/delivery/content/entities/delivery-content-version.entity';
import { DeliveryClientPortalAccessService } from 'src/modules/delivery/deliverables/delivery-client-portal-access.service';
import {
  clientPortalAuthenticateSchema,
  clientPortalReviewSchema,
  type ClientPortalV2SessionPayload,
  currentMonthKey,
  isUuidString,
  MONTH_KEY_REGEX,
  signClientPortalV2Session,
  verifyClientPortalV2Session,
} from 'src/modules/delivery/deliverables/delivery-deliverables.policy';
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
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

export type ClientDashboardTabKey =
  | 'overview'
  | 'ai_videos'
  | 'social'
  | 'static_ads'
  | 'paid_ads'
  | 'seo'
  | 'development'
  | 'commitments'
  | 'brand_vault';

export type ClientDashboardTab = {
  key: ClientDashboardTabKey;
  label: string;
  badgeCount: number;
};

export type ClientDashboardKpi = {
  key: string;
  label: string;
  value: string;
  sublabel: string;
  tab: ClientDashboardTabKey;
};

export type ClientPublicPortalInfoDTO = {
  exists: boolean;
  active: boolean;
  slug: string;
  displayName: string;
  welcomeNote: string;
  brandAccentColor: string | null;
};

export type ClientPortalDeliverableVariationDTO = {
  id: string;
  variationNumber: number;
  label: string;
  hookText: string;
  angleTag: string;
  outputSizeBytes: number;
  hasThumbnail: boolean;
  streamUrl: string;
  downloadUrl: string;
  thumbnailUrl: string | null;
  driveWebUrl: string | null;
  storageState: string;
  clientApprovalStatus: string;
};

export type ClientPortalReviewDTO = {
  id: string;
  variationId: string | null;
  authorName: string;
  authorType: string;
  decision: string;
  comment: string;
  timestampSec: number | null;
  createdAt: string;
};

export type ClientPortalDeliverableDTO = {
  id: string;
  serviceKey: string;
  serviceLabel: string;
  monthKey: string;
  sequenceNumber: number;
  title: string;
  description: string;
  assetKind: string;
  mimeType: string | null;
  sizeBytes: number;
  mediaMeta: Record<string, unknown>;
  externalUrl: string | null;
  hasThumbnail: boolean;
  streamUrl: string | null;
  downloadUrl: string | null;
  thumbnailUrl: string | null;
  driveWebUrl: string | null;
  driveFolderWebUrl: string | null;
  storageState: string;
  status: string;
  hasVariations: boolean;
  publishedAt: string | null;
  createdAt: string;
  variations: ClientPortalDeliverableVariationDTO[];
  reviews: ClientPortalReviewDTO[];
};

const prettifySlug = (slug: string): string =>
  slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const parseNumeric = (value: string | number | null | undefined): number => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const sumMetaAction = (
  actions: MetaInsightRow['actions'] | undefined,
  types: string[],
): number => {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const action of actions) {
    if (types.includes(action.action_type)) {
      total += parseNumeric(action.value);
    }
  }
  return total;
};

const formatCompactNumber = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return Math.round(value).toLocaleString('en-US');
};

const formatCurrencyValue = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency || 'USD'} ${amount.toFixed(2)}`;
  }
};

const SERVICE_LABEL_MAP: Record<string, string> = {
  ai_videos: 'AI Videos',
  video: 'Videos',
  ugc_video: 'UGC Videos',
  social_media: 'Social Content',
  content: 'Social Content',
  static_ads: 'Static Ads',
  creative: 'Creative',
  design: 'Design',
  paid_ads: 'Paid Ads',
  meta_ads: 'Meta Ads',
  seo: 'SEO',
  development: 'Development',
  web_development: 'Web & App',
  brand: 'Brand',
};

const toServiceLabel = (key: string): string => {
  const normalized = key.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (SERVICE_LABEL_MAP[normalized]) return SERVICE_LABEL_MAP[normalized];
  return key
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const matchesAnyPattern = (values: string[], patterns: RegExp[]): boolean =>
  values.some((value) => patterns.some((rx) => rx.test(value)));

@Injectable()
export class DeliveryClientPortalV2Service {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly portalAccess: DeliveryClientPortalAccessService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  private cookieSecret(): string {
    return this.twentyConfigService.get('APP_SECRET') || '';
  }

  private async resolveClientDisplayName(
    workspaceId: string,
    companyId: string,
    fallbackSlug: string,
  ): Promise<string> {
    const [setup, project, ops] = await Promise.all([
      this.dataSource.getRepository(DeliveryClientSetupEntity).findOne({
        where: { workspaceId, companyId },
        order: { createdAt: 'DESC' },
      }),
      this.dataSource.getRepository(DeliveryProjectEntity).findOne({
        where: { workspaceId, companyId },
        order: { createdAt: 'DESC' },
      }),
      this.dataSource.getRepository(DeliveryOperationsEntity).findOne({
        where: { workspaceId },
      }),
    ]);

    if (setup?.source?.companyName?.trim()) {
      return setup.source.companyName.trim();
    }
    const matchingEngagement = ops?.state?.clients?.engagements?.find(
      (eng) => eng.companyId === companyId && eng.name?.trim(),
    );
    if (matchingEngagement?.name?.trim()) {
      return matchingEngagement.name.trim();
    }
    if (project?.name?.trim()) {
      return project.name.trim();
    }
    return prettifySlug(fallbackSlug) || 'Client Dashboard';
  }

  async getPublicPortalInfo(slug: string): Promise<ClientPublicPortalInfoDTO> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug || !/^[a-z0-9-]+$/.test(normalizedSlug)) {
      return {
        exists: false,
        active: false,
        slug: normalizedSlug,
        displayName: 'Client Dashboard',
        welcomeNote: '',
        brandAccentColor: null,
      };
    }

    const row = await this.dataSource
      .getRepository(DeliveryClientPortalAccessEntity)
      .findOne({ where: { slug: normalizedSlug } });

    if (!row) {
      return {
        exists: false,
        active: false,
        slug: normalizedSlug,
        displayName: 'Client Dashboard',
        welcomeNote: '',
        brandAccentColor: null,
      };
    }

    const isExpired = row.expiresAt
      ? row.expiresAt.getTime() <= Date.now()
      : false;
    const active = !row.revokedAt && !isExpired;
    if (!active) {
      return {
        exists: false,
        active: false,
        slug: normalizedSlug,
        displayName: 'Client Dashboard',
        welcomeNote: '',
        brandAccentColor: null,
      };
    }

    const displayName = await this.resolveClientDisplayName(
      row.workspaceId,
      row.companyId,
      row.slug,
    );

    return {
      exists: true,
      active: true,
      slug: row.slug,
      displayName,
      welcomeNote: row.welcomeNote,
      brandAccentColor: row.brandAccentColor,
    };
  }

  async authenticate(rawBody: unknown): Promise<{
    cookieToken: string;
    access: DeliveryClientPortalAccessEntity;
    slug: string;
    displayName: string;
    stakeholderName: string | null;
  }> {
    const parsed = clientPortalAuthenticateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Enter a valid access code.',
      );
    }
    const { slug, accessCode, stakeholderName } = parsed.data;
    const access = slug
      ? await this.portalAccess.verifyPortalLogin(slug, accessCode)
      : await this.portalAccess.verifyByAccessCodeOnly(accessCode);

    if (!access) {
      throw new UnauthorizedException(
        'Invalid or expired access code. Check your code or ask your account manager.',
      );
    }

    const secret = this.cookieSecret();
    if (!secret) {
      throw new UnauthorizedException('Portal authentication is unavailable.');
    }

    const cleanName = stakeholderName?.trim() || undefined;
    const cookieToken = signClientPortalV2Session(secret, {
      aid: access.id,
      cid: access.companyId,
      wid: access.workspaceId,
      rot: access.codeSetAt.toISOString(),
      name: cleanName,
    });

    const displayName = await this.resolveClientDisplayName(
      access.workspaceId,
      access.companyId,
      access.slug,
    );

    return {
      cookieToken,
      access,
      slug: access.slug,
      displayName,
      stakeholderName: cleanName ?? null,
    };
  }

  async verifySessionCookie(cookieValue: string | undefined): Promise<{
    access: DeliveryClientPortalAccessEntity;
    session: ClientPortalV2SessionPayload;
  }> {
    const secret = this.cookieSecret();
    const session = verifyClientPortalV2Session(secret, cookieValue);
    if (!session) {
      throw new UnauthorizedException('Sign in with your client access code.');
    }

    const access = await this.dataSource
      .getRepository(DeliveryClientPortalAccessEntity)
      .findOne({
        where: {
          id: session.aid,
          workspaceId: session.wid,
          companyId: session.cid,
        },
      });

    if (!access) {
      throw new UnauthorizedException('Client portal access is no longer valid.');
    }
    if (access.revokedAt) {
      throw new UnauthorizedException('This portal access code has been revoked.');
    }
    if (access.expiresAt && access.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('This portal access code has expired.');
    }
    // Immediate invalidation whenever a manager rotates or sets a new access code.
    if (access.codeSetAt.toISOString() !== session.rot) {
      throw new UnauthorizedException(
        'Your access code was updated. Please enter the new code.',
      );
    }

    return { access, session };
  }

  async getDashboard(
    access: DeliveryClientPortalAccessEntity,
    session: ClientPortalV2SessionPayload,
    requestedMonthKey?: string,
  ) {
    const workspaceId = access.workspaceId;
    const companyId = access.companyId;
    const showDriveLinks = Boolean(access.showDriveLinks);

    const [
      displayName,
      projects,
      ops,
      driveMapping,
      allPublishedDeliverables,
      allMetricSnapshots,
      allCommitments,
    ] = await Promise.all([
      this.resolveClientDisplayName(workspaceId, companyId, access.slug),
      this.dataSource.getRepository(DeliveryProjectEntity).find({
        where: { workspaceId, companyId },
      }),
      this.dataSource.getRepository(DeliveryOperationsEntity).findOne({
        where: { workspaceId },
      }),
      this.dataSource.getRepository(DeliveryClientDriveMappingEntity).findOne({
        where: { workspaceId, companyId },
      }),
      this.dataSource.getRepository(DeliveryDeliverableEntity).find({
        where: {
          workspaceId,
          companyId,
          clientVisibility: 'PUBLISHED',
          status: 'APPROVED',
        },
        order: { monthKey: 'DESC', sequenceNumber: 'DESC', createdAt: 'DESC' },
        take: 400,
      }),
      this.dataSource.getRepository(DeliveryContentMetricSnapshotEntity).find({
        where: { workspaceId, companyId },
        order: { observedAt: 'DESC', createdAt: 'DESC' },
        take: 300,
      }),
      this.dataSource.getRepository(DeliveryCommitmentPeriodEntity).find({
        where: { workspaceId, clientId: companyId },
        order: { startDate: 'DESC' },
        take: 24,
      }),
    ]);

    const overrides = access.visibleServiceOverrides ?? {};
    const projectIds = projects.map((p) => p.id);
    const engagements = (ops?.state?.clients?.engagements ?? []).filter(
      (eng) => eng.companyId === companyId,
    );
    const engagementIds = engagements.map((eng) => eng.id);
    const engagementServices = Array.from(
      new Set(
        engagements.flatMap((eng) =>
          (eng.services ?? []).map((s) => s.trim()).filter(Boolean),
        ),
      ),
    );
    const hasAdvertisingEngagement = engagements.some((eng) =>
      Boolean(eng.advertising),
    );

    const deliverableIds = allPublishedDeliverables.map((d) => d.id);

    const loadApprovedMetaReports = async (): Promise<
      DeliveryMetaReportEntity[]
    > => {
      if (
        overrides.paid_ads === false ||
        (projectIds.length === 0 && engagementIds.length === 0)
      ) {
        return [];
      }
      const repo = this.dataSource.getRepository(DeliveryMetaReportEntity);
      if (typeof repo.createQueryBuilder === 'function') {
        const qb = repo
          .createQueryBuilder('r')
          .where('r."workspaceId" = :workspaceId', { workspaceId })
          .andWhere('r.status = :status', { status: 'APPROVED' })
          .andWhere('r."archivedAt" IS NULL');
        const conditions: string[] = [];
        const params: Record<string, unknown> = {};
        if (projectIds.length > 0) {
          conditions.push('r."projectId" IN (:...projectIds)');
          params.projectIds = projectIds;
        }
        if (engagementIds.length > 0) {
          conditions.push("r.report->>'engagementId' IN (:...engagementIds)");
          params.engagementIds = engagementIds;
        }
        qb.andWhere(`(${conditions.join(' OR ')})`, params);
        return qb.orderBy('r.date', 'DESC').take(180).getMany();
      }
      const rows = await repo.find({
        where: { workspaceId, status: 'APPROVED', archivedAt: IsNull() },
        order: { date: 'DESC' },
        take: 180,
      });
      return rows.filter(
        (row) =>
          (row.projectId && projectIds.includes(row.projectId)) ||
          (row.report?.engagementId &&
            engagementIds.includes(row.report.engagementId)),
      );
    };

    const [
      publishedVariations,
      clientReviews,
      approvedContentVariants,
      contentAccounts,
      contentPlans,
      approvedMetaReports,
      approvedSeoReports,
      clientVisibleReleases,
      publishedKnowledgeSources,
    ] = await Promise.all([
      deliverableIds.length > 0
        ? this.dataSource
            .getRepository(DeliveryVideoHookVariationEntity)
            .find({
              where: {
                workspaceId,
                deliverableId: In(deliverableIds),
                clientVisibility: 'PUBLISHED',
                renderStatus: 'READY',
              },
              order: { variationNumber: 'ASC' },
            })
        : Promise.resolve([]),
      deliverableIds.length > 0
        ? this.dataSource.getRepository(DeliveryDeliverableReviewEntity).find({
            where: {
              workspaceId,
              deliverableId: In(deliverableIds),
              authorType: 'CLIENT',
            },
            order: { createdAt: 'ASC' },
          })
        : Promise.resolve([]),
      overrides.social === false
        ? Promise.resolve([])
        : projectIds.length > 0
          ? this.dataSource.getRepository(DeliveryContentVariantEntity).find({
              where: [
                {
                  workspaceId,
                  companyId,
                  status: In(['APPROVED', 'PUBLISHED']),
                },
                {
                  workspaceId,
                  companyId: IsNull(),
                  projectId: In(projectIds),
                  status: In(['APPROVED', 'PUBLISHED']),
                },
              ],
              order: { plannedAt: 'DESC' },
              take: 120,
            })
          : this.dataSource.getRepository(DeliveryContentVariantEntity).find({
              where: {
                workspaceId,
                companyId,
                status: In(['APPROVED', 'PUBLISHED']),
              },
              order: { plannedAt: 'DESC' },
              take: 120,
            }),
      overrides.social !== false && projectIds.length > 0
        ? this.dataSource.getRepository(DeliveryContentAccountEntity).find({
            where: { workspaceId, projectId: In(projectIds), archived: false },
          })
        : Promise.resolve([]),
      overrides.social !== false && projectIds.length > 0
        ? this.dataSource.getRepository(DeliveryContentPlanEntity).find({
            where: { workspaceId, projectId: In(projectIds) },
          })
        : Promise.resolve([]),
      loadApprovedMetaReports(),
      overrides.seo === false
        ? Promise.resolve([])
        : projectIds.length > 0
          ? this.dataSource.getRepository(DeliverySeoReportEntity).find({
              where: [
                { workspaceId, companyId, status: 'APPROVED' },
                {
                  workspaceId,
                  companyId: IsNull(),
                  projectId: In(projectIds),
                  status: 'APPROVED',
                },
              ],
              order: { periodEnd: 'DESC' },
              take: 36,
            })
          : this.dataSource.getRepository(DeliverySeoReportEntity).find({
              where: { workspaceId, companyId, status: 'APPROVED' },
              order: { periodEnd: 'DESC' },
              take: 36,
            }),
      overrides.development === false
        ? Promise.resolve([])
        : projectIds.length > 0
          ? this.dataSource.getRepository(DeliveryReleaseEntity).find({
              where: [
                {
                  workspaceId,
                  companyId,
                  status: In(['APPROVED', 'DEPLOYED', 'HANDED_OVER', 'ACCEPTED']),
                },
                {
                  workspaceId,
                  companyId: IsNull(),
                  projectId: In(projectIds),
                  status: In(['APPROVED', 'DEPLOYED', 'HANDED_OVER', 'ACCEPTED']),
                },
              ],
              order: { targetDate: 'DESC', createdAt: 'DESC' },
              take: 50,
            })
          : this.dataSource.getRepository(DeliveryReleaseEntity).find({
              where: {
                workspaceId,
                companyId,
                status: In(['APPROVED', 'DEPLOYED', 'HANDED_OVER', 'ACCEPTED']),
              },
              order: { targetDate: 'DESC', createdAt: 'DESC' },
              take: 50,
            }),
      // Brand Vault requires explicit manager opt-in because publishedVersion is an internal assistant gate.
      overrides.brand_vault === true && projectIds.length > 0
        ? this.dataSource.getRepository(DeliveryKnowledgeSourceEntity).find({
            where: {
              workspaceId,
              projectId: In(projectIds),
              publishedVersion: Not(IsNull()),
            },
            order: { publishedAt: 'DESC' },
            take: 40,
          })
        : Promise.resolve([]),
    ]);

    // Fetch versioned child records in parallel
    const contentVariantIds = approvedContentVariants.map((v) => v.id);
    const seoReportIds = approvedSeoReports.map((r) => r.id);
    const releaseIds = clientVisibleReleases.map((r) => r.id);
    const knowledgeSourceIds = publishedKnowledgeSources.map((s) => s.id);
    const commitmentPeriodIds = allCommitments.map((c) => c.id);

    const [
      contentVersions,
      seoVersions,
      releaseVersions,
      knowledgeVersions,
      commitmentLines,
      commitmentAllocations,
    ] = await Promise.all([
      contentVariantIds.length > 0
        ? this.dataSource.getRepository(DeliveryContentVersionEntity).find({
            where: { workspaceId, variantId: In(contentVariantIds) },
          })
        : Promise.resolve([]),
      seoReportIds.length > 0
        ? this.dataSource.getRepository(DeliverySeoVersionEntity).find({
            where: { workspaceId, reportId: In(seoReportIds) },
          })
        : Promise.resolve([]),
      releaseIds.length > 0
        ? this.dataSource.getRepository(DeliveryReleaseVersionEntity).find({
            where: { workspaceId, releaseId: In(releaseIds) },
          })
        : Promise.resolve([]),
      knowledgeSourceIds.length > 0
        ? this.dataSource.getRepository(DeliveryKnowledgeVersionEntity).find({
            where: { workspaceId, sourceId: In(knowledgeSourceIds) },
          })
        : Promise.resolve([]),
      commitmentPeriodIds.length > 0
        ? this.dataSource.getRepository(DeliveryCommitmentLineEntity).find({
            where: { workspaceId, periodId: In(commitmentPeriodIds) },
          })
        : Promise.resolve([]),
      commitmentPeriodIds.length > 0
        ? this.dataSource
            .getRepository(DeliveryCommitmentAllocationEntity)
            .find({
              where: {
                workspaceId,
                periodId: In(commitmentPeriodIds),
                state: 'FULFILLED',
              },
            })
        : Promise.resolve([]),
    ]);

    // Collect available months (only from sections not explicitly disabled)
    const nowMonth = currentMonthKey();
    const monthSet = new Set<string>([nowMonth]);
    if (overrides.ai_videos !== false || overrides.static_ads !== false) {
      for (const d of allPublishedDeliverables) {
        const isVideo =
          d.assetKind === 'VIDEO' || /video|ugc|reel|hook/i.test(d.serviceKey);
        if (isVideo && overrides.ai_videos === false) continue;
        if (!isVideo && overrides.static_ads === false) continue;
        if (MONTH_KEY_REGEX.test(d.monthKey)) monthSet.add(d.monthKey);
      }
    }
    if (overrides.social !== false) {
      for (const m of allMetricSnapshots) {
        if (MONTH_KEY_REGEX.test(m.monthKey)) monthSet.add(m.monthKey);
      }
      for (const v of approvedContentVariants) {
        const mk = v.plannedAt.toISOString().slice(0, 7);
        if (MONTH_KEY_REGEX.test(mk)) monthSet.add(mk);
      }
    }
    if (overrides.paid_ads !== false) {
      for (const r of approvedMetaReports) {
        const mk = r.date?.slice(0, 7);
        if (mk && MONTH_KEY_REGEX.test(mk)) monthSet.add(mk);
      }
    }
    if (overrides.seo !== false) {
      for (const r of approvedSeoReports) {
        const mk = r.periodEnd?.slice(0, 7);
        if (mk && MONTH_KEY_REGEX.test(mk)) monthSet.add(mk);
      }
    }
    const availableMonths = Array.from(monthSet).sort((a, b) =>
      b.localeCompare(a),
    );
    const activeMonthKey =
      requestedMonthKey && MONTH_KEY_REGEX.test(requestedMonthKey)
        ? requestedMonthKey
        : nowMonth;

    // Map deliverables with client-safe variations and CLIENT reviews ONLY
    const variationsByDeliverable = new Map<
      string,
      DeliveryVideoHookVariationEntity[]
    >();
    for (const variation of publishedVariations) {
      const list = variationsByDeliverable.get(variation.deliverableId) ?? [];
      list.push(variation);
      variationsByDeliverable.set(variation.deliverableId, list);
    }

    const reviewsByDeliverable = new Map<
      string,
      DeliveryDeliverableReviewEntity[]
    >();
    for (const review of clientReviews) {
      const list = reviewsByDeliverable.get(review.deliverableId) ?? [];
      list.push(review);
      reviewsByDeliverable.set(review.deliverableId, list);
    }

    const mapClientDeliverable = (
      row: DeliveryDeliverableEntity,
    ): ClientPortalDeliverableDTO => {
      const vars = (variationsByDeliverable.get(row.id) ?? []).map((v) => ({
        id: v.id,
        variationNumber: v.variationNumber,
        label: `v${v.variationNumber}`,
        hookText: v.hookText,
        angleTag: v.angleTag,
        outputSizeBytes: Number(v.outputSizeBytes ?? 0),
        hasThumbnail: Boolean(v.thumbnailKey),
        streamUrl: `/portal/client/media/variations/${v.id}/stream`,
        downloadUrl: `/portal/client/media/variations/${v.id}/stream?download=1`,
        thumbnailUrl: v.thumbnailKey
          ? `/portal/client/media/variations/${v.id}/thumbnail`
          : null,
        driveWebUrl: showDriveLinks ? v.driveWebUrl : null,
        storageState: v.storageState,
        clientApprovalStatus: v.clientApprovalStatus,
      }));

      const reviews = (reviewsByDeliverable.get(row.id) ?? []).map((rev) => ({
        id: rev.id,
        variationId: rev.variationId,
        authorName: rev.authorName,
        authorType: rev.authorType,
        decision: rev.decision,
        comment: rev.comment,
        timestampSec:
          rev.timestampSec === null || rev.timestampSec === undefined
            ? null
            : Number(rev.timestampSec),
        createdAt: rev.createdAt.toISOString(),
      }));

      const hasMediaStream =
        row.assetKind !== 'LINK' &&
        Boolean(row.storageKey || row.driveFileId);

      return {
        id: row.id,
        serviceKey: row.serviceKey,
        serviceLabel: toServiceLabel(row.serviceKey),
        monthKey: row.monthKey,
        sequenceNumber: row.sequenceNumber,
        title: row.title,
        description: row.description,
        assetKind: row.assetKind,
        mimeType: row.mimeType,
        sizeBytes: Number(row.sizeBytes ?? 0),
        mediaMeta: (row.mediaMeta ?? {}) as Record<string, unknown>,
        externalUrl: row.externalUrl,
        hasThumbnail: Boolean(row.thumbnailKey),
        streamUrl: hasMediaStream
          ? `/portal/client/media/${row.id}/stream`
          : null,
        downloadUrl: hasMediaStream
          ? `/portal/client/media/${row.id}/stream?download=1`
          : null,
        thumbnailUrl: row.thumbnailKey
          ? `/portal/client/media/${row.id}/thumbnail`
          : null,
        driveWebUrl: showDriveLinks ? row.driveWebUrl : null,
        driveFolderWebUrl:
          showDriveLinks && row.driveFolderId
            ? `https://drive.google.com/drive/folders/${encodeURIComponent(row.driveFolderId)}`
            : null,
        storageState: row.storageState,
        status: row.clientApprovalStatus,
        hasVariations: row.hasVariations || vars.length > 0,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        variations: vars,
        reviews,
      };
    };

    const monthDeliverables = allPublishedDeliverables
      .filter((d) => d.monthKey === activeMonthKey)
      .map(mapClientDeliverable);

    const videoDeliverables = monthDeliverables.filter(
      (d) =>
        d.assetKind === 'VIDEO' ||
        /video|ugc|reel|hook/i.test(d.serviceKey),
    );
    const staticDeliverables = monthDeliverables.filter(
      (d) => !videoDeliverables.some((v) => v.id === d.id),
    );

    const allVideoCount = allPublishedDeliverables.filter(
      (d) =>
        d.assetKind === 'VIDEO' ||
        /video|ugc|reel|hook/i.test(d.serviceKey),
    ).length;
    const allStaticCount = allPublishedDeliverables.length - allVideoCount;

    // Social content calendar & performance metrics
    const accountById = new Map(contentAccounts.map((a) => [a.id, a]));
    const planById = new Map(contentPlans.map((p) => [p.id, p]));
    const versionByKey = new Map(
      contentVersions.map((v) => [`${v.variantId}:${v.version}`, v]),
    );

    const socialCalendar = approvedContentVariants
      .filter((v) => v.plannedAt.toISOString().slice(0, 7) === activeMonthKey)
      .map((variant) => {
        const version =
          versionByKey.get(
            `${variant.id}:${variant.approvedVersion ?? variant.currentVersion}`,
          ) ?? null;
        const account = accountById.get(variant.accountId);
        const plan = planById.get(variant.planId);
        return {
          id: variant.id,
          planTitle: plan?.title ?? 'Social Post',
          platform: account?.platform ?? version?.body?.account?.platform ?? 'INSTAGRAM',
          accountName: account?.name ?? version?.body?.account?.name ?? '',
          accountHandle: account?.handle ?? version?.body?.account?.handle ?? '',
          format: version?.body?.format ?? 'IMAGE',
          caption: version?.body?.caption ?? '',
          status: variant.status,
          plannedAt: variant.plannedAt.toISOString(),
        };
      });

    const monthMetrics = allMetricSnapshots.filter(
      (m) => m.monthKey === activeMonthKey,
    );
    const socialTotals = {
      views: 0,
      impressions: 0,
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      clicks: 0,
      followerDelta: 0,
    };
    const byPlatformMap = new Map<
      string,
      {
        platform: string;
        views: number;
        impressions: number;
        reach: number;
        engagements: number;
        followerDelta: number;
        entries: number;
      }
    >();

    for (const m of monthMetrics) {
      socialTotals.views += m.views;
      socialTotals.impressions += m.impressions;
      socialTotals.reach += m.reach;
      socialTotals.likes += m.likes;
      socialTotals.comments += m.comments;
      socialTotals.shares += m.shares;
      socialTotals.saves += m.saves;
      socialTotals.clicks += m.clicks;
      socialTotals.followerDelta += m.followerDelta;

      const existing = byPlatformMap.get(m.platform) ?? {
        platform: m.platform,
        views: 0,
        impressions: 0,
        reach: 0,
        engagements: 0,
        followerDelta: 0,
        entries: 0,
      };
      existing.views += m.views;
      existing.impressions += m.impressions;
      existing.reach += m.reach;
      existing.engagements += m.likes + m.comments + m.shares + m.saves;
      existing.followerDelta += m.followerDelta;
      existing.entries += 1;
      byPlatformMap.set(m.platform, existing);
    }

    const socialSection = {
      totals: socialTotals,
      totalEngagements:
        socialTotals.likes +
        socialTotals.comments +
        socialTotals.shares +
        socialTotals.saves,
      byPlatform: Array.from(byPlatformMap.values()).sort(
        (a, b) => b.views - a.views,
      ),
      snapshots: monthMetrics.map((m) => ({
        id: m.id,
        platform: m.platform,
        postTitle: m.postTitle,
        postUrl: m.postUrl,
        views: m.views,
        impressions: m.impressions,
        reach: m.reach,
        likes: m.likes,
        comments: m.comments,
        shares: m.shares,
        saves: m.saves,
        clicks: m.clicks,
        followerDelta: m.followerDelta,
        observedAt: m.observedAt.toISOString(),
      })),
      calendar: socialCalendar,
    };

    // Paid Ads (Meta) — STRICTLY client-safe ad performance metrics only
    const monthMetaReports = approvedMetaReports.filter(
      (r) => r.date?.slice(0, 7) === activeMonthKey,
    );
    let paidCurrency =
      monthMetaReports[0]?.report?.currency ??
      approvedMetaReports[0]?.report?.currency ??
      engagements.find((e) => e.advertising)?.advertising?.currency ??
      'USD';
    let totalAdSpend = 0;
    let totalAdImpressions = 0;
    let totalAdClicks = 0;
    let totalAdLeads = 0;
    let totalAdPurchases = 0;
    let totalAdPurchaseValue = 0;

    const campaignMap = new Map<
      string,
      {
        campaignName: string;
        spend: number;
        impressions: number;
        clicks: number;
        leads: number;
        purchases: number;
        purchaseValue: number;
      }
    >();

    const dailyPaidAds = monthMetaReports.map((row) => {
      const report = row.report;
      if (report?.currency) paidCurrency = report.currency;
      const acct = report?.account;
      const spend = parseNumeric(acct?.spend);
      const impressions = parseNumeric(acct?.impressions);
      const clicks = parseNumeric(acct?.clicks);
      const leads = sumMetaAction(acct?.actions, [
        'lead',
        'onsite_conversion.lead_grouped',
        'offsite_conversion.fb_pixel_lead',
      ]);
      const purchases = sumMetaAction(acct?.actions, [
        'purchase',
        'omni_purchase',
        'offsite_conversion.fb_pixel_purchase',
      ]);
      const purchaseValue = sumMetaAction(acct?.action_values, [
        'purchase',
        'omni_purchase',
        'offsite_conversion.fb_pixel_purchase',
      ]);

      totalAdSpend += spend;
      totalAdImpressions += impressions;
      totalAdClicks += clicks;
      totalAdLeads += leads;
      totalAdPurchases += purchases;
      totalAdPurchaseValue += purchaseValue;

      for (const ad of report?.ads ?? []) {
        const key = ad.campaign_name?.trim() || 'Campaign';
        const c = campaignMap.get(key) ?? {
          campaignName: key,
          spend: 0,
          impressions: 0,
          clicks: 0,
          leads: 0,
          purchases: 0,
          purchaseValue: 0,
        };
        c.spend += parseNumeric(ad.spend);
        c.impressions += parseNumeric(ad.impressions);
        c.clicks += parseNumeric(ad.clicks);
        c.leads += sumMetaAction(ad.actions, [
          'lead',
          'onsite_conversion.lead_grouped',
          'offsite_conversion.fb_pixel_lead',
        ]);
        c.purchases += sumMetaAction(ad.actions, [
          'purchase',
          'omni_purchase',
          'offsite_conversion.fb_pixel_purchase',
        ]);
        c.purchaseValue += sumMetaAction(ad.action_values, [
          'purchase',
          'omni_purchase',
          'offsite_conversion.fb_pixel_purchase',
        ]);
        campaignMap.set(key, c);
      }

      return {
        id: row.id,
        date: row.date,
        currency: report?.currency ?? paidCurrency,
        spend,
        impressions,
        clicks,
        ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
        cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0,
        leads,
        purchases,
        purchaseValue,
        roas: spend > 0 ? Number((purchaseValue / spend).toFixed(2)) : 0,
      };
    });

    const paidAdsSection = {
      currency: paidCurrency,
      summary: {
        spend: Number(totalAdSpend.toFixed(2)),
        impressions: Math.round(totalAdImpressions),
        clicks: Math.round(totalAdClicks),
        ctr:
          totalAdImpressions > 0
            ? Number(((totalAdClicks / totalAdImpressions) * 100).toFixed(2))
            : 0,
        cpc:
          totalAdClicks > 0
            ? Number((totalAdSpend / totalAdClicks).toFixed(2))
            : 0,
        leads: Math.round(totalAdLeads),
        purchases: Math.round(totalAdPurchases),
        purchaseValue: Number(totalAdPurchaseValue.toFixed(2)),
        roas:
          totalAdSpend > 0
            ? Number((totalAdPurchaseValue / totalAdSpend).toFixed(2))
            : 0,
      },
      campaigns: Array.from(campaignMap.values())
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 20)
        .map((c) => ({
          ...c,
          spend: Number(c.spend.toFixed(2)),
          purchaseValue: Number(c.purchaseValue.toFixed(2)),
          ctr:
            c.impressions > 0
              ? Number(((c.clicks / c.impressions) * 100).toFixed(2))
              : 0,
          roas: c.spend > 0 ? Number((c.purchaseValue / c.spend).toFixed(2)) : 0,
        })),
      dailyReports: dailyPaidAds,
    };

    // SEO approved reports (client-safe: omit internal workNotes & internal tasks)
    const seoVersionMap = new Map(
      seoVersions.map((v) => [`${v.reportId}:${v.version}`, v]),
    );
    const seoReports = approvedSeoReports.map((report) => {
      const ver = seoVersionMap.get(
        `${report.id}:${report.approvedVersion ?? report.currentVersion}`,
      );
      return {
        id: report.id,
        title: report.title,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        summary: ver?.body?.summary ?? '',
        metrics: (ver?.body?.metrics ?? []).map((m) => ({
          id: m.id,
          key: m.key,
          label: m.label,
          unit: m.unit,
          value: m.value,
          unknownReason: m.unknownReason,
          source: m.source,
        })),
        evidence: (ver?.body?.evidence ?? []).map((ev) => ({
          label: ev.label,
          url: ev.url,
          note: ev.note,
        })),
      };
    });

    // Development / Web / SaaS releases (client-safe: omit rollbackPlan & internal assignees)
    const releaseVersionMap = new Map(
      releaseVersions.map((v) => [`${v.releaseId}:${v.version}`, v]),
    );
    const releases = clientVisibleReleases.map((rel) => {
      const ver = releaseVersionMap.get(
        `${rel.id}:${rel.approvedVersion ?? rel.currentVersion}`,
      );
      const checks = ver?.body?.checks ?? [];
      return {
        id: rel.id,
        title: rel.title,
        status: rel.status,
        targetDate: rel.targetDate,
        summary: ver?.body?.summary ?? '',
        acceptanceCriteria: ver?.body?.acceptanceCriteria ?? '',
        checksPassedCount: checks.filter((c) => c.status === 'PASSED').length,
        checksTotalCount: checks.length,
      };
    });

    // Commitments progress (strictly counts, no billing or internal assignees)
    const fulfilledByLine = new Map<string, number>();
    for (const alloc of commitmentAllocations) {
      fulfilledByLine.set(
        alloc.lineId,
        (fulfilledByLine.get(alloc.lineId) ?? 0) + 1,
      );
    }
    const linesByPeriod = new Map<string, DeliveryCommitmentLineEntity[]>();
    for (const line of commitmentLines) {
      const list = linesByPeriod.get(line.periodId) ?? [];
      list.push(line);
      linesByPeriod.set(line.periodId, list);
    }
    const commitments = allCommitments.map((period) => {
      const lines = (linesByPeriod.get(period.id) ?? []).map((line) => {
        const fulfilled = fulfilledByLine.get(line.id) ?? 0;
        return {
          id: line.id,
          label: line.label,
          unit: line.unit,
          promisedQuantity: line.promisedQuantity,
          fulfilledQuantity: fulfilled,
          pct:
            line.promisedQuantity > 0
              ? Math.min(
                  100,
                  Math.round((fulfilled / line.promisedQuantity) * 100),
                )
              : 0,
        };
      });
      return {
        id: period.id,
        label: period.label,
        startDate: period.startDate,
        endDateExclusive: period.endDateExclusive,
        state: period.state,
        lines,
      };
    });

    // Brand Vault (published knowledge ONLY — explicitly opted-in, excluding internal PROMPT/MEETING categories & raw private transcripts)
    const INTERNAL_KNOWLEDGE_CATEGORIES = new Set(['PROMPT', 'MEETING']);
    const knowledgeVersionMap = new Map(
      knowledgeVersions.map((v) => [`${v.sourceId}:${v.version}`, v]),
    );
    const brandVault = publishedKnowledgeSources
      .map((src) => {
        const ver = knowledgeVersionMap.get(
          `${src.id}:${src.publishedVersion}`,
        );
        if (!ver) return null;
        if (INTERNAL_KNOWLEDGE_CATEGORIES.has(String(ver.category).toUpperCase())) {
          return null;
        }
        return {
          id: src.id,
          title: ver.title,
          category: ver.category,
          meetingDate: ver.meetingDate,
          summary: ver.knowledge,
          publishedAt: src.publishedAt ? src.publishedAt.toISOString() : null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    // Determine active dynamic service tabs
    const allServiceStrings = [
      ...engagementServices,
      ...allPublishedDeliverables.map((d) => d.serviceKey),
    ];

    const resolveTabEnabled = (
      tabKey: Exclude<ClientDashboardTabKey, 'overview'>,
      detected: boolean,
    ): boolean => {
      if (typeof overrides[tabKey] === 'boolean') {
        return overrides[tabKey];
      }
      return detected;
    };

    const hasAiVideosTab = resolveTabEnabled(
      'ai_videos',
      allVideoCount > 0 ||
        matchesAnyPattern(allServiceStrings, [/video|ugc|reel|hook/i]),
    );
    const hasSocialTab = resolveTabEnabled(
      'social',
      approvedContentVariants.length > 0 ||
        allMetricSnapshots.length > 0 ||
        matchesAnyPattern(allServiceStrings, [/social|content|instagram|tiktok/i]),
    );
    const hasStaticAdsTab = resolveTabEnabled(
      'static_ads',
      allStaticCount > 0 ||
        matchesAnyPattern(allServiceStrings, [/static|graphic|design|creative|banner/i]),
    );
    const hasPaidAdsTab = resolveTabEnabled(
      'paid_ads',
      hasAdvertisingEngagement ||
        approvedMetaReports.length > 0 ||
        matchesAnyPattern(allServiceStrings, [/meta|paid|ads|media.?buy|ppc|performance/i]),
    );
    const hasSeoTab = resolveTabEnabled(
      'seo',
      approvedSeoReports.length > 0 ||
        matchesAnyPattern(allServiceStrings, [/\bseo\b|search|organic/i]),
    );
    const hasDevTab = resolveTabEnabled(
      'development',
      releases.length > 0 ||
        matchesAnyPattern(allServiceStrings, [/web|saas|app|dev|landing|software|shopify|wordpress/i]),
    );
    const hasCommitmentsTab = resolveTabEnabled(
      'commitments',
      commitments.length > 0,
    );
    const hasBrandVaultTab =
      overrides.brand_vault === true && brandVault.length > 0;

    const visibleVideoDeliverables = hasAiVideosTab ? videoDeliverables : [];
    const visibleStaticDeliverables = hasStaticAdsTab ? staticDeliverables : [];
    const pendingApprovalCount = [
      ...visibleVideoDeliverables,
      ...visibleStaticDeliverables,
    ].filter((d) => d.status === 'PENDING').length;

    const tabs: ClientDashboardTab[] = [
      {
        key: 'overview',
        label: 'Overview',
        badgeCount: pendingApprovalCount,
      },
    ];
    if (hasAiVideosTab) {
      tabs.push({
        key: 'ai_videos',
        label: 'AI Videos & Variations',
        badgeCount: visibleVideoDeliverables.length,
      });
    }
    if (hasSocialTab) {
      tabs.push({
        key: 'social',
        label: 'Social & Performance',
        badgeCount: socialCalendar.length + monthMetrics.length,
      });
    }
    if (hasStaticAdsTab) {
      tabs.push({
        key: 'static_ads',
        label: 'Static Ads & Files',
        badgeCount: visibleStaticDeliverables.length,
      });
    }
    if (hasPaidAdsTab) {
      tabs.push({
        key: 'paid_ads',
        label: 'Paid Ads',
        badgeCount: dailyPaidAds.length,
      });
    }
    if (hasSeoTab) {
      tabs.push({
        key: 'seo',
        label: 'SEO Results',
        badgeCount: seoReports.length,
      });
    }
    if (hasDevTab) {
      tabs.push({
        key: 'development',
        label: 'Web & App Releases',
        badgeCount: releases.length,
      });
    }
    if (hasCommitmentsTab) {
      tabs.push({
        key: 'commitments',
        label: 'Deliverables Plan',
        badgeCount: commitments.length,
      });
    }
    if (hasBrandVaultTab) {
      tabs.push({
        key: 'brand_vault',
        label: 'Brand Vault',
        badgeCount: brandVault.length,
      });
    }

    // Build tailored top KPIs matching active tabs only
    const kpis: ClientDashboardKpi[] = [];
    if (hasAiVideosTab) {
      const variationCount = visibleVideoDeliverables.reduce(
        (acc, item) => acc + item.variations.length,
        0,
      );
      kpis.push({
        key: 'videos_delivered',
        label: 'Videos Delivered',
        value: String(visibleVideoDeliverables.length),
        sublabel:
          variationCount > 0
            ? `${variationCount} hook variation(s) ready`
            : `${pendingApprovalCount} awaiting your review`,
        tab: 'ai_videos',
      });
    }
    if (hasSocialTab) {
      kpis.push({
        key: 'social_views',
        label: 'Social Views',
        value: formatCompactNumber(socialTotals.views),
        sublabel:
          socialTotals.reach > 0
            ? `${formatCompactNumber(socialTotals.reach)} reach • ${socialCalendar.length} scheduled/live`
            : `${socialCalendar.length} scheduled/published posts`,
        tab: 'social',
      });
    }
    if (hasPaidAdsTab) {
      kpis.push({
        key: 'paid_ads_spend',
        label: 'Ad Spend',
        value: formatCurrencyValue(paidAdsSection.summary.spend, paidCurrency),
        sublabel:
          paidAdsSection.summary.roas > 0
            ? `${paidAdsSection.summary.roas}x ROAS • ${paidAdsSection.summary.leads} leads`
            : `${formatCompactNumber(paidAdsSection.summary.clicks)} clicks • ${paidAdsSection.summary.leads} leads`,
        tab: 'paid_ads',
      });
    }
    if (hasStaticAdsTab) {
      kpis.push({
        key: 'static_deliverables',
        label: 'Static Creatives',
        value: String(visibleStaticDeliverables.length),
        sublabel: `Published in ${activeMonthKey}`,
        tab: 'static_ads',
      });
    }
    if (hasSeoTab && seoReports.length > 0) {
      const latestSeo = seoReports[0];
      const clicksMetric = latestSeo.metrics.find((m) => m.key === 'CLICKS');
      const hasNumericClicks =
        clicksMetric?.value !== null &&
        clicksMetric?.value !== undefined &&
        clicksMetric.value !== '' &&
        Number.isFinite(Number(clicksMetric.value));
      kpis.push({
        key: 'seo_clicks',
        label: hasNumericClicks && clicksMetric ? clicksMetric.label : 'SEO Reports',
        value:
          hasNumericClicks && clicksMetric
            ? formatCompactNumber(Number(clicksMetric.value))
            : String(seoReports.length),
        sublabel: `${latestSeo.periodStart} → ${latestSeo.periodEnd}`,
        tab: 'seo',
      });
    }
    if (hasDevTab && releases.length > 0) {
      const shipped = releases.filter((r) =>
        ['DEPLOYED', 'HANDED_OVER', 'ACCEPTED'].includes(r.status),
      ).length;
      kpis.push({
        key: 'dev_releases',
        label: 'Shipped Releases',
        value: `${shipped}/${releases.length}`,
        sublabel: releases[0]?.title ?? 'Milestones',
        tab: 'development',
      });
    }
    if (hasCommitmentsTab && commitments.length > 0) {
      const activePeriod = commitments[0];
      const totalPromised = activePeriod.lines.reduce(
        (sum, l) => sum + l.promisedQuantity,
        0,
      );
      const totalFulfilled = activePeriod.lines.reduce(
        (sum, l) => sum + l.fulfilledQuantity,
        0,
      );
      kpis.push({
        key: 'commitment_progress',
        label: 'Plan Progress',
        value:
          totalPromised > 0
            ? `${Math.min(100, Math.round((totalFulfilled / totalPromised) * 100))}%`
            : 'Active',
        sublabel: `${totalFulfilled} of ${totalPromised} delivered`,
        tab: 'commitments',
      });
    }

    const emptySocialSection = {
      totals: {
        views: 0,
        impressions: 0,
        reach: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
        followerDelta: 0,
      },
      totalEngagements: 0,
      byPlatform: [],
      snapshots: [],
      calendar: [],
    };
    const emptyPaidAdsSection = {
      currency: paidCurrency,
      summary: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        leads: 0,
        purchases: 0,
        purchaseValue: 0,
        roas: 0,
      },
      campaigns: [],
      dailyReports: [],
    };

    return {
      client: {
        slug: access.slug,
        displayName,
        welcomeNote: access.welcomeNote,
        brandAccentColor: access.brandAccentColor,
        showDriveLinks,
        driveRootFolderUrl:
          showDriveLinks && driveMapping?.rootFolderId
            ? `https://drive.google.com/drive/folders/${encodeURIComponent(driveMapping.rootFolderId)}`
            : null,
        stakeholderName: session.name ?? null,
        activeServices: engagementServices,
      },
      activeMonthKey,
      availableMonths,
      tabs,
      kpis: kpis.slice(0, 6),
      pendingApprovalCount,
      aiVideos: visibleVideoDeliverables,
      staticDeliverables: visibleStaticDeliverables,
      social: hasSocialTab ? socialSection : emptySocialSection,
      paidAds: hasPaidAdsTab ? paidAdsSection : emptyPaidAdsSection,
      seo: hasSeoTab ? seoReports : [],
      releases: hasDevTab ? releases : [],
      commitments: hasCommitmentsTab ? commitments : [],
      brandVault: hasBrandVaultTab ? brandVault : [],
    };
  }

  async submitClientReview(
    access: DeliveryClientPortalAccessEntity,
    session: ClientPortalV2SessionPayload,
    deliverableId: string,
    rawBody: unknown,
  ) {
    if (!isUuidString(deliverableId)) {
      throw new BadRequestException('Invalid deliverable ID.');
    }
    const parsed = clientPortalReviewSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid review submission.',
      );
    }
    const input = parsed.data;
    const authorName =
      input.authorName?.trim() || session.name?.trim() || 'Client';

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery-deliverable-review:${access.workspaceId}:${deliverableId}`],
      );

      const deliverableRepo = manager.getRepository(DeliveryDeliverableEntity);
      const deliverable = await deliverableRepo.findOne({
        where: {
          id: deliverableId,
          workspaceId: access.workspaceId,
          companyId: access.companyId,
          clientVisibility: 'PUBLISHED',
          status: 'APPROVED',
        },
      });
      if (!deliverable) {
        throw new NotFoundException('Deliverable not found.');
      }

      let variation: DeliveryVideoHookVariationEntity | null = null;
      if (input.variationId) {
        const variationRepo = manager.getRepository(
          DeliveryVideoHookVariationEntity,
        );
        variation = await variationRepo.findOne({
          where: {
            id: input.variationId,
            workspaceId: access.workspaceId,
            deliverableId: deliverable.id,
            clientVisibility: 'PUBLISHED',
            renderStatus: 'READY',
          },
        });
        if (!variation) {
          throw new NotFoundException('Video variation not found.');
        }
      }

      const reviewRepo = manager.getRepository(DeliveryDeliverableReviewEntity);
      const savedReview = await reviewRepo.save(
        reviewRepo.create({
          workspaceId: access.workspaceId,
          deliverableId: deliverable.id,
          variationId: variation ? variation.id : null,
          authorType: 'CLIENT',
          authorId: null,
          authorName,
          decision: input.decision,
          comment: input.comment.trim(),
          timestampSec:
            input.timestampSec === undefined || input.timestampSec === null
              ? null
              : Number(input.timestampSec.toFixed(2)),
        }),
      );

      if (input.decision === 'APPROVED' || input.decision === 'CHANGES_REQUESTED') {
        if (variation) {
          const variationRepo = manager.getRepository(
            DeliveryVideoHookVariationEntity,
          );
          variation.clientApprovalStatus = input.decision;
          await variationRepo.save(variation);

          // Roll up client approval status across published ready variations so pendingApprovalCount stays accurate.
          const siblingVariations = await variationRepo.find({
            where: {
              workspaceId: access.workspaceId,
              deliverableId: deliverable.id,
              clientVisibility: 'PUBLISHED',
              renderStatus: 'READY',
            },
          });
          if (siblingVariations.length > 0) {
            const anyChangesRequested = siblingVariations.some(
              (v) => v.clientApprovalStatus === 'CHANGES_REQUESTED',
            );
            const allApproved = siblingVariations.every(
              (v) => v.clientApprovalStatus === 'APPROVED',
            );
            if (anyChangesRequested) {
              deliverable.clientApprovalStatus = 'CHANGES_REQUESTED';
              await deliverableRepo.save(deliverable);
            } else if (allApproved) {
              deliverable.clientApprovalStatus = 'APPROVED';
              await deliverableRepo.save(deliverable);
            }
          }
        } else {
          deliverable.clientApprovalStatus = input.decision;
          await deliverableRepo.save(deliverable);
        }
      }

      await recordOtogrowActivity(manager, {
        workspaceId: access.workspaceId,
        actorId: null,
        actorType: 'CLIENT',
        category: 'CLIENT',
        action: `CLIENT_DELIVERABLE_${input.decision}`,
        outcome: 'RECORDED',
        summary: `${authorName} submitted ${input.decision} on deliverable #${deliverable.sequenceNumber}${variation ? ` (v${variation.variationNumber})` : ''}.`,
        sourceType: 'deliverable',
        sourceId: deliverable.id,
        changes: [
          {
            field: 'clientReview',
            before: null,
            after: input.decision,
          },
        ],
      });

      return {
        review: {
          id: savedReview.id,
          variationId: savedReview.variationId,
          authorName: savedReview.authorName,
          authorType: savedReview.authorType,
          decision: savedReview.decision,
          comment: savedReview.comment,
          timestampSec:
            savedReview.timestampSec === null
              ? null
              : Number(savedReview.timestampSec),
          createdAt: savedReview.createdAt.toISOString(),
        },
        deliverableStatus: deliverable.clientApprovalStatus,
        variationStatus: variation?.clientApprovalStatus ?? null,
      };
    });
  }

  async authorizeClientDeliverableMedia(
    access: DeliveryClientPortalAccessEntity,
    deliverableId: string,
  ): Promise<DeliveryDeliverableEntity> {
    if (!isUuidString(deliverableId)) {
      throw new BadRequestException('Invalid deliverable ID.');
    }
    const deliverable = await this.dataSource
      .getRepository(DeliveryDeliverableEntity)
      .findOne({
        where: {
          id: deliverableId,
          workspaceId: access.workspaceId,
          companyId: access.companyId,
          clientVisibility: 'PUBLISHED',
          status: 'APPROVED',
        },
      });
    if (!deliverable) {
      throw new NotFoundException('Deliverable media not found.');
    }
    return deliverable;
  }

  async authorizeClientVariationMedia(
    access: DeliveryClientPortalAccessEntity,
    variationId: string,
  ): Promise<DeliveryVideoHookVariationEntity> {
    if (!isUuidString(variationId)) {
      throw new BadRequestException('Invalid variation ID.');
    }
    const variation = await this.dataSource
      .getRepository(DeliveryVideoHookVariationEntity)
      .findOne({
        where: {
          id: variationId,
          workspaceId: access.workspaceId,
          clientVisibility: 'PUBLISHED',
          renderStatus: 'READY',
        },
      });
    if (!variation) {
      throw new NotFoundException('Variation media not found.');
    }
    const parent = await this.dataSource
      .getRepository(DeliveryDeliverableEntity)
      .findOne({
        where: {
          id: variation.deliverableId,
          workspaceId: access.workspaceId,
          companyId: access.companyId,
          clientVisibility: 'PUBLISHED',
          status: 'APPROVED',
        },
      });
    if (!parent) {
      throw new NotFoundException('Variation media not found.');
    }
    return variation;
  }
}
