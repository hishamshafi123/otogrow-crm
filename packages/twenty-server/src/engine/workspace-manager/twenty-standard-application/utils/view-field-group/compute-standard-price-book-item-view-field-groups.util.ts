import { msg } from '@lingui/core/macro';

import { type FlatViewFieldGroup } from 'src/engine/metadata-modules/flat-view-field-group/types/flat-view-field-group.type';
import { type AllStandardObjectViewFieldGroupName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-view-field-group-name.type';
import { i18nLabel } from 'src/engine/workspace-manager/twenty-standard-application/utils/i18n-label.util';
import {
  createStandardViewFieldGroupFlatMetadata,
  type CreateStandardViewFieldGroupArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field-group/create-standard-view-field-group-flat-metadata.util';

export const computeStandardPriceBookItemViewFieldGroups = (
  args: Omit<CreateStandardViewFieldGroupArgs<'priceBookItem'>, 'context'>,
): Record<string, FlatViewFieldGroup> => {
  const buildGroup = (
    viewFieldGroupName: AllStandardObjectViewFieldGroupName<
      'priceBookItem',
      'priceBookItemRecordPageFields'
    >,
    name: ReturnType<typeof i18nLabel>,
    position: number,
  ) =>
    createStandardViewFieldGroupFlatMetadata({
      ...args,
      objectName: 'priceBookItem',
      context: {
        viewName: 'priceBookItemRecordPageFields',
        viewFieldGroupName,
        name,
        position,
        isVisible: true,
      },
    });

  return {
    priceBookItemRecordPageFieldsGeneral: buildGroup(
      'general',
      i18nLabel(msg({ message: `General`, context: 'viewFieldGroup.name' })),
      0,
    ),
    priceBookItemRecordPageFieldsPricing: buildGroup(
      'pricing',
      i18nLabel(msg({ message: `Pricing`, context: 'viewFieldGroup.name' })),
      1,
    ),
    priceBookItemRecordPageFieldsSystem: buildGroup(
      'system',
      i18nLabel(msg({ message: `System`, context: 'viewFieldGroup.name' })),
      2,
    ),
  };
};
