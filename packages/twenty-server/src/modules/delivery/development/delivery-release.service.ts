import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { DeliveryReleaseEntity } from './entities/delivery-release.entity';
import { DeliveryReleaseVersionEntity } from './entities/delivery-release-version.entity';
import { DeliveryReleaseEventEntity } from './entities/delivery-release-event.entity';
import {
  managerAccess,
  editable,
  eventReceipt,
  type ReleaseAccess,
} from './delivery-release.access';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import {
  parseReleaseInput,
  validateReleaseDependencies,
  assertReleaseReady,
} from './delivery-release.policy';
import {
  releaseSaveSchema,
  releaseDecisionSchema,
} from './delivery-release.types';
import { DeliveryReleaseSourceService } from './delivery-release-source.service';
import { DeliveryReleaseReadsService } from './delivery-release-reads.service';
@Injectable()
export class DeliveryReleaseService {
  constructor(
    private readonly source: DeliveryReleaseSourceService,
    private readonly reads: DeliveryReleaseReadsService,
  ) {}
  projects(...input: Parameters<DeliveryReleaseReadsService['projects']>) {
    return this.reads.projects(...input);
  }
  list(...input: Parameters<DeliveryReleaseReadsService['list']>) {
    return this.reads.list(...input);
  }
  choices(...input: Parameters<DeliveryReleaseReadsService['choices']>) {
    return this.reads.choices(...input);
  }
  detail(...input: Parameters<DeliveryReleaseReadsService['detail']>) {
    return this.reads.detail(...input);
  }
  preview(...input: Parameters<DeliveryReleaseReadsService['preview']>) {
    return this.reads.preview(...input);
  }
  receipt(...input: Parameters<DeliveryReleaseReadsService['receipt']>) {
    return this.reads.receipt(...input);
  }

