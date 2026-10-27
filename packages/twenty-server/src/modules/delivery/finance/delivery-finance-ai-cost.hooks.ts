import { ConflictException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { type DeliveryFinanceAiCostOriginDTO } from 'src/modules/delivery/finance/delivery-finance-ai-cost-origin.dto';
import { type FinanceAiCostOrigin } from 'src/modules/delivery/finance/delivery-finance-ai-cost.policy';
import { DeliveryFinanceAiClaimEntity } from 'src/modules/delivery/finance/entities/delivery-finance-ai-claim.entity';
import { type DeliveryFinanceEntryEntity } from 'src/modules/delivery/finance/entities/delivery-finance-entry.entity';

export const projectFinanceAiCostOrigin = (
  origin: FinanceAiCostOrigin | null,
): DeliveryFinanceAiCostOriginDTO | null =>
  origin
    ? {
        spendId: origin.spendId,
        spendRevision: origin.spendRevision,
        evidenceEventId: origin.evidenceEventId,
        basis: origin.basis,
        amountMicros: origin.amountMicros,
        currency: origin.currency,
        modelId: origin.modelId,
        sourceKind: origin.sourceKind,
        recordedAt: origin.recordedAt,
        projectId: origin.projectId,
        projectName: origin.projectName,
        replacesEntryId: origin.replacesEntryId,
        correctionReason: origin.correctionReason,
      }
    : null;

export const lockFinanceAiSource = async (
  manager: EntityManager,
  workspaceId: string,
  spendId: string,
) => {
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `finance-ai-source:${workspaceId}:${spendId}`,
  ]);
};

export const releaseFinanceAiClaim = async (
  manager: EntityManager,
  workspaceId: string,
  entry: DeliveryFinanceEntryEntity,
) => {
  if (entry.sourceType !== 'AI_SPEND') return;
  if (!entry.sourceAiSpend)
    throw new ConflictException('The AI cost source claim is unavailable.');
  const claim = await manager
    .getRepository(DeliveryFinanceAiClaimEntity)
    .findOneBy({ workspaceId, spendId: entry.sourceAiSpend.spendId });
  if (!claim)
    throw new ConflictException('The AI cost source claim is unavailable.');
  if (claim.currentEntryId === entry.id) {
    if (claim.replacementEntryId)
      throw new ConflictException(
        'Void the pending replacement draft before voiding its original AI cost.',
      );
    claim.currentEntryId = null;
    claim.reviewedSpendRevision = null;
  } else if (claim.replacementEntryId === entry.id)
    claim.replacementEntryId = null;
  else
    throw new ConflictException(
      'This AI cost no longer owns its source claim.',
    );
  claim.revision++;
  await manager.getRepository(DeliveryFinanceAiClaimEntity).save(claim);
};
