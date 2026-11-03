import {
  Field,
  Float,
  ID,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

const CreativeReadOutputKind = { IMAGE: 'IMAGE', VIDEO: 'VIDEO' } as const;
registerEnumType(CreativeReadOutputKind, { name: 'CreativeReadOutputKind' });
const CreativeReadObjective = { ADS: 'ADS', ORGANIC: 'ORGANIC' } as const;
registerEnumType(CreativeReadObjective, { name: 'CreativeReadObjective' });
const CreativeReadReviewDecision = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ESCALATED: 'ESCALATED',
} as const;
registerEnumType(CreativeReadReviewDecision, {
  name: 'CreativeReadReviewDecision',
});
const CreativeReadStorageState = {
  PENDING: 'PENDING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
registerEnumType(CreativeReadStorageState, {
  name: 'CreativeReadStorageState',
});
const CreativeReadAssetKind = {
  REFERENCE: 'REFERENCE',
  IMAGE: 'IMAGE',
  CLIP: 'CLIP',
  BASE: 'BASE',
  HOOK: 'HOOK',
  CTA: 'CTA',
  FINAL: 'FINAL',
  AUDIO: 'AUDIO',
} as const;
registerEnumType(CreativeReadAssetKind, { name: 'CreativeReadAssetKind' });
const CreativeReadMediaRole = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  MEMBER: 'MEMBER',
} as const;
registerEnumType(CreativeReadMediaRole, { name: 'CreativeReadMediaRole' });
const CreativeReadMediaKind = {
  IMAGE: 'IMAGE',
  CLIP: 'CLIP',
  ASSEMBLY: 'ASSEMBLY',
  INSPECTION: 'INSPECTION',
  VIDEO_QA: 'VIDEO_QA',
} as const;
registerEnumType(CreativeReadMediaKind, { name: 'CreativeReadMediaKind' });
const CreativeReadRunStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
registerEnumType(CreativeReadRunStatus, { name: 'CreativeReadRunStatus' });

@ObjectType('DeliveryCreativeBrief')
export class DeliveryCreativeBriefDTO {
  @Field(() => CreativeReadOutputKind, { nullable: true }) outputKind?:
    | ('IMAGE' | 'VIDEO')
    | null;
  @Field(() => CreativeReadObjective) objective: 'ADS' | 'ORGANIC';
  @Field(() => String) audience: string;
  @Field(() => String) painPoint: string;
  @Field(() => String) angle: string;
  @Field(() => String) concept: string;
  @Field(() => String) productFacts: string;
  @Field(() => String) mandatoryClaims: string;
  @Field(() => String) visualDirection: string;
  @Field(() => String) format: string;
  @Field(() => String) hook: string;
  @Field(() => String) cta: string;
  @Field(() => String) music: string;
  @Field(() => Int) duration: number;
  @Field(() => [ID]) brandAssets: string[];
}

@ObjectType('DeliveryCreativeReviewRecord')
export class DeliveryCreativeReviewRecordDTO {
  @Field(() => ID) memberId: string;
  @Field(() => String) at: string;
  @Field(() => CreativeReadReviewDecision) decision:
    | 'APPROVED'
    | 'REJECTED'
    | 'ESCALATED';
  @Field(() => String) notes: string;
}

@ObjectType('DeliveryCreativeReference')
export class DeliveryCreativeReferenceDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) version: number;
  @Field(() => String) title: string;
  @Field(() => String, { nullable: true }) url?: string | null;
  @Field(() => ID, { nullable: true }) assetId?: string | null;
  @Field(() => String) summary: string;
  @Field(() => String) angle: string;
  @Field(() => [String]) tags: string[];
  @Field(() => [DeliveryCreativeReviewRecordDTO])
  reviews: DeliveryCreativeReviewRecordDTO[];
  @Field(() => ID, { nullable: true }) sourceReferenceId?: string | null;
}

@ObjectType('DeliveryCreativeShotVersion')
export class DeliveryCreativeShotVersionDTO {
  @Field(() => String) title: string;
  @Field(() => String) imagePrompt: string;
  @Field(() => String) animationPrompt: string;
  @Field(() => String) subject: string;
  @Field(() => String) product: string;
  @Field(() => String) location: string;
  @Field(() => String) notes: string;
  @Field(() => Float) duration: number;
  @Field(() => ID, { nullable: true }) referenceId?: string | null;
  @Field(() => Int) version: number;
}

@ObjectType('DeliveryCreativeShot')
export class DeliveryCreativeShotDTO extends DeliveryCreativeShotVersionDTO {
  @Field(() => ID) id: string;
  @Field(() => [DeliveryCreativeShotVersionDTO])
  history: DeliveryCreativeShotVersionDTO[];
  @Field(() => ID, { nullable: true }) imageId: string | null;
  @Field(() => ID, { nullable: true }) clipId: string | null;
}

@ObjectType('DeliveryCreativeAsset')
export class DeliveryCreativeAssetDTO {
  @Field(() => ID) id: string;
  @Field(() => String) name: string;
  @Field(() => String) mimeType: string;
  @Field(() => CreativeReadStorageState) storageState:
    | 'PENDING'
    | 'READY'
    | 'FAILED';
  @Field(() => String) createdAt: string;
  @Field(() => String) uploadedBy: string;
  @Field(() => CreativeReadAssetKind) kind:
    | 'REFERENCE'
    | 'IMAGE'
    | 'CLIP'
    | 'BASE'
    | 'HOOK'
    | 'CTA'
    | 'FINAL'
    | 'AUDIO';
  @Field(() => Float) size: number;
  @Field(() => Int) briefVersion: number;
  @Field(() => Int) productionVersion: number;
  @Field(() => Int) assemblyVersion: number;
  @Field(() => ID, { nullable: true }) shotId?: string | null;
  @Field(() => Int, { nullable: true }) shotVersion?: number | null;
  @Field(() => ID, { nullable: true }) parentAssetId?: string | null;
  @Field(() => [DeliveryCreativeReviewRecordDTO])
  reviews: DeliveryCreativeReviewRecordDTO[];
}

