import { useIsMobile } from 'twenty-ui/utilities';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  companyProfileValue,
  useCompanyProfile,
} from '@/delivery/client-workspace/useCompanyProfile';

const StyledProfile = styled.section`
  background:
    radial-gradient(
      ellipse 55% 45% at 100% 0%,
      ${themeCssVariables.color.transparent.iris2} 0%,
      transparent 72%
    ),
    ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 18px;
  box-shadow:
    0 1px 2px ${themeCssVariables.color.transparent.gray2},
    0 10px 30px -20px ${themeCssVariables.color.transparent.gray5},
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
  min-width: 0;
  padding: 24px 26px;
  @media (max-width: 600px) {
    padding: 16px;
  }
`;
const StyledHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  padding-bottom: 14px;
  &:last-child {
    border-bottom: 0;
    border-top: 1px solid ${themeCssVariables.border.color.light};
    padding-bottom: 0;
    padding-top: 14px;
  }
`;
const StyledGrid = styled.div`
  display: grid;
  gap: 18px 28px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
const StyledField = styled.div`
  min-width: 0;
  overflow-wrap: anywhere;
  small {
    color: ${themeCssVariables.font.color.tertiary};
    display: block;
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  label {
    color: ${themeCssVariables.font.color.secondary};
    display: flex;
    flex-direction: column;
    font-size: 13px;
    font-weight: 500;
    gap: 6px;
  }
  input,
  textarea {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 10px;
    color: ${themeCssVariables.font.color.primary};
    padding: 8px 12px;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease;
    width: 100%;
  }
  input:focus,
  textarea:focus {
    border-color: ${themeCssVariables.color.iris8};
    box-shadow: 0 0 0 3px ${themeCssVariables.color.transparent.iris3};
    outline: none;
  }
  p {
    color: ${themeCssVariables.font.color.primary};
    margin-top: 6px;
    white-space: pre-wrap;
  }
`;

type CompanyProfileProps = {
  companyId: string;
  onSaved?: () => void | Promise<unknown>;
};

export const CompanyProfile = ({ companyId, onSaved }: CompanyProfileProps) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'company',
  });
  const permissions = useObjectPermissionsForObject(objectMetadataItem.id);
  // Recreate the private query and draft boundary whenever native authority changes.
  const authorityKey = JSON.stringify([
    companyId,
    permissions,
    objectMetadataItem.readableFields.map((field) => [
      field.id,
      field.isActive,
      field.isUIEditable,
    ]),
  ]);
  return (
    <CompanyProfileContent
      key={authorityKey}
      companyId={companyId}
      onSaved={onSaved}
    />
  );
};

type CompanyProfileContentProps = CompanyProfileProps;

