import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { SettingsLeadFormsTable } from '@/settings/forms/components/SettingsLeadFormsTable';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';

const StyledButtonContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-top: ${themeCssVariables.spacing[2]};
`;

export const SettingsLeadForms = () => {
  const { t } = useLingui();

  return (
    <SettingsPageLayout
      title={t`Lead forms`}
      links={[
        {
          children: <Trans>Workspace</Trans>,
          href: getSettingsPath(SettingsPath.General),
        },
        { children: <Trans>Lead forms</Trans> },
      ]}
    >
      <SettingsPageContainer>
        <Section>
          <H2Title
            title={t`Lead forms`}
            description={t`Create embeddable forms to capture leads from your website.`}
          />
          <SettingsLeadFormsTable />
          <StyledButtonContainer>
            <Button
              Icon={IconPlus}
              title={t`New form`}
              size="small"
              variant="secondary"
              to={getSettingsPath(SettingsPath.NewLeadForm)}
            />
          </StyledButtonContainer>
        </Section>
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
