import { MetaLeadDetailPanel } from '@/meta-lead-forms/MetaLeadDetailPanel';
import { useOpenDialer } from '@/calling/hooks/useOpenDialer';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MetaLeadFormTabs } from '@/meta-lead-forms/MetaLeadFormTabs';
import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { AppPath, SettingsPath } from 'twenty-shared/types';
import { getAppPath, getSettingsPath } from 'twenty-shared/utils';

import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import {
  CREATE_META_LEAD_FORM,
  MARK_META_SHEET_LEADS_READ,
  type MetaLeadFormActivity,
  GET_META_LEAD_FORMS,
  GET_META_SHEET_LEADS,
  SET_META_LEAD_FORM_ACTIVE,
  SYNC_META_LEAD_FORM,
  type MetaLeadForm,
  type MetaSheetLead,
} from '@/meta-lead-forms/metaLeadFormsGraphql';

const StyledContent = styled.div`
  background-color: ${themeCssVariables.background.secondary};
  background-image:
    radial-gradient(
      900px 380px at 8% -4%,
      ${themeCssVariables.color.transparent.iris2},
      transparent 58%
    ),
    radial-gradient(
      720px 320px at 92% 0%,
      ${themeCssVariables.color.transparent.cyan2},
      transparent 54%
    );
  color: ${themeCssVariables.font.color.primary};
  min-height: 100%;
  overflow: auto;
  padding: 28px 32px 64px;

  h1 {
    font-size: 28px;
    font-weight: 650;
    letter-spacing: -0.03em;
    margin: 0 0 6px;
  }

  p {
    color: ${themeCssVariables.font.color.secondary};
    line-height: 1.5;
  }

  label {
    color: ${themeCssVariables.font.color.secondary};
    display: flex;
    flex-direction: column;
    font-size: 13px;
    font-weight: 500;
    gap: 8px;
  }

  input,
  select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 10px;
    color: inherit;
    font: inherit;
    padding: 10px 12px;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease;
  }

  input:focus,
  select:focus {
    border-color: ${themeCssVariables.color.iris9};
    box-shadow: 0 0 0 3px ${themeCssVariables.color.transparent.iris3};
    outline: none;
  }

  td > button {
    background: none;
    border: 0;
    color: ${themeCssVariables.color.iris11};
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    padding: 0;
    text-align: left;
  }

  table {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-collapse: separate;
    border-radius: 16px;
    border-spacing: 0;
    box-shadow: 0 10px 28px -20px ${themeCssVariables.boxShadow.color};
    overflow: hidden;
    width: 100%;
  }

  th,
  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    padding: 13px 16px;
    text-align: left;
  }

  th {
    background: ${themeCssVariables.background.secondary};
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  tbody tr:hover td {
    background: ${themeCssVariables.background.transparent.lighter};
  }

  a {
    color: ${themeCssVariables.color.iris11};
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
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 16px;
  box-shadow: 0 12px 30px -20px ${themeCssVariables.boxShadow.color};
  display: grid;
  gap: 16px;
  margin: 16px 0;
  max-width: 640px;
  padding: 24px;
`;

const StyledError = styled.div`
  background: ${themeCssVariables.color.transparent.red2};
  border: 1px solid ${themeCssVariables.color.transparent.red6};
  border-radius: 10px;
  color: ${themeCssVariables.color.red11};
  margin: 12px 0;
  padding: 12px 14px;
`;

const StyledEmptyState = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px dashed ${themeCssVariables.border.color.medium};
  border-radius: 16px;
  margin: 24px 0;
  max-width: 680px;
  padding: 32px;
`;

const StyledLeadRow = styled.tr`
  &[data-unread='true'] {
    background: ${themeCssVariables.color.transparent.iris2};
  }
`;

const StyledNewLabel = styled.span`
  background: ${themeCssVariables.color.transparent.iris3};
  border: 1px solid ${themeCssVariables.color.transparent.iris6};
  border-radius: 999px;
  color: ${themeCssVariables.color.iris11};
  font-size: 11px;
  font-weight: 600;
  margin-left: 8px;
  padding: 1px 8px;
