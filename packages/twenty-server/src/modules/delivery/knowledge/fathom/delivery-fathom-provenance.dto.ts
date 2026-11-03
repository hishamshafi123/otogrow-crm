import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('DeliveryFathomProvenance')
export class DeliveryFathomProvenanceDTO {
  @Field() provider: string;
  @Field() recordingId: string;
  @Field(() => String, { nullable: true }) title: string | null;
  @Field(() => String, { nullable: true }) recordedAt: string | null;
  @Field(() => String, { nullable: true }) sourceUrl: string | null;
  @Field() importedAt: string;
  @Field(() => ID) importedBy: string;
  @Field() proofHash: string;
  @Field(() => Int) segmentCount: number;
  @Field() humanEdited: boolean;
}
