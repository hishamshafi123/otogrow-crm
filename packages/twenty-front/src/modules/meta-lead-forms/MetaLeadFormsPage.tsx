import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';

import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import {
  CREATE_META_LEAD_FORM,
  GET_META_LEAD_FORMS,
  GET_META_SHEET_LEADS,
  SET_META_LEAD_FORM_ACTIVE,
  SYNC_META_LEAD_FORM,
  type MetaLeadForm,
  type MetaSheetLead,
} from '@/meta-lead-forms/metaLeadFormsGraphql';

const StyledContent = styled.div`
  color: ${themeCssVariables.font.color.primary};
  overflow: auto;
  padding: ${themeCssVariables.spacing[6]};
  h1 {
    font-size: 24px;
  }
  p {
    color: ${themeCssVariables.font.color.secondary};
    line-height: 1.5;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  input,
  select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 6px;
    color: inherit;
    font: inherit;
    padding: 10px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    padding: 12px;
    text-align: left;
  }
  th {
    color: ${themeCssVariables.font.color.secondary};
  }
  a {
    color: ${themeCssVariables.color.blue};
  }
`;
const StyledToolbar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 20px 0;
`;
const StyledForm = styled.form`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  display: grid;
  gap: 16px;
  margin: 16px 0;
  max-width: 640px;
  padding: 24px;
`;
const StyledError = styled.div`
  color: ${themeCssVariables.color.red};
  padding: 12px 0;
