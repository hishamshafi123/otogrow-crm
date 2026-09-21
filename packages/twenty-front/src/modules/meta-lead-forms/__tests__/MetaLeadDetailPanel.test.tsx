import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { MetaLeadDetailPanel } from '@/meta-lead-forms/MetaLeadDetailPanel';

const mockOpenDialer = jest.fn();
const mockUpdate = jest.fn().mockResolvedValue({});
const mockRefetch = jest.fn();
jest.mock('@/calling/hooks/useOpenDialer', () => ({
  useOpenDialer: () => ({ openDialer: mockOpenDialer }),
}));
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => ({
    record: { id: 'person', leadStatus: 'NEW' },
    refetch: mockRefetch,
  }),
}));
jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdate }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: {
      fields: [
        {
          name: 'leadStatus',
          options: [
            { value: 'NEW', label: 'New' },
            { value: 'WARM', label: 'Warm' },
          ],
        },
      ],
    },
  }),
}));
jest.mock('@/meeting-booking/components/MeetingBookingPanel', () => ({
  MeetingBookingPanel: () => <div>Meeting planner</div>,
}));

const setup = () =>
  render(
    <Provider store={createStore()}>
      <MemoryRouter>
        <I18nProvider i18n={i18n}>
          <ThemeProvider colorScheme="light">
            <MetaLeadDetailPanel
              lead={{
                id: 'lead',
                leadId: 'source',
                personId: 'person',
                name: 'Jane',
                email: 'jane@example.com',
                phone: '+971500000000',
                answers: [],
                createdAt: '2030-01-01T00:00:00Z',
                isUnread: true,
              }}
              onClose={jest.fn()}
            />
          </ThemeProvider>
        </I18nProvider>
      </MemoryRouter>
    </Provider>,
  );

describe('Meta lead actions', () => {
  it('opens the CRM dialer with the number and linked person', async () => {
    setup();
    await userEvent.click(
      screen.getByRole('button', { name: /Call \+971500000000/ }),
    );
    expect(mockOpenDialer).toHaveBeenCalledWith({
      phoneNumber: '+971500000000',
      personId: 'person',
    });
    expect(
      screen.getByRole('link', { name: 'View in People' }),
    ).toHaveAttribute('href', '/objects/people/person');
  });
  it('updates status on the existing People record', async () => {
    setup();
    await userEvent.click(screen.getByText('New'));
    await userEvent.click(await screen.findByText('Warm'));
    expect(mockUpdate).toHaveBeenCalledWith({
      objectNameSingular: 'person',
      idToUpdate: 'person',
      updateOneRecordInput: { leadStatus: 'WARM' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Lead status updated',
    );
  });
  it('opens booking without leaving the form', async () => {
    setup();
    await userEvent.click(
      screen.getByRole('button', { name: /Book a meeting/ }),
    );
    expect(screen.getByText('Meeting planner')).toBeInTheDocument();
  });
});