`;

export const MetaLeadFormsPage = () => {
  const { t } = useLingui();
  const { openDialer, canUsePhone } = useOpenDialer();
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('form') ?? '';
  const setSelectedId = (formId: string) => setSearchParams({ form: formId });
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [importExisting, setImportExisting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const formsQuery = useQuery<{
    metaLeadForms: MetaLeadForm[];
    metaLeadFormActivity: MetaLeadFormActivity[];
  }>(GET_META_LEAD_FORMS, { pollInterval: 15000 });
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
  const [markLeadsRead, markReadState] = useMutation(
    MARK_META_SHEET_LEADS_READ,
  );
  const [syncForm, syncState] = useMutation(SYNC_META_LEAD_FORM);
  const [setActive, activeState] = useMutation(SET_META_LEAD_FORM_ACTIVE);
  const busy =
    createState.loading ||
    syncState.loading ||
    activeState.loading ||
    markReadState.loading;
  const leads = leadsQuery.data?.metaSheetLeads ?? [];
  const activeLead = leads.find((lead) => lead.id === activeLeadId);
  const activity = formsQuery.data?.metaLeadFormActivity ?? [];
  const selectedActivity = activity.find(
    (item) => item.formId === selected?.id,
  );
  const displayedUnreadIds = leads
    .filter((lead) => lead.isUnread)
    .map((lead) => lead.id);

  const perform = async (operation: () => Promise<unknown>) => {
    setErrorMessage('');
    setSuccessMessage('');
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
              Each form connects to one Google Sheet tab. Switch forms below to
              see their leads here. Red badges show leads you have not marked as
              read.
            </Trans>
          </p>
          <StyledToolbar>
            <Button
              title={t`Add lead form`}
              variant="primary"
              onClick={() => setShowCreate(true)}
            />
            <Link to={getSettingsPath(SettingsPath.SettersTelegram)}>
              <Trans>Setters and Telegram</Trans>
            </Link>
          </StyledToolbar>
          {forms.length > 0 && (
            <MetaLeadFormTabs
              forms={forms}
              activity={activity}
              selectedId={selected?.id}
              onSelect={(formId) => {
                setActiveLeadId(null);
                setSelectedId(formId);
                setOffset(0);
              }}
            />
          )}
          {!formsQuery.loading &&
            !formsQuery.error &&
            forms.length === 0 &&
            !showCreate && (
              <StyledEmptyState>
                <h2>
                  <Trans>Your Meta form leads will appear here</Trans>
                </h2>
                <p>
                  <Trans>
                    Add a form and connect the Google Sheet tab that receives
                    its leads. Each connected form gets its own tab, lead list,
                    and new-lead badge.
                  </Trans>
                </p>
                <Button
                  title={t`Connect your first form`}
                  variant="primary"
                  onClick={() => setShowCreate(true)}
                />
              </StyledEmptyState>
            )}
          {((!showCreate && errorMessage) ||
            formsQuery.error ||
            leadsQuery.error) && (
            <StyledError role="alert">
              {(!showCreate && errorMessage) ||
                formsQuery.error?.message ||
                leadsQuery.error?.message}
            </StyledError>
          )}
          {successMessage && <p role="status">{successMessage}</p>}
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
                  if (result.error) throw result.error;
                  const createdId = result.data?.createMetaLeadForm?.id;
                  if (!createdId)
                    throw new Error(
                      t`The connection was not confirmed. Check the form list before retrying.`,
                    );
                  setSelectedId(createdId);
                  setSuccessMessage(
                    t`Form connected. Its leads will appear after the next sync.`,
                  );
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
                <SettingsTextInput
                  instanceId="meta-lead-form-name"
                  required
                  maxLength={200}
                  value={name}
                  onChange={setName}
                />
              </label>
              <label>
                <Trans>Google Sheet link</Trans>
                <SettingsTextInput
                  instanceId="meta-lead-form-sheet-url"
                  required
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
                  value={sheetUrl}
                  onChange={setSheetUrl}
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
              {errorMessage && (
                <StyledError role="alert">{errorMessage}</StyledError>
              )}
              {createState.loading && (
                <p role="status">
                  <Trans>Checking sheet access and saving your form…</Trans>
                </p>
              )}
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
            <section
              role="tabpanel"
              id="meta-form-leads-panel"
              aria-labelledby={`meta-form-tab-${selected.id}`}
            >
              <p>
                <Trans>
                  Click a lead to update their status or book a meeting. Click a
                  phone number to open the CRM dialer. Imported leads are
                  already saved in People.
                </Trans>
              </p>
              <StyledToolbar>
                <h2>{selected.name}</h2>
                <span>{t`${selectedActivity?.totalCount ?? 0} leads`}</span>
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
              <StyledToolbar>
                <span
                  role="status"
                  aria-live="polite"
                >{t`${selectedActivity?.unreadCount ?? 0} unread leads`}</span>
                <Button
                  title={t`Mark displayed leads as read`}
                  disabled={
                    busy ||
                    leadsQuery.loading ||
                    displayedUnreadIds.length === 0
                  }
                  onClick={() =>
                    void perform(async () => {
                      await markLeadsRead({
                        variables: {
                          formId: selected.id,
                          leadIds: displayedUnreadIds,
                        },
                      });
                      await Promise.all([
                        formsQuery.refetch(),
                        leadsQuery.refetch(),
                      ]);
                    })
                  }
                />
              </StyledToolbar>
              {selected.lastError && (
                <StyledError role="alert">{selected.lastError}</StyledError>
              )}
              {activeLead && (
                <MetaLeadDetailPanel
                  key={activeLead.id}
                  lead={activeLead}
                  onClose={() => setActiveLeadId(null)}
                />
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
                      <StyledLeadRow key={lead.id} data-unread={lead.isUnread}>
                        <td>
                          <button
                            type="button"
                            onClick={() => setActiveLeadId(lead.id)}
                            aria-expanded={activeLeadId === lead.id}
                          >
                            {lead.name || lead.leadId}
                          </button>
                          {lead.isUnread && (
                            <StyledNewLabel>
                              <Trans>New</Trans>
                            </StyledNewLabel>
                          )}
                          {lead.personId && (
                            <div>
                              <Link
                                to={getAppPath(AppPath.RecordShowPage, {
                                  objectNameSingular: 'person',
                                  objectRecordId: lead.personId ?? '',
                                })}
                              >
                                <Trans>Saved in People</Trans>
                              </Link>
                            </div>
                          )}
                        </td>
                        <td>{lead.email}</td>
                        <td>
                          {lead.phone && canUsePhone ? (
                            <button
                              type="button"
                              onClick={() =>
                                openDialer({
                                  phoneNumber: lead.phone,
                                  personId: lead.personId,
                                })
                              }
                              aria-label={t`Call ${lead.phone}`}
                            >
                              {lead.phone}
                            </button>
                          ) : (
                            lead.phone || '—'
                          )}
                        </td>
                        <td>{new Date(lead.createdAt).toLocaleString()}</td>
                        <td>
                          <Button
                            title={t`Manage lead`}
                            onClick={() => setActiveLeadId(lead.id)}
                          />
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
                      </StyledLeadRow>
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
            </section>
          )}
        </StyledContent>
      </PageBody>
    </PageContainer>
  );
};
