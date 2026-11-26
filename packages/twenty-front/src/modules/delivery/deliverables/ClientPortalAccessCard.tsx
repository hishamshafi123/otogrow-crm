import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  GET_DELIVERY_CLIENT_PORTAL_ACCESS,
  MANAGE_DELIVERY_CLIENT_PORTAL_ACCESS,
} from '@/delivery/deliverables/delivery-deliverables.queries';
import { type ClientPortalAccessSummary } from '@/delivery/deliverables/delivery-deliverables.types';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const StyledCodeBox = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledCodeValue = styled.code`
  color: ${themeCssVariables.font.color.primary};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: 0.08em;
`;

const StyledSettingsGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};

  input,
  textarea {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    font-size: ${themeCssVariables.font.size.sm};
    padding: ${themeCssVariables.spacing[2]};
  }
`;

const StyledInlineForm = styled.form`
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledNotice = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

type ClientPortalAccessCardProps = {
  companyId: string;
  companyName?: string;
};

// oxlint-disable-next-line twenty/no-hardcoded-colors -- Native <input type="color"> requires a #rrggbb hex string default.
const DEFAULT_BRAND_ACCENT_HEX = '#6366f1';

export const ClientPortalAccessCard = ({
  companyId,
  companyName,
}: ClientPortalAccessCardProps) => {
  const { t } = useLingui();
  const [revealed, setRevealed] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slugDraft, setSlugDraft] = useState('');
  const [welcomeDraft, setWelcomeDraft] = useState('');
  const [accentDraft, setAccentDraft] = useState(DEFAULT_BRAND_ACCENT_HEX);
  const [showDriveLinksDraft, setShowDriveLinksDraft] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const query = useQuery<{
    deliveryClientPortalAccess: ClientPortalAccessSummary | null;
  }>(GET_DELIVERY_CLIENT_PORTAL_ACCESS, {
    variables: { companyId },
    fetchPolicy: 'network-only',
  });

  const [manage, { loading: saving }] = useMutation<{
    manageDeliveryClientPortalAccess: ClientPortalAccessSummary;
  }>(MANAGE_DELIVERY_CLIENT_PORTAL_ACCESS);

  const access = query.data?.deliveryClientPortalAccess ?? null;
  const fullPortalUrl = access
    ? `${window.location.origin}${access.portalPath}`
    : '';

  const runAction = async (
    input: Record<string, unknown>,
    successText: string,
  ): Promise<boolean> => {
    setErrorMessage('');
    setFeedback('');
    try {
      await manage({ variables: { input } });
      await query.refetch();
      setFeedback(successText);
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t`Could not update portal access.`,
      );
      return false;
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(label);
    } catch {
      setErrorMessage(t`Clipboard access was blocked by your browser.`);
    }
  };

  const openSettings = () => {
    if (!access) return;
    setSlugDraft(access.slug);
    setWelcomeDraft(access.welcomeNote);
    setAccentDraft(access.brandAccentColor ?? DEFAULT_BRAND_ACCENT_HEX);
    setShowDriveLinksDraft(access.showDriveLinks);
    setSettingsOpen((current) => !current);
  };

  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <div>
            <h3>
              <Trans>Client Dashboard &amp; Access Code</Trans>
            </h3>
            <StyledNotice>
              <Trans>
                Give this client one private dashboard URL and access code. View,
                copy, regenerate, or set a custom code anytime if they forget it.
              </Trans>
            </StyledNotice>
          </div>
          {access && (
            <StyledDeliveryBadge>
              {access.isActive
                ? t`Active`
                : access.isExpired && !access.revokedAt
                  ? t`Expired`
                  : t`Revoked`}
            </StyledDeliveryBadge>
          )}
        </StyledDeliveryRow>

        {query.loading && !access && (
          <StyledNotice>
            <Trans>Loading client access code…</Trans>
          </StyledNotice>
        )}

        {!query.loading && !access && (
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              disabled={saving}
              onClick={() =>
                void runAction(
                  {
                    action: 'generate',
                    companyId,
                    ...(companyName ? { companyName } : {}),
                  },
                  t`Access code generated and ready to share.`,
                )
              }
            >
              <Trans>Generate client access code</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        )}

        {access && (
          <>
            <StyledCodeBox>
              <div>
                <StyledNotice>
                  <Trans>Client access code</Trans>
                </StyledNotice>
                <StyledCodeValue>
                  {revealed && access.activeCode
                    ? access.activeCode
                    : access.codeHint}
                </StyledCodeValue>
              </div>
              <StyledDeliveryRow>
                {access.activeCode && (
                  <>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => setRevealed((current) => !current)}
                    >
                      {revealed ? t`Hide code` : t`Reveal code`}
                    </StyledDeliveryButton>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        void copyText(
                          access.activeCode ?? '',
                          t`Access code copied.`,
                        )
                      }
                    >
                      <Trans>Copy code</Trans>
                    </StyledDeliveryButton>
                  </>
                )}
                <StyledDeliveryButton
                  type="button"
                  onClick={() =>
                    void copyText(fullPortalUrl, t`Dashboard URL copied.`)
                  }
                >
                  <Trans>Copy dashboard link</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            </StyledCodeBox>

            <StyledNotice>
              {t`Dashboard URL`}: <code>{fullPortalUrl}</code>
              {access.lastAccessedAt
                ? ` · ${t`Last opened`} ${new Date(access.lastAccessedAt).toLocaleString()}`
                : ` · ${t`Not opened by client yet`}`}
            </StyledNotice>

            <StyledDeliveryRow>
              <StyledDeliveryButton
                type="button"
                disabled={saving}
                onClick={() =>
                  void runAction(
                    {
                      action: 'generate',
                      companyId,
                      ...(companyName ? { companyName } : {}),
                    },
                    t`New access code generated. Previous code is now invalid.`,
                  )
                }
              >
                <Trans>Generate new code</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton
                type="button"
                onClick={() => {
                  setCustomOpen((current) => !current);
                  setCustomCode('');
                }}
              >
                <Trans>Set custom code</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton type="button" onClick={openSettings}>
                <Trans>Portal settings</Trans>
              </StyledDeliveryButton>
              {access.isActive ? (
                <StyledDeliveryButton
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void runAction(
                      { action: 'revoke', companyId },
                      t`Client access revoked.`,
                    )
                  }
                >
                  <Trans>Revoke access</Trans>
                </StyledDeliveryButton>
              ) : (
                <StyledDeliveryButton
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void runAction(
                      { action: 'restore', companyId },
                      t`Client access restored.`,
                    )
                  }
                >
                  <Trans>Restore access</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>

            {customOpen && (
              <StyledInlineForm
                onSubmit={(event) => {
                  event.preventDefault();
                  if (customCode.trim().length < 6) {
                    setErrorMessage(
                      t`Custom access code must be at least 6 characters.`,
                    );
                    return;
                  }
                  void runAction(
                    {
                      action: 'setCustom',
                      companyId,
                      ...(companyName ? { companyName } : {}),
                      code: customCode.trim(),
                    },
                    t`Custom access code saved.`,
                  ).then((ok) => {
                    if (!ok) return;
                    setCustomOpen(false);
                    setCustomCode('');
                    setRevealed(true);
                  });
                }}
              >
                <StyledField>
                  <span>
                    <Trans>Custom access code (6–32 chars)</Trans>
                  </span>
                  <input
                    type="text"
                    value={customCode}
                    placeholder="BRAND-2026"
                    minLength={6}
                    maxLength={32}
                    onChange={(event) => setCustomCode(event.target.value)}
                  />
                </StyledField>
                <StyledDeliveryButton type="submit" disabled={saving}>
                  <Trans>Save custom code</Trans>
                </StyledDeliveryButton>
              </StyledInlineForm>
            )}

            {settingsOpen && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction(
                    {
                      action: 'updateSettings',
                      companyId,
                      slug: slugDraft.trim() || undefined,
                      welcomeNote: welcomeDraft,
                      brandAccentColor: /^#[0-9a-fA-F]{6}$/.test(accentDraft)
                        ? accentDraft
                        : null,
                      showDriveLinks: showDriveLinksDraft,
                    },
                    t`Client dashboard settings saved.`,
                  ).then((ok) => {
                    if (ok) setSettingsOpen(false);
                  });
                }}
              >
                <StyledDeliveryStack>
                  <StyledSettingsGrid>
                    <StyledField>
                      <span>
                        <Trans>URL slug (/client/…)</Trans>
                      </span>
                      <input
                        type="text"
                        value={slugDraft}
                        onChange={(event) => setSlugDraft(event.target.value)}
                      />
                    </StyledField>
                    <StyledField>
                      <span>
                        <Trans>Brand accent color</Trans>
                      </span>
                      <input
                        type="color"
                        value={accentDraft}
                        onChange={(event) => setAccentDraft(event.target.value)}
                      />
                    </StyledField>
                  </StyledSettingsGrid>
                  <StyledField>
                    <span>
                      <Trans>Welcome note on client dashboard</Trans>
                    </span>
                    <textarea
                      rows={2}
                      value={welcomeDraft}
                      onChange={(event) => setWelcomeDraft(event.target.value)}
                    />
                  </StyledField>
                  <StyledDeliveryRow>
                    <label>
                      <input
                        type="checkbox"
                        checked={showDriveLinksDraft}
                        onChange={(event) =>
                          setShowDriveLinksDraft(event.target.checked)
                        }
                      />{' '}
                      <Trans>Show Google Drive folder &amp; file links</Trans>
                    </label>
                    <StyledDeliveryButton type="submit" disabled={saving}>
                      <Trans>Save settings</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                </StyledDeliveryStack>
              </form>
            )}
          </>
        )}

        {feedback && <StyledNotice role="status">{feedback}</StyledNotice>}
        {errorMessage && <p role="alert">{errorMessage}</p>}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
