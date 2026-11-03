import { Field, ID, InputType, Int, ObjectType, Float } from '@nestjs/graphql';

@ObjectType('DeliveryAtlasParameter')
export class DeliveryAtlasParameterDTO {
  @Field() name: string;
  @Field() label: string;
  @Field() type: string;
  @Field() required: boolean;
  @Field(() => [String]) choices: string[];
  @Field(() => Float, { nullable: true }) minimum: number | null;
  @Field(() => Float, { nullable: true }) maximum: number | null;
  @Field(() => String, { nullable: true }) defaultValue: string | null;
}
@ObjectType('DeliveryAtlasProfile')
export class DeliveryAtlasProfileDTO {
  @Field() id: string;
  @Field() familyId: string;
  @Field() label: string;
  @Field() kind: string;
  @Field() operation: string;
  @Field() schemaRevision: string;
  @Field() enabled: boolean;
  @Field() available: boolean;
  @Field(() => [String]) blockedReasons: string[];
  @Field(() => Int) minimumReferences: number;
  @Field(() => Int) maximumReferences: number;
  @Field(() => [DeliveryAtlasParameterDTO])
  parameters: DeliveryAtlasParameterDTO[];
}
@ObjectType('DeliveryAtlasFamily')
export class DeliveryAtlasFamilyDTO {
  @Field() id: string;
  @Field() label: string;
  @Field(() => String, { nullable: true }) textToImageProfileId: string | null;
  @Field(() => String, { nullable: true }) imageEditProfileId: string | null;
}
@ObjectType('DeliveryAtlasReservationLimit')
export class DeliveryAtlasReservationLimitDTO {
  @Field() profileId: string;
  @Field() maximumCostUsd: string;
  @Field() source: string;
  @Field() verifiedAt: string;
}
@InputType('DeliveryAtlasReservationLimitInput')
export class DeliveryAtlasReservationLimitInput {
  @Field() profileId: string;
  @Field() maximumCostUsd: string;
  @Field() source: string;
  @Field() verifiedAt: string;
}
@InputType('DeliveryAtlasSettingsInput')
export class DeliveryAtlasSettingsInput {
  @Field(() => Int) revision: number;
  @Field(() => String, { nullable: true }) apiKey?: string | null;
  @Field() enabled: boolean;
  @Field(() => [String]) enabledProfileIds: string[];
  @Field(() => String, { nullable: true }) defaultImageFamilyId: string | null;
  @Field(() => String, { nullable: true }) defaultClipProfileId: string | null;
  @Field(() => [DeliveryAtlasReservationLimitInput])
  reservationLimits: DeliveryAtlasReservationLimitInput[];
}
@InputType('DeliveryAtlasRevisionInput')
export class DeliveryAtlasRevisionInput {
  @Field(() => Int) revision: number;
}
@ObjectType('DeliveryAtlasSettings')
export class DeliveryAtlasSettingsDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => Int) revision: number;
  @Field() enabled: boolean;
  @Field() keyConfigured: boolean;
  @Field() verificationStatus: string;
  @Field(() => String, { nullable: true }) verifiedAt: string | null;
  @Field(() => String, { nullable: true }) defaultImageFamilyId: string | null;
  @Field(() => String, { nullable: true }) defaultClipProfileId: string | null;
  @Field(() => [String]) enabledProfileIds: string[];
  @Field(() => [DeliveryAtlasReservationLimitDTO])
  reservationLimits: DeliveryAtlasReservationLimitDTO[];
  @Field(() => [DeliveryAtlasFamilyDTO]) families: DeliveryAtlasFamilyDTO[];
  @Field(() => [DeliveryAtlasProfileDTO]) profiles: DeliveryAtlasProfileDTO[];
}
@InputType('DeliveryAtlasProductionInput')
export class DeliveryAtlasProductionInput {
  @Field(() => ID) taskId: string;
}
@InputType('DeliveryAtlasProductionAccessInput')
export class DeliveryAtlasProductionAccessInput {
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field() enabled: boolean;
  @Field(() => [String]) roles: string[];
  @Field(() => [String]) profileIds: string[];
  @Field(() => Int) dailyRunLimit: number;
}
@ObjectType('DeliveryAtlasAssetOption')
export class DeliveryAtlasAssetOptionDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() mimeType: string;
  @Field(() => Int) size: number;
}
@ObjectType('DeliveryAtlasShotOption')
export class DeliveryAtlasShotOptionDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) version: number;
  @Field() title: string;
  @Field() imagePrompt: string;
  @Field() animationPrompt: string;
  @Field(() => ID, { nullable: true }) imageId: string | null;
}
@ObjectType('DeliveryAtlasProduction')
export class DeliveryAtlasProductionDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => Int) briefVersion: number;
  @Field(() => Int) settingsVersion: number;
  @Field(() => Int) configurationRevision: number;
  @Field() outputKind: string;
  @Field() briefApproved: boolean;
  @Field() canManageAccess: boolean;
  @Field() enabled: boolean;
  @Field(() => [String]) roles: string[];
  @Field(() => [String]) allowedProfileIds: string[];
  @Field(() => Int) dailyRunLimit: number;
  @Field(() => String, { nullable: true }) defaultImageFamilyId: string | null;
  @Field(() => String, { nullable: true }) defaultClipProfileId: string | null;
  @Field(() => [DeliveryAtlasProfileDTO]) profiles: DeliveryAtlasProfileDTO[];
  @Field(() => [DeliveryAtlasFamilyDTO]) families: DeliveryAtlasFamilyDTO[];
  @Field(() => [DeliveryAtlasAssetOptionDTO])
  assets: DeliveryAtlasAssetOptionDTO[];
  @Field(() => [DeliveryAtlasShotOptionDTO])
  shots: DeliveryAtlasShotOptionDTO[];
  @Field(() => [String]) blockedReasons: string[];
}
@InputType('DeliveryAtlasParametersInput')
export class DeliveryAtlasParametersInput {
  @Field(() => String, { nullable: true }) resolution?: string | null;
  @Field(() => String, { nullable: true }) size?: string | null;
  @Field(() => String, { nullable: true }) aspectRatio?: string | null;
  @Field(() => Int, { nullable: true }) duration?: number | null;
  @Field(() => Boolean, { nullable: true }) generateAudio?: boolean | null;
  @Field(() => String, { nullable: true }) quality?: string | null;
  @Field(() => Int, { nullable: true }) seed?: number | null;
}
@ObjectType('DeliveryAtlasParameters')
export class DeliveryAtlasParametersDTO {
  @Field(() => String, { nullable: true }) resolution: string | null;
  @Field(() => String, { nullable: true }) size: string | null;
  @Field(() => String, { nullable: true }) aspectRatio: string | null;
  @Field(() => Int, { nullable: true }) duration: number | null;
  @Field(() => Boolean, { nullable: true }) generateAudio: boolean | null;
  @Field(() => String, { nullable: true }) quality: string | null;
  @Field(() => Int, { nullable: true }) seed: number | null;
}
@InputType('DeliveryAtlasQuoteInput')
export class DeliveryAtlasQuoteInput {
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => ID) requestId: string;
  @Field() profileId: string;
  @Field() target: string;
  @Field(() => ID, { nullable: true }) shotId: string | null;
  @Field() prompt: string;
  @Field(() => [ID]) referenceAssetIds: string[];
  @Field(() => DeliveryAtlasParametersInput)
  parameters: DeliveryAtlasParametersInput;
}
@InputType('DeliveryAtlasStartInput')
export class DeliveryAtlasStartInput {
  @Field(() => ID) taskId: string;
  @Field(() => ID) runId: string;
  @Field(() => ID) requestId: string;
  @Field() quoteToken: string;
}
@InputType('DeliveryAtlasRunInput')
export class DeliveryAtlasRunInput {
  @Field(() => ID) taskId: string;
  @Field(() => ID) runId: string;
}
@InputType('DeliveryAtlasRunsInput')
export class DeliveryAtlasRunsInput {
  @Field(() => ID) taskId: string;
  @Field(() => ID, { nullable: true }) beforeId?: string | null;
}
@ObjectType('DeliveryAtlasRun')
export class DeliveryAtlasRunDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field() profileId: string;
  @Field() familyId: string;
  @Field() modelLabel: string;
  @Field() kind: string;
  @Field() operation: string;
  @Field() schemaRevision: string;
  @Field(() => Int) configurationRevision: number;
  @Field(() => Int) taskRevision: number;
  @Field(() => Int) briefVersion: number;
  @Field(() => Int) settingsVersion: number;
  @Field(() => Int, { nullable: true }) shotVersion: number | null;
  @Field() prompt: string;
  @Field(() => [ID]) referenceAssetIds: string[];
  @Field(() => DeliveryAtlasParametersDTO)
  parameters: DeliveryAtlasParametersDTO;
  @Field() target: string;
  @Field(() => ID, { nullable: true }) shotId: string | null;
  @Field() status: string;
  @Field() publicationCancelled: boolean;
  @Field(() => String, { nullable: true }) providerPredictionId: string | null;
  @Field(() => String, { nullable: true }) providerStatus: string | null;
  @Field(() => ID, { nullable: true }) assetId: string | null;
  @Field() maximumCostUsd: string;
  @Field() quotedCostUsd: string;
  @Field(() => String, { nullable: true }) actualCostUsd: string | null;
  @Field() costState: string;
  @Field(() => String, { nullable: true }) error: string | null;
  @Field() createdAt: string;
  @Field() updatedAt: string;
  @Field() canResume: boolean;
  @Field() canCancel: boolean;
}
@ObjectType('DeliveryAtlasQuote')
export class DeliveryAtlasQuoteDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field(() => ID) runId: string;
  @Field(() => ID) requestId: string;
  @Field() profileId: string;
  @Field() quoteToken: string;
  @Field() quotedCostUsd: string;
  @Field() maximumCostUsd: string;
  @Field() expiresAt: string;
  @Field() budgetReady: boolean;
  @Field(() => String, { nullable: true }) blockedReason: string | null;
}
@ObjectType('DeliveryAtlasRuns')
export class DeliveryAtlasRunsDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field(() => [DeliveryAtlasRunDTO]) items: DeliveryAtlasRunDTO[];
  @Field(() => ID, { nullable: true }) nextBeforeId: string | null;
}
