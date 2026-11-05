import { useState } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ContentPlanFields,
  ContentAccountFields,
} from '@/delivery/content/ContentSetupFields';
import { type DeliveryContentPlanSaveInput } from '~/generated-metadata/graphql';
import {
  contentChoices,
  CONTENT_REQUEST_ID,
  CONTENT_PLAN_ID,
} from '@/delivery/content/__tests__/content.fixtures';

beforeEach(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));
it('reveals and focuses an incomplete service inside the collapsed optional context without discarding the plan', async () => {
  const Form = () => {
    const [plan, setPlan] = useState<DeliveryContentPlanSaveInput>({
      id: CONTENT_PLAN_ID,
      requestId: CONTENT_REQUEST_ID,
      revision: 0,
      projectId: contentChoices.project.id,
      projectRevision: 1,
      expectedCompanyId: null,
      title: 'Keep this idea',
      purpose: 'Organic awareness',
      engagementId: CONTENT_PLAN_ID,
      service: null,
    });
    return (
      <form>
        <ContentPlanFields
          value={plan}
          update={setPlan}
          choices={{
            ...contentChoices,
            engagements: [
              {
                id: CONTENT_PLAN_ID,
                name: 'Brand retainer',
                services: ['CONTENT'],
              },
            ],
          }}
        />
      </form>
    );
  };
  render(
    <I18nProvider i18n={i18n}>
      <Form />
    </I18nProvider>,
  );
  expect(
    screen.getByText('Optional client service context').closest('details'),
  ).not.toHaveAttribute('open');
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Choose a current service for this engagement.',
    }),
  );
  expect(screen.getByRole('combobox', { name: 'Service' })).toHaveFocus();
  expect(screen.getByRole('textbox', { name: 'Plan title' })).toHaveValue(
    'Keep this idea',
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Service' }),
    'CONTENT',
  );
  expect(
    screen.queryByRole('button', {
      name: 'Choose a current service for this engagement.',
    }),
  ).not.toBeInTheDocument();
});
it('keeps existing account identity fixed while allowing a display name change', () => {
  render(
    <I18nProvider i18n={i18n}>
      <ContentAccountFields
        value={{
          ...contentChoices.accounts[0],
          requestId: CONTENT_REQUEST_ID,
          projectRevision: 1,
          expectedCompanyId: null,
        }}
        update={jest.fn()}
        editing
      />
    </I18nProvider>,
  );
  expect(screen.getByRole('combobox', { name: 'Channel' })).toBeDisabled();
  expect(
    screen.getByRole('textbox', { name: 'Account handle' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('textbox', { name: 'Public profile or page link' }),
  ).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Account name' })).toBeEnabled();
});
