import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { assertUnreachable } from 'twenty-shared/utils';

import { CustomException } from 'src/utils/custom-exception';

export enum SequenceExceptionCode {
  SEQUENCE_NOT_FOUND = 'SEQUENCE_NOT_FOUND',
  SEQUENCE_NOT_ACTIVE = 'SEQUENCE_NOT_ACTIVE',
  SEQUENCE_HAS_NO_STEPS = 'SEQUENCE_HAS_NO_STEPS',
  ENROLLMENT_NOT_FOUND = 'ENROLLMENT_NOT_FOUND',
}

const getSequenceExceptionUserFriendlyMessage = (
  code: SequenceExceptionCode,
) => {
  switch (code) {
    case SequenceExceptionCode.SEQUENCE_NOT_FOUND:
      return msg`This sequence no longer exists.`;
    case SequenceExceptionCode.SEQUENCE_NOT_ACTIVE:
      return msg`This sequence is not active.`;
    case SequenceExceptionCode.SEQUENCE_HAS_NO_STEPS:
      return msg`This sequence has no steps to send.`;
    case SequenceExceptionCode.ENROLLMENT_NOT_FOUND:
      return msg`This sequence enrollment no longer exists.`;
    default:
      assertUnreachable(code);
  }
};

export class SequenceException extends CustomException<SequenceExceptionCode> {
  constructor(
    message: string,
    code: SequenceExceptionCode,
    { userFriendlyMessage }: { userFriendlyMessage?: MessageDescriptor } = {},
  ) {
    super(message, code, {
      userFriendlyMessage:
        userFriendlyMessage ?? getSequenceExceptionUserFriendlyMessage(code),
    });
  }
}
