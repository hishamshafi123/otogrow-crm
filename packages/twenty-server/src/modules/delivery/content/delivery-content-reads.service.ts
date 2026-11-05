import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { escapeForIlike } from 'twenty-shared/utils';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type OtogrowAccess } from 'src/modules/otogrow-access/otogrow-access.types';
import { deliveryNativeTaskSchema } from 'src/modules/delivery/native-task-visibility';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { DeliveryContentAccountEntity } from './entities/delivery-content-account.entity';
import { DeliveryContentPlanEntity } from './entities/delivery-content-plan.entity';
import { DeliveryContentVariantEntity } from './entities/delivery-content-variant.entity';
import { DeliveryContentVersionEntity } from './entities/delivery-content-version.entity';
import { DeliveryContentEventEntity } from './entities/delivery-content-event.entity';
import { DeliveryContentSourceService } from './delivery-content-source.service';
import {
  contentManager,
  contentReviewer,
  parseContentInput,
} from './delivery-content.policy';
import {
  contentCalendarSchema,
  contentChoicesSchema,
  contentListSchema,
  contentPlansSchema,
  contentProjectChoicesSchema,
  contentProjectsSchema,
  contentReceiptSchema,
  contentSaveSchema,
  contentSelectionSchema,
  type ContentSavedBody,
} from './delivery-content.types';

