import { BadRequestException } from '@nestjs/common';
import {
  type DeliveryAppliedWorkflow,
  type DeliveryWorkflowAnswer,
} from 'src/modules/delivery/workflows/delivery-workflows.types';

const validLink = (value: string) => {
  try {
    const url = new URL(value);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};
export const assertWorkflowAnswers = (
  workflow: DeliveryAppliedWorkflow,
  checkedIds: string[],
  answers: DeliveryWorkflowAnswer[],
) => {
  if (
    new Set(checkedIds).size !== checkedIds.length ||
    checkedIds.some(
      (id) => !workflow.definition.checklist.some((item) => item.id === id),
    )
  )
    throw new BadRequestException(
      'Choose only this workflow’s checklist items, once each.',
    );
  if (
    new Set(answers.map((item) => item.requirementId)).size !== answers.length
  )
    throw new BadRequestException(
      'Each evidence requirement needs a single response.',
    );
  for (const answer of answers) {
    const requirement = workflow.definition.evidence.find(
      (item) => item.id === answer.requirementId,
    );
    if (!requirement)
      throw new BadRequestException(
        'An evidence requirement changed. Refresh the task.',
      );
    if (answer.value && requirement.kind === 'LINK' && !validLink(answer.value))
      throw new BadRequestException(
        `Use an HTTP or HTTPS link without embedded credentials for ${requirement.label}.`,
      );
  }
};
export const missingWorkflowRequirements = (
  workflow: DeliveryAppliedWorkflow | null | undefined,
): string[] => {
  if (!workflow) return [];
  return [
    ...workflow.definition.checklist
      .filter((item) => item.required && !workflow.checkedIds.includes(item.id))
      .map((item) => `Complete: ${item.label}`),
    ...workflow.definition.evidence
      .filter(
        (item) =>
          item.required &&
          !workflow.evidence.some(
            (answer) => answer.requirementId === item.id && answer.value.trim(),
          ),
      )
      .map((item) => `Add evidence: ${item.label}`),
  ];
};
export const assertWorkflowSubmission = (
  workflow: DeliveryAppliedWorkflow | undefined,
) => {
  if (!workflow) return;
  assertWorkflowAnswers(workflow, workflow.checkedIds, workflow.evidence);
  const missing = missingWorkflowRequirements(workflow);
  if (missing.length) throw new BadRequestException(missing.join(' · '));
};
export const assertWorkflowReview = (
  workflow: DeliveryAppliedWorkflow | undefined,
  checkedIds: string[] | undefined,
  requireComplete = true,
) => {
  if (!workflow) return;
  if (requireComplete) assertWorkflowSubmission(workflow);
  const checks = checkedIds ?? [];
  if (
    new Set(checks).size !== checks.length ||
    checks.some(
      (id) => !workflow.definition.reviewChecks.some((item) => item.id === id),
    )
  )
    throw new BadRequestException(
      'Review only the checks from this submitted workflow version.',
    );
  const missing = workflow.definition.reviewChecks.filter(
    (item) => item.required && !checks.includes(item.id),
  );
  if (requireComplete && missing.length)
    throw new BadRequestException(
      `Confirm the quality review: ${missing.map((item) => item.label).join(' · ')}`,
    );
};
