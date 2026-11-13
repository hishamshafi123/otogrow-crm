import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { MetaLeadFormsPage } from '@/meta-lead-forms/MetaLeadFormsPage';
import { useGoToHotkeys } from '@/ui/utilities/hotkey/hooks/useGoToHotkeys';

const mockCreateForm = jest.fn();

jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: { metaLeadForms: [], metaLeadFormActivity: [] },
    loading: false,
    refetch: jest.fn(),
  }),
  useMutation: () => [mockCreateForm, { loading: false }],
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
  beforeEach(() => mockCreateForm.mockReset());
  it.each([
    [new Error('Cannot read the sheet'), 'Cannot read the sheet'],
    [{}, 'The connection was not confirmed'],
  ])(
    'keeps the form open and displays connection failures beside submit',
    async (response, message) => {
      if (response instanceof Error)
        mockCreateForm.mockRejectedValueOnce(response);
      else mockCreateForm.mockResolvedValueOnce(response);
      render(
        <Provider store={createStore()}>
          <MemoryRouter>
            <I18nProvider i18n={i18n}>
              <ThemeProvider colorScheme="light">
                <MetaLeadFormsPage />
              </ThemeProvider>
            </I18nProvider>
          </MemoryRouter>
        </Provider>,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Add lead form/ }));
      await user.type(screen.getByLabelText('Form name'), 'Campaign');
      await user.type(
        screen.getByLabelText('Google Sheet link'),
        'https://docs.google.com/spreadsheets/d/example/edit#gid=0',
      );
      const keyFile = new File(['{}'], 'test.json', {
        type: 'application/json',
      });
      Object.defineProperty(keyFile, 'text', { value: async () => '{}' });
      await user.upload(
        screen.getByLabelText('Service account JSON key'),
        keyFile,
      );
      const submitButton = screen.getByRole('button', {
        name: /Connect sheet/,
      });
      expect(submitButton).toBeEnabled();
      // JSDOM does not update required-file validity after userEvent.upload.
      fireEvent.submit(submitButton.closest('form')!);
      expect(mockCreateForm).toHaveBeenCalled();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        message as string,
      );
      expect(screen.getByLabelText('Form name')).toHaveValue('Campaign');
      expect(
        screen.getByRole('button', { name: /Connect sheet/ }),
      ).toBeEnabled();
    },
  );

  it('keeps legacy letter navigation inactive in text fields and after blur', async () => {
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
    expect(screen.getByLabelText('Current route')).toHaveTextContent(
      '/meta-lead-forms',
    );
  });
});
