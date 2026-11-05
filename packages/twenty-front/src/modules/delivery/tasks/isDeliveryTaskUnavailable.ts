import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';

export const isDeliveryTaskUnavailable = (error: unknown) =>
  isOtogrowAccessDenied(error) ||
  (CombinedGraphQLErrors.is(error) &&
    error.errors.some((failure) => failure.extensions?.code === 'NOT_FOUND'));
