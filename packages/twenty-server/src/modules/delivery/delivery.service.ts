import {
  assertCreativeSubmission,
  invalidateCreativeBrief,
} from 'src/modules/delivery/creative/delivery-creative.policy';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryMemberEntity } from 'src/modules/delivery/entities/delivery-member.entity';
import { deliveryCommandSchema } from 'src/modules/delivery/delivery-validation';
import {
  assertDeliveryReview,
  canAccessDeliveryProject,
} from 'src/modules/delivery/delivery-policy';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';

type DeliveryActor = { memberId: string; isAdmin: boolean; isManager: boolean };
type NativeTask = {
  id: string;
  title: string;
  assigneeId: string;
  dueAt: string | null;
};
type Member = { id: string; name: string };

@Injectable()
export class DeliveryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permissions: PermissionsService,
  ) {}

  schema(workspace: WorkspaceEntity): string {
    if (
      !workspace.databaseSchema ||
      !/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema)
    ) {
      throw new BadRequestException('Workspace is not ready.');
    }
    return `"${workspace.databaseSchema}"`;
  }

  async actor(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<DeliveryActor> {
    if (!isDefined(memberId) || !isDefined(userWorkspaceId))
      throw new ForbiddenException();
    const [profile, isWorkspaceAdmin] = await Promise.all([
      manager
        .getRepository(DeliveryMemberEntity)
        .findOneBy({ workspaceId: workspace.id, workspaceMemberId: memberId }),
      this.permissions.userHasWorkspaceSettingPermission({
        workspaceId: workspace.id,
        userWorkspaceId,
        setting: PermissionFlagType.ROLES,
      }),
    ]);
    const isAdmin = isWorkspaceAdmin || profile?.access === 'ADMIN';
    return {
      memberId,
      isAdmin,
      isManager: isAdmin || profile?.access === 'MANAGER',
    };
  }

  private async members(
    manager: EntityManager,
    workspace: WorkspaceEntity,
  ): Promise<Member[]> {
    return manager.query(
      `SELECT id, trim(concat_ws(' ', "nameFirstName", "nameLastName")) AS name FROM ${this.schema(workspace)}."workspaceMember" WHERE "deletedAt" IS NULL`,
    );
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    const actor = await this.actor(workspace, memberId, userWorkspaceId);
    const projects = (
      await this.dataSource
        .getRepository(DeliveryProjectEntity)
        .findBy({ workspaceId: workspace.id })
    ).filter((project) =>
      canAccessDeliveryProject(actor.isManager, memberId, project.memberIds),
    );
    const projectIds = projects.map((project) => project.id);
    const tasks: (NativeTask & {
      projectId: string;
      details: DeliveryDetails;
      revision: number;
    })[] = projectIds.length
      ? await this.dataSource.query(
          `SELECT t.id, t.title, t."assigneeId", t."dueAt", d."projectId", d.details, d.revision FROM "core"."deliveryTask" d JOIN ${this.schema(workspace)}."task" t ON t.id = d."taskId" WHERE d."workspaceId" = $1 AND d."projectId" = ANY($2::uuid[]) AND t."deletedAt" IS NULL ORDER BY t."dueAt" ASC NULLS LAST, t."createdAt" DESC`,
          [workspace.id, projectIds],
        )
      : [];
    const profiles = await this.dataSource
      .getRepository(DeliveryMemberEntity)
      .findBy({ workspaceId: workspace.id });
    const members = await this.members(this.dataSource.manager, workspace);
    const visibleMemberIds = new Set([
      memberId,
      ...projects.flatMap((project) => project.memberIds),
      ...tasks.flatMap((task) => [task.assigneeId, task.details.reviewerId]),
    ]);
    const companies: { id: string; name: string }[] = actor.isManager
      ? await this.dataSource.query(
          `SELECT id, name FROM ${this.schema(workspace)}."company" WHERE "deletedAt" IS NULL ORDER BY name LIMIT 1000`,
        )
      : projects.some((project) => project.companyId)
        ? await this.dataSource.query(
            `SELECT id, name FROM ${this.schema(workspace)}."company" WHERE id = ANY($1::uuid[]) AND "deletedAt" IS NULL`,
            [projects.map((project) => project.companyId).filter(isDefined)],
          )
        : [];
    return {
      actor,
      projects,
      tasks,
      companies,
      members: members
        .filter((member) => actor.isManager || visibleMemberIds.has(member.id))
        .map((member) => {
          const profile = profiles.find(
            (candidate) => candidate.workspaceMemberId === member.id,
          );
          return {
            ...member,
            roleLabel: profile?.roleLabel ?? '',
            access:
              member.id === actor.memberId && actor.isAdmin
                ? 'ADMIN'
                : (profile?.access ?? 'MEMBER'),
          };
        }),
    };
  }

  async command(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
    const parsed = deliveryCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        'Check the required fields, dates and evidence links.',
      );
    const command = parsed.data;
    const apply = async (manager: EntityManager) => {
      // Serialize access changes with submissions so revocation cannot race a write.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery:${workspace.id}`],
      );
      const actor = await this.actor(
        workspace,
        memberId,
        userWorkspaceId,
        manager,
      );
      const projectRepository = manager.getRepository(DeliveryProjectEntity);
      const taskRepository = manager.getRepository(DeliveryTaskEntity);
      const memberRepository = manager.getRepository(DeliveryMemberEntity);
      const members = await this.members(manager, workspace);
      const assertMembers = (ids: string[]) => {
        if (ids.some((id) => !members.some((member) => member.id === id)))
          throw new BadRequestException('Select active workspace members.');
      };
      const requireManager = () => {
        if (!actor.isManager)
          throw new ForbiddenException('A delivery manager is required.');
      };
      if (command.action === 'member') {
        if (!actor.isAdmin)
          throw new ForbiddenException(
            'Only an administrator can change access.',
          );
        if (command.workspaceMemberId === memberId)
          throw new BadRequestException(
            'Ask another administrator to change your access.',
          );
        assertMembers([command.workspaceMemberId]);
        await memberRepository.upsert(
          {
            workspaceId: workspace.id,
            workspaceMemberId: command.workspaceMemberId,
            access: command.access,
            roleLabel: command.roleLabel,
          },
          ['workspaceId', 'workspaceMemberId'],
        );
        return;
      }
      if (command.action === 'project') {
        requireManager();
        assertMembers(command.memberIds);
        if (command.companyId) {
          const companies: { id: string }[] = await manager.query(
            `SELECT id FROM ${this.schema(workspace)}."company" WHERE id = $1 AND "deletedAt" IS NULL`,
            [command.companyId],
          );
          if (!companies.length)
            throw new BadRequestException('Company not found.');
        }
        const existing = command.id
          ? await projectRepository.findOneBy({
              id: command.id,
              workspaceId: workspace.id,
            })
          : null;
        if (command.id && !existing) throw new NotFoundException();
        await projectRepository.save({
          ...existing,
          workspaceId: workspace.id,
          name: command.name,
          companyId: command.companyId,
          memberIds: [...new Set(command.memberIds)],
        });
        return;
      }
      const event = (action: string, text: string) => ({
        id: v4(),
        actorId: memberId,
        action,
        text,
        at: new Date().toISOString(),
      });
      const validateAssignment = async (
        project: DeliveryProjectEntity,
        assigneeId: string,
        reviewerId: string,
      ) => {
        assertMembers([assigneeId, reviewerId]);
        if (assigneeId === reviewerId)
          throw new BadRequestException(
            'Choose a reviewer other than the assignee.',
          );
        if (!project.memberIds.includes(assigneeId))
          throw new BadRequestException(
            'Add the assignee to this project first.',
          );
        // Workspace role administrators may review without an additional delivery profile.
        const reviewerProfile = await memberRepository.findOneBy({
          workspaceId: workspace.id,
          workspaceMemberId: reviewerId,
        });
        if (
          reviewerId !== memberId &&
          !['ADMIN', 'MANAGER'].includes(reviewerProfile?.access ?? '')
        )
          throw new BadRequestException(
            'Give the reviewer manager access in Team access first.',
          );
      };
      if (command.action === 'create') {
        requireManager();
        const project = await projectRepository.findOneBy({
          id: command.projectId,
          workspaceId: workspace.id,
        });
        if (!project) throw new NotFoundException();
        const fields = command.fields;
        await validateAssignment(project, fields.assigneeId, fields.reviewerId);
        const taskId = v4();
        await manager.query(
          `INSERT INTO ${this.schema(workspace)}."task" (id, title, "assigneeId", "dueAt", status) VALUES ($1, $2, $3, $4, 'TODO')`,
          [taskId, fields.title, fields.assigneeId, fields.dueAt],
        );
        await taskRepository.save({
          workspaceId: workspace.id,
          taskId,
          projectId: project.id,
          details: {
            assignmentAt: new Date().toISOString(),
            brief: fields.brief,
            service: fields.service,
            priority: fields.priority,
            scheduledDate: fields.scheduledDate,
            reviewerId: fields.reviewerId,
            state: 'PLANNED',
            blocker: '',
            checklist: fields.checklist,
            evidence: fields.evidence,
            submissions: [],
            events: [event('CREATED', fields.title)],
          },
        });
        return taskId;
      }
      const deliveryTask = await taskRepository.findOneBy({
        workspaceId: workspace.id,
        taskId: command.taskId,
      });
      if (!deliveryTask) throw new NotFoundException();
      const project = await projectRepository.findOneBy({
        workspaceId: workspace.id,
        id: deliveryTask.projectId,
      });
      if (
        !project ||
        !canAccessDeliveryProject(actor.isManager, memberId, project.memberIds)
      )
        throw new NotFoundException();
      const nativeTasks: NativeTask[] = await manager.query(
        `SELECT id, title, "assigneeId", "dueAt" FROM ${this.schema(workspace)}."task" WHERE id = $1 AND "deletedAt" IS NULL FOR UPDATE`,
        [command.taskId],
      );
      const task = nativeTasks[0];
      if (!task) throw new NotFoundException();
      if (deliveryTask.revision !== command.revision)
        throw new ConflictException(
          'This task changed. Refresh it before saving.',
        );
      const details = deliveryTask.details;
      if (command.action === 'edit') {
        requireManager();
        if (['IN_REVIEW', 'APPROVED'].includes(details.state))
          throw new BadRequestException(
            'Review this submission before editing its brief.',
          );
        await validateAssignment(
          project,
          command.fields.assigneeId,
          command.fields.reviewerId,
        );
        const { title, assigneeId, dueAt, ...fields } = command.fields;
        await manager.query(
          `UPDATE ${this.schema(workspace)}."task" SET title=$2, "assigneeId"=$3, "dueAt"=$4, "updatedAt"=now() WHERE id=$1`,
          [task.id, title, assigneeId, dueAt],
        );
        if (details.creative && fields.brief !== details.brief)
          invalidateCreativeBrief(details.creative);
        if (assigneeId !== task.assigneeId)
          details.assignmentAt = new Date().toISOString();
        Object.assign(details, fields);
        details.events.push(event('UPDATED', title));
      } else if (command.action === 'review') {
        assertDeliveryReview(
          details,
          task.assigneeId,
          memberId,
          actor.isManager,
          command.feedback,
          command.decision,
        );
        const submission = details.submissions[details.submissions.length - 1];
        Object.assign(submission, {
          decision: command.decision,
          feedback: command.feedback,
          reviewedBy: memberId,
          reviewedAt: new Date().toISOString(),
        });
        details.state = command.decision;
        details.events.push(event(command.decision, command.feedback));
      } else if (command.action === 'comment') {
        details.events.push(event('COMMENT', command.text));
      } else {
        if (task.assigneeId !== memberId)
          throw new ForbiddenException(
            'Only the assignee can submit or update production progress.',
          );
        if (['APPROVED', 'IN_REVIEW'].includes(details.state))
          throw new BadRequestException(
            'This submission is locked pending review.',
          );
        if (command.action === 'submit') {
          if (details.creative) assertCreativeSubmission(details.creative);
          else if (!command.evidence.length)
            throw new BadRequestException('Add evidence before submitting.');
          details.submissions.push({
            version: details.submissions.length + 1,
            ...(details.creative
              ? {
                  creativeVersion: details.creative.version,
                  finalAssetId: details.creative.finalAssetId ?? undefined,
                }
              : {}),
            description: command.description,
            evidence: command.evidence,
            submittedBy: memberId,
            submittedAt: new Date().toISOString(),
          });
          details.evidence = command.evidence;
          details.state = 'IN_REVIEW';
          details.blocker = '';
          details.events.push(event('SUBMITTED', command.description));
        } else {
          if (command.state === 'BLOCKED' && !command.blocker.trim())
            throw new BadRequestException(
              'Explain what is blocking this task.',
            );
          details.state = command.state;
          details.blocker = command.blocker;
          details.checklist = command.checklist;
          details.evidence = command.evidence;
          details.events.push(event('PROGRESS', command.state));
        }
      }
      deliveryTask.revision += 1;
      await taskRepository.save(deliveryTask);
      await manager.query(
        `UPDATE ${this.schema(workspace)}."task" SET status=$2, "updatedAt"=now() WHERE id=$1`,
        [
          task.id,
          details.state === 'APPROVED'
            ? 'DONE'
            : details.state === 'PLANNED'
              ? 'TODO'
              : 'IN_PROGRESS',
        ],
      );
    };
    if (transactionManager) {
      return apply(transactionManager);
    }
    await this.dataSource.transaction(apply);
    return this.snapshot(workspace, memberId, userWorkspaceId);
  }
}
