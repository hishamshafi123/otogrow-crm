import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util';

export const computeStandardSequenceViewFields = (
  args: Omit<CreateStandardViewFieldArgs<'sequence'>, 'context'>,
): Record<string, FlatViewField> => {
  return {
    allSequencesName: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'sequence',
      context: {
        viewName: 'allSequences',
        viewFieldName: 'name',
        fieldName: 'name',
        position: 0,
        isVisible: true,
        size: 250,
      },
    }),
    allSequencesStatus: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'sequence',
      context: {
        viewName: 'allSequences',
        viewFieldName: 'status',
        fieldName: 'status',
        position: 1,
        isVisible: true,
        size: 120,
      },
    }),
    allSequencesOwner: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'sequence',
      context: {
        viewName: 'allSequences',
        viewFieldName: 'owner',
        fieldName: 'owner',
        position: 2,
        isVisible: true,
        size: 150,
      },
    }),
    allSequencesDailySendCap: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'sequence',
      context: {
        viewName: 'allSequences',
        viewFieldName: 'dailySendCap',
        fieldName: 'dailySendCap',
        position: 3,
        isVisible: true,
        size: 130,
      },
    }),
    allSequencesCreatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'sequence',
      context: {
        viewName: 'allSequences',
        viewFieldName: 'createdAt',
        fieldName: 'createdAt',
        position: 4,
        isVisible: true,
        size: 150,
      },
    }),
  };
};
