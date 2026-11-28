import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type Request, type Response } from 'express';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { type Readable } from 'node:stream';
import { google, type drive_v3 } from 'googleapis';
import { DataSource, type EntityManager, In, IsNull } from 'typeorm';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { SecretEncryptionService } from 'src/engine/core-modules/secret-encryption/secret-encryption.service';
import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type CompanyWorkspaceEntity } from 'src/modules/company/standard-objects/company.workspace-entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryFinanceV2InvoiceScheduleEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-invoice-schedule.entity';
import {
  type CachedDriveMonthFolder,
  DeliveryClientDriveMappingEntity,
} from 'src/modules/delivery/deliverables/entities/delivery-client-drive-mapping.entity';
import { DeliveryDeliverableEntity } from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import {
  DeliveryDriveConnectionEntity,
  type DriveFolderMode,
} from 'src/modules/delivery/deliverables/entities/delivery-drive-connection.entity';
import { DeliveryVideoHookVariationEntity } from 'src/modules/delivery/deliverables/entities/delivery-video-hook-variation.entity';
import {
  ALLOWED_DELIVERABLE_MIMES,
  bindClientDriveFolderSchema,
  currentMonthKey,
  formatDriveDeliverableFilename,
  formatDriveMonthFolder,
  formatDriveVariationFilename,
  isUuidString,
  matchExistingMonthSubfolder,
  MONTH_FOLDER_PRESETS,
  parseByteRangeHeader,
  resolveClientBillingCycle,
  sanitizeSafeReturnPath,
  signDriveOAuthState,
  updateDriveSettingsSchema,
  validateMonthFolderPattern,
  verifyDriveOAuthState,
} from 'src/modules/delivery/deliverables/delivery-deliverables.policy';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

export const DELIVERY_DRIVE_SYNC_JOB = 'delivery-deliverable-drive-sync';

const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
];

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const CACHE_META_KEY = '__meta__';

export type ClientDriveRootFolderOption = {
  id: string;
  name: string;
  webViewLink: string | null;
  label: string | null;
  isDefault: boolean;
};

type StoredExtraRootFolder = {
  id: string;
  name: string;
  webViewLink: string | null;
  label?: string | null;
};

type DriveCacheMetaEntry = {
  monthStartDay?: number;
  primaryFolderLabel?: string | null;
  extraRootFolders?: StoredExtraRootFolder[];
};

const readCacheMeta = (
  cache?: Record<string, unknown> | null,
): DriveCacheMetaEntry => {
  if (!cache || typeof cache !== 'object') return {};
  const meta = cache[CACHE_META_KEY];
  if (!meta || typeof meta !== 'object') return {};
  return meta as DriveCacheMetaEntry;
};

const readExplicitMonthStartDay = (
  cache?: Record<string, unknown> | null,
): number | null => {
  const raw = readCacheMeta(cache).monthStartDay;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 31) {
    return null;
  }
  return raw;
};

const readExtraRootFolders = (
  cache?: Record<string, unknown> | null,
): StoredExtraRootFolder[] => {
  const raw = readCacheMeta(cache).extraRootFolders;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StoredExtraRootFolder[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      webViewLink:
        typeof item.webViewLink === 'string' && item.webViewLink.trim()
          ? item.webViewLink.trim()
          : `https://drive.google.com/drive/folders/${id}`,
      label:
        typeof item.label === 'string' && item.label.trim()
          ? item.label.trim().slice(0, 80)
          : null,
    });
  }
  return out;
};

const readClientRootFolders = (
  mapping?: DeliveryClientDriveMappingEntity | null,
): ClientDriveRootFolderOption[] => {
  if (!mapping?.rootFolderId) return [];
  const meta = readCacheMeta(mapping.monthFolderCache);
  const primaryLabel =
    typeof meta.primaryFolderLabel === 'string' &&
    meta.primaryFolderLabel.trim()
      ? meta.primaryFolderLabel.trim().slice(0, 80)
      : null;
  const result: ClientDriveRootFolderOption[] = [
    {
      id: mapping.rootFolderId,
      name: mapping.rootFolderName,
      webViewLink:
        mapping.rootFolderWebUrl ??
        `https://drive.google.com/drive/folders/${mapping.rootFolderId}`,
      label: primaryLabel,
      isDefault: true,
    },
  ];
  for (const extra of readExtraRootFolders(mapping.monthFolderCache)) {
    if (extra.id === mapping.rootFolderId) continue;
    result.push({
      id: extra.id,
      name: extra.name,
      webViewLink: extra.webViewLink,
      label: extra.label ?? null,
      isDefault: false,
    });
  }
  return result;
};

const buildMetaEntry = (params: {
  monthStartDay: number | null;
  primaryFolderLabel: string | null;
  extraRootFolders: StoredExtraRootFolder[];
}): DriveCacheMetaEntry | null => {
  const entry: DriveCacheMetaEntry = {};
  if (params.monthStartDay !== null) {
    entry.monthStartDay = params.monthStartDay;
  }
  if (params.primaryFolderLabel) {
    entry.primaryFolderLabel = params.primaryFolderLabel;
  }
  if (params.extraRootFolders.length > 0) {
    entry.extraRootFolders = params.extraRootFolders;
  }
  return Object.keys(entry).length > 0 ? entry : null;
};

const buildClearedMonthCache = (
  existingCache?: Record<string, CachedDriveMonthFolder> | null,
  updates?: {
    monthStartDay?: number | null;
    primaryFolderLabel?: string | null;
    extraRootFolders?: StoredExtraRootFolder[];
  },
): Record<string, CachedDriveMonthFolder> => {
  const prevMeta = readCacheMeta(existingCache);
  const nextMonthStartDay =
    updates?.monthStartDay === undefined
      ? readExplicitMonthStartDay(existingCache)
      : updates.monthStartDay;
  const nextPrimaryLabel =
    updates?.primaryFolderLabel === undefined
      ? typeof prevMeta.primaryFolderLabel === 'string' &&
        prevMeta.primaryFolderLabel.trim()
        ? prevMeta.primaryFolderLabel.trim()
        : null
      : updates.primaryFolderLabel;
  const nextExtras =
    updates?.extraRootFolders === undefined
      ? readExtraRootFolders(existingCache)
      : updates.extraRootFolders;

  const meta = buildMetaEntry({
    monthStartDay: nextMonthStartDay,
    primaryFolderLabel: nextPrimaryLabel,
    extraRootFolders: nextExtras,
  });
  if (meta) {
    return {
      [CACHE_META_KEY]: meta as unknown as CachedDriveMonthFolder,
    };
  }
  return {};
};

const applyMetaToCache = (
  existingCache: Record<string, CachedDriveMonthFolder> | null | undefined,
  updates: {
    monthStartDay?: number | null;
    primaryFolderLabel?: string | null;
    extraRootFolders?: StoredExtraRootFolder[];
  },
): Record<string, CachedDriveMonthFolder> => {
  const next: Record<string, CachedDriveMonthFolder> = {
    ...(existingCache ?? {}),
  };
  const prevMeta = readCacheMeta(existingCache);
  const meta = buildMetaEntry({
    monthStartDay:
      updates.monthStartDay === undefined
        ? readExplicitMonthStartDay(existingCache)
        : updates.monthStartDay,
    primaryFolderLabel:
      updates.primaryFolderLabel === undefined
        ? typeof prevMeta.primaryFolderLabel === 'string' &&
          prevMeta.primaryFolderLabel.trim()
          ? prevMeta.primaryFolderLabel.trim()
          : null
        : updates.primaryFolderLabel,
    extraRootFolders:
      updates.extraRootFolders === undefined
        ? readExtraRootFolders(existingCache)
        : updates.extraRootFolders,
  });
  if (!meta) {
    delete next[CACHE_META_KEY];
  } else {
    next[CACHE_META_KEY] = meta as unknown as CachedDriveMonthFolder;
  }
  return next;
};

const escapeDriveQueryValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const sanitizeFolderName = (name: string): string =>
  name
    .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Untitled';

const validateMonthPatternOrThrow = (pattern: string): string => {
  try {
    return validateMonthFolderPattern(pattern);
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Invalid month folder pattern.',
    );
  }
};

const extractDriveHttpStatus = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const record = error as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const candidate = record.response?.status ?? record.status ?? record.code;
  return typeof candidate === 'number' ? candidate : null;
};

export type DriveFolderOption = {
  id: string;
  name: string;
  webViewLink: string | null;
};

export type MonthStartDaySource = 'EXPLICIT' | 'BILLING_SCHEDULE' | 'DEFAULT';

export type ClientDriveMappingDTO = {
  companyId: string;
  companyName: string | null;
  rootFolderId: string;
  rootFolderName: string;
  rootFolderWebUrl: string | null;
  rootFolders: ClientDriveRootFolderOption[];
  monthStartDay: number;
  monthStartDaySource: MonthStartDaySource;
  activeMonthKey: string;
  activeCycleLabel: string;
  monthFolderPatternOverride: string | null;
  monthFolderPreview: string;
};

export type DeliveryDriveConfigDTO = {
  oauthConfigured: boolean;
  connected: boolean;
  googleEmail: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  monthFolderPattern: string;
  monthFolderPreview: string;
  monthFolderPresets: { pattern: string; example: string }[];
  folderMode: DriveFolderMode;
  includeOriginalInVariationFolder: boolean;
  autoPurgeVpsEnabled: boolean;
  autoPurgeVpsAfterHours: number;
  connectedAt: string | null;
  clientMappings: ClientDriveMappingDTO[];
};