  private write<TResult>(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    id: string,
    requestId: string,
    operation: (
      manager: EntityManager,
      access: ReleaseAccess,
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
          [`delivery-release-request:${workspace.id}:${requestId}`],
        );
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery-release:${workspace.id}:${id}`],
        );
        return operation(manager, access);
      },
      transactionManager,
    );
  }

  private async replay(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: ReleaseAccess,
    requestId: string,
    inputHash: string,
  ) {
    const event = await manager
      .getRepository(DeliveryReleaseEventEntity)
      .findOneBy({ workspaceId: workspace.id, requestId });
    if (!event) return null;
    await this.source.selected(
      manager,
      workspace,
      access,
      event.releaseId,
      event.version,
    );
    if (
      event.actorId !== access.memberId ||
      event.userWorkspaceId !== access.userWorkspaceId ||
      event.inputHash !== inputHash
    )
      throw new ConflictException(
        'This request identity belongs to a different release action.',
      );
    return eventReceipt(event);
  }

  private async record(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: ReleaseAccess,
    release: DeliveryReleaseEntity,
    input: {
      requestId: string;
      inputHash: string;
      action: string;
      note?: string;
      evidenceUrl?: string;
      commitSha?: string;
      environment?: string;
    },
  ) {
    const actor = (
      await this.source.access.listActiveMembers(workspace.id, manager)
    ).find((member) => member.memberId === access.memberId);
    const event = await manager.getRepository(DeliveryReleaseEventEntity).save({
      workspaceId: workspace.id,
      releaseId: release.id,
      actorId: access.memberId,
      userWorkspaceId: access.userWorkspaceId,
      actorName: actor?.name ?? 'Workspace member',
      requestId: input.requestId,
      inputHash: input.inputHash,
      action: input.action,
      note: input.note ?? '',
      evidenceUrl: input.evidenceUrl ?? '',
      commitSha: input.commitSha ?? '',
      environment: input.environment ?? '',
      revision: release.revision,
      version: release.currentVersion,
      status: release.status,
    });
    await recordOtogrowActivity(manager, {
      workspaceId: workspace.id,
      actorId: access.memberId,
      actorType: 'HUMAN',
      category: 'DELIVERY',
      action: `DEVELOPMENT_RELEASE_${input.action}`,
      sourceType: 'development-release',
      sourceId: release.id,
      projectId: release.projectId,
      subjectMemberId: release.ownerId,
      outcome:
        input.action === 'APPROVE'
          ? 'APPROVED'
          : input.action === 'REQUEST_CHANGES'
            ? 'CHANGES_REQUESTED'
            : 'RECORDED',
      summary:
        'Recorded a source-linked software release action; external provider success and client acceptance are human attestations.',
      changes: [
        { field: 'state', before: null, after: release.status },
        { field: 'revision', before: null, after: String(release.revision) },
      ],
    });
    return eventReceipt(event);
  }

  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseReleaseInput(releaseSaveSchema, raw),
      inputHash = advertisingHash(input);
    validateReleaseDependencies(input.body);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      input.id,
      input.requestId,
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
        const { project, owner, body } = prepared;
        const repository = manager.getRepository(DeliveryReleaseEntity);
        let release = prepared.release;
        if (!release) {
          const actor = (
            await this.source.access.listActiveMembers(workspace.id, manager)
          ).find((candidate) => candidate.memberId === memberId);
          release = repository.create({
            id: input.id,
            workspaceId: workspace.id,
            projectId: project.id,
            companyId: project.companyId,
            createdBy: memberId,
            createdByName: actor?.name ?? 'Workspace member',
            revision: 0,
            currentVersion: 0,
          });
        }
        release.revision++;
        release.currentVersion++;
        release.status = 'DRAFT';
        release.title = body.title;
        release.ownerId = owner.id;
        release.ownerName = owner.name;
        release.targetDate = body.targetDate;
        release.approvedVersion = null;
        release.reviewedBy = null;
        release.reviewedAt = null;
        await repository.save(release);
        await manager.getRepository(DeliveryReleaseVersionEntity).insert({
          workspaceId: workspace.id,
          releaseId: release.id,
          version: release.currentVersion,
          body,
          createdBy: memberId,
        });
        return this.record(manager, workspace, access, release, {
          requestId: input.requestId,
          inputHash,
          action: 'SAVE',
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
    const input = parseReleaseInput(releaseDecisionSchema, raw),
      inputHash = advertisingHash(input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      input.id,
      input.requestId,
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
        const { release, version, sourceFingerprint, project, currentTasks } =
          selected;
        if (
          release.revision !== input.revision ||
          input.sourceFingerprint !== sourceFingerprint
        )
          throw new ConflictException(
            'The release or its source evidence changed. Refresh before recording this action.',
          );
        const sourceChanged =
          version.body.sourceFingerprint !== sourceFingerprint;
        if (input.action !== 'REQUEST_CHANGES' && sourceChanged)
          throw new ConflictException(
            'Linked task evidence changed after this version was saved. Return it for a fresh manifest.',
          );
        if (
          input.action !== 'REQUEST_CHANGES' &&
          !(await this.source.owners(manager, workspace, project)).some(
            (owner) => owner.id === release.ownerId,
          )
        )
          throw new BadRequestException(
            'This release needs a currently eligible owner.',
          );
        if (input.action === 'SUBMIT') {
          if (!editable(release, access))
            throw new ForbiddenException(
              'Only the current release team can submit an editable manifest.',
            );
          assertReleaseReady(version.body, currentTasks);
          release.status = 'SUBMITTED';
        } else if (['APPROVE', 'REQUEST_CHANGES'].includes(input.action)) {
          if (
            release.status !== 'SUBMITTED' ||
            !managerAccess(access) ||
            [release.createdBy, release.ownerId, version.createdBy].includes(
              memberId,
            )
          )
            throw new ForbiddenException(
              'A different current delivery manager must review this release.',
            );
          if (input.action === 'REQUEST_CHANGES') {
            if (!input.note)
              throw new BadRequestException(
                'Explain the release changes needed.',
              );
            release.status = 'CHANGES_REQUESTED';
            release.approvedVersion = null;
            release.reviewedBy = null;
            release.reviewedAt = null;
          } else {
            assertReleaseReady(version.body, currentTasks);
            release.status = 'APPROVED';
            release.approvedVersion = release.currentVersion;
            release.reviewedBy = memberId;
            release.reviewedAt = new Date();
          }
        } else {
          if (
            !input.note ||
            !input.evidenceUrl ||
            input.commitSha !== version.body.commitSha
          )
            throw new BadRequestException(
              'Add evidence and notes for the exact approved commit.',
            );
          if (
            input.action === 'RECORD_DEPLOYMENT' ||
            input.action === 'RECORD_DEPLOYMENT_FAILED'
          ) {
            if (
              !['APPROVED', 'DEPLOYED'].includes(release.status) ||
              !(managerAccess(access) || release.ownerId === memberId)
            )
              throw new ForbiddenException(
                'Record deployment only for an approved release you manage.',
              );
            if (!input.environment)
              throw new BadRequestException('Name the deployment environment.');
            assertReleaseReady(version.body, currentTasks);
            release.status =
              input.action === 'RECORD_DEPLOYMENT' ? 'DEPLOYED' : 'APPROVED';
          } else if (input.action === 'RECORD_HANDOVER') {
            if (release.status !== 'DEPLOYED' || !managerAccess(access))
              throw new ForbiddenException(
                'A manager must record client handover after deployment.',
              );
            release.status = 'HANDED_OVER';
          } else {
            if (release.status !== 'HANDED_OVER' || !managerAccess(access))
              throw new ForbiddenException(
                'A manager must record client acceptance after handover.',
              );
            release.status = 'ACCEPTED';
          }
        }
        release.revision++;
        await manager.getRepository(DeliveryReleaseEntity).save(release);
        return this.record(manager, workspace, access, release, {
          ...input,
          inputHash,
        });
      },
      transactionManager,
    );
  }
}
