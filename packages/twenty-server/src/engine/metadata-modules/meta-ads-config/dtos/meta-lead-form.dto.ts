import { Field, ObjectType, Int } from '@nestjs/graphql';

@ObjectType('MetaLeadForm')
export class MetaLeadFormDTO {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  spreadsheetId: string;

  @Field(() => Int)
  sheetId: number;

  @Field()
  isActive: boolean;

  @Field(() => Date, { nullable: true })
  lastSyncedAt: Date | null;

  @Field(() => String, { nullable: true })
  lastError: string | null;
}

@ObjectType('MetaSheetLeadAnswer')
export class MetaSheetLeadAnswerDTO {
  @Field()
  label: string;

  @Field()
  value: string;
}

@ObjectType('MetaSheetLead')
export class MetaSheetLeadDTO {
  @Field()
  isUnread: boolean;

  @Field()
  id: string;

  @Field()
  leadId: string;

  @Field(() => String, { nullable: true })
  personId: string | null;

  @Field()
  name: string;

  @Field()
  email: string;

  @Field()
  phone: string;

  @Field(() => [MetaSheetLeadAnswerDTO])
  answers: MetaSheetLeadAnswerDTO[];

  @Field()
  createdAt: Date;
}

@ObjectType('MetaLeadFormActivity')
export class MetaLeadFormActivityDTO {
  @Field()
  formId: string;

  @Field(() => Int)
  totalCount: number;

  @Field(() => Int)
  unreadCount: number;
}
