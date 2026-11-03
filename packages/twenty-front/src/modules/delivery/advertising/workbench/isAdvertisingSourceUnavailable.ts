import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';

export const isAdvertisingSourceUnavailable = (error: unknown) =>
  isOtogrowAccessDenied(error) ||
  (CombinedGraphQLErrors.is(error) &&
    error.errors.some((failure) => failure.extensions?.code === 'NOT_FOUND')) ||
  (ServerError.is(error) && error.statusCode === 404);
