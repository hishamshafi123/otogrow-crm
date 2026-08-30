import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util';

export const computeStandardLeadScoringRuleViewFields = (
  args: Omit<CreateStandardViewFieldArgs<'leadScoringRule'>, 'context'>,
): Record<string, FlatViewField> => {
  return {
    allLeadScoringRulesName: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'leadScoringRule',
      context: {
        viewName: 'allLeadScoringRules',
        viewFieldName: 'name',
        fieldName: 'name',
        position: 0,
        isVisible: true,
        size: 220,
      },
    }),
    allLeadScoringRulesRuleType: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'leadScoringRule',
      context: {
        viewName: 'allLeadScoringRules',
        viewFieldName: 'ruleType',
        fieldName: 'ruleType',
        position: 1,
        isVisible: true,
        size: 120,
      },
    }),
    allLeadScoringRulesPoints: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'leadScoringRule',
      context: {
        viewName: 'allLeadScoringRules',
        viewFieldName: 'points',
        fieldName: 'points',
        position: 2,
        isVisible: true,
        size: 100,
      },
    }),
    allLeadScoringRulesIsActive: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'leadScoringRule',
      context: {
        viewName: 'allLeadScoringRules',
        viewFieldName: 'isActive',
        fieldName: 'isActive',
        position: 3,
        isVisible: true,
        size: 100,
      },
    }),
    allLeadScoringRulesCreatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'leadScoringRule',
      context: {
        viewName: 'allLeadScoringRules',
        viewFieldName: 'createdAt',
        fieldName: 'createdAt',
        position: 4,
        isVisible: true,
        size: 150,
      },
    }),
  };
};
