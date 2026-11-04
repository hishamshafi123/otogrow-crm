import { useId, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isValidUuid } from 'twenty-shared/utils';
import { type DeliveryFinanceExportProfileInput } from '~/generated-metadata/graphql';
import {
  type FinanceExportProfile,
  type FinanceExportsSnapshot,
} from '@/delivery/finance/export/finance-export.types';
import { useFinanceExportLabels } from '@/delivery/finance/export/useFinanceExportLabels';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import {
  StyledExportFields,
  StyledExportRow,
} from '@/delivery/finance/export/financeExportStyles';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { DeliveryFormRequirements } from '@/delivery/forms/DeliveryFormRequirements';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ColumnDraft = DeliveryFinanceExportProfileInput['columns'][number] & {
  localId: string;
};
type MappingDraft = DeliveryFinanceExportProfileInput['mappings'][number] & {
  localId: string;
};
type FinanceExportProfileFormProps = {
  initial: FinanceExportProfile | null;
  allowedFields: string[];
  mappingScopes: string[];
  projects: FinanceExportsSnapshot['projects'];
  busy: boolean;
  readOnly: boolean;
  onSave: (input: DeliveryFinanceExportProfileInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
export const FinanceExportProfileForm = ({
  initial,
  allowedFields,
  mappingScopes,
  projects,
  busy,
  readOnly,
  onSave,
  onCancel,
  onReload,
}: FinanceExportProfileFormProps) => {
  const { t } = useLingui();
  const labels = useFinanceExportLabels();
  const financeLabels = useFinanceLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const fieldId = useId();
  const [commandId] = useState(() => crypto.randomUUID());
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [revision] = useState(initial?.revision ?? 0);
  const [values, setValues] = useState(() => ({
    name: initial?.name ?? '',
    basis: initial?.basis ?? 'CASH',
    active: initial?.active ?? true,
    delimiter: initial?.delimiter ?? 'COMMA',
    precision: String(initial?.precision ?? 6),
    dateFormat: initial?.dateFormat ?? 'ISO',
    includeBom: initial?.includeBom ?? false,
    reason: '',
  }));
  const [columns, setColumns] = useState<ColumnDraft[]>(() =>
    (
      initial?.columns ?? [
        { header: t`Date`, field: 'DATE', constant: null },
        { header: t`Source ID`, field: 'SOURCE_ID', constant: null },
        { header: t`Kind`, field: 'KIND', constant: null },
        { header: t`Category`, field: 'CATEGORY', constant: null },
        { header: t`Description`, field: 'TITLE', constant: null },
        { header: t`Currency`, field: 'CURRENCY', constant: null },
        { header: t`Amount`, field: 'AMOUNT', constant: null },
      ]
    ).map((column) => ({ ...column, localId: crypto.randomUUID() })),
  );
  const [mappings, setMappings] = useState<MappingDraft[]>(() =>
    (initial?.mappings ?? []).map((mapping) => ({
      ...mapping,
      localId: crypto.randomUUID(),
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: { values, columns, mappings },
    busy: busy || saving,
  });
  const stale = revision !== (initial?.revision ?? 0);
  const headers = columns.map((column) => column.header.trim());
  const columnsValid =
    columns.length > 0 &&
    columns.length <= 30 &&
    new Set(headers.map((header) => header.toLowerCase())).size ===
      columns.length &&
    columns.every(
      (column) =>
        allowedFields.includes(column.field) &&
        column.header.trim().length > 0 &&
        !/[\r\n\0]/.test(column.header) &&
        !/^[=+\-@\t]/.test(column.header.trim()),
    );
  const mappingIdentities = mappings.map(
    (mapping) =>
      `${mapping.target}:${mapping.scope}:${mapping.scope === 'DEFAULT' ? '' : (mapping.key?.trim() ?? '')}`,
  );
  const mappingsValid =
    mappings.length <= 200 &&
    new Set(mappingIdentities).size === mappings.length &&
    mappings.every(
      (mapping) =>
        Object.hasOwn(labels.targets, mapping.target) &&
        mappingScopes.includes(mapping.scope) &&
        mapping.value.trim().length > 0 &&
        !/[\r\n\0]/.test(mapping.value) &&
        (mapping.scope === 'DEFAULT' || Boolean(mapping.key?.trim())) &&
        (mapping.scope !== 'SOURCE' || isValidUuid(mapping.key ?? '')) &&
        (mapping.scope !== 'PROJECT' ||
          mapping.key === 'COMPANY' ||
          isValidUuid(mapping.key ?? '')) &&
        (mapping.scope !== 'CURRENCY' ||
          financeLabels.currencies.includes(mapping.key ?? '')) &&
        (mapping.scope !== 'KIND' ||
          Object.hasOwn(labels.kinds, mapping.key ?? '')),
    );
  const requirements = [
    ...(!values.name.trim()
      ? [{ targetId: `${fieldId}-name`, message: t`Add a profile name.` }]
      : []),
    ...(!['CASH', 'RECOGNITION'].includes(values.basis)
      ? [
          {
            targetId: `${fieldId}-basis`,
            message: t`Choose an accounting basis.`,
          },
        ]
      : []),
    ...(!columnsValid
      ? [
          {
            targetId: `${fieldId}-columns`,
            message: t`Review CSV columns: choose supported fields and unique plain-text headers.`,
          },
        ]
      : []),
    ...(!mappingsValid
      ? [
          {
            targetId: `${fieldId}-mappings`,
            message: t`Review account and counterparty mappings: complete codes and matching values, and remove duplicate rules.`,
          },
        ]
      : []),
    ...(!values.reason.trim()
      ? [
          {
            targetId: `${fieldId}-reason`,
            message: t`Add a reason for this profile change.`,
          },
        ]
      : []),
  ];
  const canSave =
    !readOnly &&
    !stale &&
    draft.dirty &&
    values.name.trim().length > 0 &&
    values.reason.trim().length > 0 &&
    ['CASH', 'RECOGNITION'].includes(values.basis) &&
    columnsValid &&
    mappingsValid;
  const updateColumn = (localId: string, patch: Partial<ColumnDraft>) =>
    setColumns((rows) =>
      rows.map((row) => (row.localId === localId ? { ...row, ...patch } : row)),
    );
  const updateMapping = (localId: string, patch: Partial<MappingDraft>) =>
    setMappings((rows) =>
      rows.map((row) => (row.localId === localId ? { ...row, ...patch } : row)),
    );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || busy || saving) return;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        commandId,
        id,
        revision,
        name: values.name.trim(),
        basis: values.basis,
        active: values.active,
        delimiter: values.delimiter,
        precision: Number(values.precision),
        dateFormat: values.dateFormat,
        includeBom: values.includeBom,
        reason: values.reason.trim(),
        columns: columns.map((column) => ({
          header: column.header.trim(),
          field: column.field,
          constant:
            column.field === 'CONSTANT' ? (column.constant ?? '') : null,
        })),
        mappings: mappings.map((mapping) => ({
          target: mapping.target,
          scope: mapping.scope,
          key:
            mapping.scope === 'DEFAULT' ? null : (mapping.key?.trim() ?? null),
          value: mapping.value.trim(),
        })),
      });
      if (saved) draft.markSaved({ values, columns, mappings });
      else
        setError(
          t`The export profile was not confirmed saved. Your configuration is kept.`,
        );
    } catch {
      setError(
        t`The export profile could not be saved. Your configuration is kept.`,
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      ref={draft.formRef}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={t`Accountant export profile`}
    >
      <StyledDeliveryStack>
        <h3>{initial ? t`Edit export profile` : t`New export profile`}</h3>
        <p>
          <Trans>
            Configure a generic CSV with the accountant’s sample headers and
            codes. No external accounting connection or native Zoho template is
            assumed.
          </Trans>
        </p>
        {stale && (
          <DeliveryDraftConflict
            busy={busy || saving || readOnly}
            onReload={() => requestAction(onReload)}
          />
        )}
        {error && <p role="alert">{error}</p>}
        {readOnly && (
          <p role="status">
            <Trans>
              Editing is unavailable. Your profile draft is kept read-only.
            </Trans>
          </p>
        )}
        <fieldset disabled={busy || saving || stale || readOnly}>
          <StyledDeliveryStack>
            <StyledExportFields>
              <label>
                <Trans>Profile name</Trans>
                <input
                  id={`${fieldId}-name`}
                  name="name"
                  required
                  maxLength={160}
                  value={values.name}
                  onChange={(event) =>
                    setValues({ ...values, name: event.target.value })
                  }
                />
              </label>
              <label>
                <Trans>Accounting basis</Trans>
                <select
                  id={`${fieldId}-basis`}
                  name="basis"
                  value={values.basis}
                  onChange={(event) =>
                    setValues({ ...values, basis: event.target.value })
                  }
                >
                  <option value="CASH">{labels.basis('CASH')}</option>
                  <option value="RECOGNITION">
                    {labels.basis('RECOGNITION')}
                  </option>
                </select>
              </label>
              <label>
                <Trans>Column separator</Trans>
                <select
                  name="delimiter"
                  value={values.delimiter}
                  onChange={(event) =>
                    setValues({ ...values, delimiter: event.target.value })
                  }
                >
                  <option value="COMMA">{t`Comma`}</option>
                  <option value="SEMICOLON">{t`Semicolon`}</option>
                  <option value="TAB">{t`Tab`}</option>
                </select>
              </label>
              <label>
                <Trans>Decimal places</Trans>
                <select
                  name="precision"
                  value={values.precision}
                  onChange={(event) =>
                    setValues({ ...values, precision: event.target.value })
                  }
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((precision) => (
                    <option key={precision} value={precision}>
                      {precision}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Date format</Trans>
                <select
                  name="dateFormat"
                  value={values.dateFormat}
                  onChange={(event) =>
                    setValues({ ...values, dateFormat: event.target.value })
                  }
                >
                  <option value="ISO">YYYY-MM-DD</option>
                  <option value="DMY">DD/MM/YYYY</option>
                  <option value="MDY">MM/DD/YYYY</option>
                </select>
              </label>
              <label>
                <input
                  name="includeBom"
                  type="checkbox"
                  checked={values.includeBom}
                  onChange={(event) =>
                    setValues({ ...values, includeBom: event.target.checked })
                  }
                />
                <Trans>
                  Include a UTF-8 byte-order mark for the target template
                </Trans>
              </label>
            </StyledExportFields>
            <small>
              <Trans>
                Amounts that need more decimal places will block export; they
                are never rounded silently.
              </Trans>
            </small>
            <details open>
              <summary id={`${fieldId}-columns`}>
                <Trans>CSV columns</Trans>
              </summary>
              {columns.map((column, index) => (
                <StyledExportRow key={column.localId}>
                  <StyledExportFields>
                    <label>
                      {t`Column ${index + 1} header`}
                      <input
                        required
                        maxLength={120}
                        value={column.header}
                        onChange={(event) =>
                          updateColumn(column.localId, {
                            header: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t`Column ${index + 1} value`}
                      <select
                        value={column.field}
                        onChange={(event) =>
                          updateColumn(column.localId, {
                            field: event.target.value,
                            constant:
                              event.target.value === 'CONSTANT' ? '' : null,
                          })
                        }
                      >
                        {allowedFields.map((field) => (
                          <option key={field} value={field}>
                            {labels.fields[field] ?? t`Unsupported field`}
                          </option>
                        ))}
                      </select>
                    </label>
                    {column.field === 'CONSTANT' && (
                      <label>
                        {t`Column ${index + 1} fixed text`}
                        <input
                          maxLength={1000}
                          value={column.constant ?? ''}
                          onChange={(event) =>
                            updateColumn(column.localId, {
                              constant: event.target.value,
                            })
                          }
                        />
                      </label>
                    )}
                  </StyledExportFields>
                  <StyledDeliveryRow>
                    <StyledDeliveryButton
                      type="button"
                      disabled={index === 0}
                      onClick={() =>
                        setColumns((rows) => {
                          const next = [...rows];
                          [next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ];
                          return next;
                        })
                      }
                    >{t`Move column ${index + 1} earlier`}</StyledDeliveryButton>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        setColumns((rows) =>
                          rows.filter((row) => row.localId !== column.localId),
                        )
                      }
                    >{t`Remove column ${index + 1}`}</StyledDeliveryButton>
                  </StyledDeliveryRow>
                </StyledExportRow>
              ))}
              <StyledDeliveryButton
                type="button"
                disabled={columns.length >= 30}
                onClick={() =>
                  setColumns((rows) => [
                    ...rows,
                    {
                      localId: crypto.randomUUID(),
                      header: '',
                      field: 'ACCOUNT',
                      constant: null,
                    },
                  ])
                }
              >
                <Trans>Add CSV column</Trans>
              </StyledDeliveryButton>
              {!columnsValid && (
                <p role="status">
                  <Trans>
                    Choose at least one allowed field and unique plain-text
                    headers. Spreadsheet formulas are not allowed in headers.
                  </Trans>
                </p>
              )}
            </details>
            <details>
              <summary id={`${fieldId}-mappings`}>
                <Trans>Account and counterparty mappings</Trans>
              </summary>
              <p>
                <Trans>
                  Mappings are required only for account, payment-account or
                  counterparty columns included above. The first match wins in
                  this order: source, project, category, kind, currency, then
                  default.
                </Trans>
              </p>
              {mappings.map((mapping, index) => (
                <StyledExportRow key={mapping.localId}>
                  <StyledExportFields>
                    <label>
                      {t`Mapping ${index + 1} target`}
                      <select
                        value={mapping.target}
                        onChange={(event) =>
                          updateMapping(mapping.localId, {
                            target: event.target.value,
                          })
                        }
                      >
                        {Object.entries(labels.targets).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      {t`Mapping ${index + 1} applies to`}
                      <select
                        value={mapping.scope}
                        onChange={(event) =>
                          updateMapping(mapping.localId, {
                            scope: event.target.value,
                            key: null,
                          })
                        }
                      >
                        {mappingScopes.map((scope) => (
                          <option key={scope} value={scope}>
                            {labels.scopes[scope] ?? t`Unsupported scope`}
                          </option>
                        ))}
                      </select>
                    </label>
                    {mapping.scope !== 'DEFAULT' && (
                      <label>
                        {t`Mapping ${index + 1} matching value`}
                        {mapping.scope === 'PROJECT' ? (
                          <select
                            required
                            value={mapping.key ?? ''}
                            onChange={(event) =>
                              updateMapping(mapping.localId, {
                                key: event.target.value,
                              })
                            }
                          >
                            <option value="">{t`Choose a project or company`}</option>
                            <option value="COMPANY">{t`Company / unassigned`}</option>
                            {mapping.key &&
                              mapping.key !== 'COMPANY' &&
                              !projects.some(
                                (project) => project.id === mapping.key,
                              ) && (
                                <option
                                  value={mapping.key}
                                >{t`Unavailable project mapping`}</option>
                              )}
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        ) : mapping.scope === 'KIND' ||
                          mapping.scope === 'CURRENCY' ? (
                          <select
                            required
                            value={mapping.key ?? ''}
                            onChange={(event) =>
                              updateMapping(mapping.localId, {
                                key: event.target.value,
                              })
                            }
                          >
                            <option value="">{t`Choose a matching value`}</option>
                            {(mapping.scope === 'CURRENCY'
                              ? financeLabels.currencies.map((currency) => [
                                  currency,
                                  currency,
                                ])
                              : Object.entries(labels.kinds)
                            ).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            required
                            maxLength={240}
                            value={mapping.key ?? ''}
                            onChange={(event) =>
                              updateMapping(mapping.localId, {
                                key: event.target.value,
                              })
                            }
                          />
                        )}
                      </label>
                    )}
                    <label>
                      {t`Mapping ${index + 1} accounting code`}
                      <input
                        required
                        maxLength={240}
                        value={mapping.value}
                        onChange={(event) =>
                          updateMapping(mapping.localId, {
                            value: event.target.value,
                          })
                        }
                      />
                    </label>
                  </StyledExportFields>
                  {mapping.scope === 'SOURCE' && (
                    <small>
                      <Trans>
                        Use the exact source ID shown in an export row’s source
                        details.
                      </Trans>
                    </small>
                  )}
                  {mapping.scope === 'CATEGORY' && (
                    <small>
                      <Trans>
                        Use the exact category text shown in the financial
                        source.
                      </Trans>
                    </small>
                  )}
                  <StyledDeliveryButton
                    type="button"
                    onClick={() =>
                      setMappings((rows) =>
                        rows.filter((row) => row.localId !== mapping.localId),
                      )
                    }
                  >{t`Remove mapping ${index + 1}`}</StyledDeliveryButton>
                </StyledExportRow>
              ))}
              <StyledDeliveryButton
                type="button"
                disabled={mappings.length >= 200}
                onClick={() =>
                  setMappings((rows) => [
                    ...rows,
                    {
                      localId: crypto.randomUUID(),
                      target: 'ACCOUNT',
                      scope: 'DEFAULT',
                      key: null,
                      value: '',
                    },
                  ])
                }
              >
                <Trans>Add mapping</Trans>
              </StyledDeliveryButton>
              {!mappingsValid && (
                <p role="status">
                  <Trans>
                    Complete each mapping, use a valid matching identity and
                    avoid duplicate target/scope/value rules.
                  </Trans>
                </p>
              )}
            </details>
            <label>
              <input
                name="active"
                type="checkbox"
                checked={values.active}
                onChange={(event) =>
                  setValues({ ...values, active: event.target.checked })
                }
              />
              <Trans>Available for new export reviews</Trans>
            </label>
            <label>
              <Trans>Reason for profile change</Trans>
              <textarea
                id={`${fieldId}-reason`}
                name="reason"
                required
                maxLength={2000}
                value={values.reason}
                onChange={(event) =>
                  setValues({ ...values, reason: event.target.value })
                }
              />
            </label>
            <DeliveryFormRequirements requirements={requirements} />
            <StyledDeliveryButton
              type="submit"
              data-primary="true"
              disabled={!canSave}
            >
              <Trans>Save export profile</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryButton
          type="button"
          disabled={busy || saving}
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Cancel profile editing</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