@Injectable()
export class DeliveryDriveService {
  private readonly logger = new Logger(DeliveryDriveService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly secretEncryption: SecretEncryptionService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly storage: FileStorageDriverFactory,
    private readonly orm: GlobalWorkspaceOrmManager,
    @InjectMessageQueue(MessageQueue.driveSyncQueue)
    private readonly driveSyncQueue: MessageQueueService,
  ) {}

  private identity(auth: WorkspaceAuthContext) {
    if (auth.type !== 'user' || !auth.workspaceMemberId) {
      throw new ForbiddenException('Workspace member authentication required.');
    }
    return {
      workspaceId: auth.workspace.id,
      memberId: auth.workspaceMemberId,
      userWorkspaceId: auth.userWorkspaceId,
    };
  }

  private async resolveActor(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    manager?: EntityManager,
  ) {
    const run = async (em: EntityManager) => {
      const workspace = await em
        .getRepository(WorkspaceEntity)
        .findOneByOrFail({ id: workspaceId });
      return this.delivery.actor(workspace, memberId, userWorkspaceId, em);
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  private async authorizeManager(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    manager?: EntityManager,
  ) {
    const actor = await this.resolveActor(
      workspaceId,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (!actor.isManager) {
      throw new ForbiddenException(
        'Only delivery managers can manage Google Drive sync settings.',
      );
    }
    return actor;
  }

  private async authorizeStaff(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    manager?: EntityManager,
  ) {
    return this.resolveActor(workspaceId, memberId, userWorkspaceId, manager);
  }

  private getOAuthCredentials() {
    const clientId = (
      this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_ID') ?? ''
    ).trim();
    const clientSecret = (
      this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_SECRET') ?? ''
    ).trim();
    const serverUrl = (
      this.twentyConfigService.get('SERVER_URL') ?? 'http://localhost:3000'
    )
      .trim()
      .replace(/\/+$/, '');
    const redirectUri = `${serverUrl}/delivery-drive/oauth/callback`;
    return {
      clientId,
      clientSecret,
      serverUrl,
      redirectUri,
      configured: Boolean(clientId && clientSecret),
    };
  }

  private buildOAuthClient() {
    const creds = this.getOAuthCredentials();
    if (!creds.configured) {
      throw new ServiceUnavailableException(
        'Google OAuth is not configured on this server (missing AUTH_GOOGLE_CLIENT_ID / AUTH_GOOGLE_CLIENT_SECRET).',
      );
    }
    return new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      creds.redirectUri,
    );
  }

  private async loadCompanyNames(
    workspaceId: string,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      await this.orm.executeInWorkspaceContext(async () => {
        const companyRepo = await this.orm.getRepository<CompanyWorkspaceEntity>(
          workspaceId,
          'company',
          { shouldBypassPermissionChecks: true },
        );
        const companies = await companyRepo.find({
          select: ['id', 'name'],
          take: 1000,
        });
        for (const company of companies) {
          if (company.id && company.name) {
            map.set(company.id, company.name);
          }
        }
      }, buildSystemAuthContext(workspaceId));
    } catch {
      // Fallback gracefully if CRM company lookup is unavailable.
    }
    return map;
  }

  private async loadClientBillingDays(
    workspaceId: string,
    companyIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const uniqueCompanyIds = Array.from(
      new Set(companyIds.filter((id) => isUuidString(id))),
    );
    if (!uniqueCompanyIds.length) return result;
    try {
      const projects = await this.dataSource
        .getRepository(DeliveryProjectEntity)
        .find({
          where: { workspaceId, companyId: In(uniqueCompanyIds) },
          select: ['id', 'companyId'],
        });
      if (!projects.length) return result;
      const projectToCompany = new Map<string, string>();
      for (const project of projects) {
        if (project.id && project.companyId) {
          projectToCompany.set(project.id, project.companyId);
        }
      }
      const projectIds = Array.from(projectToCompany.keys());
      if (!projectIds.length) return result;
      const schedules = await this.dataSource
        .getRepository(DeliveryFinanceV2InvoiceScheduleEntity)
        .find({
          where: {
            workspaceId,
            projectId: In(projectIds),
            status: 'ACTIVE',
          },
          order: { updatedAt: 'DESC' },
        });
      for (const schedule of schedules) {
        if (!schedule.projectId) continue;
        const companyId = projectToCompany.get(schedule.projectId);
        if (!companyId || result.has(companyId)) continue;
        if (
          typeof schedule.billingDayOfMonth === 'number' &&
          schedule.billingDayOfMonth >= 1 &&
          schedule.billingDayOfMonth <= 31
        ) {
          result.set(companyId, schedule.billingDayOfMonth);
        }
      }
    } catch {
      // Gracefully fallback to default day 1 if Finance V2 schedules are unavailable.
    }
    return result;
  }

  async resolveClientMonthStartDay(
    workspaceId: string,
    companyId: string,
    existingMapping?: DeliveryClientDriveMappingEntity | null,
  ): Promise<{ monthStartDay: number; source: MonthStartDaySource }> {
    const mapping =
      existingMapping !== undefined
        ? existingMapping
        : await this.dataSource
            .getRepository(DeliveryClientDriveMappingEntity)
            .findOne({ where: { workspaceId, companyId } });
    const explicit = readExplicitMonthStartDay(mapping?.monthFolderCache);
    if (explicit !== null) {
      return { monthStartDay: explicit, source: 'EXPLICIT' };
    }
    const billingDays = await this.loadClientBillingDays(workspaceId, [
      companyId,
    ]);
    const fromSchedule = billingDays.get(companyId);
    if (fromSchedule !== undefined) {
      return { monthStartDay: fromSchedule, source: 'BILLING_SCHEDULE' };
    }
    return { monthStartDay: 1, source: 'DEFAULT' };
  }

  async resolveClientActiveMonthKey(
    workspaceId: string,
    companyId: string,
    referenceDate: Date = new Date(),
  ): Promise<string> {
    const { monthStartDay } = await this.resolveClientMonthStartDay(
      workspaceId,
      companyId,
    );
    return resolveClientBillingCycle(monthStartDay, referenceDate)
      .cycleMonthKey;
  }

  async getConfig(auth: WorkspaceAuthContext): Promise<DeliveryDriveConfigDTO> {
    const { workspaceId, memberId, userWorkspaceId } = this.identity(auth);
    const actor = await this.authorizeStaff(
      workspaceId,
      memberId,
      userWorkspaceId,
    );
    const creds = this.getOAuthCredentials();
    const connection = await this.dataSource
      .getRepository(DeliveryDriveConnectionEntity)
      .findOne({ where: { workspaceId, revokedAt: IsNull() } });

    const pattern = connection?.monthFolderPattern || '{Month} {YYYY}';
    const sampleMonth = currentMonthKey();

    if (!actor.isManager) {
      return {
        oauthConfigured: creds.configured,
        connected: Boolean(connection),
        googleEmail: null,
        rootFolderId: null,
        rootFolderName: null,
        monthFolderPattern: pattern,
        monthFolderPreview: formatDriveMonthFolder(sampleMonth, pattern),
        monthFolderPresets: MONTH_FOLDER_PRESETS.map((preset) => ({
          pattern: preset.pattern,
          example: formatDriveMonthFolder(sampleMonth, preset.pattern),
        })),
        folderMode: connection?.folderMode ?? 'FLAT',
        includeOriginalInVariationFolder: false,
        autoPurgeVpsEnabled: false,
        autoPurgeVpsAfterHours: 24,
        connectedAt: null,
        clientMappings: [],
      };
    }

    const mappings = await this.dataSource
      .getRepository(DeliveryClientDriveMappingEntity)
      .find({ where: { workspaceId }, order: { updatedAt: 'DESC' } });
    const [companyNames, billingDays] =
      mappings.length > 0
        ? await Promise.all([
            this.loadCompanyNames(workspaceId),
            this.loadClientBillingDays(
              workspaceId,
              mappings.map((m) => m.companyId),
            ),
          ])
        : [new Map<string, string>(), new Map<string, number>()];

    return {
      oauthConfigured: creds.configured,
      connected: Boolean(connection),
      googleEmail: connection?.googleEmail ?? null,
      rootFolderId: connection?.rootFolderId ?? null,
      rootFolderName: connection?.rootFolderName ?? null,
      monthFolderPattern: pattern,
      monthFolderPreview: formatDriveMonthFolder(sampleMonth, pattern),
      monthFolderPresets: MONTH_FOLDER_PRESETS.map((preset) => ({
        pattern: preset.pattern,
        example: formatDriveMonthFolder(sampleMonth, preset.pattern),
      })),
      folderMode: connection?.folderMode ?? 'FLAT',
      includeOriginalInVariationFolder:
        connection?.includeOriginalInVariationFolder ?? false,
      autoPurgeVpsEnabled: connection?.autoPurgeVpsEnabled ?? true,
      autoPurgeVpsAfterHours: connection?.autoPurgeVpsAfterHours ?? 24,
      connectedAt: connection?.createdAt?.toISOString() ?? null,
      clientMappings: mappings.map((mapping) => {
        const effPattern = mapping.monthFolderPatternOverride || pattern;
        const explicitDay = readExplicitMonthStartDay(mapping.monthFolderCache);
        const scheduleDay = billingDays.get(mapping.companyId);
        const monthStartDay = explicitDay ?? scheduleDay ?? 1;
        const monthStartDaySource: MonthStartDaySource =
          explicitDay !== null
            ? 'EXPLICIT'
            : scheduleDay !== undefined
              ? 'BILLING_SCHEDULE'
              : 'DEFAULT';
        const cycle = resolveClientBillingCycle(monthStartDay);
        return {
          companyId: mapping.companyId,
          companyName: companyNames.get(mapping.companyId) ?? null,
          rootFolderId: mapping.rootFolderId,
          rootFolderName: mapping.rootFolderName,
          rootFolderWebUrl: mapping.rootFolderWebUrl,
          rootFolders: readClientRootFolders(mapping),
          monthStartDay,
          monthStartDaySource,
          activeMonthKey: cycle.cycleMonthKey,
          activeCycleLabel: cycle.cycleLabel,
          monthFolderPatternOverride: mapping.monthFolderPatternOverride,
          monthFolderPreview: formatDriveMonthFolder(
            cycle.cycleMonthKey,
            effPattern,
          ),
        };
      }),
    };
  }

  async startOAuth(
    auth: WorkspaceAuthContext,
    returnTo?: string,
  ): Promise<{ authorizeUrl: string }> {
    const { workspaceId, memberId, userWorkspaceId } = this.identity(auth);
    await this.authorizeManager(workspaceId, memberId, userWorkspaceId);

    const oauth2Client = this.buildOAuthClient();
    const secret = this.twentyConfigService.get('APP_SECRET') || '';
    if (!secret) {
      throw new ServiceUnavailableException('Server APP_SECRET is not set.');
    }

    const state = signDriveOAuthState(secret, {
      w: workspaceId,
      m: memberId,
      uw: userWorkspaceId,
      ret: sanitizeSafeReturnPath(returnTo),
    });

    const authorizeUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: GOOGLE_DRIVE_SCOPES,
      state,
    });

