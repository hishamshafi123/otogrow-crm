import {
  type DeliveryAppliedWorkflowFieldsFragment,
  type DeliveryTaskWorkflowFieldsFragment,
  type DeliveryWorkflowCatalogFieldsFragment,
  type DeliveryWorkflowDefinitionInput,
} from '~/generated-metadata/graphql';

export type WorkflowDefinition = DeliveryWorkflowDefinitionInput;
export type AppliedWorkflow = DeliveryAppliedWorkflowFieldsFragment;
export type WorkflowCatalog = DeliveryWorkflowCatalogFieldsFragment;
export type TaskWorkflow = DeliveryTaskWorkflowFieldsFragment;
export type WorkflowTemplate = WorkflowCatalog['templates'][number];

// Strip GraphQL metadata before sending a published snapshot back as input.
export const workflowDefinitionInput = (
  definition: WorkflowDefinition,
): WorkflowDefinition => ({
  name: definition.name,
  description: definition.description,
  service: definition.service,
  definitionOfDone: definition.definitionOfDone,
  checklist: definition.checklist.map(({ id, label, required }) => ({
    id,
    label,
    required,
  })),
  evidence: definition.evidence.map(
    ({ id, label, instructions, kind, required }) => ({
      id,
      label,
      instructions,
      kind,
      required,
    }),
  ),
  reviewChecks: definition.reviewChecks.map(({ id, label, required }) => ({
    id,
    label,
    required,
  })),
});
export const emptyWorkflow = (): WorkflowDefinition => ({
  name: '',
  description: '',
  service: 'CUSTOM',
  definitionOfDone: '',
  checklist: [],
  evidence: [],
  reviewChecks: [],
});
