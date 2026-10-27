import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { PhoneDialer } from '@/calling/components/PhoneDialer';
const mockInitialize = jest.fn();
const mockSetAccess = jest.fn();
let mockPermission = { canUsePhone: false, scopeKey: null as string | null };
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => mockPermission,
}));
jest.mock('@/calling/services/twilio-device-manager', () => ({
  initializeCallingDevice: () => mockInitialize(),
  setCallingAccess: (scope: string | null) => mockSetAccess(scope),
  runVoicePreflight: jest.fn(),
  startOutgoingCall: jest.fn(),
}));
jest.mock('@/calling/components/RecentCallsList', () => ({
  RecentCallsList: () => null,
}));
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockPermission = { canUsePhone: false, scopeKey: null };
  mockInitialize.mockClear();
  mockSetAccess.mockClear();
});
it('hides the phone until access is granted and tears down on revocation, workspace switch and unmount', () => {
  const store = createStore();
  const content = () => (
    <Provider store={store}>
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <PhoneDialer />
        </ThemeProvider>
      </I18nProvider>
    </Provider>
  );
  const view = render(content());
  expect(
    screen.queryByRole('button', { name: 'Open phone dialer' }),
  ).not.toBeInTheDocument();
  expect(mockInitialize).not.toHaveBeenCalled();
  mockPermission = { canUsePhone: true, scopeKey: 'workspace:member' };
  view.rerender(content());
  expect(
    screen.getByRole('button', { name: 'Open phone dialer' }),
  ).toBeInTheDocument();
  expect(mockInitialize).toHaveBeenCalledTimes(1);
  expect(mockSetAccess).toHaveBeenLastCalledWith('workspace:member');
  mockPermission = { canUsePhone: true, scopeKey: 'other-workspace:member' };
  view.rerender(content());
  expect(mockSetAccess.mock.calls.slice(-2)).toEqual([
    [null],
    ['other-workspace:member'],
  ]);
  mockPermission = { canUsePhone: false, scopeKey: null };
  view.rerender(content());
  expect(
    screen.queryByRole('button', { name: 'Open phone dialer' }),
  ).not.toBeInTheDocument();
  expect(mockSetAccess).toHaveBeenLastCalledWith(null);
  mockPermission = { canUsePhone: true, scopeKey: 'workspace:member' };
  view.rerender(content());
  view.unmount();
  expect(mockSetAccess).toHaveBeenLastCalledWith(null);
});
