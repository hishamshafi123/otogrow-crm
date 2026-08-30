import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

import {
  type PortalAccessWithToken,
  usePortalAccess,
} from '@/page-layout/widgets/client-portal/hooks/usePortalAccess';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useTargetRecord } from '@/ui/layout/contexts/useTargetRecord';
import { t } from '@lingui/core/macro';
import { IconCopy, IconLink, IconRefresh, IconX } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  width: 100%;
`;

const StyledActionsRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledStatusBadge = styled.span<{ isActive: boolean }>`
  background-color: ${({ isActive }) =>
    isActive
      ? themeCssVariables.background.transparent.success
      : themeCssVariables.background.tertiary};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ isActive }) =>
    isActive
      ? themeCssVariables.color.turquoise
      : themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin-right: auto;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledHint = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledLinkRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledLinkInput = styled.input`
  background-color: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]};
`;

const buildPortalUrl = (token: string) =>
  `${window.location.origin}/portal/${token}`;

export const ClientPortalWidget = () => {
  const { t: translate } = useLingui();
  const targetRecord = useTargetRecord();
  const { portalAccess, isLoading, isMutating, generate, revoke, regenerate } =
    usePortalAccess({ companyId: targetRecord.id });
  // The raw token is only returned once by generate/regenerate; keep it in
  // state so the full URL can be shown (and copied) a single time.
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);

  const { enqueueSuccessSnackBar } = useSnackBar();

  const showOneTimeLink = (result: PortalAccessWithToken | null) => {
    if (isDefined(result)) {
      setOneTimeToken(result.token);
    }
  };

  const handleGenerate = async () => {
    showOneTimeLink(await generate());
  };

  const handleRevoke = async () => {
    if (
      window.confirm(
        t`Revoke this portal link? Anyone using it will lose access immediately.`,
      )
    ) {
      setOneTimeToken(null);
      await revoke();
    }
  };

  const handleRegenerate = async () => {
    if (
      window.confirm(
        t`Regenerate the portal link? The current link will stop working immediately.`,
      )
    ) {
      showOneTimeLink(await regenerate());
    }
  };

  const handleCopy = async () => {
    if (!isDefined(oneTimeToken)) {
      return;
    }

    await navigator.clipboard.writeText(buildPortalUrl(oneTimeToken));
    enqueueSuccessSnackBar({ message: t`Portal link copied to clipboard` });
  };

  if (isLoading) {
    return null;
  }

  return (
    <Section>
      <H2Title title={translate`Client portal`} />
      <StyledContainer>
        {!isDefined(portalAccess) ? (
          <>
            <StyledHint>
              {translate`Generate a read-only portal link to share this company's opportunities and quotes.`}
            </StyledHint>
            <StyledActionsRow>
              <Button
                Icon={IconLink}
                title={translate`Generate portal link`}
                variant="primary"
                disabled={isMutating}
                onClick={handleGenerate}
              />
            </StyledActionsRow>
          </>
        ) : (
          <>
            <StyledActionsRow>
              <StyledStatusBadge isActive={portalAccess.isActive}>
                {portalAccess.isActive ? translate`Active` : translate`Revoked`}
              </StyledStatusBadge>
              <Button
                Icon={IconRefresh}
                title={translate`Regenerate`}
                variant="secondary"
                disabled={isMutating}
                onClick={handleRegenerate}
              />
              {portalAccess.isActive && (
                <Button
                  Icon={IconX}
                  title={translate`Revoke`}
                  variant="secondary"
                  accent="danger"
                  disabled={isMutating}
                  onClick={handleRevoke}
                />
              )}
            </StyledActionsRow>
            <StyledHint>
              {translate`Created on ${new Date(portalAccess.createdAt).toLocaleDateString()}`}
            </StyledHint>
          </>
        )}
        {isDefined(oneTimeToken) && (
          <>
            <StyledLinkRow>
              <StyledLinkInput
                readOnly
                value={buildPortalUrl(oneTimeToken)}
                onFocus={(event) => event.target.select()}
              />
              <Button
                Icon={IconCopy}
                title={translate`Copy`}
                variant="secondary"
                onClick={handleCopy}
              />
            </StyledLinkRow>
            <StyledHint>
              {translate`This link is shown only once. Copy it now — it cannot be recovered later.`}
            </StyledHint>
          </>
        )}
      </StyledContainer>
    </Section>
  );
};
