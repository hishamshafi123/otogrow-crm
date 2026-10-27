import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import { isUnauthenticatedGraphQLError } from '@/apollo/utils/isUnauthenticatedGraphQLError';

export const isOtogrowAccessDenied = (error: unknown): boolean =>
  (CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (failure) =>
        failure.extensions?.code === 'FORBIDDEN' ||
        isUnauthenticatedGraphQLError(failure),
    )) ||
  (ServerError.is(error) && [401, 403].includes(error.statusCode));
