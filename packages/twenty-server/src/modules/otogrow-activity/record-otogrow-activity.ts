import { type EntityManager } from 'typeorm';
import { isValidUuid } from 'twenty-shared/utils';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryAgentRunEntity } from 'src/modules/delivery/entities/delivery-agent-run.entity';
import { DeliveryAdvertisingDraftRunEntity } from 'src/modules/delivery/advertising/drafts/entities/delivery-advertising-draft-run.entity';
import { OtogrowActivityAnalysisRunEntity } from 'src/modules/otogrow-activity/analysis/entities/otogrow-activity-analysis-run.entity';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { OtogrowActivityEventEntity } from 'src/modules/otogrow-activity/entities/otogrow-activity-event.entity';
import { type OtogrowActivityInput } from 'src/modules/otogrow-activity/otogrow-activity.types';

const STRUCTURAL_FIELDS = new Set([
  'revisionRound',
  'handoffOpportunityId',
  'handoffQuoteId',
  'handoffTaskCount',
  'revisionSource',
  'revisionCause',
  'revisionEffortMinutes',
  'revisionInternalCost',
  'revisionProposedCharge',
  'revisionCurrency',
  'availableMinutes',
  'workMinutes',
  'revisionMinutes',
  'waitMinutes',
  'reviewMinutes',
  'reviewDate',
  'complexity',
  'archived',
  'creativeVersion',
  'productionVersion',
  'briefVersion',
  'approvedBriefVersion',
  'assemblyVersion',
  'referenceCount',
  'shotCount',
  'variantCount',
  'selectedVariantCount',
  'assetKind',
  'assetId',
  'shotId',
  'mediaRunId',
  'mediaKind',
  'reviewCount',
  'accountId',
  'engagementId',
  'scheduleTimezone',
  'managerId',
  'marketerId',
  'reportDate',
  'catchUpDays',
  'refreshDays',
  'dailyImportLimit',
  'reportCount',
  'adCount',
  'credentialChanged',
  'alertCategory',
  'severity',
  'ownerId',
  'acknowledged',
  'resolved',
  'linked',
  'recordKind',
  'financeCategory',
  'financeMonth',
  'financePlanType',
  'allocationCount',
  'sourceWarningCount',
  'private',
  'readMemberIds',
  'sendMemberIds',
  'readRoles',
  'sendRoles',
  'entryKind',
  'entryCount',
  'grantCount',
  'advertisingEnabled',
  'serviceCount',
  'formFieldCount',
  'billing',
  'submissionCount',
  'assetCount',
  'shareKind',
  'shareVersion',
  'linkCount',
  'enabled',
  'paused',
  'telegramEnabled',
  'timezone',
  'founderId',
  'frequency',
  'weekdays',
  'monthDay',
  'time',
  'startDate',
  'endDate',
  'dueHours',
  'projectId',
  'agentKind',
  'dailyRunLimit',
  'maxOutputTokens',
  'projectCount',
  'roleCount',
  'agentAccessMode',
  'agentRoles',
  'instructionsChanged',
  'modelChanged',
  'Role',
  'Roles',
  'Permissions',
  'state',
  'assigneeId',
  'reviewerId',
  'dueAt',
  'scheduledDate',
  'priority',
  'revision',
  'submissionVersion',
  'evidenceCount',
  'checklistCount',
  'checklistCompleted',
  'memberCount',
  'memberIds',
  'companyId',
  'runStatus',
  'agentVersion',
  'taskRevision',
  'appliedField',
  'findingCount',
  'suggestionCount',
  'includedEventCount',
  'omittedEventCount',
  'advertisingSourceKind',
  'advertisingSourceId',
  'inputTokens',
  'outputTokens',
  'fulfilmentStatus',
  'deliveryCycle',
  'nextCheckAt',
  'sequenceNumber',
  'monthKey',
  'clientVisibility',
  'purgedDeliverables',
  'purgedVariations',
  'reclaimedBytes',
  'portalSlug',
  'revokedAt',
  'googleEmail',
  'monthFolderPattern',
  'autoPurgeVpsAfterHours',
  'variationCount',
  'hookProjectStatus',
  'clientReview',
  'clientFee',
  'clientTags',
  'paymentDate',
  'includedClientCount',
  'excludedClientCount',
]);