`;

export const MetaLeadFormsPage = () => {
  const { t } = useLingui();
  const [selectedId, setSelectedId] = useState('');
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [importExisting, setImportExisting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const formsQuery = useQuery<{ metaLeadForms: MetaLeadForm[] }>(
    GET_META_LEAD_FORMS,
    { pollInterval: 30000 },
  );
  const forms = formsQuery.data?.metaLeadForms ?? [];
  const selected = forms.find((form) => form.id === selectedId) ?? forms.at(0);
  const leadsQuery = useQuery<{ metaSheetLeads: MetaSheetLead[] }>(
    GET_META_SHEET_LEADS,
    {
      variables: { formId: selected?.id, offset },
      skip: !selected,
      pollInterval: 15000,
    },
  );
  const [createForm, createState] = useMutation<{
    createMetaLeadForm: { id: string };
  }>(CREATE_META_LEAD_FORM);
  const [syncForm, syncState] = useMutation(SYNC_META_LEAD_FORM);
  const [setActive, activeState] = useMutation(SET_META_LEAD_FORM_ACTIVE);
  const busy = createState.loading || syncState.loading || activeState.loading;
  const leads = leadsQuery.data?.metaSheetLeads ?? [];

  const perform = async (operation: () => Promise<unknown>) => {
    setErrorMessage('');
    try {
      await operation();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t`Operation failed. Please retry.`,
      );
    }
  };

  return (
    <PageContainer>
      <PageBody>
        <StyledContent>
          <h1>
            <Trans>Meta lead forms</Trans>
          </h1>
          <p>
            <Trans>
              Connect each Meta lead form to its Google Sheet. New leads become
              CRM contacts and are assigned to available setters.
            </Trans>
          </p>
          <StyledToolbar>
            <label>
              <Trans>Lead form</Trans>
              <select
                aria-label={t`Lead form`}
                value={selected?.id ?? ''}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setOffset(0);
                }}
              >
                {forms.length === 0 && (
                  <option value="">{t`No forms connected`}</option>
                )}
                {forms.map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              title={t`Add lead form`}
              variant="primary"
              onClick={() => setShowCreate(true)}
            />
            <Link to={getSettingsPath(SettingsPath.SettersTelegram)}>
              <Trans>Setters and Telegram</Trans>
            </Link>
          </StyledToolbar>
          {(errorMessage || formsQuery.error || leadsQuery.error) && (
            <StyledError role="alert">
              {errorMessage ||
                formsQuery.error?.message ||
                leadsQuery.error?.message}
            </StyledError>
          )}
          {formsQuery.loading && (
            <p role="status">
              <Trans>Loading forms…</Trans>
            </p>
          )}
          {showCreate && (
            <StyledForm
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  const result = await createForm({
                    variables: {
                      input: {
                        name,
                        sheetUrl,
                        serviceAccountJson,
                        importExisting,
                      },
                    },
                  });
                  setSelectedId(result.data?.createMetaLeadForm.id ?? '');
                  setOffset(0);
                  setShowCreate(false);
                  setServiceAccountJson('');
                  setName('');
                  setSheetUrl('');
                  setImportExisting(false);
                  await formsQuery.refetch();
                });
              }}
            >
              <h2>
                <Trans>Connect a lead form</Trans>
              </h2>
              <label>
                <Trans>Form name</Trans>
                <input
                  required
                  maxLength={200}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                <Trans>Google Sheet link</Trans>
                <input
                  required
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
                  value={sheetUrl}
                  onChange={(event) => setSheetUrl(event.target.value)}
                />
              </label>
              <p>
                <Trans>
                  Enable the Google Sheets API for your service account and
                  share this sheet with its client_email as a Viewer. Upload its
                  JSON key below. The key is encrypted and is never displayed
                  again.
                </Trans>
              </p>
              <label>
                <Trans>Service account JSON key</Trans>
                <input
                  required
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    setServiceAccountJson('');
                    if (file)
                      void perform(async () => {
                        if (file.size > 20000)
                          throw new Error(
                            t`The JSON key must be smaller than 20 KB.`,
                          );
                        setServiceAccountJson(await file.text());
                      });
                  }}
                />
              </label>
              <label>
                <Trans>Existing rows</Trans>
                <select
                  value={importExisting ? 'import' : 'skip'}
                  onChange={(event) =>
                    setImportExisting(event.target.value === 'import')
                  }
                >
                  <option value="skip">{t`Only import new leads`}</option>
                  <option value="import">{t`Import existing leads too (assigns and notifies setters)`}</option>
                </select>
              </label>
              <p>
                <Trans>
                  The first row must contain id, lead_id, or leadgen_id, plus
                  email or phone_number. Other columns are preserved as form
                  answers. Keep lead IDs as plain text.
                </Trans>
              </p>
              <StyledToolbar>
                <Button
                  type="submit"
                  title={busy ? t`Connecting…` : t`Connect sheet`}
                  variant="primary"
                  disabled={busy || !serviceAccountJson}
                />
                <Button
                  title={t`Cancel`}
                  disabled={busy}
                  onClick={() => {
                    setShowCreate(false);
                    setServiceAccountJson('');
                  }}
                />
              </StyledToolbar>
            </StyledForm>
          )}
          {selected && (
            <>
              <StyledToolbar>
                <h2>{selected.name}</h2>
                <a
                  href={`https://docs.google.com/spreadsheets/d/${selected.spreadsheetId}/edit#gid=${selected.sheetId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Trans>Open sheet</Trans>
                </a>
                <Button
                  title={syncState.loading ? t`Syncing…` : t`Sync now`}
                  disabled={busy || !selected.isActive}
                  onClick={() =>
                    void perform(async () => {
                      await syncForm({ variables: { id: selected.id } });
                      await Promise.all([
                        formsQuery.refetch(),
                        leadsQuery.refetch(),
                      ]);
                    })
                  }
                />
                <Button
                  title={selected.isActive ? t`Pause sync` : t`Resume sync`}
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await setActive({
                        variables: {
                          id: selected.id,
                          isActive: !selected.isActive,
                        },
                      });
                      await formsQuery.refetch();
                    })
                  }
                />
              </StyledToolbar>
              <p>
                {selected.isActive
                  ? t`Automatic sync runs approximately every 30 seconds while the worker is running.`
                  : t`Sync is paused.`}{' '}
                {selected.lastSyncedAt
                  ? t`Last synced: ${new Date(selected.lastSyncedAt).toLocaleString()}`
                  : t`Waiting for the first sync.`}
              </p>
              {selected.lastError && (
                <StyledError role="alert">{selected.lastError}</StyledError>
              )}
              {leadsQuery.loading ? (
                <p role="status">
                  <Trans>Loading leads…</Trans>
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>
                        <Trans>Name</Trans>
                      </th>
                      <th>
                        <Trans>Email</Trans>
                      </th>
                      <th>
                        <Trans>Phone</Trans>
                      </th>
                      <th>
                        <Trans>Received</Trans>
                      </th>
                      <th>
                        <Trans>Answers</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id}>
                        <td>
                          {lead.personId ? (
                            <Link to={`/objects/people/${lead.personId}`}>
                              {lead.name || lead.leadId}
                            </Link>
                          ) : (
                            lead.name || lead.leadId
                          )}
                        </td>
                        <td>{lead.email}</td>
                        <td>{lead.phone}</td>
                        <td>{new Date(lead.createdAt).toLocaleString()}</td>
                        <td>
                          <details>
                            <summary>
                              <Trans>View answers</Trans>
                            </summary>
                            <dl>
                              {lead.answers.map((answer, index) => (
                                <div key={`${answer.label}-${index}`}>
                                  <dt>{answer.label}</dt>
                                  <dd>{answer.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        </td>
                      </tr>
                    ))}
                    {leads.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <Trans>
                            No imported leads yet. New sheet rows will appear
                            here after syncing.
                          </Trans>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
              <StyledToolbar>
                <Button
                  title={t`Previous`}
                  disabled={offset === 0 || leadsQuery.loading}
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                />
                <Button
                  title={t`Next`}
                  disabled={leads.length < 50 || leadsQuery.loading}
                  onClick={() => setOffset(offset + 50)}
                />
              </StyledToolbar>
            </>
          )}
        </StyledContent>
      </PageBody>
    </PageContainer>
  );
};
