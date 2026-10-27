import { Trans } from '@lingui/react/macro';
import {
  type WorkflowDefinition,
  type AppliedWorkflow,
} from '@/delivery/workflows/workflow.types';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

export const WorkflowDefinitionView = ({
  definition,
  workflow,
  reviewedIds,
}: {
  definition: WorkflowDefinition;
  workflow?: AppliedWorkflow;
  reviewedIds?: string[];
}) => (
  <StyledDeliveryStack>
    <p style={{ whiteSpace: 'pre-wrap' }}>{definition.definitionOfDone}</p>
    {definition.description && <p>{definition.description}</p>}
    {definition.checklist.length > 0 && (
      <details>
        <summary>
          <Trans>Work checklist</Trans> ({definition.checklist.length})
        </summary>
        <ul>
          {definition.checklist.map((item) => (
            <li key={item.id}>
              {item.label}
              {item.required && (
                <>
                  {' '}
                  · <Trans>Required</Trans>
                </>
              )}
              {workflow?.checkedIds.includes(item.id) && (
                <>
                  {' '}
                  · <Trans>Completed</Trans>
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
    )}
    {definition.evidence.length > 0 && (
      <details>
        <summary>
          <Trans>Internal evidence</Trans> ({definition.evidence.length})
        </summary>
        <ul>
          {definition.evidence.map((item) => (
            <li key={item.id}>
              <strong>{item.label}</strong>
              {item.required && (
                <>
                  {' '}
                  · <Trans>Required</Trans>
                </>
              )}
              <p>{item.instructions}</p>
              {workflow && (
                <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {workflow.evidence.find(
                    (answer) => answer.requirementId === item.id,
                  )?.value || '—'}
                </p>
              )}
            </li>
          ))}
        </ul>
      </details>
    )}
    {definition.reviewChecks.length > 0 && (
      <details>
        <summary>
          <Trans>Reviewer checks</Trans> ({definition.reviewChecks.length})
        </summary>
        <ul>
          {definition.reviewChecks.map((item) => (
            <li key={item.id}>
              {item.label}
              {item.required && (
                <>
                  {' '}
                  · <Trans>Required</Trans>
                </>
              )}
              {reviewedIds?.includes(item.id) && (
                <>
                  {' '}
                  · <Trans>Confirmed</Trans>
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
    )}
  </StyledDeliveryStack>
);