    return { authorizeUrl };
  }

  async handleOAuthCallback(params: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<{ redirectUrl: string }> {
    const secret = this.twentyConfigService.get('APP_SECRET') || '';
    const frontUrl = (
      this.twentyConfigService.get('FRONTEND_URL') ||
      this.twentyConfigService.get('SERVER_URL') ||
      ''
    )
      .trim()
      .replace(/\/+$/, '');

    const verified = verifyDriveOAuthState(secret, params.state);
    const baseReturnPath = verified?.ret ?? '/delivery?view=deliverables';

    const buildRedirect = (statusParam: string) => {
      const separator = baseReturnPath.includes('?') ? '&' : '?';
      return `${frontUrl}${baseReturnPath}${separator}drive=${encodeURIComponent(statusParam)}`;
    };

    if (!verified) {
      return { redirectUrl: buildRedirect('error:invalid_state') };
    }

    if (params.error) {
      const safeError = /^[a-z0-9_]{1,40}$/i.test(params.error)
        ? params.error
        : 'oauth_error';
      return { redirectUrl: buildRedirect(`error:${safeError}`) };
    }

    if (!params.code) {
      return { redirectUrl: buildRedirect('error:missing_code') };
    }

    try {
      await this.authorizeManager(verified.w, verified.m, verified.uw);

      const oauth2Client = this.buildOAuthClient();
      const { tokens } = await oauth2Client.getToken(params.code);
      if (!tokens.access_token) {
        return { redirectUrl: buildRedirect('error:missing_access_token') };
      }

      oauth2Client.setCredentials(tokens);
      let googleEmail = '';
      try {
        const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2Api.userinfo.get();
        if (userInfo.data.email) {
          googleEmail = userInfo.data.email.trim();
        }
      } catch {
        try {
          const drive = google.drive({ version: 'v3', auth: oauth2Client });
          const about = await drive.about.get({ fields: 'user(emailAddress)' });
          if (about.data.user?.emailAddress) {
            googleEmail = about.data.user.emailAddress.trim();
          }
        } catch {
          // Handled below
        }
      }
      if (!googleEmail) {
        googleEmail = 'connected@google.drive';
      }

      const encryptedAccessToken = this.secretEncryption.encryptVersioned(
        tokens.access_token as PlaintextString,
        { workspaceId: verified.w },
      );

      let missingRefreshToken = false;
      await this.dataSource.transaction(async (manager) => {
        const existing = await manager
          .getRepository(DeliveryDriveConnectionEntity)
          .createQueryBuilder('c')
          .addSelect('c.encryptedRefreshToken')
          .where('c.workspaceId = :workspaceId', { workspaceId: verified.w })
          .getOne();

        const isSameAccount =
          Boolean(existing?.googleEmail) &&
          existing!.googleEmail.toLowerCase() === googleEmail.toLowerCase() &&
          googleEmail !== 'connected@google.drive';

        const encryptedRefreshToken: EncryptedString | undefined =
          tokens.refresh_token
            ? this.secretEncryption.encryptVersioned(
                tokens.refresh_token as PlaintextString,
                { workspaceId: verified.w },
              )
            : isSameAccount
              ? existing?.encryptedRefreshToken
              : undefined;

        if (!encryptedRefreshToken) {
          missingRefreshToken = true;
          return;
        }

        const tokenExpiresAt = tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : new Date(Date.now() + 3500 * 1000);

        const repo = manager.getRepository(DeliveryDriveConnectionEntity);
        if (existing) {
          const accountSwitched = !isSameAccount;
          existing.googleEmail = googleEmail;
          existing.encryptedAccessToken = encryptedAccessToken;
          existing.encryptedRefreshToken = encryptedRefreshToken;
          existing.tokenExpiresAt = tokenExpiresAt;
          existing.connectedBy = verified.m;
          existing.revokedAt = null;
          if (accountSwitched) {
            existing.rootFolderId = null;
            existing.rootFolderName = null;
          }
          await repo.save(existing);

          if (accountSwitched) {
            await manager
              .getRepository(DeliveryClientDriveMappingEntity)
              .delete({ workspaceId: verified.w });
          }
        } else {
          await repo.save(
            repo.create({
              workspaceId: verified.w,
              googleEmail,
              encryptedAccessToken,
              encryptedRefreshToken,
              tokenExpiresAt,
              monthFolderPattern: '{Month} {YYYY}',
              folderMode: 'FLAT',
              includeOriginalInVariationFolder: false,
              autoPurgeVpsEnabled: true,
              autoPurgeVpsAfterHours: 24,
              connectedBy: verified.m,
              revokedAt: null,
            }),
          );
        }

        await recordOtogrowActivity(manager, {
          workspaceId: verified.w,
          actorId: verified.m,
          category: 'DELIVERY',
          action: 'GOOGLE_DRIVE_CONNECTED',
          outcome: 'RECORDED',
          summary: `Connected Google Drive (${googleEmail}) for automatic deliverable syncing.`,
          sourceType: 'drive-connection',
          sourceId: verified.w,
          changes: [{ field: 'googleEmail', before: null, after: googleEmail }],
        });
      });

      if (missingRefreshToken) {
        return { redirectUrl: buildRedirect('error:missing_refresh_token') };
      }

      return { redirectUrl: buildRedirect('connected') };
    } catch (error) {
      this.logger.warn(
        `Google Drive OAuth callback failed for workspace ${verified.w}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { redirectUrl: buildRedirect('error:callback_failed') };
    }
  }

  async updateSettings(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<DeliveryDriveConfigDTO> {
    const parsed = updateDriveSettingsSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid Google Drive settings.',
      );
    }
    const input = parsed.data;
    const { workspaceId, memberId, userWorkspaceId } = this.identity(auth);
    await this.authorizeManager(workspaceId, memberId, userWorkspaceId);

    const validatedPattern =
      input.monthFolderPattern !== undefined
        ? validateMonthPatternOrThrow(input.monthFolderPattern)
        : undefined;

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(DeliveryDriveConnectionEntity);
      const connection = await repo.findOne({
        where: { workspaceId, revokedAt: IsNull() },
      });
      if (!connection) {
        throw new BadRequestException(
          'Connect Google Drive before updating sync settings.',
        );
      }

      const patternChanged =
        validatedPattern !== undefined &&
        validatedPattern !== connection.monthFolderPattern;

      if (input.rootFolderId !== undefined) {
        connection.rootFolderId = input.rootFolderId;
      }
      if (input.rootFolderName !== undefined) {
        connection.rootFolderName = input.rootFolderName;
      }
      if (validatedPattern !== undefined) {
        connection.monthFolderPattern = validatedPattern;
      }
      if (input.folderMode !== undefined) {
        connection.folderMode = input.folderMode;
      }
      if (input.includeOriginalInVariationFolder !== undefined) {
        connection.includeOriginalInVariationFolder =
          input.includeOriginalInVariationFolder;
      }
      if (input.autoPurgeVpsEnabled !== undefined) {
        connection.autoPurgeVpsEnabled = input.autoPurgeVpsEnabled;
      }
      if (input.autoPurgeVpsAfterHours !== undefined) {
        connection.autoPurgeVpsAfterHours = input.autoPurgeVpsAfterHours;
      }

      await repo.save(connection);

      if (patternChanged) {
        // Clear cached month folder IDs on mappings without an override so new format resolves cleanly.
        const mappings = await manager
          .getRepository(DeliveryClientDriveMappingEntity)
          .find({ where: { workspaceId } });
        for (const mapping of mappings) {
          if (!mapping.monthFolderPatternOverride) {
            mapping.monthFolderCache = buildClearedMonthCache(
              mapping.monthFolderCache,
            );
            await manager
              .getRepository(DeliveryClientDriveMappingEntity)
              .save(mapping);
          }
        }
      }

      await recordOtogrowActivity(manager, {
        workspaceId,
        actorId: memberId,
        category: 'DELIVERY',
        action: 'GOOGLE_DRIVE_SETTINGS_UPDATED',
        outcome: 'RECORDED',
        summary: `Updated Google Drive sync settings (month format: "${connection.monthFolderPattern}", VPS auto-purge: ${connection.autoPurgeVpsEnabled ? `${connection.autoPurgeVpsAfterHours}h` : 'off'}).`,
        sourceType: 'drive-connection',
        sourceId: connection.id,
        changes: [
          {
            field: 'monthFolderPattern',
            before: null,
            after: connection.monthFolderPattern,
          },
          {
            field: 'autoPurgeVpsAfterHours',
            before: null,
            after: String(connection.autoPurgeVpsAfterHours),
          },
        ],
      });
    });

    return this.getConfig(auth);
  }

  async disconnect(
    auth: WorkspaceAuthContext,
  ): Promise<DeliveryDriveConfigDTO> {
    const { workspaceId, memberId, userWorkspaceId } = this.identity(auth);
    await this.authorizeManager(workspaceId, memberId, userWorkspaceId);

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(DeliveryDriveConnectionEntity);
      const connection = await repo.findOne({
        where: { workspaceId, revokedAt: IsNull() },
      });
      if (!connection) return;
      connection.revokedAt = new Date();
      await repo.save(connection);

      await recordOtogrowActivity(manager, {
        workspaceId,
        actorId: memberId,
        category: 'DELIVERY',
        action: 'GOOGLE_DRIVE_DISCONNECTED',
        outcome: 'RECORDED',
        summary: `Disconnected Google Drive (${connection.googleEmail}).`,
        sourceType: 'drive-connection',
        sourceId: connection.id,
        changes: [],
      });
    });

    return this.getConfig(auth);
  }

  private async getAuthorizedDriveClient(workspaceId: string): Promise<{
    drive: drive_v3.Drive;
    connection: DeliveryDriveConnectionEntity;
  }> {
    const connection = await this.dataSource
      .getRepository(DeliveryDriveConnectionEntity)
      .createQueryBuilder('c')
      .addSelect('c.encryptedAccessToken')
      .addSelect('c.encryptedRefreshToken')
      .where('c.workspaceId = :workspaceId', { workspaceId })
      .andWhere('c.revokedAt IS NULL')
      .getOne();

    if (!connection) {
      throw new ServiceUnavailableException(
        'Google Drive is not connected for this workspace.',
      );
    }

    const accessToken = this.secretEncryption.decryptVersionedOrThrow(
      connection.encryptedAccessToken,
      { workspaceId },
    );
    const refreshToken = this.secretEncryption.decryptVersionedOrThrow(
      connection.encryptedRefreshToken,
      { workspaceId },
    );

    const oauth2Client = this.buildOAuthClient();
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: connection.tokenExpiresAt?.getTime(),
    });

    const isExpiringSoon =
      !connection.tokenExpiresAt ||
      connection.tokenExpiresAt.getTime() <= Date.now() + 120_000;

    if (isExpiringSoon) {
      const refreshed = await oauth2Client.getAccessToken();
      if (refreshed.token && refreshed.token !== accessToken) {
        const nextExpiry =
          oauth2Client.credentials.expiry_date ?? Date.now() + 3500 * 1000;
        const nextRefreshToken = oauth2Client.credentials.refresh_token;
        await this.dataSource
          .getRepository(DeliveryDriveConnectionEntity)
          .update(
            { id: connection.id },
            {
              encryptedAccessToken: this.secretEncryption.encryptVersioned(
                refreshed.token as PlaintextString,
                { workspaceId },
              ),
              ...(nextRefreshToken && nextRefreshToken !== refreshToken
                ? {
                    encryptedRefreshToken:
                      this.secretEncryption.encryptVersioned(
                        nextRefreshToken as PlaintextString,
                        { workspaceId },
                      ),
                  }
                : {}),
              tokenExpiresAt: new Date(nextExpiry),
            },
          );
      }
    }

    return {
      drive: google.drive({ version: 'v3', auth: oauth2Client }),
      connection,
    };
  }

  async listFolders(
    auth: WorkspaceAuthContext,
    parentId?: string | null,
    search?: string | null,
  ): Promise<DriveFolderOption[]> {
    const { workspaceId, memberId, userWorkspaceId } = this.identity(auth);
    await this.authorizeManager(workspaceId, memberId, userWorkspaceId);

    const { drive } = await this.getAuthorizedDriveClient(workspaceId);
    const clauses = [`mimeType = '${FOLDER_MIME}'`, 'trashed = false'];
    if (parentId?.trim()) {
      clauses.push(`'${escapeDriveQueryValue(parentId.trim())}' in parents`);
    }
    if (search?.trim()) {
      clauses.push(
        `name contains '${escapeDriveQueryValue(search.trim().slice(0, 80))}'`,
      );
    }

    const res = await drive.files.list({
      q: clauses.join(' and '),
      fields: 'files(id,name,webViewLink)',
      orderBy: 'modifiedTime desc,name asc',
      pageSize: 60,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return (res.data.files ?? [])
      .filter((f): f is { id: string; name: string; webViewLink?: string | null } =>
        Boolean(f.id && f.name),
      )
      .map((f) => ({
        id: f.id,
        name: f.name,
        webViewLink: f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}`,
      }));
  }

  private async listDirectChildFolders(
    drive: drive_v3.Drive,
    parentId: string,
    search?: string | null,
    pageSize = 100,
  ): Promise<DriveFolderOption[]> {
    const clauses = [
      `mimeType = '${FOLDER_MIME}'`,
      'trashed = false',
      `'${escapeDriveQueryValue(parentId)}' in parents`,
    ];
    if (search?.trim()) {
      clauses.push(
        `name contains '${escapeDriveQueryValue(search.trim().slice(0, 80))}'`,
      );
    }
    const res = await drive.files.list({
      q: clauses.join(' and '),
      fields: 'files(id,name,webViewLink)',
      orderBy: 'modifiedTime desc,name asc',
      pageSize,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return (res.data.files ?? [])
      .filter((f): f is { id: string; name: string; webViewLink?: string | null } =>
        Boolean(f.id && f.name),
      )
      .map((f) => ({
        id: f.id,
        name: f.name,
        webViewLink:
          f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}`,
      }));
  }

  async listClientSubfolders(
    auth: WorkspaceAuthContext,
    companyId: string,
    search?: string | null,
    requestedRootFolderId?: string | null,
  ): Promise<{
    connected: boolean;
    clientMapped: boolean;
    rootFolderId: string | null;
    rootFolderName: string | null;
    rootFolderWebUrl: string | null;
    selectedRootFolderId: string | null;
    rootFolders: ClientDriveRootFolderOption[];
    monthStartDay: number;
    monthStartDaySource: MonthStartDaySource;
    activeMonthKey: string;
    activeCycleLabel: string;
    expectedMonthFolderName: string;
    matchedMonthFolder: DriveFolderOption | null;
    monthSubfolders: DriveFolderOption[];
    subfolders: DriveFolderOption[];
  }> {
    const { workspaceId, memberId, userWorkspaceId } = this.identity(auth);
    await this.authorizeStaff(workspaceId, memberId, userWorkspaceId);

    const connection = await this.dataSource
      .getRepository(DeliveryDriveConnectionEntity)
      .findOne({ where: { workspaceId } });

    const mapping = await this.dataSource
      .getRepository(DeliveryClientDriveMappingEntity)
      .findOne({ where: { workspaceId, companyId } });

    const { monthStartDay, source: monthStartDaySource } =
      await this.resolveClientMonthStartDay(workspaceId, companyId, mapping);
    const cycle = resolveClientBillingCycle(monthStartDay);
    const pattern =
      mapping?.monthFolderPatternOverride ||
      connection?.monthFolderPattern ||
      '{Month} {YYYY}';
    const expectedMonthFolderName = formatDriveMonthFolder(
      cycle.cycleMonthKey,
      pattern,
    );

    if (!connection || connection.revokedAt) {
      return {
        connected: false,
        clientMapped: false,
        rootFolderId: null,
        rootFolderName: null,
        rootFolderWebUrl: null,
        selectedRootFolderId: null,
        rootFolders: [],
        monthStartDay,
        monthStartDaySource,
        activeMonthKey: cycle.cycleMonthKey,
        activeCycleLabel: cycle.cycleLabel,
        expectedMonthFolderName,
        matchedMonthFolder: null,
        monthSubfolders: [],
        subfolders: [],
      };
    }

    const rootFolders = readClientRootFolders(mapping);
    if (!mapping?.rootFolderId || rootFolders.length === 0) {
      return {
        connected: true,
        clientMapped: false,
        rootFolderId: connection.rootFolderId ?? null,
        rootFolderName: connection.rootFolderName ?? null,
        rootFolderWebUrl: connection.rootFolderId
          ? `https://drive.google.com/drive/folders/${connection.rootFolderId}`
          : null,
        selectedRootFolderId: null,
        rootFolders: [],
        monthStartDay,
        monthStartDaySource,
        activeMonthKey: cycle.cycleMonthKey,
        activeCycleLabel: cycle.cycleLabel,
        expectedMonthFolderName,
        matchedMonthFolder: null,
        monthSubfolders: [],
        subfolders: [],
      };
    }

    const requestedTrimmed = requestedRootFolderId?.trim() || '';
    const activeRoot =
      (requestedTrimmed
        ? rootFolders.find((f) => f.id === requestedTrimmed)
        : null) ?? rootFolders[0];

    const searchTrimmed = search?.trim() || '';

    try {
      const { drive } = await this.getAuthorizedDriveClient(workspaceId);
      const allRootChildren = await this.listDirectChildFolders(
        drive,
        activeRoot.id,
        null,
        100,
      );
      const matchedMonthFolder = matchExistingMonthSubfolder(allRootChildren, {
        monthKey: cycle.cycleMonthKey,
        expectedName: expectedMonthFolderName,
        monthStartDay,
      });

      let monthSubfolders: DriveFolderOption[] = [];
      if (matchedMonthFolder) {
        try {
          monthSubfolders = await this.listDirectChildFolders(
            drive,
            matchedMonthFolder.id,
            searchTrimmed || null,
            60,
          );
        } catch {
          monthSubfolders = [];
        }
      }

      let subfolders = allRootChildren;
      if (searchTrimmed) {
        const lowerSearch = searchTrimmed.toLowerCase();
        const filteredLocal = allRootChildren.filter((folder) =>
          folder.name.toLowerCase().includes(lowerSearch),
        );
        if (filteredLocal.length > 0 || allRootChildren.length < 100) {
          subfolders = filteredLocal;
        } else {
          subfolders = await this.listDirectChildFolders(
            drive,
            activeRoot.id,
            searchTrimmed,
            60,
          );
        }
      }

      return {
        connected: true,
        clientMapped: true,
        rootFolderId: activeRoot.id,
        rootFolderName: activeRoot.name,
        rootFolderWebUrl: activeRoot.webViewLink,
        selectedRootFolderId: activeRoot.id,
        rootFolders,
        monthStartDay,
        monthStartDaySource,
        activeMonthKey: cycle.cycleMonthKey,
        activeCycleLabel: cycle.cycleLabel,
        expectedMonthFolderName,
        matchedMonthFolder,
        monthSubfolders,
        subfolders,
      };
    } catch {
      return {
        connected: true,
        clientMapped: true,
        rootFolderId: activeRoot.id,
        rootFolderName: activeRoot.name,
        rootFolderWebUrl: activeRoot.webViewLink,
        selectedRootFolderId: activeRoot.id,
        rootFolders,
        monthStartDay,
        monthStartDaySource,
        activeMonthKey: cycle.cycleMonthKey,
        activeCycleLabel: cycle.cycleLabel,
        expectedMonthFolderName,
        matchedMonthFolder: null,
        monthSubfolders: [],
        subfolders: [],
      };
    }
  }

  async createFolder(
    auth: WorkspaceAuthContext,
    name: string,
    parentId?: string | null,
  ): Promise<DriveFolderOption> {
    const { workspaceId, memberId, userWorkspaceId } = this.identity(auth);
    await this.authorizeManager(workspaceId, memberId, userWorkspaceId);

    const cleanName = sanitizeFolderName(name);
    const { drive } = await this.getAuthorizedDriveClient(workspaceId);
    return this.createDriveFolderInternal(drive, cleanName, parentId ?? null);
  }

  private async createDriveFolderInternal(
    drive: drive_v3.Drive,
    name: string,
    parentId: string | null,
  ): Promise<DriveFolderOption> {
    const created = await drive.files.create({
      requestBody: {
        name: sanitizeFolderName(name),
        mimeType: FOLDER_MIME,
        parents: parentId ? [parentId] : undefined,
      },
      fields: 'id,name,webViewLink',
      supportsAllDrives: true,
    });
    if (!created.data.id) {
      throw new ServiceUnavailableException(
        'Google Drive did not return a folder ID.',
      );
    }
    return {
      id: created.data.id,
      name: created.data.name ?? name,
      webViewLink:
        created.data.webViewLink ??
        `https://drive.google.com/drive/folders/${created.data.id}`,
    };
  }

  private async findOrCreateChildFolder(
    drive: drive_v3.Drive,
    parentId: string,
    folderName: string,
  ): Promise<DriveFolderOption> {
    const cleanName = sanitizeFolderName(folderName);
    const listRes = await drive.files.list({
      q: `'${escapeDriveQueryValue(parentId)}' in parents and mimeType = '${FOLDER_MIME}' and name = '${escapeDriveQueryValue(cleanName)}' and trashed = false`,
      fields: 'files(id,name,webViewLink)',
      pageSize: 5,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const existing = listRes.data.files?.[0];
    if (existing?.id) {
      return {
        id: existing.id,
        name: existing.name ?? cleanName,
        webViewLink:
          existing.webViewLink ??
          `https://drive.google.com/drive/folders/${existing.id}`,
      };
    }
    return this.createDriveFolderInternal(drive, cleanName, parentId);
  }

  private async verifyFolderActive(
    drive: drive_v3.Drive,
    folderId: string,
  ): Promise<boolean> {
    try {
      const res = await drive.files.get({
        fileId: folderId,
        fields: 'id,trashed',
        supportsAllDrives: true,
      });
      return Boolean(res.data.id && !res.data.trashed);
    } catch {
      return false;
    }
  }

  async isDriveFileActive(
    workspaceId: string,
    driveFileId: string,
  ): Promise<'ACTIVE' | 'MISSING' | 'UNAVAILABLE'> {
    try {
      const { drive } = await this.getAuthorizedDriveClient(workspaceId);
      const res = await drive.files.get({
        fileId: driveFileId,
        fields: 'id,trashed',
        supportsAllDrives: true,
      });
      if (!res.data.id || res.data.trashed) {
        return 'MISSING';
      }
      return 'ACTIVE';
    } catch (error) {
      const status = extractDriveHttpStatus(error);
      if (status === 404) {
        return 'MISSING';
      }
      return 'UNAVAILABLE';
    }
  }

  async bindClientFolder(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<ClientDriveMappingDTO> {
    const parsed = bindClientDriveFolderSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid client Drive folder input.',
      );
    }
    const input = parsed.data;
    const { workspaceId, memberId, userWorkspaceId } = this.identity(auth);
    await this.authorizeManager(workspaceId, memberId, userWorkspaceId);

    const validatedOverride =
      input.monthFolderPatternOverride === null
        ? null
        : input.monthFolderPatternOverride !== undefined
          ? validateMonthPatternOrThrow(input.monthFolderPatternOverride)
          : undefined;

    const { drive, connection } =
      await this.getAuthorizedDriveClient(workspaceId);
    const companyNames = await this.loadCompanyNames(workspaceId);
    const companyName =
      input.companyName?.trim() ||
      companyNames.get(input.companyId) ||
      `Client ${input.companyId.slice(0, 8)}`;

    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`drive-client:${workspaceId}:${input.companyId}`],
      );

      const repo = manager.getRepository(DeliveryClientDriveMappingEntity);
      let mapping = await repo.findOne({
        where: { workspaceId, companyId: input.companyId },
      });

      const verifyAndResolveFolder = async (
        candidateId: string,
        fallbackName: string,
      ): Promise<{ id: string; name: string; webViewLink: string }> => {
        const meta = await drive.files.get({
          fileId: candidateId,
          fields: 'id,name,mimeType,webViewLink,trashed',
          supportsAllDrives: true,
        });
        if (!meta.data.id || meta.data.trashed) {
          throw new BadRequestException(
            'Selected Google Drive folder was not found or is in Trash.',
          );
        }
        if (meta.data.mimeType !== FOLDER_MIME) {
          throw new BadRequestException(
            'Selected Google Drive item is not a folder. Choose a Drive folder.',
          );
        }
        return {
          id: meta.data.id,
          name: meta.data.name ?? fallbackName,
          webViewLink:
            meta.data.webViewLink ??
            `https://drive.google.com/drive/folders/${meta.data.id}`,
        };
      };

      let folderId = input.rootFolderId?.trim() || '';
      let folderName = input.rootFolderName?.trim() || companyName;
      let folderWebUrl: string | null = null;
      let primaryFolderLabelUpdate: string | null | undefined = undefined;
      let extraRootFoldersUpdate: StoredExtraRootFolder[] | undefined =
        undefined;

      if (
        !input.autoCreate &&
        Array.isArray(input.rootFolders) &&
        input.rootFolders.length > 0
      ) {
        const dedupedInputs: Array<{
          id: string;
          name?: string;
          label: string | null;
          isDefault: boolean;
        }> = [];
        const seenIds = new Set<string>();
        for (const entry of input.rootFolders) {
          const cleanId = entry.id.trim();
          if (!cleanId || seenIds.has(cleanId)) continue;
          seenIds.add(cleanId);
          dedupedInputs.push({
            id: cleanId,
            name: entry.name?.trim(),
            label: entry.label?.trim() ? entry.label.trim().slice(0, 80) : null,
            isDefault: Boolean(entry.isDefault),
          });
        }

        if (dedupedInputs.length === 0) {
          throw new BadRequestException(
            'Select at least one Google Drive folder for this client.',
          );
        }

        const resolvedList: Array<{
          id: string;
          name: string;
          webViewLink: string;
          label: string | null;
          isDefault: boolean;
        }> = [];
        for (const entry of dedupedInputs) {
          const verified = await verifyAndResolveFolder(
            entry.id,
            entry.name || companyName,
          );
          resolvedList.push({
            ...verified,
            label: entry.label,
            isDefault: entry.isDefault,
          });
        }

        const defaultIdx = Math.max(
          0,
          resolvedList.findIndex((item) => item.isDefault),
        );
        const primary = resolvedList[defaultIdx];
        folderId = primary.id;
        folderName = primary.name;
        folderWebUrl = primary.webViewLink;
        primaryFolderLabelUpdate = primary.label;
        extraRootFoldersUpdate = resolvedList
          .filter((_, idx) => idx !== defaultIdx)
          .map((item) => ({
            id: item.id,
            name: item.name,
            webViewLink: item.webViewLink,
            label: item.label,
          }));
      } else if (!input.autoCreate && !folderId && mapping?.rootFolderId) {
        // Metadata-only update (e.g. changing monthStartDay or monthFolderPatternOverride)
        folderId = mapping.rootFolderId;
        folderName = mapping.rootFolderName;
        folderWebUrl = mapping.rootFolderWebUrl;
      } else if (input.autoCreate || !folderId) {
        if (connection.rootFolderId) {
          const folder = await this.findOrCreateChildFolder(
            drive,
            connection.rootFolderId,
            companyName,
          );
          folderId = folder.id;
          folderName = folder.name;
          folderWebUrl = folder.webViewLink;
        } else {
          const folder = await this.createDriveFolderInternal(
            drive,
            companyName,
            null,
          );
          folderId = folder.id;
          folderName = folder.name;
          folderWebUrl = folder.webViewLink;
        }
      } else {
        const verified = await verifyAndResolveFolder(folderId, folderName);
        folderId = verified.id;
        folderName = verified.name;
        folderWebUrl = verified.webViewLink;
      }

      if (mapping) {
        const folderChanged = mapping.rootFolderId !== folderId;
        const patternChanged =
          validatedOverride !== undefined &&
          validatedOverride !== mapping.monthFolderPatternOverride;
        const prevExplicitDay = readExplicitMonthStartDay(
          mapping.monthFolderCache,
        );
        const monthStartDayChanged =
          input.monthStartDay !== undefined &&
          input.monthStartDay !== prevExplicitDay;
        const extrasChanged = extraRootFoldersUpdate !== undefined;
        mapping.rootFolderId = folderId;
        mapping.rootFolderName = folderName;
        mapping.rootFolderWebUrl = folderWebUrl;
        if (validatedOverride !== undefined) {
          mapping.monthFolderPatternOverride = validatedOverride;
        }
        const metaUpdates = {
          monthStartDay: input.monthStartDay,
          primaryFolderLabel: primaryFolderLabelUpdate,
          extraRootFolders: extraRootFoldersUpdate,
        };
        if (folderChanged || patternChanged || monthStartDayChanged) {
          mapping.monthFolderCache = buildClearedMonthCache(
            mapping.monthFolderCache,
            metaUpdates,
          );
        } else if (
          input.monthStartDay !== undefined ||
          extrasChanged ||
          primaryFolderLabelUpdate !== undefined
        ) {
          mapping.monthFolderCache = applyMetaToCache(
            mapping.monthFolderCache,
            metaUpdates,
          );
        }
      } else {
        mapping = repo.create({
          workspaceId,
          companyId: input.companyId,
          rootFolderId: folderId,
          rootFolderName: folderName,
          rootFolderWebUrl: folderWebUrl,
          monthFolderPatternOverride: validatedOverride ?? null,
          monthFolderCache: buildClearedMonthCache(undefined, {
            monthStartDay: input.monthStartDay ?? null,
            primaryFolderLabel: primaryFolderLabelUpdate ?? null,
            extraRootFolders: extraRootFoldersUpdate ?? [],
          }),
        });
      }
      return repo.save(mapping);
    });

    const { monthStartDay, source: monthStartDaySource } =
      await this.resolveClientMonthStartDay(workspaceId, saved.companyId, saved);
    const cycle = resolveClientBillingCycle(monthStartDay);
    const effPattern =
      saved.monthFolderPatternOverride || connection.monthFolderPattern;
    return {
      companyId: saved.companyId,
      companyName,
      rootFolderId: saved.rootFolderId,
      rootFolderName: saved.rootFolderName,
      rootFolderWebUrl: saved.rootFolderWebUrl,
      rootFolders: readClientRootFolders(saved),
      monthStartDay,
      monthStartDaySource,
      activeMonthKey: cycle.cycleMonthKey,
      activeCycleLabel: cycle.cycleLabel,
      monthFolderPatternOverride: saved.monthFolderPatternOverride,
      monthFolderPreview: formatDriveMonthFolder(
        cycle.cycleMonthKey,
        effPattern,
      ),
    };
  }

  async enqueueDeliverableSyncIfConnected(
    workspaceId: string,
    deliverableId: string,
  ): Promise<boolean> {
    if (!isUuidString(deliverableId)) return false;
    const connection = await this.dataSource
      .getRepository(DeliveryDriveConnectionEntity)
      .findOne({ where: { workspaceId, revokedAt: IsNull() } });
    if (!connection) return false;

    const deliverable = await this.dataSource
      .getRepository(DeliveryDeliverableEntity)
      .findOne({ where: { workspaceId, id: deliverableId } });
    if (!deliverable || deliverable.assetKind === 'LINK') return false;

    await this.dataSource
      .getRepository(DeliveryDeliverableEntity)
      .update(
        { workspaceId, id: deliverableId },
        { driveSyncStatus: 'QUEUED', driveSyncError: null },
      );

    await this.driveSyncQueue.add<{
      workspaceId: string;
      deliverableId: string;
    }>(
      DELIVERY_DRIVE_SYNC_JOB,
      { workspaceId, deliverableId },
      { id: `drive-sync:${workspaceId}:${deliverableId}` },
    );

    return true;
  }

  async requestDeliverableSync(
    auth: WorkspaceAuthContext,
    deliverableId: string,
  ): Promise<{ queued: boolean; message: string }> {
    if (!isUuidString(deliverableId)) {
      throw new BadRequestException('Invalid deliverable ID.');
    }
    const { workspaceId, memberId, userWorkspaceId } = this.identity(auth);
    const actor = await this.authorizeStaff(
      workspaceId,
      memberId,
      userWorkspaceId,
    );

    const deliverable = await this.dataSource
      .getRepository(DeliveryDeliverableEntity)
      .findOne({ where: { workspaceId, id: deliverableId } });
    if (!deliverable || deliverable.assetKind === 'LINK') {
      throw new NotFoundException(
        'Deliverable not found or is an external link that cannot be uploaded to Drive.',
      );
    }

    if (!actor.isManager) {
      const projects = await this.dataSource
        .getRepository(DeliveryProjectEntity)
        .find({ where: { workspaceId, companyId: deliverable.companyId } });
      const hasCompanyAccess = projects.some(
        (project) =>
          Array.isArray(project.memberIds) &&
          project.memberIds.includes(memberId),
      );
      if (!hasCompanyAccess) {
        throw new ForbiddenException(
          'You do not have access to trigger Google Drive sync for this client deliverable.',
        );
      }
    }

    const connection = await this.dataSource
      .getRepository(DeliveryDriveConnectionEntity)
      .findOne({ where: { workspaceId, revokedAt: IsNull() } });
    if (!connection) {
      throw new BadRequestException(
        'Google Drive is not connected yet. Connect Google Drive first.',
      );
    }

    const queued = await this.enqueueDeliverableSyncIfConnected(
      workspaceId,
      deliverableId,
    );
    if (!queued) {
      throw new NotFoundException(
        'Deliverable not found or is an external link that cannot be uploaded to Drive.',
      );
    }
    return { queued: true, message: 'Queued Google Drive sync.' };
  }

  private async ensureClientMapping(
    manager: EntityManager,
    drive: drive_v3.Drive,
    connection: DeliveryDriveConnectionEntity,
    workspaceId: string,
    companyId: string,
  ): Promise<DeliveryClientDriveMappingEntity> {
    const repo = manager.getRepository(DeliveryClientDriveMappingEntity);
    const existing = await repo.findOne({ where: { workspaceId, companyId } });
    if (existing) {
      return existing;
    }
    if (!connection.rootFolderId) {
      throw new Error(
        'No Google Drive folder bound for this client and no workspace root folder configured.',
      );
    }

    const companyNames = await this.loadCompanyNames(workspaceId);
    const companyName =
      companyNames.get(companyId) ?? `Client ${companyId.slice(0, 8)}`;
    const folder = await this.findOrCreateChildFolder(
      drive,
      connection.rootFolderId,
      companyName,
    );
    const created = repo.create({
      workspaceId,
      companyId,
      rootFolderId: folder.id,
      rootFolderName: folder.name,
      rootFolderWebUrl: folder.webViewLink,
      monthFolderPatternOverride: null,
      monthFolderCache: {},
    });
    return repo.save(created);
  }

  private async resolveTargetParentFolder(
    manager: EntityManager,
    drive: drive_v3.Drive,
    connection: DeliveryDriveConnectionEntity,
    mapping: DeliveryClientDriveMappingEntity,
    deliverable: DeliveryDeliverableEntity,
  ): Promise<DriveFolderOption> {
    const explicitFolderId = deliverable.mediaMeta?.driveTargetFolderId?.trim();
    const subfolderName = deliverable.mediaMeta?.driveSubfolderName?.trim();

    if (explicitFolderId) {
      const stillValid = await this.verifyFolderActive(drive, explicitFolderId);
      if (stillValid) {
        const explicitFolder: DriveFolderOption = {
          id: explicitFolderId,
          name: subfolderName || 'Selected Folder',
          webViewLink: `https://drive.google.com/drive/folders/${explicitFolderId}`,
        };
        if (subfolderName) {
          return this.findOrCreateChildFolder(
            drive,
            explicitFolder.id,
            sanitizeFolderName(subfolderName),
          );
        }
        return explicitFolder;
      }
    }

    const requestedRootId = deliverable.mediaMeta?.driveRootFolderId?.trim();
    const linkedRoots = readClientRootFolders(mapping);
    let effectiveRootId = mapping.rootFolderId;
    if (requestedRootId && requestedRootId !== mapping.rootFolderId) {
      const matchedLinked = linkedRoots.find((f) => f.id === requestedRootId);
      if (matchedLinked) {
        effectiveRootId = matchedLinked.id;
      } else {
        const stillValidRoot = await this.verifyFolderActive(
          drive,
          requestedRootId,
        );
        if (stillValidRoot) {
          effectiveRootId = requestedRootId;
        }
      }
    }

    const pattern =
      mapping.monthFolderPatternOverride || connection.monthFolderPattern;
    const expectedMonthFolderName = formatDriveMonthFolder(
      deliverable.monthKey,
      pattern,
    );

    const cacheKey =
      effectiveRootId === mapping.rootFolderId
        ? `${deliverable.monthKey}::${expectedMonthFolderName}`
        : `${effectiveRootId}::${deliverable.monthKey}::${expectedMonthFolderName}`;
    const cached = mapping.monthFolderCache?.[cacheKey];
    let monthFolder: DriveFolderOption | null = null;

    if (cached?.folderId) {
      const stillValid = await this.verifyFolderActive(drive, cached.folderId);
      if (stillValid) {
        monthFolder = {
          id: cached.folderId,
          name: cached.folderName,
          webViewLink: cached.webUrl,
        };
      }
    }

    if (!monthFolder) {
      const { monthStartDay } = await this.resolveClientMonthStartDay(
        mapping.workspaceId,
        mapping.companyId,
        mapping,
      );
      try {
        const existingChildren = await this.listDirectChildFolders(
          drive,
          effectiveRootId,
          null,
          100,
        );
        monthFolder = matchExistingMonthSubfolder(existingChildren, {
          monthKey: deliverable.monthKey,
          expectedName: expectedMonthFolderName,
          monthStartDay,
        });
      } catch {
        monthFolder = null;
      }

      if (!monthFolder) {
        monthFolder = await this.findOrCreateChildFolder(
          drive,
          effectiveRootId,
          expectedMonthFolderName,
        );
      }

      const nextCache = {
        ...(mapping.monthFolderCache ?? {}),
        [cacheKey]: {
          folderId: monthFolder.id,
          folderName: monthFolder.name,
          webUrl: monthFolder.webViewLink,
        },
      };
      mapping.monthFolderCache = nextCache;
      await manager
        .getRepository(DeliveryClientDriveMappingEntity)
        .save(mapping);
    }

    let targetFolder = monthFolder;
    if (connection.folderMode === 'SERVICE_SPLIT') {
      const serviceFolderName = sanitizeFolderName(
        deliverable.serviceKey || 'General',
      );
      targetFolder = await this.findOrCreateChildFolder(
        drive,
        monthFolder.id,
        serviceFolderName,
      );
    }

    if (subfolderName) {
      return this.findOrCreateChildFolder(
        drive,
        targetFolder.id,
        sanitizeFolderName(subfolderName),
      );
    }

    return targetFolder;
  }

  private async uploadLocalFileToDrive(
    drive: drive_v3.Drive,
    params: {
      storageKey: string;
      parentFolderId: string;
      fileName: string;
      mimeType: string;
      existingDriveFileId?: string | null;
    },
  ): Promise<{ id: string; webViewLink: string }> {
    const driver = this.storage.getCurrentDriver();

    let activeExistingId: string | null = null;
    let existingParents: string[] = [];
    if (params.existingDriveFileId) {
      try {
        const meta = await drive.files.get({
          fileId: params.existingDriveFileId,
          fields: 'id,parents,trashed',
          supportsAllDrives: true,
        });
        if (meta.data.id && !meta.data.trashed) {
          activeExistingId = meta.data.id;
          existingParents = meta.data.parents ?? [];
        }
      } catch {
        activeExistingId = null;
      }
    }

    const readStream = await driver.readFile({ filePath: params.storageKey });
    try {
      if (activeExistingId) {
        const needsMove = !existingParents.includes(params.parentFolderId);
        const updated = await drive.files.update({
          fileId: activeExistingId,
          addParents: needsMove ? params.parentFolderId : undefined,
          removeParents:
            needsMove && existingParents.length > 0
              ? existingParents.join(',')
              : undefined,
          requestBody: { name: params.fileName },
          media: {
            mimeType: params.mimeType,
            body: readStream,
          },
          fields: 'id,webViewLink',
          supportsAllDrives: true,
        });
        const id = updated.data.id ?? activeExistingId;
        return {
          id,
          webViewLink:
            updated.data.webViewLink ??
            `https://drive.google.com/file/d/${id}/view`,
        };
      }

      const created = await drive.files.create({
        requestBody: {
          name: params.fileName,
          parents: [params.parentFolderId],
        },
        media: {
          mimeType: params.mimeType,
          body: readStream,
        },
        fields: 'id,webViewLink',
        supportsAllDrives: true,
      });
      if (!created.data.id) {
        throw new Error('Google Drive upload did not return a file ID.');
      }
      return {
        id: created.data.id,
        webViewLink:
          created.data.webViewLink ??
          `https://drive.google.com/file/d/${created.data.id}/view`,
      };
    } catch (error) {
      if ('destroy' in readStream && typeof readStream.destroy === 'function') {
        readStream.destroy();
      }
      throw error;
    }
  }

  async syncDeliverableToDrive(
    workspaceId: string,
    deliverableId: string,
  ): Promise<void> {
    const deliverableRepo = this.dataSource.getRepository(
      DeliveryDeliverableEntity,
    );
    const variationRepo = this.dataSource.getRepository(
      DeliveryVideoHookVariationEntity,
    );

    const deliverable = await deliverableRepo.findOne({
      where: { workspaceId, id: deliverableId },
    });
    if (!deliverable || deliverable.assetKind === 'LINK') {
      return;
    }

    await deliverableRepo.update(
      { workspaceId, id: deliverableId },
      { driveSyncStatus: 'SYNCING', driveSyncError: null },
    );

    try {
      const { drive, connection } =
        await this.getAuthorizedDriveClient(workspaceId);

      // Serialize folder resolution per workspace + client company so parallel jobs never create duplicate client or month folders.
      const { parentFolder } = await this.dataSource.transaction(
        async (manager) => {
          await manager.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [`drive-client:${workspaceId}:${deliverable.companyId}`],
          );
          const mapping = await this.ensureClientMapping(
            manager,
            drive,
            connection,
            workspaceId,
            deliverable.companyId,
          );
          const resolvedParent = await this.resolveTargetParentFolder(
            manager,
            drive,
            connection,
            mapping,
            deliverable,
          );
          return { mapping, parentFolder: resolvedParent };
        },
      );

      const allVariations = await variationRepo.find({
        where: { workspaceId, deliverableId: deliverable.id },
        order: { variationNumber: 'ASC' },
      });
      const readyVariations = allVariations.filter(
        (variation) => variation.renderStatus === 'READY',
      );

      const shouldUseVariationFolder =
        readyVariations.length > 0 ||
        (deliverable.hasVariations &&
          connection.includeOriginalInVariationFolder);

      if (!shouldUseVariationFolder) {
        // Standalone file: e.g. Month / 1.mp4
        const fileName = formatDriveDeliverableFilename(
          deliverable.sequenceNumber,
          deliverable.mimeType,
        );

        if (
          deliverable.driveFileId &&
          deliverable.storageState === 'DRIVE_ONLY'
        ) {
          await this.moveOrRenameDriveFile(
            drive,
            deliverable.driveFileId,
            fileName,
            parentFolder.id,
          );
          await deliverableRepo.update(
            { workspaceId, id: deliverable.id },
            {
              driveFolderId: parentFolder.id,
              driveSyncStatus: 'SYNCED',
              driveSyncedAt: new Date(),
              driveSyncError: null,
            },
          );
          return;
        }

        if (!deliverable.storageKey) {
          throw new Error('Local file is missing and not synced to Drive.');
        }

        const uploaded = await this.uploadLocalFileToDrive(drive, {
          storageKey: deliverable.storageKey,
          parentFolderId: parentFolder.id,
          fileName,
          mimeType: deliverable.mimeType ?? 'application/octet-stream',
          existingDriveFileId: deliverable.driveFileId,
        });

        await deliverableRepo.update(
          { workspaceId, id: deliverable.id },
          {
            driveFileId: uploaded.id,
            driveFolderId: parentFolder.id,
            driveWebUrl: uploaded.webViewLink,
            driveSyncStatus: 'SYNCED',
            driveSyncedAt: new Date(),
            driveSyncError: null,
          },
        );
        return;
      }

      // Deliverable WITH variations: Month / <sequenceNumber> / v1.mp4, v2.mp4, v3.mp4
      let itemFolder: DriveFolderOption | null = null;
      const expectedItemFolderName = String(deliverable.sequenceNumber);
      if (
        deliverable.driveFolderId &&
        deliverable.driveFolderId !== parentFolder.id
      ) {
        const folderStillActive = await this.verifyFolderActive(
          drive,
          deliverable.driveFolderId,
        );
        if (folderStillActive) {
          await this.moveOrRenameDriveFile(
            drive,
            deliverable.driveFolderId,
            expectedItemFolderName,
            parentFolder.id,
          );
          itemFolder = {
            id: deliverable.driveFolderId,
            name: expectedItemFolderName,
            webViewLink: `https://drive.google.com/drive/folders/${deliverable.driveFolderId}`,
          };
        }
      }

      if (!itemFolder) {
        itemFolder = await this.findOrCreateChildFolder(
          drive,
          parentFolder.id,
          expectedItemFolderName,
        );
      }

      // Step 1: Upload ALL ready variations FIRST before touching any existing standalone master file.
      let syncedVariationCount = 0;
      for (const variation of readyVariations) {
        const varFileName = formatDriveVariationFilename(
          variation.variationNumber,
          'video/mp4',
        );
        if (
          variation.driveSyncStatus === 'SYNCED' &&
          variation.driveFileId &&
          (await this.verifyFolderActive(drive, variation.driveFileId))
        ) {
          await this.moveOrRenameDriveFile(
            drive,
            variation.driveFileId,
            varFileName,
            itemFolder.id,
          );
          syncedVariationCount += 1;
          continue;
        }

        if (!variation.outputStorageKey) {
          const msg = `Variation v${variation.variationNumber} is marked READY but its rendered video file is missing.`;
          await variationRepo.update(
            { workspaceId, id: variation.id },
            { driveSyncStatus: 'FAILED', driveSyncError: msg },
          );
          throw new Error(msg);
        }

        await variationRepo.update(
          { workspaceId, id: variation.id },
          { driveSyncStatus: 'SYNCING', driveSyncError: null },
        );

        try {
          const uploadedVar = await this.uploadLocalFileToDrive(drive, {
            storageKey: variation.outputStorageKey,
            parentFolderId: itemFolder.id,
            fileName: varFileName,
            mimeType: 'video/mp4',
            existingDriveFileId: variation.driveFileId,
          });
          await variationRepo.update(
            { workspaceId, id: variation.id },
            {
              driveFileId: uploadedVar.id,
              driveWebUrl: uploadedVar.webViewLink,
              driveSyncStatus: 'SYNCED',
              driveSyncedAt: new Date(),
              driveSyncError: null,
            },
          );
          syncedVariationCount += 1;
        } catch (varErr) {
          const msg =
            varErr instanceof Error
              ? varErr.message
              : 'Variation upload failed.';
          await variationRepo.update(
            { workspaceId, id: variation.id },
            {
              driveSyncStatus: 'FAILED',
              driveSyncError: msg.slice(0, 500),
            },
          );
          throw varErr;
        }
      }

      // Step 2: Handle master original file ONLY AFTER variations are safely uploaded.
      let masterDriveFileId = deliverable.driveFileId;
      const originalFileName = `original.${deliverable.mimeType ? formatDriveDeliverableFilename(1, deliverable.mimeType).split('.').pop() : 'mp4'}`;
      const everyVariationReadyAndSynced =
        allVariations.length > 0 &&
        syncedVariationCount === allVariations.length;

      if (masterDriveFileId) {
        const masterExists = await this.verifyFolderActive(
          drive,
          masterDriveFileId,
        );
        if (masterExists) {
          if (connection.includeOriginalInVariationFolder) {
            await this.moveOrRenameDriveFile(
              drive,
              masterDriveFileId,
              originalFileName,
              itemFolder.id,
            );
          } else if (everyVariationReadyAndSynced) {
            // Safe promotion: ALL variations are READY + SYNCED, so trash standalone `3.mp4` and clear DB ref immediately.
            await drive.files.update({
              fileId: masterDriveFileId,
              requestBody: { trashed: true },
              supportsAllDrives: true,
            });
            masterDriveFileId = null;
          }
        } else {
          masterDriveFileId = null;
        }
      } else if (
        connection.includeOriginalInVariationFolder &&
        deliverable.storageKey
      ) {
        const uploadedOrig = await this.uploadLocalFileToDrive(drive, {
          storageKey: deliverable.storageKey,
          parentFolderId: itemFolder.id,
          fileName: originalFileName,
          mimeType: deliverable.mimeType ?? 'video/mp4',
        });
        masterDriveFileId = uploadedOrig.id;
      }

      await deliverableRepo.update(
        { workspaceId, id: deliverable.id },
        {
          driveFileId: masterDriveFileId,
          driveFolderId: itemFolder.id,
          driveWebUrl: itemFolder.webViewLink,
          driveSyncStatus: 'SYNCED',
          driveSyncedAt: new Date(),
          driveSyncError: null,
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google Drive sync failed.';
      this.logger.warn(
        `Drive sync failed for deliverable ${deliverableId} in workspace ${workspaceId}: ${message}`,
      );
      await deliverableRepo.update(
        { workspaceId, id: deliverableId },
        {
          driveSyncStatus: 'FAILED',
          driveSyncError: message.slice(0, 500),
        },
      );
    }
  }

  private async moveOrRenameDriveFile(
    drive: drive_v3.Drive,
    fileId: string,
    newName: string,
    targetParentId: string,
  ): Promise<void> {
    const meta = await drive.files.get({
      fileId,
      fields: 'id,name,parents',
      supportsAllDrives: true,
    });
    const currentParents = meta.data.parents ?? [];
    const needsMove = !currentParents.includes(targetParentId);
    const needsRename = meta.data.name !== newName;
    if (!needsMove && !needsRename) return;

    await drive.files.update({
      fileId,
      addParents: needsMove ? targetParentId : undefined,
      removeParents:
        needsMove && currentParents.length > 0
          ? currentParents.join(',')
          : undefined,
      requestBody: needsRename ? { name: newName } : undefined,
      supportsAllDrives: true,
    });
  }

  async streamDriveFile(
    workspaceId: string,
    driveFileId: string,
    req: Request,
    res: Response,
    params: {
      mimeType: string;
      downloadFilename: string;
      forceDownload: boolean;
      knownSizeBytes?: number;
    },
  ): Promise<void> {
    let drive: drive_v3.Drive;
    try {
      ({ drive } = await this.getAuthorizedDriveClient(workspaceId));
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'Google Drive playback is temporarily unavailable. Reconnect Google Drive or open the file directly in Drive.',
      );
    }

    let totalSize = params.knownSizeBytes ?? 0;
    let mimeType = params.mimeType;

    try {
      const meta = await drive.files.get({
        fileId: driveFileId,
        fields: 'size,mimeType,trashed',
        supportsAllDrives: true,
      });
      if (meta.data.trashed) {
        throw new NotFoundException(
          'This file has been moved to Trash in Google Drive.',
        );
      }
      const upstreamSize = Number(meta.data.size ?? 0);
      if (Number.isFinite(upstreamSize) && upstreamSize > 0) {
        totalSize = upstreamSize;
      }
      if (meta.data.mimeType) {
        const normalizedMime = meta.data.mimeType.trim().toLowerCase();
        if (ALLOWED_DELIVERABLE_MIMES.has(normalizedMime)) {
          mimeType = normalizedMime;
        }
      }
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      const status = extractDriveHttpStatus(error);
      if (status === 404) {
        throw new NotFoundException('Video file was not found in Google Drive.');
      }
      throw new ServiceUnavailableException(
        'Google Drive media is temporarily unavailable. Try again or open the Drive link directly.',
      );
    }

    const safeMime = ALLOWED_DELIVERABLE_MIMES.has(mimeType.toLowerCase())
      ? mimeType.toLowerCase()
      : 'application/octet-stream';
    const forceAttachment =
      params.forceDownload || safeMime === 'application/octet-stream';

    const parsedRange =
      totalSize > 0
        ? parseByteRangeHeader(req.headers.range, totalSize)
        : null;
    if (parsedRange === 'INVALID') {
      res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
      res.setHeader('Content-Range', `bytes */${totalSize}`);
      res.end();
      return;
    }

    const upstreamHeaders: Record<string, string> = {};
    if (parsedRange) {
      upstreamHeaders.Range = `bytes=${parsedRange.start}-${parsedRange.end}`;
    }

    let driveResponse: {
      status?: number;
      headers?: Record<string, string | undefined>;
      data: unknown;
    };
    try {
      driveResponse = (await drive.files.get(
        { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream', headers: upstreamHeaders },
      )) as unknown as {
        status?: number;
        headers?: Record<string, string | undefined>;
        data: unknown;
      };
    } catch (error) {
      const status = extractDriveHttpStatus(error);
      if (status === 404) {
        throw new NotFoundException('Video file was not found in Google Drive.');
      }
      throw new ServiceUnavailableException(
        'Unable to stream media from Google Drive right now.',
      );
    }

    const responseHeaders = (driveResponse.headers ?? {}) as Record<
      string,
      string | undefined
    >;
    const upstreamContentRange = responseHeaders['content-range'];
    const upstreamContentLength = responseHeaders['content-length'];
    const upstreamIsPartial =
      driveResponse.status === 206 || Boolean(upstreamContentRange);

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', safeMime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (safeMime === 'application/pdf') {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; object-src 'none'; base-uri 'none'",
      );
    } else {
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    }
    res.setHeader(
      'Content-Disposition',
      `${forceAttachment ? 'attachment' : 'inline'}; filename="${params.downloadFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
    );

    if (parsedRange && upstreamIsPartial) {
      res.status(HttpStatus.PARTIAL_CONTENT);
      res.setHeader(
        'Content-Range',
        upstreamContentRange ??
          `bytes ${parsedRange.start}-${parsedRange.end}/${totalSize}`,
      );
      res.setHeader(
        'Content-Length',
        upstreamContentLength ?? String(parsedRange.chunkLength),
      );
    } else {
      res.status(HttpStatus.OK);
      if (upstreamContentLength) {
        res.setHeader('Content-Length', upstreamContentLength);
      } else if (totalSize > 0) {
        res.setHeader('Content-Length', String(totalSize));
      }
    }

    const stream = driveResponse.data as unknown as Readable;
    try {
      await pipeline(stream, res);
    } catch (error) {
      if (!res.headersSent) {
        throw error;
      }
      res.destroy();
    }
  }

  async downloadDriveFileToPath(
    workspaceId: string,
    driveFileId: string,
    destPath: string,
  ): Promise<void> {
    const { drive } = await this.getAuthorizedDriveClient(workspaceId);
    const driveResponse = await drive.files.get(
      { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' },
    );
    const stream = driveResponse.data as unknown as Readable;
    await pipeline(stream, createWriteStream(destPath));
  }
}
