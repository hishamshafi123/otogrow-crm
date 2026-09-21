import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useOpenDialer } from '@/calling/hooks/useOpenDialer';
import { MeetingBookingPanel } from '@/meeting-booking/components/MeetingBookingPanel';
import { type MetaSheetLead } from '@/meta-lead-forms/metaLeadFormsGraphql';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { Select } from '@/ui/input/components/Select';

const StyledPanel = styled.section`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  display: grid;
  gap: 20px;
  margin: 20px 0;
  padding: 24px;
`;
const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  h2 {
    margin: 0;
  }
`;
const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`;
const StyledColumns = styled.div`
  display: grid;
  gap: 24px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
`;
const StyledError = styled.p`
  color: ${themeCssVariables.color.red};
`;

type MetaLeadDetailPanelProps = { lead: MetaSheetLead; onClose: () => void };

export const MetaLeadDetailPanel = ({
  lead,
  onClose,
}: MetaLeadDetailPanelProps) => {
  const { t } = useLingui();
  const panelReference = useRef<HTMLElement>(null);
  useEffect(() => {
    panelReference.current?.focus();
  }, []);
  const { openDialer } = useOpenDialer();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'person',
  });
  const statusField = objectMetadataItem.fields.find(
    (field) => field.name === 'leadStatus',
  );
  const { record, loading, error, refetch } = useFindOneRecord({
    objectNameSingular: 'person',
    objectRecordId: lead.personId ?? undefined,
    skip: !lead.personId,
    recordGqlFields: { id: true, leadStatus: true, emails: true, phones: true },
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [showBooking, setShowBooking] = useState(false);

  const updateStatus = async (value: string) => {
    if (!lead.personId) return;
    setSaving(true);
    setActionError('');
    setMessage('');
    try {
      await updateOneRecord({
        objectNameSingular: 'person',
        idToUpdate: lead.personId,
        updateOneRecordInput: { leadStatus: value || null },
      });
      await refetch();
      setMessage(t`Lead status updated in People.`);
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : t`Could not update lead status.`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <StyledPanel
      ref={panelReference}
      tabIndex={-1}
      aria-label={t`Lead details`}
    >
      <StyledHeader>
        <div>
          <h2>{lead.name || lead.leadId}</h2>
          <p>{t`Received ${new Date(lead.createdAt).toLocaleString()}`}</p>
        </div>
        <Button title={t`Close details`} onClick={onClose} />
      </StyledHeader>
      <StyledActions>
        {lead.phone && (
          <Button
            title={t`Call ${lead.phone}`}
            variant="primary"
            onClick={() =>
              openDialer({ phoneNumber: lead.phone, personId: lead.personId })
            }
          />
        )}
        {lead.email && <a href={`mailto:${lead.email}`}>{lead.email}</a>}
        {record && (
          <Link to={`/objects/people/${lead.personId}`}>
            <Trans>View in People</Trans>
          </Link>
        )}
        <Button
          title={showBooking ? t`Hide meeting planner` : t`Book a meeting`}
          disabled={!record || loading}
          onClick={() => setShowBooking(!showBooking)}
        />
      </StyledActions>
      <StyledColumns>
        <div>
          <h3>
            <Trans>CRM record</Trans>
          </h3>
          <p>
            <Trans>
              Imported leads are automatically saved to People. Status changes
              here update that same record.
            </Trans>
          </p>
          {loading ? (
            <p role="status">
              <Trans>Loading CRM record…</Trans>
            </p>
          ) : error ? (
            <StyledError role="alert">{error.message}</StyledError>
          ) : !record ? (
            <p>
              <Trans>
                The linked CRM record is unavailable. Check People before
                creating another contact.
              </Trans>
            </p>
          ) : (
            <Select
              dropdownId={`meta-lead-status-${lead.id}`}
              label={t`Lead status`}
              value={
                typeof record.leadStatus === 'string' ? record.leadStatus : ''
              }
              disabled={saving}
              options={[
                { value: '', label: t`No status` },
                ...(statusField?.options ?? []).map((option) => ({
                  value: option.value,
                  label: option.label,
                })),
              ]}
              onChange={(value) => void updateStatus(value)}
            />
          )}
          {message && <p role="status">{message}</p>}
          {actionError && <StyledError role="alert">{actionError}</StyledError>}
        </div>
        <div>
          <h3>
            <Trans>Form answers</Trans>
          </h3>
          <details>
            <summary>{t`View ${lead.answers.length} answers`}</summary>
            <dl>
              {lead.answers.map((answer, index) => (
                <div key={`${answer.label}-${index}`}>
                  <dt>{answer.label}</dt>
                  <dd>{answer.value || '—'}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </StyledColumns>
      {showBooking && record && lead.personId && (
        <MeetingBookingPanel
          personId={lead.personId}
          onBooked={() => {
            void refetch();
          }}
        />
      )}
    </StyledPanel>
  );
};
