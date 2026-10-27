import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import {
  type WorkflowDefinition,
  type WorkflowTemplate,
  workflowDefinitionInput,
} from '@/delivery/workflows/workflow.types';
import { useWorkflowLabels } from '@/delivery/workflows/useWorkflowLabels';
import {
  StyledWorkflowActions,
  StyledWorkflowFields,
} from '@/delivery/workflows/workflowStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryWorkflowSaveInput } from '~/generated-metadata/graphql';

type WorkflowEditorProps = {
  id: string;
  template?: WorkflowTemplate;
  initialDefinition: WorkflowDefinition;
  busy: boolean;
  stale: boolean;
  error: string;
  onSave: (input: DeliveryWorkflowSaveInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
export const WorkflowEditor = ({
  id,
  template,
  initialDefinition,
  busy,
  stale,
  error,
  onSave,
  onCancel,
  onReload,
}: WorkflowEditorProps) => {
  const { t } = useLingui();
  const { services } = useWorkflowLabels();
  const draft = useDeliveryDraft({
    initialValues: {
      definition: workflowDefinitionInput(initialDefinition),
      reason: '',
    },
    revision: template?.revision ?? 0,
    busy,
  });
  const { definition, reason } = draft.values;
  const update = (change: Partial<WorkflowDefinition>) =>
    draft.update({ ...draft.values, definition: { ...definition, ...change } });
  const invalid =
    !definition.name.trim() ||
    !definition.definitionOfDone.trim() ||
    reason.trim().length < 3 ||
    [
      ...definition.checklist,
      ...definition.evidence,
      ...definition.reviewChecks,
    ].some((item) => !item.label.trim());
  const checks = (field: 'checklist' | 'reviewChecks') => (
    <StyledDeliveryStack>
      {definition[field].map((item, index) => (
        <StyledDeliveryGrid key={item.id}>
          <label>
            {field === 'checklist'
              ? t`Work item ${index + 1}`
              : t`Review check ${index + 1}`}
            <input
              required
              maxLength={200}
              value={item.label}
              onChange={(event) =>
                update({
                  [field]: definition[field].map((candidate) =>
                    candidate.id === item.id
                      ? { ...candidate, label: event.target.value }
                      : candidate,
                  ),
                })
              }
            />
          </label>
          <StyledWorkflowActions>
            <label>
              <input
                type="checkbox"
                checked={item.required}
                onChange={(event) =>
                  update({
                    [field]: definition[field].map((candidate) =>
                      candidate.id === item.id
                        ? { ...candidate, required: event.target.checked }
                        : candidate,
                    ),
                  })
                }
              />
              <Trans>Required</Trans>
            </label>
            <StyledDeliveryButton
              type="button"
              aria-label={t`Remove ${item.label || (field === 'checklist' ? t`work item` : t`review check`)}`}
              onClick={() =>
                update({
                  [field]: definition[field].filter(
                    (candidate) => candidate.id !== item.id,
                  ),
                })
              }
            >
              <Trans>Remove</Trans>
            </StyledDeliveryButton>
          </StyledWorkflowActions>
        </StyledDeliveryGrid>
      ))}
      <StyledDeliveryButton
        type="button"
        disabled={definition[field].length >= (field === 'checklist' ? 50 : 25)}
        onClick={() =>
          update({
            [field]: [
              ...definition[field],
              { id: crypto.randomUUID(), label: '', required: true },
            ],
          })
        }
      >
        {field === 'checklist' ? t`Add work item` : t`Add review check`}
      </StyledDeliveryButton>
    </StyledDeliveryStack>
  );
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid || busy || stale) return;
        draft.setSaving(true);
        try {
          if (
            await onSave({
              id,
              revision: draft.revision,
              definition: workflowDefinitionInput(definition),
              reason,
            })
          )
            draft.markSaved();
        } finally {
          draft.setSaving(false);
        }
      }}
    >
      <StyledWorkflowFields disabled={busy || draft.saving}>
        <StyledDeliveryStack>
          <h3>
            {template ? t`Publish next version` : t`New service workflow`}
          </h3>
          <p>
            <Trans>
              Published versions stay unchanged on existing tasks. Choose a
              version explicitly when applying it.
            </Trans>
          </p>
          <StyledDeliveryGrid>
            <label>
              <Trans>Workflow name</Trans>
              <input
                required
                maxLength={200}
                value={definition.name}
                onChange={(event) => update({ name: event.target.value })}
              />
            </label>
            <label>
              <Trans>Service</Trans>
              <select
                value={definition.service}
                onChange={(event) => update({ service: event.target.value })}
              >
                {Object.entries(services).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </StyledDeliveryGrid>
          <label>
            <Trans>Definition of done</Trans>
            <textarea
              required
              maxLength={4000}
              value={definition.definitionOfDone}
              onChange={(event) =>
                update({ definitionOfDone: event.target.value })
              }
            />
          </label>
          <details>
            <summary>
              <Trans>Background notes</Trans>
            </summary>
            <label>
              <Trans>Description</Trans>
              <textarea
                maxLength={2000}
                value={definition.description}
                onChange={(event) =>
                  update({ description: event.target.value })
                }
              />
            </label>
          </details>
          <details>
            <summary>
              <Trans>Work checklist</Trans> ({definition.checklist.length})
            </summary>
            {checks('checklist')}
          </details>
          <details>
            <summary>
              <Trans>Internal evidence</Trans> ({definition.evidence.length})
            </summary>
            <StyledDeliveryStack>
              <p>
                <Trans>
                  These answers support internal review. Deliverable links for
                  clients are collected separately on each submission.
                </Trans>
              </p>
              {definition.evidence.map((item, index) => (
                <StyledDeliveryStack key={item.id}>
                  <StyledDeliveryGrid>
                    <label>
                      <Trans>Evidence {index + 1}</Trans>
                      <input
                        required
                        maxLength={200}
                        value={item.label}
                        onChange={(event) =>
                          update({
                            evidence: definition.evidence.map((candidate) =>
                              candidate.id === item.id
                                ? { ...candidate, label: event.target.value }
                                : candidate,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      <Trans>Answer format</Trans>
                      <select
                        value={item.kind}
                        onChange={(event) =>
                          update({
                            evidence: definition.evidence.map((candidate) =>
                              candidate.id === item.id
                                ? { ...candidate, kind: event.target.value }
                                : candidate,
                            ),
                          })
                        }
                      >
                        <option value="LINK">{t`Web link`}</option>
                        <option value="TEXT">{t`Written answer`}</option>
                      </select>
                    </label>
                  </StyledDeliveryGrid>
                  <label>
                    <Trans>Instructions</Trans>
                    <textarea
                      maxLength={2000}
                      value={item.instructions}
                      onChange={(event) =>
                        update({
                          evidence: definition.evidence.map((candidate) =>
                            candidate.id === item.id
                              ? {
                                  ...candidate,
                                  instructions: event.target.value,
                                }
                              : candidate,
                          ),
                        })
                      }
                    />
                  </label>
                  <StyledWorkflowActions>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.required}
                        onChange={(event) =>
                          update({
                            evidence: definition.evidence.map((candidate) =>
                              candidate.id === item.id
                                ? {
                                    ...candidate,
                                    required: event.target.checked,
                                  }
                                : candidate,
                            ),
                          })
                        }
                      />
                      <Trans>Required</Trans>
                    </label>
                    <StyledDeliveryButton
                      type="button"
                      aria-label={t`Remove evidence ${index + 1}`}
                      onClick={() =>
                        update({
                          evidence: definition.evidence.filter(
                            (candidate) => candidate.id !== item.id,
                          ),
                        })
                      }
                    >
                      <Trans>Remove</Trans>
                    </StyledDeliveryButton>
                  </StyledWorkflowActions>
                </StyledDeliveryStack>
              ))}
              <StyledDeliveryButton
                type="button"
                disabled={definition.evidence.length >= 25}
                onClick={() =>
                  update({
                    evidence: [
                      ...definition.evidence,
                      {
                        id: crypto.randomUUID(),
                        label: '',
                        instructions: '',
                        kind: 'LINK',
                        required: true,
                      },
                    ],
                  })
                }
              >
                <Trans>Add evidence requirement</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryStack>
          </details>
          <details>
            <summary>
              <Trans>Reviewer checks</Trans> ({definition.reviewChecks.length})
            </summary>
            {checks('reviewChecks')}
          </details>
          <label>
            <Trans>Reason for publishing</Trans>
            <input
              required
              minLength={3}
              maxLength={1000}
              value={reason}
              onChange={(event) =>
                draft.update({ ...draft.values, reason: event.target.value })
              }
            />
          </label>
          {invalid && (
            <small>
              <Trans>
                Add a name, definition of done, labels for every requirement and
                a publishing reason.
              </Trans>
            </small>
          )}
          {(stale || error) && (
            <div role="alert">
              <p>
                {error ||
                  t`This workflow changed while you were editing. Your draft is kept. Reload the latest version before publishing.`}
              </p>
              {template && (
                <StyledDeliveryButton type="button" onClick={onReload}>
                  <Trans>Reload latest workflow</Trans>
                </StyledDeliveryButton>
              )}
            </div>
          )}
          <StyledWorkflowActions>
            <StyledDeliveryButton
              data-primary="true"
              type="submit"
              disabled={busy || draft.saving || invalid || stale}
            >
              <Trans>Publish version</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton type="button" onClick={onCancel}>
              <Trans>Cancel</Trans>
            </StyledDeliveryButton>
          </StyledWorkflowActions>
        </StyledDeliveryStack>
      </StyledWorkflowFields>
    </form>
  );
};
