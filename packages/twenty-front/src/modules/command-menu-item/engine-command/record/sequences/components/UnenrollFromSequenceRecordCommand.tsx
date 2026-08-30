import { HeadlessEngineCommandWrapperEffect } from '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect';
import { useHeadlessCommandContextApi } from '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi';
import { useUnenrollFromSequence } from '@/sequences/hooks/useUnenrollFromSequence';

export const UnenrollFromSequenceRecordCommand = () => {
  const { selectedRecords } = useHeadlessCommandContextApi();
  const { unenrollFromSequence } = useUnenrollFromSequence();

  const handleExecute = async () => {
    await unenrollFromSequence(selectedRecords.map((record) => record.id));
  };

  return <HeadlessEngineCommandWrapperEffect execute={handleExecute} ready />;
};
