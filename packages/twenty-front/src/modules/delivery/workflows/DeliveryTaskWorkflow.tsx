import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type TaskWorkflow } from '@/delivery/workflows/workflow.types';
import { type TaskWorkflowController } from '@/delivery/workflows/useTaskWorkflow';
import { WorkflowApplyEditor } from '@/delivery/workflows/WorkflowApplyEditor';
import { WorkflowDefinitionView } from '@/delivery/workflows/WorkflowDefinitionView';
import {
  StyledWorkflowActions,
  StyledWorkflowFields,
} from '@/delivery/workflows/workflowStyles';

export const DeliveryTaskWorkflow = ({
  controller,
}: {
  controller: TaskWorkflowController;
}) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [applying, setApplying] = useState<TaskWorkflow | null>(null);
  const { data, draft, busy, error } = controller;
  const workflow = controller.snapshot?.workflow;
  const openSelection = () =>
    requestAction(() => {
      controller.reset();
      setApplying(data ?? null);
    });
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <h3>
          <Trans>Service requirements</Trans>
        </h3>
        {!data && (
          <div role={controller.loading ? 'status' : 'alert'}>
            <p>
              {controller.loading
                ? t`Loading task requirements…`
                : t`Task requirements are unavailable. Previously loaded details are hidden.`}
            </p>
            <StyledDeliveryButton onClick={controller.retry}>
              <Trans>Try again</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        {controller.notice && <p role="status">{controller.notice}</p>}
        <div hidden={!data}>
          <StyledWorkflowFields disabled={!data || busy}>
            {applying ? (
              <WorkflowApplyEditor
                snapshot={applying}
                controller={controller}
                onSaved={() => setApplying(null)}
                onClose={() => requestAction(() => setApplying(null))}
              />
            ) : (
              <StyledDeliveryStack>
                {!workflow && (
                  <p>
                    <Trans>
                      No service workflow is applied. This task uses its custom
                      checklist and delivery instructions.
                    </Trans>
                  </p>
                )}
                {workflow && (
                  <>
                    <strong>
                      {workflow.definition.name} · <Trans>Version</Trans>{' '}
                      {workflow.version}
                    </strong>
                    <p style={{ whiteSpace: 'pre-wrap' }}>
                      {workflow.definition.definitionOfDone}
                    </p>
                    <small>
                      <Trans>Applied by</Trans> {workflow.appliedByName} ·{' '}
                      {new Date(workflow.appliedAt).toLocaleString()}
                    </small>
                    <p>
                      <Trans>
                        Automatic checks cover completeness and link format.
                        Your reviewer decides whether the work meets the quality
                        standard.
                      </Trans>
                    </p>
                    {data?.locked && (
                      <p role="status">
                        <Trans>
                          Requirements are locked for this submitted version.
                        </Trans>
                      </p>
                    )}
                    {data?.canEdit ? (
                      <form
                        onSubmit={async (event) => {
                          event.preventDefault();
                          await controller.saveProgress();
                        }}
                      >
                        <StyledDeliveryStack>
                          {workflow.definition.checklist.map((item) => (
                            <label key={item.id}>
                              <input
                                type="checkbox"
                                checked={draft.values.checkedIds.includes(
                                  item.id,
                                )}
                                onChange={(event) =>
                                  draft.update({
                                    ...draft.values,
                                    checkedIds: event.target.checked
                                      ? [...draft.values.checkedIds, item.id]
                                      : draft.values.checkedIds.filter(
                                          (id) => id !== item.id,
                                        ),
                                  })
                                }
                              />
                              {item.label}
                              {item.required && (
                                <>
                                  {' '}
                                  · <Trans>Required</Trans>
                                </>
                              )}
                            </label>
                          ))}
                          {workflow.definition.evidence.length > 0 && (
                            <strong>
                              <Trans>Internal review evidence</Trans>
                            </strong>
                          )}
                          {workflow.definition.evidence.map((item) => (
                            <label key={item.id}>
                              {item.label}
                              {item.required && (
                                <>
                                  {' '}
                                  · <Trans>Required</Trans>
                                </>
                              )}
                              {item.instructions && (
                                <small>{item.instructions}</small>
                              )}
                              {item.kind === 'LINK' ? (
                                <input
                                  type="url"
                                  maxLength={8000}
                                  value={
                                    draft.values.evidence.find(
                                      (answer) =>
                                        answer.requirementId === item.id,
                                    )?.value ?? ''
                                  }
                                  onChange={(event) =>
                                    draft.update({
                                      ...draft.values,
                                      evidence: draft.values.evidence.map(
                                        (answer) =>
                                          answer.requirementId === item.id
                                            ? {
                                                ...answer,
                                                value: event.target.value,
                                              }
                                            : answer,
                                      ),
                                    })
                                  }
                                />
                              ) : (
                                <textarea
                                  maxLength={8000}
                                  value={
                                    draft.values.evidence.find(
                                      (answer) =>
                                        answer.requirementId === item.id,
                                    )?.value ?? ''
                                  }
                                  onChange={(event) =>
                                    draft.update({
                                      ...draft.values,
                                      evidence: draft.values.evidence.map(
                                        (answer) =>
                                          answer.requirementId === item.id
                                            ? {
                                                ...answer,
                                                value: event.target.value,
                                              }
                                            : answer,
                                      ),
                                    })
                                  }
                                />
                              )}
                            </label>
                          ))}
                          {(draft.stale || error) && (
                            <div role="alert">
                              <p>
                                {error ||
                                  t`This task changed while you were editing. Your answers are kept.`}
                              </p>
                              <StyledDeliveryButton
                                type="button"
                                onClick={controller.reload}
                              >
                                <Trans>Reload current requirements</Trans>
                              </StyledDeliveryButton>
                            </div>
                          )}
                          <StyledWorkflowActions>
                            <StyledDeliveryButton
                              type="submit"
                              data-primary="true"
                              disabled={busy || !draft.dirty || draft.stale}
                            >
                              <Trans>Save requirement progress</Trans>
                            </StyledDeliveryButton>
                            {draft.dirty && (
                              <small>
                                <Trans>
                                  Save these answers before submitting the task.
                                </Trans>
                              </small>
                            )}
                          </StyledWorkflowActions>
                        </StyledDeliveryStack>
                      </form>
                    ) : (
                      <WorkflowDefinitionView
                        definition={workflow.definition}
                        workflow={workflow}
                      />
                    )}
                    {data && data.missingRequirements.length > 0 && (
                      <div role="status">
                        <strong>
                          <Trans>Still needed before submission</Trans>
                        </strong>
                        <ul>
                          {data.missingRequirements.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
                {data?.canManage && controller.access.manager && (
                  <StyledDeliveryButton onClick={openSelection}>
                    {workflow
                      ? t`Change or reopen workflow`
                      : t`Apply a service workflow`}
                  </StyledDeliveryButton>
                )}
                {data &&
                  (data.previousApplications.length > 0 ||
                    controller.historyCursor) && (
                    <details>
                      <summary>
                        <Trans>Previous workflow applications</Trans>
                      </summary>
                      {data.previousApplications.map((previous) => (
                        <details key={previous.revision}>
                          <summary>
                            {previous.definition.name} · <Trans>Version</Trans>{' '}
                            {previous.version} ·{' '}
                            {new Date(previous.appliedAt).toLocaleString()}
                          </summary>
                          <p>
                            <Trans>Applied by</Trans> {previous.appliedByName}
                          </p>
                          <WorkflowDefinitionView
                            definition={previous.definition}
                            workflow={previous}
                          />
                        </details>
                      ))}
                      <StyledWorkflowActions>
                        {controller.historyCursor && (
                          <StyledDeliveryButton
                            onClick={() => controller.changePage(null)}
                          >
                            <Trans>Latest applications</Trans>
                          </StyledDeliveryButton>
                        )}
                        {data.nextHistoryCursor && (
                          <StyledDeliveryButton
                            onClick={() =>
                              controller.changePage(
                                data.nextHistoryCursor ?? null,
                              )
                            }
                          >
                            <Trans>Older applications</Trans>
                          </StyledDeliveryButton>
                        )}
                      </StyledWorkflowActions>
                    </details>
                  )}
              </StyledDeliveryStack>
            )}
          </StyledWorkflowFields>
        </div>
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
