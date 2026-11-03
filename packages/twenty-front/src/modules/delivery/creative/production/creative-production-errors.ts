import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';

export const isCreativeSourceUnavailable = (error: unknown) =>
  isOtogrowAccessDenied(error) ||
  (CombinedGraphQLErrors.is(error) &&
    error.errors.some((item) => item.extensions?.code === 'NOT_FOUND'));
