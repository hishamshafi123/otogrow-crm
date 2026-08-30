import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { resolveInput } from 'twenty-shared/utils';

import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/interfaces/workflow-action.interface';

import { SequenceEnrollmentService } from 'src/modules/sequences/services/sequence-enrollment.service';
import {
  WorkflowStepExecutorException,
  WorkflowStepExecutorExceptionCode,
} from 'src/modules/workflow/workflow-executor/exceptions/workflow-step-executor.exception';
import { type WorkflowActionInput } from 'src/modules/workflow/workflow-executor/types/workflow-action-input';
import { type WorkflowActionOutput } from 'src/modules/workflow/workflow-executor/types/workflow-action-output.type';
import { findStepOrThrow } from 'src/modules/workflow/workflow-executor/utils/find-step-or-throw.util';
import { isWorkflowSequenceUnenrollAction } from 'src/modules/workflow/workflow-executor/workflow-actions/sequence/guards/is-workflow-sequence-unenroll-action.guard';
import { type WorkflowSequenceActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/sequence/types/workflow-sequence-action-input.type';

@Injectable()
export class SequenceUnenrollWorkflowAction implements WorkflowAction {
  constructor(
    private readonly sequenceEnrollmentService: SequenceEnrollmentService,
  ) {}

  async execute({
    currentStepId,
    steps,
    runInfo,
    context,
  }: WorkflowActionInput): Promise<WorkflowActionOutput> {
    const step = findStepOrThrow({
      stepId: currentStepId,
      steps,
    });

    if (!isWorkflowSequenceUnenrollAction(step)) {
      throw new WorkflowStepExecutorException(
        'Step is not a sequence-unenroll action',
        WorkflowStepExecutorExceptionCode.INVALID_STEP_TYPE,
      );
    }

    const workflowActionInput = resolveInput(
      step.settings.input,
      context,
    ) as WorkflowSequenceActionInput;

    if (
      !isNonEmptyString(workflowActionInput.sequenceId) ||
      !isNonEmptyString(workflowActionInput.personId)
    ) {
      return { error: 'sequenceId and personId are required' };
    }

    try {
      const unenrolledCount =
        await this.sequenceEnrollmentService.unenrollPersonFromSequence({
          workspaceId: runInfo.workspaceId,
          sequenceId: workflowActionInput.sequenceId,
          personId: workflowActionInput.personId,
        });

      return { result: { unenrolledCount } };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}
