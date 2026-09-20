import { Injectable } from '@nestjs/common';

import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { SECRET_ENCRYPTION_ENVELOPE_PREFIX } from 'src/engine/core-modules/secret-encryption/constants/secret-encryption.constant';
import {
  SecretEncryptionException,
  SecretEncryptionExceptionCode,
} from 'src/engine/core-modules/secret-encryption/exceptions/secret-encryption.exception';
import { SecretEncryptionService } from 'src/engine/core-modules/secret-encryption/secret-encryption.service';

@Injectable()
export class TelegramConfigEncryptionService {
  constructor(
    private readonly secretEncryptionService: SecretEncryptionService,
  ) {}

  encrypt({
    plaintext,
    workspaceId,
  }: {
    plaintext: PlaintextString;
    workspaceId: string;
  }): EncryptedString {
    if (plaintext.startsWith(SECRET_ENCRYPTION_ENVELOPE_PREFIX)) {
      throw new SecretEncryptionException(
        'TelegramConfigEncryptionService.encrypt received an already-encrypted envelope. This indicates a double-encryption bug — the caller is encrypting ciphertext.',
        SecretEncryptionExceptionCode.ALREADY_ENCRYPTED,
      );
    }

    return this.secretEncryptionService.encryptVersioned(plaintext, {
      workspaceId,
    });
  }

  decrypt({
    ciphertext,
    workspaceId,
  }: {
    ciphertext: EncryptedString;
    workspaceId: string;
  }): PlaintextString {
    if (!ciphertext.startsWith(SECRET_ENCRYPTION_ENVELOPE_PREFIX)) {
      throw new SecretEncryptionException(
        'Received a plaintext value where ciphertext was expected. The encryption backfill migration may not have run.',
        SecretEncryptionExceptionCode.MALFORMED_ENVELOPE,
      );
    }

    return this.secretEncryptionService.decryptVersionedOrThrow(ciphertext, {
      workspaceId,
    });
  }
}