export const contentReceipt = (event: DeliveryContentEventEntity) => ({
  ...event,
  createdAt: event.createdAt.toISOString(),
  publishedAt: event.publishedAt?.toISOString() ?? null,
});
export const contentSummary = (
  variant: DeliveryContentVariantEntity,
  planTitle: string,
  body: ContentSavedBody,
  lastAttempt: Pick<DeliveryContentEventEntity, 'action' | 'createdAt'> | null,
) => ({
  id: variant.id,
  planId: variant.planId,
  planTitle,
  projectId: variant.projectId,
  revision: variant.revision,
  currentVersion: variant.currentVersion,
  status: variant.status,
  ownerId: body.ownerId,
  ownerName: body.ownerName,
  reviewerId: body.reviewerId,
  reviewerName: body.reviewerName,
  platform: body.account.platform,
  accountName: body.account.name,
  plannedAt: variant.plannedAt.toISOString(),
  plannedLocal: body.plannedLocal,
  timezone: body.timezone,
  format: body.format,
  lastAttemptAction: lastAttempt?.action ?? null,
  lastAttemptAt: lastAttempt?.createdAt.toISOString() ?? null,
});
@Injectable()
export class DeliveryContentReadsService {
  constructor(readonly source: DeliveryContentSourceService) {}
  private latestAttempt(
    manager: EntityManager,
    workspaceId: string,
    variant: DeliveryContentVariantEntity,
  ) {
    return manager
      .getRepository(DeliveryContentEventEntity)
      .createQueryBuilder('event')
      .select(['event.action', 'event.createdAt'])
      .where(
        'event."workspaceId"=:workspaceId AND event."variantId"=:variantId AND event.version=:version',
        { workspaceId, variantId: variant.id, version: variant.currentVersion },
      )
      .andWhere(
        "event.action IN ('RECORD_FAILED','RECORD_UNCERTAIN','RECORD_PUBLICATION','CORRECT_PUBLICATION')",
      )
      .orderBy('event.revision', 'DESC')
      .take(1)
      .getOne();
  }
  async projects(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentProjectsSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const query = manager
          .getRepository(DeliveryProjectEntity)
          .createQueryBuilder('project')
          .where('project."workspaceId"=:workspaceId', {
            workspaceId: workspace.id,
          });
        if (!contentManager(access))
          query.andWhere('project."memberIds" @> :members::jsonb', {
            members: JSON.stringify([memberId]),
          });
        if (input.search)
          query.andWhere('project.name ILIKE :search', {
            search: `%${escapeForIlike(input.search)}%`,
          });
        const totalCount = await query.getCount();
        if (input.afterId) {
          if (
            !(await query
              .clone()
              .andWhere('project.id=:after', { after: input.afterId })
              .getOne())
          )
            throw new ConflictException(
              'Project choices changed. Return to the first page.',
            );
          query.andWhere('project.id>:after', { after: input.afterId });
        }
        const rows = await query
          .orderBy('project.id', 'ASC')
          .take(26)
          .getMany();
        return {
          ...this.source.identity(workspace, access),
          items: rows.slice(0, 25),
          totalCount,
          nextId: rows.length > 25 ? rows[24].id : null,
        };
      },
      transactionManager,
    );
  }
  async projectChoices(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentProjectChoicesSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const project = await this.source.project(
          manager,
          workspace,
          access,
          input.projectId,
        );
        const unavailableSelectedIds: string[] = [];
        const accountBase = manager
          .getRepository(DeliveryContentAccountEntity)
          .createQueryBuilder('account')
          .where(
            'account."workspaceId"=:workspaceId AND account."projectId"=:projectId AND account."companyId" IS NOT DISTINCT FROM :companyId',
            {
              workspaceId: workspace.id,
              projectId: project.id,
              companyId: project.companyId,
            },
          );
        const selectedAccounts = input.selectedAccountIds?.length
          ? await accountBase
              .clone()
              .andWhere('account.id IN (:...selected)', {
                selected: input.selectedAccountIds,
              })
              .getMany()
          : [];
        unavailableSelectedIds.push(
          ...(input.selectedAccountIds ?? []).filter(
            (id) => !selectedAccounts.some((row) => row.id === id),
          ),
        );
        const accountQuery = accountBase.clone();
        if (input.search)
          accountQuery.andWhere(
            '(account.name ILIKE :search OR account.handle ILIKE :search)',
            { search: `%${escapeForIlike(input.search)}%` },
          );
        if (input.afterAccountId) {
          if (
            !(await accountQuery
              .clone()
              .andWhere('account.id=:after', { after: input.afterAccountId })
              .getOne())
          )
            throw new ConflictException(
              'Account choices changed. Return to the first page.',
            );
          accountQuery.andWhere('account.id>:after', {
            after: input.afterAccountId,
          });
        }
        const accountRows = await accountQuery
          .orderBy('account.id', 'ASC')
          .take(26)
          .getMany();
        const memberQuery = manager
          .createQueryBuilder()
          .from(
            `${deliveryNativeTaskSchema(workspace)}.workspaceMember`,
            'member',
          )
          .innerJoin(
            UserWorkspaceEntity,
            'membership',
            'membership."userId"=member."userId" AND membership."workspaceId"=:workspaceId',
          )
          .innerJoin(UserEntity, 'person', 'person.id=membership."userId"')
          .where(
            'member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND person."deletedAt" IS NULL AND NOT person.disabled',
          )
          .setParameter('workspaceId', workspace.id);
        if (input.search)
          memberQuery.andWhere(
            `concat_ws(' ',member."nameFirstName",member."nameLastName") ILIKE :search`,
            { search: `%${escapeForIlike(input.search)}%` },
          );
        if (input.afterMemberId) {
          if (
            !(await memberQuery
              .clone()
              .andWhere('member.id=:after', { after: input.afterMemberId })
              .select('member.id')
              .getRawOne())
          )
            throw new ConflictException(
              'People choices changed. Return to the first page.',
            );
          memberQuery.andWhere('member.id>:after', {
            after: input.afterMemberId,
          });
        }
        const memberRows = await memberQuery
          .select('member.id', 'id')
          .orderBy('member.id', 'ASC')
          .limit(26)
          .getRawMany<{ id: string }>();
        const members = [],
          selectedMembers = [];
        for (const id of [
          ...new Set([
            ...memberRows.slice(0, 25).map((row) => row.id),
            ...(input.selectedMemberIds ?? []),
          ]),
        ]) {
          try {
            const person = await this.source.member(
              manager,
              workspace,
              project,
              id,
            );
            const choice = {
              id: person.id,
              name: person.name,
              canReview: person.canReview,
            };
            if (memberRows.slice(0, 25).some((row) => row.id === id))
              members.push(choice);
            if (input.selectedMemberIds?.includes(id))
              selectedMembers.push(choice);
          } catch (error) {
            if (!(error instanceof ConflictException)) throw error;
            if (input.selectedMemberIds?.includes(id))
              unavailableSelectedIds.push(id);
          }
        }
        const selectedEngagements = input.selectedEngagementIds?.length
          ? await this.source.engagements(manager, workspace.id, project, {
              ids: input.selectedEngagementIds,
            })
          : [];
        unavailableSelectedIds.push(
          ...(input.selectedEngagementIds ?? []).filter(
            (id) => !selectedEngagements.some((row) => row.id === id),
          ),
        );
        if (
          input.afterEngagementId &&
          !(
            await this.source.engagements(manager, workspace.id, project, {
              ids: [input.afterEngagementId],
              search: input.search,
            })
          ).length
        )
          throw new ConflictException(
            'Service choices changed. Return to the first page.',
          );
        const engagementRows = await this.source.engagements(
          manager,
          workspace.id,
          project,
          { afterId: input.afterEngagementId, search: input.search },
        );
        return {
          ...this.source.identity(workspace, access),
          project,
          accounts: accountRows.slice(0, 25),
          members,
          engagements: engagementRows.slice(0, 25),
          nextAccountId: accountRows.length > 25 ? accountRows[24].id : null,
          nextMemberId: memberRows.length > 25 ? memberRows[24].id : null,
          nextEngagementId:
            engagementRows.length > 25 ? engagementRows[24].id : null,
          selectedAccounts,
          selectedMembers,
          selectedEngagements,
          unavailableSelectedIds,
        };
      },
      transactionManager,
    );
  }
  async plans(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentPlansSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const project = await this.source.project(
          manager,
          workspace,
          access,
          input.projectId,
        );
        const query = manager
          .getRepository(DeliveryContentPlanEntity)
          .createQueryBuilder('plan')
          .where(
            'plan."workspaceId"=:workspaceId AND plan."projectId"=:projectId AND plan."companyId" IS NOT DISTINCT FROM :companyId',
            {
              workspaceId: workspace.id,
              projectId: project.id,
              companyId: project.companyId,
            },
          );
        if (input.planId)
          query.andWhere('plan.id=:planId', { planId: input.planId });
        const totalCount = await query.getCount();
        if (input.afterId) {
          if (
            !(await query
              .clone()
              .andWhere('plan.id=:after', { after: input.afterId })
              .getOne())
          )
            throw new ConflictException(
              'Plans changed. Return to the first page.',
            );
          query.andWhere('plan.id>:after', { after: input.afterId });
        }
        const rows = await query.orderBy('plan.id', 'ASC').take(26).getMany();
        const items = await Promise.all(
          rows.slice(0, 25).map(async (plan) => ({
            ...plan,
            canEdit:
              (contentManager(access) || plan.createdBy === memberId) &&
              !(await manager
                .getRepository(DeliveryContentVariantEntity)
                .existsBy({ workspaceId: workspace.id, planId: plan.id })),
          })),
        );
        return {
          ...this.source.identity(workspace, access),
          items,
          totalCount,
          nextId: rows.length > 25 ? rows[24].id : null,
        };
      },
      transactionManager,
    );
  }
  async query(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    input: ReturnType<typeof contentListSchema.parse>,
  ) {
    const project = await this.source.project(
      manager,
      workspace,
      access,
      input.projectId,
    );
    const visibility = await this.source.optionalVisibility(
      manager,
      workspace,
      access,
    );
    const native = visibility
      ? this.source
          .nativeQuery(manager, workspace, project.id, visibility)
          .select('1')
          .andWhere('"activityNativeTask".id=variant."assetTaskId"')
      : null;
    const query = manager
      .getRepository(DeliveryContentVariantEntity)
      .createQueryBuilder('variant')
      .innerJoin(
        DeliveryContentPlanEntity,
        'plan',
        'plan."workspaceId"=variant."workspaceId" AND plan.id=variant."planId"',
      )
      .innerJoin(
        DeliveryContentVersionEntity,
        'saved',
        'saved."workspaceId"=variant."workspaceId" AND saved."variantId"=variant.id AND saved.version=variant."currentVersion"',
      )
      .where(
        'variant."workspaceId"=:workspaceId AND variant."projectId"=:projectId AND variant."companyId" IS NOT DISTINCT FROM :companyId AND plan."companyId" IS NOT DISTINCT FROM :companyId',
        {
          workspaceId: workspace.id,
          projectId: project.id,
          companyId: project.companyId,
        },
      )
      .andWhere(
        native
          ? `(variant."assetTaskId" IS NULL OR EXISTS (${native.getQuery()}))`
          : 'variant."assetTaskId" IS NULL',
      )
      .setParameters(native?.getParameters() ?? {});
    if (input.planId)
      query.andWhere('variant."planId"=:planId', { planId: input.planId });
    if (input.ownerId)
      query.andWhere('variant."ownerId"=:ownerId', { ownerId: input.ownerId });
    if (input.accountId)
      query.andWhere('variant."accountId"=:accountId', {
        accountId: input.accountId,
      });
    if (input.status)
      query.andWhere('variant.status=:status', { status: input.status });
    if (input.from)
      query.andWhere('variant."plannedAt">=:from', { from: input.from });
    if (input.to) query.andWhere('variant."plannedAt"<:to', { to: input.to });
    if (input.search)
      query.andWhere('plan.title ILIKE :search', {
        search: `%${escapeForIlike(input.search)}%`,
      });
    return { query, visibility };
  }
  async list(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentListSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const { query, visibility } = await this.query(
          manager,
          workspace,
          access,
          input,
        );
        const totalCount = await query.getCount();
        const platformCounts = await query
          .clone()
          .select(`saved.body->'account'->>'platform'`, 'platform')
          .addSelect('count(*)::int', 'count')
          .addSelect(
            `count(*) FILTER(WHERE variant.status='PUBLISHED')::int`,
            'publishedCount',
          )
          .addSelect(
            `count(*) FILTER(WHERE variant.status='REVIEW')::int`,
            'reviewCount',
          )
          .groupBy(`saved.body->'account'->>'platform'`)
          .getRawMany<{
            platform: string;
            count: number;
            publishedCount: number;
            reviewCount: number;
          }>();
        if (input.afterId) {
          if (
            !(await query
              .clone()
              .andWhere('variant.id=:after', { after: input.afterId })
              .getOne())
          )
            throw new ConflictException(
              'Posts changed. Return to the first page.',
            );
          query.andWhere('variant.id>:after', { after: input.afterId });
        }
        const rows = await query
          .orderBy('variant.id', 'ASC')
          .take(26)
          .getMany();
        const items = await Promise.all(
          rows.slice(0, 25).map(async (row) => {
            const selected = await this.source.selected(
              manager,
              workspace,
              access,
              row.id,
            );
            return contentSummary(
              row,
              selected.plan.title,
              selected.version.body,
              await this.latestAttempt(manager, workspace.id, row),
            );
          }),
        );
        return {
          ...this.source.identity(workspace, access, visibility ?? undefined),
          items,
          totalCount,
          platformCounts,
          nextId: rows.length > 25 ? rows[24].id : null,
        };
      },
      transactionManager,
    );
  }
  async calendar(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentCalendarSchema, raw);
    const range = Date.parse(input.to) - Date.parse(input.from);
    if (range <= 0 || range > 93 * 86400000)
      throw new BadRequestException(
        'Choose a calendar range of up to 93 days.',
      );
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const { query, visibility } = await this.query(
          manager,
          workspace,
          access,
          input,
        );
        const date = `to_char(variant."plannedAt" AT TIME ZONE :calendarTimezone,'YYYY-MM-DD')`;
        const days = await query
          .select(date, 'date')
          .addSelect('count(*)::int', 'count')
          .setParameter('calendarTimezone', input.timezone)
          .groupBy(date)
          .orderBy(date, 'ASC')
          .getRawMany<{ date: string; count: number }>();
        return {
          ...this.source.identity(workspace, access, visibility ?? undefined),
          timezone: input.timezone,
          from: input.from,
          to: input.to,
          days,
          totalCount: days.reduce((sum, day) => sum + day.count, 0),
        };
      },
      transactionManager,
    );
  }
  async assetChoices(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentChoicesSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const project = await this.source.project(
          manager,
          workspace,
          access,
          input.projectId,
        );
        const visibility = await this.source.visibility(
          manager,
          workspace,
          access,
        );
        const query = this.source.nativeQuery(
          manager,
          workspace,
          project.id,
          visibility,
        );
        if (input.search)
          query.andWhere('"activityNativeTask".title ILIKE :search', {
            search: `%${escapeForIlike(input.search)}%`,
          });
        if (input.afterTaskId) {
          if (
            !(await query
              .clone()
              .andWhere('"activityNativeTask".id=:after', {
                after: input.afterTaskId,
              })
              .select('"activityNativeTask".id')
              .getRawOne())
          )
            throw new ConflictException(
              'Creative choices changed. Return to the first page.',
            );
          query.andWhere('"activityNativeTask".id>:after', {
            after: input.afterTaskId,
          });
        }
        const rows = await query
          .select('"activityNativeTask".id', 'id')
          .orderBy('"activityNativeTask".id', 'ASC')
          .limit(26)
          .getRawMany<{ id: string }>();
        const items = [];
        for (const row of rows.slice(0, 25)) {
          const [submission]: { version: number; finalAssetId: string }[] =
            await manager.query(
              `SELECT (item->>'version')::int AS version,item->>'finalAssetId' AS "finalAssetId" FROM core."deliveryTask",jsonb_array_elements(COALESCE(details->'submissions','[]'::jsonb)) item WHERE "workspaceId"=$1 AND "taskId"=$2 AND item->>'decision'='APPROVED' AND item->>'version' ~ '^[1-9][0-9]{0,8}$' AND item->>'finalAssetId' ~ '^[a-fA-F0-9-]{36}$' ORDER BY (item->>'version')::int DESC LIMIT 1`,
              [workspace.id, row.id],
            );
          if (!submission?.finalAssetId) continue;
          try {
            items.push(
              await this.source.asset(manager, workspace, access, project, {
                taskId: row.id,
                submissionVersion: submission.version,
                assetId: submission.finalAssetId,
              }),
            );
          } catch (error) {
            if (
              !(error instanceof BadRequestException) &&
              !(error instanceof ConflictException)
            )
              throw error;
          }
        }
        return {
          ...this.source.identity(workspace, access, visibility ?? undefined),
          items,
          nextTaskId: rows.length > 25 ? rows[24].id : null,
        };
      },
      transactionManager,
    );
  }
  async preview(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentSaveSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const prepared = await this.source.prepare(
          manager,
          workspace,
          access,
          input,
        );
        return {
          ...this.source.identity(workspace, access),
          variantId: input.id,
          requestId: input.requestId,
          inputHash: advertisingHash({
            ...input,
            expectedSourceFingerprint: prepared.body.sourceFingerprint,
          }),
          body: prepared.body,
        };
      },
      transactionManager,
    );
  }
  async permissions(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    selected: Awaited<ReturnType<DeliveryContentSourceService['selected']>>,
  ) {
    const { variant, version, project, plan } = selected;
    let currentSourceFingerprint = '',
      blockedReason: string | null = null;
    try {
      currentSourceFingerprint = (
        await this.source.body(
          manager,
          workspace,
          access,
          project,
          plan,
          version.body,
          version.body.contributorIds,
        )
      ).sourceFingerprint;
    } catch (error) {
      if (
        !(error instanceof BadRequestException) &&
        !(error instanceof ConflictException)
      )
        throw error;
      blockedReason = error.message;
    }
    const sourceChanged =
      currentSourceFingerprint !== version.body.sourceFingerprint;
    const current = version.version === variant.currentVersion;
    const canEdit =
      current &&
      !['REVIEW', 'PUBLISHED'].includes(variant.status) &&
      (contentManager(access) || variant.ownerId === access.memberId);
    const owner = variant.ownerId === access.memberId || contentManager(access);
    const independent =
      contentReviewer(access) &&
      access.memberId === variant.reviewerId &&
      ![
        variant.ownerId,
        variant.submittedBy,
        ...version.body.contributorIds,
      ].includes(access.memberId);
    const allowedActions: string[] = [];
    if (current) {
      if (
        owner &&
        variant.status !== 'PUBLISHED' &&
        variant.status !== 'CANCELLED'
      )
        allowedActions.push('CANCEL');
      if (independent && variant.status === 'REVIEW')
        allowedActions.push('REQUEST_CHANGES');
      if (!sourceChanged) {
        if (owner && ['DRAFT', 'CHANGES_REQUESTED'].includes(variant.status))
          allowedActions.push('SUBMIT');
        if (independent && variant.status === 'REVIEW')
          allowedActions.push('APPROVE');
        if (owner && variant.status === 'APPROVED')
          allowedActions.push(
            'RECORD_PUBLICATION',
            'RECORD_FAILED',
            'RECORD_UNCERTAIN',
          );
      }
      if (owner && variant.status === 'PUBLISHED')
        allowedActions.push('CORRECT_PUBLICATION');
    }
    if (!blockedReason && sourceChanged)
      blockedReason =
        'The posting sources changed. Save a fresh version before approval or publication.';
    return {
      canEdit,
      allowedActions,
      currentSourceFingerprint:
        currentSourceFingerprint ||
        advertisingHash([
          'SOURCE_UNAVAILABLE',
          version.body.sourceFingerprint,
          blockedReason,
        ]),
      sourceChanged,
      blockedReason,
    };
  }
  async detail(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentSelectionSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const selected = await this.source.selected(
          manager,
          workspace,
          access,
          input.id,
          input.version,
        );
        const visibility = await this.source.optionalVisibility(
          manager,
          workspace,
          access,
        );
        const native = visibility
          ? this.source
              .nativeQuery(manager, workspace, selected.project.id, visibility)
              .select('1')
              .andWhere(
                `"activityNativeTask".id::text=saved.body->'asset'->>'taskId'`,
              )
          : null;
        const query = manager
          .getRepository(DeliveryContentEventEntity)
          .createQueryBuilder('event')
          .innerJoin(
            DeliveryContentVersionEntity,
            'saved',
            'saved."workspaceId"=event."workspaceId" AND saved."variantId"=event."variantId" AND saved.version=event.version',
          )
          .where(
            'event."workspaceId"=:workspaceId AND event."variantId"=:variantId',
            { workspaceId: workspace.id, variantId: input.id },
          )
          .andWhere(
            native
              ? `(saved.body->'asset'='null'::jsonb OR EXISTS (${native.getQuery()}))`
              : `saved.body->'asset'='null'::jsonb`,
          )
          .setParameters(native?.getParameters() ?? {});
        const latestPublication = await query
          .clone()
          .andWhere(
            "event.action IN ('RECORD_PUBLICATION','CORRECT_PUBLICATION')",
          )
          .orderBy('event.revision', 'DESC')
          .take(1)
          .getOne();
        if (input.afterEventId) {
          const after = await query
            .clone()
            .andWhere('event.id=:after', { after: input.afterEventId })
            .getOne();
          if (!after)
            throw new ConflictException(
              'Post history changed. Return to the first page.',
            );
          query.andWhere('event.revision<:afterRevision', {
            afterRevision: after.revision,
          });
        }
        const events = await query
          .orderBy('event.revision', 'DESC')
          .take(26)
          .getMany();
        const current =
          selected.version.version === selected.variant.currentVersion
            ? selected
            : await this.source.selected(manager, workspace, access, input.id);
        return {
          ...this.source.identity(workspace, access, visibility ?? undefined),
          variant: contentSummary(
            current.variant,
            current.plan.title,
            current.version.body,
            await this.latestAttempt(manager, workspace.id, current.variant),
          ),
          plan: { ...selected.plan, canEdit: false },
          project: selected.project,
          selectedVersion: selected.version.version,
          body: selected.version.body,
          latestPublication: latestPublication
            ? contentReceipt(latestPublication)
            : null,
          history: events.slice(0, 25).map(contentReceipt),
          nextEventId: events.length > 25 ? events[24].id : null,
          ...(await this.permissions(manager, workspace, access, selected)),
        };
      },
      transactionManager,
    );
  }
  async receipt(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentReceiptSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const event = await manager
          .getRepository(DeliveryContentEventEntity)
          .findOneBy({ workspaceId: workspace.id, requestId: input.requestId });
        if (event) {
          if (
            event.actorId !== memberId ||
            event.userWorkspaceId !== userWorkspaceId
          )
            throw new ForbiddenException(
              'This action belongs to another workspace identity.',
            );
          await this.eventAccess(manager, workspace, access, event);
        }
        return {
          ...this.source.identity(workspace, access),
          receipt: event ? contentReceipt(event) : null,
        };
      },
      transactionManager,
    );
  }
  async eventAccess(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    event: DeliveryContentEventEntity,
  ) {
    if (event.targetKind === 'VARIANT')
      await this.source.selected(
        manager,
        workspace,
        access,
        event.targetId,
        event.version,
      );
    else if (event.targetKind === 'PLAN')
      await this.source.plan(manager, workspace, access, event.targetId);
    else {
      const account = await manager
        .getRepository(DeliveryContentAccountEntity)
        .findOneByOrFail({ workspaceId: workspace.id, id: event.targetId });
      const project = await this.source.project(
        manager,
        workspace,
        access,
        account.projectId,
      );
      if (account.companyId !== project.companyId)
        throw new ForbiddenException(
          'This account belongs to its original client.',
        );
    }
  }
}
