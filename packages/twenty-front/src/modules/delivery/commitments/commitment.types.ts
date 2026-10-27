import {
  type DeliveryCommitmentFieldsFragment,
  type DeliveryCommitmentLineSaveInput,
  type DeliveryCommitmentPeriodSaveInput,
  type DeliveryCommitmentPeriodStateInput,
  type DeliveryCommitmentTaskAssignInput,
  type DeliveryCommitmentTaskRemoveInput,
} from '~/generated-metadata/graphql';

export type CommitmentSnapshot = DeliveryCommitmentFieldsFragment;
export type CommitmentEditorSelection =
  | { kind: 'period'; id: string }
  | { kind: 'line'; id: string }
  | { kind: 'assign' }
  | { kind: 'remove'; taskId: string }
  | { kind: 'state'; state: 'OPEN' | 'CLOSED' };
export type CommitmentCommand =
  | { kind: 'period'; input: DeliveryCommitmentPeriodSaveInput }
  | { kind: 'line'; input: DeliveryCommitmentLineSaveInput }
  | { kind: 'assign'; input: DeliveryCommitmentTaskAssignInput }
  | { kind: 'remove'; input: DeliveryCommitmentTaskRemoveInput }
  | { kind: 'state'; input: DeliveryCommitmentPeriodStateInput };
