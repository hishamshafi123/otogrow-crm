import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type OtogrowAccess } from 'src/modules/otogrow-access/otogrow-access.types';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryContentSourceService } from './delivery-content-source.service';
import {
  DeliveryContentReadsService,
  contentReceipt,
} from './delivery-content-reads.service';
import { DeliveryContentAccountEntity } from './entities/delivery-content-account.entity';
import { DeliveryContentPlanEntity } from './entities/delivery-content-plan.entity';
import { DeliveryContentVariantEntity } from './entities/delivery-content-variant.entity';
import { DeliveryContentVersionEntity } from './entities/delivery-content-version.entity';
import { DeliveryContentEventEntity } from './entities/delivery-content-event.entity';
import {
  contentAccountSchema,
  contentDecisionSchema,
  contentPlanSchema,
  contentSaveSchema,
} from './delivery-content.types';
import {
  contentManager,
  parseContentInput,
  validateContentAccount,
  validatePublication,
} from './delivery-content.policy';

@Injectable()
export class DeliveryContentService {
  constructor(
    readonly source: DeliveryContentSourceService,
    readonly reads: DeliveryContentReadsService,
  ) {}
  projects(...input: Parameters<DeliveryContentReadsService['projects']>) {
    return this.reads.projects(...input);
  }
  projectChoices(
    ...input: Parameters<DeliveryContentReadsService['projectChoices']>
  ) {
    return this.reads.projectChoices(...input);
  }
  plans(...input: Parameters<DeliveryContentReadsService['plans']>) {
    return this.reads.plans(...input);
  }
  list(...input: Parameters<DeliveryContentReadsService['list']>) {
    return this.reads.list(...input);
  }
  calendar(...input: Parameters<DeliveryContentReadsService['calendar']>) {
    return this.reads.calendar(...input);
  }
  assetChoices(
    ...input: Parameters<DeliveryContentReadsService['assetChoices']>
  ) {
    return this.reads.assetChoices(...input);
  }
  detail(...input: Parameters<DeliveryContentReadsService['detail']>) {
    return this.reads.detail(...input);
  }
  preview(...input: Parameters<DeliveryContentReadsService['preview']>) {
    return this.reads.preview(...input);
  }
  receipt(...input: Parameters<DeliveryContentReadsService['receipt']>) {
    return this.reads.receipt(...input);
  }
  private write<TResult>(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: { id: string; requestId: string; revision: number; planId?: string },
    targetKind: 'ACCOUNT' | 'PLAN' | 'VARIANT',
    operation: (
      manager: EntityManager,
      access: OtogrowAccess,
    ) => Promise<TResult>,
    transactionManager?: EntityManager,
  ) {
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery-content-request:${workspace.id}:${input.requestId}`],
        );
        let planId = input.planId;
        if (targetKind === 'VARIANT' && !planId)
          planId = (
            await manager
              .getRepository(DeliveryContentVariantEntity)
              .findOneBy({ workspaceId: workspace.id, id: input.id })
          )?.planId;
        if (planId || targetKind === 'PLAN') {
          const lock =
            targetKind === 'VARIANT'
              ? 'pg_advisory_xact_lock_shared'
              : 'pg_advisory_xact_lock';
          await manager.query(`SELECT ${lock}(hashtextextended($1,0))`, [
            `delivery-content-plan:${workspace.id}:${planId ?? input.id}`,
          ]);
        }
        if (targetKind !== 'PLAN')
          await manager.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
            [`delivery-content-${targetKind}:${workspace.id}:${input.id}`],
          );
        return operation(manager, access);
      },
      transactionManager,
    );
  }
  private async replay(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    requestId: string,
    inputHash: string,
  ) {
    const event = await manager
      .getRepository(DeliveryContentEventEntity)
      .findOneBy({ workspaceId: workspace.id, requestId });
    if (!event) return null;
    if (
      event.actorId !== access.memberId ||
      event.userWorkspaceId !== access.userWorkspaceId ||
      event.inputHash !== inputHash
    )
      throw new ConflictException(
        'This request identity belongs to a different content action.',
      );
    await this.reads.eventAccess(manager, workspace, access, event);
    return contentReceipt(event);
  }
  private async record(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    input: {
      requestId: string;
      inputHash: string;
      targetKind: 'ACCOUNT' | 'PLAN' | 'VARIANT';
      targetId: string;
      projectId: string;
      planId?: string;
      version?: number;
      revision: number;
      status: string;
      action: string;
      taskId?: string | null;
      note?: string;
      evidenceUrl?: string;
      publishedAt?: string | null;
      correctsEventId?: string | null;
    },
  ) {
    const actor = (
      await this.source.access.listActiveMembers(workspace.id, manager)
    ).find((item) => item.memberId === access.memberId);
    const event = await manager.getRepository(DeliveryContentEventEntity).save({
      id: randomUUID(),
      workspaceId: workspace.id,
      actorId: access.memberId,
      userWorkspaceId: access.userWorkspaceId,
      actorName: actor?.name ?? 'Workspace member',
      requestId: input.requestId,
      inputHash: input.inputHash,
      targetKind: input.targetKind,
      targetId: input.targetId,
      accountId: input.targetKind === 'ACCOUNT' ? input.targetId : null,
      planId:
        input.targetKind === 'PLAN' ? input.targetId : (input.planId ?? null),
      variantId: input.targetKind === 'VARIANT' ? input.targetId : null,
      version: input.version ?? null,
      revision: input.revision,
      status: input.status,
      action: input.action,
      note: input.note ?? '',
      evidenceUrl: input.evidenceUrl ?? '',
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      correctsEventId: input.correctsEventId ?? null,
    });
    await recordOtogrowActivity(manager, {
      workspaceId: workspace.id,
      actorId: access.memberId,
      actorType: 'HUMAN',
      category: 'BUSINESS',
      sourceType:
        input.targetKind === 'ACCOUNT'
          ? 'content-account'
          : input.targetKind === 'PLAN'
            ? 'content-plan'
            : 'content-post',
      sourceId: input.targetId,
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      action:
        input.targetKind === 'VARIANT'
          ? `CONTENT_POST_${input.action}`
          : input.targetKind === 'ACCOUNT'
            ? 'CONTENT_ACCOUNT_SAVE'
            : 'CONTENT_PLAN_SAVE',
      outcome:
        input.action === 'APPROVE'
          ? 'APPROVED'
          : input.action === 'REQUEST_CHANGES'
            ? 'CHANGES_REQUESTED'
            : 'RECORDED',
      summary:
        'Recorded a content planning action; publication evidence is a human attestation, not a provider result.',
      changes: [
        { field: 'state', before: null, after: input.status },
        { field: 'revision', before: null, after: String(input.revision) },
      ],
    });
    return contentReceipt(event);
  }
  async saveAccount(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentAccountSchema, raw),
      inputHash = advertisingHash(input);
    validateContentAccount(input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      'ACCOUNT',
      async (manager, access) => {
        const replay = await this.replay(
          manager,
          workspace,
          access,
          input.requestId,
          inputHash,
        );
        if (replay) return replay;
        if (!contentManager(access))
          throw new ForbiddenException(
            'A manager must register or change a posting account.',
          );
        const project = await this.source.project(
          manager,
          workspace,
          access,
          input.projectId,
        );
        if (
          project.revision !== input.projectRevision ||
          project.companyId !== input.expectedCompanyId
        )
          throw new ConflictException(
            'The brand changed. Refresh its current scope.',
          );
        const repository = manager.getRepository(DeliveryContentAccountEntity);
        const existing = await repository.findOneBy({
          workspaceId: workspace.id,
          id: input.id,
        });
        if (
          existing &&
          (existing.projectId !== project.id ||
            existing.companyId !== project.companyId ||
            existing.platform !== input.platform ||
            existing.handle.replace(/^@/, '').toLowerCase() !==
              input.handle.replace(/^@/, '').toLowerCase() ||
            existing.revision !== input.revision)
        )
          throw new ConflictException(
            'Account identity is fixed. Refresh its current revision or register a separate account.',
          );
        if (!existing && input.revision !== 0)
          throw new ConflictException('The original account is unavailable.');
        await repository.save({
          id: input.id,
          workspaceId: workspace.id,
          projectId: project.id,
          companyId: project.companyId,
          revision: input.revision + 1,
          name: input.name,
          handle: input.handle,
          platform: input.platform,
          profileUrl: input.profileUrl,
          archived: input.archived,
        });
        return this.record(manager, workspace, access, {
          requestId: input.requestId,
          inputHash,
          targetKind: 'ACCOUNT',
          targetId: input.id,
          projectId: project.id,
          revision: input.revision + 1,
          status: input.archived ? 'ARCHIVED' : 'REGISTERED',
          action: 'SAVE_ACCOUNT',
        });
      },
      transactionManager,
    );
  }
  async savePlan(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentPlanSchema, raw),
      inputHash = advertisingHash(input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      'PLAN',
      async (manager, access) => {
        const replay = await this.replay(
          manager,
          workspace,
          access,
          input.requestId,
          inputHash,
        );
        if (replay) return replay;
        const project = await this.source.project(
          manager,
          workspace,
          access,
          input.projectId,
        );
        if (
          project.revision !== input.projectRevision ||
          project.companyId !== input.expectedCompanyId
        )
          throw new ConflictException(
            'The brand changed. Refresh its current scope.',
          );
        await this.source.assertService(manager, workspace.id, project, input);
        const repository = manager.getRepository(DeliveryContentPlanEntity);
        const existing = await repository.findOneBy({
          workspaceId: workspace.id,
          id: input.id,
        });
        if (existing) {
          await this.source.plan(manager, workspace, access, input.id);
          if (
            existing.projectId !== input.projectId ||
            existing.revision !== input.revision ||
            (!contentManager(access) && existing.createdBy !== memberId)
          )
            throw new ConflictException(
              'This plan changed or cannot be edited by your current role.',
            );
          if (
            await manager
              .getRepository(DeliveryContentVariantEntity)
              .existsBy({ workspaceId: workspace.id, planId: input.id })
          )
            throw new ConflictException(
              'This plan already has posts. Create a separate plan to change its shared context.',
            );
        } else if (input.revision !== 0)
          throw new ConflictException('The original plan is unavailable.');
        await repository.save({
          id: input.id,
          workspaceId: workspace.id,
          projectId: project.id,
          companyId: project.companyId,
          revision: input.revision + 1,
          title: input.title,
          purpose: input.purpose,
          engagementId: input.engagementId,
          service: input.service,
          createdBy: existing?.createdBy ?? memberId,
        });
        return this.record(manager, workspace, access, {
          requestId: input.requestId,
          inputHash,
          targetKind: 'PLAN',
          targetId: input.id,
          projectId: project.id,
          revision: input.revision + 1,
          status: 'PLANNED',
          action: 'SAVE_PLAN',
        });
      },
      transactionManager,
    );
  }
  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentSaveSchema, raw),
      inputHash = advertisingHash(input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      'VARIANT',
      async (manager, access) => {
        const replay = await this.replay(
          manager,
          workspace,
          access,
          input.requestId,
          inputHash,
        );
        if (replay) return replay;
        const prepared = await this.source.prepare(
          manager,
          workspace,
          access,
          input,
        );
        if (
          !input.expectedSourceFingerprint ||
          input.expectedSourceFingerprint !== prepared.body.sourceFingerprint
        )
          throw new ConflictException(
            'The posting sources changed after preview. Preview this exact package again before saving.',
          );
        const version = (prepared.previous?.currentVersion ?? 0) + 1;
        const variant = await manager
          .getRepository(DeliveryContentVariantEntity)
          .save({
            id: input.id,
            workspaceId: workspace.id,
            projectId: prepared.project.id,
            companyId: prepared.project.companyId,
            planId: input.planId,
            accountId: input.body.accountId,
            assetTaskId: input.body.asset?.taskId ?? null,
            ownerId: input.body.ownerId,
            reviewerId: input.body.reviewerId,
            createdBy: prepared.previous?.createdBy ?? memberId,
            submittedBy: null,
            revision: input.revision + 1,
            currentVersion: version,
            status: 'DRAFT',
            plannedAt: new Date(input.body.plannedAt),
            approvedVersion: null,
            reviewedBy: null,
            reviewedAt: null,
          });
        await manager.getRepository(DeliveryContentVersionEntity).save({
          id: randomUUID(),
          workspaceId: workspace.id,
          variantId: variant.id,
          version,
          body: prepared.body,
          createdBy: memberId,
        });
        return this.record(manager, workspace, access, {
          requestId: input.requestId,
          inputHash,
          targetKind: 'VARIANT',
          targetId: variant.id,
          projectId: variant.projectId,
          planId: variant.planId,
          version,
          revision: variant.revision,
          status: variant.status,
          action: 'SAVE',
          taskId: variant.assetTaskId,
        });
      },
      transactionManager,
    );
  }
  async decide(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseContentInput(contentDecisionSchema, raw),
      inputHash = advertisingHash(input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      'VARIANT',
      async (manager, access) => {
        const replay = await this.replay(
          manager,
          workspace,
          access,
          input.requestId,
          inputHash,
        );
        if (replay) return replay;
        const selected = await this.source.selected(
          manager,
          workspace,
          access,
          input.id,
        );
        const { variant, version } = selected;
        const permissions = await this.reads.permissions(
          manager,
          workspace,
          access,
          selected,
        );
        if (
          variant.revision !== input.revision ||
          permissions.currentSourceFingerprint !== input.sourceFingerprint
        )
          throw new ConflictException(
            'This post or its sources changed. Refresh before recording an action.',
          );
        if (!permissions.allowedActions.includes(input.action))
          throw new ForbiddenException(
            permissions.blockedReason ??
              'Your current role cannot perform this action on this post.',
          );
        if (
          [
            'REQUEST_CHANGES',
            'RECORD_FAILED',
            'RECORD_UNCERTAIN',
            'CORRECT_PUBLICATION',
            'CANCEL',
          ].includes(input.action) &&
          !input.note
        )
          throw new BadRequestException(
            'Explain the change, problem or correction.',
          );
        if (
          ['RECORD_PUBLICATION', 'CORRECT_PUBLICATION'].includes(input.action)
        ) {
          validatePublication(
            version.body.account.platform,
            version.body.account.handle,
            input.evidenceUrl,
            input.publishedAt,
          );
          if (input.action === 'CORRECT_PUBLICATION') {
            const latest = await manager
              .getRepository(DeliveryContentEventEntity)
              .createQueryBuilder('event')
              .where(
                'event."workspaceId"=:workspaceId AND event."variantId"=:variantId AND event.version=:version',
                {
                  workspaceId: workspace.id,
                  variantId: variant.id,
                  version: version.version,
                },
              )
              .andWhere(
                "event.action IN ('RECORD_PUBLICATION','CORRECT_PUBLICATION')",
              )
              .orderBy('event.revision', 'DESC')
              .take(1)
              .getOne();
            if (!latest || latest.id !== input.correctsEventId)
              throw new ConflictException(
                'Select the latest recorded publication evidence before correcting it.',
              );
          } else if (input.correctsEventId)
            throw new BadRequestException(
              'A first publication cannot correct an earlier event.',
            );
        } else if (
          input.evidenceUrl ||
          input.publishedAt ||
          input.correctsEventId
        )
          throw new BadRequestException(
            'Publication evidence is only accepted for a recorded publication or correction.',
          );
        if (input.action === 'SUBMIT') {
          variant.status = 'REVIEW';
          variant.submittedBy = memberId;
        } else if (input.action === 'APPROVE') {
          variant.status = 'APPROVED';
          variant.approvedVersion = version.version;
          variant.reviewedBy = memberId;
          variant.reviewedAt = new Date();
        } else if (input.action === 'REQUEST_CHANGES')
          variant.status = 'CHANGES_REQUESTED';
        else if (input.action === 'RECORD_PUBLICATION')
          variant.status = 'PUBLISHED';
        else if (input.action === 'CANCEL') {
          variant.status = 'CANCELLED';
          variant.approvedVersion = null;
          variant.reviewedBy = null;
          variant.reviewedAt = null;
        }
        variant.revision += 1;
        await manager.getRepository(DeliveryContentVariantEntity).save(variant);
        return this.record(manager, workspace, access, {
          requestId: input.requestId,
          inputHash,
          targetKind: 'VARIANT',
          targetId: variant.id,
          projectId: variant.projectId,
          planId: variant.planId,
          version: version.version,
          revision: variant.revision,
          status: variant.status,
          action: input.action,
          taskId: variant.assetTaskId,
          note: input.note,
          evidenceUrl: input.evidenceUrl,
          publishedAt: input.publishedAt,
          correctsEventId: input.correctsEventId,
        });
      },
      transactionManager,
    );
  }
}
