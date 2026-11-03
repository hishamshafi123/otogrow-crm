import { type DeliveryFounderExceptionsQuery } from '~/generated-metadata/graphql';

export type FounderSnapshot =
  DeliveryFounderExceptionsQuery['deliveryFounderExceptions'];
export type FounderException = FounderSnapshot['items'][number];
export type FounderAction = FounderException['nextAction'];
