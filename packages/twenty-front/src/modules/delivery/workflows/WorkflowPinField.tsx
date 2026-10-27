import { useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { GET_WORKFLOW_CATALOG } from '@/delivery/workflows/delivery-workflows.graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';
import { type DeliveryWorkflowCatalogQuery } from '~/generated-metadata/graphql';

export type WorkflowPin = { templateId: string; version: number };

export const workflowPinValue = (pin?: WorkflowPin | null) =>
  pin ? `${pin.templateId}|${pin.version}` : '';

export const workflowPinFromForm = (
  form: FormData,
  previous?: WorkflowPin | null,
): WorkflowPin | null => {
  if (!form.has('workflowPin')) return previous ?? null;
  const value = String(form.get('workflowPin') ?? '');
  if (!value) return null;
  const [templateId, version] = value.split('|');
  return { templateId, version: Number(version) };
};

type WorkflowPinFieldProps = { initial?: WorkflowPin | null };

export const WorkflowPinField = ({ initial }: WorkflowPinFieldProps) => {
  const { t } = useLingui();
  const [selectedValue, setSelectedValue] = useState(() =>
    workflowPinValue(initial),
  );
  const access = useWorkflowAccess();
  const query = useQuery<DeliveryWorkflowCatalogQuery>(GET_WORKFLOW_CATALOG, {
    variables: { input: {}, identity: access.scope },
    skip: !access.manager,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: false,
  });
  const candidate = query.data?.deliveryWorkflowCatalog;
  const catalog =
    access.manager &&
    !query.error &&
    !query.loading &&
    access.matches(candidate)
      ? candidate
      : undefined;
  const options =
    catalog?.templates.filter((template) => !template.archived) ?? [];
  const selectionIsCurrent = options.some(
    (template) =>
      workflowPinValue({
        templateId: template.id,
        version: template.current.version,
      }) === selectedValue,
  );

  return (
    <StyledDeliveryStack>
      <input type="hidden" name="workflowPin" value={selectedValue} />
      <label>
        <Trans>Service requirements for new occurrences</Trans>
        <select
          name="workflowChoice"
          value={selectedValue}
          onChange={(event) => setSelectedValue(event.target.value)}
          disabled={!catalog}
        >
          <option value="">{t`Use only the custom checklist`}</option>
          {selectedValue && !selectionIsCurrent && (
            <option value={selectedValue}>
              {t`Selected workflow · Version ${selectedValue.split('|')[1]}`}
            </option>
          )}
          {options.map((template) => (
            <option
              key={template.id}
              value={workflowPinValue({
                templateId: template.id,
                version: template.current.version,
              })}
            >
              {template.current.definition.name} · {t`Version`}{' '}
              {template.current.version}
            </option>
          ))}
        </select>
      </label>
      <small>
        <Trans>
          Each new task uses this exact published version. Publishing a newer
          standard does not change the schedule. Archived workflows must be
          restored or replaced before new occurrences can be created.
        </Trans>
      </small>
      {!catalog && (
        <p role={query.loading ? 'status' : 'alert'}>
          {query.loading
            ? t`Loading workflow choices…`
            : t`Workflow choices are unavailable. Your workflow selection is kept.`}
        </p>
      )}
    </StyledDeliveryStack>
  );
};
