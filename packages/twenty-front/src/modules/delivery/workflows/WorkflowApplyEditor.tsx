import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import {
  type TaskWorkflow,
  type WorkflowTemplate,
} from '@/delivery/workflows/workflow.types';
import { GET_WORKFLOW_CATALOG } from '@/delivery/workflows/delivery-workflows.graphql';
import { type TaskWorkflowController } from '@/delivery/workflows/useTaskWorkflow';
import { WorkflowDefinitionView } from '@/delivery/workflows/WorkflowDefinitionView';
import {
  StyledWorkflowActions,
  StyledWorkflowFields,
} from '@/delivery/workflows/workflowStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryWorkflowCatalogQuery } from '~/generated-metadata/graphql';

export const WorkflowApplyEditor = ({
  snapshot,
  controller,
  onClose,
  onSaved,
}: {
  snapshot: TaskWorkflow;
  controller: TaskWorkflowController;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { t } = useLingui();
  const [selected, setSelected] = useState<WorkflowTemplate>();
  const draft = useDeliveryDraft({
    initialValues: { templateId: '', version: 0, reason: '', reopen: false },
    revision: snapshot.taskRevision,
    busy: controller.busy,
  });
  const query = useQuery<DeliveryWorkflowCatalogQuery>(GET_WORKFLOW_CATALOG, {
    variables: {
      input: { templateId: draft.values.templateId || undefined },
      identity: controller.access.scope,
    },
    skip: !controller.access.manager,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: false,
    pollInterval: 30000,
  });
  const catalog =
    !query.error &&
    !query.loading &&
    controller.access.matches(query.data?.deliveryWorkflowCatalog)
      ? query.data?.deliveryWorkflowCatalog
      : undefined;
  const stale =
    controller.data?.taskRevision !== draft.revision ||
    Boolean(
      selected &&
      catalog &&
      catalog.templates.find((template) => template.id === selected.id)
        ?.revision !== selected.revision,
    );
  const version =
    catalog?.versions.find(
      (item) =>
        item.templateId === selected?.id &&
        item.version === draft.values.version,
    ) ??
    (selected?.current.version === draft.values.version
      ? selected.current
      : undefined);
  const unchanged =
    snapshot.workflow?.templateId === draft.values.templateId &&
    snapshot.workflow?.version === draft.values.version;
  const disabled =
    controller.busy ||
    !catalog ||
    !version ||
    !selected ||
    stale ||
    draft.values.reason.trim().length < 3 ||
    (snapshot.locked && !draft.values.reopen) ||
    (unchanged && !snapshot.locked);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled) return;
        const success = await controller.apply({
          taskId: snapshot.taskId,
          taskRevision: draft.revision,
          templateId: selected.id,
          templateRevision: selected.revision,
          version: draft.values.version,
          reopen: draft.values.reopen,
          reason: draft.values.reason,
        });
        if (success) {
          draft.markSaved();
          onSaved();
        }
      }}
    >
      <StyledWorkflowFields disabled={controller.busy}>
        <StyledDeliveryStack>
          <h4>
            <Trans>Choose workflow requirements</Trans>
          </h4>
          {!catalog && (
            <div role="alert">
              <p>
                {query.loading
                  ? t`Loading published workflows…`
                  : t`Published workflows could not be loaded. Your selection is kept.`}
              </p>
              <StyledDeliveryButton
                type="button"
                onClick={() => void query.refetch().catch(() => undefined)}
              >
                <Trans>Try again</Trans>
              </StyledDeliveryButton>
            </div>
          )}
          {catalog?.templates.length === 0 && (
            <p>
              <Trans>
                Publish a service workflow before applying it to a task.
              </Trans>
            </p>
          )}
          <StyledDeliveryGrid>
            <label>
              <Trans>Published workflow</Trans>
              <select
                disabled={!catalog}
                value={draft.values.templateId}
                onChange={(event) => {
                  const template = catalog?.templates.find(
                    (item) => item.id === event.target.value,
                  );
                  setSelected(template);
                  draft.update({
                    ...draft.values,
                    templateId: template?.id ?? '',
                    version: template?.current.version ?? 0,
                  });
                }}
              >
                <option value="">{t`Choose a workflow`}</option>
                {catalog?.templates
                  .filter((template) => !template.archived)
                  .map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.current.definition.name}
                    </option>
                  ))}
              </select>
            </label>
            {selected && (
              <label>
                <Trans>Published version</Trans>
                <select
                  disabled={!catalog}
                  value={draft.values.version}
                  onChange={(event) =>
                    draft.update({
                      ...draft.values,
                      version: Number(event.target.value),
                    })
                  }
                >
                  {(catalog?.versions.filter(
                    (item) => item.templateId === selected.id,
                  ).length
                    ? catalog.versions.filter(
                        (item) => item.templateId === selected.id,
                      )
                    : [selected.current]
                  ).map((item) => (
                    <option key={item.version} value={item.version}>
                      {t`Version ${item.version}`} · {item.publishedByName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </StyledDeliveryGrid>
          {version && (
            <WorkflowDefinitionView definition={version.definition} />
          )}
          {snapshot.workflow && (
            <p>
              <Trans>
                Replacing requirements clears their work checks and internal
                evidence. The previous answers remain in workflow history. Task
                notes and deliverable links stay unchanged.
              </Trans>
            </p>
          )}
          {snapshot.locked && (
            <label>
              <input
                type="checkbox"
                checked={draft.values.reopen}
                onChange={(event) =>
                  draft.update({
                    ...draft.values,
                    reopen: event.target.checked,
                  })
                }
              />
              <Trans>
                Reopen production and reset workflow answers. This removes
                current approval and fulfilment credit until the work is
                completed again.
              </Trans>
            </label>
          )}
          {unchanged && !snapshot.locked && (
            <p role="status">
              <Trans>
                This version is already applied. Choose a different version to
                replace its requirements.
              </Trans>
            </p>
          )}
          <label>
            <Trans>Reason for applying this version</Trans>
            <input
              required
              minLength={3}
              maxLength={1000}
              value={draft.values.reason}
              onChange={(event) =>
                draft.update({ ...draft.values, reason: event.target.value })
              }
            />
          </label>
          {(controller.error || stale) && (
            <div role="alert">
              <p>
                {controller.error ||
                  t`The task or workflow changed. Your preview is kept. Cancel and choose the current version before applying.`}
              </p>
            </div>
          )}
          <StyledWorkflowActions>
            <StyledDeliveryButton
              type="submit"
              data-primary="true"
              disabled={disabled}
            >
              {snapshot.locked
                ? t`Reopen and apply workflow`
                : t`Apply workflow`}
            </StyledDeliveryButton>
            <StyledDeliveryButton type="button" onClick={onClose}>
              <Trans>Cancel workflow selection</Trans>
            </StyledDeliveryButton>
          </StyledWorkflowActions>
        </StyledDeliveryStack>
      </StyledWorkflowFields>
    </form>
  );
};
