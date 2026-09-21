import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { MetaLeadFormsPage } from '@/meta-lead-forms/MetaLeadFormsPage';
import { useGoToHotkeys } from '@/ui/utilities/hotkey/hooks/useGoToHotkeys';

jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: { metaLeadForms: [], metaLeadFormActivity: [] },
    loading: false,
  }),
  useMutation: () => [jest.fn(), { loading: false }],
}));

const PageWithNavigationShortcut = () => {
  useGoToHotkeys({ key: 'n', location: '/notes' });
  const location = useLocation();
  return (
    <>
      <output aria-label="Current route">{location.pathname}</output>
      <MetaLeadFormsPage />
    </>
  );
};

describe('Meta lead form connection typing', () => {
  it('keeps navigation shortcuts inactive in both text fields and restores them after blur', async () => {
    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/meta-lead-forms']}>
          <I18nProvider i18n={i18n}>
            <ThemeProvider colorScheme="light">
              <PageWithNavigationShortcut />
            </ThemeProvider>
          </I18nProvider>
        </MemoryRouter>
      </Provider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add lead form/ }));
    const formName = screen.getByLabelText('Form name');
    await user.type(formName, 'Campaign gn September');
    expect(formName).toHaveValue('Campaign gn September');
    expect(screen.getByLabelText('Current route')).toHaveTextContent(
      '/meta-lead-forms',
    );
    const sheetLink = screen.getByLabelText('Google Sheet link');
    await user.type(
      sheetLink,
      'https://docs.google.com/spreadsheets/d/gn/edit#gid=0',
    );
    expect(sheetLink).toHaveValue(
      'https://docs.google.com/spreadsheets/d/gn/edit#gid=0',
    );
    expect(screen.getByLabelText('Current route')).toHaveTextContent(
      '/meta-lead-forms',
    );
    await user.click(screen.getByRole('button', { name: /Cancel/ }));
    await user.keyboard('gn');
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/notes');
  });
});
