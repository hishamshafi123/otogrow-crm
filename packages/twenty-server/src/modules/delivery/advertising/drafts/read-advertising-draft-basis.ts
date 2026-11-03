import { ConflictException, ForbiddenException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { canUseDeliveryAgent } from 'src/modules/delivery/agents/delivery-agent-access';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { type AdvertisingSourceEnvelope } from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.types';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { type AdvertisingGoalSnapshot } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';
import { DeliveryAdvertisingDraftRunEntity } from 'src/modules/delivery/advertising/drafts/entities/delivery-advertising-draft-run.entity';
import {
  ADVERTISING_DRAFT_OUTPUT_VERSION,
  ADVERTISING_DRAFT_PROMPT_VERSION,
} from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.types';

export const ADVERTISING_DRAFT_METADATA_FIELDS: (keyof DeliveryAdvertisingDraftRunEntity)[] =
  [
    'id',
    'workspaceId',
    'requestId',
    'projectId',
    'companyId',
    'sourceKind',
    'sourceId',
    'initiatorId',
    'initiatorName',
    'userWorkspaceId',
    'agentId',
    'agentVersion',
    'agent',
    'basis',
    'revision',
    'status',
    'inputHash',
    'bodyFingerprint',
    'contextFingerprint',
    'startReceipt',
    'cancelRequestId',
    'cancelInputHash',
    'cancelReceipt',
    'createdAt',
    'updatedAt',
    'startedAt',
    'finishedAt',
    'error',
  ];
export const readAdvertisingDraftKnowledgeFingerprint = async (
  manager: EntityManager,
  workspaceId: string,
  projectId: string,
) => {
  if (!manager.queryRunner?.isTransactionActive)
    throw new Error(
      'Advertising evidence requires the authorized source transaction.',
    );
  await manager.query(
    'SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',
    [`knowledge:${workspaceId}:${projectId}`],
  );
  const [metadata]: { fingerprint: string }[] = await manager.query(
    `SELECT md5(COALESCE(string_agg(id::text || ':' || "publishedVersion"::text, '|' ORDER BY id), '')) AS fingerprint FROM core."deliveryKnowledgeSource" WHERE "workspaceId"=$1 AND "projectId"=$2 AND "publishedVersion" IS NOT NULL`,
    [workspaceId, projectId],
  );
  return metadata.fingerprint;
};
export const advertisingDraftBlockingReasons = async (
  manager: EntityManager,
  run: Pick<
    DeliveryAdvertisingDraftRunEntity,
    | 'workspaceId'
    | 'projectId'
    | 'companyId'
    | 'agentId'
    | 'agentVersion'
    | 'basis'
  >,
  source: AdvertisingSourceEnvelope,
) => {
  if (!source.actor.isManager || !source.canManageDraft || !source.project)
    throw new ForbiddenException(
      'Current manager access to this advertising source is required.',
    );
  const reasons: string[] = [];
  if (
    source.project.id !== run.projectId ||
    source.source.companyId !== run.companyId
  )
    throw new ForbiddenException(
      'This advertising source no longer belongs to the original client project.',
    );
  if (source.fingerprint !== run.basis.sourceFingerprint)
    reasons.push('SOURCE_CHANGED');
  if (source.evidenceFingerprint !== run.basis.evidenceFingerprint)
    reasons.push('EVIDENCE_CHANGED');
  if (
    run.basis.promptVersion !== ADVERTISING_DRAFT_PROMPT_VERSION ||
    run.basis.outputVersion !== ADVERTISING_DRAFT_OUTPUT_VERSION
  )
    reasons.push('OUTPUT_CONTRACT_CHANGED');
  if (
    (await readAdvertisingDraftKnowledgeFingerprint(
      manager,
      run.workspaceId,
      run.projectId,
    )) !== run.basis.knowledgeFingerprint
  )
    reasons.push('KNOWLEDGE_CHANGED');
  const agent = await manager
    .getRepository(DeliveryAgentEntity)
    .findOneBy({ workspaceId: run.workspaceId, id: run.agentId });
  if (
    !agent ||
    agent.version !== run.agentVersion ||
    !agent.configuration.enabled ||
    agent.configuration.kind !== 'ADVERTISING' ||
    !agent.configuration.projectIds.includes(run.projectId) ||
    !canUseDeliveryAgent(agent.configuration, source.actor)
  )
    reasons.push('ASSISTANT_CHANGED_OR_UNAVAILABLE');
  return reasons;
};

export const validateAdvertisingActionOrigin = async (
  manager: EntityManager,
  workspaceId: string,
  source: AdvertisingSourceEnvelope,
  goal: AdvertisingGoalSnapshot,
  action: {
    title: string;
    rationale: string;
    expectedResult: string;
    evidence: string;
    origin?: { runId: string; suggestionId: string } | null;
  },
) => {
  const origin = action.origin;
  if (!origin) return null;
  const run = await manager
    .getRepository(DeliveryAdvertisingDraftRunEntity)
    .findOne({
      where: { workspaceId, id: origin.runId },
      select: [...ADVERTISING_DRAFT_METADATA_FIELDS, 'result'],
    });
  if (
    !run ||
    run.sourceKind !== source.source.kind ||
    run.sourceId !== source.source.id ||
    run.status !== 'SUCCEEDED' ||
    !run.result
  )
    throw new ConflictException(
      'The selected AI suggestion is unavailable for this report. Review its source before saving.',
    );
  const reasons = await advertisingDraftBlockingReasons(manager, run, source);
  if (reasons.length || run.basis.goalFingerprint !== advertisingHash(goal))
    throw new ConflictException(
      'The AI suggestion evidence, outcome, knowledge or assistant changed. Review current evidence and prepare new suggestions before using this origin.',
    );
  const suggestion = run.result.suggestions.find(
    (item) => item.id === origin.suggestionId,
  );
  if (!suggestion)
    throw new ConflictException(
      'This suggestion does not belong to the selected AI run.',
    );
  return {
    runId: run.id,
    suggestionId: suggestion.id,
    humanEdited: (
      ['title', 'rationale', 'expectedResult', 'evidence'] as const
    ).some((field) => action[field] !== suggestion[field]),
  };
};