export const recordOtogrowActivity = async (
  manager: EntityManager,
  input: OtogrowActivityInput,
) => {
  // The business write and its evidence must commit or roll back together.
  if (!manager.queryRunner?.isTransactionActive)
    throw new Error('Activity recording requires the business transaction.');
  // Audit accepts structural changes, never arbitrary documents or provider payloads.
  if (
    input.summary.length > 240 ||
    !/^[A-Z][A-Z_]{0,79}$/.test(input.action) ||
    (input.changes?.length ?? 0) > 40 ||
    input.changes?.some(
      (change) =>
        !STRUCTURAL_FIELDS.has(change.field) ||
        (change.before?.length ?? 0) > 10000 ||
        (change.after?.length ?? 0) > 10000,
    )
  )
    throw new Error('Activity must contain supported structural changes only.');
  const workspace = await manager
    .getRepository(WorkspaceEntity)
    .findOneByOrFail({ id: input.workspaceId });
  if (
    !workspace.databaseSchema ||
    !/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema)
  )
    throw new Error('Workspace schema is unavailable for activity recording.');
  const people: { id: string; name: string }[] = await manager.query(
    `SELECT id, trim(concat_ws(' ', "nameFirstName", "nameLastName")) AS name FROM "${workspace.databaseSchema}"."workspaceMember" WHERE id = ANY($1::uuid[])`,
    [
      [
        input.actorId,
        input.subjectMemberId,
        ...(input.changes ?? [])
          .filter((change) =>
            [
              'assigneeId',
              'reviewerId',
              'founderId',
              'ownerId',
              'managerId',
              'marketerId',
              'memberIds',
              'readMemberIds',
              'sendMemberIds',
            ].includes(change.field),
          )
          .flatMap((change) => [change.before, change.after])
          .flatMap((value) => value?.split(',').map((id) => id.trim()) ?? []),
      ].filter(isValidUuid),
    ],
  );
  const project = input.projectId
    ? await manager.getRepository(DeliveryProjectEntity).findOneByOrFail({
        id: input.projectId,
        workspaceId: input.workspaceId,
      })
    : null;
  const clients: { id: string; name: string }[] = project?.companyId
    ? await manager.query(
        `SELECT id, name FROM "${workspace.databaseSchema}"."company" WHERE id=$1`,
        [project.companyId],
      )
    : [];
  const tasks: { title: string }[] = input.taskId
    ? await manager.query(
        `SELECT title FROM "${workspace.databaseSchema}".task WHERE id=$1`,
        [input.taskId],
      )
    : [];
  const run =
    input.sourceType === 'agent-run'
      ? await manager
          .getRepository(DeliveryAgentRunEntity)
          .findOneBy({ id: input.sourceId, workspaceId: input.workspaceId })
      : null;
  const agent =
    input.sourceType === 'agent'
      ? await manager
          .getRepository(DeliveryAgentEntity)
          .findOneBy({ id: input.sourceId, workspaceId: input.workspaceId })
      : null;
  const advertisingRun =
    input.sourceType === 'advertising-draft'
      ? await manager.getRepository(DeliveryAdvertisingDraftRunEntity).findOne({
          where: { id: input.sourceId, workspaceId: input.workspaceId },
          select: { id: true, agent: true },
        })
      : null;
  const activityAnalysisRun =
    input.sourceType === 'activity-analysis'
      ? await manager.getRepository(OtogrowActivityAnalysisRunEntity).findOne({
          where: { id: input.sourceId, workspaceId: input.workspaceId },
          select: { id: true, agent: true },
        })
      : null;
  // Retain identity snapshots even if staff or client records are later removed.
  await manager.getRepository(OtogrowActivityEventEntity).insert({
    workspaceId: input.workspaceId,
    occurredAt: input.occurredAt ?? new Date(),
    actorId: input.actorId,
    actorName:
      people.find((person) => person.id === input.actorId)?.name ||
      (input.actorId
        ? 'Former team member'
        : input.actorType === 'CLIENT'
          ? 'Client portal'
          : 'System'),
    actorType: input.actorType ?? 'HUMAN',
    subjectMemberId: input.subjectMemberId ?? null,
    subjectName: input.subjectMemberId
      ? people.find((person) => person.id === input.subjectMemberId)?.name ||
        'Former team member'
      : null,
    category: input.category,
    action: input.action,
    outcome: input.outcome,
    summary: input.summary,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    clientId: project?.companyId ?? null,
    clientName: clients[0]?.name ?? null,
    taskId: input.taskId ?? null,
    taskName: tasks[0]?.title ?? run?.context.title ?? null,
    agentName:
      run?.configuration.name ??
      agent?.configuration.name ??
      advertisingRun?.agent.name ??
      activityAnalysisRun?.agent.name ??
      null,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    changes: (input.changes ?? []).map((change) => ({
      ...change,
      ...([
        'assigneeId',
        'reviewerId',
        'founderId',
        'ownerId',
        'managerId',
        'marketerId',
      ].includes(change.field)
        ? {
            before:
              people.find((person) => person.id === change.before)?.name ||
              change.before,
            after:
              people.find((person) => person.id === change.after)?.name ||
              change.after,
          }
        : {}),
      ...(['memberIds', 'readMemberIds', 'sendMemberIds'].includes(change.field)
        ? {
            before:
              change.before
                ?.split(',')
                .map(
                  (id) =>
                    people.find((person) => person.id === id.trim())?.name ||
                    id.trim(),
                )
                .join(', ') ?? null,
            after:
              change.after
                ?.split(',')
                .map(
                  (id) =>
                    people.find((person) => person.id === id.trim())?.name ||
                    id.trim(),
                )
                .join(', ') ?? null,
          }
        : {}),
    })),
  });
};
