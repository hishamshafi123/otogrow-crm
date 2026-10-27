import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  StyledWorkflowActions,
  StyledWorkflowList,
} from '@/delivery/workflows/workflowStyles';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { WorkflowEditor } from '@/delivery/workflows/WorkflowEditor';
import { WorkflowDefinitionView } from '@/delivery/workflows/WorkflowDefinitionView';
import {
  emptyWorkflow,
  type WorkflowCatalog,
  type WorkflowDefinition,
  type WorkflowTemplate,
} from '@/delivery/workflows/workflow.types';
import {
  GET_WORKFLOW_CATALOG,
  SAVE_WORKFLOW,
  ARCHIVE_WORKFLOW,
} from '@/delivery/workflows/delivery-workflows.graphql';
import { useWorkflowLabels } from '@/delivery/workflows/useWorkflowLabels';
import {
  type DeliveryWorkflowCatalogQuery,
  type DeliveryWorkflowSaveInput,
  type DeliveryWorkflowArchiveInput,
  type SaveDeliveryWorkflowMutation,
  type ArchiveDeliveryWorkflowMutation,
} from '~/generated-metadata/graphql';

type WorkflowEdit = {
  id: string;
  key: string;
  template?: WorkflowTemplate;
  definition: WorkflowDefinition;
  archive?: boolean;
};
export const DeliveryWorkflowCatalog = () => {
  const access = useWorkflowAccess();
  return <WorkflowCatalogWorkspace key={access.scope} />;
};
const WorkflowCatalogWorkspace = () => {
  const { t } = useLingui();
  const access = useWorkflowAccess();
  const labels = useWorkflowLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [selected, setSelected] = useState<string | undefined>();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editor, setEditor] = useState<WorkflowEdit | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useQuery<DeliveryWorkflowCatalogQuery>(GET_WORKFLOW_CATALOG, {
    variables: {
      input: { includeArchived, templateId: selected },
      identity: access.scope,
    },
    skip: !access.manager,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: false,
    pollInterval: 30000,
  });
  const [save] = useMutation<SaveDeliveryWorkflowMutation>(SAVE_WORKFLOW);
  const [archive] =
    useMutation<ArchiveDeliveryWorkflowMutation>(ARCHIVE_WORKFLOW);
  const candidate = query.data?.deliveryWorkflowCatalog;
  const data =
    access.manager &&
    !query.error &&
    !query.loading &&
    access.matches(candidate)
      ? candidate
      : undefined;
  const current = data?.templates.find((template) => template.id === selected);
  const stale = Boolean(
    editor?.template &&
    data &&
    data.templates.find((template) => template.id === editor.id)?.revision !==
      editor.template.revision,
  );
  const replace = (next: () => void) =>
    requestAction(() => {
      setEditor(null);
      setError('');
      setNotice('');
      next();
    });
  const open = (
    definition: WorkflowDefinition,
    template?: WorkflowTemplate,
    archiveState?: boolean,
  ) =>
    replace(() =>
      setEditor({
        id: template?.id ?? crypto.randomUUID(),
        key: crypto.randomUUID(),
        template,
        definition,
        archive: archiveState,
      }),
    );
  const write = async (
    operation: () => Promise<WorkflowCatalog | undefined>,
  ) => {
    if (busy || !data) return false;
    setBusy(true);
    setError('');
    let saved: WorkflowCatalog | undefined;
    try {
      saved = await operation();
      if (!access.matches(saved)) {
        setError(t`The result could not be verified. Refresh before retrying.`);
        setBusy(false);
        return false;
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`The workflow could not be saved. Your draft is kept.`,
      );
      return false;
    } finally {
      if (!saved) setBusy(false);
    }
    setEditor(null);
    if (saved?.versions[0]) setSelected(saved.versions[0].templateId);
    setNotice(t`Saved. Existing tasks keep their chosen workflow version.`);
    try {
      await query.refetch();
    } catch {
      setNotice(
        t`Saved, but the list could not refresh. Refresh before making another change.`,
      );
    } finally {
      setBusy(false);
    }
    return true;
  };
  const reload = () =>
    requestAction(async () => {
      setBusy(true);
      try {
        const refreshed = (await query.refetch()).data?.deliveryWorkflowCatalog;
        const template = refreshed?.templates.find(
          (item) => item.id === editor?.id,
        );
        if (!access.matches(refreshed) || !template)
          throw new Error(t`This workflow is no longer available.`);
        setEditor({
          id: template.id,
          key: crypto.randomUUID(),
          template,
          definition: template.current.definition,
          archive: editor?.archive,
        });
        setError('');
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : t`Could not reload. Your draft is kept.`,
        );
      } finally {
        setBusy(false);
      }
    });
  return (
    <StyledDeliveryStack>
      <p>
        <Trans>
          Define the work, evidence and reviewer checks once. Each task keeps
          the version chosen for it.
        </Trans>
      </p>
      {!data && (
        <StyledDeliveryCard
          role={access.loading || query.loading ? 'status' : 'alert'}
        >
          <p>
            {access.loading || query.loading
              ? t`Loading service workflows…`
              : !access.manager
                ? t`Service workflow management requires delivery manager access.`
                : t`Service workflows could not be loaded. Previously loaded details are hidden.`}
          </p>
          {!access.loading && (
            <StyledDeliveryButton
              onClick={() =>
                void (access.error ? access.refetch() : query.refetch()).catch(
                  () => undefined,
                )
              }
            >
              <Trans>Try again</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryCard>
      )}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <>
          <StyledWorkflowActions>
            <StyledDeliveryButton
              data-primary="true"
              onClick={() => open(emptyWorkflow())}
              disabled={busy}
            >
              <Trans>New workflow</Trans>
            </StyledDeliveryButton>
            <label>
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) =>
                  replace(() => setIncludeArchived(event.target.checked))
                }
              />
              <Trans>Include archived</Trans>
            </label>
          </StyledWorkflowActions>
          {!data.templates.length && (
            <p>
              <Trans>
                No workflows published yet. Start with a service example or
                create your own.
              </Trans>
            </p>
          )}
          <StyledWorkflowList aria-label={t`Published workflows`}>
            {data.templates.map((template) => (
              <li key={template.id}>
                <StyledWorkflowActions>
                  <StyledDeliveryButton
                    aria-pressed={selected === template.id}
                    disabled={busy}
                    onClick={() => replace(() => setSelected(template.id))}
                  >
                    {template.current.definition.name}
                  </StyledDeliveryButton>
                  <span>
                    {labels.service(template.current.definition.service)} ·{' '}
                    <Trans>Version</Trans> {template.current.version}
                    {template.archived && (
                      <>
                        {' '}
                        · <Trans>Archived</Trans>
                      </>
                    )}
                  </span>
                </StyledWorkflowActions>
              </li>
            ))}
          </StyledWorkflowList>
          {!editor && current && (
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <h3>{current.current.definition.name}</h3>
                <small>
                  <Trans>Version</Trans> {current.current.version} ·{' '}
                  {current.current.publishedByName} ·{' '}
                  {new Date(current.current.publishedAt).toLocaleString()}
                </small>
                <WorkflowDefinitionView
                  definition={current.current.definition}
                />
                <p>{current.current.reason}</p>
                {current.archived && (
                  <p>
                    <Trans>Archived:</Trans> {current.stateReason}
                  </p>
                )}
                <StyledWorkflowActions>
                  {!current.archived && (
                    <StyledDeliveryButton
                      onClick={() => open(current.current.definition, current)}
                    >
                      <Trans>Edit next version</Trans>
                    </StyledDeliveryButton>
                  )}
                  <StyledDeliveryButton
                    onClick={() =>
                      open(
                        current.current.definition,
                        current,
                        !current.archived,
                      )
                    }
                  >
                    {current.archived
                      ? t`Restore workflow`
                      : t`Archive workflow`}
                  </StyledDeliveryButton>
                </StyledWorkflowActions>
                <details>
                  <summary>
                    <Trans>Published versions</Trans>
                  </summary>
                  {data.versions
                    .filter((version) => version.templateId === current.id)
                    .map((version) => (
                      <details key={version.version}>
                        <summary>
                          <Trans>Version</Trans> {version.version} ·{' '}
                          {version.publishedByName} ·{' '}
                          {new Date(version.publishedAt).toLocaleString()}
                        </summary>
                        <p>{version.reason}</p>
                        <WorkflowDefinitionView
                          definition={version.definition}
                        />
                      </details>
                    ))}
                </details>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          )}
          {!editor && (
            <details>
              <summary>
                <Trans>Start from a service example</Trans> (
                {data.starters.length})
              </summary>
              <p>
                <Trans>
                  Examples are not active until you review and publish them.
                </Trans>
              </p>
              <StyledWorkflowActions>
                {data.starters.map((starter) => (
                  <StyledDeliveryButton
                    key={starter.key}
                    onClick={() => open(starter.definition)}
                  >
                    {starter.definition.name}
                  </StyledDeliveryButton>
                ))}
              </StyledWorkflowActions>
            </details>
          )}
        </>
      )}
      {editor && (
        <div hidden={!data}>
          <fieldset
            disabled={!data || busy}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            <StyledDeliveryCard>
              {editor.archive !== undefined && editor.template ? (
                <WorkflowArchiveEditor
                  key={editor.key}
                  template={editor.template}
                  archived={editor.archive}
                  busy={busy}
                  stale={stale}
                  error={error}
                  onCancel={() => replace(() => undefined)}
                  onReload={reload}
                  onSave={(input) =>
                    write(
                      async () =>
                        (await archive({ variables: { input } })).data
                          ?.archiveDeliveryWorkflow,
                    )
                  }
                />
              ) : (
                <WorkflowEditor
                  key={editor.key}
                  id={editor.id}
                  template={editor.template}
                  initialDefinition={editor.definition}
                  busy={busy}
                  stale={stale}
                  error={error}
                  onCancel={() => replace(() => undefined)}
                  onReload={reload}
                  onSave={(input: DeliveryWorkflowSaveInput) =>
                    write(
                      async () =>
                        (await save({ variables: { input } })).data
                          ?.saveDeliveryWorkflow,
                    )
                  }
                />
              )}
            </StyledDeliveryCard>
          </fieldset>
        </div>
      )}
    </StyledDeliveryStack>
  );
};
const WorkflowArchiveEditor = ({
  template,
  archived,
  busy,
  stale,
  error,
  onSave,
  onCancel,
  onReload,
}: {
  template: WorkflowTemplate;
  archived: boolean;
  busy: boolean;
  stale: boolean;
  error: string;
  onSave: (input: DeliveryWorkflowArchiveInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
}) => {
  const { t } = useLingui();
  const draft = useDeliveryDraft({
    initialValues: { reason: '' },
    revision: template.revision,
    busy,
  });
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || stale || draft.values.reason.trim().length < 3) return;
        if (
          await onSave({
            id: template.id,
            revision: draft.revision,
            archived,
            reason: draft.values.reason,
          })
        )
          draft.markSaved();
      }}
    >
      <StyledDeliveryStack>
        <h3>
          {archived
            ? t`Archive ${template.current.definition.name}`
            : t`Restore ${template.current.definition.name}`}
        </h3>
        <p>
          <Trans>
            Existing tasks retain their pinned requirements and history.
          </Trans>
        </p>
        <label>
          <Trans>Reason</Trans>
          <textarea
            required
            minLength={3}
            maxLength={1000}
            value={draft.values.reason}
            onChange={(event) => draft.update({ reason: event.target.value })}
          />
        </label>
        {(error || stale) && (
          <div role="alert">
            <p>
              {error ||
                t`This workflow changed. Reload the latest version before continuing.`}
            </p>
            <StyledDeliveryButton type="button" onClick={onReload}>
              <Trans>Reload latest workflow</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        <StyledWorkflowActions>
          <StyledDeliveryButton
            type="submit"
            disabled={busy || stale || draft.values.reason.trim().length < 3}
          >
            {archived ? t`Confirm archive` : t`Confirm restore`}
          </StyledDeliveryButton>
          <StyledDeliveryButton type="button" onClick={onCancel}>
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
        </StyledWorkflowActions>
      </StyledDeliveryStack>
    </form>
  );
};
