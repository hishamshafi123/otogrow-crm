import { Catch, type ExceptionFilter } from '@nestjs/common';

import { assertUnreachable } from 'twenty-shared/utils';

import {
  NotFoundError,
  UserInputError,
} from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import {
  SequenceException,
  SequenceExceptionCode,
} from 'src/modules/sequences/exceptions/sequence.exception';

@Catch(SequenceException)
export class SequenceGraphqlApiExceptionFilter implements ExceptionFilter {
  catch(exception: SequenceException) {
    switch (exception.code) {
      case SequenceExceptionCode.SEQUENCE_NOT_FOUND:
      case SequenceExceptionCode.ENROLLMENT_NOT_FOUND:
        throw new NotFoundError(exception);
      case SequenceExceptionCode.SEQUENCE_NOT_ACTIVE:
      case SequenceExceptionCode.SEQUENCE_HAS_NO_STEPS:
        throw new UserInputError(exception);
      default: {
        assertUnreachable(exception.code);
      }
    }
  }
}
