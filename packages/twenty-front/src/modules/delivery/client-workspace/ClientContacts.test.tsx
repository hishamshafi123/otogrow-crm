import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientContacts } from '@/delivery/client-workspace/ClientContacts';

const COMPANY = '10000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = '10000000-0000-4000-8000-000000000002';
const mockOpen = jest.fn();
const mockQuery = jest.fn();
let mockMobile = false;
let mockAllowed = true;
let mockEmailAllowed = true;
jest.mock('twenty-ui/utilities', () => ({ useIsMobile: () => mockMobile }));
jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({ openRecordInSidePanel: mockOpen }),
}));
jest.mock('@/delivery/drafts/DeliveryDraftGuard', () => ({
  useDeliveryDraftGuard: () => ({
    requestAction: (action: () => void) => action(),
  }),
}));
jest.mock('@/delivery/assistants/useAssistantAccess', () => ({
  useAssistantAccess: () => ({
    source: 'identity',
    permission: { manager: true },
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: {
      id: 'people',
      fields: ['company', 'name', 'emails', 'jobTitle'].map((name) => ({
        id: name,
        name,
      })),
    },
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canReadObjectRecords: mockAllowed,
    restrictedFields: { emails: { canRead: mockEmailAllowed } },
  }),
}));
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({}),
}));
jest.mock('@/object-record/hooks/useFindManyRecordsQuery', () => ({
  useFindManyRecordsQuery: () => ({ findManyRecordsQuery: {} }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockQuery(...args),
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
const contactData = (companyId = COMPANY) => ({
  people: {
    edges: [
      {
        node: {
          id: 'person-id',
          companyId,
          name: { firstName: 'Ada', lastName: 'Lovelace' },
          emails: { primaryEmail: 'ada@example.com' },
          jobTitle: 'Director',
        },
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
});
const setup = () =>
  render(
    <I18nProvider i18n={i18n}>
      <ClientContacts companyId={COMPANY} />
    </I18nProvider>,
  );
beforeEach(() => {
  jest.clearAllMocks();
  mockAllowed = true;
  mockEmailAllowed = true;
  mockMobile = false;
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockQuery.mockReturnValue({
    data: contactData(),
    loading: false,
    error: undefined,
    refetch: jest.fn().mockResolvedValue({}),
  });
});
it('opens the native editor while retaining the client workspace', async () => {
  setup();
  expect(screen.getByText('ada@example.com')).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Ada Lovelace' }));
  expect(mockOpen).toHaveBeenCalledWith({
    recordId: 'person-id',
    objectNameSingular: 'person',
  });
});
it('keeps the workspace available when opening a contact on mobile', () => {
  mockMobile = true;
  setup();
  expect(screen.getByRole('link', { name: /Ada Lovelace/ })).toHaveAttribute(
    'target',
    '_blank',
  );
});
it('hides stale contacts during loading and errors', () => {
  mockQuery.mockReturnValue({ data: contactData(), loading: true });
  const view = setup();
  expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument();
  mockQuery.mockReturnValue({
    data: contactData(),
    loading: false,
    error: new Error('Denied'),
  });
  view.rerender(
    <I18nProvider i18n={i18n}>
      <ClientContacts companyId={COMPANY} />
    </I18nProvider>,
  );
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument();
});
it('rejects a response containing another company contact', () => {
  mockQuery.mockReturnValue({
    data: contactData(OTHER_COMPANY),
    loading: false,
  });
  setup();
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument();
});
it('hides records after native read permission is removed', () => {
  mockAllowed = false;
  setup();
  expect(screen.getByRole('status')).toHaveTextContent('does not allow');
  expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument();
});
it('does not display a restricted email even if a stale response includes it', () => {
  mockEmailAllowed = false;
  setup();
  expect(screen.getByRole('button', { name: 'Ada Lovelace' })).toBeVisible();
  expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument();
});