@ObjectType('DeliveryCreativeAssembly')
export class DeliveryCreativeAssemblyDTO {
  @Field(() => [ID]) assetIds: string[];
  @Field(() => String) overlayText: string;
  @Field(() => ID, { nullable: true }) audioId?: string | null;
  @Field(() => String) notes: string;
}

@ObjectType('DeliveryCreativeVariant')
export class DeliveryCreativeVariantDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) baseId: string;
  @Field(() => ID) hookId: string;
  @Field(() => ID) ctaId: string;
  @Field(() => Boolean) selected: boolean;
}

@ObjectType('DeliveryCreativeBriefVersion')
export class DeliveryCreativeBriefVersionDTO {
  @Field(() => Int) version: number;
  @Field(() => DeliveryCreativeBriefDTO) brief: DeliveryCreativeBriefDTO;
  @Field(() => Boolean) approved: boolean;
}

@ObjectType('DeliveryCreativeMediaSettings')
export class DeliveryCreativeMediaSettingsDTO {
  @Field(() => Int) version: number;
  @Field(() => Boolean) enabled: boolean;
  @Field(() => [String]) modelIds: string[];
  @Field(() => [CreativeReadMediaRole]) roles: (
    | 'ADMIN'
    | 'MANAGER'
    | 'MEMBER'
  )[];
  @Field(() => Int) dailyRunLimit: number;
  @Field(() => Boolean) allowUnknownCost: boolean;
}

@ObjectType('DeliveryCreativeInspectionFinding')
export class DeliveryCreativeInspectionFindingDTO {
  @Field(() => ID) assetId: string;
  @Field(() => String) evidence: string;
  @Field(() => String) correction: string;
}

@ObjectType('DeliveryCreativeInspection')
export class DeliveryCreativeInspectionDTO {
  @Field(() => String) summary: string;
  @Field(() => [DeliveryCreativeInspectionFindingDTO])
  findings: DeliveryCreativeInspectionFindingDTO[];
  @Field(() => String) limitations: string;
}

@ObjectType('DeliveryCreativeMediaRun')
export class DeliveryCreativeMediaRunDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => String) modelId: string;
  @Field(() => CreativeReadMediaKind) kind:
    | 'IMAGE'
    | 'CLIP'
    | 'ASSEMBLY'
    | 'INSPECTION'
    | 'VIDEO_QA';
  @Field(() => String) shotId: string;
  @Field(() => String) prompt: string;
  @Field(() => String) initiatorId: string;
  @Field(() => String) userWorkspaceId: string;
  @Field(() => CreativeReadRunStatus) status:
    | 'QUEUED'
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED';
  @Field(() => String) createdAt: string;
  @Field(() => String) updatedAt: string;
  @Field(() => Int) shotVersion: number;
  @Field(() => Int) briefVersion: number;
  @Field(() => Int) settingsVersion: number;
  @Field(() => [ID]) referenceAssetIds: string[];
  @Field(() => String, { nullable: true }) error?: string | null;
  @Field(() => String, { nullable: true }) providerJobId?: string | null;
  @Field(() => ID, { nullable: true }) assetId?: string | null;
  @Field(() => Float, { nullable: true }) cost?: number | null;
  @Field(() => DeliveryCreativeInspectionDTO, { nullable: true })
  inspection?: DeliveryCreativeInspectionDTO | null;
}

@ObjectType('DeliveryCreativeDocument')
export class DeliveryCreativeDocumentDTO {
  @Field(() => Int) version: number;
  @Field(() => Int) productionVersion: number;
  @Field(() => Int) assemblyVersion: number;
  @Field(() => Int) briefVersion: number;
  @Field(() => DeliveryCreativeBriefDTO) brief: DeliveryCreativeBriefDTO;
  @Field(() => Int, { nullable: true }) approvedBriefVersion?: number | null;
  @Field(() => [DeliveryCreativeBriefVersionDTO])
  briefHistory: DeliveryCreativeBriefVersionDTO[];
  @Field(() => [DeliveryCreativeReferenceDTO])
  references: DeliveryCreativeReferenceDTO[];
  @Field(() => [DeliveryCreativeShotDTO]) shots: DeliveryCreativeShotDTO[];
  @Field(() => [DeliveryCreativeAssetDTO]) assets: DeliveryCreativeAssetDTO[];
  @Field(() => ID, { nullable: true }) finalAssetId?: string | null;
  @Field(() => DeliveryCreativeAssemblyDTO)
  assembly: DeliveryCreativeAssemblyDTO;
  @Field(() => [DeliveryCreativeVariantDTO])
  variants: DeliveryCreativeVariantDTO[];
  @Field(() => Float) revisionCharge: number;
  @Field(() => DeliveryCreativeMediaSettingsDTO, { nullable: true })
  mediaSettings?: DeliveryCreativeMediaSettingsDTO | null;
  @Field(() => [DeliveryCreativeMediaRunDTO], { nullable: true }) mediaRuns?:
    | DeliveryCreativeMediaRunDTO[]
    | null;
}
