import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryReleaseEntity } from './entities/delivery-release.entity';
import { DeliveryReleaseVersionEntity } from './entities/delivery-release-version.entity';
import { DeliveryReleaseEventEntity } from './entities/delivery-release-event.entity';
import {
  managerAccess,
  editable,
  eventReceipt,
} from './delivery-release.access';
import { escapeForIlike } from 'twenty-shared/utils';
import {
  parseReleaseInput,
  releaseReviewBlockedReason,
} from './delivery-release.policy';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  releaseProjectsSchema,
  releaseListSchema,
  releaseChoicesSchema,
  releaseSelectionSchema,
  releaseReceiptSchema,
  releaseSaveSchema,
} from './delivery-release.types';
import { DeliveryReleaseSourceService } from './delivery-release-source.service';
@Injectable()
export class DeliveryReleaseReadsService {
  constructor(private readonly source: DeliveryReleaseSourceService) {}

  async projects(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseReleaseInput(releaseProjectsSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const visibility = await this.source.visibility(
          manager,
          workspace,
          access,
        );
        const query = manager
          .getRepository(DeliveryProjectEntity)
          .createQueryBuilder('project')
          .where('project."workspaceId"=:workspaceId', {
            workspaceId: workspace.id,
          });
        if (!managerAccess(access))
          query.andWhere('project."memberIds" ? :memberId', { memberId });
        if (input.search)
          query.andWhere('project.name ILIKE :search', {
            search: `%${escapeForIlike(input.search)}%`,
          });
        const totalCount = await query.getCount();
        if (input.afterId)
          query.andWhere('project.id>:afterId', { afterId: input.afterId });
        const rows = await query
          .orderBy('project.id', 'ASC')
          .take(26)
          .getMany();
        return {
          ...this.source.identity(workspace, access, visibility),
          items: rows.slice(0, 25),
          totalCount,
          nextId: rows.length > 25 ? rows[24].id : null,
        };
      },
      transactionManager,
    );
  }

  async list(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseReleaseInput(releaseListSchema, raw);
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
        const native = this.source
          .tasksQuery(manager, workspace, project.id, visibility)
          .select('1')
          .andWhere(
            `"activityNativeTask".id=(releaseReference->>'taskId')::uuid`,
          );
        const query = manager
          .getRepository(DeliveryReleaseEntity)
          .createQueryBuilder('release')
          .innerJoin(
            DeliveryReleaseVersionEntity,
            'version',
            'version."workspaceId"=release."workspaceId" AND version."releaseId"=release.id AND version.version=release."currentVersion"',
          )
          .where(
            'release."workspaceId"=:workspaceId AND release."projectId"=:projectId AND release."companyId" IS NOT DISTINCT FROM :companyId::uuid',
            {
              workspaceId: workspace.id,
              projectId: project.id,
              companyId: project.companyId,
            },
          )
          .andWhere(
            `NOT EXISTS (SELECT 1 FROM jsonb_array_elements(version.body->'work') releaseReference WHERE NOT EXISTS (${native.getQuery()}))`,
          )
          .setParameters(native.getParameters());
        if (input.status)
          query.andWhere('release.status=:status', { status: input.status });
        const totalCount = await query.getCount();
        if (input.afterId)
          query.andWhere('release.id>:afterId', { afterId: input.afterId });
        const rows = await query
          .orderBy('release.id', 'ASC')
          .take(26)
          .getMany();
        return {
          ...this.source.identity(workspace, access, visibility),
          project,
          items: rows.slice(0, 25),
          totalCount,
          nextId: rows.length > 25 ? rows[24].id : null,
        };
      },
      transactionManager,
    );
  }

  async choices(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseReleaseInput(releaseChoicesSchema, raw);
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
        const tasks = await this.source.tasks(
          manager,
          workspace,
          project.id,
          visibility,
          { afterId: input.afterTaskId, search: input.search, paged: true },
        );
        const selected = input.selectedTaskIds?.length
          ? await this.source.tasks(
              manager,
              workspace,
              project.id,
              visibility,
              { ids: input.selectedTaskIds },
            )
          : null;
        if (selected && selected.items.length !== input.selectedTaskIds?.length)
          throw new ForbiddenException(
            'A selected task is unavailable under your current permissions.',
          );
        const owners = await this.source.owners(manager, workspace, project);
        if (owners.length > 100)
          throw new BadRequestException(
            'This project has more than100 eligible release owners. Narrow its team before planning a release.',
          );
        return {
          ...this.source.identity(workspace, access, visibility),
          project,
          owners,
          tasks: tasks.items,
          selectedTasks: selected?.items ?? [],
          totalCount: tasks.totalCount,
          nextTaskId: tasks.nextId,
        };
      },
      transactionManager,
    );
  }

  async detail(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseReleaseInput(releaseSelectionSchema, raw);
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
        const { release, project, version, visibility, sourceFingerprint } =
          selected;
        const query = manager
          .getRepository(DeliveryReleaseEventEntity)
          .createQueryBuilder('event')
          .where(
            'event."workspaceId"=:workspaceId AND event."releaseId"=:releaseId',
            { workspaceId: workspace.id, releaseId: release.id },
          );
        if (input.afterEventId) {
          const cursor = await manager
            .getRepository(DeliveryReleaseEventEntity)
            .findOneBy({
              workspaceId: workspace.id,
              releaseId: release.id,
              id: input.afterEventId,
            });
          if (!cursor)
            throw new BadRequestException(
              'This release history page is unavailable. Open its first page.',
            );
          query.andWhere('event.revision<:revision', {
            revision: cursor.revision,
          });
        }
        const events = await query
          .orderBy('event.revision', 'DESC')
          .take(26)
          .getMany();
        const historyVersions = await manager
          .getRepository(DeliveryReleaseVersionEntity)
          .createQueryBuilder('version')
          .where(
            'version."workspaceId"=:workspaceId AND version."releaseId"=:releaseId AND version.version=ANY(:versions::integer[])',
            {
              workspaceId: workspace.id,
              releaseId: release.id,
              versions: [
                ...new Set(events.slice(0, 25).map((event) => event.version)),
              ],
            },
          )
          .getMany();
        const historyTaskIds = [
          ...new Set(
            historyVersions.flatMap((entry) =>
              entry.body.work.map((work) => work.taskId),
            ),
          ),
        ];
        if (historyTaskIds.length) {
          const visible = await this.source
            .tasksQuery(manager, workspace, project.id, visibility)
            .select('"activityNativeTask".id', 'id')
            .andWhere('"activityNativeTask".id=ANY(:historyTaskIds::uuid[])', {
              historyTaskIds,
            })
            .limit(751)
            .getRawMany<{ id: string }>();
          if (visible.length !== historyTaskIds.length)
            throw new ForbiddenException(
              'A historical release task is unavailable under your current permissions.',
            );
        }
        const current = version.version === release.currentVersion;
        const sourceChanged =
          version.body.sourceFingerprint !== sourceFingerprint;
        const independent =
          managerAccess(access) &&
          ![release.createdBy, release.ownerId, version.createdBy].includes(
            memberId,
          );
        const canEdit = current && editable(release, access);
        const reviewBlockedReason = releaseReviewBlockedReason(
          version.body,
          selected.currentTasks,
        );
        const ownerEligible = (
          await this.source.owners(manager, workspace, project)
        ).some((owner) => owner.id === release.ownerId);
        return {
          ...this.source.identity(workspace, access, visibility),
          release,
          project,
          selectedVersion: version.version,
          body: version.body,
          history: events.slice(0, 25).map(eventReceipt),
          nextEventId: events.length > 25 ? events[24].id : null,
          currentSourceFingerprint: sourceFingerprint,
          sourceChanged,
          canEdit,
          canSubmit:
            canEdit &&
            !sourceChanged &&
            ownerEligible &&
            reviewBlockedReason === null,
          reviewBlockedReason: !ownerEligible
            ? 'Choose a currently eligible release owner.'
            : reviewBlockedReason,
          canReview: current && release.status === 'SUBMITTED' && independent,
          canRecordDeployment:
            current &&
            !sourceChanged &&
            ownerEligible &&
            ['APPROVED', 'DEPLOYED'].includes(release.status) &&
            (managerAccess(access) || release.ownerId === memberId),
          canRecordHandover:
            current &&
            !sourceChanged &&
            ownerEligible &&
            release.status === 'DEPLOYED' &&
            managerAccess(access),
          canRecordAcceptance:
            current &&
            !sourceChanged &&
            ownerEligible &&
            release.status === 'HANDED_OVER' &&
            managerAccess(access),
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
    const input = parseReleaseInput(releaseSaveSchema, raw);
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
          ...this.source.identity(workspace, access, prepared.visibility),
          releaseId: input.id,
          requestId: input.requestId,
          inputHash: advertisingHash(input),
          ownerName: prepared.owner.name,
          body: prepared.body,
          reviewBlockedReason: releaseReviewBlockedReason(
            prepared.body,
            prepared.body.tasks,
          ),
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
    const input = parseReleaseInput(releaseReceiptSchema, raw);
    return this.source.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const event = await manager
          .getRepository(DeliveryReleaseEventEntity)
          .findOneBy({ workspaceId: workspace.id, requestId: input.requestId });
        if (!event)
          return { ...this.source.identity(workspace, access), receipt: null };
        await this.source.selected(
          manager,
          workspace,
          access,
          event.releaseId,
          event.version,
        );
        if (
          event.actorId !== memberId ||
          event.userWorkspaceId !== userWorkspaceId
        )
          throw new ForbiddenException(
            'This saved release request belongs to another person.',
          );
        return {
          ...this.source.identity(workspace, access),
          receipt: eventReceipt(event),
        };
      },
      transactionManager,
    );
  }
}