const CompanyProfileContent = ({
  companyId,
  onSaved,
}: CompanyProfileContentProps) => {
  const { t } = useLingui();
  const profile = useCompanyProfile(companyId, onSaved);
  const { requestAction } = useDeliveryDraftGuard();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const isMobile = useIsMobile();
  if (!profile.canRead)
    return (
      <p>
        <Trans>You do not have access to this company profile.</Trans>
      </p>
    );
  if (profile.loading && !profile.record)
    return (
      <p role="status">
        <Trans>Loading company profile…</Trans>
      </p>
    );
  if (profile.error)
    return (
      <StyledDeliveryStack>
        <p role="alert">
          <Trans>
            Company profile is unavailable. Your unsaved edits are kept.
          </Trans>
        </p>
        <StyledDeliveryButton
          onClick={() => void profile.refetch().catch(() => undefined)}
        >
          <Trans>Retry</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    );
  if (!profile.record)
    return (
      <p>
        <Trans>This company profile is unavailable.</Trans>
      </p>
    );
  const renderField = (path: string, label: string) => {
    const name = path.split('.')[0];
    if (!profile.fields.some((field) => field.name === name)) return null;
    const value =
      profile.draft?.[path] ??
      companyProfileValue(
        profile.draft ? profile.baseline : (profile.record ?? {}),
        path,
      );
    const editable = profile.draft !== null && profile.canEditField(name);
    return (
      <StyledField key={path}>
        {editable ? (
          <label>
            {label}
            {name === 'description' ? (
              <textarea
                value={value}
                disabled={profile.saving}
                onChange={(event) =>
                  profile.setDraft({
                    ...profile.draft,
                    [path]: event.target.value,
                  })
                }
              />
            ) : (
              <input
                value={value}
                disabled={profile.saving}
                onChange={(event) =>
                  profile.setDraft({
                    ...profile.draft,
                    [path]: event.target.value,
                  })
                }
              />
            )}
          </label>
        ) : (
          <>
            <small>{label}</small>
            <p>
              {['domainName', 'linkedinLink'].includes(name) &&
              /^https?:\/\//i.test(value) ? (
                <a href={value} target="_blank" rel="noopener noreferrer">
                  {value}
                </a>
              ) : (
                value || t`Not added`
              )}
            </p>
          </>
        )}
      </StyledField>
    );
  };
  return (
    <StyledProfile aria-label={t`Company profile`}>
      <StyledDeliveryStack>
        <StyledHeader>
          <div>
            <h2>
              <Trans>Company profile</Trans>
            </h2>
            <small>
              <Trans>Business details shared across your workspace.</Trans>
            </small>
          </div>
          {profile.draft === null &&
            profile.fields.some((field) =>
              profile.canEditField(field.name),
            ) && (
              <StyledDeliveryButton onClick={profile.beginEdit}>
                <Trans>Edit profile</Trans>
              </StyledDeliveryButton>
            )}
        </StyledHeader>
        <StyledGrid>
          {renderField('name', t`Company name`)}
          {renderField('domainName.primaryLinkUrl', t`Website`)}
          {renderField('linkedinLink.primaryLinkUrl', t`LinkedIn`)}
          {renderField('description', t`Description`)}
        </StyledGrid>
        {profile.fields.some((field) => field.name === 'address') && (
          <>
            <h3>
              <Trans>Business address</Trans>
            </h3>
            <StyledGrid>
              {renderField('address.addressStreet1', t`Street address`)}
              {renderField(
                'address.addressStreet2',
                t`Apartment, suite or unit`,
              )}
              {renderField('address.addressCity', t`City`)}
              {renderField('address.addressState', t`State or region`)}
              {renderField('address.addressPostcode', t`Postal code`)}
              {renderField('address.addressCountry', t`Country`)}
            </StyledGrid>
          </>
        )}
        <StyledHeader>
          <small>
            <Trans>
              Review additional business fields and custom company details.
            </Trans>
          </small>
          {isMobile ? (
            <a
              href={`/object/company/${companyId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Trans>More company details</Trans>{' '}
              <Trans>(opens in a new tab)</Trans>
            </a>
          ) : (
            <StyledDeliveryButton
              disabled={profile.saving}
              onClick={() =>
                requestAction(() =>
                  openRecordInSidePanel({
                    recordId: companyId,
                    objectNameSingular: 'company',
                  }),
                )
              }
            >
              <Trans>More company details</Trans>
            </StyledDeliveryButton>
          )}
        </StyledHeader>
        {profile.saveError && <p role="alert">{profile.saveError}</p>}
        {profile.message && <p role="status">{profile.message}</p>}
        {profile.draft !== null && (
          <StyledHeader>
            <small>
              {profile.dirty ? t`Unsaved changes` : t`No changes yet`}
            </small>
            <StyledHeader>
              <StyledDeliveryButton
                disabled={profile.saving}
                onClick={() => requestAction(profile.cancel)}
              >
                <Trans>Cancel</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton
                data-primary="true"
                disabled={!profile.dirty || profile.saving}
                onClick={() => void profile.save()}
              >
                {profile.saving ? t`Saving…` : t`Save profile`}
              </StyledDeliveryButton>
            </StyledHeader>
          </StyledHeader>
        )}
      </StyledDeliveryStack>
    </StyledProfile>
  );
};
