import { msg } from '@lingui/core/macro';

import { type FlatViewFieldGroup } from 'src/engine/metadata-modules/flat-view-field-group/types/flat-view-field-group.type';
import { type AllStandardObjectViewFieldGroupName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-view-field-group-name.type';
import { i18nLabel } from 'src/engine/workspace-manager/twenty-standard-application/utils/i18n-label.util';
import {
  createStandardViewFieldGroupFlatMetadata,
  type CreateStandardViewFieldGroupArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field-group/create-standard-view-field-group-flat-metadata.util';

export const computeStandardQuoteViewFieldGroups = (
  args: Omit<CreateStandardViewFieldGroupArgs<'quote'>, 'context'>,
): Record<string, FlatViewFieldGroup> => {
  const buildGroup = (
    viewFieldGroupName: AllStandardObjectViewFieldGroupName<
      'quote',
      'quoteRecordPageFields'
    >,
    name: ReturnType<typeof i18nLabel>,
    position: number,
  ) =>
    createStandardViewFieldGroupFlatMetadata({
      ...args,
      objectName: 'quote',
      context: {
        viewName: 'quoteRecordPageFields',
        viewFieldGroupName,
        name,
        position,
        isVisible: true,
      },
    });

  return {
    quoteRecordPageFieldsDetails: buildGroup(
      'details',
      i18nLabel(msg({ message: `Details`, context: 'viewFieldGroup.name' })),
      0,
    ),
    quoteRecordPageFieldsPricing: buildGroup(
      'pricing',
      i18nLabel(msg({ message: `Pricing`, context: 'viewFieldGroup.name' })),
      1,
    ),
    quoteRecordPageFieldsRelations: buildGroup(
      'relations',
      i18nLabel(msg({ message: `Relations`, context: 'viewFieldGroup.name' })),
      2,
    ),
    quoteRecordPageFieldsSystem: buildGroup(
      'system',
      i18nLabel(msg({ message: `System`, context: 'viewFieldGroup.name' })),
      3,
    ),
  };
};
