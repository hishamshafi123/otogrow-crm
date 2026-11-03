import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { DeliveryFinanceProjectDTO } from 'src/modules/delivery/finance/delivery-finance.dto';

@ObjectType('DeliveryFinanceExportColumn')
export class DeliveryFinanceExportColumnDTO {
  @Field() header: string;
  @Field() field: string;
  @Field(() => String, { nullable: true }) constant: string | null;
}
@InputType('DeliveryFinanceExportColumnInput')
export class DeliveryFinanceExportColumnInput {
  @Field() header: string;
  @Field() field: string;
  @Field(() => String, { nullable: true }) constant?: string | null;
}
@ObjectType('DeliveryFinanceExportMapping')
export class DeliveryFinanceExportMappingDTO {
  @Field() target: string;
  @Field() scope: string;
  @Field(() => String, { nullable: true }) key: string | null;
  @Field() value: string;
}
@InputType('DeliveryFinanceExportMappingInput')
export class DeliveryFinanceExportMappingInput {
  @Field() target: string;
  @Field() scope: string;
  @Field(() => String, { nullable: true }) key?: string | null;
  @Field() value: string;
}
@ObjectType('DeliveryFinanceExportProfile')
export class DeliveryFinanceExportProfileDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() name: string;
  @Field() basis: string;
  @Field() active: boolean;
  @Field(() => [DeliveryFinanceExportColumnDTO])
  columns: DeliveryFinanceExportColumnDTO[];
  @Field(() => [DeliveryFinanceExportMappingDTO])
  mappings: DeliveryFinanceExportMappingDTO[];
  @Field() delimiter: string;
  @Field(() => Int) precision: number;
  @Field() dateFormat: string;
  @Field() includeBom: boolean;
  @Field() changedAt: string;
  @Field() changedByName: string;
}
@ObjectType('DeliveryFinanceExportRow')
export class DeliveryFinanceExportRowDTO {
  @Field() key: string;
  @Field() identityKey: string;
  @Field(() => ID) sourceId: string;
  @Field(() => Int) sourceRevision: number;
  @Field() sourceType: string;
  @Field() sourceReference: string;
  @Field() sourceStatus: string;
  @Field() date: string;
  @Field(() => String, { nullable: true }) serviceMonth: string | null;
  @Field() kind: string;
  @Field() category: string;
  @Field() title: string;
  @Field() currency: string;
  @Field() amountMicros: string;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field(() => String, { nullable: true }) evidenceUrl: string | null;
  @Field(() => String, { nullable: true }) account: string | null;
  @Field(() => String, { nullable: true }) paymentAccount: string | null;
  @Field(() => String, { nullable: true }) counterparty: string | null;
  @Field(() => [String]) cells: string[];
  @Field(() => [String]) errors: string[];
  @Field(() => [String]) warnings: string[];
  @Field(() => Int) previousBatchCount: number;
  @Field(() => ID, { nullable: true }) latestBatchId: string | null;
  @Field() currentStatus: string;
  @Field() sourceChanged: boolean;
}
@ObjectType('DeliveryFinanceExportExclusion')
export class DeliveryFinanceExportExclusionDTO {
  @Field() key: string;
  @Field(() => ID, { nullable: true }) sourceId: string | null;
  @Field(() => String, { nullable: true }) title: string | null;
  @Field() sourceType: string;
  @Field(() => String, { nullable: true }) sourceStatus: string | null;
  @Field() code: string;
  @Field(() => String, { nullable: true }) amountMicros: string | null;
  @Field() blocking: boolean;
  @Field(() => Int) previousBatchCount: number;
}
@ObjectType('DeliveryFinanceExportTotals')
export class DeliveryFinanceExportTotalsDTO {
  @Field() incomingMicros: string;
  @Field() outgoingMicros: string;
  @Field() netMicros: string;
  @Field(() => Int) sourceCount: number;
  @Field(() => Int) rowCount: number;
  @Field(() => Int) exclusionCount: number;
  @Field(() => Int) errorCount: number;
  @Field(() => Int) repeatedSourceCount: number;
}
@ObjectType('DeliveryFinanceExportBatch')
export class DeliveryFinanceExportBatchDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) profileId: string;
  @Field(() => Int) profileRevision: number;
  @Field() profileName: string;
  @Field() basis: string;
  @Field() currency: string;
  @Field(() => String, { nullable: true }) dateFrom: string | null;
  @Field(() => String, { nullable: true }) dateTo: string | null;
  @Field(() => String, { nullable: true }) serviceMonth: string | null;
  @Field(() => String, { nullable: true }) accountingDate: string | null;
  @Field() checksum: string;
  @Field(() => Int) byteLength: number;
  @Field(() => DeliveryFinanceExportTotalsDTO)
  totals: DeliveryFinanceExportTotalsDTO;
  @Field(() => Int) revision: number;
  @Field() importStatus: string;
  @Field(() => String, { nullable: true }) importReference: string | null;
  @Field(() => String, { nullable: true }) importEvidenceUrl: string | null;
  @Field(() => String, { nullable: true }) importChangedAt: string | null;
  @Field(() => String, { nullable: true }) importChangedByName: string | null;
  @Field() createdAt: string;
  @Field() createdByName: string;
  @Field(() => String, { nullable: true }) reexportReason: string | null;
}
@ObjectType('DeliveryFinanceExportBatchDetail')
export class DeliveryFinanceExportBatchDetailDTO {
  @Field(() => DeliveryFinanceExportBatchDTO)
  batch: DeliveryFinanceExportBatchDTO;
  @Field(() => DeliveryFinanceExportProfileDTO)
  profile: DeliveryFinanceExportProfileDTO;
  @Field(() => [DeliveryFinanceExportRowDTO])
  rows: DeliveryFinanceExportRowDTO[];
  @Field(() => String, { nullable: true }) nextRowKey: string | null;
  @Field(() => [DeliveryFinanceExportExclusionDTO])
  exclusions: DeliveryFinanceExportExclusionDTO[];
  @Field(() => [String]) currentWarnings: string[];
}
@ObjectType('DeliveryFinanceExports')
export class DeliveryFinanceExportsDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() canManage: boolean;
  @Field(() => [DeliveryFinanceExportProfileDTO])
  profiles: DeliveryFinanceExportProfileDTO[];
  @Field(() => ID, { nullable: true }) nextProfileId: string | null;
  @Field(() => DeliveryFinanceExportProfileDTO, { nullable: true })
  selectedProfile: DeliveryFinanceExportProfileDTO | null;
  @Field(() => [DeliveryFinanceExportBatchDTO])
  batches: DeliveryFinanceExportBatchDTO[];
  @Field(() => ID, { nullable: true }) nextBatchId: string | null;
  @Field(() => DeliveryFinanceExportBatchDetailDTO, { nullable: true })
  selectedBatch: DeliveryFinanceExportBatchDetailDTO | null;
  @Field(() => [DeliveryFinanceProjectDTO])
  projects: DeliveryFinanceProjectDTO[];
  @Field(() => [String]) allowedFields: string[];
  @Field(() => [String]) mappingScopes: string[];
  @Field(() => [String]) limitations: string[];
}
@ObjectType('DeliveryFinanceExportPreview')
export class DeliveryFinanceExportPreviewDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() canManage: boolean;
  @Field(() => DeliveryFinanceExportProfileDTO)
  profile: DeliveryFinanceExportProfileDTO;
  @Field() basis: string;
  @Field() currency: string;
  @Field() businessDate: string;
  @Field() timezone: string;
  @Field() clockConfirmed: boolean;
  @Field() previewToken: string;
  @Field() canCreate: boolean;
  @Field(() => DeliveryFinanceExportTotalsDTO)
  totals: DeliveryFinanceExportTotalsDTO;
  @Field(() => [DeliveryFinanceExportRowDTO])
  rows: DeliveryFinanceExportRowDTO[];
  @Field(() => String, { nullable: true }) nextRowKey: string | null;
  @Field(() => [DeliveryFinanceExportExclusionDTO])
  exclusions: DeliveryFinanceExportExclusionDTO[];
  @Field(() => String, { nullable: true }) nextExclusionKey: string | null;
  @Field(() => [String]) errors: string[];
  @Field(() => [String]) warnings: string[];
  @Field(() => [String]) limitations: string[];
}
@ObjectType('DeliveryFinanceExportDownload')
export class DeliveryFinanceExportDownloadDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) batchId: string;
  @Field() fileName: string;
  @Field() mimeType: string;
  @Field() encoding: string;
  @Field() csv: string;
  @Field() checksum: string;
  @Field(() => Int) byteLength: number;
}
@ObjectType('DeliveryFinanceExportProfileResult')
export class DeliveryFinanceExportProfileResultDTO {
  @Field(() => DeliveryFinanceExportProfileDTO)
  profile: DeliveryFinanceExportProfileDTO;
  @Field() replayed: boolean;
}
@ObjectType('DeliveryFinanceExportBatchResult')
export class DeliveryFinanceExportBatchResultDTO {
  @Field(() => DeliveryFinanceExportBatchDTO)
  batch: DeliveryFinanceExportBatchDTO;
  @Field() replayed: boolean;
}
@ObjectType('DeliveryFinanceExportEvent')
export class DeliveryFinanceExportEventDTO {
  @Field(() => ID) id: string;
  @Field() sourceType: string;
  @Field(() => ID) sourceId: string;
  @Field() action: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) actorId: string;
  @Field() actorName: string;
  @Field() createdAt: string;
  @Field() reason: string;
  @Field(() => String, { nullable: true }) importStatus: string | null;
  @Field(() => String, { nullable: true }) reference: string | null;
  @Field(() => String, { nullable: true }) evidenceUrl: string | null;
  @Field(() => String, { nullable: true }) checksum: string | null;
  @Field(() => DeliveryFinanceExportProfileDTO, { nullable: true })
  profile: DeliveryFinanceExportProfileDTO | null;
}
@ObjectType('DeliveryFinanceExportHistory')
export class DeliveryFinanceExportHistoryDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => [DeliveryFinanceExportEventDTO])
  events: DeliveryFinanceExportEventDTO[];
  @Field(() => ID, { nullable: true }) nextBeforeId: string | null;
}
@InputType('DeliveryFinanceExportsInput')
export class DeliveryFinanceExportsInput {
  @Field(() => ID, { nullable: true }) afterProfileId?: string | null;
  @Field(() => ID, { nullable: true }) afterBatchId?: string | null;
  @Field(() => ID, { nullable: true }) selectedProfileId?: string | null;
  @Field(() => ID, { nullable: true }) selectedBatchId?: string | null;
  @Field(() => String, { nullable: true }) afterBatchRowKey?: string | null;
}
@InputType('DeliveryFinanceExportProfileInput')
export class DeliveryFinanceExportProfileInput {
  @Field(() => ID) commandId: string;
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() name: string;
  @Field() basis: string;
  @Field() active: boolean;
  @Field(() => [DeliveryFinanceExportColumnInput])
  columns: DeliveryFinanceExportColumnInput[];
  @Field(() => [DeliveryFinanceExportMappingInput])
  mappings: DeliveryFinanceExportMappingInput[];
  @Field() delimiter: string;
  @Field(() => Int) precision: number;
  @Field() dateFormat: string;
  @Field() includeBom: boolean;
  @Field() reason: string;
}
@InputType('DeliveryFinanceExportPreviewInput')
export class DeliveryFinanceExportPreviewInput {
  @Field(() => ID) profileId: string;
  @Field() currency: string;
  @Field(() => String, { nullable: true }) dateFrom?: string | null;
  @Field(() => String, { nullable: true }) dateTo?: string | null;
  @Field(() => String, { nullable: true }) serviceMonth?: string | null;
  @Field(() => String, { nullable: true }) accountingDate?: string | null;
  @Field(() => String, { nullable: true }) afterRowKey?: string | null;
  @Field(() => String, { nullable: true }) afterExclusionKey?: string | null;
}
@InputType('DeliveryFinanceExportBatchInput')
export class DeliveryFinanceExportBatchInput {
  @Field(() => ID) id: string;
  @Field(() => ID) profileId: string;
  @Field() currency: string;
  @Field(() => String, { nullable: true }) dateFrom?: string | null;
  @Field(() => String, { nullable: true }) dateTo?: string | null;
  @Field(() => String, { nullable: true }) serviceMonth?: string | null;
  @Field(() => String, { nullable: true }) accountingDate?: string | null;
  @Field() expectedPreviewToken: string;
  @Field() acknowledgeRepeatedSources: boolean;
  @Field(() => String, { nullable: true }) reexportReason?: string | null;
}
@InputType('DeliveryFinanceExportImportStatusInput')
export class DeliveryFinanceExportImportStatusInput {
  @Field(() => ID) commandId: string;
  @Field(() => ID) batchId: string;
  @Field(() => Int) revision: number;
  @Field() status: string;
  @Field(() => String, { nullable: true }) reference?: string | null;
  @Field(() => String, { nullable: true }) evidenceUrl?: string | null;
  @Field() reason: string;
}
@InputType('DeliveryFinanceExportDownloadInput')
export class DeliveryFinanceExportDownloadInput {
  @Field(() => ID) batchId: string;
}
@InputType('DeliveryFinanceExportHistoryInput')
export class DeliveryFinanceExportHistoryInput {
  @Field() sourceType: string;
  @Field(() => ID) sourceId: string;
  @Field(() => ID, { nullable: true }) beforeId?: string | null;
}
